'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tags } from 'lucide-react';
import { PriceTier } from '@/lib/types';

interface PriceTierInfoProps {
  tiers: PriceTier[];
  basePrice: number;
  unit: string;
}

export function PriceTierInfo({ tiers, basePrice, unit }: PriceTierInfoProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!tiers || tiers.length === 0) {
    return null;
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-primary"
        onClick={() => setIsOpen(true)}
        aria-label="ดูราคาขั้นบันได"
      >
        <Tags className="h-4 w-4" />
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-headline">ราคาขั้นบันได</DialogTitle>
            <DialogDescription>
              ยิ่งซื้อมาก ยิ่งราคาถูกลงต่อชิ้น
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>จำนวน</TableHead>
                  <TableHead className="text-right">ราคาต่อ {unit}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>1 - {tiers[0].minQuantity - 1} ชิ้น</TableCell>
                  <TableCell className="text-right font-semibold">฿{basePrice.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                </TableRow>
                {tiers.map((tier, index) => {
                  const nextTier = tiers[index + 1];
                  const quantityRange = nextTier
                    ? `${tier.minQuantity} - ${nextTier.minQuantity - 1} ชิ้น`
                    : `${tier.minQuantity} ชิ้นขึ้นไป`;
                  return (
                    <TableRow key={tier.minQuantity}>
                      <TableCell>{quantityRange}</TableCell>
                      <TableCell className="text-right font-semibold text-primary">฿{tier.price.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
