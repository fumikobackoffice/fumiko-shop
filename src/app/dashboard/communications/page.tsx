'use client';

import { TargetedAnnouncementsManager } from '@/components/dashboard/targeted-announcements-manager';
import { GeneralAnnouncementsManager } from '@/components/dashboard/general-announcements-manager';
import { Separator } from '@/components/ui/separator';
import { Megaphone, Globe, Target, RotateCw } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { useSmartFetch } from '@/hooks/use-smart-fetch';
import { getStoreSettings } from '@/app/actions';
import { StoreSettings as StoreSettingsType } from '@/lib/types';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function CommunicationsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Granular Permission Checks
  const canViewComms = useMemo(() => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    const perms = user.permissions || [];
    return perms.includes('communications:view') || perms.includes('communications:manage') 
      || perms.includes('system:manage') || perms.includes('manage_system'); // Legacy fallback
  }, [user]);

  const isReadOnly = useMemo(() => {
    if (!user) return true;
    if (user.role === 'super_admin') return false;
    
    const perms = user.permissions || [];
    const hasManagePermission = perms.includes('communications:manage') 
      || perms.includes('system:manage') || perms.includes('manage_system'); // Legacy fallback
    return !hasManagePermission;
  }, [user]);

  const { 
    data: storeSettings, 
    isLoading: isSettingsLoading, 
    isRefreshing: isSettingsRefreshing, 
    isAuto, 
    setAuto, 
    refresh: refreshSettings
  } = useSmartFetch<StoreSettingsType | null>({
    key: 'store-settings-data',
    fetcher: getStoreSettings,
    localStorageKey: 'auto-refresh-communications'
  });

  useEffect(() => {
    if (!loading && user && !canViewComms) {
      router.replace('/dashboard');
    }
  }, [user, loading, router, canViewComms]);

  if (loading || !user || !canViewComms) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6 p-8 pt-6 relative">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold font-headline tracking-tight flex items-center gap-2">
          <Megaphone className="h-8 w-8 text-primary" />
          ระบบสื่อสารสาขา
        </h2>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2 px-3 bg-muted/30 rounded-md h-10 border border-muted-foreground/10 flex-1 sm:flex-none">
            <Switch 
              id="auto-refresh-comms" 
              checked={isAuto} 
              onCheckedChange={setAuto} 
            />
            <Label htmlFor="auto-refresh-comms" className="text-[10px] font-bold cursor-pointer whitespace-nowrap">รีเฟรชข้อมูลพื้นฐาน</Label>
          </div>
          <Button variant="outline" size="icon" onClick={() => refreshSettings()} disabled={isSettingsRefreshing} className="h-10 w-10 shrink-0" title="รีเฟรช">
            <RotateCw className={cn("h-4 w-4", isSettingsRefreshing && "animate-spin")} />
          </Button>
        </div>
      </div>
      
      <Separator className="bg-primary/10" />
      
      <Tabs defaultValue="targeted" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 lg:w-[400px]">
          <TabsTrigger value="targeted" className="flex items-center gap-2">
            <Target className="h-4 w-4" /> เจาะจงพื้นที่/สาขา
          </TabsTrigger>
          <TabsTrigger value="general" className="flex items-center gap-2">
            <Globe className="h-4 w-4" /> ประกาศระบบ/คำถามบังคับ
          </TabsTrigger>
        </TabsList>

        <TabsContent value="targeted" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Target className="h-5 w-5 text-primary" />
                  การกระจายข่าวสารเฉพาะกลุ่ม
                </CardTitle>
                <CardDescription>
                  ควบคุมการกระจายข่าวสารอย่างแม่นยำ เลือกเป้าหมายได้ละเอียดระดับจังหวัด ภูมิภาค หรือรายบุคคล
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
          <TargetedAnnouncementsManager />
        </TabsContent>

        <TabsContent value="general" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Globe className="h-5 w-5 text-primary" />
                  ประกาศส่วนกลาง (ทั้งหมด)
                </CardTitle>
                <CardDescription>
                  พื้นที่ปรับแต่งข้อความต้อนรับและประกาศที่ทุกคนในระบบจะมองเห็นเหมือนกันตอนล็อกอิน
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
          <GeneralAnnouncementsManager 
            initialData={storeSettings || undefined}
            isLoading={isSettingsLoading && !isSettingsRefreshing}
            readOnly={isReadOnly}
            onRefresh={() => refreshSettings(true)}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
