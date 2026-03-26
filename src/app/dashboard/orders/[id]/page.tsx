'use client';

import { useAuth } from '@/hooks/use-auth';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import { useDoc, useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { doc, collection } from 'firebase/firestore';
import { Order, OrderItem, UserProfile } from '@/lib/types';
import { AdminOrderDetails } from '@/components/dashboard/admin-order-details';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';

type PageStatus = 'loading' | 'ready' | 'forbidden' | 'not_found';

export default function ViewOrderPage() {
  const { user: authUser, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const orderId = params.id as string;
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const [pageStatus, setPageStatus] = useState<PageStatus>('loading');

  const orderRef = useMemoFirebase(() => 
    firestore && orderId ? doc(firestore, 'orders', orderId) : null, 
    [firestore, orderId]
  );
  const { data: order, isLoading: isOrderLoading, error: orderError } = useDoc<Order>(orderRef);
  
  const orderItemsQuery = useMemoFirebase(() => 
    order ? collection(firestore, 'orders', order.id, 'orderItems') : null, 
    [firestore, order]
  );
  const { data: orderItems, isLoading: areItemsLoading } = useCollection<OrderItem>(orderItemsQuery);
  
  const buyerRef = useMemoFirebase(() => 
    order ? doc(firestore, 'users', order.buyerId) : null, 
    [firestore, order]
  );
  const { data: buyer, isLoading: isBuyerLoading } = useDoc<UserProfile>(buyerRef);

  // Granular Permission Check for Orders View
  const canViewOrders = useMemo(() => {
    if (!authUser) return false;
    if (authUser.role === 'super_admin') return true;
    const perms = authUser.permissions || [];
    return perms.includes('orders:view') || perms.includes('orders:manage') || perms.includes('manage_orders');
  }, [authUser]);

  useEffect(() => {
    if (authLoading || isOrderLoading) {
      setPageStatus('loading');
      return;
    }

    if (!authUser) {
      router.replace('/login');
      return;
    }

    // Secure the page with granular permissions
    if (!canViewOrders) {
      toast({ variant: 'destructive', title: 'ไม่มีสิทธิ์เข้าถึงส่วนงานออเดอร์' });
      router.replace('/dashboard');
      setPageStatus('forbidden');
      return;
    }

    if (orderError) {
      toast({ variant: "destructive", title: "เกิดข้อผิดพลาด", description: "ไม่สามารถโหลดข้อมูลคำสั่งซื้อได้" });
      router.replace('/dashboard/orders');
      setPageStatus('not_found');
      return;
    }

    if (areItemsLoading || isBuyerLoading) {
      setPageStatus('loading');
      return;
    }

    if(order) {
        setPageStatus('ready');
    } else if (!isOrderLoading && !areItemsLoading && !isBuyerLoading) {
        setPageStatus('not_found');
    }
  }, [authLoading, isOrderLoading, areItemsLoading, isBuyerLoading, authUser, order, orderError, router, toast, canViewOrders]);

  if (pageStatus !== 'ready' || !order || !authUser) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-48" />
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <AdminOrderDetails 
        order={order} 
        orderItems={orderItems || []} 
        buyer={buyer}
        adminUser={authUser}
      />
    </div>
  );
}
