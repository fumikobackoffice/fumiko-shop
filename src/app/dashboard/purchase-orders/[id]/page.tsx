
'use client';

import { useAuth } from '@/hooks/use-auth';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState, useMemo, useTransition } from 'react';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { doc, updateDoc, serverTimestamp, getDocs, collection, runTransaction } from 'firebase/firestore';
import { PurchaseOrder, Supplier, OrderItem, ProductVariant, StockAdjustmentTransaction, StoreSettings } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button, buttonVariants } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Edit, DollarSign, Loader2, ReceiptText, Percent, XCircle, Eye, Upload, Image as ImageIcon, X, FilePlus, Save, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { CustomDialog } from '@/components/dashboard/custom-dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { clearGlobalCache } from '@/hooks/use-smart-fetch';

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

const getPaymentStatusVariant = (status?: 'UNPAID' | 'PAID') => {
  switch (status) {
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


export default function ViewPurchaseOrderPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const poId = params.id as string;
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [actionToConfirm, setActionToConfirm] = useState<'markAsPaid' | 'cancel' | null>(null);
  
  // States for Documents Management
  const [isSavingDocs, setIsSavingDocs] = useState(false);
  const [tempSlipUrl, setTempSlipUrl] = useState<string | null>(null);
  const [tempAdditionalImages, setTempAdditionalImages] = useState<string[]>([]);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // Granular Permission Check
  const canViewInventory = useMemo(() => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    const perms = user.permissions || [];
    return perms.includes('inventory:view') || perms.includes('inventory:manage') || perms.includes('manage_inventory');
  }, [user]);

  const canManageInventory = useMemo(() => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    const perms = user.permissions || [];
    return perms.includes('inventory:manage') || perms.includes('manage_inventory');
  }, [user]);

  const isReadOnly = useMemo(() => {
    return !canManageInventory;
  }, [canManageInventory]);

  const poRef = useMemoFirebase(() => doc(firestore, 'purchaseOrders', poId), [firestore, poId]);
  const { data: purchaseOrder, isLoading: isOrderLoading } = useDoc<PurchaseOrder>(poRef);
  
  const supplierRef = useMemoFirebase(() => purchaseOrder ? doc(firestore, 'suppliers', purchaseOrder.supplierId) : null, [firestore, purchaseOrder]);
  const { data: supplier, isLoading: isSupplierLoading } = useDoc<Supplier>(supplierRef);

  useEffect(() => {
    if (purchaseOrder) {
      setTempSlipUrl(purchaseOrder.paymentSlipUrl || null);
      setTempAdditionalImages(purchaseOrder.additionalImageUrls || []);
    }
  }, [purchaseOrder]);

  useEffect(() => {
    if (!loading && user && !canViewInventory) {
      router.replace('/dashboard');
    }
  }, [user, loading, router, canViewInventory]);
  
  const handleMarkAsPaidClick = () => {
    if (!canManageInventory) return;
    setTempSlipUrl(purchaseOrder?.paymentSlipUrl || null);
    setActionToConfirm('markAsPaid');
    setIsConfirmOpen(true);
  }

  const handleCancelOrderClick = () => {
    if (!canManageInventory) return;
    setActionToConfirm('cancel');
    setIsConfirmOpen(true);
  }

  const handleSlipFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Adjusted limit to 700KB because Base64 overhead adds ~33%
      if (file.size > 700 * 1024) {
        toast({ variant: 'destructive', title: 'ไฟล์มีขนาดใหญ่เกินไป', description: 'กรุณาเลือกไฟล์ที่มีขนาดไม่เกิน 700KB เพื่อป้องกันฐานข้อมูลเต็ม' });
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => setTempSlipUrl(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleAdditionalFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach(file => {
        if (file.size > 700 * 1024) {
          toast({ variant: 'destructive', title: 'ไฟล์ใหญ่เกินไป', description: `รูป ${file.name} มีขนาดเกิน 700KB` });
          return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
          if (ev.target?.result) {
            setTempAdditionalImages(prev => [...prev, ev.target?.result as string]);
          }
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const handleSaveDocs = async () => {
    if (!firestore || !purchaseOrder || !canManageInventory) return;
    setIsSavingDocs(true);
    try {
      await updateDoc(poRef, {
        paymentSlipUrl: tempSlipUrl,
        additionalImageUrls: tempAdditionalImages,
        updatedAt: serverTimestamp()
      });
      
      // Trigger refresh for Procurement Hub
      clearGlobalCache('procurement-hub-data');
      window.dispatchEvent(new CustomEvent('custom:po-updated'));
      
      toast({ title: 'บันทึกเอกสารสำเร็จ' });
    } catch (e: any) {
      console.error("Save docs failed:", e);
      toast({ 
        variant: 'destructive', 
        title: 'บันทึกล้มเหลว', 
        description: e.message?.includes('size') 
          ? 'ขนาดข้อมูลรวมในใบสั่งซื้อใหญ่เกินไป (จำกัด 1MB) กรุณาลบรูปบางส่วนหรือลดขนาดรูปภาพลง' 
          : e.message 
      });
    } finally {
      setIsSavingDocs(false);
    }
  };

  const confirmAction = () => {
    if (!actionToConfirm || !firestore || !canManageInventory) return;
    
    startTransition(async () => {
      try {
        if (actionToConfirm === 'markAsPaid') {
          await updateDoc(poRef, { 
            paymentStatus: 'PAID',
            paymentSlipUrl: tempSlipUrl,
            updatedAt: serverTimestamp()
          });
          toast({ title: 'สำเร็จ', description: 'ใบสั่งซื้อถูกทำเครื่องหมายว่าชำระเงินแล้ว' });
        } else if (actionToConfirm === 'cancel') {
          await updateDoc(poRef, { 
            status: 'CANCELLED',
            updatedAt: serverTimestamp()
          });
          toast({ title: 'ยกเลิกใบสั่งซื้อสำเร็จ' });
        }
        
        // Trigger refresh for Procurement Hub
        clearGlobalCache('procurement-hub-data');
        window.dispatchEvent(new CustomEvent('custom:po-updated'));

      } catch (error: any) {
        toast({ variant: 'destructive', title: 'เกิดข้อผิดพลาด', description: error.message });
      }
      setIsConfirmOpen(false);
      setActionToConfirm(null);
    });
  }

  const openPreview = (url: string) => {
    setPreviewImageUrl(url);
    setIsPreviewOpen(true);
  };

  if (loading || isOrderLoading || isSupplierLoading || !user || !canViewInventory) {
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <Skeleton className="h-9 w-48" />
                <Skeleton className="h-9 w-24" />
            </div>
             <Card>
                <CardHeader><Skeleton className="h-6 w-1/2" /></CardHeader>
                <CardContent className="space-y-4">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                </CardContent>
            </Card>
        </div>
    );
  }
  
  if (!purchaseOrder) return <p>ไม่พบใบสั่งซื้อ</p>;

  // Standard Principle: Allow editing ONLY if PO is in DRAFT state
  const isEditable = purchaseOrder.status === 'DRAFT' && canManageInventory;
  
  const isCancellable = purchaseOrder.status !== 'COMPLETED' && purchaseOrder.status !== 'CANCELLED' && purchaseOrder.status !== 'DRAFT' && canManageInventory;
  const canSaveDocs = (tempSlipUrl !== purchaseOrder.paymentSlipUrl || JSON.stringify(tempAdditionalImages) !== JSON.stringify(purchaseOrder.additionalImageUrls || [])) && canManageInventory;

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <Button variant="outline" onClick={() => router.push('/dashboard/purchase-orders')} className="mb-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              กลับไปที่รายการ
            </Button>
            <h1 className="text-3xl font-headline font-bold">ใบสั่งซื้อ #{purchaseOrder.poNumber}</h1>
            <div className="flex items-center gap-2 mt-2">
                <Badge variant={getStatusVariant(purchaseOrder.status)}>{getStatusText(purchaseOrder.status)}</Badge>
                <Badge variant={getPaymentStatusVariant(purchaseOrder.paymentStatus)}>{getPaymentStatusText(purchaseOrder.paymentStatus)}</Badge>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {isCancellable && (
              <Button variant="outline" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleCancelOrderClick}>
                <XCircle className="mr-2 h-4 w-4" /> ยกเลิกใบสั่งซื้อ
              </Button>
            )}
            {purchaseOrder.paymentStatus !== 'PAID' && purchaseOrder.status !== 'CANCELLED' && purchaseOrder.status !== 'DRAFT' && (
              <Button onClick={handleMarkAsPaidClick} className="bg-emerald-600 hover:bg-emerald-700">
                <DollarSign className="mr-2 h-4 w-4" /> ทำเครื่องหมายว่าชำระแล้ว
              </Button>
            )}
            {canManageInventory && (
              <Button variant="outline" onClick={() => router.push(`/dashboard/purchase-orders/${poId}/edit`)} disabled={!isEditable}>
                <Edit className="mr-2 h-4 w-4" /> แก้ไขข้อมูลใบสั่ง
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>รายการสินค้า</CardTitle>
                <CardDescription>
                  {purchaseOrder.taxMode === 'INCLUSIVE' ? 'ราคารวม VAT แล้ว' : purchaseOrder.taxMode === 'EXCLUSIVE' ? 'ราคาแยก VAT' : 'ไม่มี VAT / ยกเว้นภาษี'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead>สินค้า</TableHead>
                        <TableHead className="text-center">สั่งซื้อ</TableHead>
                        <TableHead className="text-center">รับแล้ว</TableHead>
                        <TableHead className="text-right">ราคา/หน่วย</TableHead>
                        <TableHead className="text-right">รวม</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {purchaseOrder.items.map((item, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            <p className="font-medium">{item.displayName}</p>
                            <p className="text-xs text-muted-foreground font-mono">{item.sku}</p>
                          </TableCell>
                          <TableCell className="text-center">{item.quantity}</TableCell>
                          <TableCell className="text-center">
                            <span className={cn(item.quantityReceived > 0 ? "font-bold text-primary" : "text-muted-foreground")}>
                              {item.quantityReceived || 0}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono">฿{item.cost.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</TableCell>
                          <TableCell className="text-right font-mono">฿{(item.quantity * item.cost).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter className="bg-transparent">
                        <TableRow className="border-t-2">
                            <TableCell colSpan={4} className="text-right text-muted-foreground text-xs"><ReceiptText className="h-3.5 w-3.5 inline mr-1" /> ยอดรวมสินค้า</TableCell>
                            <TableCell className="text-right text-xs font-mono">฿{purchaseOrder.subtotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</TableCell>
                        </TableRow>
                        {purchaseOrder.discountAmount > 0 && (
                            <TableRow>
                                <TableCell colSpan={4} className="text-right text-muted-foreground text-xs">ส่วนลด</TableCell>
                                <TableCell className="text-right text-xs text-destructive font-mono">- ฿{purchaseOrder.discountAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</TableCell>
                            </TableRow>
                        )}
                        {(purchaseOrder.shippingCost || 0) > 0 && (
                            <TableRow>
                                <TableCell colSpan={4} className="text-right text-muted-foreground text-xs">ค่าจัดส่ง</TableCell>
                                <TableCell className="text-right text-xs font-mono">฿{purchaseOrder.shippingCost!.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</TableCell>
                            </TableRow>
                        )}
                        {(purchaseOrder.otherCharges || 0) > 0 && (
                            <TableRow>
                                <TableCell colSpan={4} className="text-right text-muted-foreground text-xs">ค่าใช้จ่ายอื่น ๆ</TableCell>
                                <TableCell className="text-right text-xs font-mono">฿{purchaseOrder.otherCharges!.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</TableCell>
                            </TableRow>
                        )}
                        <TableRow>
                            <TableCell colSpan={4} className="text-right text-muted-foreground text-xs"><Percent className="h-3.5 w-3.5 inline mr-1" /> ภาษีมูลค่าเพิ่ม ({purchaseOrder.taxRate || 0}%)</TableCell>
                            <TableCell className="text-right text-xs font-mono">฿{purchaseOrder.taxAmount?.toLocaleString('th-TH', { minimumFractionDigits: 2 }) || '0.00'}</TableCell>
                        </TableRow>
                        <TableRow className="font-bold text-base bg-muted/30">
                            <TableCell colSpan={4} className="text-right">ยอดรวมสุทธิ</TableCell>
                            <TableCell className="text-right text-primary font-mono">฿{purchaseOrder.grandTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</TableCell>
                        </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle className="text-base">ข้อมูลแหล่งจัดซื้อ</CardTitle></CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div>
                  <Label className="text-[10px] text-muted-foreground uppercase font-bold">ชื่อบริษัท / ร้านค้า</Label>
                  <p className="font-bold text-base mt-0.5">{supplier?.name || '-'}</p>
                  <p className="text-xs text-muted-foreground font-mono">{supplier?.code}</p>
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-[10px] text-muted-foreground uppercase font-bold">วันที่สั่ง</Label>
                    <p className="font-medium mt-0.5">{purchaseOrder.orderDate.toDate().toLocaleDateString('th-TH')}</p>
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground uppercase font-bold">กำหนดรับของ</Label>
                    <p className="font-medium mt-0.5">{purchaseOrder.expectedDeliveryDate?.toDate().toLocaleDateString('th-TH') || '-'}</p>
                  </div>
                </div>
                {purchaseOrder.notes && (
                  <>
                    <Separator />
                    <div>
                      <Label className="text-[10px] text-muted-foreground uppercase font-bold">หมายเหตุ</Label>
                      <p className="mt-1 whitespace-pre-wrap text-foreground/80">{purchaseOrder.notes}</p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="border-primary/20">
              <CardHeader className="pb-3 border-b bg-muted/5">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-emerald-600" /> หลักฐานการชำระเงิน
                  </CardTitle>
                  {!isReadOnly && tempSlipUrl && (
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setTempSlipUrl(null)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                {tempSlipUrl ? (
                  <div className="space-y-3">
                    <div 
                      className="relative aspect-[9/16] w-full rounded-lg overflow-hidden border bg-black/5 cursor-zoom-in group"
                      onClick={() => openPreview(tempSlipUrl)}
                    >
                      <Image src={tempSlipUrl} alt="Slip" fill className="object-contain group-hover:opacity-90" />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/10">
                        <Eye className="text-white drop-shadow-md" />
                      </div>
                    </div>
                    {!isReadOnly && (
                      <div className="space-y-2">
                        <Label htmlFor="replace-slip" className={cn(buttonVariants({variant: 'outline', size: 'sm'}), "w-full cursor-pointer h-8 text-xs")}>
                          <Upload className="mr-2 h-3.5 w-3.5" /> เปลี่ยนรูปภาพสลิป
                          <input id="replace-slip" type="file" accept="image/*" className="hidden" onChange={handleSlipFileChange} />
                        </Label>
                        <div className="text-center">
                          <a 
                            href="https://www.iloveimg.com/th/compress-image/compress-jpg" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-[10px] text-muted-foreground underline hover:text-primary transition-colors"
                          >
                            อัปโหลดรูปไม่ได้? ย่อขนาดไฟล์รูป
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-2">
                    {!isReadOnly ? (
                      <div className="space-y-2">
                        <Label htmlFor="upload-slip-direct" className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer bg-muted/5 hover:bg-muted/30 transition-colors border-muted-foreground/30">
                          <Upload className="h-6 w-6 text-muted-foreground mb-2" />
                          <span className="text-xs text-muted-foreground font-medium">คลิกเพื่ออัปโหลดสลิป</span>
                          <input id="upload-slip-direct" type="file" accept="image/*" className="hidden" onChange={handleSlipFileChange} />
                        </Label>
                        <div className="text-center">
                          <a 
                            href="https://www.iloveimg.com/th/compress-image/compress-jpg" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-[10px] text-muted-foreground underline hover:text-primary transition-colors"
                          >
                            อัปโหลดรูปไม่ได้? ย่อขนาดไฟล์รูป
                          </a>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic text-center py-4">ไม่มีรูปภาพสลิปแนบไว้</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-primary/20">
              <CardHeader className="pb-3 border-b bg-muted/5">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-blue-600" /> เอกสารแนบอื่นๆ
                </CardTitle>
                <CardDescription className="text-[10px]">ใบเสร็จรับเงิน, ใบกำกับภาษี, ใบส่งของ ฯลฯ</CardDescription>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  {tempAdditionalImages.map((url, i) => (
                    <div key={i} className="relative aspect-square rounded-md overflow-hidden border bg-muted/20 group">
                      <Image src={url} alt={`Doc ${i+1}`} fill className="object-cover cursor-zoom-in" onClick={() => openPreview(url)} />
                      {!isReadOnly && (
                        <button 
                          className="absolute top-1 right-1 bg-destructive text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => setTempAdditionalImages(prev => prev.filter((_, idx) => idx !== i))}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ))}
                  {!isReadOnly && (
                    <div className="space-y-2">
                      <Label htmlFor="add-docs" className="aspect-square flex flex-col items-center justify-center rounded-md border-2 border-dashed bg-muted/5 text-muted-foreground hover:border-primary hover:text-primary transition-colors cursor-pointer">
                        <FilePlus className="h-5 w-5" />
                        <span className="text-[10px] font-bold mt-1 uppercase">เพิ่มรูป</span>
                        <input id="add-docs" type="file" accept="image/*" multiple className="hidden" onChange={handleAdditionalFilesChange} />
                      </Label>
                    </div>
                  )}
                </div>
                
                {!isReadOnly && (
                  <div className="text-center">
                    <a 
                      href="https://www.iloveimg.com/th/compress-image/compress-jpg" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-[10px] text-muted-foreground underline hover:text-primary transition-colors"
                    >
                      อัปโหลดรูปไม่ได้? ย่อขนาดไฟล์รูป
                    </a>
                  </div>
                )}
                
                {canSaveDocs && (
                  <Button 
                    className="w-full h-10 font-bold shadow-sm" 
                    onClick={handleSaveDocs} 
                    disabled={isSavingDocs}
                  >
                    {isSavingDocs ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    บันทึกเอกสารแนบ
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionToConfirm === 'markAsPaid' ? 'ยืนยันการชำระเงิน' : 'ยืนยันการยกเลิก'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {actionToConfirm === 'markAsPaid' 
                ? 'ยอดสุทธิที่ต้องชำระคือ ฿' + purchaseOrder.grandTotal.toLocaleString() + ' กรุณาตรวจสอบยอดเงินในสลิปให้ถูกต้องก่อนยืนยัน'
                : 'คุณแน่ใจหรือไม่ว่าต้องการยกเลิกใบสั่งซื้อนี้? การดำเนินการนี้ไม่สามารถย้อนกลับได้'}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {actionToConfirm === 'markAsPaid' && (
            <div className="py-4 space-y-4">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">แนบหลักฐานการโอน (สลิป)</Label>
              {!tempSlipUrl ? (
                <div className="space-y-2">
                  <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-xl cursor-pointer hover:bg-muted/50 transition-colors border-muted-foreground/30">
                    <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-xs text-muted-foreground">คลิกเพื่อเลือกไฟล์สลิป</p>
                    <input type="file" className="hidden" accept="image/*" onChange={handleSlipFileChange} />
                  </label>
                  <div className="text-center">
                    <a 
                      href="https://www.iloveimg.com/th/compress-image/compress-jpg" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-[10px] text-muted-foreground underline hover:text-primary transition-colors"
                    >
                      อัปโหลดรูปไม่ได้? ย่อขนาดไฟล์รูป
                    </a>
                  </div>
                </div>
              ) : (
                <div className="relative w-full aspect-[9/16] rounded-xl overflow-hidden border bg-black/5 max-w-[180px] mx-auto group">
                  <Image src={tempSlipUrl} alt="Preview Slip" fill className="object-contain" />
                  <button className="absolute top-2 right-2 bg-destructive text-white rounded-full p-1" onClick={() => setTempSlipUrl(null)}><X className="h-4 w-4" /></button>
                </div>
              )}
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmAction} 
              disabled={isPending}
              className={cn(actionToConfirm === 'cancel' ? "bg-destructive hover:bg-destructive/90" : "bg-emerald-600 hover:bg-emerald-700 text-white")}
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {actionToConfirm === 'markAsPaid' ? 'ยืนยันชำระเงิน' : 'ยืนยันการยกเลิก'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Image Previewer */}
      <CustomDialog 
        isOpen={isPreviewOpen} 
        onClose={() => setIsPreviewOpen(false)} 
        title="ตัวอย่างเอกสาร"
        size="lg"
      >
        <div className="relative w-full aspect-auto min-h-[400px] flex items-center justify-center bg-black/5 rounded-lg overflow-hidden mt-2">
          {previewImageUrl && (
            <Image src={previewImageUrl} alt="Full view" width={800} height={1200} className="object-contain max-h-[80vh]" />
          )}
        </div>
        <div className="flex justify-end mt-6 pt-4 border-t">
          <Button variant="outline" onClick={() => setIsPreviewOpen(false)}>ปิดหน้าต่าง</Button>
        </div>
      </CustomDialog>
    </>
  );
}
