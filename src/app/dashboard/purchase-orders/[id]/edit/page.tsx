'use client';

import { PurchaseOrderForm } from '@/components/dashboard/purchase-order-form';
import { useAuth } from '@/hooks/use-auth';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useMemo, useRef } from 'react';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { PurchaseOrder } from '@/lib/types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';

export default function EditPurchaseOrderPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const poId = params.id as string;
  const firestore = useFirestore();
  const { toast } = useToast();
  
  // Track if we have already validated the initial status upon first load
  const hasCheckedInitialStatus = useRef(false);

  // Granular Permission Check
  const canManageInventory = useMemo(() => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    const perms = user.permissions || [];
    return perms.includes('inventory:manage') || perms.includes('manage_inventory');
  }, [user]);

  const poRef = useMemoFirebase(() => {
    if (!firestore || !poId) return null;
    return doc(firestore, 'purchaseOrders', poId);
  }, [firestore, poId]);

  const { data: purchaseOrder, isLoading: isPoLoading } = useDoc<PurchaseOrder>(poRef);

  useEffect(() => {
    if (!loading && user && !canManageInventory) {
      router.replace('/dashboard');
    }
    
    // Redirect logic: Standard Principle - Allow editing ONLY if PO is in DRAFT state
    if (!isPoLoading && purchaseOrder) {
      const isActuallyEditable = purchaseOrder.status === 'DRAFT';
      
      if (!isActuallyEditable) {
        // CRITICAL FIX: Only show the "Cannot edit" error if the PO was NOT a draft on the VERY FIRST load.
        // If it changes from DRAFT to ISSUED while the page is open, it's a successful update, 
        // so we navigate away silently without showing the error toast.
        if (!hasCheckedInitialStatus.current) {
          toast({
            variant: 'destructive',
            title: 'ไม่สามารถแก้ไขได้',
            description: 'ใบสั่งซื้อที่ดำเนินการแล้วไม่สามารถแก้ไขได้ กรุณาใช้ฉบับร่างเท่านั้น',
          });
          hasCheckedInitialStatus.current = true;
        }
        
        // Regardless of toast, redirect if it's not a draft
        router.replace(`/dashboard/purchase-orders/${poId}`);
      } else {
        // Document is a draft, mark that we've checked it and it's valid for editing
        hasCheckedInitialStatus.current = true;
      }
    }
  }, [user, loading, router, canManageInventory, isPoLoading, purchaseOrder, poId, toast]);

  if (loading || !user || !canManageInventory || isPoLoading || !purchaseOrder) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Final check before rendering form
  const isActuallyEditable = purchaseOrder.status === 'DRAFT';
  
  if (!isActuallyEditable) {
    return null; // Redirection handled in useEffect
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
      <h1 className="text-3xl font-headline font-bold">
        แก้ไขใบสั่งซื้อ #{purchaseOrder?.poNumber || '...'}
      </h1>
      <PurchaseOrderForm initialData={purchaseOrder} />
    </div>
  );
}
