'use client';

import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useState, useMemo, useEffect } from 'react';
import { Loader2, PlusCircle, Trash2, Send, Percent, ReceiptText } from 'lucide-react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, serverTimestamp, doc, writeBatch, getDocs, query, where, limit, runTransaction, setDoc, updateDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { PurchaseOrder, ProductGroup, ProductVariant, PurchaseOrderTaxMode } from '@/lib/types';
import { clearGlobalCache } from '@/hooks/use-smart-fetch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { ProductSearchDialog } from './product-search-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SupplierCombobox } from './supplier-combobox';
import { UnsavedChangesDialog } from './unsaved-changes-dialog';
import { Separator } from '../ui/separator';
import { format, getDaysInMonth } from 'date-fns';
import { th } from 'date-fns/locale';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from '@/lib/utils';

const NumericInput = ({ value, onChange, onBlur: rhfOnBlur, isDecimal = true, ...props }: { value: string | number | null | undefined, onChange: (val: string) => void, onBlur: (e: any) => void, isDecimal?: boolean, [key: string]: any }) => {
    const [isFocused, setIsFocused] = useState(false);

    const formatValue = (val: string | number | null | undefined) => {
        if (val === undefined || val === null || val === '' || Number.isNaN(Number(String(val).replace(/,/g, '')))) return '';
        const stringVal = String(val);
        if(stringVal.endsWith('.')) return stringVal;
        const [integer, decimal] = stringVal.split('.');
        const numberToFormat = integer === '' ? 0 : Number(integer.replace(/,/g, ''));
        if (Number.isNaN(numberToFormat)) return stringVal;
        const formattedInteger = new Intl.NumberFormat('en-US').format(numberToFormat);
        if (decimal !== undefined) return `${formattedInteger}.${decimal}`;
        return formattedInteger;
    };
    
    const displayedValue = isFocused ? String(value ?? '').replace(/,/g, '') : formatValue(value);

    return (
        <Input
            {...props}
            type="text"
            inputMode={isDecimal ? "decimal" : "numeric"}
            onFocus={() => setIsFocused(true)}
            onBlur={(e) => {
                setIsFocused(false);
                rhfOnBlur(e);
            }}
            value={displayedValue ?? ''}
            onChange={(e) => {
                let v = e.target.value.replace(/,/g, '');
                if (isDecimal) {
                    v = v.replace(/[^0-9.]/g, ''); 
                    const parts = v.split('.');
                    if (parts.length > 2) v = parts[0] + '.' + parts.slice(1).join('');
                } else {
                    v = v.replace(/[^0-9]/g, ''); 
                }
                v = v.replace(/^0+(?=\d)/, '');
                onChange(v);
            }}
        />
    );
};

