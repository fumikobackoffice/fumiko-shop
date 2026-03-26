'use client';

import { useState, useCallback, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DollarSign, Percent, ShoppingBag, Users, Boxes, Zap, RotateCw } from 'lucide-react';
import { Skeleton } from '../ui/skeleton';
import { getDashboardStats, getMonthlySalesData, getTopSpenders, getInventoryAlerts, getBranchInsightsData, getExpiringBranches, getDepositRefundAlerts } from '@/app/actions';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { format, subMonths, endOfMonth } from 'date-fns';
import { th } from 'date-fns/locale';
import { Bar, ComposedChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from '@/components/ui/chart';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MonthlyReport } from './monthly-report';
import { ContractAlerts } from './contract-alerts';
import { DepositRefundAlerts } from './deposit-refund-alerts';
import Link from 'next/link';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useSmartFetch } from '@/hooks/use-smart-fetch';
import { SmartRefreshButton } from './smart-refresh-button';

type DashboardStatsData = {
  totalSales: number;
  totalGrossProfit: number;
  grossMarginRate: number;
  salesGeneratingOrdersCount: number;
};

type MonthlyData = {
  monthKey: string;
  month: string;
  sales: number;
  cost: number;
  profit: number;
  orders: number;
};

type TopSpender = {
  userId: string;
  name: string;
  email: string;
  totalSpent: number;
};

