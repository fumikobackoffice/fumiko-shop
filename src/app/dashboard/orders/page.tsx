
'use client';

import { OrdersTable } from '@/components/dashboard/orders-table';
import { useAuth } from '@/hooks/use-auth';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { Order, OrderItem } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { PrintDialog } from '@/components/dashboard/print/PrintDialog';
import { QuickShipmentDialog } from '@/components/dashboard/quick-shipment-dialog';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Search, X, RotateCw, ChevronLeft, ChevronRight, Archive, Inbox, Loader2, Calendar as CalendarIcon, FileText, Wallet } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock, ClipboardCheck, Truck } from 'lucide-react';
import { getAdminOrders } from '@/app/actions';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { format, isSameDay } from 'date-fns';
import { th } from 'date-fns/locale';
import { CustomLabelDialog } from '@/components/dashboard/custom-label-dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useSmartFetch, clearGlobalCache } from '@/hooks/use-smart-fetch';
import { SmartRefreshButton } from '@/components/dashboard/smart-refresh-button';

// Global cache for dashboard stats
let statsCache: any = null;

interface DashboardStatsProps {
    onStatusSelect: (status: string | null) => void;
    selectedStatus: string | null;
    refreshTrigger: number;
    isAutoOnEntry: boolean;
}

