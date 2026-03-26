
'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { getBranchInsightsData } from '@/app/actions';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BranchInsightsTable } from '@/components/dashboard/branch-insights-table';
import { BranchDistributionSummary } from '@/components/dashboard/branch-distribution-summary';
import { BranchDistributionTable } from '@/components/dashboard/branch-distribution-table';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { BarChart3, RotateCw, Search, Map as MapIcon, Table as TableIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useSmartFetch } from '@/hooks/use-smart-fetch';

// Force dynamic rendering to prevent build failures on App Hosting
export const dynamic = 'force-dynamic';

export default function BranchInsightsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  
  const [searchTerm, setSearchTerm] = useState('');

  // Granular Permission Check
  const canViewInsights = useMemo(() => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    const perms = user.permissions || [];
    return perms.includes('revenue:view') || perms.includes('revenue:manage') || perms.includes('view_revenue');
  }, [user]);

  // Use Centralized Hook
  const { 
    data: insightsData, 
    isLoading, 
    isRefreshing, 
    isAuto, 
    setAuto, 
    refresh 
  } = useSmartFetch<any[]>({
    key: 'branch-insights-data',
    fetcher: getBranchInsightsData,
    localStorageKey: 'auto-refresh-insights'
  });

  const insights = insightsData || [];

  useEffect(() => {
    if (!authLoading) {
      if (!user || !canViewInsights) {
        router.replace('/dashboard/orders');
      }
    }
  }, [user, authLoading, router, canViewInsights]);

  const filteredInsights = insights.filter(i => 
    (i.branchName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (i.branchCode || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (i.ownerName || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (authLoading || !user || !canViewInsights) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold flex items-center gap-3">
            <BarChart3 className="h-8 w-8 text-primary" />
            วิเคราะห์พฤติกรรมสาขา
          </h1>
          <p className="text-muted-foreground mt-1">
            ติดตามสถานะสุขภาพและการกระจายตัวของตลาดสาขาทั่วประเทศ
          </p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2 px-3 bg-muted/30 rounded-md h-10 border border-muted-foreground/10 flex-1 sm:flex-none">
            <Switch 
              id="auto-refresh-insights" 
              checked={isAuto} 
              onCheckedChange={setAuto} 
            />
            <Label htmlFor="auto-refresh-insights" className="text-[10px] font-bold cursor-pointer whitespace-nowrap">รีเฟรชอัตโนมัติ</Label>
          </div>
          <Button variant="outline" size="icon" onClick={() => refresh()} disabled={isRefreshing} className="h-10 w-10 shrink-0" title="รีเฟรชข้อมูล">
            <RotateCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
          </Button>
        </div>
      </div>

      <Tabs defaultValue="distribution" className="space-y-8">
        <div className="flex justify-center border-b pb-1">
          <TabsList className="bg-transparent gap-8 h-auto p-0">
            <TabsTrigger 
              value="distribution" 
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 pb-2 font-bold text-base transition-all"
            >
              <MapIcon className="mr-2 h-4 w-4" />
              การกระจายตัวของตลาด
            </TabsTrigger>
            <TabsTrigger 
              value="health" 
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 pb-2 font-bold text-base transition-all"
            >
              <TableIcon className="mr-2 h-4 w-4" />
              สถานะสุขภาพสาขา
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="distribution" className="space-y-12 animate-in fade-in duration-500">
          {isLoading && !isRefreshing ? (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4"><Skeleton className="h-32 w-full" /></div>
              <div className="grid grid-cols-5 gap-6"><Skeleton className="col-span-3 h-[400px] w-full" /><Skeleton className="col-span-2 h-[400px] w-full" /></div>
            </div>
          ) : (
            <>
              <BranchDistributionSummary insights={insights} />
              <div className="pt-4">
                <BranchDistributionTable insights={insights} />
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="health" className="space-y-6 animate-in fade-in duration-500">
          <div className="flex flex-col sm:flex-row justify-between items-end gap-4">
            <div className="relative w-full sm:w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="ค้นหาชื่อสาขา, รหัส หรือเจ้าของ..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-11 shadow-sm bg-white dark:bg-card"
              />
            </div>
          </div>

          {isLoading && !isRefreshing ? (
            <div className="space-y-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : (
            <BranchInsightsTable data={filteredInsights} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
