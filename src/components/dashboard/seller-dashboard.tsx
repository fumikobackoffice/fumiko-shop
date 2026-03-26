
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { UserProfile, Order, FeeInvoice, StoreSettings, Branch } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  ShoppingBag, 
  CreditCard, 
  Truck, 
  Ticket, 
  ArrowRight, 
  AlertCircle, 
  History,
  Clock,
  CheckCircle2,
  PlusCircle,
  Store,
  ChevronRight,
  Headset,
  LayoutDashboard
} from 'lucide-react';
import { getSellerDashboardStats } from '@/app/actions';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useDoc, useFirestore, useMemoFirebase, useCollection } from '@/firebase';
import { doc, collection, query, where } from 'firebase/firestore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface SellerDashboardProps {
  user: UserProfile;
}

const getStatusVariant = (status: Order['status']): "success" | "info" | "warning" | "destructive" | "default" | "secondary" | "outline" => {
  switch (status) {
    case 'PENDING_PAYMENT': return 'secondary';
    case 'PROCESSING': return 'info';
    case 'READY_TO_SHIP': return 'warning';
    case 'SHIPPED': return 'success';
    case 'COMPLETED': return 'success';
    case 'CANCELLED': return 'destructive';
    case 'EXPIRED': return 'outline';
    default: return 'default';
  }
};

const getStatusText = (status: Order['status']) => {
  switch (status) {
    case 'PENDING_PAYMENT': return 'รอชำระเงิน';
    case 'PROCESSING': return 'รอตรวจสอบ';
    case 'READY_TO_SHIP': return 'รอจัดส่ง';
    case 'SHIPPED': return 'จัดส่งแล้ว';
    case 'COMPLETED': return 'สำเร็จ';
    case 'CANCELLED': return 'ยกเลิก';
    case 'EXPIRED': return 'หมดอายุ';
    default: return status;
  }
};