function DashboardStats({ onStatusSelect, selectedStatus, refreshTrigger, isAutoOnEntry }: DashboardStatsProps) {
    const firestore = useFirestore();
    const [stats, setStats] = useState(statsCache || { pendingPayment: 0, processing: 0, readyToShip: 0, debt: 0 });
    const [isLoading, setIsLoading] = useState(!statsCache);

    const fetchStats = useCallback(async (isManual = false) => {
        if (!firestore) return;

        if (!isManual && statsCache && !isAutoOnEntry) {
            setStats(statsCache);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        try {
            const [pendingSnapshot, processingSnapshot, readySnapshot, debtSnapshot] = await Promise.all([
                getDocs(query(collection(firestore, 'orders'), where('status', '==', 'PENDING_PAYMENT'))),
                getDocs(query(collection(firestore, 'orders'), where('status', '==', 'PROCESSING'))),
                getDocs(query(collection(firestore, 'orders'), where('status', '==', 'READY_TO_SHIP'))),
                getDocs(query(collection(firestore, 'orders'), where('balanceAmount', '>', 0))),
            ]);
            
            const results = {
                pendingPayment: pendingSnapshot.size,
                processing: processingSnapshot.size,
                readyToShip: readySnapshot.size,
                debt: debtSnapshot.size,
            };
            
            statsCache = results;
            setStats(results);
        } catch (error) {
            console.error("Error fetching dashboard stats:", error);
        } finally {
            setIsLoading(false);
        }
    }, [firestore, isAutoOnEntry]);

    useEffect(() => {
        fetchStats(refreshTrigger > 0);
    }, [fetchStats, refreshTrigger]);


    if (isLoading) {
        return (
            <div className="grid gap-4 grid-cols-2 md:grid-cols-4 mb-6">
                {Array.from({ length: 4 }).map((_, i) => (
                    <Card key={i}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <Skeleton className="h-3 w-12" />
                            <Skeleton className="h-4 w-4" />
                        </CardHeader>
                        <CardContent><Skeleton className="h-8 w-12" /></CardContent>
                    </Card>
                ))}
            </div>
        )
    }

    const toggleFilter = (status: string) => {
        if (selectedStatus === status) onStatusSelect(null);
        else onStatusSelect(status);
    };

    return (
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4 mb-6">
            <Card className={cn("cursor-pointer transition-all hover:bg-accent hover:border-primary/50", selectedStatus === 'PENDING_PAYMENT' && "border-primary ring-1 ring-primary bg-primary/5")} onClick={() => toggleFilter('PENDING_PAYMENT')}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                    <CardTitle className="text-[10px] font-bold uppercase tracking-tight text-muted-foreground">รอชำระเงิน</CardTitle>
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                </CardHeader>
                <CardContent><div className="text-xl font-bold">{stats.pendingPayment}</div></CardContent>
            </Card>
            <Card className={cn("cursor-pointer transition-all hover:bg-accent hover:border-primary/50", selectedStatus === 'PROCESSING' && "border-primary ring-1 ring-primary bg-primary/5")} onClick={() => toggleFilter('PROCESSING')}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                    <CardTitle className="text-[10px] font-bold uppercase tracking-tight text-muted-foreground">รอตรวจสอบ</CardTitle>
                    <ClipboardCheck className="h-3.5 w-3.5 text-muted-foreground" />
                </CardHeader>
                <CardContent><div className="text-xl font-bold">{stats.processing}</div></CardContent>
            </Card>
            <Card className={cn("cursor-pointer transition-all hover:bg-accent hover:border-primary/50", selectedStatus === 'READY_TO_SHIP' && "border-primary ring-1 ring-primary bg-primary/5")} onClick={() => toggleFilter('READY_TO_SHIP')}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                    <CardTitle className="text-[10px] font-bold uppercase tracking-tight text-muted-foreground">รอจัดส่ง</CardTitle>
                    <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                </CardHeader>
                <CardContent><div className="text-xl font-bold">{stats.readyToShip}</div></CardContent>
            </Card>
            <Card className={cn("cursor-pointer transition-all hover:bg-accent hover:border-primary/50", selectedStatus === 'DEBT' && "border-orange-500 ring-1 ring-orange-500 bg-orange-500/5")} onClick={() => toggleFilter('DEBT')}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                    <CardTitle className="text-[10px] font-bold uppercase tracking-tight text-orange-600">ค้างชำระ</CardTitle>
                    <Wallet className="h-3.5 w-3.5 text-orange-500" />
                </CardHeader>
                <CardContent><div className="text-xl font-bold text-orange-600">{stats.debt}</div></CardContent>
            </Card>
        </div>
    )
}

interface OrdersPageContentProps {
    ordersData: Order[] | null;
    isLoading: boolean;
    isRefreshing: boolean;
    filterStatus: string | null;
    onClearStatusFilter: () => void;
    isAdminView: boolean;
}

function OrdersPageContent({ ordersData, isLoading, isRefreshing, filterStatus, onClearStatusFilter, isAdminView }: OrdersPageContentProps) {
  const { user } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [archivedOrders, setArchivedOrders] = useState<Order[] | null>(null);
  const [isArchivedLoading, setIsArchivedLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20;
  const [orderToPrint, setOrderToPrint] = useState<Order | null>(null);
  const [orderToShip, setOrderToShip] = useState<Order | null>(null);
  const [itemsToPrint, setItemsToPrint] = useState<OrderItem[]>([]);
  const [isPrintingLoading, setIsPrintingLoading] = useState<string | null>(null);

  const orders = useMemo(() => ordersData || [], [ordersData]);

  const fetchArchivedOrders = async () => {
    if (!user || !isAdminView || archivedOrders !== null || isArchivedLoading) return;
    setIsArchivedLoading(true);
    try {
        const fetched = await getAdminOrders(100, 100);
        const processed = (fetched || []).map(o => ({ ...o, orderDate: new Date(o.orderDate), updatedAt: o.updatedAt ? new Date(o.updatedAt) : o.orderDate }));
        setArchivedOrders(processed as any);
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'โหลดข้อมูลล้มเหลว', description: error.message });
    } finally { setIsArchivedLoading(false); }
  };

  const filteredOrders = useMemo(() => {
    let result = orders;
    if (filterStatus) {
        if (filterStatus === 'DEBT') result = result.filter(order => (order.balanceAmount || 0) > 0);
        else result = result.filter(order => order.status === filterStatus);
    }
    if (selectedDate) {
        result = result.filter(order => {
            const orderDate = order.orderDate instanceof Date ? order.orderDate : new Date(order.orderDate);
            return isSameDay(orderDate, selectedDate);
        });
    }
    if (searchTerm.trim()) {
      const s = searchTerm.toLowerCase().trim();
      result = result.filter(o => o.id.toLowerCase().includes(s) || (o.customerName && o.customerName.toLowerCase().includes(s)));
    }
    return result;
  }, [orders, searchTerm, filterStatus, selectedDate]);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, filterStatus, selectedDate]);

  const totalPages = Math.ceil(filteredOrders.length / ITEMS_PER_PAGE);
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredOrders.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredOrders, currentPage]);

  const handlePrintClick = async (order: Order) => {
    if (!firestore) return;
    setIsPrintingLoading(order.id);
    try {
      const itemsSnapshot = await getDocs(collection(firestore, 'orders', order.id, 'orderItems'));
      const fetchedItems = itemsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as OrderItem));
      setItemsToPrint(fetchedItems);
      setOrderToPrint(order); 
    } catch (e) {
      toast({ variant: 'destructive', title: 'เกิดข้อผิดพลาด', description: 'ไม่สามารถโหลดรายการสินค้าได้' });
    } finally { setIsPrintingLoading(null); }
  };

  if (isLoading && !isRefreshing) return <div className="space-y-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-40 w-full" /></div>;

  const getStatusLabel = (status: string) => {
      switch (status) {
          case 'PENDING_PAYMENT': return 'รอชำระเงิน';
          case 'PROCESSING': return 'รอตรวจสอบ';
          case 'READY_TO_SHIP': return 'รอจัดส่ง';
          case 'EXPIRED': return 'หมดอายุ';
          case 'DEBT': return 'ค้างชำระ';
          default: return status;
      }
  }

  return (
    <>
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-4">
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            <div className="relative flex-grow sm:flex-grow-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder={!isAdminView ? "ค้นหารหัสอ้างอิง..." : "ค้นหารหัสอ้างอิง หรือชื่อลูกค้า..."} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-full sm:w-64 md:w-80 h-10" />
            </div>
            <div className="relative shrink-0 flex items-center bg-background border rounded-md h-10 px-2 group focus-within:ring-2 focus-within:ring-primary/20">
                <CalendarIcon className="h-4 w-4 text-muted-foreground mr-2" />
                <input type="date" lang="th" className="bg-transparent border-none outline-none text-sm text-foreground focus:ring-0 cursor-pointer" value={selectedDate ? format(selectedDate, 'yyyy-MM-dd') : ''} onChange={(e) => { const val = e.target.value; if (val) { const [y, m, d] = val.split('-').map(Number); setSelectedDate(new Date(y, m - 1, d)); } else setSelectedDate(undefined); }} />
            </div>
        </div>
        {(filterStatus || selectedDate) && (
            <div className="flex items-center gap-2 bg-primary/10 text-primary px-3 py-1.5 rounded-full text-sm font-medium border border-primary/20">
                <span className="flex items-center gap-1.5">
                    {filterStatus && <span>ฟิลเตอร์: {getStatusLabel(filterStatus)}</span>}
                    {filterStatus && selectedDate && <span className="opacity-30">•</span>}
                    {selectedDate && <span>วันที่: {format(selectedDate, 'd MMM ', { locale: th }) + (selectedDate.getFullYear() + 543).toString().slice(-2)}</span>}
                </span>
                <button onClick={() => { onClearStatusFilter(); setSelectedDate(undefined); }} className="hover:bg-primary/20 rounded-full p-0.5 transition-colors"><X className="h-3.5 w-3.5" /></button>
            </div>
        )}
      </div>

      <div className="space-y-12">
        <div>
            <div className="flex items-center justify-between mb-4 px-1">
                <div className="flex items-center gap-2"><Inbox className="h-5 w-5 text-primary" /><h3 className="font-bold text-lg">รายการออเดอร์ล่าสุด</h3>
                    {isRefreshing && <div className="flex items-center gap-1.5 ml-2 text-primary animate-pulse"><Loader2 className="h-3.5 w-3.5 animate-spin" /><span className="text-[10px] font-bold uppercase tracking-wider">กำลังดึงข้อมูล...</span></div>}
                </div>
            </div>
            <div className={cn("transition-opacity duration-300", isRefreshing && "opacity-60")}>
                <OrdersTable orders={paginatedOrders} onPrint={handlePrintClick} printingOrderId={isPrintingLoading} onManageShipment={(order) => setOrderToShip(order)} />
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8 py-4">
                <Button variant="outline" size="icon" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}><ChevronLeft className="h-4 w-4" /></Button>
                <div className="text-sm font-medium">หน้า {currentPage} จาก {totalPages}</div>
                <Button variant="outline" size="icon" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            )}
        </div>

        {isAdminView && (
            <Accordion type="single" collapsible className="w-full" onValueChange={(v) => v === 'archive' && fetchArchivedOrders()}>
                <AccordionItem value="archive" className="border rounded-xl bg-muted/20 px-4">
                    <AccordionTrigger className="hover:no-underline py-6"><div className="flex items-center gap-3"><Archive className="h-6 w-6 text-muted-foreground" /><div className="text-left"><p className="font-bold text-lg leading-none">กล่องจัดเก็บออเดอร์เก่า</p><p className="text-xs text-muted-foreground mt-1.5">ออเดอร์ที่ลำดับเกิน 100 รายการขึ้นไปจะถูกย้ายมาที่นี่</p></div></div></AccordionTrigger>
                    <AccordionContent className="pb-8 pt-4">
                        {isArchivedLoading ? (<div className="flex flex-col items-center justify-center py-12 gap-3"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="text-sm text-muted-foreground">กำลังโหลดข้อมูลออเดอร์เก่า...</p></div>) : archivedOrders === null ? null : archivedOrders.length === 0 ? (<div className="text-center py-12 text-muted-foreground"><Archive className="h-12 w-12 mx-auto mb-2 opacity-10" /><p>ยังไม่มีรายการออเดอร์เก่า</p></div>) : (
                            <div className="space-y-4">
                                <OrdersTable orders={archivedOrders} onPrint={handlePrintClick} printingOrderId={isPrintingLoading} onManageShipment={(order) => setOrderToShip(order)} />
                                <p className="text-[10px] text-center text-muted-foreground italic">แสดงข้อมูลในคลังจัดเก็บ ({archivedOrders.length} รายการ)</p>
                            </div>
                        )}
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
        )}
      </div>

      {orderToPrint && <PrintDialog order={orderToPrint} orderItems={itemsToPrint} isOpen={!!orderToPrint} onClose={() => setOrderToPrint(null)} />}
      {orderToShip && user && <QuickShipmentDialog order={orderToShip} onClose={() => setOrderToShip(null)} adminUser={user} />}
    </>
  );
}

