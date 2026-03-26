'use client';

import { StoreSettingsForm } from '@/components/dashboard/store-settings-form';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PaymentSettings } from '@/components/dashboard/payment-settings';
import { GlobalPointsManager } from '@/components/dashboard/global-points-manager';
import { useSmartFetch } from '@/hooks/use-smart-fetch';
import { getStoreSettings } from '@/app/actions';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { RotateCw, Settings, Ticket } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StoreSettings as StoreSettingsType } from '@/lib/types';

export default function SettingsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Granular Permission Checks
  const canViewSystem = useMemo(() => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    const perms = user.permissions || [];
    return perms.includes('system:view') || perms.includes('system:manage') || perms.includes('manage_system');
  }, [user]);

  const isReadOnly = useMemo(() => {
    if (!user) return true;
    if (user.role === 'super_admin') return false;
    
    const perms = user.permissions || [];
    const hasManagePermission = perms.includes('system:manage') || perms.includes('manage_system');
    return !hasManagePermission;
  }, [user]);

  // Use Centralized Hook
  const { 
    data: storeSettings, 
    isLoading, 
    isRefreshing, 
    isAuto, 
    setAuto, 
    refresh 
  } = useSmartFetch<StoreSettingsType | null>({
    key: 'store-settings-data',
    fetcher: getStoreSettings,
    localStorageKey: 'auto-refresh-settings'
  });

  // Protect access
  useEffect(() => {
    if (!loading && user && !canViewSystem) {
      router.replace('/dashboard');
    }
  }, [user, loading, router, canViewSystem]);

  if (loading || !user || !canViewSystem) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  const isSuperAdmin = user.role === 'super_admin';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold flex items-center gap-3">
            <Settings className="h-8 w-8 text-primary" />
            ตั้งค่าระบบ
          </h1>
          <p className="text-muted-foreground mt-1">กำหนดค่าพื้นฐาน ภาษี และการจัดส่งสำหรับทั้งระบบ</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2 px-3 bg-muted/30 rounded-md h-10 border border-muted-foreground/10 flex-1 sm:flex-none">
            <Switch 
              id="auto-refresh-settings" 
              checked={isAuto} 
              onCheckedChange={setAuto} 
            />
            <Label htmlFor="auto-refresh-settings" className="text-[10px] font-bold cursor-pointer whitespace-nowrap">รีเฟรชอัตโนมัติ</Label>
          </div>
          <Button variant="outline" size="icon" onClick={() => refresh()} disabled={isRefreshing} className="h-10 w-10 shrink-0" title="รีเฟรชข้อมูล">
            <RotateCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
          </Button>
        </div>
      </div>

      <div className={cn("transition-opacity duration-300", isRefreshing && "opacity-60")}>
        <Tabs defaultValue="general">
            <TabsList>
                <TabsTrigger value="general">ทั่วไป</TabsTrigger>
                <TabsTrigger value="payment">การเงิน</TabsTrigger>
                {isSuperAdmin && (
                  <TabsTrigger value="points" className="flex items-center gap-2">
                    <Ticket className="h-4 w-4" />
                    กิจกรรมแจกคะแนน
                  </TabsTrigger>
                )}
            </TabsList>
            <TabsContent value="general" className="pt-6">
              <StoreSettingsForm 
                initialData={storeSettings || undefined} 
                isLoading={isLoading && !isRefreshing} 
                readOnly={isReadOnly} 
                onRefresh={() => refresh(true)}
              />
            </TabsContent>
            <TabsContent value="payment" className="pt-6">
              <PaymentSettings />
            </TabsContent>
            {isSuperAdmin && (
              <TabsContent value="points" className="pt-6">
                <GlobalPointsManager adminUser={user} />
              </TabsContent>
            )}
        </Tabs>
      </div>
    </div>
  );
}
