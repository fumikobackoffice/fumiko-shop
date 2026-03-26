
'use client';

import { Button, buttonVariants } from '@/components/ui/button';
import { Loader2, PlusCircle, Trash2, Search, Archive, RotateCw, UserX } from 'lucide-react';
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
import { useSmartFetch, clearGlobalCache } from '@/hooks/use-smart-fetch';
import { SmartRefreshButton } from '@/components/dashboard/smart-refresh-button';

export type ActionType = 'archive' | 'restore' | 'delete';

export default function StaffPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('admin');
  
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [userToAction, setUserToAction] = useState<UserProfile | null>(null);
  const [actionType, setActionType] = useState<ActionType | null>(null);

  // Granular Permission Check
  const canViewSystem = useMemo(() => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    const perms = user.permissions || [];
    return perms.includes('system:view') || perms.includes('system:manage') || perms.includes('manage_system');
  }, [user]);

  const canManageSystem = useMemo(() => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    const perms = user.permissions || [];
    return perms.includes('system:manage') || perms.includes('manage_system');
  }, [user]);

  // Memoize filters for useSmartFetch to prevent infinite loop
  const watchFilters = useMemo(() => [where('role', 'in', ['admin', 'super_admin'])], []);

  // Use Centralized Hook
  const { 
    data: staffData, 
    isLoading, 
    isRefreshing, 
    isAuto, 
    badgeCount,
    setAuto, 
    refresh 
  } = useSmartFetch<UserProfile[]>({
    key: 'staff-data',
    fetcher: getUsers,
    localStorageKey: 'auto-refresh-staff',
    watchPath: 'users',
    watchFilters: watchFilters
  });

  const users = staffData || [];

  useEffect(() => {
    if (!loading && user && !canViewSystem) {
      router.replace('/dashboard');
    }
  }, [user, loading, router, canViewSystem]);
  
  const { admins, archived } = useMemo(() => {
    if (!users) return { admins: [], archived: [] };

    const lowerSearch = searchTerm.toLowerCase().trim();
    const filteredUsers = lowerSearch
      ? users.filter(u =>
          u.name.toLowerCase().includes(lowerSearch) ||
          u.email.toLowerCase().includes(lowerSearch) ||
          (u.phone && u.phone.toLowerCase().includes(lowerSearch))
        )
      : users;
    
    const activeStaff = filteredUsers.filter(u => u.status !== 'archived' && ['admin', 'super_admin'].includes(u.role));
    const archivedStaff = filteredUsers.filter(u => u.status === 'archived' && ['admin', 'super_admin'].includes(u.role));

    // Sort to keep super_admin on top
    const sortedActive = [...activeStaff].sort((a, b) => {
        if (a.role === 'super_admin') return -1;
        if (b.role === 'super_admin') return 1;
        return 0;
    });

    return {
      admins: sortedActive,
      archived: archivedStaff,
    };
  }, [users, searchTerm]);
  
  const tabContent: Record<string, UserProfile[]> = {
    admin: admins,
    archived: archived,
  };

  const openDialog = (user: UserProfile, action: ActionType) => {
    if (!canManageSystem) return;
    setUserToAction(user);
    setActionType(action);
    setIsDialogOpen(true);
  };
  
  const openBulkActionDialog = (action: ActionType) => {
    if (!canManageSystem) return;
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
    if (!actionType || !firestore || !user || !canManageSystem) return;
    
    const isBulk = userToAction === null;
    const rawIds = isBulk ? selectedIds : [userToAction!.id];
    const idsToProcess = users
        .filter(u => rawIds.includes(u.id) && u.role !== 'super_admin')
        .map(u => u.id);

    if (idsToProcess.length === 0 && rawIds.length > 0) {
        toast({ 
            variant: "destructive", 
            title: "ดำเนินการไม่สำเร็จ", 
            description: "ระบบไม่อนุญาตให้ปิดใช้งานหรือลบบัญชีผู้ดูแลระบบระดับสูงสุดผ่านหน้านี้" 
         });
        closeDialog();
        return;
    }
    
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
    
    if (idsToProcess.includes(user.id) && actionType === 'archive') {
        toast({ variant: "destructive", title: "ดำเนินการไม่สำเร็จ", description: "คุณไม่สามารถปิดใช้งานบัญชีของตัวเองได้" });
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
                : `พนักงาน "${userToAction!.name}" ได้รับการอัปเดตแล้ว`;

            toast({ title: 'สำเร็จ', description: successMessage });
            
            clearGlobalCache('staff-data');
            refresh(true);

        } catch (error: any) {
            console.error("Error performing action on staff:", error);
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
      description: (name, count) => name ? `คุณแน่ใจหรือไม่ว่าต้องการปิดใช้งานพนักงาน "${name}"?` : `คุณแน่ใจหรือไม่ว่าต้องการปิดใช้งาน ${count} รายการที่เลือก?`,
      actionText: 'ยืนยันการปิดใช้งาน',
      variant: 'destructive',
    },
    restore: {
      title: 'ยืนยันการกู้คืน',
      description: (name, count) => name ? `คุณแน่ใจหรือไม่ว่าต้องการกู้คืนพนักงาน "${name}"?` : `คุณแน่ใจหรือไม่ว่าต้องการกู้คืน ${count} รายการที่เลือก?`,
      actionText: 'ยืนยันการกู้คืน',
      variant: 'default',
    },
    delete: {
      title: 'ยืนยันการลบถาวร',
      description: (name, count) => name ? `คุณแน่ใจหรือไม่ว่าต้องการลบพนักงาน "${name}" อย่างถาวร?` : `คุณแน่ใจหรือไม่ว่าต้องการลบ ${count} รายการที่เลือกอย่างถาวร?`,
      actionText: 'ยืนยันการลบถาวร',
      variant: 'destructive',
    },
  };

  const currentDialogContent = actionType ? dialogContentMap[actionType] : null;

  if (loading || !user || !canViewSystem) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-headline font-bold">จัดการทีมงาน / แอดมิน</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 bg-muted/30 rounded-md h-10 border border-muted-foreground/10">
            <Switch 
              id="auto-refresh-staff" 
              checked={isAuto} 
              onCheckedChange={setAuto} 
            />
            <Label htmlFor="auto-refresh-staff" className="text-[10px] font-bold cursor-pointer whitespace-nowrap">รีเฟรชอัตโนมัติ</Label>
          </div>
          <SmartRefreshButton 
            refresh={refresh}
            isRefreshing={isRefreshing}
            badgeCount={badgeCount}
          />
          {canManageSystem && (
            <Button asChild className="h-10">
              <Link href="/dashboard/staff/new">
                <PlusCircle className="mr-2 h-4 w-4" />
                เพิ่มแอดมินใหม่
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
        <div className="flex items-center gap-2 w-full sm:w-auto sm:flex-grow md:flex-grow-0">
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
              <TabsTrigger value="admin">พนักงานทั้งหมด ({admins.length})</TabsTrigger>
              <TabsTrigger value="archived" className="flex items-center gap-2">
                  <Trash2 className="h-4 w-4" />
                  ที่ถูกจัดเก็บ ({archived.length})
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
          {Object.entries(tabContent).map(([tab, userList]) => (
            <TabsContent key={tab} value={tab}>
                <UsersTable 
                  users={userList} 
                  currentUser={user}
                  activeTab={activeTab}
                  openDialog={openDialog}
                  selectedIds={selectedIds}
                  onSelectedIdsChange={setSelectedIds}
                  canManage={canManageSystem}
                />
            </TabsContent>
          ))}
        </Tabs>
      )}
      
      {selectedIds.length > 0 && activeTab === 'archived' && canManageSystem && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 animate-in fade-in-0 slide-in-from-bottom-5">
              <div className="bg-card text-card-foreground rounded-lg border shadow-lg flex items-center h-12 px-4 gap-4">
                <span className="text-sm font-medium">{selectedIds.length} รายการที่เลือก</span>
                <Separator orientation="vertical" className="h-6" />
                <Button variant="outline" size="sm" onClick={() => openBulkActionDialog('restore')}>
                  <RotateCw className="mr-2 h-4 w-4" />
                  กู้คืน
                </Button>
                {user?.role === 'super_admin' && (
                    <Button variant="destructive" size="sm" onClick={() => openBulkActionDialog('delete')}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      ลบถาวร
                  </Button>
                )}
              </div>
          </div>
      )}

      {selectedIds.length > 0 && activeTab === 'admin' && canManageSystem && (
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