export default function OrdersPage() {
  const { user } = useAuth();
  const firestore = useFirestore();
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isCustomLabelOpen, setIsCustomLabelOpen] = useState(false);
  
  const canViewOrders = useMemo(() => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    if (user.role === 'seller') return false;
    const perms = user.permissions || [];
    return perms.includes('orders:view') || perms.includes('orders:manage');
  }, [user]);

  const { data: adminOrdersData, isLoading: isAdminLoading, isRefreshing, isAuto, badgeCount, setAuto, refresh: adminRefresh } = useSmartFetch<Order[]>({
    key: 'admin-orders',
    fetcher: useCallback(async () => {
        const fetched = await getAdminOrders(100);
        return (fetched || []).map(o => ({ ...o, orderDate: new Date(o.orderDate), updatedAt: o.updatedAt ? new Date(o.updatedAt) : o.orderDate }));
    }, []),
    localStorageKey: 'auto-refresh-orders',
    watchPath: 'orders',
    enabled: canViewOrders
  });

  const sellerOrdersQuery = useMemoFirebase(() => {
    if (!firestore || !user || canViewOrders) return null;
    return query(collection(firestore, 'orders'), where('buyerId', '==', user.id), orderBy('orderDate', 'desc'));
  }, [firestore, user?.id, canViewOrders]);
  
  const { data: sellerOrders, isLoading: isSellerLoading } = useCollection<Order>(sellerOrdersQuery);

  const ordersData = canViewOrders ? adminOrdersData : sellerOrders;
  const isLoading = canViewOrders ? isAdminLoading : isSellerLoading;

  const handleRefresh = useCallback((silent = false) => {
      statsCache = null;
      setRefreshTrigger(prev => prev + 1); 
      if (canViewOrders) adminRefresh(silent);
  }, [canViewOrders, adminRefresh]);

  useEffect(() => {
    const handleActionUpdate = () => handleRefresh(true);
    window.addEventListener('custom:order-updated', handleActionUpdate);
    return () => window.removeEventListener('custom:order-updated', handleActionUpdate);
  }, [handleRefresh]);

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <h1 className="text-3xl font-headline font-bold">{canViewOrders ? 'จัดการคำสั่งซื้อทั้งหมด' : 'ประวัติการสั่งซื้อของคุณ'}</h1>
        {canViewOrders && (
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            <div className="flex items-center gap-2 px-3 bg-muted/30 rounded-md h-10 border border-muted-foreground/10 flex-1 sm:flex-none">
              <Switch id="auto-refresh-orders" checked={isAuto} onCheckedChange={setAuto} />
              <Label htmlFor="auto-refresh-orders" className="text-[10px] font-bold cursor-pointer whitespace-nowrap">รีเฟรชอัตโนมัติ</Label>
            </div>
            <SmartRefreshButton refresh={handleRefresh} isRefreshing={isRefreshing} badgeCount={badgeCount} />
            <Button variant="outline" onClick={() => setIsCustomLabelOpen(true)} className="h-10"><FileText className="mr-2 h-4 w-4" />พิมพ์ใบปะหน้าอิสระ</Button>
          </div>
        )}
      </div>
      {canViewOrders && <DashboardStats selectedStatus={filterStatus} onStatusSelect={setFilterStatus} refreshTrigger={refreshTrigger} isAutoOnEntry={isAuto} />}
      <OrdersPageContent ordersData={ordersData} isLoading={isLoading} isRefreshing={isRefreshing} filterStatus={filterStatus} onClearStatusFilter={() => setFilterStatus(null)} isAdminView={canViewOrders} />
      {canViewOrders && <CustomLabelDialog isOpen={isCustomLabelOpen} onClose={() => setIsCustomLabelOpen(false)} />}
    </div>
  );
}
