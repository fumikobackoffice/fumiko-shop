
'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, Printer, Loader2 } from 'lucide-react';
import type { Order, OrderStatus } from '@/lib/types';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';

const getStatusVariant = (status: OrderStatus): "success" | "info" | "warning" | "destructive" | "default" | "indigo" | "secondary" | "outline" => {
  switch (status) {
    case 'PENDING_PAYMENT':
      return 'secondary';
    case 'PROCESSING':
      return 'info';
    case 'READY_TO_SHIP':
      return 'warning';
    case 'SHIPPED':
      return 'success';
    case 'COMPLETED':
      return 'success';
    case 'CANCELLED':
      return 'destructive';
    case 'EXPIRED':
      return 'outline';
    default:
      return 'default';
  }
};

const getStatusText = (status: OrderStatus) => {
  switch (status) {
    case 'PENDING_PAYMENT': return 'รอชำระเงิน';
    case 'PROCESSING': return 'รอตรวจสอบ';
    case 'READY_TO_SHIP': return 'รอจัดส่ง';
    case 'SHIPPED': return 'จัดส่งแล้ว';
    case 'COMPLETED': return 'สำเร็จ';
    case 'CANCELLED': return 'ยกเลิก';
    case 'EXPIRED': return 'หมดอายุ';
    default: return status;
  }
};

export function OrdersTable({ 
    orders, 
    onPrint, 
    printingOrderId 
}: { 
    orders: Order[]; 
    onPrint: (order: Order) => void;
    printingOrderId: string | null;
}) {
  const { user } = useAuth();
  const router = useRouter();

  const handleViewDetails = (order: Order) => {
    const isCurrentUserAdmin = user && ['super_admin', 'admin'].includes(user.role);
    const path = isCurrentUserAdmin
      ? `/dashboard/orders/${order.id}`
      : `/account/orders/${order.id}`;
    router.push(path);
  };


  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>รหัสอ้างอิง</TableHead>
            <TableHead>ลูกค้า</TableHead>
            <TableHead>อัปเดตล่าสุด</TableHead>
            <TableHead>สถานะ</TableHead>
            <TableHead className="text-right">ยอดรวม</TableHead>
            <TableHead className="whitespace-nowrap text-right">การดำเนินการ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => {
            const displayDate = order.updatedAt || order.orderDate;
            return (
              <TableRow key={order.id}>
                <TableCell className="font-mono text-sm">{order.id}</TableCell>
                <TableCell className="font-medium">{order.customerName}</TableCell>
                <TableCell>
                  {displayDate ? new Date(displayDate).toLocaleString('th-TH', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                  }) : '-'}
                </TableCell>
                <TableCell>
                  <Badge variant={getStatusVariant(order.status)}>{getStatusText(order.status)}</Badge>
                </TableCell>
                <TableCell className="text-right">฿{order.totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="ghost" size="icon" onClick={() => handleViewDetails(order)}>
                      <Eye className="h-4 w-4" />
                      <span className="sr-only">ดูรายละเอียด</span>
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => onPrint(order)} disabled={printingOrderId === order.id}>
                      {printingOrderId === order.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Printer className="h-4 w-4" />
                      )}
                      <span className="sr-only">พิมพ์</span>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  );
}
