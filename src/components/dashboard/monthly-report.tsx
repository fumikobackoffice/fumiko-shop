
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '../ui/skeleton';
import { getMonthlyReportData } from '@/app/actions';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { format, subMonths, eachMonthOfInterval } from 'date-fns';
import { th } from 'date-fns/locale';
import { Bar, ComposedChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from '@/components/ui/chart';
import { AlertTriangle, Trophy, Medal, Award } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type DailyData = { day: string; date: string; sales: number; orders: number; };
type TopDay = { dayName: string; dayIndex: number; orders: number; };
type TopSpender = {
  userId: string;
  name: string;
  email: string;
  totalSpent: number;
};
type SoldProduct = {
    id: string;
    quantity: number;
    totalProfit: number;
    name: string;
    sku: string;
    imageUrl?: string;
};
type SummaryData = {
    totalSales: number;
    totalProfit: number;
    totalCost: number;
    profitMargin: number;
    totalOrders: number;
};
type MonthlyReportData = { 
    summary: SummaryData;
    dailyData: DailyData[]; 
    topDays: TopDay[];
    topSpenders: TopSpender[];
    topProfitableProducts: SoldProduct[];
    bestSellingProducts: SoldProduct[];
};

const chartConfig = {
  sales: {
    label: "ยอดขาย",
    color: "hsl(var(--chart-1))",
  },
  orders: {
    label: "คำสั่งซื้อ",
    color: "hsl(var(--chart-2))",
  },
} satisfies ChartConfig;

const dayOfWeekIcons = [
    { icon: Trophy, color: 'text-yellow-400' },
    { icon: Medal, color: 'text-slate-400' },
    { icon: Award, color: 'text-orange-400' },
];

function MonthlySummaryCard({ data }: { data: SummaryData }) {
    return (
        <Card className="h-full">
            <CardHeader>
                <CardTitle>สรุปข้อมูลเดือน</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                <div>
                    <p className="text-sm text-muted-foreground">ยอดขายรวม</p>
                    <p className="text-4xl font-bold">฿{data.totalSales.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <div className="grid grid-cols-2 gap-x-8 gap-y-4 pt-4 border-t">
                    <div>
                        <p className="text-sm text-muted-foreground">กำไร</p>
                        <p className="text-lg font-semibold text-green-600">฿{data.totalProfit.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                    <div>
                        <p className="text-sm text-muted-foreground">อัตรากำไร</p>
                        <p className="text-lg font-semibold">{data.profitMargin.toFixed(1)}%</p>
                    </div>
                    <div>
                        <p className="text-sm text-muted-foreground">ต้นทุน</p>
                        <p className="text-lg font-semibold">฿{data.totalCost.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                    <div>
                        <p className="text-sm text-muted-foreground">คำสั่งซื้อ</p>
                        <p className="text-lg font-semibold">{data.totalOrders} รายการ</p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

function MonthlyChart({ data }: { data: DailyData[] }) {
    return (
        <ChartContainer config={chartConfig} className="h-[350px] w-full">
            <ComposedChart data={data}>
                <CartesianGrid vertical={false} />
                <XAxis 
                  dataKey="day" 
                  tickLine={false} 
                  tickMargin={10} 
                  axisLine={false} 
                  tick={{ fontSize: 12 }}
                />
                <YAxis 
                  yAxisId="left" 
                  orientation="left" 
                  stroke="hsl(var(--foreground))"
                  tickLine={false} 
                  axisLine={false} 
                  tickFormatter={(value) => `฿${value.toLocaleString()}`} 
                />
                <YAxis 
                  yAxisId="right" 
                  orientation="right"
                  stroke="hsl(var(--foreground))"
                  tickLine={false} 
                  axisLine={false} 
                  allowDecimals={false}
                />
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent indicator="dot" />}
                />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="sales" fill="var(--color-sales)" radius={4} yAxisId="left" />
                <Line type="monotone" dataKey="orders" stroke="var(--color-orders)" yAxisId="right" strokeWidth={2} dot={{r: 3}}/>
            </ComposedChart>
        </ChartContainer>
    );
}

function TopDaysCard({ data }: { data?: TopDay[] }) {
    const safeData = data || [];
    return (
        <Card>
            <CardHeader>
                <CardTitle>วันยอดนิยมประจำเดือน</CardTitle>
                <CardDescription>เรียงลำดับวันในสัปดาห์ที่มียอดสั่งซื้อสูงสุด</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
                {safeData.length > 0 ? safeData.map((day, index) => {
                    const Icon = index < 3 ? dayOfWeekIcons[index].icon : null;
                    const color = index < 3 ? dayOfWeekIcons[index].color : '';
                    return (
                        <div key={day.dayIndex ?? index} className="flex items-center justify-between rounded-md bg-muted/50 p-3">
                            <div className="flex items-center gap-3">
                                {Icon ? (
                                    <Icon className={cn("h-5 w-5", color)} />
                                ) : (
                                    <span className="flex h-5 w-5 items-center justify-center font-bold text-muted-foreground">{index + 1}</span>
                                )}
                                <span className="font-medium">{day.dayName}</span>
                            </div>
                            <span className="font-bold">{day.orders} ออเดอร์</span>
                        </div>
                    );
                }) : <p className="text-center text-muted-foreground py-4">ไม่มีข้อมูลคำสั่งซื้อในเดือนนี้</p>}
            </CardContent>
        </Card>
    );
}

function TopSpendersOfMonthCard({ data }: { data: TopSpender[] }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>ลูกค้าประจำเดือน</CardTitle>
                <CardDescription>10 อันดับแรกที่มียอดใช้จ่ายสูงสุดในเดือนที่เลือก</CardDescription>
            </CardHeader>
            <CardContent>
                {data && data.length > 0 ? (
                    <div className="space-y-6">
                        {data.map((user, index) => (
                            <div key={user.userId || index} className="flex items-center gap-4">
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
                ) : <p className="text-sm text-muted-foreground text-center py-4">ยังไม่มีข้อมูลลูกค้าในเดือนนี้</p>}
            </CardContent>
        </Card>
    );
}

function TopProfitableProductsCard({ data }: { data: SoldProduct[] }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>สินค้าทำกำไรสูงสุด (Top 5)</CardTitle>
                <CardDescription>5 อันดับสินค้าที่สร้างกำไรสูงสุดในเดือนที่เลือก</CardDescription>
            </CardHeader>
            <CardContent>
                 {data && data.length > 0 ? (
                    <div className="space-y-4">
                        {data.map((product, index) => (
                            <div key={product.id || index} className="flex items-center gap-4">
                                <div className="flex-1 truncate">
                                    <p className="text-sm font-medium leading-none truncate">{product.name}</p>
                                    <p className="text-xs text-muted-foreground truncate">SKU: {product.sku}</p>
                                </div>
                                <div className="font-medium text-sm whitespace-nowrap text-green-600">
                                    + ฿{product.totalProfit.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : <p className="text-sm text-muted-foreground text-center py-4">ยังไม่มีข้อมูลกำไรในเดือนนี้</p>}
            </CardContent>
        </Card>
    );
}

function BestSellingProductsCard({ data }: { data: SoldProduct[] }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>สินค้าขายดี (ตามจำนวน)</CardTitle>
                <CardDescription>รายการสินค้าทั้งหมดที่ขายในเดือนนี้ เรียงตามจำนวนที่ขายได้</CardDescription>
            </CardHeader>
            <CardContent>
                {data && data.length > 0 ? (
                    <div className="max-h-96 overflow-y-auto pr-2">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>สินค้า</TableHead>
                                    <TableHead className="text-right">จำนวน (ชิ้น)</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data.map((product, index) => (
                                    <TableRow key={product.id || index}>
                                        <TableCell>
                                            <p className="font-medium truncate">{product.name}</p>
                                            <p className="text-xs text-muted-foreground">SKU: {product.sku}</p>
                                        </TableCell>
                                        <TableCell className="text-right font-bold">{product.quantity}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                ) : <p className="text-sm text-muted-foreground text-center py-4">ยังไม่มีสินค้าที่ขายในเดือนนี้</p>}
            </CardContent>
        </Card>
    );
}


export function MonthlyReport({ cache, onCacheUpdate }: { cache: Record<string, MonthlyReportData>, onCacheUpdate: (month: string, data: MonthlyReportData) => void }) {
    const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const availableMonths = useMemo(() => {
        const end = new Date();
        const start = subMonths(end, 11);
        return eachMonthOfInterval({ start, end }).map(date => ({
            value: format(date, 'yyyy-MM'),
            label: format(date, 'MMMM ', { locale: th }) + (date.getFullYear() + 543),
        })).reverse();
    }, []);

    const fetchData = useCallback(async (isManual = false) => {
        if (!isManual && cache[selectedMonth]) {
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            const date = new Date(selectedMonth + '-02');
            const data = await getMonthlyReportData(date.toISOString());
            onCacheUpdate(selectedMonth, data as MonthlyReportData);
        } catch (e: any) {
            setError(e.message || 'เกิดข้อผิดพลาดในการโหลดข้อมูล');
        } finally {
            setIsLoading(false);
        }
    }, [selectedMonth, cache, onCacheUpdate]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        const handleRefresh = () => fetchData(true);
        window.addEventListener('refreshMonthlyReport', handleRefresh);
        return () => window.removeEventListener('refreshMonthlyReport', handleRefresh);
    }, [fetchData]);
    
    const selectedMonthLabel = availableMonths.find(m => m.value === selectedMonth)?.label || '';
    const reportData = cache[selectedMonth];

    const renderSkeletons = () => (
        <div className="space-y-6">
            <Card>
                <CardHeader><Skeleton className="h-6 w-1/3" /><Skeleton className="h-4 w-1/4" /></CardHeader>
                <CardContent><Skeleton className="h-[350px] w-full" /></CardContent>
            </Card>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card><CardHeader><Skeleton className="h-6 w-2/3" /><Skeleton className="h-4 w-1/2" /></CardHeader><CardContent className="space-y-4"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></CardContent></Card>
                <Card><CardHeader><Skeleton className="h-6 w-2/3" /><Skeleton className="h-4 w-1/2" /></CardHeader><CardContent className="space-y-4"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></CardContent></Card>
                <Card><CardHeader><Skeleton className="h-6 w-1/3" /></CardHeader><CardContent><Skeleton className="h-48 w-full" /></CardContent></Card>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                 <Card className="lg:col-span-1"><CardHeader><Skeleton className="h-6 w-1/3" /><Skeleton className="h-4 w-1/2" /></CardHeader><CardContent className="space-y-4"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></CardContent></Card>
                 <Card className="lg:col-span-1"><CardHeader><Skeleton className="h-6 w-1/3" /></CardHeader><CardContent><Skeleton className="h-48 w-full" /></CardContent></Card>
            </div>
        </div>
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">รายงานยอดขายรายเดือน</h2>
                    <p className="text-muted-foreground">ข้อมูลเดือน {selectedMonthLabel}</p>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                        <SelectTrigger className="w-full sm:w-[200px]">
                            <SelectValue placeholder="เลือกเดือน" />
                        </SelectTrigger>
                        <SelectContent>
                            {availableMonths.map(month => (
                                <SelectItem key={month.value} value={month.value}>{month.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>
            
            {isLoading && !reportData ? (
                renderSkeletons()
            ) : error ? (
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>เกิดข้อผิดพลาด</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            ) : reportData ? (
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                        <CardTitle>ภาพรวมยอดขายและคำสั่งซื้อ</CardTitle>
                        <CardDescription>ข้อมูลเดือน {selectedMonthLabel}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <MonthlyChart data={reportData.dailyData} />
                        </CardContent>
                    </Card>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <MonthlySummaryCard data={reportData.summary} />
                        <TopDaysCard data={reportData.topDays} />
                        <TopProfitableProductsCard data={reportData.topProfitableProducts} />
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <TopSpendersOfMonthCard data={reportData.topSpenders} />
                        <BestSellingProductsCard data={reportData.bestSellingProducts} />
                    </div>
                </div>
            ) : null}
        </div>
    );
}
