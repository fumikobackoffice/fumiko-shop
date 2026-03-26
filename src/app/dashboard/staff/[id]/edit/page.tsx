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

export default function EditStaffPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const userId = params.id as string;
  const firestore = useFirestore();

  // Granular Permission Check
  const canViewSystem = useMemo(() => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    const perms = user.permissions || [];
    return perms.includes('system:view') || perms.includes('system:manage') || perms.includes('manage_system');
  }, [user]);

  const userToEditRef = useMemoFirebase(() => {
    if (!firestore || !userId) return null;
    return doc(firestore, 'users', userId);
  }, [firestore, userId]);
  
  const { data: userToEdit, isLoading: isUserLoading } = useDoc<UserProfile>(userToEditRef);

  useEffect(() => {
    if (!loading && user && !canViewSystem) {
      router.replace('/dashboard');
    }
  }, [user, loading, router, canViewSystem]);

  if (loading || !user || !canViewSystem) {
    return <div className="h-screen w-screen flex items-center justify-center bg-background"><div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div></div>;
  }
  
  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-headline font-bold mb-6">แก้ไขข้อมูลพนักงาน</h1>
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
        <UserForm initialData={userToEdit} />
      ) : (
        <p>ไม่พบข้อมูลพนักงาน</p>
      )}
    </div>
  );
}