export function SellerDashboard({ user }: SellerDashboardProps) {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('all');
  const { toast } = useToast();
  const firestore = useFirestore();

  const settingsRef = useMemoFirebase(() => firestore ? doc(firestore, 'settings', 'store') : null, [firestore]);
  const { data: storeSettings, isLoading: isSettingsLoading } = useDoc<StoreSettings>(settingsRef);

  // Fetch all branches owned by this seller
  const branchesQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(collection(firestore, 'branches'), where('ownerId', '==', user.id));
  }, [firestore, user]);
  const { data: userBranches, isLoading: isBranchesLoading } = useCollection<Branch>(branchesQuery);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const stats = await getSellerDashboardStats(user.id, selectedBranchId);
      setData(stats);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'โหลดข้อมูลล้มเหลว', description: error.message });
    } finally {
      setIsLoading(false);
    }
  }, [user.id, selectedBranchId, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // If seller has exactly one branch, automatically select it and don't show "All"
  useEffect(() => {
    if (userBranches && userBranches.length === 1 && selectedBranchId === 'all') {
      setSelectedBranchId(userBranches[0].id);
    }
  }, [userBranches, selectedBranchId]);

  const selectedBranchName = useMemo(() => {
    if (selectedBranchId === 'all') return 'ภาพรวมทุกสาขา';
    return userBranches?.find(b => b.id === selectedBranchId)?.name || 'กำลังโหลด...';
  }, [selectedBranchId, userBranches]);

  if (isLoading && !data) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          <Skeleton className="h-96 md:col-span-2 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  const unpaidFees = data?.pendingInvoices?.filter((i: FeeInvoice) => i.status === 'PENDING') || [];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* 0. Branch Selector (Visible if more than 1 branch) */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-background/50 p-4 rounded-xl border shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg text-primary">
            <LayoutDashboard className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold leading-none">{selectedBranchName}</h2>
            <p className="text-xs text-muted-foreground mt-1">
              {selectedBranchId === 'all' 
                ? `ติดตามข้อมูลสรุปจาก ${userBranches?.length || 0} สาขาของคุณ` 
                : `ข้อมูลวิเคราะห์เฉพาะสาขา ${selectedBranchName}`}
            </p>
          </div>
        </div>
        
        {userBranches && userBranches.length > 1 && (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-sm font-medium text-muted-foreground hidden md:inline">เลือกสาขา:</span>
            <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
              <SelectTrigger className="w-full sm:w-[220px] bg-white dark:bg-muted/20">
                <SelectValue placeholder="เลือกสาขา" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ภาพรวมทุกสาขา</SelectItem>
                {userBranches.map(branch => (
                  <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* 1. Summary Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-primary/5 border-primary/20 transition-all hover:shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">คะแนนสะสม (รวม)</CardTitle>
            <Ticket className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{(data?.pointsBalance || 0).toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">ใช้เป็นส่วนลดในการสั่งซื้อครั้งถัดไป</p>
          </CardContent>
        </Card>

        <Card className="transition-all hover:shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">ออเดอร์รอชำระเงิน</CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.pendingOrdersCount || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">รายการที่ยังไม่แจ้งโอน</p>
          </CardContent>
        </Card>

        <Card className="transition-all hover:shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">อยู่ระหว่างจัดส่ง</CardTitle>
            <Truck className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.inTransitCount || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">รายการที่กำลังเดินทางหาคุณ</p>
          </CardContent>
        </Card>

        <Card className={cn("transition-all hover:shadow-md", data?.unpaidFeesCount > 0 ? "border-destructive/50 bg-destructive/5" : "")}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">ค่าธรรมเนียมค้างจ่าย</CardTitle>
            <CreditCard className={cn("h-4 w-4", data?.unpaidFeesCount > 0 ? "text-destructive" : "text-muted-foreground")} />
          </CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-bold", data?.unpaidFeesCount > 0 ? "text-destructive" : "")}>
              {data?.unpaidFeesCount || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">บิลรายเดือน/ปีที่ต้องชำระ</p>
          </CardContent>
        </Card>
      </div>

      {/* 2. Urgent Alerts & Actions */}
      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          {/* Action Required: Unpaid Fees */}
          {unpaidFees.length > 0 && (
            <Card className="border-destructive bg-destructive/5">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="h-5 w-5" />
                  <CardTitle className="text-lg">รายการค้างชำระเร่งด่วน</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {unpaidFees.map((fee: FeeInvoice) => (
                  <div key={fee.id} className="flex items-center justify-between bg-background/50 p-3 rounded-lg border border-destructive/20">
                    <div>
                      <p className="text-sm font-bold">{fee.billingPeriod}</p>
                      <p className="text-[10px] text-primary font-medium flex items-center gap-1 mt-0.5">
                        <Store className="h-3 w-3" /> สาขา: {fee.branchName}
                      </p>
                      <p className="text-[10px] text-muted-foreground">กำหนดชำระ: {format(new Date(fee.dueDate), 'd MMM yyyy', { locale: th })}</p>
                    </div>
                    <div className="text-right flex items-center gap-4">
                      <p className="text-sm font-bold text-destructive">฿{fee.amount.toLocaleString()}</p>
                      <Button size="sm" asChild>
                        <Link href="/dashboard/fees">แจ้งชำระเงิน</Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Recent Orders List */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-lg flex items-center gap-2"><ShoppingBag className="h-5 w-5 text-primary" /> รายการสั่งซื้อล่าสุด</CardTitle>
                <CardDescription>สถานะการสั่งสินค้าวัตถุดิบและอุปกรณ์</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild className="text-primary font-bold">
                <Link href="/dashboard/orders">ดูทั้งหมด <ArrowRight className="ml-1 h-4 w-4" /></Link>
              </Button>
            </CardHeader>
            <CardContent>
              {data?.recentOrders?.length > 0 ? (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead className="text-xs">วันที่</TableHead>
                        <TableHead className="text-xs">สาขา</TableHead>
                        <TableHead className="text-xs">สถานะ</TableHead>
                        <TableHead className="text-right text-xs">ยอดรวม</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.recentOrders.map((order: Order) => (
                        <TableRow key={order.id} className="cursor-pointer hover:bg-muted/30" onClick={() => window.location.href = `/account/orders/${order.id}`}>
                          <TableCell className="text-[10px] py-3 whitespace-nowrap">
                            {format(new Date(order.orderDate), 'd MMM yy', { locale: th })}
                          </TableCell>
                          <TableCell className="text-[10px] font-medium py-3 truncate max-w-[100px]">
                            {order.branchName}
                          </TableCell>
                          <TableCell className="py-3">
                            <Badge variant={getStatusVariant(order.status)} className="text-[10px] px-2 py-0.5 font-normal whitespace-nowrap">
                              {getStatusText(order.status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium py-3 text-xs whitespace-nowrap">
                            ฿{order.totalAmount.toLocaleString()}
                          </TableCell>
                          <TableCell className="py-3">
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground bg-muted/10 rounded-lg border-2 border-dashed">
                  <ShoppingBag className="mx-auto h-12 w-12 opacity-20 mb-2" />
                  <p>ยังไม่มีรายการสั่งซื้อ</p>
                  <Button variant="outline" size="sm" className="mt-4" asChild>
                    <Link href="/shop">เริ่มสั่งซื้อสินค้าครั้งแรก</Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {/* Quick Order Actions */}
          <Card className="bg-primary text-primary-foreground shadow-lg shadow-primary/20 overflow-hidden relative">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <PlusCircle className="h-24 w-24" />
            </div>
            <CardHeader>
              <CardTitle className="font-headline text-xl">สั่งสินค้าเข้าร้าน</CardTitle>
              <CardDescription className="text-primary-foreground/80">วัตถุดิบ อุปกรณ์ และแพ็กเกจ</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm mb-6 leading-relaxed">สต็อกใกล้หมดหรือยัง? สั่งซื้อตอนนี้เพื่อการทำงานที่ต่อเนื่องของสาขาคุณ</p>
              <Button variant="secondary" className="w-full font-bold h-11" asChild>
                <Link href="/shop">ไปที่หน้าร้านค้า</Link>
              </Button>
            </CardContent>
          </Card>

          {/* Monthly Spending History Card */}
          <Card className="border-l-4 border-l-green-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                <Store className="h-4 w-4" /> ยอดซื้อเดือนนี้ ({selectedBranchId === 'all' ? 'ทุกสาขา' : 'สาขานี้'})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">฿{(data?.monthlySpent || 0).toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">ยอดสุทธิไม่รวมค่าจัดส่ง</p>
              <div className="mt-4 flex items-center gap-2 p-2 bg-green-50 dark:bg-green-950/20 border border-green-100 dark:border-green-900 rounded-md">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <p className="text-[10px] text-green-700 dark:text-green-400 font-medium">สถานะแฟรนไชส์ปกติ</p>
              </div>
            </CardContent>
          </Card>

          {/* Support Info */}
          <Card className="bg-muted/30 border-primary/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Headset className="h-4 w-4 text-primary" />
                ต้องการความช่วยเหลือ?
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-3">
              <p>หากพบปัญหาในการสั่งซื้อหรือมีข้อสงสัยเกี่ยวกับบิลค่าธรรมเนียม กรุณาติดต่อ:</p>
              <div className="space-y-1">
                <p className="font-bold text-foreground">
                  {isSettingsLoading ? <Skeleton className="h-4 w-24" /> : (storeSettings?.companyAddress?.name || 'สำนักงานใหญ่ (Fumiko Center)')}
                </p>
                <p>โทร: {isSettingsLoading ? <Skeleton className="h-3 w-20" /> : (storeSettings?.supportPhone || '065-754-6699')}</p>
                <p>LINE: {isSettingsLoading ? <Skeleton className="h-3 w-20" /> : (storeSettings?.supportLineId || '@fumiko_support')}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
