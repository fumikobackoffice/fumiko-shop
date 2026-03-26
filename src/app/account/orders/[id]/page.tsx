'use client';

import { useAuth } from '@/hooks/use-auth';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useDoc, useFirestore, useMemoFirebase, useCollection } from '@/firebase';
import { doc, collection, getDoc } from 'firebase/firestore';
import { Order, OrderItem, Product, ProductPackage, StoreSettings } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Truck, Image as ImageIcon, Ticket, Info, Package, MapPin, ExternalLink, Clock, Banknote, Store, Copy, RotateCcw, Loader2, ReceiptText, Percent, Car } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import Image from 'next/image';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CustomDialog } from '@/components/dashboard/custom-dialog';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { useCart } from '@/hooks/use-cart';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';

// Color variants for status badges
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

// Text for status badges
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

function PageSkeleton() {
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <Skeleton className="h-9 w-48" />
                <Skeleton className="h-9 w-24" />
            </div>
            <div className="grid md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-6">
                    <Skeleton className="h-64 w-full" />
                    <Skeleton className="h-40 w-full" />
                </div>
                <div className="space-y-6">
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-40 w-full" />
                    <Skeleton className="h-24 w-full" />
                </div>
            </div>
      </div>
    )
}

function OrderDetailsContent({ order, orderItems }: { order: Order, orderItems: OrderItem[] }) {
  const isShippedOrCompleted = order.status === 'SHIPPED' || order.status === 'COMPLETED';
  const [isSlipViewerOpen, setIsSlipViewerOpen] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  const { toast } = useToast();
  const { addToCart } = useCart();
  const router = useRouter();
  const firestore = useFirestore();

  const settingsRef = useMemoFirebase(() => firestore ? doc(firestore, 'settings', 'store') : null, [firestore]);
  const { data: storeSettings } = useDoc<StoreSettings>(settingsRef);
  const pointsRate = storeSettings?.pointsRate || 100;

  const handleReorder = async () => {
    if (!firestore || !orderItems) return;
    setIsReordering(true);
    
    let successCount = 0;
    let issues: string[] = [];
    
    try {
      for (const item of orderItems) {
        if (item.type === 'PRODUCT' || !item.type) {
          const groupRef = doc(firestore, 'productGroups', item.productGroupId!);
          const variantRef = doc(firestore, 'productGroups', item.productGroupId!, 'productVariants', item.productId);
          
          const [groupSnap, variantSnap] = await Promise.all([getDoc(groupRef), getDoc(variantRef)]);
          
          if (!groupSnap.exists() || !variantSnap.exists() || groupSnap.data().status !== 'active' || variantSnap.data().status === 'archived') {
            issues.push(item.productName);
            continue;
          }
          
          const groupData = groupSnap.data();
          const variantData = variantSnap.data();
          const totalStock = (variantData.inventoryLots || []).reduce((acc: number, lot: any) => acc + lot.quantity, 0);
          
          const productForCart: Product = {
            ...variantData,
            id: variantSnap.id,
            name: groupData.name,
            description: groupData.description,
            category: groupData.category,
            brand: groupData.brand,
            unit: groupData.unit,
            priceType: groupData.priceType,
            status: groupData.status,
            sellerId: groupData.sellerId,
          } as any;

          if (variantData.trackInventory) {
            if (totalStock <= 0) {
              issues.push(item.productName);
              continue;
            } else if (totalStock < item.quantity) {
              addToCart(productForCart, totalStock);
              issues.push(`${item.productName} (มีเพียง ${totalStock} ชิ้น)`);
              successCount++;
              continue;
            }
          }
          
          addToCart(productForCart, item.quantity);
          successCount++;

        } else if (item.type === 'PACKAGE') {
          const pkgRef = doc(firestore, 'productPackages', item.productId);
          const pkgSnap = await getDoc(pkgRef);
          
          if (!pkgSnap.exists() || pkgSnap.data().status !== 'active') {
            issues.push(item.productName);
            continue;
          }
          
          const pkgData = { ...pkgSnap.data(), id: pkgSnap.id } as ProductPackage;
          addToCart(pkgData, item.quantity);
          successCount++;
        }
      }
      
      if (issues.length > 0) {
        toast({
          variant: "destructive",
          title: "สั่งซื้อสำเร็จบางส่วน",
          description: `สินค้าบางรายการไม่พอหรือเลิกจำหน่าย: ${issues.join(', ')}`,
        });
      } else if (successCount > 0) {
        toast({
          title: "เพิ่มสินค้าลงตะกร้าแล้ว",
          description: "กำลังนำคุณไปยังหน้าตะกร้าสินค้า...",
        });
      }

      if (successCount > 0) {
        setTimeout(() => router.push('/cart'), 500);
      }
      
    } catch (error: any) {
      console.error("Reorder failed:", error);
      toast({
        variant: "destructive",
        title: "เกิดข้อผิดพลาด",
        description: "ไม่สามารถสั่งซื้อซ้ำได้ในขณะนี้",
      });
    } finally {
      setIsReordering(false);
    }
  };

  const pointsToEarn = useMemo(() => {
    const eligibleAmount = orderItems
        .filter(item => item.type !== 'SERVICE')
        .reduce((sum, item) => sum + (item.itemPrice * item.quantity), 0);
    const netPaidAmount = Math.max(0, order.totalAmount - (order.shippingCost || 0));
    return Math.floor(Math.min(eligibleAmount, netPaidAmount) / pointsRate);
  }, [order, orderItems, pointsRate]);

  const orderDateObj = order.orderDate?.toDate ? order.orderDate.toDate() : new Date(order.orderDate);
  const displayDate = orderDateObj ? format(orderDateObj, 'd MMM ', { locale: th }) + (orderDateObj.getFullYear() + 543) + format(orderDateObj, ' HH:mm', { locale: th }) : '-';

  return (
    <>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-headline font-bold">รายละเอียดคำสั่งซื้อ</h1>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-1">
            <p className="text-muted-foreground break-all">รหัสอ้างอิง #{order.id}</p>
            {order.branchName && (
                <>
                    <span className="hidden sm:inline text-muted-foreground">•</span>
                    <div className="flex items-center gap-1.5 text-primary font-medium">
                        <Store className="h-4 w-4" />
                        <span>สาขา: {order.branchName}</span>
                    </div>
                </>
            )}
          </div>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
            <Button 
                onClick={handleReorder} 
                disabled={isReordering}
                className="w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/90"
            >
                {isReordering ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                    <RotateCcw className="mr-2 h-4 w-4" />
                )}
                สั่งซื้ออีกครั้ง
            </Button>
        </div>
      </div>

      {order.status === 'PENDING_PAYMENT' && (
        <Alert className="mb-6 bg-yellow-50 border-yellow-200">
          <Clock className="h-4 w-4 text-yellow-600" />
          <AlertTitle className="text-yellow-800">รอการชำระเงิน</AlertTitle>
          <AlertDescription className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-2">
            <span className="text-yellow-700">กรุณาชำระเงินและแนบหลักฐานการโอนเงินเพื่อดำเนินการสั่งซื้อต่อ</span>
            <Button asChild className="bg-yellow-600 hover:bg-yellow-700 text-white">
              <Link href={`/payment/${order.id}`}>
                <Banknote className="mr-2 h-4 w-4" />
                ไปยังหน้าชำระเงิน
              </Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {order.status === 'EXPIRED' && (
        <Alert variant="default" className="mb-6 border-gray-300 bg-gray-50 text-gray-800">
          <Clock className="h-4 w-4" />
          <AlertTitle>ออเดอร์หมดอายุ</AlertTitle>
          <AlertDescription>
            คำสั่งซื้อนี้หมดอายุแล้วเนื่องจากไม่ได้ชำระเงินภายในเวลาที่กำหนด 
            หากคุณยังคงต้องการสินค้าเหล่านี้ โปรดกดปุ่ม <strong>"สั่งซื้ออีกครั้ง"</strong> ด้านบนเพื่อสร้างรายการใหม่ครับ
          </AlertDescription>
        </Alert>
      )}

      {order.status === 'CANCELLED' && (
        <Alert variant="destructive" className="mb-6 bg-red-50 border-red-200 text-red-900">
          <Info className="h-4 w-4" />
          <AlertTitle>คำสั่งซื้อถูกยกเลิก</AlertTitle>
          <AlertDescription>
            คำสั่งซื้อนี้ถูกยกเลิกแล้ว 
            หากคุณต้องการสินค้าเหล่านี้อีกครั้ง สามารถกดปุ่ม <strong>"สั่งซื้ออีกครั้ง"</strong> ด้านบนได้เลยครับ
          </AlertDescription>
        </Alert>
      )}

      <div className="grid md:grid-cols-3 gap-6 items-start">
        {/* Left Column */}
        <div className="md:col-span-2 space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Package className="h-5 w-5"/>รายการสินค้า</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="border rounded-lg overflow-hidden">
                        <Table>
                            <TableHeader><TableRow className="bg-muted/50"><TableHead>สินค้า</TableHead><TableHead className="text-center">จำนวน</TableHead><TableHead className="text-right">ราคา/หน่วย</TableHead><TableHead className="text-right">รวม</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {orderItems.map((item) => (
                                    <TableRow key={item.id}>
                                        <TableCell>
                                            <p className="font-medium">{item.productName.replace(/\s*\(\)$/, '')}</p>
                                            {item.taxStatus && (
                                                <p className="text-[10px] text-muted-foreground leading-none mt-1">
                                                    {item.taxStatus === 'EXEMPT' ? 'ยกเว้นภาษี' : (item.taxMode === 'EXCLUSIVE' ? 'แยก VAT' : 'รวม VAT')}
                                                </p>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-center">{item.quantity}</TableCell>
                                        <TableCell className="text-right">฿{item.itemPrice.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="text-right">฿{(item.quantity * item.itemPrice).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                            <TableFooter className="bg-transparent">
                                <TableRow className="border-t-2"><TableCell colSpan={3} className="text-right text-muted-foreground flex items-center justify-end gap-2"><ReceiptText className="h-3.5 w-3.5" /> มูลค่าสินค้าก่อนภาษี</TableCell><TableCell className="text-right">฿{(order.subtotalBeforeTax || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</TableCell></TableRow>
                                <TableRow><TableCell colSpan={3} className="text-right text-muted-foreground flex items-center justify-end gap-2"><Percent className="h-3.5 w-3.5" /> ภาษีมูลค่าเพิ่ม ({order.taxRate || 7}%)</TableCell><TableCell className="text-right">฿{(order.taxAmount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</TableCell></TableRow>
                                <TableRow><TableCell colSpan={3} className="text-right">ค่าจัดส่ง</TableCell><TableCell className="text-right">฿{(order.shippingCost || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</TableCell></TableRow>
                                {order.pointsDiscount > 0 && <TableRow><TableCell colSpan={3} className="text-right text-primary">ส่วนลดจากคะแนน</TableCell><TableCell className="text-right text-primary">- ฿{order.pointsDiscount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</TableCell></TableRow>}
                                <TableRow className="font-bold text-base bg-muted/30"><TableCell colSpan={3} className="text-right">ยอดรวมสุทธิ (รวมภาษี)</TableCell><TableCell className="text-right">฿{order.totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</TableCell></TableRow>
                            </TableFooter>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {isShippedOrCompleted && (
                 <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><Truck className="h-5 w-5" />ข้อมูลการติดตามพัสดุ</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        {order.shipments && order.shipments.length > 0 ? (
                            order.shipments.map((shipment, index) => (
                                <div key={shipment.id} className={index > 0 ? "pt-4 border-t space-y-1" : "space-y-1"}>
                                    <p><strong>บริษัทขนส่ง:</strong> {shipment.carrier || '-'}</p>
                                    <div className="flex items-center gap-2">
                                        <strong>เลขพัสดุ:</strong> 
                                        <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-sm">{shipment.trackingNumber || '-'}</span>
                                        {shipment.trackingNumber && shipment.trackingNumber !== '-' && (
                                            <Button 
                                                variant="outline" 
                                                size="icon" 
                                                className="h-7 w-7"
                                                title="คัดลอกเลขพัสดุ"
                                                onClick={() => {
                                                    navigator.clipboard.writeText(shipment.trackingNumber);
                                                    toast({ title: 'คัดลอกเลขพัสดุแล้ว', description: shipment.trackingNumber });
                                                }}
                                            >
                                                <Copy className="h-3.5 w-3.5" />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            ))
                        ) : (
                          <p className="text-muted-foreground">ยังไม่มีข้อมูลการจัดส่ง</p>
                        )}
                        <Separator />
                        <h3 className="font-semibold flex items-center gap-2"><ImageIcon className="h-5 w-5" />รูปภาพหลักฐานการจัดส่ง</h3>
                        {order.shipmentProofImageUrls && order.shipmentProofImageUrls.length > 0 ? (
                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-2">
                                {order.shipmentProofImageUrls.map((url, index) => (
                                    <a key={index} href={url} target="_blank" rel="noopener noreferrer">
                                        <Image
                                            src={url}
                                            alt={`หลักฐานการจัดส่ง ${index + 1}`}
                                            width={100}
                                            height={100}
                                            className="aspect-square w-full h-auto rounded-md object-cover border hover:opacity-80 transition-opacity"
                                        />
                                    </a>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground">ยังไม่มีรูปภาพหลักฐานการจัดส่ง</p>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>

        {/* Right Column */}
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>สถานะคำสั่งซื้อ</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center justify-center text-center gap-4">
                   <Badge variant={getStatusVariant(order.status)} className="text-base px-4 py-1">{getStatusText(order.status)}</Badge>
                   <p className="text-sm text-muted-foreground">{displayDate}</p>
                   
                   {order.paymentSlipUrl && (
                     <div className="space-y-2 w-full flex flex-col items-center">
                        <Separator className="my-2" />
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">หลักฐานการโอนเงิน</p>
                        <button 
                          onClick={() => setIsSlipViewerOpen(true)}
                          className="relative w-32 aspect-[9/16] rounded-md overflow-hidden border shadow-sm group hover:opacity-90 transition-opacity"
                        >
                          <Image 
                            src={order.paymentSlipUrl} 
                            alt="Payment Slip Thumbnail" 
                            fill 
                            className="object-cover"
                          />
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <ImageIcon className="h-6 w-6 text-white" />
                          </div>
                        </button>
                        <Button variant="link" size="sm" onClick={() => setIsSlipViewerOpen(true)} className="h-auto p-0">ขยายรูปสลิป</Button>
                     </div>
                   )}
                </CardContent>
            </Card>

            {order.lalamoveVehicle && (
                <Card className="border-blue-200 bg-blue-50/30">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <Car className="h-4 w-4 text-blue-600" />
                            การจัดส่งด้วย Lalamove
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-sm">
                            <p className="font-bold text-blue-700">{order.lalamoveVehicle.type}</p>
                            <p className="text-xs text-muted-foreground mt-1">จัดส่งด่วนแบบเหมาคันตามราคาที่ตกลงไว้</p>
                        </div>
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5" />ที่อยู่สำหรับจัดส่ง</CardTitle>
                </CardHeader>
                <CardContent>
                    <address className="not-italic text-sm text-muted-foreground space-y-1">
                        <p className="font-semibold text-foreground">{order.shippingAddress.name}</p>
                        <p>{order.shippingAddress.phone}</p>
                        <p>{order.shippingAddress.addressLine1}</p>
                        {order.shippingAddress.addressLine2 && <p>{order.shippingAddress.addressLine2}</p>}
                        <p>{order.shippingAddress.subdistrict}, {order.shippingAddress.district}</p>
                        <p>{order.shippingAddress.province} {order.shippingAddress.postalCode}</p>
                        {order.shippingAddress.googleMapsUrl && (
                            <div className="pt-3">
                                <Button variant="outline" size="sm" className="w-full h-9" asChild>
                                    <a href={order.shippingAddress.googleMapsUrl} target="_blank" rel="noopener noreferrer">
                                        <MapPin className="mr-2 h-4 w-4" />
                                        เปิดใน Google Maps
                                        <ExternalLink className="ml-2 h-3 w-3" />
                                    </a>
                                </Button>
                            </div>
                        )}
                    </address>
                </CardContent>
            </Card>
            
            {((order.pointsUsed && order.pointsUsed > 0) || pointsToEarn > 0) && (
              <Card>
                  <CardHeader><CardTitle className="font-headline text-lg flex items-center gap-2"><Ticket className="h-5 w-5"/>สรุปคะแนนสะสม</CardTitle></CardHeader>
                  <CardContent className="text-sm space-y-2">
                      {order.pointsUsed && order.pointsUsed > 0 && (
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">คะแนนที่ใช้ไป</span>
                            <span className="font-medium text-destructive">{order.pointsUsed.toLocaleString()} คะแนน</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                          <span className="text-muted-foreground">คะแนนที่จะได้รับ</span>
                          <span className="font-medium text-green-600">+ {pointsToEarn.toLocaleString()} คะแนน</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground italic">*ไม่รวมคะแนนจากรายการงานบริการ</p>
                      {order.status !== 'COMPLETED' && order.status !== 'SHIPPED' && order.status !== 'CANCELLED' && order.status !== 'EXPIRED' &&
                          <p className="text-xs text-muted-foreground pt-1">
                              *คุณจะได้รับคะแนนสะสมเมื่อการชำระเงินได้รับการยืนยันแล้ว
                          </p>
                      }
                  </CardContent>
              </Card>
            )}
        </div>
      </div>
      <CustomDialog
        isOpen={isSlipViewerOpen}
        onClose={() => setIsSlipViewerOpen(false)}
        title="สลิปการชำระเงิน"
        size="lg"
      >
        {order.paymentSlipUrl ? (
          <div className="relative w-full max-w-sm mx-auto aspect-[9/16] rounded-lg overflow-hidden border group shrink-0 mt-4">
            <Image src={order.paymentSlipUrl} alt="Payment Slip" fill className="bg-muted object-contain" />
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-8">ไม่พบไฟล์สลิป</p>
        )}
        <div className="flex justify-end gap-2 pt-6 mt-6 border-t">
            <Button variant="outline" onClick={() => setIsSlipViewerOpen(false)}>ปิด</Button>
        </div>
      </CustomDialog>
    </>
  )
}

export default function BuyerOrderDetailsPage() {
  const { user: authUser, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const orderId = params.id as string;
  const firestore = useFirestore();

  const orderRef = useMemoFirebase(() => 
    firestore && orderId ? doc(firestore, 'orders', orderId) : null,
    [firestore, orderId]
  );
  const { data: order, isLoading: isOrderLoading, error: orderError } = useDoc<Order>(orderRef);

  const orderItemsQuery = useMemoFirebase(() => 
    order ? collection(firestore, 'orders', order.id, 'orderItems') : null, 
    [firestore, order]
  );
  const { data: orderItems, isLoading: areItemsLoading } = useCollection<OrderItem>(orderItemsQuery);
  
  useEffect(() => {
    if (!authLoading && !authUser) {
      router.replace('/login');
    } else if (!authLoading && authUser && authUser.role !== 'seller') {
      router.replace('/dashboard');
    }
  }, [authLoading, authUser, router]);

  const isLoading = authLoading || isOrderLoading || (order && areItemsLoading);

  useEffect(() => {
    if (!isLoading && order && authUser && authUser.id !== order.buyerId) {
      router.replace('/dashboard/orders');
    }
  }, [isLoading, order, authUser, router]);

  if (isLoading) {
    return <PageSkeleton />;
  }

  if (!order || orderError) {
    return (
        <Alert variant="destructive" className="max-w-2xl mx-auto">
            <Info className="h-4 w-4" />
            <AlertTitle>ไม่พบคำสั่งซื้อ</AlertTitle>
            <AlertDescription>
                ไม่พบข้อมูลคำสั่งซื้อที่คุณต้องการ หรือเกิดข้อผิดพลาดในการโหลดข้อมูล
            </AlertDescription>
        </Alert>
    )
  }

  return <OrderDetailsContent order={order} orderItems={orderItems || []} />;
}
