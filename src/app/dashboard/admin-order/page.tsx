'use client';

import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UserCombobox } from '@/components/dashboard/user-combobox';
import { ShoppingCart, User, AlertCircle, ArrowRight, Loader2 } from 'lucide-react';
import { UserProfile } from '@/lib/types';
import { useFirestore } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

export default function AdminOrderPage() {
  const { user, impersonatedUser, startImpersonation, stopImpersonation } = useAuth();
  const router = useRouter();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedUserName, setSelectedUserName] = useState<string>('');
  const [isStarting, setIsStarting] = useState(false);

  // Granular Permission Check
  const canManageOrders = useMemo(() => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    const perms = user.permissions || [];
    return perms.includes('orders:manage') || perms.includes('manage_orders');
  }, [user]);

  useEffect(() => {
    if (user && !canManageOrders) {
      router.replace('/dashboard');
    }
  }, [user, router, canManageOrders]);

  const handleStartOrder = async () => {
    if (!selectedUserId || !firestore) return;
    
    setIsStarting(true);
    try {
      const userSnap = await getDoc(doc(firestore, 'users', selectedUserId));
      if (userSnap.exists()) {
        const targetUser = { ...userSnap.data(), id: userSnap.id } as UserProfile;
        startImpersonation(targetUser);
        toast({ title: 'เข้าสู่โหมดจำลองตัวตน', description: `กำลังสร้างออเดอร์แทนคุณ ${targetUser.name}` });
      } else {
        toast({ variant: 'destructive', title: 'ไม่พบผู้ใช้', description: 'ไม่สามารถโหลดข้อมูลผู้ใช้ที่เลือกได้' });
      }
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'เกิดข้อผิดพลาด', description: e.message });
    } finally {
      setIsStarting(false);
    }
  };

  if (!user || !canManageOrders) return null;

  return (
    <div className="max-w-2xl mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-headline font-bold flex items-center gap-3">
          <ShoppingCart className="h-8 w-8 text-primary" />
          สร้างออเดอร์ให้ลูกค้า
        </h1>
        <p className="text-muted-foreground mt-2">
          แอดมินสามารถเลือกเจ้าของสาขาเพื่อทำการสั่งสินค้าหรือบริการแทนได้ โดยระบบจะดึงข้อมูลที่อยู่และสาขาของลูกค้ารายนั้นมาใช้โดยอัตโนมัติ
        </p>
      </div>

      <Card className="border-primary/20 shadow-lg">
        <CardHeader className="bg-primary/5">
          <CardTitle className="text-lg">ขั้นตอนที่ 1: เลือกเจ้าของสาขา</CardTitle>
          <CardDescription>กรุณาค้นหาและเลือกรายชื่อผู้ใช้งานที่ต้องการสร้างออเดอร์ให้</CardDescription>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          <div className="space-y-4">
            <UserCombobox 
              value={selectedUserId}
              initialName={selectedUserName}
              onChange={(id, name) => {
                setSelectedUserId(id);
                setSelectedUserName(name);
              }}
              placeholder="ค้นหาเจ้าของสาขา..."
            />
            
            {selectedUserId && (
              <div className="bg-muted/50 p-4 rounded-lg border flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
                <User className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="text-sm font-bold">ลูกค้าที่เลือก: {selectedUserName}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Seller Profile Selected</p>
                </div>
              </div>
            )}
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3 text-amber-900">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1.5">
              <p className="font-bold">ข้อมูลประกอบการพิจารณา:</p>
              <ul className="list-disc list-inside opacity-90 space-y-1">
                <li>แอดมินจะมองเห็นหน้า Shop เหมือนที่ลูกค้าเห็น</li>
                <li>คะแนนสะสมและราคาขั้นบันไดจะคำนวณตามสิทธิ์ของลูกค้ารายนี้</li>
                <li>ออเดอร์จะถูกสร้างในสถานะ "รอชำระเงิน" และลูกค้าต้องเป็นผู้แนบสลิปเอง</li>
              </ul>
            </div>
          </div>

          <div className="pt-4">
            <Button 
              className="w-full h-12 text-base font-bold" 
              disabled={!selectedUserId || isStarting}
              onClick={handleStartOrder}
            >
              {isStarting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <ArrowRight className="mr-2 h-5 w-5" />}
              เริ่มต้นการสั่งซื้อแทนลูกค้า
            </Button>
          </div>
        </CardContent>
      </Card>

      {impersonatedUser && (
        <div className="mt-6 text-center">
          <Button variant="ghost" className="text-destructive" onClick={stopImpersonation}>
            ยกเลิกโหมดสั่งแทนลูกค้าที่ค้างอยู่
          </Button>
        </div>
      )}
    </div>
  );
}
