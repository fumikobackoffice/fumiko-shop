
'use client';

import { useParams, useRouter } from 'next/navigation';
import { useDoc, useFirestore, useMemoFirebase, useCollection } from '@/firebase';
import { runTransaction, collection, getDocs, doc, query, increment, updateDoc, serverTimestamp, where, limit, Timestamp } from 'firebase/firestore';
import { Order, OrderItem, ProductVariant, StoreSettings, BankAccount, StockAdjustmentTransaction, InventoryLot } from '@/lib/types';
import { Header } from '@/components/shared/header';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Banknote, Clock, Upload, Loader2, Image as ImageIcon, X, Info, ChevronLeft, Copy, XCircle, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { useAuth } from '@/hooks/use-auth';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useCart } from '@/hooks/use-cart';
import Link from 'next/link';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from '@/lib/utils';
import { CustomDialog } from '@/components/dashboard/custom-dialog';
import { useUploadImage } from '@/firebase/storage/use-storage';

function CountdownTimer({ expiryTimestamp, onExpiry }: { expiryTimestamp: any, onExpiry: () => void }) {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const intervalId = setInterval(() => {
      const expiryDate = expiryTimestamp?.toDate ? expiryTimestamp.toDate() : (expiryTimestamp ? new Date(expiryTimestamp) : null);
      if (!expiryDate) {
        setTimeLeft('N/A');
        return;
      }
      
      const now = new Date().getTime();
      const distance = expiryDate.getTime() - now;

      if (distance < 0) {
        clearInterval(intervalId);
        setTimeLeft("หมดเวลา");
        onExpiry();
        return;
      }

      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);

      setTimeLeft(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    }, 1000);

    return () => clearInterval(intervalId);
  }, [expiryTimestamp, onExpiry]);

  return (
    <div className="text-center">
        <p className="text-sm text-muted-foreground">เหลือเวลาในการชำระเงิน</p>
        <p className="text-2xl font-bold tracking-widest">{timeLeft}</p>
    </div>
  );
}


