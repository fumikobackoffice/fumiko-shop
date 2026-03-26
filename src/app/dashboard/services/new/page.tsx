'use client';

import { ServiceForm } from '@/components/dashboard/service-form';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useEffect, useMemo } from 'react';

export default function NewServicePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Granular Permission Check
  const canManageInventory = useMemo(() => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    const perms = user.permissions || [];
    return perms.includes('inventory:manage') || perms.includes('manage_inventory');
  }, [user]);

  useEffect(() => {
    if (!loading && user && !canManageInventory) {
      router.replace('/dashboard/services');
    }
  }, [user, loading, router, canManageInventory]);

  if (loading || !user || !canManageInventory) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <Button variant="ghost" className="-ml-4 text-muted-foreground" onClick={() => router.back()}>
        <ChevronLeft className="mr-2 h-4 w-4" /> ย้อนกลับ
      </Button>
      <div>
        <h1 className="text-3xl font-headline font-bold">เพิ่มบริการใหม่</h1>
        <p className="text-muted-foreground">สร้างรายการบริการใหม่สำหรับสาขา</p>
      </div>
      <ServiceForm />
    </div>
  );
}
