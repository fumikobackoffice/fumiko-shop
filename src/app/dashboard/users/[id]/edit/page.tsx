
'use client';

import { UserForm } from '@/components/dashboard/user-form';
import { useAuth } from '@/hooks/use-auth';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { UserProfile } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { UserPointsManager } from '@/components/dashboard/user-points-manager';
import { UserAddressManager } from '@/components/dashboard/user-address-manager';
import { GuestMigrationTool } from '@/components/dashboard/guest-migration-tool';

export default function EditUserPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const userId = params.id as string;
  const firestore = useFirestore();

  const userToEditRef = useMemoFirebase(() => {
    if (!firestore || !userId) return null;
    return doc(firestore, 'users', userId);
  }, [firestore, userId]);
  
  const { data: userToEdit, isLoading: isUserLoading } = useDoc<UserProfile>(userToEditRef);

  // Granular Permission Check for Customers module
  const canViewCustomers = useMemo(() => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    const perms = user.permissions || [];
    return perms.includes('customers:view') || perms.includes('customers:manage') || perms.includes('manage_customers');
  }, [user]);

  useEffect(() => {
    if (!loading && user && !canViewCustomers) {
      router.replace('/dashboard');
    }
  }, [user, loading, router, canViewCustomers]);

  if (loading || !user || !canViewCustomers) {
    return <div className="h-screen w-screen flex items-center justify-center bg-background"><div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div></div>;
  }
  
  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-20">
      <h1 className="text-3xl font-headline font-bold mb-6">จัดการบัญชีเจ้าของสาขา</h1>
      {isUserLoading ? (
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
      ) : userToEdit ? (
        <div className="space-y-8">
          {/* Main Form Section - Using full 3-column internal grid of UserForm */}
          <UserForm 
            initialData={userToEdit} 
            sideContent={userToEdit.role === 'seller' && <GuestMigrationTool user={userToEdit} />}
          />
          
          {/* Bottom Sections - Aligning with the left 2/3 columns of the form above */}
          {userToEdit.role === 'seller' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-8">
                <UserAddressManager user={userToEdit} />
                <UserPointsManager user={userToEdit} />
              </div>
            </div>
          )}
        </div>
      ) : (
        <p>ไม่พบผู้ใช้งาน</p>
      )}
    </div>
  );
}
