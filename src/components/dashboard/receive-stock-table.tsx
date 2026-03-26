'use client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Truck, Eye } from 'lucide-react';
import { PurchaseOrder } from '@/lib/types';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';

const getStatusVariant = (status: PurchaseOrder['status']) => {
  switch (status) {
    case 'DRAFT': return 'outline';
    case 'ISSUED': return 'secondary';
    case 'PARTIALLY_RECEIVED': return 'default';
    case 'COMPLETED': return 'default';
    case 'CANCELLED': return 'destructive';
    default: return 'default';
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

export function ReceiveStockTable({ 
  purchaseOrders, 
  supplierMap, 
  isHistoryView,
  canManage 
}: { 
  purchaseOrders: PurchaseOrder[], 
  supplierMap: Map<string, string>, 
  isHistoryView: boolean,
  canManage: boolean
}) {
  const router = useRouter();

  if (purchaseOrders.length === 0) {
    return (
      <div className="rounded-lg border p-8 text-center text-muted-foreground">
        {isHistoryView ? 'ไม่พบประวัติใบสั่งซื้อ' : 'ไม่พบใบสั่งซื้อที่ต้องรับของ'}
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
            <TableHead className="text-right">ยอดรวม</TableHead>
            <TableHead className="text-right">การดำเนินการ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {purchaseOrders.map((po) => {
            const dateObj = po.orderDate?.toDate ? po.orderDate.toDate() : new Date(po.orderDate);
            return (
              <TableRow key={po.id}>
                <TableCell className="font-mono">{po.poNumber}</TableCell>
                <TableCell>{supplierMap.get(po.supplierId) || 'ไม่ระบุ'}</TableCell>
                <TableCell>
                  {dateObj.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                </TableCell>
                <TableCell>
                  <Badge variant={getStatusVariant(po.status)}>{getStatusText(po.status)}</Badge>
                </TableCell>
                <TableCell className="text-right">฿{po.grandTotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                <TableCell className="text-right">
                  {isHistoryView ? (
                    <Button variant="outline" onClick={() => router.push(`/dashboard/purchase-orders/${po.id}`)}>
                          <Eye className="mr-2 h-4 w-4" />
                          ดูรายละเอียด
                      </Button>
                  ) : (
                      <Button onClick={() => router.push(`/dashboard/receive-stock/${po.id}`)} disabled={!canManage}>
                          {canManage ? <Truck className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                          {canManage ? 'รับของ' : 'ดูรายละเอียด'}
                      </Button>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  );
}
