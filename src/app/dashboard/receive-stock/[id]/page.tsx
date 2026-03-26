'use client';

import { useAuth } from '@/hooks/use-auth';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { PurchaseOrder } from '@/lib/types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ReceiveStockForm } from '@/components/dashboard/receive-stock-form';
import { Button } from '@/components/ui/button';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

function ReceiveStockPageContents({ poId }: { poId: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const firestore = useFirestore();

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
  
  if (!canManageInventory) {
    return (
      <div className="space-y-6">
        <Button variant="outline" onClick={() => router.back()} className="mb-2">
          <ArrowLeft className="mr-2 h-4 w-4" />
          ย้อนกลับ
        </Button>
        <Alert variant="destructive" className="max-w-2xl mx-auto mt-4">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>สิทธิ์ไม่เพียงพอ</AlertTitle>
          <AlertDescription>คุณไม่ได้รับสิทธิ์ให้ดำเนินการรับสินค้าเข้าคลัง กรุณาติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์จัดการครับ</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isPoLoading) {
    return (
        <div className="space-y-8">
            <Skeleton className="h-9 w-24 mb-4" />
            <Skeleton className="h-10 w-1/3" />
            <Card>
                <CardHeader>
                    <Skeleton className="h-8 w-1/3" />
                </CardHeader>
                <CardContent className="space-y-6">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-40 w-full" />
                </CardContent>
            </Card>
        </div>
      );
  }

  if (!purchaseOrder) {
    return (
      <div className="space-y-6">
        <Button variant="outline" onClick={() => router.back()} className="mb-2">
          <ArrowLeft className="mr-2 h-4 w-4" />
          ย้อนกลับ
        </Button>
        <p className="text-center py-10">ไม่พบใบสั่งซื้อ</p>
      </div>
    );
  }
  
  if (purchaseOrder.status === 'COMPLETED' || purchaseOrder.status === 'CANCELLED' || purchaseOrder.status === 'DRAFT') {
      return (
          <div className="space-y-6">
              <Button variant="outline" onClick={() => router.back()} className="mb-2">
                <ArrowLeft className="mr-2 h-4 w-4" />
                ย้อนกลับ
              </Button>
              <h1 className="text-3xl font-headline font-bold mb-6">รับสินค้าสำหรับ PO #{purchaseOrder?.poNumber || '...'}</h1>
              <Card>
                  <CardHeader>
                      <h2 className="text-xl font-semibold">ไม่สามารถรับของได้</h2>
                  </CardHeader>
                  <CardContent>
                      <p>ใบสั่งซื้อนี้อยู่ในสถานะ "{purchaseOrder.status}" ซึ่งไม่สามารถรับสินค้าเข้าคลังได้</p>
                      <Button onClick={() => router.back()} className="mt-4">กลับไป</Button>
                  </CardContent>
              </Card>
          </div>
      )
  }

  return (
    <div className="space-y-6">
        <Button variant="outline" onClick={() => router.back()} className="mb-2">
          <ArrowLeft className="mr-2 h-4 w-4" />
          ย้อนกลับ
        </Button>
        <h1 className="text-3xl font-headline font-bold mb-6">รับสินค้าสำหรับ PO #{purchaseOrder.poNumber}</h1>
        <ReceiveStockForm purchaseOrder={purchaseOrder} />
    </div>
  );
}

export default function ReceiveStockPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const poId = params.id as string;

  const canViewInventory = useMemo(() => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    const perms = user.permissions || [];
    return perms.includes('inventory:view') || perms.includes('inventory:manage') || perms.includes('manage_inventory');
  }, [user]);

  useEffect(() => {
    if (!loading && user && !canViewInventory) {
      router.replace('/dashboard');
    }
  }, [user, loading, router, canViewInventory]);

  if (loading || !user || !canViewInventory) {
    return <div className="h-screen w-screen flex items-center justify-center bg-background"><div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div></div>;
  }

  return <ReceiveStockPageContents poId={poId} />;
}
