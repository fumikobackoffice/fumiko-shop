'use client';

import { ProductForm } from '@/components/dashboard/product-form';
import { useAuth } from '@/hooks/use-auth';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { useDoc, useFirestore, useMemoFirebase, useCollection } from '@/firebase';
import { doc, collection } from 'firebase/firestore';
import { ProductGroup, ProductVariant } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Truck, ChevronLeft } from 'lucide-react';
import Link from 'next/link';

export default function EditProductPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const groupId = params.id as string;
  const firestore = useFirestore();

  const productGroupRef = useMemoFirebase(() => {
    if (!firestore || !groupId) return null;
    return doc(firestore, 'productGroups', groupId);
  }, [firestore, groupId]);

  const variantsRef = useMemoFirebase(() => {
    if (!firestore || !groupId) return null;
    return collection(firestore, 'productGroups', groupId, 'productVariants');
  }, [firestore, groupId]);

  const { data: productGroup, isLoading: isGroupLoading } = useDoc<ProductGroup>(productGroupRef);
  const { data: variants, isLoading: areVariantsLoading } = useCollection<ProductVariant>(variantsRef);

  const memoizedInitialData = useMemo(() => {
    if (productGroup && variants) {
      return { productGroup, variants };
    }
    return undefined;
  }, [productGroup, variants]);

  // Granular Permission Checks
  const canViewInventory = useMemo(() => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    const perms = user.permissions || [];
    return perms.includes('inventory:view') || perms.includes('inventory:manage') || perms.includes('manage_inventory');
  }, [user]);

  const isReadOnly = useMemo(() => {
    if (!user) return true;
    if (user.role === 'super_admin') return false;
    
    const perms = user.permissions || [];
    const hasManagePermission = perms.includes('inventory:manage') || perms.includes('manage_inventory');
    return !hasManagePermission;
  }, [user]);

  // Secure the route with granular permissions
  useEffect(() => {
    if (!authLoading && user && !canViewInventory) {
      router.replace('/dashboard');
    }
  }, [user, authLoading, router, canViewInventory]);

  const isLoading = authLoading || isGroupLoading || areVariantsLoading;

  if (authLoading || !user || !canViewInventory) {
    return <div className="h-screen w-screen flex items-center justify-center bg-background"><div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div></div>;
  }
  
  return (
    <div className="space-y-6">
      <Button 
        variant="ghost" 
        onClick={() => router.back()} 
        className="-ml-4 text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="mr-2 h-4 w-4" />
        ย้อนกลับ
      </Button>

      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-headline font-bold">
            {isReadOnly ? 'รายละเอียดสินค้า' : 'แก้ไขสินค้า'}
        </h1>
        {!isReadOnly && memoizedInitialData && (
          <Button variant="outline" asChild>
            <Link href="/dashboard/purchase-orders">
              <Truck className="mr-2 h-4 w-4" />
              รับสินค้าเข้าคลัง
            </Link>
          </Button>
        )}
      </div>
      {isLoading ? (
        <Card>
          <div className="p-6 space-y-6">
            <Skeleton className="h-10 w-1/2" />
            <div className="space-y-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-1/3" />
            </div>
          </div>
        </Card>
      ) : memoizedInitialData ? (
        <ProductForm key={groupId} initialData={memoizedInitialData} readOnly={isReadOnly} />
      ) : (
        <p>ไม่พบสินค้า</p>
      )}
    </div>
  );
}
