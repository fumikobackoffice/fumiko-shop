
'use client';

import { useEffect, useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { PlusCircle, Search, Factory, RotateCw, ChevronRight, LayoutGrid, Loader2 } from 'lucide-react';
import { Supplier } from '@/lib/types';
import { getSuppliers } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SupplierForm } from '@/components/dashboard/supplier-form';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useSmartFetch } from '@/hooks/use-smart-fetch';
import { SmartRefreshButton } from '@/components/dashboard/smart-refresh-button';

export default function SuppliersHubPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const canManageSuppliers = useMemo(() => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    const perms = user.permissions || [];
    return perms.includes('suppliers:manage') || perms.includes('manage_suppliers');
  }, [user]);

  const canViewSuppliers = useMemo(() => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    const perms = user.permissions || [];
    return perms.includes('suppliers:view') || canManageSuppliers;
  }, [user, canManageSuppliers]);

  // Use Centralized Hook
  const { 
    data: suppliers, 
    isLoading, 
    isRefreshing, 
    isAuto, 
    badgeCount,
    setAuto, 
    refresh 
  } = useSmartFetch<Supplier[]>({
    key: 'suppliers-data',
    fetcher: getSuppliers,
    localStorageKey: 'auto-refresh-suppliers',
    watchPath: 'suppliers'
  });

  const suppliersList = suppliers || [];

  useEffect(() => {
    if (!authLoading) {
      if (!user || !['super_admin', 'admin'].includes(user.role)) {
        router.replace('/dashboard');
      } else if (!canViewSuppliers) {
        router.replace('/dashboard');
      }
    }
  }, [user, authLoading, canViewSuppliers, router]);

  useEffect(() => {
    if (!isLoading && suppliersList.length > 0) {
      const idParam = searchParams.get('id');
      const actionParam = searchParams.get('action');
      if (actionParam === 'new' && canManageSuppliers) {
        setIsCreating(true);
        setSelectedId(null);
      } else if (idParam) {
        setSelectedId(idParam);
        setIsCreating(false);
      }
    }
  }, [searchParams, isLoading, suppliersList, canManageSuppliers]);

  const filteredSuppliers = useMemo(() => {
    return suppliersList.filter(s => {
      const matchStatus = s.status === activeTab;
      const matchSearch = !searchTerm || 
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        s.code.toLowerCase().includes(searchTerm.toLowerCase());
      return matchStatus && matchSearch;
    });
  }, [suppliersList, activeTab, searchTerm]);

  const selectedSupplier = useMemo(() => {
    return suppliersList.find(s => s.id === selectedId) || null;
  }, [suppliersList, selectedId]);

  if (authLoading || !user || !['super_admin', 'admin'].includes(user.role) || !canViewSuppliers) {
    return <div className="h-screen w-full flex items-center justify-center bg-background"><Loader2 className="animate-spin text-primary" /></div>;
  }

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setIsCreating(false);
    const params = new URLSearchParams(window.location.search);
    params.set('id', id);
    params.delete('action');
    window.history.pushState(null, '', `?${params.toString()}`);
  };

  const handleStartCreate = () => {
    if (!canManageSuppliers) return;
    setIsCreating(true);
    setSelectedId(null);
    const params = new URLSearchParams(window.location.search);
    params.set('action', 'new');
    params.delete('id');
    window.history.pushState(null, '', `?${params.toString()}`);
  };

  const handleCancel = () => {
    setIsCreating(false);
    setSelectedId(null);
    const params = new URLSearchParams(window.location.search);
    params.delete('id');
    params.delete('action');
    window.history.pushState(null, '', `?${params.toString()}`);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold flex items-center gap-3">
            <Factory className="h-8 w-8 text-primary" />
            จัดการแหล่งจัดซื้อ
          </h1>
          <p className="text-muted-foreground">บันทึกข้อมูลบริษัทคู่ค้าและข้อมูลการเงินสำหรับการออกใบสั่งซื้อ (PO)</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-grow overflow-hidden">
        {/* LEFT COLUMN: Master List */}
        <Card className="lg:col-span-4 flex flex-col overflow-hidden shadow-sm">
          <CardHeader className="p-4 space-y-4 border-b">
            <div className="flex items-center gap-2">
                <div className="relative flex-grow">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="ค้นหาชื่อ หรือ รหัส..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 h-10 bg-muted/20 border-none rounded-full"
                    />
                </div>
                {canManageSuppliers && (
                  <Button 
                      variant="outline" 
                      size="icon" 
                      className="h-10 w-10 shrink-0 rounded-full border-primary/20 text-primary hover:bg-primary/10"
                      onClick={handleStartCreate}
                      title="เพิ่มแหล่งจัดซื้อใหม่"
                  >
                      <PlusCircle className="h-5 w-5" />
                  </Button>
                )}
            </div>
            <div className="flex items-center justify-between gap-2">
              <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="flex-1">
                <TabsList className="grid grid-cols-2 w-full h-9">
                  <TabsTrigger value="active" className="text-[10px] uppercase font-bold">ใช้งานอยู่</TabsTrigger>
                  <TabsTrigger value="archived" className="text-[10px] uppercase font-bold">จัดเก็บแล้ว</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 px-2 bg-muted/30 rounded-md h-9 border border-muted-foreground/10">
                  <Switch 
                    id="auto-refresh-suppliers" 
                    checked={isAuto} 
                    onCheckedChange={setAuto} 
                  />
                  <Label htmlFor="auto-refresh-suppliers" className="text-[9px] font-bold cursor-pointer whitespace-nowrap">Auto</Label>
                </div>
                <SmartRefreshButton 
                  refresh={refresh}
                  isRefreshing={isRefreshing}
                  badgeCount={badgeCount}
                  className="h-9 w-9 rounded-md"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-grow">
            <ScrollArea className="h-full max-h-[600px]">
              {isLoading && !isRefreshing ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
                </div>
              ) : filteredSuppliers.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground">
                  <Factory className="h-12 w-12 mx-auto mb-2 opacity-10" />
                  <p className="text-sm">ไม่พบข้อมูล</p>
                </div>
              ) : (
                <div className="divide-y">
                  {filteredSuppliers.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => handleSelect(s.id)}
                      className={cn(
                        "w-full text-left p-4 flex items-center justify-between transition-all hover:bg-primary/5 group",
                        selectedId === s.id ? "bg-primary/10 border-r-4 border-primary shadow-inner" : ""
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-sm truncate">{s.name}</span>
                          {s.status === 'archived' && <Badge variant="outline" className="text-[9px] h-4">Archived</Badge>}
                        </div>
                        <div className="flex items-center text-xs text-muted-foreground gap-2 font-mono">
                          <span className="bg-muted px-1 rounded">{s.code}</span>
                          <span>•</span>
                          <span className="truncate">{s.contactName || 'ไม่มีชื่อผู้ติดต่อ'}</span>
                        </div>
                      </div>
                      <ChevronRight className={cn(
                        "h-4 w-4 text-muted-foreground transition-transform",
                        selectedId === s.id ? "translate-x-1 text-primary" : "group-hover:translate-x-1"
                      )} />
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* RIGHT COLUMN: Detail/Form */}
        <Card className="lg:col-span-8 overflow-hidden shadow-md flex flex-col bg-slate-50/50">
          <ScrollArea className="h-full">
            <CardContent className="p-6 md:p-8">
              {isCreating ? (
                <div className="max-w-3xl mx-auto">
                  <div className="flex items-center gap-3 mb-8">
                    <div className="h-10 w-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center">
                      <PlusCircle className="h-6 w-6" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold font-headline">เพิ่มแหล่งจัดซื้อใหม่</h2>
                      <p className="text-sm text-muted-foreground">ระบบจะรันรหัส SUP-XXXX ให้อัตโนมัติเมื่อกดบันทึก</p>
                    </div>
                  </div>
                  <SupplierForm onSuccess={() => refresh(true)} onCancel={handleCancel} />
                </div>
              ) : selectedSupplier ? (
                <div className="max-w-3xl mx-auto">
                  <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-8">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 bg-primary text-white rounded-xl flex items-center justify-center shadow-lg">
                        <Factory className="h-7 w-7" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-2xl font-bold font-headline">{selectedSupplier.name}</h2>
                          <Badge variant={selectedSupplier.status === 'active' ? 'success' : 'outline'}>
                            {selectedSupplier.status === 'active' ? 'กำลังใช้งาน' : 'จัดเก็บแล้ว'}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground font-mono">รหัสแหล่งจัดซื้อ: {selectedSupplier.code}</p>
                      </div>
                    </div>
                  </div>
                  <SupplierForm key={selectedId} initialData={selectedSupplier} onSuccess={() => refresh(true)} onCancel={handleCancel} />
                </div>
              ) : (
                <div className="h-[500px] flex flex-col items-center justify-center text-center text-muted-foreground p-12">
                  <div className="h-24 w-24 bg-muted/20 rounded-full flex items-center justify-center mb-6">
                    <LayoutGrid className="h-12 w-12 opacity-20" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground mb-2">เลือกแหล่งจัดซื้อจากรายการด้านซ้าย</h3>
                  <p className="max-w-xs text-sm">คุณสามารถดูข้อมูลเชิงลึก แก้ไข หรือสร้างรายการใหม่ได้ทันทีจากเมนูนี้ครับ</p>
                  {canManageSuppliers && (
                    <Button variant="outline" className="mt-8 rounded-full h-11 px-8 border-primary/20 hover:bg-primary/5 text-primary" onClick={handleStartCreate}>
                      <PlusCircle className="mr-2 h-4 w-4" /> เริ่มสร้างใหม่ตอนนี้
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </ScrollArea>
        </Card>
      </div>
    </div>
  );
}
