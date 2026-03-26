
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
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface ProductStat {
    name: string;
    lastOrdered: string;
    totalQty: number;
    inactivityDays: number;
}

export function BranchProductStats({ products }: { products: ProductStat[] }) {
  if (products.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground border-2 border-dashed rounded-lg">
        ยังไม่มีประวัติการสั่งซื้อสินค้า
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">รายการสินค้าที่สาขานี้เคยสั่งซื้อ เรียงตามจำนวนที่สั่งบ่อยที่สุด</p>
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>สินค้า</TableHead>
              <TableHead className="text-right">สั่งซื้อรวม (ชิ้น)</TableHead>
              <TableHead>สั่งล่าสุดเมื่อ</TableHead>
              <TableHead className="text-right">ขาดสั่งมาแล้ว (วัน)</TableHead>
              <TableHead className="text-center">สถานะ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((p, idx) => {
              const isWarning = p.inactivityDays > 21; // Alert if product not ordered for 3 weeks
              const isCritical = p.inactivityDays > 45;

              const lastOrderedDate = p.lastOrdered ? new Date(p.lastOrdered) : null;
              const displayDate = lastOrderedDate 
                ? format(lastOrderedDate, 'd MMM ', { locale: th }) + (lastOrderedDate.getFullYear() + 543)
                : '-';

              return (
                <TableRow key={idx}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-right font-bold">{p.totalQty.toLocaleString()}</TableCell>
                  <TableCell className="text-sm">
                    {displayDate}
                  </TableCell>
                  <TableCell className={cn(
                    "text-right font-mono font-semibold",
                    isCritical ? "text-red-600" : isWarning ? "text-yellow-600" : "text-green-600"
                  )}>
                    {p.inactivityDays}
                  </TableCell>
                  <TableCell className="text-center">
                    {isCritical ? (
                        <Badge variant="destructive" className="text-[10px]">ควรติดตาม</Badge>
                    ) : isWarning ? (
                        <Badge variant="warning" className="text-[10px]">เริ่มห่าง</Badge>
                    ) : (
                        <Badge variant="success" className="text-[10px]">ปกติ</Badge>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
