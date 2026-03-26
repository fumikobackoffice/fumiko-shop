'use client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, Pen, Eye } from 'lucide-react';
import { PurchaseOrder } from '@/lib/types';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { cn } from '@/lib/utils';

// Helper function for status badge
const getStatusVariant = (status: PurchaseOrder['status']): "success" | "info" | "warning" | "destructive" | "outline" => {
  switch (status) {
    case 'DRAFT': return 'outline';
    case 'ISSUED': return 'info';
    case 'PARTIALLY_RECEIVED': return 'info';
    case 'COMPLETED': return 'success';
    case 'CANCELLED': return 'destructive';
    default: return 'outline';
  }
};

const getStatusText = (status: PurchaseOrder['status']) => {
  switch (status) {
    case 'DRAFT': return 'ฉบับร่าง';
    case 'ISSUED': return 'ออกใบสั่งแล้ว';
    case 'PARTIALLY_RECEIVED': return 'ได้รับของบางส่วน';
    case 'COMPLETED': return 'เสร็จสมบูรณ์';
    case 'CANCELLED': return 'ยกเลิก';
    default: return status;
  }
};

const getPaymentStatusVariant = (paymentStatus: PurchaseOrder['paymentStatus'], poStatus: PurchaseOrder['status']) => {
  // หากรายการถูกยกเลิก ให้แสดงป้ายชำระเงินเป็นสีเทาเพื่อไม่ให้โดดเด่น
  if (poStatus === 'CANCELLED') return 'outline';
  
  switch (paymentStatus) {
    case 'PAID': return 'success';
    case 'UNPAID': return 'warning';
    default: return 'outline';
  }
}

const getPaymentStatusText = (status?: 'UNPAID' | 'PAID') => {
    switch (status) {
        case 'PAID': return 'ชำระแล้ว';
        case 'UNPAID': return 'ยังไม่ชำระ';
        default: return 'N/A';
    }
}


export function PurchaseOrdersTable({ 
    purchaseOrders, 
    supplierMap,
    canManage
}: { 
    purchaseOrders: PurchaseOrder[], 
    supplierMap: Map<string, string>,
    canManage: boolean
}) {
  const router = useRouter();

  if (purchaseOrders.length === 0) {
    return (
      <div className="rounded-lg border p-8 text-center text-muted-foreground">
        ไม่พบใบสั่งซื้อที่ตรงกับเงื่อนไข
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>รหัสใบสั่งซื้อ</TableHead>
            <TableHead>แหล่งจัดซื้อ</TableHead>
            <TableHead>วันที่สั่งซื้อ</TableHead>
            <TableHead>สถานะ</TableHead>
            <TableHead>การชำระเงิน</TableHead>
            <TableHead className="text-right">ยอดรวม</TableHead>
            <TableHead className="text-right">การดำเนินการ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {purchaseOrders.map((po) => {
            const dateObj = po.orderDate?.toDate ? po.orderDate.toDate() : new Date(po.orderDate);
            const isCancelled = po.status === 'CANCELLED';
            return (
              <TableRow key={po.id} className={cn(isCancelled && "opacity-70 bg-muted/20")}>
                <TableCell className="font-mono">{po.poNumber}</TableCell>
                <TableCell>{supplierMap.get(po.supplierId) || 'ไม่ระบุ'}</TableCell>
                <TableCell>
                  {dateObj.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                </TableCell>
                <TableCell>
                  <Badge variant={getStatusVariant(po.status)}>{getStatusText(po.status)}</Badge>
                </TableCell>
                 <TableCell>
                  <Badge 
                    variant={getPaymentStatusVariant(po.paymentStatus, po.status)}
                    className={cn(isCancelled && "text-muted-foreground border-muted-foreground/30")}
                  >
                    {getPaymentStatusText(po.paymentStatus)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">฿{po.grandTotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <span className="sr-only">Open menu</span>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => router.push(`/dashboard/purchase-orders/${po.id}`)}>
                        <Eye className="mr-2 h-4 w-4" />
                        ดูรายละเอียด
                      </DropdownMenuItem>
                      {po.status === 'DRAFT' && canManage && (
                          <DropdownMenuItem onClick={() => router.push(`/dashboard/purchase-orders/${po.id}/edit`)}>
                              <Pen className="mr-2 h-4 w-4" />
                              แก้ไข
                          </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  );
}
