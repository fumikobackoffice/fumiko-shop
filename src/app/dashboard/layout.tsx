
'use client';

import {
  SidebarProvider,
  SidebarTrigger,
  SidebarInset,
} from '@/components/ui/sidebar';
import { UserNav } from '@/components/shared/user-nav';
import { Store } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import { Branch } from '@/lib/types';
import { ThemeToggle } from '@/components/shared/theme-toggle';
import { AppSidebar } from '@/components/shared/app-sidebar';

function DashboardLayoutContent({ children }: { children: React.ReactNode }) {
  const { user, impersonatedUser } = useAuth();
  const firestore = useFirestore();

  const branchesQuery = useMemoFirebase(() => {
    if (!firestore || !user || user.role !== 'seller') return null;
    return query(collection(firestore, 'branches'), where('ownerId', '==', user.id));
  }, [firestore, user]);

  const { data: userBranches } = useCollection<Branch>(branchesQuery);
  const branchInfo = userBranches && userBranches.length > 0 
    ? userBranches.length === 1 
      ? userBranches[0].name 
      : `${userBranches.length} สาขา`
    : null;

  const isSellerView = user?.role === 'seller' || impersonatedUser;

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-40 w-full border-b bg-background/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {!isSellerView && <SidebarTrigger className="md:hidden"/>}
                  <div className={cn(!isSellerView && "hidden md:block")}>
                    <h2 className="text-sm font-semibold text-muted-foreground">
                      ยินดีต้อนรับ, {user?.name}
                    </h2>
                    {branchInfo && (
                      <p className="text-[10px] text-primary font-medium flex items-center gap-1">
                        <Store className="h-3 w-3" />
                        สาขา: {branchInfo}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <ThemeToggle />
                  <UserNav />
                </div>
            </div>
        </header>
        <main className="p-2 sm:p-6 lg:p-8 bg-muted/10 min-h-[calc(100vh-65px)]">
            {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

import { cn } from '@/lib/utils';

export default function DashboardPage({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!user || !['seller', 'admin', 'super_admin'].includes(user.role))) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading || !user || !['seller', 'admin', 'super_admin'].includes(user.role)) {
     return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <p className="text-sm text-muted-foreground animate-pulse">กำลังโหลดข้อมูลระบบ...</p>
        </div>
      </div>
     );
  }
  
  return <DashboardLayoutContent>{children}</DashboardLayoutContent>;
}
