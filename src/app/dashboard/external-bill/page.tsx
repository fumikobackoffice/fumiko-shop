'use client';

import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { ExternalBillForm } from '@/components/dashboard/external-bill-form';
import { FilePlus, ShieldAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function ExternalBillPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Granular Permission Check
  const canManageOrders = useMemo(() => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    const perms = user.permissions || [];
    return perms.includes('orders:manage') || perms.includes('manage_orders');
  }, [user]);

  useEffect(() => {
    if (!loading && user && !canManageOrders) {
      router.replace('/dashboard');
    }
  }, [user, loading, router, canManageOrders]);

  if (loading || !user) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!canManageOrders) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>สิทธิ์ไม่เพียงพอ</AlertTitle>
          <AlertDescription>คุณไม่ได้รับอนุญาตให้เข้าใช้งานส่วนการเปิดบิลอิสระ กรุณาติดต่อผู้ดูแลระบบครับ</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-20">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-headline font-bold flex items-center gap-3">
          <FilePlus className="h-8 w-8 text-emerald-600" />
          เปิดบิลขายตรง (ภายนอก)
        </h1>
        <p className="text-muted-foreground">
          สร้างรายการขายสำหรับบุคคลหรือบริษัทภายนอกที่ไม่ได้อยู่ในระบบสมาชิก โดยระบบจะตัดสต็อกสินค้าให้โดยอัตโนมัติ
        </p>
      </div>
      
      <ExternalBillForm adminUser={user} />
    </div>
  );
}
