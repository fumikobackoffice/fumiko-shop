
'use client';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { PlusCircle, Search, Warehouse, FileText, ShoppingBag, RotateCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { PurchaseOrder } from '@/lib/types';
import { PurchaseOrdersTable } from '@/components/dashboard/purchase-orders-table';
import { ReceiveStockTable } from '@/components/dashboard/receive-stock-table';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getPurchaseOrders } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useSmartFetch } from '@/hooks/use-smart-fetch';
import { SmartRefreshButton } from '@/components/dashboard/smart-refresh-button';

export default function ProcurementHubPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = useState('');
  const [mainTab, setMainTab] = useState('purchasing');
  const [statusTab, setStatusTab] = useState('all');
  const [paymentStatusTab, setPaymentStatusTab] = useState('all');

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
    data: procurementData, 
    isLoading, 
    isRefreshing, 
    isAuto, 
    badgeCount,
    setAuto, 
    refresh 
  } = useSmartFetch<{ purchaseOrders: PurchaseOrder[], supplierMap: Map<string, string> }>({
    key: 'procurement-hub-data',
    fetcher: useCallback(async () => {
        const data = await getPurchaseOrders();
        const poWithDates = data.purchaseOrders.map(po => ({ 
          ...po, 
          orderDate: new Date(po.orderDate),
          expectedDeliveryDate: po.expectedDeliveryDate ? new Date(po.expectedDeliveryDate) : null,
          createdAt: po.createdAt ? new Date(po.createdAt) : null,
          updatedAt: po.updatedAt ? new Date(po.updatedAt) : null,
        }));
        return { 
          purchaseOrders: poWithDates as any[], 
          supplierMap: new Map(Object.entries(data.supplierMap)) 
        };
    }, []),
    localStorageKey: 'auto-refresh-po',
    watchPath: 'purchaseOrders'
  });

  const purchaseOrders = procurementData?.purchaseOrders || [];
  const supplierMap = procurementData?.supplierMap || new Map();

  // Listen for internal updates to trigger silent refresh across the page
  useEffect(() => {
    const handleActionUpdate = () => {
      refresh(true); // Silent refresh
    };
    window.addEventListener('custom:po-updated', handleActionUpdate);
    return () => window.removeEventListener('custom:po-updated', handleActionUpdate);
  }, [refresh]);

  useEffect(() => {
    if (!authLoading && user && !canViewInventory) {
      router.replace('/dashboard');
    }
  }, [user, authLoading, canViewInventory, router]);

  const filteredPOs = useMemo(() => {
    if (!purchaseOrders) return [];
    
    let filtered = purchaseOrders;

    // Filter by main process
    if (mainTab === 'receiving') {
      filtered = filtered.filter(po => ['ISSUED', 'PARTIALLY_RECEIVED'].includes(po.status));
    } else {
      // Purchasing tab handles internal status filtering
      if (statusTab !== 'all') {
        filtered = filtered.filter(po => po.status === statusTab);
      }
      
      // Apply Payment Status Filter only for Purchasing tab
      if (paymentStatusTab !== 'all') {
        filtered = filtered.filter(po => po.paymentStatus === paymentStatusTab);
      }
    }
    
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      filtered = filtered.filter(po => 
        po.poNumber.toLowerCase().includes(s) ||
        (supplierMap.get(po.supplierId) || '').toLowerCase().includes(s)
      );
    }

    return filtered;
  }, [purchaseOrders, searchTerm, mainTab, statusTab, paymentStatusTab, supplierMap]);

  if (authLoading || !user || !canViewInventory) {
    return <div className="h-screen w-full flex items-center justify-center bg-background"><div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div></div>;
  }

  const getReceivingCount = () => {
    if (!purchaseOrders) return 0;
    return purchaseOrders.filter(po => ['ISSUED', 'PARTIALLY_RECEIVED'].includes(po.status)).length;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold flex items-center gap-3">
            <Warehouse className="h-8 w-8 text-primary" />
            การจัดซื้อและรับของ
          </h1>
          <p className="text-muted-foreground">ศูนย์กลางจัดการใบสั่งซื้อสินค้าและรับสินค้าเข้าสต็อก</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2 px-3 bg-muted/30 rounded-md h-10 border border-muted-foreground/10 flex-1 sm:flex-none">
            <Switch 
              id="auto-refresh-po" 
              checked={isAuto} 
              onCheckedChange={setAuto} 
            />
            <Label htmlFor="auto-refresh-po" className="text-[10px] font-bold cursor-pointer whitespace-nowrap">รีเฟรชอัตโนมัติ</Label>
          </div>
          <SmartRefreshButton 
            refresh={refresh}
            isRefreshing={isRefreshing}
            badgeCount={badgeCount}
          />
          {canManageInventory && (
            <Button asChild className="h-10 flex-1 sm:flex-none">
              <Link href="/dashboard/purchase-orders/new">
                <PlusCircle className="mr-2 h-4 w-4" />
                สร้างใบสั่งซื้อใหม่
              </Link>
            </Button>
          )}
        </div>
      </div>

      <Tabs value={mainTab} onValueChange={setMainTab} className="w-full">
        <TabsList className="w-full justify-start h-12 bg-background border-b rounded-none px-0 gap-6">
          <TabsTrigger 
            value="purchasing" 
            className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent px-4 h-full font-bold"
          >
            <FileText className="mr-2 h-4 w-4" />
            การจัดการใบสั่งซื้อ
          </TabsTrigger>
          <TabsTrigger 
            value="receiving" 
            className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent px-4 h-full font-bold"
          >
            <Warehouse className="mr-2 h-4 w-4" />
            รอรับสินค้าเข้าคลัง
            {getReceivingCount() > 0 && (
              <Badge variant="secondary" className="ml-2 bg-primary/10 text-primary border-none">
                {getReceivingCount()}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <div className="pt-6 space-y-4">
          <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full xl:w-auto">
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="ค้นหารหัส PO หรือแหล่งจัดซื้อ..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-10"
                />
              </div>
            </div>

            {mainTab === 'purchasing' && (
              <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                <Tabs value={statusTab} onValueChange={setStatusTab}>
                  <TabsList className="bg-muted/50 h-9">
                    <TabsTrigger value="all" className="text-[10px] uppercase font-bold px-3">สถานะ: ทั้งหมด</TabsTrigger>
                    <TabsTrigger value="DRAFT" className="text-[10px] uppercase font-bold px-3">ฉบับร่าง</TabsTrigger>
                    <TabsTrigger value="ISSUED" className="text-[10px] uppercase font-bold px-3">ออกใบสั่งแล้ว</TabsTrigger>
                    <TabsTrigger value="COMPLETED" className="text-[10px] uppercase font-bold px-3">เสร็จสมบูรณ์</TabsTrigger>
                  </TabsList>
                </Tabs>

                <Tabs value={paymentStatusTab} onValueChange={setPaymentStatusTab}>
                  <TabsList className="bg-muted/50 h-9">
                    <TabsTrigger value="all" className="text-[10px] uppercase font-bold px-3">ชำระเงิน: ทั้งหมด</TabsTrigger>
                    <TabsTrigger value="UNPAID" className="text-[10px] uppercase font-bold px-3 text-orange-600 data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700">ยังไม่ชำระ</TabsTrigger>
                    <TabsTrigger value="PAID" className="text-[10px] uppercase font-bold px-3 text-emerald-600 data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700">ชำระแล้ว</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            )}
          </div>

          {isLoading && !isRefreshing ? (
            <div className="space-y-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : (
            <div className="animate-in fade-in duration-300">
              {mainTab === 'purchasing' ? (
                <PurchaseOrdersTable 
                  purchaseOrders={filteredPOs} 
                  supplierMap={supplierMap} 
                  canManage={canManageInventory}
                />
              ) : (
                <ReceiveStockTable 
                  purchaseOrders={filteredPOs} 
                  supplierMap={supplierMap} 
                  isHistoryView={false} 
                  canManage={canManageInventory}
                />
              )}
            </div>
          )}
        </div>
      </Tabs>
    </div>
  );
}
