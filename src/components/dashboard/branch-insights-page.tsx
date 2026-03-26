'use client';

import { useEffect, useState } from 'react';
import { getBranchInsightsData } from '@/app/actions';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BranchInsightsTable } from '@/components/dashboard/branch-insights-table';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { BarChart3, Info, RotateCw, Search, Zap } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export default function BranchInsightsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [insights, setInsights] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchInsights = async (manual = false) => {
    if (manual) setIsRefreshing(true);
    else setIsLoading(true);
    
    try {
      const data = await getBranchInsightsData();
      setInsights(data);
      if (manual) toast({ title: 'อัปเดตข้อมูลการวิเคราะห์แล้ว' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'เกิดข้อผิดพลาด', description: error.message });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      if (!user || !['super_admin', 'admin'].includes(user.role)) {
        router.replace('/dashboard/orders');
      } else {
        fetchInsights();
      }
    }
  }, [user, authLoading, router]);

  const filteredInsights = insights.filter(i => 
    i.branchName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    i.branchCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
    i.ownerName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Smart Count Logic - Aligned with Table View
  const getSmartStatus = (inactivity: number | null, avgCycle: number | null) => {
    if (inactivity === null) return 'critical';
    let warnThreshold = 14;
    let criticalThreshold = 30;
    if (avgCycle && avgCycle > 0) {
        warnThreshold = Math.max(7, avgCycle + 2);
        criticalThreshold = Math.max(14, avgCycle * 2);
    }
    if (inactivity < warnThreshold) return 'active';
    if (inactivity <= criticalThreshold) return 'at-risk';
    return 'critical';
  };

  const activeCount = insights.filter(i => getSmartStatus(i.inactivityDays, i.averageCycleDays) === 'active').length;
  const atRiskCount = insights.filter(i => getSmartStatus(i.inactivityDays, i.averageCycleDays) === 'at-risk').length;
  const criticalCount = insights.filter(i => getSmartStatus(i.inactivityDays, i.averageCycleDays) === 'critical').length;

  if (authLoading || !user || !['super_admin', 'admin'].includes(user.role)) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold flex items-center gap-3">
            <BarChart3 className="h-8 w-8 text-primary" />
            วิเคราะห์พฤติกรรมสาขา
          </h1>
          <p className="text-muted-foreground flex items-center gap-1.5">
            ติดตามความถี่ในการสั่งซื้อและสุขภาพของแต่ละสาขา
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold cursor-help">
                            <Zap className="h-3 w-3 fill-current" /> SMART LOGIC ACTIVE
                        </span>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p className="text-xs max-w-xs">ระบบคำนวณสถานะความเสี่ยงโดยเปรียบเทียบจากรอบการสั่งซื้อปกติของแต่ละสาขาโดยเฉพาะ (Personalized Order Cycle)</p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
          </p>
        </div>
        <Button variant="outline" onClick={() => fetchInsights(true)} disabled={isRefreshing}>
          <RotateCw className={cn("mr-2 h-4 w-4", isRefreshing && "animate-spin")} />
          รีเฟรชข้อมูล
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-primary/5 border-primary/20 shadow-sm">
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                    สาขาที่ปกติ (Active)
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="text-3xl font-bold text-primary">{activeCount}</div>
                <p className="text-xs text-muted-foreground mt-1">สั่งซื้อสม่ำเสมอตามรอบปกติ</p>
            </CardContent>
        </Card>
        <Card className="bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800/50 shadow-sm">
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-yellow-500" />
                    เริ่มขาดการสั่ง (At Risk)
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="text-3xl font-bold text-yellow-600">{atRiskCount}</div>
                <p className="text-xs text-muted-foreground mt-1">เริ่มสั่งช้ากว่ารอบปกติที่เคยสั่ง</p>
            </CardContent>
        </Card>
        <Card className="bg-red-50 dark:bg-destructive/10 border-red-200 dark:border-destructive/30 shadow-sm">
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-destructive" />
                    ขาดการสั่งซื้อนาน (Critical)
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="text-3xl font-bold text-destructive">{criticalCount}</div>
                <p className="text-xs text-muted-foreground mt-1">ไม่สั่งซื้อเกิน 2 เท่าของรอบปกติ</p>
            </CardContent>
        </Card>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="ค้นหาชื่อสาขา, รหัส หรือเจ้าของ..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9 max-w-md h-11"
        />
      </div>

      {isLoading && !isRefreshing ? (
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <BranchInsightsTable data={filteredInsights} />
      )}
    </div>
  );
}
