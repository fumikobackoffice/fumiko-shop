'use client';

import { BranchForm } from '@/components/dashboard/branch-form';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { Branch } from '@/lib/types';
import { useParams, useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useEffect, useMemo } from 'react';

export default function EditBranchPage() {
  const { user, loading: authLoading } = useAuth();
  const params = useParams();
  const router = useRouter();
  const firestore = useFirestore();
  const branchId = params.id as string;

  const branchRef = useMemoFirebase(() => doc(firestore, 'branches', branchId), [firestore, branchId]);
  const { data: branch, isLoading } = useDoc<Branch>(branchRef);

  // Granular Permission Checks
  const canViewBranches = useMemo(() => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    if (user.role === 'seller') {
        // Sellers can only view if they own the branch
        return branch ? branch.ownerId === user.id : true; 
    }
    const perms = user.permissions || [];
    return perms.includes('branches:view') || perms.includes('branches:manage') || perms.includes('manage_branches');
  }, [user, branch]);

  const isReadOnly = useMemo(() => {
    if (!user) return true;
    if (user.role === 'super_admin') return false;
    if (user.role === 'seller') return true;
    
    const perms = user.permissions || [];
    const hasManagePermission = perms.includes('branches:manage') || perms.includes('manage_branches');
    return !hasManagePermission;
  }, [user]);

  // Secure the route with granular permissions
  useEffect(() => {
    if (!authLoading && user && !canViewBranches) {
      router.replace('/dashboard');
    }
  }, [user, authLoading, router, canViewBranches]);

  if (authLoading || isLoading || !user || !canViewBranches) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-12 w-1/3" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!branch) {
    return <div className="text-center py-20">ไม่พบข้อมูลสาขา</div>;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Button variant="ghost" onClick={() => router.back()} className="-ml-4 text-muted-foreground">
        <ChevronLeft className="mr-2 h-4 w-4" /> ย้อนกลับ
      </Button>
      <div>
        <h1 className="text-3xl font-headline font-bold">
            {isReadOnly ? 'รายละเอียดสาขา' : 'แก้ไขข้อมูลสาขา'}: {branch.name}
        </h1>
        <p className="text-muted-foreground">รหัสสาขา: {branch.branchCode}</p>
      </div>
      <BranchForm key={branchId} initialData={branch} readOnly={isReadOnly} />
    </div>
  );
}