function DateDropdownPicker({
  field,
  disabled,
  yearRangeType = 'past',
}: {
  field: { value?: Date | null; onChange: (date: Date | null) => void };
  disabled?: boolean;
  yearRangeType?: 'past' | 'future';
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
    const years = useMemo(() => {
        if (yearRangeType === 'future') return Array.from({ length: 10 }, (_, i) => currentYear + i);
        return Array.from({ length: 10 }, (_, i) => currentYear - i);
    }, [currentYear, yearRangeType]);

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
            if (d > maxDays) {
                d = maxDays;
                setDay(String(d));
            }
            const date = new Date(y, m, d, 12, 0, 0);
            if (!isNaN(date.getTime())) field.onChange(date);
        } else field.onChange(null);
    };

    return (
        <div className="grid grid-cols-3 gap-3">
            <Select value={day} onValueChange={(v) => handleDateChange('day', v)} disabled={disabled}>
                <FormControl><SelectTrigger className="h-11"><SelectValue placeholder="วัน" /></SelectTrigger></FormControl>
                <SelectContent>
                    {Array.from({ length: daysInMonthLimit }, (_, i) => i + 1).map((d) => (
                        <SelectItem key={d} value={d.toString()}>{d}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <Select value={month} onValueChange={(v) => handleDateChange('month', v)} disabled={disabled}>
                <FormControl><SelectTrigger className="h-11"><SelectValue placeholder="เดือน" /></SelectTrigger></FormControl>
                <SelectContent>
                    {thaiMonths.map((m) => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <Select value={year} onValueChange={(v) => handleDateChange('year', v)} disabled={disabled}>
                <FormControl><SelectTrigger className="h-11"><SelectValue placeholder="ปี (พ.ศ.)" /></SelectTrigger></FormControl>
                <SelectContent>
                    {years.map((y) => (
                        <SelectItem key={y} value={y.toString()}>{y + 543}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}

const poItemSchema = z.object({
    productVariantId: z.string(),
    productGroupId: z.string(),
    displayName: z.string(),
    sku: z.string(),
    quantity: z.coerce.number().min(1, 'ต้องมีอย่างน้อย 1'),
    cost: z.coerce.number().min(0, 'ต้นทุนต้องไม่ติดลบ'),
    quantityReceived: z.number().default(0),
});

const poFormSchema = z.object({
  supplierId: z.string().min(1, { message: 'กรุณาเลือกแหล่งจัดซื้อ' }),
  orderDate: z.date({
    required_error: 'กรุณาเลือกวันที่สั่งซื้อ',
    invalid_type_error: 'กรุณาเลือกวันที่สั่งซื้อ',
  }).nullable().refine(val => val !== null, 'กรุณาเลือกวันที่สั่งซื้อ'),
  expectedDeliveryDate: z.date().optional().nullable(),
  notes: z.string().optional(),
  items: z.array(poItemSchema).min(1, 'ต้องมีสินค้าในใบสั่งซื้ออย่างน้อย 1 รายการ'),
  subtotal: z.coerce.number().default(0),
  discountAmount: z.coerce.number().optional(),
  shippingCost: z.coerce.number().optional(),
  otherCharges: z.coerce.number().optional(),
  taxMode: z.enum(['INCLUSIVE', 'EXCLUSIVE', 'EXEMPT']).default('INCLUSIVE'),
  taxRate: z.coerce.number().optional(),
  taxAmount: z.coerce.number().optional(),
  grandTotal: z.coerce.number().default(0),
}).refine((data) => {
  if (!data.expectedDeliveryDate || !data.orderDate) return true;
  const orderDate = new Date(data.orderDate).setHours(0, 0, 0, 0);
  const expectedDate = new Date(data.expectedDeliveryDate).setHours(0, 0, 0, 0);
  return expectedDate >= orderDate;
}, {
  message: "วันที่คาดว่าจะได้รับต้องไม่ต่ำกว่าวันที่สั่งซื้อ",
  path: ["expectedDeliveryDate"],
});

type FormValues = z.infer<typeof poFormSchema>;

const defaultFormValues: Omit<FormValues, 'items'> & { items: any[] } = {
    items: [],
    orderDate: new Date(),
    expectedDeliveryDate: null,
    supplierId: '',
    notes: '',
    subtotal: 0,
    discountAmount: 0,
    shippingCost: 0,
    otherCharges: 0,
    taxMode: 'INCLUSIVE',
    taxRate: 7,
    taxAmount: 0,
    grandTotal: 0,
};

async function generateUniqueSku(firestore: Firestore, categoryC_Id: string, categoryCodes: { A: string, B: string, C: string }) {
    const categoryRef = doc(firestore, "productCategories", categoryC_Id);
    try {
      const newSequence = await runTransaction(firestore, async (transaction) => {
        const categoryDoc = await transaction.get(categoryRef);
        if (!categoryDoc.exists()) throw new Error("Category document does not exist!");
        const currentCount = categoryDoc.data().productCount || 0;
        const newCount = currentCount + 1;
        transaction.update(categoryRef, { productCount: newCount });
        return newCount;
      });
      const sequenceString = newSequence.toString().padStart(2, '0');
      return `PROD-${categoryCodes.A}${categoryCodes.B}${categoryCodes.C}${sequenceString}-01`;
    } catch (e) {
      console.error("SKU generation failed: ", e);
      throw e;
    }
}

export function PurchaseOrderForm({ initialData }: { initialData?: PurchaseOrder }) {
  const { toast } = useToast();
  const firestore = useFirestore();
  const router = useRouter();
  const isEditMode = !!initialData;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [nextPath, setNextPath] = useState<string | null>(null);
  const [isConfirmIssueOpen, setConfirmIssueOpen] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(poFormSchema),
    defaultValues: initialData ? {
        ...initialData,
        orderDate: initialData.orderDate.toDate(),
        expectedDeliveryDate: initialData.expectedDeliveryDate?.toDate() || null,
        items: initialData.items || [],
        taxMode: initialData.taxMode || 'INCLUSIVE',
        taxRate: initialData.taxRate ?? 7,
      } : defaultFormValues,
  });

  const { control, watch, setValue, getValues, formState: { isDirty, errors } } = form;

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isDirty && !isSubmitting) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    const handleAnchorClick = (event: MouseEvent) => {
      const target = event.currentTarget as HTMLAnchorElement;
      const targetUrl = new URL(target.href);
      const currentUrl = new URL(window.location.href);
      if (target.target === '_blank' || targetUrl.origin !== currentUrl.origin) return;
      if (isDirty && !isSubmitting && target.href !== window.location.href) {
        event.preventDefault();
        setNextPath(target.href);
        setShowUnsavedDialog(true);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.querySelectorAll('a').forEach(a => a.addEventListener('click', handleAnchorClick));
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.querySelectorAll('a').forEach(a => a.removeEventListener('click', handleAnchorClick));
    };
  }, [isDirty, isSubmitting]);

  useEffect(() => {
    const subscription = watch((value) => {
      const items = value.items || [];
      const subtotal = items.reduce((total, item) => {
        const quantity = Number(item?.quantity) || 0;
        const cost = Number(item?.cost) || 0;
        return total + (quantity * cost);
      }, 0);
      
      const discount = Number(value.discountAmount) || 0;
      const shipping = Number(value.shippingCost) || 0;
      const other = Number(value.otherCharges) || 0;
      const taxRate = Number(value.taxRate) || 0;
      const taxMode = value.taxMode as PurchaseOrderTaxMode;
      
      // ยอดรวมก่อนภาษี (Tax Base) คือ (ราคาสินค้า - ส่วนลด) + ค่าขนส่ง + ค่าใช้จ่ายอื่นๆ
      // ตามหลักการบัญชี ค่าขนส่งและค่าบริการอื่นถือเป็นส่วนหนึ่งของฐานภาษี
      const totalBeforeTax = Math.max(0, subtotal - discount + shipping + other);
      
      let taxAmount = 0;
      let grandTotal = 0;

      if (taxMode === 'EXEMPT') {
          taxAmount = 0;
          grandTotal = totalBeforeTax;
      } else if (taxMode === 'INCLUSIVE') {
          const denominator = (1 + (taxRate / 100));
          // ในกรณีรวม VAT: ยอดรวมที่คำนวณมา คือยอดรวมสุทธิที่ต้องจ่าย (รวม VAT แล้ว)
          // เราต้องถอด VAT ออกมาแสดง
          taxAmount = totalBeforeTax - (totalBeforeTax / denominator);
          grandTotal = totalBeforeTax;
      } else if (taxMode === 'EXCLUSIVE') {
          // ในกรณีแยก VAT: ยอดรวมที่คำนวณมาคือฐานภาษี ต้องนำมาบวก VAT เพิ่ม
          taxAmount = totalBeforeTax * (taxRate / 100);
          grandTotal = totalBeforeTax + taxAmount;
      }

      const currentValues = getValues();
      if (Math.abs(currentValues.subtotal - subtotal) > 0.01) setValue('subtotal', subtotal);
      if (Math.abs((currentValues.taxAmount || 0) - taxAmount) > 0.01) setValue('taxAmount', taxAmount);
      if (Math.abs(currentValues.grandTotal - grandTotal) > 0.01) setValue('grandTotal', grandTotal);
    });
    return () => subscription.unsubscribe();
  }, [watch, setValue, getValues]);

  const productGroupsQuery = useMemoFirebase(() => !firestore ? null : collection(firestore, 'productGroups'), [firestore]);
  const { data: productGroups, isLoading: areGroupsLoading } = useCollection<ProductGroup>(productGroupsQuery);
  const [allVariants, setAllVariants] = useState<ProductVariant[]>([]);
  const [areVariantsLoading, setAreVariantsLoading] = useState(true);

  useEffect(() => {
    if (areGroupsLoading || !productGroups || !firestore) return;
    let isMounted = true;
    const fetchAllVariants = async () => {
      setAreVariantsLoading(true);
      const variantsData: ProductVariant[] = [];
      try {
        await Promise.all(productGroups.map(async (group) => {
          const variantsRef = collection(firestore, 'productGroups', group.id, 'productVariants');
          const variantsSnapshot = await getDocs(variantsRef);
          variantsSnapshot.forEach(doc => variantsData.push({ ...doc.data(), id: doc.id } as ProductVariant));
        }));
        if (isMounted) setAllVariants(variantsData);
      } catch (error) { console.error("Error fetching variants for PO form:", error); }
      finally { if (isMounted) setAreVariantsLoading(false); }
    };
    fetchAllVariants();
    return () => { isMounted = false; };
  }, [productGroups, firestore, areGroupsLoading]);

  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  const handleProductSelect = (variant: ProductVariant) => {
    const group = productGroups?.find(g => g.id === variant.productGroupId);
    if (!group) return;
    if (fields.some(item => item.productVariantId === variant.id)) {
      toast({ variant: 'destructive', title: 'สินค้าซ้ำ', description: 'สินค้านี้อยู่ในใบสั่งซื้อแล้ว' });
      return;
    }
    const attributesString = Object.entries(variant.attributes).map(([key, value]) => `${key}: ${value}`).join(', ');
    const displayName = `${group.name}${attributesString ? ` (${attributesString})` : ''}`;
    append({
        productVariantId: variant.id,
        productGroupId: variant.productGroupId,
        displayName: displayName,
        sku: variant.sku,
        quantity: 1,
        cost: 0,
        quantityReceived: 0,
    });
  };

  const savePurchaseOrder = async (values: FormValues, status: 'DRAFT' | 'ISSUED'): Promise<boolean> => {
    if (!firestore) {
        toast({ variant: "destructive", title: "เกิดข้อผิดพลาด", description: "ไม่สามารถเชื่อมต่อฐานข้อมูลได้" });
        return false;
    }
    try {
        const poData = {
            supplierId: values.supplierId,
            status: status,
            paymentStatus: initialData?.paymentStatus || 'UNPAID',
            items: values.items,
            orderDate: values.orderDate,
            expectedDeliveryDate: values.expectedDeliveryDate || null,
            notes: values.notes || '',
            subtotal: values.subtotal || 0,
            discountAmount: values.discountAmount || 0,
            shippingCost: values.shippingCost || 0,
            otherCharges: values.otherCharges || 0,
            taxMode: values.taxMode,
            taxRate: values.taxRate || 0,
            taxAmount: values.taxAmount || 0,
            grandTotal: values.grandTotal || 0,
        };
        if (isEditMode) {
            const poRef = doc(firestore, 'purchaseOrders', initialData!.id);
            await updateDoc(poRef, { ...poData, updatedAt: serverTimestamp() });
        } else {
            const counterRef = doc(firestore, 'counters', 'poCounter');
            const poNumber = await runTransaction(firestore, async (transaction) => {
                const counterDoc = await transaction.get(counterRef);
                const newCount = (counterDoc.exists() ? counterDoc.data().count : 0) + 1;
                transaction.set(counterRef, { count: newCount }, { merge: true });
                // Use Buddhist Era Year (BE) for consistency with Branch format
                const currentYearBE = new Date().getFullYear() + 543;
                return `PO-${currentYearBE}-${String(newCount).padStart(4, '0')}`;
            });
            const newDocRef = doc(collection(firestore, 'purchaseOrders'));
            await setDoc(newDocRef, { ...poData, id: newDocRef.id, poNumber: poNumber, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        }
        toast({ title: status === 'ISSUED' ? 'ออกใบสั่งซื้อสำเร็จ' : 'บันทึกฉบับร่างแล้ว', description: `ใบสั่งซื้อได้รับการบันทึก` });
        clearGlobalCache('procurement-hub-data');
        return true;
    } catch(error: any) {
        console.error("Error saving PO:", error);
        toast({ variant: 'destructive', title: 'เกิดข้อผิดพลาด', description: error.message || 'ไม่สามารถบันทึกใบสั่งซื้อได้' });
        return false;
    }
  };

  const handleSave = async (status: 'DRAFT' | 'ISSUED') => {
    setIsSubmitting(true);
    const isValid = await form.trigger();
    if (isValid) {
      const values = form.getValues();
      const success = await savePurchaseOrder(values, status);
      if (success) {
        setTimeout(() => {
            const targetUrl = status === 'ISSUED' && isEditMode ? `/dashboard/purchase-orders/${initialData.id}` : '/dashboard/purchase-orders';
            router.push(targetUrl);
        }, 50);
      }
    }
    setIsSubmitting(false);
  };

  const onIssueConfirm = () => { setConfirmIssueOpen(false); handleSave('ISSUED'); }
  const handleSaveAndNavigate = async () => {
    setIsSubmitting(true);
    const isValid = await form.trigger();
    if (isValid) {
      const success = await savePurchaseOrder(form.getValues(), 'DRAFT'); 
      if (success && nextPath) setTimeout(() => router.push(nextPath), 50);
    }
    setIsSubmitting(false);
    setShowUnsavedDialog(false);
  };
  const handleDiscardAndNavigate = () => { if (nextPath) router.push(nextPath); setShowUnsavedDialog(false); };
  
  const currentTaxMode = watch('taxMode');

  return (
    <>
      <Form {...form}>
        <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader><CardTitle className="font-headline">รายการสินค้า</CardTitle></CardHeader>
                <CardContent>
                  <div className="rounded-lg border">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>สินค้า</TableHead>
                        <TableHead className="w-[120px]">จำนวน</TableHead>
                        <TableHead className="w-[120px]">ราคา/หน่วย</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {fields.map((item, index) => (
                          <TableRow key={item.id}>
                            <TableCell>{item.displayName}<p className="text-xs text-muted-foreground">{item.sku}</p></TableCell>
                            <TableCell><FormField control={control} name={`items.${index}.quantity`} render={({ field }) => <FormItem><FormControl><NumericInput isDecimal={false} {...field} /></FormControl><FormMessage /></FormItem>} /></TableCell>
                            <TableCell><FormField control={control} name={`items.${index}.cost`} render={({ field }) => <FormItem><FormControl><NumericInput {...field} /></FormControl><FormMessage /></FormItem>} /></TableCell>
                            <TableCell><Button variant="ghost" size="icon" onClick={() => remove(index)}><Trash2 className="h-4 w-4 text-destructive"/></Button></TableCell>
                          </TableRow>
                        ))}
                         {fields.length === 0 && (
                            <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground h-24">ไม่พบรายการสินค้า</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  <Button type="button" variant="outline" className="mt-4" onClick={() => setIsSearchOpen(true)} disabled={areVariantsLoading}><PlusCircle className="mr-2 h-4 w-4" />เพิ่มสินค้า</Button>
                  {errors.items?.root && <FormMessage className="mt-2">{errors.items.root.message}</FormMessage>}
                  
                  <Separator className="my-8" />
                  
                  <div className="space-y-6">
                    <div className="flex items-center gap-2 text-primary font-bold">
                        <Percent className="h-5 w-5" /> การตั้งค่าภาษี (VAT)
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 rounded-xl border bg-muted/20">
                        <FormField name="taxMode" control={control} render={({ field }) => (
                            <FormItem>
                                <FormLabel>รูปแบบภาษี</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl><SelectTrigger className="h-11 bg-white dark:bg-background"><SelectValue /></SelectTrigger></FormControl>
                                    <SelectContent>
                                        <SelectItem value="INCLUSIVE">ราคารวม VAT แล้ว (Inclusive)</SelectItem>
                                        <SelectItem value="EXCLUSIVE">ราคาแยก VAT (Exclusive)</SelectItem>
                                        <SelectItem value="EXEMPT">ไม่มี VAT / ยกเว้นภาษี (Exempt)</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormDescription className="text-[10px]">
                                    {field.value === 'INCLUSIVE' && 'VAT จะถูกถอดออกจากราคาสินค้าและบริการเพื่อแสดงยอดแยก'}
                                    {field.value === 'EXCLUSIVE' && 'VAT จะถูกคำนวณเพิ่มจากยอดรวมสุทธิ'}
                                    {field.value === 'EXEMPT' && 'จะไม่มีการคำนวณภาษีในใบสั่งซื้อนี้'}
                                </FormDescription>
                            </FormItem>
                        )} />
                        
                        <FormField name="taxRate" control={control} render={({ field }) => (
                            <FormItem>
                                <FormLabel className={cn(currentTaxMode === 'EXEMPT' && "opacity-50")}>อัตราภาษี (%)</FormLabel>
                                <FormControl>
                                    <div className="relative">
                                        <NumericInput 
                                            {...field} 
                                            className="h-11 pr-10 bg-white dark:bg-background" 
                                            disabled={currentTaxMode === 'EXEMPT'} 
                                        />
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-bold">%</div>
                                    </div>
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />
                    </div>
                  </div>

                  <Separator className="my-8" />

                  <div className="flex justify-end">
                      <div className="w-full max-w-sm space-y-4">
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground flex items-center gap-1.5"><ReceiptText className="h-3.5 w-3.5" /> ยอดรวมสินค้า</span>
                            <span className="font-medium">฿{(watch('subtotal') || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <FormField control={control} name="discountAmount" render={({ field }) => <FormItem className="flex justify-between items-center"><FormLabel className="text-muted-foreground text-sm">ส่วนลด</FormLabel><FormControl><NumericInput className="w-32 text-right h-9" placeholder="0.00" {...field} /></FormControl></FormItem>} />
                        <FormField control={control} name="shippingCost" render={({ field }) => <FormItem className="flex justify-between items-center"><FormLabel className="text-muted-foreground text-sm">ค่าจัดส่ง</FormLabel><FormControl><NumericInput className="w-32 text-right h-9" placeholder="0.00" {...field} /></FormControl></FormItem>} />
                        <FormField control={control} name="otherCharges" render={({ field }) => <FormItem className="flex justify-between items-center"><FormLabel className="text-muted-foreground text-sm">ค่าใช้จ่ายอื่น ๆ</FormLabel><FormControl><NumericInput className="w-32 text-right h-9" placeholder="0.00" {...field} /></FormControl></FormItem>} />
                        
                        <div className="flex justify-between items-center border-t border-dashed pt-2">
                          <span className="text-muted-foreground text-sm">
                              ภาษีมูลค่าเพิ่ม {currentTaxMode === 'EXEMPT' ? '(ยกเว้น)' : `(${watch('taxRate')}%)`}
                          </span>
                          <span className="font-medium text-sm">
                              ฿{(watch('taxAmount') || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>

                        <Separator className="my-2" />
                        <div className="flex justify-between font-bold text-xl text-primary">
                            <span>ยอดรวมสุทธิ</span>
                            <span>฿{(watch('grandTotal') || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        {watch('items').some(item => item.quantity > 1) && (
                            <p className="text-[10px] text-right text-muted-foreground italic">แจกแจงต้นทุนต่อหน่วยแสดงผลเฉพาะรายการที่มีมากกว่า 1 ชิ้น</p>
                        )}
                      </div>
                  </div>
                </CardContent>
              </Card>
            </div>
            <div className="lg:col-span-1 space-y-6">
              <Card>
                <CardHeader><CardTitle className="font-headline">ข้อมูลใบสั่งซื้อ</CardTitle></CardHeader>
                <CardContent className="space-y-6">
                  <FormField control={control} name="supplierId" render={({ field }) => <FormItem><FormLabel>แหล่งจัดซื้อ <span className="text-destructive">*</span></FormLabel><SupplierCombobox field={field} /><FormMessage /></FormItem>} />
                  <FormField control={control} name="orderDate" render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>วันที่สั่งซื้อ *</FormLabel><DateDropdownPicker field={field} /><FormMessage /></FormItem>)} />
                  <FormField control={control} name="expectedDeliveryDate" render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>วันที่คาดว่าจะได้รับ</FormLabel><DateDropdownPicker field={field} yearRangeType="future" /><FormMessage /></FormItem>)} />
                  <FormField control={control} name="notes" render={({ field }) => <FormItem><FormLabel>หมายเหตุ</FormLabel><FormControl><Textarea rows={4} {...field} /></FormControl><FormMessage /></FormItem>} />
                </CardContent>
              </Card>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-6">
              <Button type="button" variant="outline" onClick={() => handleSave('DRAFT')} disabled={isSubmitting} className="h-11 px-6">
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  บันทึกฉบับร่าง
              </Button>
              <Button type="button" onClick={() => setConfirmIssueOpen(true)} disabled={isSubmitting} className="h-11 px-8 font-bold">
                  <Send className="mr-2 h-4 w-4" />
                  ยืนยันและออกใบสั่งซื้อ
              </Button>
          </div>
        </form>
      </Form>
      <ProductSearchDialog isOpen={isSearchOpen} onOpenChange={setIsSearchOpen} onProductSelect={handleProductSelect} productGroups={productGroups || []} allVariants={allVariants} existingVariantIds={fields.map(item => item.productVariantId)} />
      <UnsavedChangesDialog isOpen={showUnsavedDialog} onOpenChange={setShowUnsavedDialog} onSaveAndExit={handleSaveAndNavigate} onDiscardAndExit={handleDiscardAndNavigate} isSaving={isSubmitting} />
      <AlertDialog open={isConfirmIssueOpen} onOpenChange={setConfirmIssueOpen}>
        <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>ยืนยันการออกใบสั่งซื้อ?</AlertDialogTitle><AlertDialogDescription>เมื่อออกใบสั่งซื้อแล้ว เอกสารนี้จะถูกล็อคและไม่สามารถแก้ไขได้อีก คุณจะต้องยกเลิกและสร้างใหม่หากต้องการเปลี่ยนแปลง</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>ยกเลิก</AlertDialogCancel><AlertDialogAction onClick={onIssueConfirm} disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}ยืนยัน</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
