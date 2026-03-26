'use client';

import { useAuth } from '@/hooks/use-auth';
import { FeesAdminView } from '@/components/dashboard/fees-admin-view';
import { FeesSellerView } from '@/components/dashboard/fees-seller-view';
import { Skeleton } from '@/components/ui/skeleton';
import { useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function FeesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Granular Permission Check for employees
  const canViewFees = useMemo(() => {
    if (!user) return false;
    if (user.role === 'seller') return true; // Sellers can always see their own fees
    if (user.role === 'super_admin') return true;
    const perms = user.permissions || [];
    return perms.includes('branches:view') || perms.includes('branches:manage') || perms.includes('manage_branches');
  }, [user]);

  useEffect(() => {
    if (!loading && user && !canViewFees) {
      router.replace('/dashboard');
    }
  }, [user, loading, router, canViewFees]);

  if (loading || !user || !canViewFees) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const isAdmin = ['super_admin', 'admin'].includes(user.role);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold">
            {isAdmin ? 'จัดการบิลค่าธรรมเนียม' : 'รายการค้างชำระ'}
          </h1>
          <p className="text-muted-foreground">
            {isAdmin 
              ? 'ตรวจสอบและจัดการใบเรียกเก็บเงินค่าธรรมเนียมของทุกสาขาในระบบ' 
              : 'ตรวจสอบและชำระค่าธรรมเนียมแฟรนไชส์ประจำสาขาของคุณ'}
          </p>
        </div>
      </div>

      {isAdmin ? <FeesAdminView /> : <FeesSellerView user={user} />}
    </div>
  );
}
