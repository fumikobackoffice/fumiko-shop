
'use client';

import { Button, buttonVariants } from '@/components/ui/button';
import { Loader2, PlusCircle, Trash2, Search, Archive, RotateCw, UserX, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { UsersTable } from '@/components/dashboard/users-table';
import { useAuth } from '@/hooks/use-auth';
import { useFirestore } from '@/firebase';
import { doc, writeBatch, where } from 'firebase/firestore';
import { UserProfile } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo, useTransition, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { CustomDialog } from '@/components/dashboard/custom-dialog';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import { getUsers } from '@/app/actions';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useSmartFetch } from '@/hooks/use-smart-fetch';
import { SmartRefreshButton } from '@/components/dashboard/smart-refresh-button';

export type ActionType = 'archive' | 'restore' | 'delete';

export default function UsersPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('seller');
  
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [userToAction, setUserToAction] = useState<UserProfile | null>(null);
  const [actionType, setActionType] = useState<ActionType | null>(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20;

  // Granular Permission Checks
  const canViewCustomers = useMemo(() => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    const perms = user.permissions || [];
    return perms.includes('customers:view') || perms.includes('customers:manage') || perms.includes('manage_customers');
  }, [user]);

  const canManageCustomers = useMemo(() => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    const perms = user.permissions || [];
    return perms.includes('customers:manage') || perms.includes('manage_customers');
  }, [user]);

  // Memoize filters for useSmartFetch to prevent infinite loop
  const watchFilters = useMemo(() => [where('role', '==', 'seller')], []);

  // Use Centralized Hook
  const { 
    data: usersData, 
    isLoading, 
    isRefreshing, 
    isAuto, 
    badgeCount,
    setAuto, 
    refresh 
  } = useSmartFetch<UserProfile[]>({
    key: 'users-data',
    fetcher: getUsers,
    localStorageKey: 'auto-refresh-users',
    watchPath: 'users',
    watchFilters: watchFilters
  });

  const users = usersData || [];

  // Protect access
  useEffect(() => {
    if (!loading && user && !canViewCustomers) {
      router.replace('/dashboard');
    }
  }, [user, loading, router, canViewCustomers]);
  
  const { sellers, archived } = useMemo(() => {
    if (!users) return { sellers: [], archived: [] };

    const lowerSearch = searchTerm.toLowerCase().trim();
    const filteredUsers = lowerSearch
      ? users.filter(u =>
          u.name.toLowerCase().includes(lowerSearch) ||
          u.email.toLowerCase().includes(lowerSearch) ||
          (u.phone && u.phone.toLowerCase().includes(lowerSearch))
        )
      : users;
    
    const activeSellers = filteredUsers.filter(u => u.status !== 'archived' && u.role === 'seller');
    const archivedSellers = filteredUsers.filter(u => u.status === 'archived' && u.role === 'seller');

    return {
      sellers: activeSellers,
      archived: archivedSellers,
    };
  }, [users, searchTerm]);
  
  const tabContent: Record<string, UserProfile[]> = {
    seller: sellers,
    archived: archived,
  };

  // Reset page when search or tab changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeTab]);

  const currentList = tabContent[activeTab] || [];
  const totalPages = Math.ceil(currentList.length / ITEMS_PER_PAGE);

  const openDialog = (user: UserProfile, action: ActionType) => {
    if (!canManageCustomers) return;
    setUserToAction(user);
    setActionType(action);
    setIsDialogOpen(true);
  };
  
  const openBulkActionDialog = (action: ActionType) => {
    if (!canManageCustomers) return;
    setUserToAction(null);
    setActionType(action);
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setUserToAction(null);
    setActionType(null);
  };
  
  const handleConfirmAction = () => {
    if (!actionType || !firestore || !user || !canManageCustomers) return;
    
    const isBulk = userToAction === null;
    const idsToProcess = isBulk ? selectedIds : [userToAction!.id];

    if (idsToProcess.length === 0) {
        closeDialog();
        return;
    }
    
    const isSuperAdmin = user.role === 'super_admin';

    if (actionType === 'delete' && !isSuperAdmin) {
      toast({ variant: "destructive", title: "ไม่มีสิทธิ์", description: "เฉพาะผู้ดูแลระบบระดับสูงสุดเท่านั้นที่สามารถลบผู้ใช้ได้" });
      closeDialog();
      return;
    }
    
    startTransition(async () => {
        try {
            const batch = writeBatch(firestore);
            if (actionType === 'delete') {
                for (const userId of idsToProcess) {
                    batch.delete(doc(firestore, 'users', userId));
                }
            } else {
                const newStatus = actionType === 'archive' ? 'archived' : 'active';
                for (const userId of idsToProcess) {
                    batch.update(doc(firestore, 'users', userId), { status: newStatus });
                }
            }
            await batch.commit();

            const successMessage = isBulk 
                ? `ดำเนินการกับ ${idsToProcess.length} รายการสำเร็จ`
                : `ผู้ใช้ "${userToAction!.name}" ได้รับการอัปเดตแล้ว`;

            toast({ title: 'สำเร็จ', description: successMessage });
            refresh(true);

        } catch (error: any) {
            console.error("Error performing action on user(s):", error);
            toast({ variant: "destructive", title: "เกิดข้อผิดพลาด", description: error.message || "การดำเนินการล้มเหลว" });
        } finally {
            closeDialog();
            setSelectedIds([]);
        }
    });
  };
  
  const dialogContentMap: { [key in ActionType]?: { title: string; description: (name?: string, count?: number) => string; actionText: string; variant: string; } } = {
    archive: {
      title: 'ยืนยันการปิดใช้งาน',
      description: (name, count) => name ? `คุณแน่ใจหรือไม่ว่าต้องการปิดใช้งานผู้ใช้ "${name}"?` : `คุณแน่ใจหรือไม่ว่าต้องการปิดใช้งาน ${count} รายการที่เลือก?`,
      actionText: 'ยืนยันการปิดใช้งาน',
      variant: 'destructive',
    },
    restore: {
      title: 'ยืนยันการกู้คืน',
      description: (name, count) => name ? `คุณแน่ใจหรือไม่ว่าต้องการกู้คืนผู้ใช้ "${name}"?` : `คุณแน่ใจหรือไม่ว่าต้องการกู้คืน ${count} รายการที่เลือก?`,
      actionText: 'ยืนยันการกู้คืน',
      variant: 'default',
    },
    delete: {
      title: 'ยืนยันการลบถาวร',
      description: (name, count) => name ? `คุณแน่ใจหรือไม่ว่าต้องการลบผู้ใช้ "${name}" อย่างถาวร?` : `คุณแน่ใจหรือไม่ว่าต้องการลบ ${count} รายการที่เลือกอย่างถาวร?`,
      actionText: 'ยืนยันการลบถาวร',
      variant: 'destructive',
    },
  };

  const currentDialogContent = actionType ? dialogContentMap[actionType] : null;

  const renderPagination = () => {
    if (totalPages <= 1) return null;

    const pageNumbers = [];
    const maxVisible = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);

    if (endPage - startPage + 1 < maxVisible) {
      startPage = Math.max(1, endPage - maxVisible + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pageNumbers.push(
        <Button
          key={i}
          variant={currentPage === i ? "default" : "outline"}
          size="sm"
          className="w-9 h-9 font-medium"
          onClick={() => {
            setCurrentPage(i);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        >
          {i}
        </Button>
      );
    }

    return (
      <div className="flex items-center justify-center gap-2 mt-8 py-4">
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9"
          onClick={() => {
            setCurrentPage(prev => Math.max(1, prev - 1));
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          disabled={currentPage === 1}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        
        <div className="flex items-center gap-1">
          {startPage > 1 && (
            <>
              <Button variant="outline" size="sm" className="w-9 h-9" onClick={() => setCurrentPage(1)}>1</Button>
              {startPage > 2 && <span className="px-2 text-muted-foreground">...</span>}
            </>
          )}
          
          {pageNumbers}
          
          {endPage < totalPages && (
            <>
              {endPage < totalPages - 1 && <span className="px-2 text-muted-foreground">...</span>}
              <Button variant="outline" size="sm" className="w-9 h-9" onClick={() => setCurrentPage(totalPages)}>{totalPages}</Button>
            </>
          )}
        </div>

        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9"
          onClick={() => {
            setCurrentPage(prev => Math.min(totalPages, prev + 1));
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          disabled={currentPage === totalPages}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    );
  };

  if (loading || !user || !canViewCustomers) {
    return <div className="h-screen w-screen flex items-center justify-center bg-background"><div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div></div>;
  }

  const isSuperAdmin = user?.role === 'super_admin';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-headline font-bold">จัดการเจ้าของสาขา</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 bg-muted/30 rounded-md h-10 border border-muted-foreground/10">
            <Switch 
              id="auto-refresh" 
              checked={isAuto} 
              onCheckedChange={setAuto} 
            />
            <Label htmlFor="auto-refresh" className="text-[10px] font-bold cursor-pointer whitespace-nowrap">รีเฟรชอัตโนมัติ</Label>
          </div>
          <SmartRefreshButton 
            refresh={refresh}
            isRefreshing={isRefreshing}
            badgeCount={badgeCount}
          />
          {canManageCustomers && (
            <Button asChild className="h-10">
              <Link href="/dashboard/users/new">
                <PlusCircle className="mr-2 h-4 w-4" />
                เพิ่มเจ้าของสาขาใหม่
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
        <div className="flex items-center gap-2 w-full sm:w-auto flex-grow md:flex-grow-0">
            <div className="relative flex-grow">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                placeholder="ค้นหาชื่อ, อีเมล หรือเบอร์โทร..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 w-full sm:w-64 md:w-80"
                />
            </div>
        </div>
        <div className="flex items-center gap-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="seller">เจ้าของสาขาที่ใช้งาน ({sellers.length})</TabsTrigger>
              <TabsTrigger value="archived" className="flex items-center gap-2">
                  <Trash2 className="h-4 w-4" />
                  รายชื่อที่ถูกจัดเก็บ ({archived.length})
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {isLoading && !isRefreshing ? (
         <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <Tabs value={activeTab}>
          {Object.entries(tabContent).map(([tab, userList]) => {
            const start = (currentPage - 1) * ITEMS_PER_PAGE;
            const paginatedList = userList.slice(start, start + ITEMS_PER_PAGE);
            
            return (
              <TabsContent key={tab} value={tab}>
                  <UsersTable 
                    users={paginatedList} 
                    currentUser={user}
                    activeTab={activeTab}
                    openDialog={openDialog}
                    selectedIds={selectedIds}
                    onSelectedIdsChange={setSelectedIds}
                    canManage={canManageCustomers}
                  />
              </TabsContent>
            );
          })}
        </Tabs>
      )}

      {!isLoading && renderPagination()}
      
      {selectedIds.length > 0 && activeTab === 'archived' && canManageCustomers && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 animate-in fade-in-0 slide-in-from-bottom-5">
              <div className="bg-card text-card-foreground rounded-lg border shadow-lg flex items-center h-12 px-4 gap-4">
                <span className="text-sm font-medium">{selectedIds.length} รายการที่เลือก</span>
                <Separator orientation="vertical" className="h-6" />
                <Button variant="outline" size="sm" onClick={() => openBulkActionDialog('restore')}>
                  <RotateCw className="mr-2 h-4 w-4" />
                  กู้คืน
                </Button>
                {isSuperAdmin && (
                    <Button variant="destructive" size="sm" onClick={() => openBulkActionDialog('delete')}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      ลบถาวร
                  </Button>
                )}
              </div>
          </div>
      )}

      {selectedIds.length > 0 && activeTab === 'seller' && canManageCustomers && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 animate-in fade-in-0 slide-in-from-bottom-5">
              <div className="bg-card text-card-foreground rounded-lg border shadow-lg flex items-center h-12 px-4 gap-4">
                <span className="text-sm font-medium">{selectedIds.length} รายการที่เลือก</span>
                <Separator orientation="vertical" className="h-6" />
                <Button variant="destructive" size="sm" onClick={() => openBulkActionDialog('archive')}>
                  <UserX className="mr-2 h-4 w-4" />
                  ปิดใช้งาน
                </Button>
              </div>
          </div>
      )}


      {currentDialogContent && (
        <CustomDialog isOpen={isDialogOpen} onClose={closeDialog} title={currentDialogContent.title}>
            <p className="text-sm text-muted-foreground">{currentDialogContent.description(userToAction?.name, selectedIds.length)}</p>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-6">
                <Button variant="outline" onClick={closeDialog}>ยกเลิก</Button>
                <Button
                    onClick={handleConfirmAction}
                    disabled={isPending}
                    className={cn(buttonVariants({ variant: currentDialogContent.variant as any | 'default' }))}
                >
                    {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {currentDialogContent.actionText}
                </Button>
            </div>
        </CustomDialog>
      )}
    </div>
  );
}
