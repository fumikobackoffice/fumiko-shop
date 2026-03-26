
'use client';

import { useState, useTransition, useEffect, useRef, useCallback, useMemo } from 'react';
import { Order, OrderItem, UserProfile, AppUser, ProductVariant, StoreSettings, StockAdjustmentTransaction, PaymentRecord } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { CheckCircle, Loader2, Eye, Truck, ArrowLeft, PlusCircle, Trash2, X, ImagePlus, Info, User, Mail, MapPin, Ticket, PackageCheck, Printer, FileText, XCircle, ExternalLink, Clock, Image as ImageIcon, Store, ReceiptText, Percent, Phone, Briefcase, CheckCircle2, Car, ShieldAlert, Upload, Wallet, History, Banknote } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import Image from 'next/image';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc, collection, writeBatch, serverTimestamp, increment, runTransaction, getDocs, query, where, limit, Timestamp, updateDoc, setDoc, arrayUnion } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { CarrierCombobox } from './carrier-combobox';
import { CustomDialog } from './custom-dialog';
import { v4 as uuidv4 } from 'uuid';
import { Separator } from '../ui/separator';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { PrintDialog } from './print/PrintDialog';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { clearGlobalCache } from '@/hooks/use-smart-fetch';
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
    <div className="text-center bg-amber-50 dark:bg-amber-950/20 p-2 rounded-md border border-amber-200 dark:border-amber-800/50">
        <p className="text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400 font-bold mb-1">เหลือเวลาชำระเงิน</p>
        <div className="flex items-center justify-center gap-2 text-amber-700 dark:text-amber-300">
            <Clock className="h-4 w-4" />
            <span className="text-xl font-mono font-bold tracking-tighter">{timeLeft}</span>
        </div>
    </div>
  );
}

