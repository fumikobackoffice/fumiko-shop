
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
import { StockAdjustmentTransaction } from '@/lib/types';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { 
  ArrowDownCircle, 
  ArrowUpCircle, 
  RefreshCw, 
  ShoppingCart, 
  RotateCcw,
  User,
  Trash2,
  PackagePlus
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface LedgerItem extends StockAdjustmentTransaction {
    productName: string;
    sku: string;
    attributes: string;
}

const getMovementInfo = (type: StockAdjustmentTransaction['type']) => {
    switch (type) {
        case 'PURCHASE':
            return { label: 'รับสินค้า (PO)', icon: ArrowDownCircle, color: 'text-green-600', bg: 'bg-green-50' };
        case 'MANUAL_ENTRY':
            return { label: 'รับสินค้า (แมนนวล)', icon: PackagePlus, color: 'text-emerald-600', bg: 'bg-emerald-50' };
        case 'SALE':
            return { label: 'ขายสินค้า', icon: ShoppingCart, color: 'text-blue-600', bg: 'bg-blue-50' };
        case 'ADJUST_ADD':
            return { label: 'ปรับปรุงเพิ่ม', icon: RefreshCw, color: 'text-teal-600', bg: 'bg-teal-50' };
        case 'ADJUST_DEDUCT':
            return { label: 'ปรับปรุงลด', icon: RefreshCw, color: 'text-orange-600', bg: 'bg-orange-50' };
        case 'WASTAGE':
            return { label: 'ตัดทิ้ง/ของเสีย', icon: Trash2, color: 'text-red-600', bg: 'bg-red-50' };
        case 'RETURN':
            return { label: 'คืนสต็อก', icon: RotateCcw, color: 'text-indigo-600', bg: 'bg-indigo-50' };
        default:
            return { label: type, icon: RefreshCw, color: 'text-slate-600', bg: 'bg-slate-50' };
    }
};

export function InventoryLedgerTable({ data }: { data: LedgerItem[] }) {
  if (data.length === 0) {
    return (
      <div className="rounded-lg border p-12 text-center text-muted-foreground bg-card">
        ไม่พบประวัติการเคลื่อนไหวสต็อก
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            <TableHead className="w-[150px]">วัน/เวลา</TableHead>
            <TableHead>สินค้า</TableHead>
            <TableHead>ประเภท</TableHead>
            <TableHead className="text-right">จำนวน</TableHead>
            <TableHead>เหตุผล / อ้างอิง</TableHead>
            <TableHead>ผู้ดำเนินการ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((item) => {
            const movement = getMovementInfo(item.type);
            const dateObj = item.createdAt ? new Date(item.createdAt) : new Date();
            const displayDate = format(dateObj, 'd MMM yy', { locale: th }) + ' ' + (dateObj.getFullYear() + 543).toString().slice(-2);
            const displayTime = format(dateObj, 'HH:mm');
            
            const isNegative = ['SALE', 'ADJUST_DEDUCT', 'WASTAGE'].includes(item.type);

            return (
              <TableRow key={item.id} className="hover:bg-muted/30 transition-colors">
                <TableCell className="text-xs leading-tight">
                  <div className="font-medium text-foreground">{displayDate}</div>
                  <div className="text-muted-foreground">{displayTime} น.</div>
                </TableCell>
                <TableCell>
                  <div className="font-bold text-sm leading-tight">{item.productName}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                    SKU: {item.sku} {item.attributes && `• ${item.attributes}`}
                  </div>
                </TableCell>
                <TableCell>
                  <div className={cn("inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-tight border", movement.bg, movement.color)}>
                    <movement.icon className="h-3 w-3" />
                    {movement.label}
                  </div>
                </TableCell>
                <TableCell className={cn("text-right font-mono font-bold text-sm", isNegative ? "text-destructive" : "text-green-600")}>
                  {isNegative ? '-' : '+'}{item.quantity.toLocaleString()}
                </TableCell>
                <TableCell className="max-w-[200px]">
                  <p className="text-xs line-clamp-2">{item.reason}</p>
                  <p className="text-[9px] text-muted-foreground font-mono mt-0.5">Lot: {item.lotId.substring(0, 8)}</p>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <User className="h-3 w-3" />
                    <span className="truncate max-w-[80px]">{item.adminName || 'System'}</span>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
