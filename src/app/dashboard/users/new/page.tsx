'use client';

import { UserForm } from '@/components/dashboard/user-form';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';

export default function NewUserPage() {
    const { user, loading } = useAuth();
    const router = useRouter();

    // Granular Permission Check
    const canManageCustomers = useMemo(() => {
      if (!user) return false;
      if (user.role === 'super_admin') return true;
      const perms = user.permissions || [];
      return perms.includes('customers:manage') || perms.includes('manage_customers');
    }, [user]);

    useEffect(() => {
        if (!loading && user && !canManageCustomers) {
            router.replace('/dashboard/users');
        }
    }, [user, loading, router, canManageCustomers]);

    if (loading || !user || !canManageCustomers) {
        return <div className="h-screen w-screen flex items-center justify-center bg-background"><div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div></div>;
    }

    return (
        <div>
        <h1 className="text-3xl font-headline font-bold mb-6">เพิ่มผู้ใช้ใหม่</h1>
        <UserForm />
        </div>
    );
}
