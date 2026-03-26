
'use client';

import { useState, useTransition, useMemo } from 'react';
import { UserProfile, Order, GuestCustomer } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, writeBatch, doc, serverTimestamp } from 'firebase/firestore';
import { History, Loader2, ArrowRightLeft, CheckCircle2, Search, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { GuestSearchDialog } from './guest-search-dialog';

interface GuestMigrationToolProps {
  user: UserProfile;
}

export function GuestMigrationTool({ user }: GuestMigrationToolProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedGuest, setSelectedGuest] = useState<GuestCustomer | null>(null);
  const [isMigrated, setIsMigrated] = useState(false);

  // Query orders for the selected guest
  const guestOrdersQuery = useMemoFirebase(() => {
    if (!firestore || !selectedGuest) return null;
    return query(collection(firestore, 'orders'), where('guestId', '==', selectedGuest.id));
  }, [firestore, selectedGuest]);

  const { data: orders, isLoading } = useCollection<Order>(guestOrdersQuery);

  const pendingMigrationCount = useMemo(() => {
    if (!orders || !user) return 0;
    return orders.filter(o => o.buyerId !== user.id).length;
  }, [orders, user.id]);

  const totalSpent = useMemo(() => {
    if (!orders) return 0;
    return orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  }, [orders]);

  const handleGuestSelect = (guest: GuestCustomer) => {
    setSelectedGuest(guest);
    setIsMigrated(false);
    setIsSearchOpen(false);
  };

  const handleMigrate = () => {
    if (!firestore || !orders || !selectedGuest || pendingMigrationCount === 0) return;

    startTransition(async () => {
      try {
        const batch = writeBatch(firestore);
        
        orders.forEach(order => {
          if (order.buyerId !== user.id) {
            const orderRef = doc(firestore, 'orders', order.id);
            batch.update(orderRef, {
              buyerId: user.id,
              buyerName: user.name,
              isExternal: false, 
              updatedAt: serverTimestamp(),
              migratedFromGuest: true,
              originalGuestId: selectedGuest.id
            });
          }
        });

        await batch.commit();
        setIsMigrated(true);
        toast({ 
          title: 'ควบรวมบัญชีสำเร็จ', 
          description: `โอนย้ายประวัติจากคุณ ${selectedGuest.name} เรียบร้อยแล้ว` 
        });
      } catch (error: any) {
        console.error('Migration failed:', error);
        toast({ variant: 'destructive', title: 'เกิดข้อผิดพลาด', description: error.message });
      }
    });
  };

  return (
    <div className={cn(
      "p-4 rounded-lg border border-dashed transition-all duration-300 w-full",
      isMigrated ? "bg-emerald-50/50 border-emerald-200" : "bg-muted/30 border-muted-foreground/20"
    )}>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
          <History className="h-3 w-3" />
          ระบบโอนย้ายประวัติ (เฉพาะกิจ)
        </h4>
        {isMigrated && (
          <div className="flex items-center gap-1 text-[10px] text-emerald-600 font-bold">
            <CheckCircle2 className="h-3 w-3" /> สำเร็จ
          </div>
        )}
      </div>

      {!selectedGuest && !isMigrated && (
        <Button 
          variant="outline" 
          size="sm" 
          className="w-full h-10 text-xs font-bold bg-background shadow-sm hover:bg-background/80"
          onClick={() => setIsSearchOpen(true)}
        >
          <Search className="mr-2 h-3.5 w-3.5" />
          ค้นหาและควบรวมบัญชีแขก
        </Button>
      )}

      {selectedGuest && !isMigrated && (
        <div className="space-y-3 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between gap-2 p-2.5 bg-background border rounded-md">
            <div className="min-w-0">
              <p className="text-[11px] font-bold truncate text-primary">{selectedGuest.name}</p>
              <p className="text-[9px] text-muted-foreground">{selectedGuest.phone}</p>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => setSelectedGuest(null)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground justify-center py-1">
              <Loader2 className="h-3 w-3 animate-spin" /> ค้นหาประวัติ...
            </div>
          ) : orders && orders.length > 0 ? (
            <div className="space-y-2">
              <div className="flex justify-between text-[10px] px-1 font-medium">
                <span className="text-muted-foreground">พบรายการ: <strong className="text-foreground">{orders.length}</strong></span>
                <span className="text-muted-foreground">ยอดรวม: <strong className="text-primary">฿{totalSpent.toLocaleString()}</strong></span>
              </div>
              <Button 
                onClick={handleMigrate} 
                disabled={isPending || pendingMigrationCount === 0} 
                className="w-full h-9 text-xs font-bold bg-blue-600 hover:bg-blue-700 shadow-sm"
              >
                {isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <ArrowRightLeft className="mr-2 h-3.5 w-3.5" />}
                ยืนยันการโอนย้าย
              </Button>
            </div>
          ) : (
            <p className="text-[10px] text-destructive text-center font-bold py-1 bg-destructive/5 rounded">ไม่พบประวัติการซื้อ</p>
          )}
        </div>
      )}

      {isMigrated && (
        <p className="text-[10px] text-muted-foreground text-center italic py-1 font-medium">
          เชื่อมโยงประวัติการซื้อเรียบร้อยแล้ว
        </p>
      )}

      <GuestSearchDialog 
        isOpen={isSearchOpen}
        onOpenChange={setIsSearchOpen}
        onGuestSelect={handleGuestSelect}
      />
    </div>
  );
}
