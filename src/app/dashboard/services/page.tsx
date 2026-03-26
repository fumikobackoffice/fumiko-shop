
'use client';

import { useState, useEffect, useTransition, useCallback, useMemo } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { PlusCircle, RotateCw, Search, Loader2, Trash2, Archive, X } from 'lucide-react';
import Link from 'next/link';
import { Service } from '@/lib/types';
import { getServices } from '@/app/actions';
import { ServicesTable } from '@/components/dashboard/services-table';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { doc, updateDoc, deleteDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { CustomDialog } from '@/components/dashboard/custom-dialog';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useSmartFetch, clearGlobalCache } from '@/hooks/use-smart-fetch';
import { SmartRefreshButton } from '@/components/dashboard/smart-refresh-button';

export default function ServicesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('active');

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [actionDialog, setActionDialog] = useState<{ 
    open: boolean, 
    service: Service | null, 
    type: 'archive' | 'restore' | 'delete' | null 
  }>({ open: false, service: null, type: null });

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
    data: servicesData, 
    isLoading, 
    isRefreshing, 
    isAuto, 
    badgeCount,
    setAuto, 
    refresh 
  } = useSmartFetch<Service[]>({
    key: 'services-data',
    fetcher: getServices,
    localStorageKey: 'auto-refresh-services',
    watchPath: 'services'
  });

  const services = servicesData || [];

  // Protect access
  useEffect(() => {
    if (!authLoading && user && !canViewInventory) {
      router.replace('/dashboard');
    }
  }, [user, authLoading, router, canViewInventory]);

  // Clear selection when changing tabs
  useEffect(() => {
    setSelectedIds([]);
  }, [activeTab]);

  const handleOpenActionDialog = useCallback((service: Service | null, type: 'archive' | 'restore' | 'delete') => {
    if (!canManageInventory) return;
    setActionDialog({ open: true, service, type });
  }, [canManageInventory]);

  const handleConfirmAction = () => {
    if (!firestore || !actionDialog.type || !canManageInventory) return;
    
    const isBulk = actionDialog.service === null;
    const idsToProcess = isBulk ? selectedIds : [actionDialog.service!.id];

    if (idsToProcess.length === 0) {
        setActionDialog({ open: false, service: null, type: null });
        return;
    }

    if (actionDialog.type === 'delete' && user?.role !== 'super_admin') {
      toast({ variant: "destructive", title: "ไม่มีสิทธิ์", description: "เฉพาะ Super Admin เท่านั้นที่สามารถลบถาวรได้" });
      setActionDialog({ open: false, service: null, type: null });
      return;
    }

    startTransition(async () => {
      try {
        const batch = writeBatch(firestore);
        
        if (actionDialog.type === 'delete') {
          idsToProcess.forEach(id => {
            batch.delete(doc(firestore, 'services', id));
          });
        } else {
          const newStatus = actionDialog.type === 'archive' ? 'archived' : 'active';
          idsToProcess.forEach(id => {
            batch.update(doc(firestore, 'services', id), { 
              status: newStatus,
              updatedAt: serverTimestamp()
            });
          });
        }

        await batch.commit();
        
        clearGlobalCache('services-data');
        refresh(true);
        setSelectedIds([]);
        setActionDialog({ open: false, service: null, type: null });
      } catch (e: any) {
        toast({ variant: 'destructive', title: 'ผิดพลาด', description: e.message });
      }
    });
  };

  const filtered = services.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         (s.sku && s.sku.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesTab = activeTab === 'archived' ? s.status === 'archived' : s.status !== 'archived';
    return matchesSearch && matchesTab;
  });

  if (authLoading || !user || !canViewInventory) {
    return <div className="h-screen w-full flex items-center justify-center bg-background"><div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div></div>;
  }

  const dialogContentMap = {
    archive: {
      title: 'ยืนยันการจัดเก็บ',
      description: actionDialog.service 
        ? `คุณแน่ใจหรือไม่ว่าต้องการจัดเก็บความบริการ "${actionDialog.service.name}"?` 
        : `คุณแน่ใจหรือไม่ว่าต้องการจัดเก็บ ${selectedIds.length} รายการที่เลือก?`,
      actionText: 'ยืนยันการจัดเก็บ',
      variant: 'destructive',
    },
    restore: {
      title: 'ยืนยันการกู้คืน',
      description: actionDialog.service 
        ? `คุณแน่ใจหรือไม่ว่าต้องการกู้คืนความบริการ "${actionDialog.service.name}"?` 
        : `คุณแน่ใจหรือไม่ว่าต้องการกู้คืน ${selectedIds.length} รายการที่เลือก?`,
      actionText: 'ยืนยันการกู้คืน',
      variant: 'default',
    },
    delete: {
      title: 'ยืนยันการลบถาวร',
      description: actionDialog.service 
        ? `คุณแน่ใจหรือไม่ว่าต้องการลบความบริการ "${actionDialog.service.name}" อย่างถาวร? การกระทำนี้ไม่สามารถย้อนกลับได้` 
        : `คุณแน่ใจหรือไม่ว่าต้องการลบ ${selectedIds.length} รายการที่เลือกอย่างถาวร? การกระทำนี้ไม่สามารถย้อนกลับได้`,
      actionText: 'ยืนยันการลบถาวร',
      variant: 'destructive',
    },
  };

  const currentDialog = actionDialog.type ? (dialogContentMap as any)[actionDialog.type] : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold">รายการบริการ</h1>
          <p className="text-muted-foreground">จัดการรายการบริการทั้งหมดของร้านค้า</p>
        </div>
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
              <Link href="/dashboard/services/new">
                <PlusCircle className="mr-2 h-4 w-4" /> เพิ่มบริการใหม่
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2 w-full sm:w-auto flex-grow md:flex-grow-0">
          <div className="relative flex-grow max-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="ค้นหาชื่อบริการ หรือรหัส SKU..." 
              className="pl-9" 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
            />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="active">บริการที่เปิดอยู่ ({services.filter(s => s.status !== 'archived').length})</TabsTrigger>
              <TabsTrigger value="archived" className="flex items-center gap-2">
                <Trash2 className="h-4 w-4" />
                ที่เก็บถาวร ({services.filter(s => s.status === 'archived').length})
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {isLoading && !isRefreshing ? (
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <Tabs value={activeTab}>
          <TabsContent value="active" className="pt-0">
            <ServicesTable 
              services={filtered} 
              onAction={handleOpenActionDialog}
              selectedIds={selectedIds}
              onSelectedIdsChange={setSelectedIds}
              canManage={canManageInventory}
              activeTab={activeTab}
            />
          </TabsContent>
          <TabsContent value="archived" className="pt-0">
            <ServicesTable 
              services={filtered} 
              onAction={handleOpenActionDialog}
              selectedIds={selectedIds}
              onSelectedIdsChange={setSelectedIds}
              canManage={canManageInventory}
              activeTab={activeTab}
            />
          </TabsContent>
        </Tabs>
      )}

      {/* Floating Bulk Action Bar */}
      {selectedIds.length > 0 && canManageInventory && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 animate-in fade-in-0 slide-in-from-bottom-5">
              <div className="bg-card text-card-foreground rounded-lg border shadow-lg flex items-center h-12 px-4 gap-4">
                <span className="text-sm font-medium">{selectedIds.length} รายการที่เลือก</span>
                <Separator orientation="vertical" className="h-6" />
                {activeTab === 'archived' ? (
                  <>
                    <Button variant="outline" size="sm" onClick={() => handleOpenActionDialog(null, 'restore')}>
                      <RotateCw className="mr-2 h-4 w-4" />
                      กู้คืน
                    </Button>
                    {user?.role === 'super_admin' && (
                        <Button variant="destructive" size="sm" onClick={() => handleOpenActionDialog(null, 'delete')}>
                          <Trash2 className="mr-2 h-4 w-4" />
                          ลบถาวร
                      </Button>
                    )}
                  </>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => handleOpenActionDialog(null, 'archive')}>
                    <Archive className="mr-2 h-4 w-4" />
                    ย้ายไปที่เก็บถาวร
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="h-8 w-8 ml-2" onClick={() => setSelectedIds([])}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
          </div>
      )}

      {currentDialog && (
        <CustomDialog 
          isOpen={actionDialog.open} 
          onClose={() => setActionDialog({ open: false, service: null, type: null })} 
          title={currentDialog.title}
        >
          <p className="text-muted-foreground text-sm">
            {currentDialog.description}
          </p>
          <div className="flex justify-end gap-2 mt-6">
            <Button variant="outline" onClick={() => setActionDialog({ open: false, service: null, type: null })}>ยกเลิก</Button>
            <Button 
              variant={currentDialog.variant as any} 
              onClick={handleConfirmAction} 
              disabled={isPending}
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {currentDialog.actionText}
            </Button>
          </div>
        </CustomDialog>
      )}
    </div>
  );
}
