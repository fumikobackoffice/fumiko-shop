'use client';

import { useState, useMemo } from 'react';
import { PurchaseOrder } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { ReceiveStockTable } from '@/components/dashboard/receive-stock-table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface ReceiveStockClientProps {
  purchaseOrders: PurchaseOrder[];
  supplierMap: Record<string, string>;
}

export function ReceiveStockClient({ purchaseOrders, supplierMap: supplierMapProp }: ReceiveStockClientProps) {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('pending');
  
  const supplierMap = useMemo(() => new Map(Object.entries(supplierMapProp)), [supplierMapProp]);

  // Granular Permission Checks
  const canViewInventory = useMemo(() => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    const perms = user.permissions || [];
    return perms.includes('inventory:view') || perms.includes('inventory:manage') || perms.includes('manage_inventory');
  }, [user]);

  const canManageInventory = useMemo(() => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    const perms = user.permissions || [];
    return perms.includes('inventory:manage') || perms.includes('manage_inventory');
  }, [user]);

  const { pendingPOs, historyPOs } = useMemo(() => {
    if (!purchaseOrders) return { pendingPOs: [], historyPOs: [] };
    
    const filteredBySearch = searchTerm
      ? purchaseOrders.filter(po => 
          po.poNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (supplierMap.get(po.supplierId) || '').toLowerCase().includes(searchTerm.toLowerCase())
        )
      : purchaseOrders;

    const pending = filteredBySearch.filter(po => ['ISSUED', 'PARTIALLY_RECEIVED'].includes(po.status));
    const history = filteredBySearch.filter(po => ['COMPLETED', 'CANCELLED'].includes(po.status));
    
    return { pendingPOs: pending, historyPOs: history };
  }, [purchaseOrders, searchTerm, supplierMap]);

  if (!canViewInventory) {
    return (
      <Alert variant="destructive" className="max-w-2xl mx-auto mt-8">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>ไม่มีสิทธิ์เข้าถึง</AlertTitle>
        <AlertDescription>คุณไม่ได้รับสิทธิ์ให้เข้าถึงระบบจัดการสต็อกสินค้า กรุณาติดต่อผู้ดูแลระบบครับ</AlertDescription>
      </Alert>
    );
  }
  
  return (
      <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
                <div className="relative w-full sm:w-auto sm:flex-grow md:flex-grow-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="ค้นหารหัส PO หรือแหล่งจัดซื้อ..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 w-full sm:w-64 md:w-80"
                />
                </div>
                <TabsList>
                    <TabsTrigger value="pending">รอรับสินค้า</TabsTrigger>
                    <TabsTrigger value="history">ประวัติ</TabsTrigger>
                </TabsList>
            </div>
            <TabsContent value="pending">
                <ReceiveStockTable 
                  purchaseOrders={pendingPOs} 
                  supplierMap={supplierMap} 
                  isHistoryView={false} 
                  canManage={canManageInventory}
                />
            </TabsContent>
            <TabsContent value="history">
                <ReceiveStockTable 
                  purchaseOrders={historyPOs} 
                  supplierMap={supplierMap} 
                  isHistoryView={true} 
                  canManage={canManageInventory}
                />
            </TabsContent>
        </Tabs>
  );
}
