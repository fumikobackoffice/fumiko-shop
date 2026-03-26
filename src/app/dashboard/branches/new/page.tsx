'use client';

import { BranchForm } from '@/components/dashboard/branch-form';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useEffect, useMemo } from 'react';

export default function NewBranchPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Granular Permission Check
  const canManageBranches = useMemo(() => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    const perms = user.permissions || [];
    return perms.includes('branches:manage') || perms.includes('manage_branches');
  }, [user]);

  useEffect(() => {
    if (!loading && user && !canManageBranches) {
      router.replace('/dashboard/branches');
    }
  }, [user, loading, router, canManageBranches]);

  if (loading || !user || !canManageBranches) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Button variant="ghost" onClick={() => router.back()} className="-ml-4 text-muted-foreground">
        <ChevronLeft className="mr-2 h-4 w-4" /> ย้อนกลับ
      </Button>
      <div>
        <h1 className="text-3xl font-headline font-bold">เพิ่มสาขาใหม่</h1>
        <p className="text-muted-foreground">กรอกข้อมูลที่ตั้งและรายละเอียดสัญญาสำหรับสาขาใหม่</p>
      </div>
      <BranchForm />
    </div>
  );
}
