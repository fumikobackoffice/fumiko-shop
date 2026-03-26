
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { getInventoryLedger } from '@/app/actions';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { InventoryLedgerTable } from '@/components/dashboard/inventory-ledger-table';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { History, RotateCw, Search, Calendar } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, subMonths, eachMonthOfInterval } from 'date-fns';
import { th } from 'date-fns/locale';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useSmartFetch } from '@/hooks/use-smart-fetch';

export default function InventoryLedgerPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), 'yyyy-MM'));

  // Granular Permission Check
  const canViewInventory = useMemo(() => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    const perms = user.permissions || [];
    return perms.includes('inventory:view') || perms.includes('inventory:manage') || perms.includes('manage_inventory');
  }, [user]);

  // Generate last 12 months options
  const monthOptions = useMemo(() => {
    const end = new Date();
    const start = subMonths(end, 11);
    const months = eachMonthOfInterval({ start, end });
    return months.map(date => ({
      value: format(date, 'yyyy-MM'),
      label: format(date, 'MMMM ', { locale: th }) + (date.getFullYear() + 543)
    })).reverse();
  }, []);

  // Use Centralized Hook with Dynamic Key per month
  const { 
    data: ledger, 
    isLoading, 
    isRefreshing, 
    isAuto, 
    setAuto, 
    refresh 
  } = useSmartFetch<any[]>({
    key: `inventory-ledger-${selectedMonth}`,
    fetcher: useCallback(() => getInventoryLedger(selectedMonth), [selectedMonth]),
    localStorageKey: 'auto-refresh-ledger'
  });

  const ledgerList = ledger || [];

  useEffect(() => {
    if (!authLoading) {
      if (!user || !canViewInventory) {
        router.replace('/dashboard');
      }
    }
  }, [user, authLoading, router, canViewInventory]);

  const filteredLedger = useMemo(() => {
    if (!searchTerm.trim()) return ledgerList;
    const s = searchTerm.toLowerCase();
    return ledgerList.filter(item => 
      item.productName.toLowerCase().includes(s) ||
      item.sku.toLowerCase().includes(s) ||
      item.reason.toLowerCase().includes(s) ||
      item.adminName?.toLowerCase().includes(s)
    );
  }, [ledgerList, searchTerm]);

  if (authLoading || !user || !canViewInventory) {
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
            <History className="h-8 w-8 text-primary" />
            สมุดรายวันคลังสินค้า
          </h1>
          <p className="text-muted-foreground">
            ติดตามประวัติการเคลื่อนไหวของสต็อกสินค้าแบบ Statement แยกตามเดือน
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 bg-muted/30 rounded-md h-10 border border-muted-foreground/10 flex-1 sm:flex-none">
                <Switch 
                  id="auto-refresh-ledger" 
                  checked={isAuto} 
                  onCheckedChange={setAuto} 
                />
                <Label htmlFor="auto-refresh-ledger" className="text-[10px] font-bold cursor-pointer whitespace-nowrap">รีเฟรชอัตโนมัติ</Label>
              </div>
              <Button variant="outline" size="icon" onClick={() => refresh()} disabled={isRefreshing} className="h-10 w-10 shrink-0" title="รีเฟรชข้อมูล">
                  <RotateCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
              </Button>
            </div>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-full sm:w-[200px] h-10 bg-white dark:bg-background">
                    <Calendar className="mr-2 h-4 w-4 text-muted-foreground" />
                    <SelectValue placeholder="เลือกเดือน" />
                </SelectTrigger>
                <SelectContent>
                    {monthOptions.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
      </div>

      <Card className="bg-primary/5 border-primary/20 shadow-sm">
        <CardContent className="pt-6">
            <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="ค้นหาชื่อสินค้า, SKU, เหตุผล หรือพนักงาน..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 bg-white dark:bg-background h-10"
                />
            </div>
        </CardContent>
      </Card>

      {isLoading && !isRefreshing ? (
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-[500px] w-full" />
        </div>
      ) : (
        <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
                <p className="text-sm font-medium text-muted-foreground">
                    พบ {filteredLedger.length} รายการในเดือน {monthOptions.find(m => m.value === selectedMonth)?.label}
                </p>
            </div>
            <InventoryLedgerTable data={filteredLedger} />
        </div>
      )}
    </div>
  );
}