function OverallSummaryCard({ stats, dateRange }: { stats: DashboardStatsData, dateRange: string }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>ภาพรวมทั้งหมด</CardTitle>
                <CardDescription>{dateRange}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div>
                    <div className="flex justify-between items-start">
                        <p className="text-sm text-muted-foreground">ยอดขายรวม (สุทธิ)</p>
                        <DollarSign className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-4xl font-bold">฿{(stats.totalSales || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-4 pt-4 border-t">
                    <div>
                        <div className="flex justify-between items-start">
                           <p className="text-sm text-muted-foreground">กำไรขั้นต้นรวม</p>
                           <DollarSign className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <p className="text-lg font-semibold text-green-600">฿{(stats.totalGrossProfit || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                    <div>
                        <div className="flex justify-between items-start">
                            <p className="text-sm text-muted-foreground">อัตรากำไรขั้นต้น</p>
                            <Percent className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <p className="text-lg font-semibold">{(stats.grossMarginRate || 0).toFixed(2)}%</p>
                    </div>
                    <div>
                       <div className="flex justify-between items-start">
                           <p className="text-sm text-muted-foreground">คำสั่งซื้อ</p>
                           <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                       </div>
                        <p className="text-lg font-semibold">{(stats.salesGeneratingOrdersCount || 0).toLocaleString('th-TH')} รายการ</p>
                        <p className="text-xs text-muted-foreground">(ที่สร้างยอดขาย)</p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

function MonthlyOverviewChart({ data, isLoading, dateRange }: { data: MonthlyData[] | null, isLoading: boolean, dateRange: string }) {
  const chartConfig = {
    sales: { label: 'ยอดขาย', color: 'hsl(var(--chart-4))' },
    cost: { label: 'ต้นทุน', color: 'hsl(var(--primary))' },
    profit: { label: 'กำไร', color: 'hsl(var(--chart-2))' },
    orders: { label: 'คำสั่งซื้อ', color: 'hsl(var(--chart-3))' },
  } satisfies ChartConfig;

  if (isLoading && !data) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-7 w-48" /><Skeleton className="h-4 w-64" /></CardHeader>
        <CardContent><Skeleton className="h-72 w-full" /></CardContent>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>ภาพรวมยอดขายและกำไร 12 เดือนล่าสุด</CardTitle>
        <CardDescription>ข้อมูลระหว่าง: {dateRange}</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-72 w-full">
          <ComposedChart data={data}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="month" tickLine={false} tickMargin={10} axisLine={false} />
            <YAxis
              yAxisId="left"
              tickFormatter={(value) => `฿${value.toLocaleString()}`}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <ChartTooltip
              content={<ChartTooltipContent
                labelFormatter={(label, payload) => {
                  if (payload && payload.length > 0 && payload[0].payload.monthKey) {
                    const date = new Date(payload[0].payload.monthKey);
                    return format(date, "MMMM ", { locale: th }) + (date.getFullYear() + 543);
                  }
                  return label;
                }}
              />}
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Line dataKey="sales" yAxisId="left" stroke="none" dot={false} activeDot={false} legendType="none" />
            <Bar dataKey="cost" stackId="a" fill="var(--color-cost)" radius={[0, 0, 4, 4]} yAxisId="left" />
            <Bar dataKey="profit" stackId="a" fill="var(--color-profit)" radius={[4, 4, 0, 0]} yAxisId="left" />
            <Line type="monotone" dataKey="orders" stroke="var(--color-orders)" yAxisId="right" strokeWidth={2} dot={{ r: 4 }} />
          </ComposedChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

function CriticalAlerts({ stockAlerts, branchAlerts, isLoading }: { stockAlerts: any[], branchAlerts: any[], isLoading: boolean }) {
  if (isLoading && stockAlerts.length === 0 && branchAlerts.length === 0) return <Skeleton className="h-48 w-full mb-6" />;
  if (stockAlerts.length === 0 && branchAlerts.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
      {stockAlerts.length > 0 && (
        <Alert variant="destructive" className="bg-destructive/10 border-destructive/30">
          <Boxes className="h-4 w-4" />
          <AlertTitle className="font-bold flex items-center justify-between">
            สินค้าสต็อกต่ำ ({stockAlerts.length} รายการ)
            <Link href="/dashboard/products" className="text-xs underline hover:text-destructive">จัดการคลังสินค้า</Link>
          </AlertTitle>
          <AlertDescription className="mt-2 space-y-1">
            {stockAlerts.slice(0, 3).map((item, idx) => {
              const attrValues = Object.values(item.attributes || {});
              const attrString = attrValues.length > 0 ? ` (${attrValues.join('/')})` : '';
              return (
                <p key={idx} className="text-xs truncate">
                  • {item.productName}{attrString} - เหลือ {item.stock} ชิ้น
                </p>
              );
            })}
            {stockAlerts.length > 3 && <p className="text-[10px] opacity-70">และรายการอื่นๆ อีก {stockAlerts.length - 3} รายการ</p>}
          </AlertDescription>
        </Alert>
      )}

      {branchAlerts.length > 0 && (
        <Alert variant="default" className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 text-amber-900 dark:text-amber-200">
          <Zap className="h-4 w-4 text-amber-600" />
          <AlertTitle className="font-bold flex items-center justify-between">
            สาขาที่เสี่ยงจะเลิกซื้อ ({branchAlerts.length} สาขา)
            <Link href="/dashboard/branch-insights" className="text-xs underline hover:text-amber-800">วิเคราะห์สาขา</Link>
          </AlertTitle>
          <AlertDescription className="mt-2 space-y-1">
            {branchAlerts.slice(0, 3).map((b, idx) => (
              <p key={idx} className="text-xs truncate">
                • {b.branchName} - ขาดการสั่งซื้อมา {b.inactivityDays} วัน
              </p>
            ))}
            {branchAlerts.length > 3 && <p className="text-[10px] opacity-70">และรายการอื่นๆ อีก {branchAlerts.length - 3} สาขา</p>}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function TopSpendersCard({ topSpenders, isLoading }: { topSpenders: TopSpender[] | null, isLoading: boolean }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-muted-foreground"/> ลูกค้าชั้นดี</CardTitle>
        <CardDescription>10 อันดับแรกที่มียอดใช้จ่ายสูงสุด</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && !topSpenders ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="flex-1 space-y-1"><Skeleton className="h-4 w-2/4" /><Skeleton className="h-3 w-3/4" /></div>
                <Skeleton className="h-5 w-1/4" />
              </div>
            ))}
          </div>
        ) : !topSpenders || topSpenders.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">ยังไม่มีข้อมูลลูกค้า</p>
        ) : (
          <div className="space-y-6">
            {topSpenders.map((user) => (
              <div key={user.userId} className="flex items-center gap-4">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={`https://avatar.vercel.sh/${user.email}.png`} alt={user.name} />
                  <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 truncate">
                  <p className="text-sm font-medium leading-none truncate">{user.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                </div>
                <div className="font-medium text-sm whitespace-nowrap">
                  ฿{user.totalSpent.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function DashboardOverview() {
  const [activeTab, setActiveTab] = useState('overview');
  
  // Persistent cache for Monthly Report tab to prevent blank screen on tab switch
  const [monthlyReportCache, setMonthlyReportCache] = useState<Record<string, any>>({});

  const handleMonthlyCacheUpdate = useCallback((month: string, data: any) => {
    setMonthlyReportCache(prev => ({ ...prev, [month]: data }));
  }, []);

  // Combined Fetcher for Dashboard
  const fetchDashboardData = useCallback(async () => {
    const [s, m, ts, stock, branchData, expiring, deposits] = await Promise.all([
      getDashboardStats(),
      getMonthlySalesData(),
      getTopSpenders(),
      getInventoryAlerts(),
      getBranchInsightsData(),
      getExpiringBranches(),
      getDepositRefundAlerts()
    ]);
    
    // Smart Status Logic for Branch Health
    const criticalBranches = branchData.filter((i: any) => {
      const inactivity = i.inactivityDays;
      const avgCycle = i.averageCycleDays;
      if (inactivity === null) return false;
      let criticalThreshold = 30;
      if (avgCycle && avgCycle > 0) criticalThreshold = Math.max(14, avgCycle * 2);
      return inactivity > criticalThreshold;
    });

    return {
      stats: s,
      monthlyChartData: m,
      topSpenders: ts as TopSpender[],
      stockAlerts: stock,
      branchAlerts: criticalBranches,
      expiringBranches: expiring,
      depositAlerts: deposits
    };
  }, []);

  const { 
    data, 
    isLoading, 
    isRefreshing, 
    isAuto, 
    badgeCount,
    setAuto, 
    refresh 
  } = useSmartFetch<any>({
    key: 'admin-dashboard-overview',
    fetcher: fetchDashboardData,
    localStorageKey: 'auto-refresh-dashboard',
    watchPath: 'orders' // Watch for any new orders as dashboard activity indicator
  });

  const dateRange = useMemo(() => {
    const endDate = new Date();
    const startDate = subMonths(endDate, 11);
    const formatOptions = { locale: th };
    const end = endOfMonth(endDate);
    const start = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const formattedEndDate = format(end, 'd MMMM ', formatOptions) + (end.getFullYear() + 543);
    const formattedStartDate = format(start, 'd MMMM ', formatOptions) + (start.getFullYear() + 543);
    return `${formattedStartDate} - ${formattedEndDate}`;
  }, []);

  const handleRefresh = () => {
    if (activeTab === 'overview') {
      refresh();
    } else {
      const refreshEvent = new CustomEvent('refreshMonthlyReport');
      window.dispatchEvent(refreshEvent);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full sm:w-auto">
          <TabsList>
            <TabsTrigger value="overview">ภาพรวม</TabsTrigger>
            <TabsTrigger value="monthly">ยอดขายรายเดือน</TabsTrigger>
          </TabsList>
        </Tabs>
        
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2 px-3 bg-muted/30 rounded-md h-10 border border-muted-foreground/10 flex-1 sm:flex-none">
            <Switch 
              id="auto-refresh-dashboard" 
              checked={isAuto} 
              onCheckedChange={setAuto} 
            />
            <Label htmlFor="auto-refresh-dashboard" className="text-[10px] font-bold cursor-pointer whitespace-nowrap">รีเฟรชอัตโนมัติ</Label>
          </div>
          <SmartRefreshButton 
            refresh={handleRefresh}
            isRefreshing={isRefreshing}
            badgeCount={badgeCount}
          />
        </div>
      </div>

      <div className={cn("mt-4 transition-opacity duration-300", isRefreshing && "opacity-60")}>
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {isLoading && !isRefreshing ? (
              <div className="space-y-6">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-[400px] w-full" />
              </div>
            ) : (
              <>
                <DepositRefundAlerts alerts={data?.depositAlerts || []} isLoading={isLoading && !isRefreshing} />
                <ContractAlerts branches={data?.expiringBranches || []} isLoading={isLoading && !isRefreshing} />
                
                <CriticalAlerts stockAlerts={data?.stockAlerts || []} branchAlerts={data?.branchAlerts || []} isLoading={isLoading && !isRefreshing} />
                
                <MonthlyOverviewChart data={data?.monthlyChartData || null} isLoading={isLoading && !isRefreshing} dateRange={dateRange} />

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                  <div className="lg:col-span-2">
                    {data?.stats && (
                      <OverallSummaryCard stats={data.stats} dateRange={dateRange} />
                    )}
                  </div>
                  <div className="lg:col-span-1">
                    <TopSpendersCard topSpenders={data?.topSpenders || null} isLoading={isLoading && !isRefreshing} />
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'monthly' && (
          <MonthlyReport 
            cache={monthlyReportCache} 
            onCacheUpdate={handleMonthlyCacheUpdate} 
          />
        )}
      </div>
    </div>
  );
}
