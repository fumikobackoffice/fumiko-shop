
'use client';

import { Button, buttonVariants } from '@/components/ui/button';
import { PlusCircle, Search, Trash2, Archive, RotateCw, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { PackagesTable } from '@/components/dashboard/packages-table';
import { useAuth } from '@/hooks/use-auth';
import { useFirestore } from '@/firebase';
import { doc, writeBatch } from 'firebase/firestore';
import { ProductPackage } from '@/lib/types';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo, useTransition, useCallback } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from '@/hooks/use-toast';
import { CustomDialog } from '@/components/dashboard/custom-dialog';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import { getPackages } from '@/app/actions';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useSmartFetch, clearGlobalCache } from '@/hooks/use-smart-fetch';
import { SmartRefreshButton } from '@/components/dashboard/smart-refresh-button';

export type ActionType = 'archive' | 'restore' | 'delete';

export default function PackagesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('active');

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [packageToAction, setPackageToAction] = useState<ProductPackage | null>(null);
  const [actionType, setActionType] = useState<ActionType | null>(null);
  
  // Granular Permission Checks
  const canViewInventory = useMemo(() => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    const perms = user.permissions || [];
    return perms.includes('inventory:view') || perms.includes('inventory:manage') || perms.includes('manage_inventory');
  }, [user]);

  const canManageInventory = useMemo(() => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    const perms = user.permissions || [];
    return perms.includes('inventory:manage') || perms.includes('manage_inventory');
  }, [user]);

  // Use Centralized Hook
  const { 
    data: packagesData, 
    isLoading, 
    isRefreshing, 
    isAuto, 
    badgeCount,
    setAuto, 
    refresh 
  } = useSmartFetch<ProductPackage[]>({
    key: 'packages-data',
    fetcher: getPackages,
    localStorageKey: 'auto-refresh-packages',
    watchPath: 'productPackages'
  });

  const packages = packagesData || [];

  // Protect access
  useEffect(() => {
    if (!loading && user && !canViewInventory) {
      router.replace('/dashboard');
    }
  }, [user, loading, router, canViewInventory]);

  const { activePackages, draftPackages, archivedPackages } = useMemo(() => {
    const lowercasedSearchTerm = searchTerm.toLowerCase();

    const filterLogic = (pkg: ProductPackage) => {
      if (!searchTerm) return true;
      if (pkg.name.toLowerCase().includes(lowercasedSearchTerm)) return true;
      if (pkg.sku && pkg.sku.toLowerCase().includes(lowercasedSearchTerm)) return true;
      return false;
    };

    const filtered = packages.filter(filterLogic);

    return {
      activePackages: filtered.filter(p => p.status === 'active'),
      draftPackages: filtered.filter(p => p.status === 'draft'),
      archivedPackages: filtered.filter(p => p.status === 'archived'),
    };
  }, [packages, searchTerm]);
  
  const tabContent: Record<string, ProductPackage[]> = {
    active: activePackages,
    draft: draftPackages,
    archived: archivedPackages,
  };

  const openDialog = (pkg: ProductPackage, action: ActionType) => {
    if (!canManageInventory) return;
    setPackageToAction(pkg);
    setActionType(action);
    setIsDialogOpen(true);
  };
  
  const openBulkActionDialog = (action: ActionType) => {
    if (!canManageInventory) return;
    setPackageToAction(null);
    setActionType(action);
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setPackageToAction(null);
    setActionType(null);
  };

  const handleConfirmAction = () => {
    if (!actionType || !firestore || !user || !canManageInventory) return;
    
    const isBulk = packageToAction === null;
    const idsToProcess = isBulk ? selectedIds : [packageToAction!.id];

    if (idsToProcess.length === 0) {
        closeDialog();
        return;
    }

    if (actionType === 'delete' && user.role !== 'super_admin') {
      toast({ variant: "destructive", title: "ไม่มีสิทธิ์", description: "เฉพาะ Super Admin เท่านั้นที่สามารถลบแพ็กเกจถาวรได้" });
      closeDialog();
      return;
    }

    startTransition(async () => {
      try {
        const batch = writeBatch(firestore);
        if (actionType === 'delete') {
            for (const packageId of idsToProcess) {
                const packageRef = doc(firestore, 'productPackages', packageId);
                batch.delete(packageRef);
            }
        } else if (actionType === 'archive') {
            idsToProcess.forEach(packageId => {
                const packageRef = doc(firestore, 'productPackages', packageId);
                batch.update(packageRef, { status: 'archived' });
            });
        } else if (actionType === 'restore') {
            idsToProcess.forEach(packageId => {
                const packageRef = doc(firestore, 'productPackages', packageId);
                batch.update(packageRef, { status: 'draft' });
            });
        }
        await batch.commit();
        
        clearGlobalCache('packages-data');
        refresh(true);

        const successMessage = isBulk 
            ? `ดำเนินการกับ ${idsToProcess.length} รายการสำเร็จ`
            : `แพ็กเกจ "${packageToAction!.name}" ได้รับการอัปเดตแล้ว`;

        toast({ title: 'สำเร็จ', description: successMessage });

      } catch (error: any) {
        console.error("Error performing action on package(s):", error);
        toast({ variant: "destructive", title: "เกิดข้อผิดพลาด", description: error.message || "การดำเนินการล้มเหลว" });
      } finally {
        closeDialog();
        setSelectedIds([]);
      }
    });
  };

  if (loading || !user || !canViewInventory) {
    return <div className="h-screen w-full flex items-center justify-center bg-background"><div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div></div>;
  }

  const dialogContentMap: { [key in ActionType]?: { title: string; description: (name?: string, count?: number) => string; actionText: string; variant: string; } } = {
    archive: {
      title: 'ยืนยันการย้ายไปถังขยะ',
      description: (name, count) => name ? `คุณแน่ใจหรือไม่ว่าต้องการย้ายแพ็กเกจ "${name}" ไปที่ถังขยะ?` : `คุณแน่ใจหรือไม่ว่าต้องการย้าย ${count} รายการที่เลือกไปที่ถังขยะ?`,
      actionText: 'ยืนยัน',
      variant: 'destructive',
    },
    restore: {
      title: 'ยืนยันการกู้คืน',
      description: (name, count) => name ? `คุณแน่ใจหรือไม่ว่าต้องการกู้คืนแพ็กเกจ "${name}"? สถานะจะถูกเปลี่ยนเป็นฉบับร่าง` : `คุณแน่ใจหรือไม่ว่าต้องการกู้คืน ${count} รายการที่เลือก? สถานะจะถูกเปลี่ยนเป็นฉบับร่าง`,
      actionText: 'ยืนยันการกู้คืน',
      variant: 'default',
    },
    delete: {
      title: 'ยืนยันการลบถาวร',
      description: (name, count) => name ? `คุณแน่ใจหรือไม่ว่าต้องการลบแพ็กเกจ "${name}" อย่างถาวร? การกระทำนี้ไม่สามารถย้อนกลับได้` : `คุณแน่ใจหรือไม่ว่าต้องการลบ ${count} รายการที่เลือกอย่างถาวร? การกระทำนี้ไม่สามารถย้อนกลับได้`,
      actionText: 'ยืนยันการลบถาวร',
      variant: 'destructive',
    },
  };
  const currentDialogContent = actionType ? dialogContentMap[actionType] : null;
  
  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <h1 className="text-3xl font-headline font-bold">แพ็กเกจสินค้า</h1>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2 px-3 bg-muted/30 rounded-md h-10 border border-muted-foreground/10 flex-1 sm:flex-none">
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
          {canManageInventory && (
            <Button asChild className="h-10 flex-1 sm:flex-none">
              <Link href="/dashboard/packages/new">
                <PlusCircle className="mr-2 h-4 w-4" /> เพิ่มแพ็กเกจ
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
              placeholder="ค้นหาชื่อแพ็กเกจ หรือ รหัสสินค้า..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 w-full sm:w-64 md:w-80"
            />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Tabs value={activeTab} onValueChange={(tab) => {
              setActiveTab(tab);
              setSelectedIds([]);
          }}>
            <TabsList>
                <TabsTrigger value="active">เผยแพร่ ({activePackages.length})</TabsTrigger>
                <TabsTrigger value="draft">ฉบับร่าง ({draftPackages.length})</TabsTrigger>
                <TabsTrigger value="archived" className="flex items-center gap-2">
                  <Trash2 className="h-4 w-4" />
                  ถังขยะ ({archivedPackages.length})
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
           {Object.entries(tabContent).map(([tab, packageList]) => (
            <TabsContent key={tab} value={tab}>
                <PackagesTable
                    packages={packageList || []}
                    openDialog={openDialog}
                    currentUser={user}
                    activeTab={activeTab}
                    selectedIds={selectedIds}
                    onSelectedIdsChange={setSelectedIds}
                    canManage={canManageInventory}
                />
            </TabsContent>
          ))}
        </Tabs>
      )}

      {selectedIds.length > 0 && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 animate-in fade-in-0 slide-in-from-bottom-5">
              <div className="bg-card text-card-foreground rounded-lg border shadow-lg flex items-center h-12 px-4 gap-4">
                <span className="text-sm font-medium">{selectedIds.length} รายการที่เลือก</span>
                <Separator orientation="vertical" className="h-6" />
                {activeTab === 'archived' ? (
                  <>
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
                  </>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => openBulkActionDialog('archive')}>
                    <Archive className="mr-2 h-4 w-4" />
                    ย้ายไปถังขยะ
                  </Button>
                )}
              </div>
          </div>
      )}

      {currentDialogContent && (
        <CustomDialog isOpen={isDialogOpen} onClose={closeDialog} title={currentDialogContent.title}>
            <p className="text-sm text-muted-foreground">{currentDialogContent.description(packageToAction?.name, selectedIds.length)}</p>
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
