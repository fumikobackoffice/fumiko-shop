'use client';

import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { UserForm } from '@/components/dashboard/user-form';
import { UserAddressManager } from '@/components/dashboard/user-address-manager';
import { SellerBranchList } from '@/components/dashboard/seller-branch-list';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';

export default function ProfilePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="mb-2">
        <Button 
          variant="ghost" 
          className="-ml-4 text-muted-foreground hover:text-foreground"
          onClick={() => router.back()}
        >
          <ChevronLeft className="mr-2 h-4 w-4" />
          ย้อนกลับ
        </Button>
      </div>
      
      <h1 className="text-3xl font-headline font-bold">โปรไฟล์ของฉัน</h1>
      
      <UserForm initialData={user} />
      
      {user.role === 'seller' && (
        <>
          <SellerBranchList />
          <UserAddressManager user={user} />
        </>
      )}
    </div>
  );
}
