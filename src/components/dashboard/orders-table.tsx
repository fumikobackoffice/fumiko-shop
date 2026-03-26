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
import { Eye, Printer, Loader2, Banknote, Truck, AlertCircle } from 'lucide-react';
import type { Order, OrderStatus } from '@/lib/types';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';

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
    printingOrderId,
    onManageShipment
}: { 
    orders: Order[]; 
    onPrint: (order: Order) => void;
    printingOrderId: string | null;
    onManageShipment?: (order: Order) => void;
}) {
  const { user } = useAuth();
  const router = useRouter();

  // Granular Permission Checks
  const isCurrentUserAdmin = useMemo(() => {
    return user && ['super_admin', 'admin'].includes(user.role);
  }, [user]);

  const canManageShipping = useMemo(() => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    const perms = user.permissions || [];
    return perms.includes('shipping:manage') || perms.includes('manage_shipping');
  }, [user]);

  const handleViewDetails = (order: Order) => {
    const path = isCurrentUserAdmin
      ? `/dashboard/orders/${order.id}`
      : `/account/orders/${order.id}`;
    router.push(path);
  };


  return (
    <div className="rounded-lg border overflow-x-auto bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>รหัสอ้างอิง</TableHead>
            <TableHead>{isCurrentUserAdmin ? 'ลูกค้า' : 'ชื่อผู้รับ'}</TableHead>
            <TableHead>วันที่สั่งซื้อ</TableHead>
            <TableHead>สถานะ</TableHead>
            <TableHead className="text-right">ยอดรวม</TableHead>
            <TableHead className="whitespace-nowrap text-right">การดำเนินการ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => {
            const dateObj = order.orderDate?.toDate ? order.orderDate.toDate() : new Date(order.orderDate);
            const dateStr = dateObj ? format(dateObj, 'd MMM ', { locale: th }) + (dateObj.getFullYear() + 543) + format(dateObj, ' HH:mm', { locale: th }) : '-';
            
            const canShip = (order.status === 'READY_TO_SHIP' || order.status === 'SHIPPED') && !order.isServiceOnly;
            
            const displayName = isCurrentUserAdmin 
              ? (order.buyerName || order.customerName) 
              : order.customerName;

            const isExternalDebt = order.isExternal && (order.balanceAmount || 0) > 0;

            return (
              <TableRow key={order.id}>
                <TableCell className="font-mono text-sm whitespace-nowrap">{order.id}</TableCell>
                <TableCell className="font-medium whitespace-nowrap">{displayName}</TableCell>
                <TableCell className="text-xs whitespace-nowrap">
                  {dateStr}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1.5 items-start">
                    <Badge variant={getStatusVariant(order.status)} className="whitespace-nowrap font-medium text-[10px] h-5 px-2">
                      {getStatusText(order.status)}
                    </Badge>
                    {isCurrentUserAdmin && isExternalDebt && (
                      <div className={cn(
                        "flex items-center gap-1 text-[10px] font-bold leading-none",
                        order.paidAmount && order.paidAmount > 0 ? "text-orange-600" : "text-destructive animate-pulse"
                      )}>
                        <span className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          order.paidAmount && order.paidAmount > 0 ? "bg-orange-500" : "bg-destructive"
                        )} />
                        {order.paidAmount && order.paidAmount > 0 
                          ? `ค้างชำระ ฿${order.balanceAmount?.toLocaleString()}`
                          : 'ยังไม่ชำระเงิน'
                        }
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right whitespace-nowrap font-bold text-sm">฿{order.totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    {!isCurrentUserAdmin && order.status === 'PENDING_PAYMENT' && (
                      <Button variant="outline" size="icon" asChild className="h-8 w-8 text-yellow-600 border-yellow-200 bg-yellow-50 hover:bg-yellow-100 hover:text-yellow-700">
                        <Link href={`/payment/${order.id}`}>
                          <Banknote className="h-4 w-4" />
                          <span className="sr-only">ชำระเงิน</span>
                        </Link>
                      </Button>
                    )}
                    
                    {isCurrentUserAdmin && canShip && canManageShipping && (
                      <Button 
                        variant="outline" 
                        size="icon" 
                        className="h-8 w-8 text-primary border-primary/20 bg-primary/5 hover:bg-primary/10"
                        onClick={() => onManageShipment?.(order)}
                        title="จัดการการจัดส่ง"
                      >
                        <Truck className="h-4 w-4" />
                      </Button>
                    )}

                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleViewDetails(order)} title="ดูรายละเอียด">
                      <Eye className="h-4 w-4" />
                    </Button>
                    
                    {isCurrentUserAdmin && (
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onPrint(order)} disabled={printingOrderId === order.id} title="พิมพ์ใบปะหน้า/ใบจัดของ">
                        {printingOrderId === order.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Printer className="h-4 w-4" />
                        )}
                      </Button>
                    )}
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