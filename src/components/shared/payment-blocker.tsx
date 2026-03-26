
'use client';

import { useAuth } from '@/hooks/use-auth';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import { FeeInvoice } from '@/lib/types';
import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { CreditCard, ArrowRight, Lock } from 'lucide-react';
import Link from 'next/link';
import { differenceInCalendarDays, isAfter } from 'date-fns';
import { usePathname } from 'next/navigation';

export function PaymentBlocker({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const firestore = useFirestore();
  const pathname = usePathname();
  const [isBlocked, setIsBlocked] = useState(false);

  // สร้าง Query เฉพาะเมื่อโหลดข้อมูลผู้ใช้จาก localStorage เสร็จสิ้นและเป็น Seller
  const invoicesQuery = useMemoFirebase(() => {
    // CRITICAL: ป้องกันการ Query ขณะที่ User ID ยังไม่พร้อมเพื่อลดโอกาสเกิด Permission Error
    if (!firestore || authLoading || !user || !user.id || user.role !== 'seller') {
      return null;
    }
    
    return query(
      collection(firestore, 'feeInvoices'), 
      where('ownerId', '==', user.id),
      where('status', '==', 'PENDING')
    );
  }, [firestore, user?.id, user?.role, authLoading]);

  const { data: pendingInvoices, isLoading: isInvoicesLoading } = useCollection<FeeInvoice>(invoicesQuery);

  const overdueInvoices = useMemo(() => {
    // ถ้ายังโหลดไม่เสร็จ หรือไม่มีข้อมูลบิลค้างชำระ ให้คืนค่าเป็น Array ว่าง
    if (authLoading || isInvoicesLoading || !pendingInvoices) return [];
    
    const now = new Date();
    
    return pendingInvoices.filter(inv => {
      // ตรวจสอบวันครบกำหนด (dueDate) แบบเคร่งครัด
      if (inv.dueDate) {
        const deadline = inv.dueDate?.toDate ? inv.dueDate.toDate() : new Date(inv.dueDate);
        return isAfter(now, deadline);
      }
      return false;
    });
  }, [pendingInvoices, authLoading, isInvoicesLoading]);

  useEffect(() => {
    // ตรวจสอบการล็อกหน้าจอเฉพาะเมื่อไม่ได้อยู่หน้าชำระเงิน
    const isFeesPage = pathname === '/dashboard/fees';
    setIsBlocked(overdueInvoices.length > 0 && !isFeesPage);
  }, [overdueInvoices, pathname]);

  if (!isBlocked) {
    return <>{children}</>;
  }

  const now = new Date();

  return (
    <>
      <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-md flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-card border-2 border-destructive shadow-2xl rounded-2xl overflow-hidden animate-in zoom-in-95 duration-300">
          <div className="bg-destructive p-6 text-destructive-foreground flex flex-col items-center text-center gap-2">
            <div className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center mb-2">
              <Lock className="h-6 w-6 text-white" />
            </div>
            <h2 className="text-xl font-bold font-headline">บัญชีถูกระงับชั่วคราว</h2>
            <p className="text-sm opacity-90">กรุณาชำระค่าธรรมเนียมที่ค้างอยู่เพื่อปลดล็อคการใช้งาน</p>
          </div>
          
          <div className="p-6 space-y-6">
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                คุณมีบิลค้างชำระเกินกำหนดเวลาที่กำหนด กรุณาชำระเงินเพื่อให้สามารถเข้าใช้งานระบบสั่งซื้อและแดชบอร์ดได้ตามปกติ
              </p>
              
              <div className="space-y-2">
                {overdueInvoices.map((inv) => {
                  const deadline = inv.dueDate?.toDate ? inv.dueDate.toDate() : (inv.dueDate ? new Date(inv.dueDate) : null);
                  const daysOver = deadline ? differenceInCalendarDays(now, deadline) : 0;
                  
                  return (
                    <div key={inv.id} className="flex justify-between items-center p-3 bg-muted rounded-lg border">
                      <div className="min-w-0">
                        <p className="text-xs font-bold truncate">{inv.billingPeriod}</p>
                        <p className="text-[10px] text-destructive font-bold">
                          {daysOver > 0 ? `เกินกำหนดมาแล้ว ${daysOver} วัน` : 'ครบกำหนดชำระแล้ว'}
                        </p>
                      </div>
                      <p className="font-bold text-destructive">฿{inv.amount.toLocaleString()}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <Button asChild className="w-full h-12 text-base font-bold shadow-lg shadow-primary/20" variant="default">
              <Link href="/dashboard/fees">
                <CreditCard className="mr-2 h-5 w-5" />
                ไปที่หน้าชำระเงิน
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            
            <p className="text-[10px] text-center text-muted-foreground italic">
              *หากคุณชำระเงินแล้ว ระบบจะปลดล็อคทันทีที่แอดมินยืนยันสลิป
            </p>
          </div>
        </div>
      </div>
      <div className="opacity-50 pointer-events-none filter blur-sm">
        {children}
      </div>
    </>
  );
}
