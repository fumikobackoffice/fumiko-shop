
'use client';

import { useState, useEffect, useMemo } from 'react';
import { FeeInvoice, UserProfile } from '@/lib/types';
import { getSellerFeeInvoices } from '@/app/actions';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CreditCard, History, CheckCircle2, Loader2, Calendar, Clock, AlertTriangle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { FeePaymentDialog } from './fee-payment-dialog';
import { cn } from '@/lib/utils';
import { differenceInCalendarDays, format, isAfter } from 'date-fns';
import { th } from 'date-fns/locale';
import { Progress } from '@/components/ui/progress';

const getStatusVariant = (status: FeeInvoice['status']) => {
  switch (status) {
    case 'PENDING': return 'warning';
    case 'PROCESSING': return 'info';
    case 'PAID': return 'success';
    case 'CANCELLED': return 'destructive';
    default: return 'outline';
  }
};

const getStatusText = (status: FeeInvoice['status']) => {
  switch (status) {
    case 'PENDING': return 'รอชำระเงิน';
    case 'PROCESSING': return 'รอตรวจสอบสลิป';
    case 'PAID': return 'ชำระแล้ว';
    case 'CANCELLED': return 'ยกเลิก';
    default: return status;
  }
};

function InvoiceCard({ inv, onPay }: { inv: FeeInvoice, onPay: (inv: FeeInvoice) => void }) {
  const { daysRemaining, progress, isOverdue, dueDateDisplay } = useMemo(() => {
    const createdAt = inv.createdAt?.toDate ? inv.createdAt.toDate() : new Date(inv.createdAt);
    const now = new Date();
    
    if (!inv.dueDate) {
        return { daysRemaining: null, progress: 100, isOverdue: false, dueDateDisplay: 'ไม่ระบุ' };
    }

    const deadline = inv.dueDate?.toDate ? inv.dueDate.toDate() : new Date(inv.dueDate);
    const totalDuration = Math.max(1, differenceInCalendarDays(deadline, createdAt));
    
    // บิลจะถือว่าเกินกำหนดก็ต่อเมื่อเวลาปัจจุบันเลย Timestamp ครบกำหนดไปแล้ว
    const overdue = isAfter(now, deadline);
    const diff = differenceInCalendarDays(deadline, now);
    
    const elapsed = differenceInCalendarDays(now, createdAt);
    const p = Math.max(0, Math.min(100, ((totalDuration - elapsed) / totalDuration) * 100));
    
    return {
      daysRemaining: diff,
      progress: p,
      isOverdue: overdue,
      dueDateDisplay: format(deadline, 'd MMM yyyy', { locale: th })
    };
  }, [inv]);

  return (
    <Card key={inv.id} className="relative overflow-hidden border shadow-sm flex flex-col h-full">
      <div className={cn(
        "absolute top-0 left-0 w-1.5 h-full", 
        isOverdue ? "bg-destructive" : inv.status === 'PROCESSING' ? "bg-blue-500" : "bg-yellow-500"
      )} />
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <Badge variant={isOverdue ? 'destructive' : getStatusVariant(inv.status)} className="text-[10px] px-2 py-0.5 whitespace-nowrap">
            {isOverdue && inv.status === 'PENDING' ? 'เกินกำหนดชำระ' : getStatusText(inv.status)}
          </Badge>
          <p className="text-[10px] text-muted-foreground">{new Date(inv.createdAt).toLocaleDateString('th-TH')}</p>
        </div>
        <div className="mt-3">
          <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">ยอดที่ต้องชำระ</p>
          <p className="text-2xl font-bold text-primary">฿{inv.amount.toLocaleString()}</p>
        </div>
      </CardHeader>
      <CardContent className="text-sm space-y-4 pt-2 flex-grow">
        <div>
          <p className="text-xs text-muted-foreground font-medium">{inv.branchName}</p>
        </div>
        
        <div className="flex items-center gap-3 py-2.5 px-3 bg-muted/50 rounded-md border border-muted-foreground/10">
          <Calendar className="h-4 w-4 text-primary shrink-0" />
          <div className="flex flex-col min-w-0">
              <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-tighter">ประจำรอบบิล</span>
              <span className="font-bold text-sm leading-tight truncate text-foreground">{inv.billingPeriod}</span>
          </div>
        </div>

        {inv.status === 'PENDING' && inv.dueDate && (
          <div className="space-y-2 pt-1">
            <div className="flex justify-between items-end">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">กำหนดชำระเงิน</span>
                <span className="text-[9px] text-muted-foreground font-medium">{dueDateDisplay}</span>
              </div>
              <span className={cn(
                "text-xs font-bold",
                isOverdue ? "text-destructive" : "text-primary"
              )}>
                {isOverdue ? 'หมดเวลาแล้ว' : daysRemaining === 0 ? 'ครบกำหนดวันนี้' : `เหลืออีก ${daysRemaining} วัน`}
              </span>
            </div>
            <Progress value={progress} className={cn("h-1.5", isOverdue ? "[&>div]:bg-destructive" : "")} />
            {isOverdue && (
              <p className="text-[10px] text-destructive font-medium flex items-center gap-1 mt-1">
                <AlertTriangle className="h-3 w-3" />
                ระบบถูกระงับ กรุณาชำระเงินเพื่อปลดล็อค
              </p>
            )}
          </div>
        )}
      </CardContent>
      <CardFooter className="pt-2">
        {inv.status === 'PENDING' ? (
          <Button className={cn("w-full font-bold shadow-sm", isOverdue && "bg-destructive hover:bg-destructive/90")} onClick={() => onPay(inv)}>
            <CreditCard className="mr-2 h-4 w-4" />
            แจ้งชำระเงิน
          </Button>
        ) : (
          <div className="flex items-center gap-2 text-blue-600 text-xs font-bold w-full justify-center py-2.5 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-100 dark:border-blue-800">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> กำลังตรวจสอบข้อมูลสลิป
          </div>
        )}
      </CardFooter>
    </Card>
  );
}

