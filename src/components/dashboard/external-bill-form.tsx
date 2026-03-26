'use client';

import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useState, useMemo, useEffect } from 'react';
import { useFirestore, useDoc, useMemoFirebase, useCollection } from '@/firebase';
import { 
  collection, 
  doc, 
  serverTimestamp, 
  writeBatch, 
  getDocs, 
  query, 
  where, 
  runTransaction,
  Timestamp,
} from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { 
  AppUser, 
  ProductGroup, 
  ProductVariant, 
  StoreSettings, 
  InventoryLot, 
  StockAdjustmentTransaction,
  TaxStatus,
  TaxMode,
  GuestCustomer
} from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Loader2, 
  PlusCircle, 
  Trash2, 
  User, 
  MapPin, 
  Phone, 
  Banknote, 
  ReceiptText, 
  Percent, 
  CheckCircle2, 
  X,
  Upload,
  History,
  Info,
  DollarSign,
  Wallet,
  Calendar as CalendarIcon
} from 'lucide-react';
import { ProvinceCombobox } from './province-combobox';
import { ProductSearchDialog } from './product-search-dialog';
import { GuestSearchDialog } from './guest-search-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Image from 'next/image';
import { Separator } from '../ui/separator';
import { Badge } from '../ui/badge';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { v4 as uuidv4 } from 'uuid';
import { cn } from '@/lib/utils';
import { format, getDaysInMonth } from 'date-fns';
import { th } from 'date-fns/locale';

/**
 * คอมโพเนนต์เลือกวันที่แบบดรอปดาวน์ (ห้ามอนาคต)
 */
