
'use client';

import { ServiceCategoryManager } from '@/components/dashboard/service-category-manager';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { useSmartFetch } from '@/hooks/use-smart-fetch';
import { getServiceCategories } from '@/app/actions';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { RotateCw, Network } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ServiceCategory } from '@/lib/types';
import { SmartRefreshButton } from '@/components/dashboard/smart-refresh-button';

export default function ServiceCategoriesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Granular Permission Check
  const canViewInventory = useMemo(() => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    const perms = user.permissions || [];
    return perms.includes('inventory:view') || perms.includes('inventory:manage') || perms.includes('manage_inventory');
  }, [user]);

  // Use Centralized Hook
  const { 
    data: categories, 
    isLoading, 
    isRefreshing, 
    isAuto, 
    badgeCount,
    setAuto, 
    refresh 
  } = useSmartFetch<ServiceCategory[]>({
    key: 'service-categories-data',
    fetcher: getServiceCategories,
    localStorageKey: 'auto-refresh-service-categories',
    watchPath: 'serviceCategories'
  });

  useEffect(() => {
    if (!loading && user && !canViewInventory) {
      router.replace('/dashboard');
    }
  }, [user, loading, router, canViewInventory]);

  if (loading || !user || !canViewInventory) {
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
            <Network className="h-8 w-8 text-primary" />
            จัดการหมวดหมู่บริการ
          </h1>
          <p className="text-muted-foreground mt-1">โครงสร้างหมวดหมู่แบบลำดับชั้นสำหรับจัดกลุ่มงานบริการ</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2 px-3 bg-muted/30 rounded-md h-10 border border-muted-foreground/10 flex-1 sm:flex-none">
            <Switch 
              id="auto-refresh-service-categories" 
              checked={isAuto} 
              onCheckedChange={setAuto} 
            />
            <Label htmlFor="auto-refresh-service-categories" className="text-[10px] font-bold cursor-pointer whitespace-nowrap">รีเฟรชอัตโนมัติ</Label>
          </div>
          <SmartRefreshButton 
            refresh={refresh}
            isRefreshing={isRefreshing}
            badgeCount={badgeCount}
          />
        </div>
      </div>

      <div className={cn("transition-opacity duration-300", isRefreshing && "opacity-60")}>
        <ServiceCategoryManager 
          categories={categories || []} 
          isLoading={isLoading && !isRefreshing} 
          onRefresh={() => refresh(true)}
        />
      </div>
    </div>
  );
}