export function FeesSellerView({ user }: { user: UserProfile }) {
  const [invoices, setInvoices] = useState<FeeInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [invoiceToPay, setInvoiceToPay] = useState<FeeInvoice | null>(null);

  const fetchData = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const data = await getSellerFeeInvoices(user.id);
      setInvoices(data);
    } catch (e) {
      console.error("Failed to fetch seller invoices:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user.id]);

  const pendingInvoices = invoices.filter(i => i.status === 'PENDING' || i.status === 'PROCESSING');
  const paidInvoices = invoices.filter(i => i.status === 'PAID');

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-32 w-full" /><Skeleton className="h-32 w-full" /></div>;
  }

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h3 className="text-lg font-semibold flex items-center gap-2"><CreditCard className="text-primary h-5 w-5" /> รายการที่ต้องชำระ</h3>
        {pendingInvoices.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed rounded-xl bg-muted/10">
            <CheckCircle2 className="mx-auto h-12 w-12 text-muted-foreground opacity-20 mb-2" />
            <p className="text-muted-foreground">ไม่มีบิลค้างชำระในขณะนี้</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {pendingInvoices.map((inv) => (
              <InvoiceCard key={inv.id} inv={inv} onPay={setInvoiceToPay} />
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold flex items-center gap-2"><History className="text-muted-foreground h-5 w-5" /> ประวัติการชำระเงิน</h3>
        <div className="rounded-lg border bg-card shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-4 text-left font-bold text-muted-foreground whitespace-nowrap">วันที่</th>
                <th className="p-4 text-left font-bold text-muted-foreground whitespace-nowrap">สาขา</th>
                <th className="p-4 text-left font-bold text-muted-foreground whitespace-nowrap">รายการเรียกเก็บ</th>
                <th className="p-4 text-right font-bold text-muted-foreground whitespace-nowrap">ยอดชำระ</th>
                <th className="p-4 text-center font-bold text-muted-foreground whitespace-nowrap">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {paidInvoices.length === 0 ? (
                <tr><td colSpan={5} className="p-12 text-center text-muted-foreground italic">ยังไม่มีประวัติการชำระเงิน</td></tr>
              ) : (
                paidInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-4 text-xs font-mono whitespace-nowrap">{new Date(inv.createdAt).toLocaleDateString('th-TH')}</td>
                    <td className="p-4 font-medium whitespace-nowrap">{inv.branchName}</td>
                    <td className="p-4 text-sm min-w-[150px]">{inv.billingPeriod}</td>
                    <td className="p-4 text-right font-bold text-primary whitespace-nowrap">฿{inv.amount.toLocaleString()}</td>
                    <td className="p-4 text-center">
                      <Badge variant="success" className="text-[10px] px-2 py-0.5 whitespace-nowrap">ชำระแล้ว</Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <FeePaymentDialog invoice={invoiceToPay} onClose={() => { setInvoiceToPay(null); fetchData(); }} />
    </div>
  );
}