const getStatusVariant = (status: Order['status']): "success" | "info" | "warning" | "destructive" | "default" | "indigo" | "secondary" | "outline" => {
  switch (status) {
    case 'PENDING_PAYMENT': return 'secondary';
    case 'PROCESSING': return 'info';
    case 'READY_TO_SHIP': return 'warning';
    case 'SHIPPED': return 'success';
    case 'COMPLETED': return 'success';
    case 'CANCELLED': return 'destructive';
    case 'EXPIRED': return 'outline';
    default: return 'default';
  }
};
const getStatusText = (status: Order['status']) => {
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

type Shipment = { id: string; carrier: string; trackingNumber: string };

interface AdminOrderDetailsProps {
    order: Order;
    orderItems: OrderItem[];
    buyer: UserProfile | null;
    adminUser: AppUser;
}

export function AdminOrderDetails({ order, orderItems: orderItemsProp, buyer, adminUser }: AdminOrderDetailsProps) {
    const firestore = useFirestore();
    const router = useRouter();
    const { toast } = useToast();
    const [isConfirmPending, startConfirmTransition] = useTransition();
    const [isSlipViewerOpen, setIsSlipViewerOpen] = useState(false);
    const [confirmStep, setConfirmStep] = useState<'view' | 'confirm'>('view');

    const [shipments, setShipments] = useState<Shipment[]>([]);
    const [shipmentProofImages, setShipmentProofImages] = useState<string[]>([]);
    const [newCarrier, setNewCarrier] = useState('');
    const [newTrackingNumber, setNewTrackingNumber] = useState('');
    const [isShipmentPending, startShipmentTransition] = useTransition();
    const proofImageInputRef = useRef<HTMLInputElement>(null);
    const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);

    const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
    const [isCancelPending, startCancelTransition] = useTransition();
    const [isExpired, setIsExpired] = useState(false);

    // States for Admin Slip Attachment / Additional Payment
    const [isAdminSlipOpen, setIsAdminSlipOpen] = useState(false);
    const [adminSlipPreview, setAdminSlipPreview] = useState<string | null>(null);
    const [adminPaymentAmount, setAdminPaymentAmount] = useState<number>(order.balanceAmount || 0);
    const [isAdminSlipPending, startAdminSlipTransition] = useTransition();

    const settingsRef = useMemoFirebase(() => firestore ? doc(firestore, 'settings', 'store') : null, [firestore]);
    const { data: storeSettings } = useDoc<StoreSettings>(settingsRef);
    
    const pointsRate = storeSettings?.pointsRate || 100;

    const isServiceOnly = order.isServiceOnly || (orderItemsProp.length > 0 && orderItemsProp.every(item => item.type === 'SERVICE'));

    const canManageOrders = adminUser?.role === 'super_admin' || adminUser?.permissions?.includes('manage_orders') || adminUser?.permissions?.includes('orders:manage');
    const canManageShipping = adminUser?.role === 'super_admin' || adminUser?.permissions?.includes('manage_shipping') || adminUser?.permissions?.includes('shipping:manage');

    useEffect(() => {
        setShipments(order.shipments || []);
        setShipmentProofImages(order.shipmentProofImageUrls || []);
        setAdminPaymentAmount(order.balanceAmount || 0);
    }, [order]);

    /**
     * Unified trigger to tell parent pages to refresh both stats and list
     */
    const triggerGlobalRefresh = useCallback(() => {
      // Invalidate caches
      clearGlobalCache('admin-orders');
      if (order.buyerId) clearGlobalCache(`seller-orders-${order.buyerId}`);
      
      // Dispatch custom event that OrdersPage listens to
      window.dispatchEvent(new CustomEvent('custom:order-updated'));
    }, [order.buyerId]);

    const executeOrderCancellation = useCallback(async (isAutoExpiry: boolean = false) => {
        if (!firestore || !order || isCancelPending) return;

        try {
            const itemsRef = collection(firestore, 'orders', order.id, 'orderItems');
            const itemsSnap = await getDocs(itemsRef);
            const freshItems = itemsSnap.docs.map(d => ({ ...d.data(), id: d.id } as OrderItem));

            await runTransaction(firestore, async (transaction) => {
                const orderDocRef = doc(firestore, 'orders', order.id);
                const freshOrderSnap = await transaction.get(orderDocRef);
                
                if (!freshOrderSnap.exists()) throw new Error("ไม่พบคำสั่งซื้อ");
                const freshOrder = freshOrderSnap.data() as Order;

                if (freshOrder.status === 'CANCELLED' || freshOrder.status === 'EXPIRED' || freshOrder.status === 'COMPLETED') return;
                if (isAutoExpiry && freshOrder.status !== 'PENDING_PAYMENT') return;

                const wasPaymentConfirmed = ['READY_TO_SHIP', 'SHIPPED', 'COMPLETED'].includes(freshOrder.status);

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
                
                await Promise.all(variantKeys.map(async (key) => {
                    const [gId, vId] = key.split('|');
                    const vRef = doc(firestore, 'productGroups', gId, 'productVariants', vId);
                    const snap = await transaction.get(vRef);
                    if (snap.exists()) {
                        variantSnapshots.set(key, snap.data());
                    }
                }));

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
                            adminUserId: adminUser?.id || 'system',
                            adminName: adminUser?.name || 'ระบบอัตโนมัติ',
                            type: 'RETURN', 
                            quantity: qty,
                            reason: `คืนสต็อกจากการ${isAutoExpiry ? 'หมดอายุ' : 'ยกเลิก'}ออเดอร์ #${order.id.substring(0, 6)}`,
                            createdAt: serverTimestamp()
                        });
                    }
                    
                    const variantRef = doc(firestore, 'productGroups', gId, 'productVariants', vId);
                    transaction.update(variantRef, { inventoryLots: Array.from(lotMap.values()) });
                }

                const userRef = doc(firestore, 'users', order.buyerId);
                
                if (freshOrder.pointsUsed && freshOrder.pointsUsed > 0) {
                    transaction.update(userRef, { pointsBalance: increment(freshOrder.pointsUsed) });
                    const pointsRefundRef = doc(collection(firestore, 'users', order.buyerId, 'pointTransactions'));
                    transaction.set(pointsRefundRef, {
                        userId: order.buyerId,
                        type: 'ADJUSTMENT_ADD',
                        amount: freshOrder.pointsUsed,
                        description: `คืนคะแนนจากการ${isAutoExpiry ? 'หมดอายุ' : 'ยกเลิก'}ออเดอร์ #${order.id.substring(0, 6)}`,
                        orderId: order.id,
                        createdAt: serverTimestamp()
                    });
                }
                
                const eligibleAmount = freshItems
                    .filter(item => item.type !== 'SERVICE')
                    .reduce((sum, item) => sum + (item.itemPrice * item.quantity), 0);
                
                const netPaidAmount = Math.max(0, freshOrder.totalAmount - (freshOrder.shippingCost || 0));
                const pointsEarned = Math.floor(Math.min(eligibleAmount, netPaidAmount) / pointsRate);
                
                if (wasPaymentConfirmed && pointsEarned > 0) {
                    transaction.update(userRef, { pointsBalance: increment(-pointsEarned) });
                    const pointsRevokeRef = doc(collection(firestore, 'users', order.buyerId, 'pointTransactions'));
                    transaction.set(pointsRevokeRef, {
                        userId: order.buyerId,
                        type: 'ADJUSTMENT_DEDUCT',
                        amount: -pointsEarned,
                        description: `ริบคะแนนคืนจากการยกเลิกออเดอร์ #${order.id.substring(0, 6)}`,
                        orderId: order.id,
                        createdAt: serverTimestamp()
                    });
                }
                
                transaction.update(orderDocRef, { 
                  status: isAutoExpiry ? 'EXPIRED' : 'CANCELLED', 
                  updatedAt: serverTimestamp() 
                });
                
                const auditLogRef = doc(collection(firestore, 'auditLogs'));
                transaction.set(auditLogRef, {
                    adminUserId: adminUser?.id || 'system',
                    adminName: adminUser?.name || 'ระบบอัตโนมัติ',
                    action: isAutoExpiry ? 'EXPIRE_ORDER' : 'CANCEL_ORDER',
                    targetId: order.id,
                    details: { previousStatus: freshOrder.status, isAutoExpiry, pointsRevoked: wasPaymentConfirmed ? pointsEarned : 0 },
                    createdAt: serverTimestamp(),
                });
            });

            if (isAutoExpiry) setIsExpired(true);
            triggerGlobalRefresh();

        } catch (error: any) {
            console.error("Failed to cancel/expire order:", error);
            if (!isAutoExpiry) throw error;
        }
    }, [firestore, order, adminUser, pointsRate, isCancelPending, triggerGlobalRefresh]);

    const handleExpiry = useCallback(async () => {
        if (!firestore || !order || order.status !== 'PENDING_PAYMENT') return;
        await executeOrderCancellation(true);
        toast({ title: 'ออเดอร์หมดเวลา', description: `คำสั่งซื้อ #${order.id.substring(0, 6)} ถูกยกเลิกอัตโนมัติ` });
    }, [firestore, order, executeOrderCancellation, toast]);

    const handleConfirmPayment = () => {
        if (!firestore || !order || !adminUser) return;
        startConfirmTransition(async () => {
            const batch = writeBatch(firestore);
            const orderDocRef = doc(firestore, 'orders', order.id);
            const nextStatus = 'READY_TO_SHIP';
            
            batch.update(orderDocRef, { status: nextStatus, updatedAt: serverTimestamp() });
            
            if (buyer) {
                const eligibleAmount = orderItemsProp
                    .filter(item => item.type !== 'SERVICE')
                    .reduce((sum, item) => sum + (item.itemPrice * item.quantity), 0);
                
                const netPaidAmount = Math.max(0, order.totalAmount - (order.shippingCost || 0));
                const pointsToAdd = Math.floor(Math.min(eligibleAmount, netPaidAmount) / pointsRate);

                if (pointsToAdd > 0) {
                    const userRef = doc(firestore, 'users', buyer.id);
                    batch.update(userRef, { pointsBalance: increment(pointsToAdd) });
                    const transactionRef = doc(collection(firestore, 'users', buyer.id, 'pointTransactions'));
                    batch.set(transactionRef, {
                        userId: buyer.id, type: 'EARN_PURCHASE', amount: pointsToAdd,
                        description: `คะแนนสะสมจากคำสั่งซื้อ #${order.id.substring(0, 6)}`,
                        orderId: order.id, createdAt: serverTimestamp()
                    });
                }
            }

            const auditLogRef = doc(collection(firestore, 'auditLogs'));
            batch.set(auditLogRef, {
                adminUserId: adminUser.id, 
                adminName: adminUser.name, 
                action: 'CONFIRM_PAYMENT',
                targetId: order.id, 
                details: { orderTotal: order.totalAmount, isExternal: !!order.isExternal }, 
                createdAt: serverTimestamp(),
            });

            try {
                await batch.commit();
                toast({ title: 'ยืนยันการชำระเงินสำเร็จ'});
                setIsSlipViewerOpen(false);
                setConfirmStep('view');
                triggerGlobalRefresh();
            } catch (error: any) {
                toast({ variant: 'destructive', title: 'เกิดข้อผิดพลาด', description: error.message });
            }
        });
    }

    const handleUpdateShipmentInfo = () => {
        if (!firestore || !order || !adminUser) return;
        startShipmentTransition(async () => {
            const batch = writeBatch(firestore);
            const orderDocRef = doc(firestore, 'orders', order.id);
            const dataToUpdate: any = {
                shipments: shipments, shipmentProofImageUrls: shipmentProofImages,
                updatedAt: serverTimestamp(),
            };
            if (shipments.length > 0 && order.status === 'READY_TO_SHIP') {
                dataToUpdate.status = 'SHIPPED';
            }
            batch.update(orderDocRef, dataToUpdate);
            const auditLogRef = doc(collection(firestore, 'auditLogs'));
            batch.set(auditLogRef, {
                adminUserId: adminUser.id, adminName: adminUser.name, action: 'UPDATE_SHIPMENT',
                targetId: order.id, details: { shipments: shipments.map(s => s.carrier) },
                createdAt: serverTimestamp(),
            });
            try {
                await batch.commit();
                toast({ title: 'บันทึกข้อมูลการจัดส่งแล้ว' });
                triggerGlobalRefresh();
            } catch (error: any) {
                toast({ variant: 'destructive', title: 'เกิดข้อผิดพลาด', description: error.message });
            }
        });
    };

    const handleCompleteOrder = async () => {
        if (!firestore || !order) return;
        startConfirmTransition(async () => {
            try {
                await updateDoc(doc(firestore, 'orders', order.id), {
                    status: 'COMPLETED',
                    updatedAt: serverTimestamp()
                });
                toast({ title: 'ปิดออเดอร์สำเร็จ' });
                triggerGlobalRefresh();
            } catch (e: any) {
                toast({ variant: 'destructive', title: 'ผิดพลาด', description: e.message });
            }
        });
    };

    const handleCancelOrder = () => {
        startCancelTransition(async () => {
            try {
                await executeOrderCancellation(false);
                toast({ title: 'ยกเลิกคำสั่งซื้อสำเร็จ'});
                setIsCancelDialogOpen(false);
            } catch (e: any) {
                toast({ variant: 'destructive', title: 'การยกเลิกล้มเหลว', description: e.message });
            }
        });
    };

    const handleAddShipment = () => {
        if (!newCarrier.trim() || !newTrackingNumber.trim()) {
            toast({ variant: 'destructive', title: 'ข้อมูลไม่ครบถ้วน' });
            return;
        }
        setShipments(prev => [...prev, { id: uuidv4(), carrier: newCarrier, trackingNumber: newTrackingNumber }]);
        setNewCarrier('');
        setNewTrackingNumber('');
    };

    const handleRemoveShipment = (idToRemove: string) => setShipments(prev => prev.filter(s => s.id !== idToRemove));

    const handleProofImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files) return;
        const fileReadPromises = Array.from(files).map(file => {
            return new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        });
        Promise.all(fileReadPromises).then(results => {
            setShipmentProofImages(prev => [...prev, ...results]);
        }).catch(error => console.error("Error reading files:", error));
    };

    const handleRemoveProofImage = (index: number) => setShipmentProofImages(prev => prev.filter((_, i) => i !== index));

    const handleAdminAttachSlip = async () => {
        if (!firestore || !order || !adminUser || !adminSlipPreview) return;
        
        startAdminSlipTransition(async () => {
            try {
                const amount = Number(adminPaymentAmount);
                const currentPaid = Number(order.paidAmount) || 0;
                const newPaidAmount = currentPaid + amount;
                const newBalance = Math.max(0, order.totalAmount - newPaidAmount);
                
                const paymentRecord: PaymentRecord = {
                  id: uuidv4(),
                  amount: amount,
                  slipUrl: adminSlipPreview,
                  createdAt: new Date().toISOString(),
                  adminId: adminUser.id,
                  adminName: adminUser.name,
                  note: order.balanceAmount && order.balanceAmount > 0 ? 'ชำระเพิ่มเติม' : 'แนบสลิปแทนลูกค้า',
                };

                const orderRef = doc(firestore, 'orders', order.id);
                const updateData: any = {
                    paymentSlipUrl: adminSlipPreview, 
                    paidAmount: newPaidAmount,
                    balanceAmount: newBalance,
                    payments: arrayUnion(paymentRecord),
                    updatedAt: serverTimestamp(),
                };

                if (order.status === 'PENDING_PAYMENT') {
                  updateData.status = 'PROCESSING';
                  updateData.isNew = true;
                }

                await updateDoc(orderRef, updateData);

                const auditLogRef = doc(collection(firestore, 'auditLogs'));
                await setDoc(auditLogRef, {
                    adminUserId: adminUser.id,
                    adminName: adminUser.name,
                    action: 'ADMIN_ATTACH_SLIP',
                    targetId: order.id,
                    details: { amount, newBalance },
                    createdAt: serverTimestamp(),
                });

                toast({ title: 'บันทึกการชำระเงินสำเร็จ', description: newBalance > 0 ? `ยอดคงค้างเหลือ ฿${newBalance.toLocaleString()}` : 'ชำระครบถ้วนแล้ว' });
                setIsAdminSlipOpen(false);
                setAdminSlipPreview(null);
                triggerGlobalRefresh();
            } catch (error: any) {
                toast({ variant: 'destructive', title: 'ล้มเหลว', description: error.message });
            }
        });
    };

    const handleAdminFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            if (file.size > 700 * 1024) {
                toast({ variant: 'destructive', title: 'ไฟล์ใหญ่เกินไป', description: 'กรุณาใช้รูปไม่เกิน 700KB' });
                return;
            }
            const reader = new FileReader();
            reader.onload = (e) => setAdminSlipPreview(e.target?.result as string);
            reader.readAsDataURL(file);
        }
    };

    const canConfirmPayment = order.status === 'PROCESSING' && canManageOrders;
    const canUpdateShipment = (order.status === 'READY_TO_SHIP' || order.status === 'SHIPPED') && !isServiceOnly && canManageShipping;
    const isShippedOrCompleted = order.status === 'SHIPPED' || order.status === 'COMPLETED';
    const canCancelOrderAction = order.status !== 'COMPLETED' && order.status !== 'CANCELLED' && order.status !== 'EXPIRED' && canManageOrders;
    const canAdminManagePayment = (order.status === 'PENDING_PAYMENT' && !isExpired) || (!!order.isExternal && (order.balanceAmount || 0) > 0);

    const orderDateObj = order.orderDate?.toDate ? order.orderDate.toDate() : new Date(order.orderDate);
    const displayDate = orderDateObj ? format(orderDateObj, 'd MMM ', { locale: th }) + (orderDateObj.getFullYear() + 543) + format(orderDateObj, ' HH:mm', { locale: th }) : '-';

    return (
        <>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="icon" onClick={() => router.back()} className="h-9 w-9">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-headline font-bold">ออเดอร์ #{order.id}</h1>
                        <div className="text-sm text-muted-foreground flex items-center gap-4 mt-1">
                           <span>{displayDate}</span>
                           <Badge variant={getStatusVariant(order.status)} className="font-medium text-[10px] h-5">{getStatusText(order.status)}</Badge>
                        </div>
                    </div>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    <Button variant="outline" onClick={() => setIsPrintDialogOpen(true)} className="h-9 text-xs">
                        <Printer className="mr-2 h-4 w-4" /> พิมพ์
                    </Button>
                    {canCancelOrderAction && (
                        <Button variant="destructive" onClick={() => setIsCancelDialogOpen(true)} className="h-9 text-xs">
                            <XCircle className="mr-2 h-4 w-4" /> ยกเลิกคำสั่งซื้อ
                        </Button>
                    )}
                </div>
            </div>
            
            <div className="grid lg:grid-cols-6 gap-6 items-start">
                <div className="lg:col-span-5 space-y-6">
                    <Card>
                        <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><FileText className="h-5 w-5" /> รายการสินค้าและภาษี</CardTitle></CardHeader>
                        <CardContent>
                            <div className="border rounded-lg overflow-hidden">
                                <Table>
                                    <TableHeader className="bg-muted/50"><TableRow><TableHead>สินค้า</TableHead><TableHead className="text-center">จำนวน</TableHead><TableHead className="text-right">ราคา/หน่วย</TableHead><TableHead className="text-right">รวม</TableHead></TableRow></TableHeader>
                                    <TableBody>
                                        {orderItemsProp?.map((item) => (
                                            <TableRow key={item.id}>
                                                <TableCell>
                                                    <p className="font-medium text-sm">{item.productName.replace(/\s*\(\)$/, '')}</p>
                                                    {item.taxStatus && (
                                                        <p className="text-[10px] text-muted-foreground leading-none mt-1">
                                                            {item.taxStatus === 'EXEMPT' ? 'ยกเว้นภาษี' : (item.taxMode === 'EXCLUSIVE' ? 'แยก VAT' : 'รวม VAT')}
                                                        </p>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-center text-sm">{item.quantity}</TableCell>
                                                <TableCell className="text-right text-sm">฿{item.itemPrice.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</TableCell>
                                                <TableCell className="text-right text-sm">฿{(item.quantity * item.itemPrice).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                    <TableFooter className="bg-transparent">
                                        <TableRow className="border-t-2"><TableCell colSpan={3} className="text-right text-muted-foreground flex items-center justify-end gap-2 text-xs"><ReceiptText className="h-3.5 w-3.5" /> มูลค่าสินค้าก่อนภาษี</TableCell><TableCell className="text-right text-xs">฿{(order.subtotalBeforeTax || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</TableCell></TableRow>
                                        <TableRow><TableCell colSpan={3} className="text-right text-muted-foreground flex items-center justify-end gap-2 text-xs"><Percent className="h-3.5 w-3.5" /> ภาษีมูลค่าเพิ่ม ({order.taxRate || 7}%)</TableCell><TableCell className="text-right text-xs">฿{(order.taxAmount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</TableCell></TableRow>
                                        <TableRow><TableCell colSpan={3} className="text-right text-xs">ค่าจัดส่ง</TableCell><TableCell className="text-right font-medium text-xs">฿{(order.shippingCost || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</TableCell></TableRow>
                                        {order.pointsDiscount > 0 && <TableRow><TableCell colSpan={3} className="text-right text-primary text-xs">ส่วนลดจากคะแนน</TableCell><TableCell className="text-right font-medium text-primary text-xs">- ฿{order.pointsDiscount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</TableCell></TableRow>}
                                        <TableRow className="font-bold text-base bg-muted/30"><TableCell colSpan={3} className="text-right">ยอดรวมสุทธิ (รวมภาษี)</TableCell><TableCell className="text-right">฿{order.totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell></TableRow>
                                    </TableFooter>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>

                    {order.isExternal && (
                      <Card className="border-primary/20">
                        <CardHeader className="pb-3 border-b bg-primary/5">
                          <CardTitle className="text-lg flex items-center gap-2">
                            <Wallet className="h-5 w-5 text-primary" /> สถานะการเงินและการแบ่งชำระ
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-6">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                            <div className="space-y-1">
                              <Label className="text-[10px] uppercase font-bold text-muted-foreground">ยอดสุทธิ</Label>
                              <p className="text-xl font-bold">฿{order.totalAmount.toLocaleString()}</p>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] uppercase font-bold text-emerald-600">ชำระแล้ว</Label>
                              <p className="text-xl font-bold text-emerald-600">฿{(order.paidAmount || 0).toLocaleString()}</p>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] uppercase font-bold text-orange-600">คงเหลือ</Label>
                              <p className="text-xl font-bold text-orange-600">฿{(order.balanceAmount || 0).toLocaleString()}</p>
                            </div>
                          </div>

                          <div className="mt-8 space-y-4">
                            <h3 className="font-bold text-sm flex items-center gap-2"><History className="h-4 w-4" /> ประวัติการรับเงิน</h3>
                            <div className="rounded-lg border overflow-hidden">
                              <Table>
                                <TableHeader className="bg-muted/50">
                                  <TableRow>
                                    <TableHead className="text-xs">วันที่</TableHead>
                                    <TableHead className="text-xs">จำนวนเงิน</TableHead>
                                    <TableHead className="text-xs">ผู้รับเงิน</TableHead>
                                    <TableHead className="text-right text-xs">หลักฐาน</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {order.payments && order.payments.length > 0 ? (
                                    order.payments.map((p) => (
                                      <TableRow key={p.id}>
                                        <TableCell className="text-xs">{format(new Date(p.createdAt), 'd MMM yy HH:mm', { locale: th })}</TableCell>
                                        <TableCell className="text-sm font-bold">฿{p.amount.toLocaleString()}</TableCell>
                                        <TableCell className="text-xs text-muted-foreground">{p.adminName || '-'}</TableCell>
                                        <TableCell className="text-right">
                                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setAdminSlipPreview(p.slipUrl); setIsSlipViewerOpen(true); setConfirmStep('view'); }}>
                                            <ImageIcon className="h-4 w-4" />
                                          </Button>
                                        </TableCell>
                                      </TableRow>
                                    ))
                                  ) : (
                                    <TableRow>
                                      <TableCell colSpan={4} className="text-center py-4 text-xs text-muted-foreground italic">ยังไม่มีบันทึกการชำระเงิน</TableCell>
                                    </TableRow>
                                  )}
                                </TableBody>
                              </Table>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                    
                    <Card>
                        <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Truck className="h-5 w-5" /> การจัดส่ง / การให้บริการ</CardTitle></CardHeader>
                        <CardContent className="space-y-6">
                            {order.lalamoveVehicle && (
                                <Alert className="bg-blue-50 border-blue-200">
                                    <Car className="h-4 w-4 text-blue-600" />
                                    <AlertTitle className="text-blue-800 font-bold">จัดส่งด่วน Lalamove</AlertTitle>
                                    <AlertDescription className="text-xs text-blue-700">
                                        ลูกค้าเลือกใช้: <span className="font-bold">{order.lalamoveVehicle.type}</span> (ราคาเหมา ฿{order.lalamoveVehicle.price.toLocaleString()}) 
                                    </AlertDescription>
                                </Alert>
                            )}

                            {isServiceOnly ? (
                                <div className="space-y-4">
                                    <Alert className="bg-primary/5 border-primary/20">
                                        <Briefcase className="h-4 w-4 text-primary" />
                                        <AlertTitle className="text-primary font-bold">รายการงานบริการล้วน</AlertTitle>
                                        <AlertDescription className="text-xs">รายการนี้เป็นงานบริการทั้งหมด ไม่จำเป็นต้องระบุข้อมูลการจัดส่งพัสดุ</AlertDescription>
                                    </Alert>
                                    {order.status === 'READY_TO_SHIP' && (
                                        <div className="flex flex-col items-center justify-center py-6 border-2 border-dashed rounded-xl space-y-4">
                                            <p className="text-sm text-muted-foreground">เมื่อให้บริการเสร็จสิ้นแล้ว โปรดกดปุ่มด้านล่างเพื่อปิดออเดอร์</p>
                                            <Button onClick={handleCompleteOrder} disabled={isConfirmPending || !canManageOrders} size="lg">
                                                {isConfirmPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-5 w-5" />}
                                                ยืนยันการให้บริการสำเร็จ
                                            </Button>
                                        </div>
                                    )}
                                    {order.status === 'COMPLETED' && (
                                        <div className="flex items-center gap-2 text-green-600 font-bold justify-center py-4">
                                            <CheckCircle2 className="h-5 w-5" />
                                            <span>ให้บริการและปิดออเดอร์เรียบร้อยแล้ว</span>
                                        </div>
                                    )}
                                </div>
                            ) : (canUpdateShipment || isShippedOrCompleted) ? (
                                <>
                                    <div className="space-y-4">
                                        <h3 className="font-semibold text-sm">ข้อมูลการจัดส่ง</h3>
                                        {shipments.map((shipment) => (
                                            <div key={shipment.id} className="flex items-center justify-between p-2 pl-3 bg-muted/50 rounded-md">
                                                <div><p className="text-sm font-medium">{shipment.carrier}</p><p className="text-xs font-mono text-muted-foreground">{shipment.trackingNumber}</p></div>
                                                {!isShippedOrCompleted && canManageShipping && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleRemoveShipment(shipment.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                                            </div>
                                        ))}
                                        {!isShippedOrCompleted && canManageShipping && (
                                        <div className="flex gap-2 items-end border-t pt-4">
                                            <div className="flex-grow space-y-1"><Label htmlFor="new-carrier" className="text-xs">บริษัทขนส่ง</Label><CarrierCombobox value={newCarrier} onChange={setNewCarrier} /></div>
                                            <div className="flex-grow space-y-1"><Label htmlFor="new-trackingNumber" className="text-xs">เลขพัสดุ</Label><Input id="new-trackingNumber" value={newTrackingNumber} onChange={(e) => setNewTrackingNumber(e.target.value)} /></div>
                                            <Button type="button" size="icon" onClick={handleAddShipment} className="shrink-0 h-10 w-10"><PlusCircle className="h-4 w-4" /></Button>
                                        </div>
                                        )}
                                    </div>
                                    <Separator />
                                    <div className="space-y-4">
                                        <h3 className="font-semibold text-sm">หลักฐานการจัดส่ง</h3>
                                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                            {shipmentProofImages.map((url, index) => (
                                                <div key={index} className="relative aspect-square">
                                                    <Image src={url} alt={`หลักฐาน ${index + 1}`} layout="fill" objectFit="cover" className="rounded-md border" />
                                                    {!isShippedOrCompleted && canManageShipping && <Button type="button" variant="destructive" size="icon" className="absolute -top-2 -right-2 h-6 w-6 rounded-full" onClick={() => handleRemoveProofImage(index)}><X className="h-4 w-4" /></Button>}
                                                </div>
                                            ))}
                                            {!isShippedOrCompleted && canManageShipping && (
                                            <Label htmlFor="shipment-proof-upload" className="cursor-pointer aspect-square flex flex-col items-center justify-center rounded-md border-2 border-dashed bg-muted/25 text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                                                <ImagePlus className="h-6 w-6" /><span className="mt-1 text-[10px] font-medium">อัปโหลด</span>
                                                <Input ref={proofImageInputRef} id="shipment-proof-upload" type="file" accept="image/*" multiple className="hidden" onChange={handleProofImageUpload} />
                                            </Label>
                                            )}
                                        </div>
                                        {!isShippedOrCompleted && canManageShipping && (
                                            <div className="text-center mt-2">
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
                                    </div>
                                    {canManageShipping && (
                                        <div className="flex justify-end pt-4 border-t">
                                            <Button onClick={handleUpdateShipmentInfo} disabled={isShipmentPending} className="h-9 text-xs">{isShipmentPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}บันทึกข้อมูลการจัดส่ง</Button>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <Alert variant="default"><Info className="h-4 w-4" /><AlertTitle className="text-sm">ยังไม่ถึงขั้นตอนการจัดส่ง</AlertTitle><AlertDescription className="text-xs">ส่วนนี้จะพร้อมใช้งานเมื่อการชำระเงินได้รับการยืนยันแล้ว</AlertDescription></Alert>
                            )}
                        </CardContent>
                    </Card>
                </div>
                
                <div className="lg:col-span-1">
                    <Card className="shadow-none bg-muted/10 border-none">
                        <CardHeader className="p-4"><CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">สรุปออเดอร์</CardTitle></CardHeader>
                        <CardContent className="divide-y divide-border/50 p-0">
                            <div className="p-4">
                                <h3 className="mb-2 flex items-center gap-2 text-xs font-bold text-muted-foreground"><User className="h-3.5 w-3.5" />ลูกค้า</h3>
                                <div className="text-xs space-y-1.5 pl-5">
                                    <p className="font-bold text-sm">{buyer?.name || order.customerName || '-'}</p>
                                    <p className="flex items-center gap-1.5"><Mail className="h-3 w-3" />{buyer?.email || '-'}</p>
                                    <p className="flex items-center gap-1.5"><Phone className="h-3 w-3" />{order.shippingAddress?.phone || '-'}</p>
                                    {order.branchName && (
                                        <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-dashed text-primary font-bold">
                                            <Store className="h-3.5 w-3.5" /><span>สาขา: {order.branchName}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="p-4">
                                <h3 className="mb-2 flex items-center gap-2 text-xs font-bold text-muted-foreground"><MapPin className="h-3.5 w-3.5" />ที่อยู่จัดส่ง</h3>
                                <address className="pl-5 not-italic text-xs space-y-1.5">
                                    <p className="font-bold">{order.shippingAddress.name} ({order.shippingAddress.phone})</p>
                                    <p className="leading-normal">{order.shippingAddress.addressLine1}{order.shippingAddress.addressLine2 && `, ${order.shippingAddress.addressLine2}`}</p>
                                    <p>{order.shippingAddress.subdistrict}, {order.shippingAddress.district}</p>
                                    <p>{order.shippingAddress.province} {order.shippingAddress.postalCode}</p>
                                    {order.shippingAddress.googleMapsUrl && (
                                        <div className="pt-2"><Button variant="outline" size="sm" className="w-full h-8 text-[10px] font-bold" asChild><a href={order.shippingAddress.googleMapsUrl} target="_blank" rel="noopener noreferrer"><MapPin className="mr-1 h-3 w-3" />แผนที่<ExternalLink className="ml-1 h-2.5 w-2.5" /></a></Button></div>
                                    )}
                                </address>
                            </div>
                            <div className="p-4">
                                <h3 className="mb-2 flex items-center gap-2 text-xs font-bold text-muted-foreground"><PackageCheck className="h-3.5 w-3.5" />การชำระเงิน</h3>
                                <div className="pl-5 space-y-3">
                                    <div className="space-y-1">
                                        <p className="font-bold text-xs">{order.status === 'EXPIRED' ? 'หมดอายุแล้ว' : order.status === 'CANCELLED' ? 'ยกเลิกแล้ว' : order.status === 'PENDING_PAYMENT' ? (isExpired ? 'หมดเวลา' : 'รอลูกค้าชำระเงิน') : 'ยืนยันชำระแล้ว'}</p>
                                        {order.status === 'PENDING_PAYMENT' && order.expiresAt && !isExpired && (<CountdownTimer expiryTimestamp={order.expiresAt} onExpiry={handleExpiry} />)}
                                    </div>
                                    
                                    {order.payments && order.payments.length > 0 ? (
                                      <div className="space-y-2">
                                        <p className="text-[10px] font-bold uppercase text-muted-foreground">สลิปการชำระเงิน ({order.payments.length})</p>
                                        <div className="grid grid-cols-2 gap-2">
                                          {order.payments.map((p, idx) => (
                                            <div key={p.id} className="space-y-1">
                                              <button onClick={() => { setAdminSlipPreview(p.slipUrl); setIsSlipViewerOpen(true); setConfirmStep('view'); }} className="relative w-full aspect-[9/16] rounded-md overflow-hidden border group bg-black shadow-inner">
                                                <Image src={p.slipUrl} alt={`Slip ${idx+1}`} fill className="group-hover:opacity-75 transition-opacity object-contain" />
                                                <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><Eye className="h-4 w-4 text-white" /></div>
                                                <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[8px] py-0.5 px-1 font-bold">฿{p.amount.toLocaleString()}</div>
                                              </button>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ) : order.paymentSlipUrl ? (
                                        <div className="space-y-2">
                                            <button onClick={() => { setAdminSlipPreview(order.paymentSlipUrl || null); setIsSlipViewerOpen(true); setConfirmStep('view'); }} className="relative w-full aspect-[9/16] rounded-md overflow-hidden border group bg-black shadow-inner">
                                                <Image src={order.paymentSlipUrl} alt="Slip" fill className="group-hover:opacity-75 transition-opacity object-contain" /><div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><Eye className="h-6 w-6 text-white" /></div>
                                            </button>
                                        </div>
                                    ) : null}

                                    {canAdminManagePayment && (
                                        <Button 
                                            variant="outline" 
                                            className="w-full h-10 text-xs font-bold bg-primary/5 text-primary border-primary/20 hover:bg-primary/10" 
                                            onClick={() => { setIsAdminSlipOpen(true); setAdminPaymentAmount(order.balanceAmount || order.totalAmount); }}
                                        >
                                            <Upload className="mr-2 h-4 w-4" /> บันทึกยอดรับเงิน/สลิป
                                        </Button>
                                    )}

                                    {canConfirmPayment ? (
                                        <Button className="w-full h-9 text-xs font-bold" onClick={() => { setAdminSlipPreview(order.paymentSlipUrl || null); setIsSlipViewerOpen(true); setConfirmStep('view'); }}><CheckCircle className="mr-2 h-4 w-4" /> ยืนยันชำระเงิน</Button>
                                    ) : (order.status === 'PROCESSING' && !canManageOrders) ? (
                                        <div className="bg-amber-50 border border-amber-200 rounded p-2 flex gap-2 items-start">
                                            <ShieldAlert className="h-3 w-3 text-amber-600 shrink-0 mt-0.5" />
                                            <p className="text-[9px] text-amber-700">คุณมีสิทธิ์ **ดูอย่างเดียว** จึงไม่สามารถกดยืนยันยอดโอนได้</p>
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                            {((order.pointsUsed && order.pointsUsed > 0) || orderItemsProp.some(i => i.type !== 'SERVICE')) && (
                                <div className="p-4">
                                    <h3 className="mb-2 flex items-center gap-2 text-xs font-bold text-muted-foreground"><Ticket className="h-3.5 w-3.5" />คะแนนสะสม</h3>
                                    <div className="pl-5 text-xs space-y-1.5">
                                        {order.pointsUsed && order.pointsUsed > 0 && (<div className="flex justify-between"><span className="text-muted-foreground">ใช้:</span><span className="font-bold text-destructive">{order.pointsUsed?.toLocaleString() || 0}</span></div>)}
                                        {order.pointsDiscount && order.pointsDiscount > 0 && (<div className="flex justify-between"><span className="text-muted-foreground">ส่วนลด:</span><span className="font-bold text-primary">-฿{order.pointsDiscount?.toLocaleString() || 0}</span></div>)}
                                        <div className="flex justify-between"><span className="text-muted-foreground">จะได้รับ:</span><span className="font-bold text-green-600">+ {(() => {
                                            const eligibleAmount = orderItemsProp.filter(item => item.type !== 'SERVICE').reduce((sum, item) => sum + (item.itemPrice * item.quantity), 0);
                                            const netPaidAmount = Math.max(0, order.totalAmount - (order.shippingCost || 0));
                                            return Math.floor(Math.min(eligibleAmount, netPaidAmount) / pointsRate).toLocaleString();
                                        })()}</span></div>
                                        <p className="text-[10px] text-muted-foreground italic pt-1">*ไม่รวมงานบริการ</p>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>

            <CustomDialog isOpen={isSlipViewerOpen} onClose={() => { setIsSlipViewerOpen(false); setConfirmStep('view'); }} title={confirmStep === 'view' ? "หลักฐานการโอนเงิน" : "ยืนยันการชำระเงิน?"} size="lg">
                <div className={cn(confirmStep === 'confirm' && 'hidden')}>
                    <div className="relative w-full max-sm mx-auto aspect-[9/16] rounded-lg overflow-hidden border mt-4">
                        {adminSlipPreview ? (
                            <Image src={adminSlipPreview} alt="Payment Slip" fill className="bg-muted object-contain"/>
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-muted text-muted-foreground">
                                <ImageIcon className="h-12 w-12 mb-2 opacity-20" /><p>ไม่มีรูปภาพหลักฐาน</p>
                            </div>
                        )}
                    </div>
                </div>
                {confirmStep === 'confirm' && (
                  <div className="mt-4 space-y-4">
                    <Alert className="bg-blue-50 border-blue-200">
                      <Info className="h-4 w-4 text-blue-600" />
                      <AlertTitle className="text-blue-800 font-bold">ยืนยันและปล่อยขั้นตอนการจัดส่ง</AlertTitle>
                      <AlertDescription className="text-xs text-blue-700">
                        คุณกำลังยืนยันว่าสลิปนี้ถูกต้อง และระบบจะเปิดให้พนักงานคลังสินค้าเริ่มจัดเตรียมพัสดุ (READY TO SHIP) ได้ทันที 
                        {order.isExternal && (order.balanceAmount || 0) > 0 && <span className="block mt-1 font-bold">*แม้จะยังมียอดค้างชำระก็ตาม*</span>}
                      </AlertDescription>
                    </Alert>
                    <p className="text-sm text-muted-foreground">คุณตรวจสอบข้อมูลและอนุญาตให้จัดส่งสินค้าใช่หรือไม่?</p>
                  </div>
                )}
                {canConfirmPayment && (
                    <div className="flex justify-end gap-2 pt-6 mt-6 border-t">
                        {confirmStep === 'view' ? (<><Button variant="outline" onClick={() => { setIsSlipViewerOpen(false); setConfirmStep('view'); }}>ปิด</Button><Button onClick={() => setConfirmStep('confirm')}><CheckCircle className="mr-2 h-4 w-4" /> ยืนยันสลิปและให้จัดส่ง</Button></>) : (<><Button variant="outline" onClick={() => setConfirmStep('view')} disabled={isConfirmPending}>ยกเลิก</Button><Button onClick={handleConfirmPayment} disabled={isConfirmPending}>{isConfirmPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}ยืนยันและเปลี่ยนสถานะ</Button></>)}
                    </div>
                )}
            </CustomDialog>

            <CustomDialog 
                isOpen={isAdminSlipOpen} 
                onClose={() => { setIsAdminSlipOpen(false); setAdminSlipPreview(null); }} 
                title={order.balanceAmount && order.balanceAmount > 0 ? "บันทึกการชำระเงินงวดใหม่" : "บันทึกยอดรับเงินแทนลูกค้า"}
            >
                <div className="space-y-6 pt-2">
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 flex gap-3">
                      <Wallet className="h-5 w-5 text-orange-600 shrink-0" />
                      <div className="text-sm">
                        <p className="font-bold text-orange-800">ยอดคงเหลือที่ต้องชำระ: ฿{(order.balanceAmount || order.totalAmount).toLocaleString()}</p>
                        <p className="text-xs text-orange-700 mt-0.5">กรุณาระบุจำนวนเงินตามสลิปจริงที่ได้รับในงวดนี้</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="admin-payment-amount">จำนวนเงินที่ได้รับงวดนี้ (บาท)</Label>
                        <div className="relative">
                          <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input 
                            id="admin-payment-amount"
                            type="number"
                            className="pl-9 font-bold text-lg"
                            value={adminPaymentAmount}
                            onChange={(e) => setAdminPaymentAmount(Number(e.target.value))}
                            disabled={isAdminSlipPending}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>รูปภาพสลิปงวดนี้</Label>
                        {!adminSlipPreview ? (
                            <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-xl cursor-pointer hover:bg-muted/50 transition-colors border-muted-foreground/30">
                                <Upload className="h-10 w-10 text-muted-foreground mb-2" />
                                <p className="text-sm font-medium text-muted-foreground">คลิกเพื่ออัปโหลดสลิปงวดนี้</p>
                                <input type="file" className="hidden" accept="image/*" onChange={handleAdminFileChange} />
                            </label>
                        ) : (
                            <div className="relative w-full aspect-[9/16] rounded-xl overflow-hidden border bg-black/5 max-w-[200px] mx-auto shadow-md">
                                <Image src={adminSlipPreview} alt="Preview Admin Slip" fill className="object-contain" />
                                <Button 
                                    variant="destructive" 
                                    size="icon" 
                                    className="absolute top-2 right-2 h-7 w-7 rounded-full shadow-lg" 
                                    onClick={() => setAdminSlipPreview(null)}
                                    disabled={isAdminSlipPending}
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-4 border-t">
                        <Button variant="outline" onClick={() => setIsAdminSlipOpen(false)} disabled={isAdminSlipPending}>ยกเลิก</Button>
                        <Button 
                            onClick={handleAdminAttachSlip} 
                            disabled={isAdminSlipPending || !adminSlipPreview || adminPaymentAmount <= 0}
                            className="flex-1 sm:flex-none font-bold"
                        >
                            {isAdminSlipPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                            บันทึกยอดรับเงินงวดนี้
                        </Button>
                    </div>
                </div>
            </CustomDialog>

            <AlertDialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>ยืนยันการยกเลิกคำสั่งซื้อ?</AlertDialogTitle><AlertDialogDescription>การกระทำนี้จะคืนสินค้าเข้าสต็อกและปรับปรุงคะแนนลูกค้า ไม่สามารถย้อนกลับได้</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel disabled={isCancelPending}>ยกเลิก</AlertDialogCancel><AlertDialogAction onClick={handleCancelOrder} disabled={isCancelPending} className={cn(buttonVariants({ variant: "destructive" }))}>{isCancelPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}ยืนยันการยกเลิก</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <PrintDialog order={order} orderItems={orderItemsProp || []} isOpen={isPrintDialogOpen} onClose={() => setIsPrintDialogOpen(false)} />
        </>
    );
}
