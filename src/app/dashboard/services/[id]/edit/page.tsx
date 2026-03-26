'use client';

import { ServiceForm } from '@/components/dashboard/service-form';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { Service } from '@/lib/types';
import { useParams, useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useEffect, useMemo } from 'react';

export default function EditServicePage() {
  const { user, loading: authLoading } = useAuth();
  const params = useParams();
  const router = useRouter();
  const firestore = useFirestore();
  const serviceId = params.id as string;

  const serviceRef = useMemoFirebase(() => doc(firestore, 'services', serviceId), [firestore, serviceId]);
  const { data: service, isLoading } = useDoc<Service>(serviceRef);

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

  if (authLoading || isLoading || !user || !canViewInventory) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!service) return <div className="text-center py-20">ไม่พบข้อมูลบริการ</div>;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <Button variant="ghost" className="-ml-4 text-muted-foreground" onClick={() => router.back()}>
        <ChevronLeft className="mr-2 h-4 w-4" /> ย้อนกลับ
      </Button>
      <div>
        <h1 className="text-3xl font-headline font-bold">
            {isReadOnly ? 'รายละเอียดบริการ' : 'แก้ไขบริการ'}: {service.name}
        </h1>
      </div>
      <ServiceForm key={serviceId} initialData={service} readOnly={isReadOnly} />
    </div>
  );
}
