
'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { Loader2, Info } from 'lucide-react';
import { useFirestore } from '@/firebase';
import { collection, serverTimestamp, writeBatch, doc, arrayUnion } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { PurchaseOrder, InventoryLot, StockAdjustmentTransaction } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '@/hooks/use-auth';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../ui/alert-dialog';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { clearGlobalCache } from '@/hooks/use-smart-fetch';

interface ReceiveStockFormProps {
  purchaseOrder: PurchaseOrder;
}

async function executeFirestoreUpdate(
  firestore: any,
  adminUser: any,
  purchaseOrder: PurchaseOrder,
  itemsToReceiveInTransaction: { productVariantId: string, quantityToReceive: number }[]
) {
  const batch = writeBatch(firestore);
  const poRef = doc(firestore, 'purchaseOrders', purchaseOrder.id);
  const subtotal = purchaseOrder.subtotal > 0 ? purchaseOrder.subtotal : purchaseOrder.items.reduce((sum, i) => sum + (i.quantity * i.cost), 0);
  const landedCostFactor = subtotal > 0 ? purchaseOrder.grandTotal / subtotal : 1;

  const finalPOItemsArray = purchaseOrder.items.map(originalItem => {
    const receivedItem = itemsToReceiveInTransaction.find(
      i => i.productVariantId === originalItem.productVariantId
    );
    const quantityReceivedThisTime = receivedItem ? receivedItem.quantityToReceive : 0;

    if (quantityReceivedThisTime > 0) {
      const variantRef = doc(firestore, 'productGroups', originalItem.productGroupId, 'productVariants', originalItem.productVariantId);
      const adjustmentRef = doc(collection(firestore, 'productGroups', originalItem.productGroupId, 'productVariants', originalItem.productVariantId, 'stockAdjustments'));
      
      const newLotId = uuidv4();
      const allocatedCostPerItem = originalItem.cost * landedCostFactor;

      const newLot: InventoryLot = {
        lotId: newLotId,
        quantity: quantityReceivedThisTime,
        cost: allocatedCostPerItem,
        receivedAt: new Date(),
        supplierId: purchaseOrder.supplierId,
        purchaseOrderNumber: purchaseOrder.poNumber,
      };

      const adjustmentData: Omit<StockAdjustmentTransaction, 'id' | 'createdAt'> = {
        productVariantId: originalItem.productVariantId,
        lotId: newLotId,
        adminUserId: adminUser.id,
        adminName: adminUser.name,
        type: 'PURCHASE', // Updated from INITIAL to PURCHASE
        quantity: quantityReceivedThisTime,
        reason: `รับสินค้าจาก PO #${purchaseOrder.poNumber}`,
      };

      batch.update(variantRef, { inventoryLots: arrayUnion(newLot) });
      batch.set(adjustmentRef, { ...adjustmentData, createdAt: serverTimestamp() });
    }

    return {
      ...originalItem,
      quantityReceived: (Number(originalItem.quantityReceived) || 0) + quantityReceivedThisTime
    };
  });

  const totalQuantityOrdered = finalPOItemsArray.reduce(
    (sum, item) => sum + Number(item.quantity), 0
  );
  const totalQuantityReceived = finalPOItemsArray.reduce(
    (sum, item) => sum + Number(item.quantityReceived), 0
  );

  const newStatus = totalQuantityReceived >= totalQuantityOrdered ? 'COMPLETED' : 'PARTIALLY_RECEIVED';

  batch.update(poRef, {
    items: finalPOItemsArray,
    status: newStatus,
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
}


export function ReceiveStockForm({ purchaseOrder }: ReceiveStockFormProps) {
  const { toast } = useToast();
  const firestore = useFirestore();
  const router = useRouter();
  const { user: adminUser } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [quantitiesToReceive, setQuantitiesToReceive] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [itemsToSubmit, setItemsToSubmit] = useState<{ productVariantId: string, quantityToReceive: number }[]>([]);

  const handleOpenConfirmation = async () => {
    setErrors({});
    let hasError = false;
    const newErrors: Record<string, string> = {};

    const itemsPayload = purchaseOrder.items.map(item => {
      const valueStr = quantitiesToReceive[item.productVariantId] || '';
      const quantityToReceive = parseInt(valueStr, 10);
      const remainingQty = Number(item.quantity) - Number(item.quantityReceived || 0);
      
      if (valueStr === '') {
        return { productVariantId: item.productVariantId, quantityToReceive: 0 };
      }

      if (isNaN(quantityToReceive) || quantityToReceive < 0) {
        newErrors[item.productVariantId] = "ต้องเป็นตัวเลขไม่น้อยกว่า 0";
        hasError = true;
      } else if (quantityToReceive > remainingQty) {
        newErrors[item.productVariantId] = `รับได้ไม่เกิน ${remainingQty} ชิ้น`;
        hasError = true;
      }
      
      return { productVariantId: item.productVariantId, quantityToReceive };
    });

    if (hasError) {
      setErrors(newErrors);
      return;
    }

    const itemsToActuallyReceive = itemsPayload.filter(item => item.quantityToReceive > 0);

    if (itemsToActuallyReceive.length === 0) {
      toast({
        variant: 'destructive',
        title: 'ไม่มีรายการรับ',
        description: 'กรุณากรอกจำนวนสินค้าที่ต้องการรับอย่างน้อย 1 รายการ',
      });
      return;
    }
    
    setItemsToSubmit(itemsToActuallyReceive);
    setIsConfirmOpen(true);
  };
  
  const handleConfirmSubmit = async () => {
    if (itemsToSubmit.length === 0) {
      toast({ variant: 'destructive', title: 'เกิดข้อผิดพลาด', description: 'ไม่มีรายการที่จะบันทึก' });
      setIsConfirmOpen(false);
      return;
    }

    setIsSubmitting(true);
    try {
      await executeFirestoreUpdate(firestore, adminUser, purchaseOrder, itemsToSubmit);
      
      // Trigger refresh for Procurement Hub
      clearGlobalCache('procurement-hub-data');
      window.dispatchEvent(new CustomEvent('custom:po-updated'));
      
      toast({ title: 'รับสินค้าสำเร็จ', description: `บันทึกการรับสินค้าสำหรับ PO #${purchaseOrder.poNumber} แล้ว` });
      router.push('/dashboard/purchase-orders');
    } catch (error: any) {
      console.error("Error receiving stock:", error);
      toast({ variant: "destructive", title: "เกิดข้อผิดพลาด", description: error.message || 'ไม่สามารถบันทึกข้อมูลได้' });
    } finally {
      setIsSubmitting(false);
      setIsConfirmOpen(false);
    }
  };


  const handleQuantityChange = (productVariantId: string, value: string) => {
    const numericValue = value.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');
    setQuantitiesToReceive(prev => ({
      ...prev,
      [productVariantId]: numericValue,
    }));
    if (errors[productVariantId]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[productVariantId];
        return newErrors;
      });
    }
  };

  return (
    <>
      <div className="space-y-6">
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>สินค้า</TableHead>
                <TableHead className="text-center">จำนวนสั่งซื้อ</TableHead>
                <TableHead className="text-center">รับแล้ว</TableHead>
                <TableHead className="w-[150px] text-center">จำนวนที่รับ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchaseOrder.items.map((item) => {
                return (
                  <TableRow key={item.productVariantId}>
                    <TableCell>
                      <p className="font-medium">{item.displayName}</p>
                      <p className="text-xs text-muted-foreground">{item.sku}</p>
                    </TableCell>
                    <TableCell className="text-center">{item.quantity}</TableCell>
                    <TableCell className="text-center">{item.quantityReceived || 0}</TableCell>
                    <TableCell>
                      <Input
                        type="text"
                        inputMode="numeric"
                        placeholder="0"
                        value={quantitiesToReceive[item.productVariantId] || ''}
                        onChange={(e) => handleQuantityChange(item.productVariantId, e.target.value)}
                        className="text-center"
                      />
                      {errors[item.productVariantId] && (
                          <p className="text-sm font-medium text-destructive mt-2">
                              {errors[item.productVariantId]}
                          </p>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <Alert className="mt-6">
          <Info className="h-4 w-4" />
          <AlertTitle>หมายเหตุ</AlertTitle>
          <AlertDescription>
            การรับสินค้าจะสร้าง "ล็อตสินค้า" ใหม่พร้อมกับต้นทุนที่คำนวณตามจริง (Landed Cost) จากใบสั่งซื้อ และจะบันทึกประวัติการปรับปรุงสต็อกโดยอัตโนมัติ
          </AlertDescription>
        </Alert>
        <div className="flex justify-end mt-6">
          <Button type="button" onClick={handleOpenConfirmation} disabled={isSubmitting} size="lg">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            ยืนยันการรับสินค้า
          </Button>
        </div>
      </div>
      <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการรับสินค้า?</AlertDialogTitle>
            <AlertDialogDescription>
              คุณแน่ใจหรือไม่ว่าต้องการบันทึกการรับสินค้านี้? การกระทำนี้จะอัปเดตสต็อกและไม่สามารถย้อนกลับได้โดยง่าย
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmSubmit} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              ยืนยัน
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