function DateDropdownPicker({
  field,
  disabled,
}: {
  field: { value?: Date | null; onChange: (date: Date | null) => void };
  disabled?: boolean;
}) {
    const [day, setDay] = useState<string | undefined>(field.value ? String(field.value.getDate()) : undefined);
    const [month, setMonth] = useState<string | undefined>(field.value ? String(field.value.getMonth()) : undefined);
    const [year, setYear] = useState<string | undefined>(field.value ? String(field.value.getFullYear()) : undefined);

    useEffect(() => {
        if (field.value) {
            setDay(String(field.value.getDate()));
            setMonth(String(field.value.getMonth()));
            setYear(String(field.value.getFullYear()));
        } else if (field.value === null) {
            setDay(undefined); setMonth(undefined); setYear(undefined);
        }
    }, [field.value]);

    const currentYear = useMemo(() => new Date().getFullYear(), []);
    const years = useMemo(() => Array.from({ length: 10 }, (_, i) => currentYear - i), [currentYear]);
    const thaiMonths = useMemo(() => Array.from({ length: 12 }, (_, i) => ({
        value: i.toString(),
        label: format(new Date(2000, i, 1), 'LLLL', { locale: th }),
    })), []);

    const daysInMonthLimit = useMemo(() => {
        if (year && month) return getDaysInMonth(new Date(parseInt(year), parseInt(month)));
        return 31;
    }, [month, year]);

    const handleDateChange = (part: 'day' | 'month' | 'year', value: string) => {
        let newDay = part === 'day' ? value : day;
        let newMonth = part === 'month' ? value : month;
        let newYear = part === 'year' ? value : year;
        if (part === 'day') setDay(value);
        if (part === 'month') setMonth(value);
        if (part === 'year') setYear(value);
        if (newDay && newMonth && newYear) {
            let d = parseInt(newDay);
            const m = parseInt(newMonth);
            const y = parseInt(newYear);
            const maxDays = getDaysInMonth(new Date(y, m));
            if (d > maxDays) d = maxDays;
            const newDate = new Date(y, m, d, 12, 0, 0);
            if (!isNaN(newDate.getTime())) field.onChange(newDate);
        } else field.onChange(null);
    };

    return (
        <div className="grid grid-cols-3 gap-2">
            <Select value={day} onValueChange={(v) => handleDateChange('day', v)} disabled={disabled}>
                <FormControl><SelectTrigger className="h-10 bg-white"><SelectValue placeholder="วัน" /></SelectTrigger></FormControl>
                <SelectContent>
                    {Array.from({ length: daysInMonthLimit }, (_, i) => i + 1).map((d) => (
                        <SelectItem key={d} value={d.toString()}>{d}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <Select value={month} onValueChange={(v) => handleDateChange('month', v)} disabled={disabled}>
                <FormControl><SelectTrigger className="h-10 bg-white"><SelectValue placeholder="เดือน" /></SelectTrigger></FormControl>
                <SelectContent>
                    {thaiMonths.map((m) => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <Select value={year} onValueChange={(v) => handleDateChange('year', v)} disabled={disabled}>
                <FormControl><SelectTrigger className="h-10 bg-white"><SelectValue placeholder="ปี (พ.ศ.)" /></SelectTrigger></FormControl>
                <SelectContent>
                    {years.map((y) => (
                        <SelectItem key={y} value={y.toString()}>{y + 543}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}

const externalBillSchema = z.object({
  orderDate: z.date().optional().nullable(),
  recipientName: z.string().min(1, 'กรุณากรอกชื่อผู้รับ'),
  recipientPhone: z.string().min(9, 'กรุณากรอกเบอร์โทรศัพท์'),
  addressLine1: z.string().min(1, 'กรุณากรอกที่อยู่'),
  subdistrict: z.string().min(1, 'กรุณากรอกตำบล/แขวง'),
  district: z.string().min(1, 'กรุณากรอกอำเภอ/เขต'),
  province: z.string().min(1, 'กรุณาเลือกจังหวัด'),
  postalCode: z.string().length(5, 'รหัสไปรษณีย์ต้องมี 5 หลัก'),
  shippingCost: z.coerce.number().min(0, 'ต้องไม่ติดลบ').default(0),
  paidAmount: z.coerce.number().min(0, 'ต้องไม่ติดลบ').default(0),
  items: z.array(z.object({
    productId: z.string(),
    productGroupId: z.string(),
    productName: z.string(),
    sku: z.string(),
    quantity: z.coerce.number().min(1, 'ต้องมีอย่างน้อย 1'),
    itemPrice: z.coerce.number().min(0, 'ราคาต้องไม่ติดลบ'),
    unit: z.string().optional(),
    taxStatus: z.enum(['TAXABLE', 'EXEMPT']),
    taxMode: z.enum(['INCLUSIVE', 'EXCLUSIVE']),
    taxRate: z.coerce.number().min(0),
  })).min(1, 'กรุณาเลือกสินค้าอย่างน้อย 1 รายการ'),
});

type FormValues = z.infer<typeof externalBillSchema>;

const deductFromLots = (lots: InventoryLot[], quantityToDeduct: number) => {
    const fulfilledFromLots: { lotId: string; quantity: number; costPerItem: number; }[] = [];
    const remainingLots = [...lots].map(l => ({ 
        ...l, 
        receivedAt: l.receivedAt?.toDate ? l.receivedAt.toDate() : new Date(l.receivedAt) 
    })).sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());

    let needed = quantityToDeduct;
    for (const lot of remainingLots) {
        if (needed <= 0) break;
        const take = Math.min(lot.quantity, needed);
        if (take > 0) {
            fulfilledFromLots.push({ lotId: lot.lotId, quantity: take, costPerItem: lot.cost });
            lot.quantity -= take;
            needed -= take;
        }
    }
    if (needed > 0) throw new Error("สต็อกในคลังไม่เพียงพอ");
    return { updatedLots: remainingLots.filter(lot => lot.quantity > 0), fulfilled: fulfilledFromLots };
};

export function ExternalBillForm({ adminUser }: { adminUser: AppUser }) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isGuestSearchOpen, setIsGuestSearchOpen] = useState(false);
  const [slipPreview, setSlipPreview] = useState<string | null>(null);

  const settingsRef = useMemoFirebase(() => firestore ? doc(firestore, 'settings', 'store') : null, [firestore]);
  const { data: storeSettings } = useDoc<StoreSettings>(settingsRef);

  const productGroupsQuery = useMemoFirebase(() => !firestore ? null : collection(firestore, 'productGroups'), [firestore]);
  const { data: productGroups } = useCollection<ProductGroup>(productGroupsQuery);
  const [allVariants, setAllVariants] = useState<ProductVariant[]>([]);

  useEffect(() => {
    if (!firestore || !productGroups) return;
    const fetchVariants = async () => {
      const variantsData: ProductVariant[] = [];
      await Promise.all(productGroups.map(async (group) => {
        const variantsRef = collection(firestore, 'productGroups', group.id, 'productVariants');
        const snap = await getDocs(variantsRef);
        snap.forEach(d => variantsData.push({ ...d.data(), id: d.id } as ProductVariant));
      }));
      setAllVariants(variantsData);
    };
    fetchVariants();
  }, [productGroups, firestore]);

  const form = useForm<FormValues>({
    resolver: zodResolver(externalBillSchema),
    defaultValues: {
      orderDate: null,
      recipientName: '', recipientPhone: '', addressLine1: '', subdistrict: '', district: '', province: '', postalCode: '',
      shippingCost: 0, paidAmount: 0, items: [],
    },
  });

  const { control, watch, setValue, getValues, reset } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  const handleProductSelect = (variant: ProductVariant) => {
    const group = productGroups?.find(g => g.id === variant.productGroupId);
    if (!group || fields.some(i => i.productId === variant.id)) return;
    
    const attrs = Object.values(variant.attributes).join(' / ');
    append({
      productId: variant.id,
      productGroupId: variant.productGroupId,
      productName: `${group.name}${attrs ? ` (${attrs})` : ''}`,
      sku: variant.sku,
      quantity: 1,
      itemPrice: variant.price,
      unit: group.unit,
      taxStatus: variant.taxStatus || 'TAXABLE',
      taxMode: variant.taxMode || 'INCLUSIVE',
      taxRate: variant.taxRate ?? 7,
    });
  };

  const handleGuestSelect = (guest: GuestCustomer) => {
    const currentValues = getValues();
    reset({
      ...currentValues,
      recipientName: guest.name,
      recipientPhone: guest.phone,
      addressLine1: guest.addressLine1 || '',
      subdistrict: guest.subdistrict || '',
      district: guest.district || '',
      province: guest.province || '',
      postalCode: guest.postalCode || '',
    });
    toast({ title: 'ดึงข้อมูลลูกค้าแล้ว' });
  };

  const totals = useMemo(() => {
    const values = watch();
    let subtotalBeforeTax = 0;
    let totalTaxAmount = 0;
    let rawGrandTotal = 0;

    (values.items || []).forEach(item => {
      const lineBase = item.itemPrice * item.quantity;
      if (item.taxStatus === 'TAXABLE') {
        if (item.taxMode === 'INCLUSIVE') {
          const beforeTax = lineBase / (1 + (item.taxRate / 100));
          const lineTax = lineBase - beforeTax;
          subtotalBeforeTax += beforeTax;
          totalTaxAmount += lineTax;
          rawGrandTotal += lineBase;
        } else {
          const lineTax = lineBase * (item.taxRate / 100);
          subtotalBeforeTax += lineBase;
          totalTaxAmount += lineTax;
          rawGrandTotal += (lineBase + lineTax);
        }
      } else {
        subtotalBeforeTax += lineBase;
        rawGrandTotal += lineBase;
      }
    });

    const shipping = Number(values.shippingCost) || 0;
    const defaultTaxRate = storeSettings?.defaultTaxRate ?? 7;
    const shippingBeforeTax = shipping / (1 + (defaultTaxRate / 100));
    const shippingTax = shipping - shippingBeforeTax;
    
    subtotalBeforeTax += shippingBeforeTax;
    totalTaxAmount += shippingTax;
    rawGrandTotal += shipping;

    const paidAmount = Number(values.paidAmount) || 0;
    
    // Financial rounding to 2 decimal places
    const subtotal = Math.round(subtotalBeforeTax * 100) / 100;
    const taxAmount = Math.round(totalTaxAmount * 100) / 100;
    const grandTotal = Math.round(rawGrandTotal * 100) / 100;
    const balanceAmount = Math.max(0, Math.round((grandTotal - paidAmount) * 100) / 100);

    return { subtotal, taxAmount, grandTotal, balanceAmount };
  }, [watch(), storeSettings]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 700 * 1024) {
        toast({ variant: 'destructive', title: 'ไฟล์ใหญ่เกินไป', description: 'กรุณาใช้รูปไม่เกิน 700KB' });
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => setSlipPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const onSubmit = async (values: FormValues) => {
    if (!firestore || !adminUser) return;
    setIsSubmitting(true);

    try {
      await runTransaction(firestore, async (transaction) => {
        const orderItemsData: any[] = [];
        const stockUpdates: any[] = [];

        for (const item of values.items) {
          const vRef = doc(firestore, 'productGroups', item.productGroupId, 'productVariants', item.productId);
          const vSnap = await transaction.get(vRef);
          if (!vSnap.exists()) throw new Error(`ไม่พบสินค้า ${item.productName}`);
          
          const vData = vSnap.data() as ProductVariant;
          let fulfilledLots: any[] = [];

          if (vData.trackInventory) {
            const { updatedLots, fulfilled } = deductFromLots(vData.inventoryLots || [], item.quantity);
            fulfilledLots = fulfilled;
            stockUpdates.push({ ref: vRef, newLots: updatedLots, variantId: item.productId, groupId: item.productGroupId, fulfilled });
          }

          orderItemsData.push({
            productId: item.productId,
            productGroupId: item.productGroupId,
            type: 'PRODUCT',
            productName: item.productName,
            quantity: item.quantity,
            itemPrice: item.itemPrice,
            fulfilledFromLots: fulfilledLots,
            taxStatus: item.taxStatus,
            taxMode: item.taxMode,
            taxRate: item.taxRate,
          });
        }

        const guestId = values.recipientPhone.replace(/\D/g, '');
        if (guestId) {
          const guestRef = doc(firestore, 'guestCustomers', guestId);
          transaction.set(guestRef, {
            id: guestId,
            name: values.recipientName,
            phone: values.recipientPhone,
            addressLine1: values.addressLine1,
            subdistrict: values.subdistrict,
            district: values.district,
            province: values.province,
            postalCode: values.postalCode,
            lastPurchaseAt: serverTimestamp(),
          }, { merge: true });
        }

        const orderRef = doc(collection(firestore, 'orders'));
        const payments = [];
        if (slipPreview && values.paidAmount > 0) {
          payments.push({
            id: uuidv4(),
            amount: values.paidAmount,
            slipUrl: slipPreview,
            createdAt: new Date().toISOString(),
            adminId: adminUser.id,
            adminName: adminUser.name,
            note: 'เงินมัดจำ/งวดแรก (บิลอิสระ)',
          });
        }

        const finalOrderDate = values.orderDate ? Timestamp.fromDate(values.orderDate) : serverTimestamp();

        const orderData = {
          id: orderRef.id,
          buyerId: `GUEST_${guestId || uuidv4()}`,
          guestId: guestId || null,
          buyerName: 'ลูกค้าภายนอก (ขายตรง)',
          sellerIds: [adminUser.id],
          orderDate: finalOrderDate,
          status: totals.balanceAmount === 0 ? 'READY_TO_SHIP' : 'PROCESSING',
          totalAmount: totals.grandTotal,
          paidAmount: values.paidAmount,
          balanceAmount: totals.balanceAmount,
          payments: payments,
          customerName: values.recipientName,
          shippingAddress: {
            name: values.recipientName,
            phone: values.recipientPhone,
            addressLine1: values.addressLine1,
            subdistrict: values.subdistrict,
            district: values.district,
            province: values.province,
            postalCode: values.postalCode,
          },
          shippingMethod: 'จัดส่งภายนอก (Manual)',
          shippingCost: values.shippingCost,
          taxAmount: totals.taxAmount,
          subtotalBeforeTax: totals.subtotal,
          paymentSlipUrl: slipPreview || null,
          isExternal: true,
          createdById: adminUser.id,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        transaction.set(orderRef, orderData);

        orderItemsData.forEach(item => {
          const itemRef = doc(collection(firestore, 'orders', orderRef.id, 'orderItems'));
          transaction.set(itemRef, { ...item, orderId: orderRef.id });
        });

        stockUpdates.forEach(({ ref, newLots, variantId, groupId, fulfilled }) => {
          transaction.update(ref, { inventoryLots: newLots });
          fulfilled.forEach((f: any) => {
            const adjRef = doc(collection(firestore, 'productGroups', groupId, 'productVariants', variantId, 'stockAdjustments'));
            transaction.set(adjRef, {
              productVariantId: variantId,
              lotId: f.lotId,
              adminUserId: adminUser.id,
              adminName: adminUser.name,
              type: 'SALE',
              quantity: f.quantity,
              reason: `ขายตรงภายนอก (ออเดอร์ #${orderRef.id.substring(0, 6)})`,
              createdAt: finalOrderDate,
            });
          });
        });

        const auditLogRef = doc(collection(firestore, 'auditLogs'));
        transaction.set(auditLogRef, {
          adminUserId: adminUser.id,
          adminName: adminUser.name,
          action: 'CREATE_EXTERNAL_ORDER',
          targetId: orderRef.id,
          createdAt: serverTimestamp(),
        });
      });

      toast({ title: 'เปิดบิลอิสระสำเร็จ', description: 'ระบบบันทึกรายการและตัดสต็อกเรียบร้อยแล้ว' });
      router.push('/dashboard/orders');
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'ดำเนินการล้มเหลว', description: e.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: Recipient & Payment */}
          <div className="lg:col-span-1 space-y-6">
            <Card className="shadow-sm border-emerald-100">
              <CardHeader className="bg-emerald-50/50 rounded-t-lg border-b border-emerald-100">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <User className="h-5 w-5 text-emerald-600" />
                    ข้อมูลผู้รับ (ภายนอก)
                  </CardTitle>
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm" 
                    className="h-8 text-xs font-bold bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                    onClick={() => setIsGuestSearchOpen(true)}
                  >
                    <History className="mr-1.5 h-3.5 w-3.5" /> ค้นหาลูกค้าเก่า
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                <FormField name="orderDate" control={control} render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2 text-primary font-bold">
                      <CalendarIcon className="h-4 w-4" /> วันที่สั่งซื้อ (ย้อนหลัง)
                    </FormLabel>
                    <DateDropdownPicker field={field} />
                    <FormDescription className="text-[10px]">ปล่อยว่างหากต้องการใช้เวลาปัจจุบันในการออกบิล</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                <Separator className="my-2" />
                
                <FormField name="recipientName" control={control} render={({ field }) => (
                  <FormItem><FormLabel>ชื่อผู้รับ/บริษัท *</FormLabel><FormControl><Input placeholder="ระบุชื่อจริง-นามสกุล หรือชื่อนิติบุคคล" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField name="recipientPhone" control={control} render={({ field }) => (
                  <FormItem><FormLabel>เบอร์โทรศัพท์ *</FormLabel><FormControl><Input placeholder="0xx-xxx-xxxx" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField name="addressLine1" control={control} render={({ field }) => (
                  <FormItem><FormLabel>ที่อยู่จัดส่ง *</FormLabel><FormControl><Textarea rows={2} placeholder="เลขที่, อาคาร, หมู่บ้าน, ถนน" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField name="subdistrict" control={control} render={({ field }) => (<FormItem><FormLabel>ตำบล *</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                  <FormField name="district" control={control} render={({ field }) => (<FormItem><FormLabel>อำเภอ *</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField name="province" control={control} render={({ field }) => (
                    <FormItem><FormLabel>จังหวัด *</FormLabel><ProvinceCombobox value={field.value} onChange={field.onChange} /></FormItem>
                  )} />
                  <FormField name="postalCode" control={control} render={({ field }) => (<FormItem><FormLabel>รหัสไปรษณีย์ *</FormLabel><FormControl><Input maxLength={5} {...field} /></FormControl></FormItem>)} />
                </div>
              </CardContent>
            </Card>

            <Card className="border-blue-100">
              <CardHeader className="bg-blue-50/50 rounded-t-lg border-b border-blue-100">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Banknote className="h-5 w-5 text-blue-600" />
                  หลักฐานการโอนเงิน
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                {!slipPreview ? (
                  <div className="space-y-2">
                    <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-xl cursor-pointer hover:bg-muted/50 transition-colors border-muted-foreground/30">
                      <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                      <p className="text-xs text-muted-foreground">คลิกเพื่อแนบสลิป (ถ้ามี)</p>
                      <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                    </label>
                  </div>
                ) : (
                  <div className="relative w-full aspect-[9/16] rounded-xl overflow-hidden border bg-black/5 max-w-[180px] mx-auto group">
                    <Image src={slipPreview} alt="Preview Slip" fill className="object-contain" />
                    <button className="absolute top-2 right-2 bg-destructive text-white rounded-full p-1" onClick={() => setSlipPreview(null)}><X className="h-4 w-4" /></button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right: Items & Summary */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>รายการสินค้าที่ขาย</CardTitle>
                  <CardDescription>เลือกสินค้าจากสต็อกและระบุราคาขายจริง</CardDescription>
                </div>
                <Button type="button" variant="outline" onClick={() => setIsSearchOpen(true)}>
                  <PlusCircle className="mr-2 h-4 w-4" /> เพิ่มสินค้า
                </Button>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>สินค้า</TableHead>
                        <TableHead className="w-[80px] text-center">จำนวน</TableHead>
                        <TableHead className="w-[120px] text-right">ราคา/หน่วย</TableHead>
                        <TableHead className="w-[120px] text-right">รวม</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fields.length === 0 ? (
                        <TableRow><TableCell colSpan={5} className="h-32 text-center text-muted-foreground italic">กรุณากดปุ่มเพิ่มสินค้าเพื่อเริ่มรายการ</TableCell></TableRow>
                      ) : (
                        fields.map((item, index) => {
                          const itemValues = watch(`items.${index}`);
                          const lineTotal = itemValues.itemPrice * itemValues.quantity;
                          const isExempt = itemValues.taxStatus === 'EXEMPT';
                          const isInclusive = itemValues.taxMode === 'INCLUSIVE';

                          return (
                            <TableRow key={item.id}>
                              <TableCell>
                                <div className="font-bold text-sm leading-tight">{item.productName}</div>
                                <div className="flex items-center gap-2 mt-1">
                                  <div className="text-[10px] text-muted-foreground font-mono">{item.sku}</div>
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Badge variant="outline" className={cn(
                                          "text-[9px] h-4 px-1 leading-none font-bold uppercase",
                                          isExempt ? "border-muted-foreground/30 text-muted-foreground" : "border-primary/30 text-primary"
                                        )}>
                                          {isExempt ? 'NO VAT' : `${isInclusive ? 'INC' : 'EXC'} ${itemValues.taxRate}%`}
                                        </Badge>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p className="text-xs">
                                          {isExempt ? 'สินค้านี้ได้รับยกเว้นภาษี' : 
                                           `ภาษี ${itemValues.taxRate}% แบบ${isInclusive ? 'รวมในราคาสินค้า' : 'แยกต่างหาก'}`}
                                        </p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </div>
                              </TableCell>
                              <TableCell>
                                <FormField name={`items.${index}.quantity`} control={control} render={({ field }) => (
                                  <FormControl><Input type="number" className="h-9 text-center px-1" {...field} /></FormControl>
                                )} />
                              </TableCell>
                              <TableCell>
                                <FormField name={`items.${index}.itemPrice`} control={control} render={({ field }) => (
                                  <FormControl><Input type="number" className="h-9 text-right font-medium px-1" {...field} /></FormControl>
                                )} />
                              </TableCell>
                              <TableCell className="text-right font-bold">
                                <div className="flex flex-col items-end">
                                  <span>฿{(lineTotal + (!isExempt && !isInclusive ? lineTotal * (itemValues.taxRate / 100) : 0)).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                  {!isExempt && !isInclusive && (
                                    <span className="text-[9px] text-muted-foreground font-normal">ยังไม่รวม VAT</span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Button variant="ghost" size="icon" onClick={() => remove(index)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                              </TableCell>
                            </TableRow>
                          )
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[#FAF9F6] dark:bg-card border-[#E8E4D9]">
              <CardHeader><CardTitle className="text-lg">สรุปยอดเงินและภาษี</CardTitle></CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-background rounded-lg border border-dashed p-4">
                    <FormField name="shippingCost" control={control} render={({ field }) => (
                      <FormItem className="flex justify-between items-center space-y-0">
                        <FormLabel className="text-xs font-bold uppercase text-muted-foreground">ค่าจัดส่ง</FormLabel>
                        <FormControl><Input type="number" className="h-9 font-bold text-primary w-24 text-right" {...field} /></FormControl>
                      </FormItem>
                    )} />
                  </div>
                  <div className="bg-background rounded-lg border border-dashed p-4 ring-2 ring-primary/10">
                    <FormField name="paidAmount" control={control} render={({ field }) => (
                      <FormItem className="flex justify-between items-center space-y-0">
                        <FormLabel className="text-xs font-bold uppercase text-primary">ยอดรับเงินจริง</FormLabel>
                        <FormControl><Input type="number" className="h-9 font-bold text-emerald-600 w-24 text-right" {...field} /></FormControl>
                      </FormItem>
                    )} />
                  </div>
                </div>

                <div className="space-y-3 px-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground flex items-center gap-1.5"><ReceiptText className="h-3.5 w-3.5" /> ยอดก่อนภาษีรวม</span>
                    <span className="font-medium">฿{totals.subtotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground flex items-center gap-1.5"><Percent className="h-3.5 w-3.5" /> ภาษีมูลค่าเพิ่มรวม</span>
                    <span className="font-medium">฿{totals.taxAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <Separator className="my-2" />
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-bold">ยอดสุทธิทั้งสิ้น</span>
                    <span className="text-2xl font-bold">฿{totals.grandTotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  {totals.balanceAmount > 0 && (
                    <div className="flex justify-between items-center p-2 bg-orange-50 border border-orange-200 rounded text-orange-700">
                      <span className="text-sm font-bold flex items-center gap-1.5"><Wallet className="h-4 w-4" /> ยอดค้างชำระ</span>
                      <span className="text-lg font-bold">฿{totals.balanceAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  )}
                </div>
              </CardContent>
              <CardFooter className="pt-2">
                <Button 
                  onClick={form.handleSubmit(onSubmit)} 
                  className={cn(
                    "w-full h-12 text-base font-bold shadow-lg",
                    totals.balanceAmount > 0 ? "bg-blue-600 hover:bg-blue-700" : "bg-emerald-600 hover:bg-emerald-700"
                  )} 
                  disabled={isSubmitting || fields.length === 0}
                >
                  {isSubmitting ? (
                    <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> กำลังบันทึกข้อมูล...</>
                  ) : (
                    <>
                      <CheckCircle2 className="mr-2 h-5 w-5" /> 
                      {totals.balanceAmount > 0 ? 'ยืนยันการแบ่งชำระและตัดสต็อก' : 'ยืนยันการรับเงินเต็มจำนวนและตัดสต็อก'}
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      </form>

      <ProductSearchDialog 
        isOpen={isSearchOpen}
        onOpenChange={setIsSearchOpen}
        onProductSelect={handleProductSelect}
        productGroups={productGroups || []}
        allVariants={allVariants}
        existingVariantIds={fields.map(item => item.productId)}
      />

      <GuestSearchDialog 
        isOpen={isGuestSearchOpen}
        onOpenChange={setIsGuestSearchOpen}
        onGuestSelect={handleGuestSelect}
      />
    </Form>
  );
}