function PaymentPageContents({ orderId }: { orderId: string }) {
    const firestore = useFirestore();
    const router = useRouter();
    const { user } = useAuth();
    const { toast } = useToast();
    const orderRef = useMemoFirebase(() => doc(firestore, 'orders', orderId), [firestore, orderId]);
    const { data: order, isLoading: isOrderLoading, error } = useDoc<Order>(orderRef);
    
    const settingsRef = useMemoFirebase(() => firestore ? doc(firestore, 'settings', 'store') : null, [firestore]);
    const { data: storeSettings } = useDoc<StoreSettings>(settingsRef);
    const pointsRate = storeSettings?.pointsRate || 100;
    
    const bankAccountsQuery = useMemoFirebase(() => 
        firestore ? query(collection(firestore, 'bankAccounts'), where('isActive', '==', true), limit(1)) : null, 
        [firestore]
    );
    const { data: activeBankAccounts, isLoading: areAccountsLoading } = useCollection<BankAccount>(bankAccountsQuery);
    const activeAccount = useMemo(() => (activeBankAccounts && activeBankAccounts.length > 0 ? activeBankAccounts[0] : null), [activeBankAccounts]);

    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isExpired, setIsExpired] = useState(false);
    const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
    const [isSuccessDialogOpen, setIsSuccessDialogOpen] = useState(false);
    
    const { uploadImage } = useUploadImage();

    const executeOrderCancellation = useCallback(async (isAutoExpiry: boolean = false) => {
        if (!firestore || !order || order.status !== 'PENDING_PAYMENT' || isSubmitting) {
            if (isAutoExpiry) setIsExpired(true);
            return;
        }
    
        setIsSubmitting(true);
        try {
            const orderItemsQuery = collection(firestore, 'orders', order.id, 'orderItems');
            const orderItemsSnapshot = await getDocs(orderItemsQuery);
            const freshItems = orderItemsSnapshot.docs.map(doc => ({...doc.data(), id: doc.id} as OrderItem));
    
            await runTransaction(firestore, async (transaction) => {
                // PHASE 1: READS ONLY
                const orderDocRef = doc(firestore, 'orders', order.id);
                const freshOrderSnap = await transaction.get(orderDocRef);
                
                if (!freshOrderSnap.exists() || freshOrderSnap.data().status !== 'PENDING_PAYMENT') {
                    return; 
                }
                const freshOrder = freshOrderSnap.data() as Order;

                const variantDataMap = new Map<string, { vId: string, gId: string, fulfilledLots: any[] }>();
                const addVariantInfo = (vId: string, gId: string, fulfilledLots: any[]) => {
                    const key = `${gId}|${vId}`;
                    if (!variantDataMap.has(key)) {
                        variantDataMap.set(key, { vId, gId, fulfilledLots: [] });
                    }
                    variantDataMap.get(key)!.fulfilledLots.push(...fulfilledLots);
                };

                for (const item of freshItems) {
                    if (item.type === 'PRODUCT' && item.productGroupId && item.fulfilledFromLots) {
                        addVariantInfo(item.productId, item.productGroupId, item.fulfilledFromLots);
                    } else if (item.type === 'PACKAGE' && item.fulfilledFromLots) {
                        for (const pkgFulfillment of item.fulfilledFromLots) {
                            if (pkgFulfillment.variantId && pkgFulfillment.groupId && pkgFulfillment.lots) {
                                addVariantInfo(pkgFulfillment.variantId, pkgFulfillment.groupId, pkgFulfillment.lots);
                            }
                        }
                    }
                }

                const variantSnapshots = new Map<string, any>();
                const variantKeys = Array.from(variantDataMap.keys());
                
                // Read all variants inside transaction
                await Promise.all(variantKeys.map(async (key) => {
                    const [gId, vId] = key.split('|');
                    const vRef = doc(firestore, 'productGroups', gId, 'productVariants', vId);
                    const snap = await transaction.get(vRef);
                    if (snap.exists()) {
                        variantSnapshots.set(key, snap.data());
                    }
                }));

                // PHASE 2: WRITES ONLY
                for (const [key, info] of Array.from(variantDataMap.entries())) {
                    const variantData = variantSnapshots.get(key);
                    if (!variantData) continue;

                    const [gId, vId] = key.split('|');
                    const currentLots = variantData.inventoryLots || [];
                    const lotMap = new Map(currentLots.map((lot: any) => [lot.lotId, { ...lot }]));

                    for (const fulfilled of info.fulfilledLots) {
                        const qty = Number(fulfilled.quantity) || 0;
                        if (lotMap.has(fulfilled.lotId)) {
                            const lot = lotMap.get(fulfilled.lotId)!;
                            lot.quantity = Number(lot.quantity) + qty;
                        } else {
                            lotMap.set(fulfilled.lotId, {
                                lotId: fulfilled.lotId,
                                quantity: qty,
                                cost: Number(fulfilled.costPerItem) || 0,
                                receivedAt: new Date()
                            });
                        }

                        const adjustmentRef = doc(collection(firestore, 'productGroups', gId, 'productVariants', vId, 'stockAdjustments'));
                        transaction.set(adjustmentRef, {
                            productVariantId: vId,
                            lotId: fulfilled.lotId,
                            adminUserId: user?.id || 'system',
                            adminName: user?.name || 'ระบบอัตโนมัติ',
                            type: 'RETURN', // Corrected type to 'RETURN'
                            quantity: qty,
                            reason: `คืนสต็อกจากการ${isAutoExpiry ? 'หมดอายุ' : 'ยกเลิก'}ออเดอร์ #${order.id.substring(0, 6)}`,
                            createdAt: serverTimestamp()
                        });
                    }
                    
                    const variantRef = doc(firestore, 'productGroups', gId, 'productVariants', vId);
                    transaction.update(variantRef, { inventoryLots: Array.from(lotMap.values()) });
                }
    
                if (freshOrder.pointsUsed && freshOrder.pointsUsed > 0) {
                    const userRef = doc(firestore, 'users', order.buyerId);
                    transaction.update(userRef, { pointsBalance: increment(freshOrder.pointsUsed) });
                    
                    const pointsTransactionRef = doc(collection(firestore, 'users', order.buyerId, 'pointTransactions'));
                    transaction.set(pointsTransactionRef, {
                        userId: order.buyerId,
                        type: 'ADJUSTMENT_ADD',
                        amount: freshOrder.pointsUsed,
                        description: `คืนคะแนนจากการ${isAutoExpiry ? 'หมดอายุ' : 'ยกเลิก'}ออเดอร์ #${order.id.substring(0, 6)}`,
                        orderId: order.id,
                        createdAt: serverTimestamp()
                    });
                }
                
                transaction.update(orderDocRef, { 
                    status: isAutoExpiry ? 'EXPIRED' : 'CANCELLED', 
                    updatedAt: serverTimestamp() 
                });
            });
    
            if (isAutoExpiry) {
                toast({
                    variant: "destructive",
                    title: "ออเดอร์หมดเวลา",
                    description: "รายการสินค้าคงคลังและคะแนนของคุณถูกคืนเข้าระบบแล้ว",
                });
                setIsExpired(true);
            } else {
                toast({
                    title: "ยกเลิกคำสั่งซื้อสำเร็จ",
                    description: "คืนสินค้าเข้าสต็อกและคืนคะแนนสะสมเรียบร้อยแล้ว",
                });
                setIsCancelDialogOpen(false);
            }
    
        } catch (e: any) {
            console.error("Failed to cancel/expire order:", e);
            toast({ variant: "destructive", title: "เกิดข้อผิดพลาด", description: "ไม่สามารถดำเนินการได้ในขณะนี้" });
            if (isAutoExpiry) setIsExpired(true);
        } finally {
            setIsSubmitting(false);
        }
    }, [firestore, order, toast, isSubmitting, user, pointsRate]);

    const handleExpiry = useCallback(async () => {
        await executeOrderCancellation(true);
    }, [executeOrderCancellation]);

    const handleCancelOrder = useCallback(async () => {
        await executeOrderCancellation(false);
    }, [executeOrderCancellation]);

    useEffect(() => {
      if (order && order.expiresAt && order.status === 'PENDING_PAYMENT') {
        const checkExpiry = () => {
            const now = new Date().getTime();
            const expiryDate = order.expiresAt.toDate ? order.expiresAt.toDate().getTime() : new Date(order.expiresAt).getTime();
            if (now > expiryDate) {
                handleExpiry();
            }
        };
        checkExpiry();
        const timer = setInterval(checkExpiry, 5000);
        return () => clearInterval(timer);
      }
    }, [order, handleExpiry]);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            if (file.size > 5 * 1024 * 1024) { 
                toast({ 
                    variant: 'destructive', 
                    title: 'ไฟล์มีขนาดใหญ่เกินไป', 
                    description: 'กรุณาเลือกไฟล์ที่มีขนาดไม่เกิน 5MB' 
                });
                return;
            }
            setSelectedFile(file);
            setPreviewUrl(URL.createObjectURL(file));
        }
    };
    
    const removeSelectedFile = () => {
        setSelectedFile(null);
        setPreviewUrl(null);
        const fileInput = document.getElementById('slip-upload') as HTMLInputElement;
        if(fileInput) fileInput.value = '';
    }

    const handleUploadAndSubmit = async () => {
        if (!selectedFile) {
            toast({ variant: 'destructive', title: 'กรุณาเลือกไฟล์สลิป' });
            return;
        }
        if (!order) return;
        if (isExpired || order.status !== 'PENDING_PAYMENT') {
            toast({ variant: 'destructive', title: 'ไม่สามารถชำระเงินได้', description: 'ออเดอร์นี้หมดเวลาหรือถูกดำเนินการแล้ว' });
            return;
        }

        setIsUploading(true);
        try {
            const url = await uploadImage(selectedFile, `payments/${order.id}`);
            await updateDoc(orderRef, {
                paymentSlipUrl: url,
                status: 'PROCESSING',
                isNew: true,
                updatedAt: serverTimestamp(),
            });

            toast({ title: 'แจ้งชำระเงินสำเร็จ', description: 'เราได้รับสลิปของคุณแล้ว และจะทำการตรวจสอบโดยเร็วที่สุด' });
            setIsSuccessDialogOpen(true);
        } catch (err: any) {
            console.error("Submission failed: ", err);
            toast({ 
                variant: 'destructive', 
                title: 'การส่งข้อมูลล้มเหลว', 
                description: 'เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ หรือบันทึกข้อมูล กรุณาลองใหม่อีกครั้ง' 
            });
        } finally {
            setIsUploading(false);
        }
    };

    const isLoading = isOrderLoading || areAccountsLoading;

    if (isLoading) {
        return <div className="max-w-2xl auto py-8"><Skeleton className="h-96 w-full" /></div>;
    }

    if (error) {
        return <div className="text-center text-destructive py-10">เกิดข้อผิดพลาดในการโหลดข้อมูลคำสั่งซื้อ</div>;
    }

    if (!order) {
        return <div className="text-center text-muted-foreground py-10">ไม่พบข้อมูลคำสั่งซื้อ</div>;
    }

    const isPaymentPending = order.status === 'PENDING_PAYMENT' && !isExpired;
    const hasSlipUploaded = !!order.paymentSlipUrl;

    const getOrderBadgeVariant = () => {
      if (order.status === 'EXPIRED') return 'outline';
      if (order.status === 'CANCELLED') return 'destructive';
      if (isPaymentPending) return 'secondary';
      return 'info';
    }

    const getOrderBadgeText = () => {
      if (order.status === 'EXPIRED') return 'หมดอายุแล้ว';
      if (order.status === 'CANCELLED') return 'ยกเลิกแล้ว';
      if (isPaymentPending) return 'รอชำระเงิน';
      return 'รอตรวจสอบ';
    }

    return (
        <div className="max-w-2xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <Button variant="ghost" asChild className="-ml-4 text-muted-foreground hover:text-foreground">
                    <Link href="/dashboard/orders">
                        <ChevronLeft className="mr-2 h-4 w-4" />
                        กลับไปที่รายการคำสั่งซื้อ
                    </Link>
                </Button>
                
                {isPaymentPending && (
                    <AlertDialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
                        <AlertDialogTrigger asChild>
                            <Button variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                                <XCircle className="mr-2 h-4 w-4" />
                                ยกเลิกคำสั่งซื้อ
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>ยืนยันการยกเลิกคำสั่งซื้อ?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    การดำเนินการนี้จะคืนสินค้าเข้าสู่สต็อกและคืนคะแนนสะสมที่คุณใช้ไปทันที คุณแน่ใจหรือไม่ที่จะยกเลิกคำสั่งซื้อนี้?
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel disabled={isSubmitting}>ย้อนกลับ</AlertDialogCancel>
                                <AlertDialogAction 
                                    onClick={(e) => { e.preventDefault(); handleCancelOrder(); }} 
                                    disabled={isSubmitting}
                                    className={cn(buttonVariants({ variant: "destructive" }))}
                                >
                                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    ยืนยันการยกเลิก
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                )}
            </div>

            <Card className="w-full">
                <CardHeader>
                    <CardTitle className="font-headline text-2xl md:text-3xl">ชำระเงินสำหรับคำสั่งซื้อ</CardTitle>
                    <CardDescription>รหัสอ้างอิง: {order.id}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="border rounded-lg p-6 space-y-4 bg-muted/50">
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground">สถานะ</span>
                            <Badge variant={getOrderBadgeVariant()}>
                            {getOrderBadgeText()}
                            </Badge>
                        </div>
                        <div className="flex justify-between items-center text-lg">
                            <span className="text-muted-foreground">ยอดที่ต้องชำระ</span>
                            <span className="font-bold text-primary text-2xl">฿{order.totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        {isPaymentPending && order.expiresAt && (
                        <div className="pt-4 border-t">
                            <CountdownTimer expiryTimestamp={order.expiresAt} onExpiry={handleExpiry} />
                        </div>
                        )}
                    </div>

                    {isPaymentPending && (
                        <div className="text-center p-6 border-2 border-dashed rounded-lg">
                            <h3 className="font-semibold text-lg">ข้อมูลการโอนเงิน</h3>
                            <p className="text-muted-foreground mt-1">กรุณาโอนเงินมาที่บัญชีด้านล่างนี้</p>
                            {areAccountsLoading ? (
                                <div className="mt-4 space-y-2 inline-block text-left">
                                    <Skeleton className="h-5 w-48" />
                                    <Skeleton className="h-5 w-40" />
                                    <Skeleton className="h-5 w-32" />
                                </div>
                            ) : activeAccount ? (
                                <div className="mt-4 text-left inline-block space-y-1">
                                    <p><strong>ธนาคาร:</strong> {activeAccount.bankName}</p>
                                    <p><strong>ชื่อบัญชี:</strong> {activeAccount.accountName}</p>
                                    <div className="flex items-center gap-2">
                                        <p><strong>เลขที่บัญชี:</strong> {activeAccount.accountNumber}</p>
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            className="h-8 w-8 p-0" 
                                            title="คัดลอกเลขบัญชี"
                                            onClick={() => {
                                                navigator.clipboard.writeText(activeAccount.accountNumber);
                                                toast({ title: 'คัดลอกเลขบัญชีแล้ว', description: activeAccount.accountNumber });
                                            }}
                                        >
                                            <Copy className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <p className="mt-4 text-muted-foreground">ยังไม่ได้ตั้งค่าข้อมูลบัญชีธนาคาร</p>
                            )}
                        </div>
                    )}


                    {isPaymentPending ? (
                        <div>
                            <h3 className="font-semibold text-lg mb-2">แจ้งชำระเงิน</h3>
                            {!previewUrl ? (
                                <>
                                    <label htmlFor="slip-upload" className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer bg-card hover:bg-accent transition-colors">
                                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                            <Upload className="w-8 h-8 mb-2 text-muted-foreground" />
                                            <p className="mb-1 text-sm text-muted-foreground">คลิกเพื่อเลือกไฟล์สลิป</p>
                                            <p className="text-xs text-muted-foreground">PNG, JPG, หรือ WEBP (สูงสุด 700KB)</p>
                                        </div>
                                        <input id="slip-upload" type="file" className="hidden" accept="image/png, image/jpeg, image/webp" onChange={handleFileChange} />
                                    </label>
                                    <div className="mt-2 text-center">
                                        <a 
                                            href="https://www.iloveimg.com/th/compress-image/compress-jpg" 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="text-xs text-muted-foreground underline hover:text-primary transition-colors"
                                        >
                                            อัปโหลดรูปไม่ได้? ย่อขนาดไฟล์รูป
                                        </a>
                                    </div>
                                </>
                            ) : (
                                <div className="relative w-full max-w-sm mx-auto border p-2 rounded-lg">
                                    <Image src={previewUrl} alt="ตัวอย่างสลิป" width={400} height={600} className="rounded-md w-full h-auto object-contain" />
                                    <Button variant="destructive" size="icon" className="absolute -top-3 -right-3 h-7 w-7 rounded-full" onClick={removeSelectedFile} disabled={isUploading}>
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <Alert>
                            <Info className="h-4 w-4" />
                            <AlertTitle>{order.status === 'EXPIRED' ? 'ออเดอร์หมดอายุ' : order.status === 'CANCELLED' ? 'ออเดอร์ถูกยกเลิก' : 'แจ้งชำระเงินแล้ว'}</AlertTitle>
                            <AlertDescription>
                            {order.status === 'EXPIRED' || order.status === 'CANCELLED'
                                ? 'รายการนี้ไม่สามารถชำระเงินได้แล้ว กรุณาสร้างคำสั่งซื้อใหม่หากยังต้องการสินค้า' 
                                : (hasSlipUploaded 
                                    ? 'เราได้รับข้อมูลการชำระเงินของคุณแล้ว และกำลังดำเนินการตรวจสอบ' 
                                    : 'กำลังประมวลผลการอัปโหลดข้อมูลของคุณ...')
                            }
                            </AlertDescription>
                        </Alert>
                    )}
                </CardContent>
                {isPaymentPending && (
                    <CardFooter>
                        <Button 
                            className="w-full" 
                            size="lg" 
                            onClick={handleUploadAndSubmit} 
                            disabled={!selectedFile || isUploading || isExpired || isSubmitting}
                        >
                            {isUploading || isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Banknote className="mr-2 h-4 w-4" />}
                            {isUploading ? 'กำลังส่งข้อมูลและอัปโหลดสลิป...' : isSubmitting ? 'กำลังดำเนินการ...' : 'ยืนยันการแจ้งชำระเงิน'}
                        </Button>
                    </CardFooter>
                )}
            </Card>

            <CustomDialog 
                isOpen={isSuccessDialogOpen} 
                onClose={() => setIsSuccessDialogOpen(false)} 
                title="แจ้งชำระเงินสำเร็จ!"
            >
                <div className="space-y-4 pt-2">
                    <div className="flex flex-col items-center text-center gap-4 py-4">
                        <div className="h-16 w-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
                            <CheckCircle2 className="h-10 w-10" />
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            ระบบได้รับหลักฐานการโอนเงินของท่านแล้วครับ เจ้าหน้าที่จะดำเนินการตรวจสอบและปรับสถานะออเดอร์โดยเร็วที่สุด
                        </p>
                        <Alert className="bg-amber-50 border-amber-200 text-amber-900">
                            <Info className="h-4 w-4 text-amber-600" />
                            <AlertTitle className="font-bold text-left">ข้อแนะนำสำคัญ</AlertTitle>
                            <AlertDescription className="text-xs text-left leading-relaxed">
                                เพื่อประโยชน์ของท่าน **กรุณาแคปหน้าจอ (Screenshot) หน้ารายละเอียดการชำระเงินนี้เก็บไว้** เพื่อใช้เป็นหลักฐานยืนยันหากเกิดกรณีระบบขัดข้อง หรือใช้แจ้งเจ้าหน้าที่ได้ทันทีครับ
                            </AlertDescription>
                        </Alert>
                    </div>
                    <div className="flex justify-end pt-4 border-t">
                        <Button onClick={() => setIsSuccessDialogOpen(false)} className="w-full sm:w-auto font-bold">
                            รับทราบและบันทึกภาพหน้าจอ
                        </Button>
                    </div>
                </div>
            </CustomDialog>
        </div>
    );
}

export default function PaymentPage() {
    const params = useParams();
    const { user, loading } = useAuth();
    const router = useRouter();
    const orderId = params.orderId as string;
    const { clearCart } = useCart();

    useEffect(() => {
      clearCart();
    }, []);

    useEffect(() => {
      if (!loading) {
        if (!user) {
          router.replace('/login');
        } else if (user.role !== 'seller') {
          router.replace('/dashboard');
        }
      }
    }, [user, loading, router]);

    if (loading || !user || user.role !== 'seller') {
        return <div className="h-screen w-screen flex items-center justify-center bg-background"><div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div></div>;
    }

    return (
        <div className="min-h-screen bg-background">
            <Header />
            <main className="py-8 px-4 sm:px-6 lg:px-8">
                <PaymentPageContents orderId={orderId} />
            </main>
        </div>
    )
}
