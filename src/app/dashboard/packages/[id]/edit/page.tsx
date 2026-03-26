'use client';

import { PackageForm } from '@/components/dashboard/package-form';
import { useAuth } from '@/hooks/use-auth';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { ProductPackage } from '@/lib/types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';

export default function EditPackagePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const packageId = params.id as string;
  const firestore = useFirestore();

  const packageRef = useMemoFirebase(() => {
    if (!firestore || !packageId) return null;
    return doc(firestore, 'productPackages', packageId);
  }, [firestore, packageId]);

  const { data: productPackage, isLoading: isPackageLoading } = useDoc<ProductPackage>(packageRef);

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

  if (authLoading || isPackageLoading || !user || !canViewInventory) {
    return <div className="h-screen w-screen flex items-center justify-center bg-background"><div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div></div>;
  }
  
  const renderContent = () => {
    if (!productPackage) {
      return <p className="text-center py-20">ไม่พบแพ็กเกจ</p>;
    }

    return <PackageForm initialData={productPackage} readOnly={isReadOnly} />;
  };

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
      <h1 className="text-3xl font-headline font-bold">
          {isReadOnly ? 'รายละเอียดแพ็กเกจ' : 'แก้ไขแพ็กเกจ'}
      </h1>
      {renderContent()}
    </div>
  );
}
