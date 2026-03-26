'use client';

import { useForm, useFieldArray, Controller, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect, useRef, ChangeEvent, RefObject, useMemo } from 'react';
import { Info, Loader2, PlusCircle, Trash2, X, ImagePlus, Truck, Package as PackageIcon, RotateCw, Archive, Percent, Pencil } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { collection, serverTimestamp, writeBatch, doc, updateDoc, getDocs, query, where, limit, addDoc, collectionGroup, orderBy, runTransaction, Firestore } from 'firebase/firestore';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { useRouter } from 'next/navigation';
import { RadioGroup, RadioGroupItem } from '../ui/group-radio';
import { Switch } from '@/components/ui/switch';
import { UnitCombobox } from './unit-combobox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Label } from '../ui/label';
import { cn } from '@/lib/utils';
import { Separator } from '../ui/separator';
import { Checkbox } from '../ui/checkbox';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ProductGroup, ProductVariant, PriceTier, InventoryLot, ProductCategory, StoreSettings } from '@/lib/types';
import { CustomDialog } from './custom-dialog';
import { UnsavedChangesDialog } from './unsaved-changes-dialog';
import { getProductCategories } from '@/app/actions';
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
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Badge } from '@/components/ui/badge';
import { clearGlobalCache } from '@/hooks/use-smart-fetch';

const stringToOptionalNumber = () => z.preprocess(
    (val) => {
        if (val === '' || val === null || val === undefined) return null;
        const num = parseFloat(String(val).replace(/,/g, ''));
        return isNaN(num) ? val : num;
    },
    z.number({
        invalid_type_error: "ต้องเป็นตัวเลข"
    }).nullable().optional()
);

const stringToRequiredNumber = (requiredMessage: string, minMessage: string) => z.preprocess(
    (val) => {
        if (val === '' || val === null || val === undefined) return undefined;
        const num = parseFloat(String(val).replace(/,/g, ''));
        return isNaN(num) ? val : num;
    },
    z.number({
        required_error: requiredMessage,
        invalid_type_error: requiredMessage,
    }).min(0, { message: minMessage })
);

const priceTierSchema = z.object({
  minQuantity: stringToOptionalNumber().refine(val => val === null || Number.isInteger(val), { message: "ต้องเป็นจำนวนเต็ม" }).optional(),
  price: stringToOptionalNumber().optional(),
});

const inventoryLotSchema = z.object({
  lotId: z.string(),
  quantity: z.coerce.number().int("ต้องเป็นจำนวนเต็ม").min(0, "ต้องเป็น 0 หรือมากกว่า"),
  cost: z.coerce.number().min(0, "ต้องเป็น 0 หรือมากกว่า"),
  receivedAt: z.any(),
  supplierId: z.string().optional(),
});

const variantSchema = z.object({
  id: z.string().optional(),
  attributes: z.record(z.string()).optional(),
  price: stringToRequiredNumber("กรุณากรอกราคา", "ราคาต้องเป็น 0 หรือมากกว่า"),
  priceTiers: z.array(priceTierSchema).optional(),
  compareAtPrice: stringToOptionalNumber().refine(val => val === null || val >= 0, { message: "ราคาต้องเป็น 0 หรือมากกว่า"}),
  sku: z.string().optional(),
  inventoryLots: z.array(inventoryLotSchema).optional(),
  weight: stringToRequiredNumber("กรุณากรอกน้ำหนัก", "น้ำหนักต้องเป็น 0 หรือมากกว่า"),
  barcode: z.string().optional(),
  lowStockThreshold: stringToOptionalNumber().refine(val => val === null || (Number.isInteger(val) && val >=0), { message: 'ต้องเป็นจำนวนเต็มบวก' }),
  fixedShippingCost: stringToOptionalNumber().refine(val => val === null || val >= 0, { message: "ค่าจัดส่งต้องเป็น 0 หรือมากกว่า"}),
  lalamoveCapacityUnit: stringToOptionalNumber().refine(val => val === null || val >= 0, { message: "หน่วยความจุต้องเป็น 0 หรือมากกว่า"}),
  imageUrls: z.array(z.string()).optional(),
  trackInventory: z.boolean().default(true),
  requiresShipping: z.boolean().default(true),
  status: z.enum(['active', 'archived']).default('active'),
  taxStatus: z.enum(['TAXABLE', 'EXEMPT']).default('TAXABLE'),
  taxMode: z.enum(['INCLUSIVE', 'EXCLUSIVE']).default('INCLUSIVE'),
  taxRate: z.coerce.number().min(0).default(7),
}).superRefine((variant, ctx) => {
  if (variant.compareAtPrice !== null && variant.compareAtPrice !== undefined && variant.price !== null && variant.compareAtPrice <= variant.price) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "ต้องมากกว่าราคาขายจริง",
      path: ['compareAtPrice'],
    });
  }

  if (!variant.priceTiers || variant.priceTiers.length === 0) return;

  const tiersWithOriginalIndex = variant.priceTiers.map((tier, index) => ({ ...tier, originalIndex: index }));
  const quantities = new Map<number, number[]>();
  quantities.forEach(tier => {
    if (tier.minQuantity != null) {
      if (!quantities.has(tier.minQuantity)) {
        quantities.set(tier.minQuantity, []);
      }
      quantities.get(tier.minQuantity)!.push(tier.originalIndex);
    }
  });

  for (const [quantity, indices] of quantities.entries()) {
    if (indices.length > 1) {
      indices.forEach(index => {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "จำนวนขั้นต่ำซ้ำกัน",
          path: [`priceTiers`, index, `minQuantity`],
        });
      });
    }
  }

  for (let i = 1; i < tiersWithOriginalIndex.length; i++) {
    const prev = tiersWithOriginalIndex[i - 1];
    const curr = tiersWithOriginalIndex[i];
    if (prev.minQuantity != null && curr.minQuantity != null && curr.minQuantity <= prev.minQuantity) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ต้องมากกว่าขั้นก่อนหน้า',
        path: [`priceTiers`, curr.originalIndex, 'minQuantity'],
      });
    }
  }

  const sortedTiers = tiersWithOriginalIndex
    .filter(t => t.minQuantity != null && t.price != null)
    .sort((a, b) => a.minQuantity! - b.minQuantity!);

  if (sortedTiers.length > 0) {
    const firstTier = sortedTiers[0];
    if (firstTier.price! >= variant.price) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ต้องต่ำกว่าราคาปกติ",
        path: [`priceTiers`, firstTier.originalIndex, `price`],
      });
    }
    if (firstTier.minQuantity! < 2) {
         ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "ต้องเป็น 2 หรือมากกว่า",
            path: [`priceTiers`, firstTier.originalIndex, `minQuantity`],
        });
    }
  }

  if (sortedTiers.length > 1) {
    for (let i = 1; i < sortedTiers.length; i++) {
      const previousTier = sortedTiers[i - 1];
      const currentTier = sortedTiers[i];
      if (currentTier.price! >= previousTier.price!) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "ต้องต่ำกว่าขั้นก่อนหน้า",
          path: [`priceTiers`, currentTier.originalIndex, `price`],
        });
      }
    }
  }
});

const baseProductSchema = z.object({
  name: z.string().min(1, { message: 'กรุณากรอกชื่อสินค้า' }),
  description: z.string().optional(),
  unit: z.string().min(1, { message: 'กรุณาเลือกหรือสร้างหน่วยนับ' }),
  categoryA: z.string().min(1, { message: 'กรุณาเลือกหมวดหมู่หลัก' }),
  categoryB: z.string().min(1, { message: 'กรุณาเลือกหมวดหมู่ย่อย' }),
  categoryC: z.string().min(1, { message: 'กรุณาเลือกประเภท' }),
  brand: z.string().optional(),
  status: z.enum(['active', 'draft', 'archived'], { required_error: "กรุณาเลือกสถานะ", invalid_type_error: "กรุณาเลือกสถานะ" }),
  customFields: z.array(z.object({
    key: z.string().min(1, 'กรุณากรอกชื่อคุณสมบัติ'),
    value: z.string().min(1, 'กรุณากรอกค่า'),
  })).optional(),
});

const productWithVariantsSchema = baseProductSchema.extend({
  hasVariants: z.literal(true),
  options: z.array(z.object({
    name: z.string().min(1, "กรุณากรอกชื่อคุณสมบัติ"),
    values: z.string().min(1, "กรุณากรอกค่าของคุณสมบัติ"),
  })).min(1, "กรุณากำหนดคุณสมบัติสินค้าอย่างน้อย 1 อย่าง"),
  multiVariants: z.array(variantSchema).min(1, "กรุณาสร้างตัวเลือกสินค้าอย่างน้อย 1 รายการ"),
  singleVariant: z.any().optional(),
});

const productWithoutVariantsSchema = baseProductSchema.extend({
  hasVariants: z.literal(false),
  singleVariant: variantSchema,
  multiVariants: z.any().optional(),
  options: z.any().optional(),
});

const formSchema = z.discriminatedUnion("hasVariants", [
  productWithVariantsSchema,
  productWithoutVariantsSchema,
]);

type FormValues = z.infer<typeof formSchema>;

const getCombinations = (options: {name: string, values: string[]}[]) => {
  if (options.length === 0) return [];
  const combinations: Record<string, string>[] = [];
  const recurse = (index: number, currentCombination: Record<string, string>) => {
    if (index === options.length) {
      combinations.push(currentCombination);
      return;
    }
    const currentOption = options[index];
    for (const value of currentOption.values) {
      const newCombination = { ...currentCombination, [currentOption.name]: value };
      recurse(index + 1, newCombination);
    }
  };
  recurse(0, {});
  return combinations;
};

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

const DEFAULT_FORM_VARIANT = {
    price: undefined,
    priceTiers: [],
    compareAtPrice: null,
    inventoryLots: [],
    sku: '',
    weight: undefined,
    barcode: '',
    lowStockThreshold: null,
    fixedShippingCost: null,
    lalamoveCapacityUnit: null,
    attributes: {},
    imageUrls: [],
    trackInventory: true,
    requiresShipping: true,
    status: 'active',
    taxStatus: 'TAXABLE',
    taxMode: 'INCLUSIVE',
    taxRate: 7,
};

const defaultFormValues: Partial<FormValues> = {
  name: '',
  description: '',
  unit: '',
  categoryA: '',
  categoryB: '',
  categoryC: '',
  brand: '',
  status: 'active',
  customFields: [],
  hasVariants: false,
  singleVariant: DEFAULT_FORM_VARIANT as any,
  multiVariants: [],
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

const getStatusText = (status: ProductGroup['status']) => {
  switch (status) {
    case 'active': return 'เผยแพร่';
    case 'draft': return 'ฉบับร่าง';
    case 'archived': return 'อยู่ในถังขยะ';
    default: return 'ไม่ระบุ';
  }
}

const getStatusVariant = (status: ProductGroup['status']): "success" | "outline" | "destructive" | "default" => {
  switch (status) {
    case 'active': return 'success';
    case 'draft': return 'outline';
    case 'archived': return 'destructive';
    default: return 'default';
  }
}

const SingleVariantFields = ({ form, readOnly }: { form: any, readOnly?: boolean }) => {
    const { control, getValues, setValue } = form;
    const trackInventory = useWatch({ control, name: 'singleVariant.trackInventory' });
    const requiresShipping = useWatch({ control, name: 'singleVariant.requiresShipping' });
    const inventoryLots = useWatch({ control, name: 'singleVariant.inventoryLots' }) || [];
    const totalStock = inventoryLots.reduce((sum: number, lot: InventoryLot) => sum + (lot.quantity || 0), 0);
    const taxStatus = useWatch({ control, name: 'singleVariant.taxStatus' });

    return (
        <div className="space-y-6">
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b pb-2">
                <h3 className="text-base font-bold flex items-center gap-2 text-primary">
                    <Percent className="h-5 w-5" /> การตั้งค่าภาษี (VAT)
                </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                <FormField name="singleVariant.taxStatus" control={control} render={({ field }) => (
                    <FormItem>
                        <FormLabel>สถานะภาษี <span className="text-destructive">*</span></FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={readOnly}>
                            <FormControl><SelectTrigger><SelectValue placeholder="เลือกสถานะภาษี" /></SelectTrigger></FormControl>
                            <SelectContent>
                                <SelectItem value="TAXABLE">เสียภาษี (Taxable)</SelectItem>
                                <SelectItem value="EXEMPT">ยกเว้นภาษี (Exempt)</SelectItem>
                            </SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                )} />
                <FormField name="singleVariant.taxMode" control={control} render={({ field }) => (
                    <FormItem>
                        <FormLabel className={cn((taxStatus === 'EXEMPT' || readOnly) && "opacity-50")}>รูปแบบการคิดภาษี</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={taxStatus === 'EXEMPT' || readOnly}>
                            <FormControl><SelectTrigger><SelectValue placeholder="เลือกรูปแบบ" /></SelectTrigger></FormControl>
                            <SelectContent>
                                <SelectItem value="INCLUSIVE">รวมภาษีแล้ว (Inclusive)</SelectItem>
                                <SelectItem value="EXCLUSIVE">ยังไม่รวมภาษี (Exclusive)</SelectItem>
                            </SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                )} />
                <FormField name="singleVariant.taxRate" control={control} render={({ field }) => (
                    <FormItem>
                        <FormLabel className={cn((taxStatus === 'EXEMPT' || readOnly) && "opacity-50")}>อัตราภาษี (%)</FormLabel>
                        <FormControl><NumericInput {...field} disabled={taxStatus === 'EXEMPT' || readOnly} /></FormControl>
                        <FormMessage />
                    </FormItem>
                )} />
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="text-base font-medium mb-4">ราคา</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 items-start">
              <FormField name="singleVariant.price" control={control} render={({ field }) => (<FormItem data-form-field-name="singleVariant.price">
                  <FormLabel className="flex items-center gap-1"><span>ราคาขาย</span><span className="text-destructive">*</span></FormLabel>
                  <FormControl><NumericInput {...field} disabled={readOnly} /></FormControl><FormMessage/></FormItem>)} />
              <FormField name="singleVariant.compareAtPrice" control={control} render={({ field }) => (<FormItem data-form-field-name="singleVariant.compareAtPrice">
                  <FormLabel className="flex items-center gap-1"><span>ราคาเดิมก่อนลด</span><TooltipProvider><Tooltip><TooltipTrigger asChild><button type="button" className="cursor-help ml-1"><Info className="h-4 w-4 text-muted-foreground" /></button></TooltipTrigger><TooltipContent><p className="max-w-sm">แสดงว่าสินค้าลดราคาอยู่</p></TooltipContent></Tooltip></TooltipProvider></FormLabel>
                  <FormControl><NumericInput {...field} value={field.value ?? null} disabled={readOnly} /></FormControl><FormMessage/></FormItem>)} />
            </div>
            
            <div className="mt-6">
                <div className="space-y-4 rounded-lg border p-4" data-form-field-name="singleVariant.priceTiers">
                    <h4 className="font-medium">ราคาขั้นบันได</h4>
                    <Controller
                        control={control}
                        name="singleVariant.priceTiers"
                        render={() => {
                            const { fields, append, remove } = useFieldArray({ control, name: `singleVariant.priceTiers` });
                            return (
                                <>
                                    {fields.map((tier, index) => (
                                    <div key={tier.id} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 items-start">
                                        <FormField name={`singleVariant.priceTiers.${index}.minQuantity`} control={control} render={({ field }) => (
                                            <FormItem><FormLabel>จำนวนขั้นต่ำ <span className="text-destructive">*</span></FormLabel><FormControl><NumericInput {...field} isDecimal={false} placeholder="จำนวน" value={field.value ?? null} disabled={readOnly} /></FormControl><FormMessage className="text-xs"/></FormItem>
                                        )} />
                                        <FormField name={`singleVariant.priceTiers.${index}.price`} control={control} render={({ field }) => (
                                            <FormItem><FormLabel>ราคาต่อหน่วย <span className="text-destructive">*</span></FormLabel><FormControl><NumericInput {...field} placeholder="ราคา" value={field.value ?? null} disabled={readOnly} /></FormControl><FormMessage className="text-xs"/></FormItem>
                                        )} />
                                        {!readOnly && <Button type="button" variant="ghost" size="icon" className="self-end mb-2" onClick={() => remove(index)}><Trash2 className="h-4 w-4" /></Button>}
                                    </div>
                                    ))}
                                    {!readOnly && (
                                        <Button type="button" variant="outline" size="sm" onClick={() => append({ minQuantity: undefined, price: undefined })}>
                                            <PlusCircle className="mr-2 h-4 w-4" /> เพิ่มขั้นราคา
                                        </Button>
                                    )}
                                </>
                            );
                        }}
                    />
                </div>
            </div>
        </div>
        <Separator />
        <div>
            <h3 className="text-base font-medium mb-4">คลังสินค้า</h3>
            <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 items-start">
                    <FormField name="singleVariant.sku" control={control} render={({ field }) => (
                        <FormItem><FormLabel>รหัสสินค้า (SKU)</FormLabel><FormControl><Input {...field} readOnly placeholder="สร้างอัตโนมัติเมื่อบันทึก" /></FormControl><FormMessage/></FormItem>
                    )} />
                    <FormField name="singleVariant.barcode" control={control} render={({ field }) => (
                        <FormItem><FormLabel>บาร์โค้ด</FormLabel><FormControl><Input {...field} disabled={readOnly} /></FormControl><FormMessage/></FormItem>
                    )} />
                </div>
                <FormField control={control} name="singleVariant.trackInventory" render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-lg border p-4"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={readOnly} /></FormControl><div className="space-y-1 leading-none"><FormLabel>ติดตามสต็อก</FormLabel><FormDescription>นับและอัปเดตจำนวนสินค้าคงคลังเมื่อมีการซื้อขาย</FormDescription></div></FormItem>
                )}/>
                {trackInventory && (
                    <div className="pl-4 border-l-2 ml-4 space-y-6">
                         <div className="space-y-2"><Label>จำนวนสต็อกทั้งหมด</Label><Input readOnly disabled value={`${totalStock.toLocaleString()} ชิ้น`} /><FormDescription>จัดการสต็อกได้ที่หน้ารายการสินค้าหลัก</FormDescription></div>
                        <FormField name="singleVariant.lowStockThreshold" control={control} render={({ field }) => (
                            <FormItem><FormLabel>เกณฑ์แจ้งเตือนสต็อกต่ำ</FormLabel><FormControl><NumericInput {...field} isDecimal={false} value={field.value ?? null} disabled={readOnly} /></FormControl><FormMessage/></FormItem>
                        )} />
                    </div>
                )}
            </div>
        </div>
        <Separator />
        <div>
            <h3 className="text-base font-medium mb-4">การจัดส่ง</h3>
            <div className="space-y-6">
                <FormField control={control} name="singleVariant.requiresShipping" render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-lg border p-4"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={readOnly} /></FormControl><div className="space-y-1 leading-none"><FormLabel>สินค้านี้ต้องมีการจัดส่ง</FormLabel><FormDescription>เลือกหากนี่คือสินค้าที่ต้องส่งพัสดุ</FormDescription></div></FormItem>
                )}/>
                {requiresShipping && (
                    <div className="pl-4 border-l-2 ml-4 space-y-6">
                        <FormField name="singleVariant.weight" control={control} render={({ field }) => (<FormItem><FormLabel>น้ำหนัก (kg) <span className="text-destructive">*</span></FormLabel><FormControl><NumericInput {...field} disabled={readOnly} /></FormControl><FormMessage/></FormItem>)} />
                        <FormField name="singleVariant.fixedShippingCost" control={control} render={({ field }) => (<FormItem><FormLabel>ค่าจัดส่งคงที่ (ถ้ามี)</FormLabel><FormControl><NumericInput {...field} disabled={readOnly} /></FormControl><FormMessage/></FormItem>)} />
                        <FormField name="singleVariant.lalamoveCapacityUnit" control={control} render={({ field }) => (<FormItem><FormLabel>หน่วยความจุ Lalamove</FormLabel><FormControl><NumericInput {...field} disabled={readOnly} /></FormControl><FormMessage/></FormItem>)} />
                    </div>
                )}
            </div>
        </div>
        </div>
    );
};

const MultiVariantFields = ({ form, isEditMode, onVariantAction, defaultTaxRate, readOnly }: { form: any, isEditMode: boolean, onVariantAction: (index: number, action: 'archive' | 'restore') => void, defaultTaxRate: number, readOnly?: boolean }) => {
    const { control, getValues, setValue } = form;
    const { fields: optionFields, append: appendOption, remove: removeOption } = useFieldArray({ control, name: "options" });
    const { fields: variantFields, replace: replaceVariants } = useFieldArray({ control, name: "multiVariants" });
    const [showArchived, setShowArchived] = useState(false);
    const { toast } = useToast();

    const categoryA = useWatch({ control, name: 'categoryA' });
    const categoryB = useWatch({ control, name: 'categoryB' });
    const categoryC = useWatch({ control, name: 'categoryC' });

    const generateVariants = () => {
        if (readOnly) return;
        const optionsWithValues = getValues('options')
          .map((opt: { name: string, values: string }) => ({
            name: opt.name.trim(),
            values: opt.values.split(',').map(v => v.trim()).filter(v => v),
          }))
          .filter((opt: { name: string, values: string[]}) => opt.name && opt.values.length > 0);
    
        if (optionsWithValues.length === 0) {
            toast({ variant: 'destructive', title: 'ไม่มีคุณสมบัติ', description: 'กรุณากำหนดคุณสมบัติและค่าของคุณสมบัติก่อน' });
            return;
        }
        if (!categoryA || !categoryB || !categoryC) {
            toast({ variant: 'destructive', title: 'กรุณาเลือกหมวดหมู่', description: 'โปรดเลือกหมวดหมู่สินค้าให้ครบถ้วนก่อน' });
            return;
        }
        const combinations = getCombinations(optionsWithValues);
        const existingVariants = getValues('multiVariants') || [];
        const newVariants = combinations.map((attrs) => {
            const existing = existingVariants.find((v: ProductVariant) => JSON.stringify(v.attributes) === JSON.stringify(attrs));
            if (existing) return { ...existing, sku: existing.sku || 'สร้างอัตโนมัติ', status: existing.status || 'active' };
            return { ...DEFAULT_FORM_VARIANT, attributes: attrs, sku: 'สร้างอัตโนมัติ', taxRate: defaultTaxRate };
        });
        replaceVariants(newVariants);
    };

    const handleFileChange = (event: ChangeEvent<HTMLInputElement>, index: number) => {
        if (readOnly) return;
        const files = event.target.files;
        if (files) {
          Array.from(files).forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => { 
              if(e.target?.result) { 
                const currentImages = getValues(`multiVariants.${index}.imageUrls`) || [];
                setValue(`multiVariants.${index}.imageUrls`, [...currentImages, e.target.result as string], { shouldValidate: true, shouldDirty: true }); 
              } 
            };
            reader.readAsDataURL(file);
          });
        }
    };
    
    const handleRemoveImage = (vIndex: number, iIndex: number) => {
        if (readOnly) return;
        const current = getValues(`multiVariants.${vIndex}.imageUrls`) || [];
        setValue(`multiVariants.${vIndex}.imageUrls`, current.filter((_, i) => i !== iIndex), { shouldValidate: true, shouldDirty: true });
    };

    const activeVariantsCount = variantFields.filter(v => v.status !== 'archived').length;
    const archivedVariantsCount = variantFields.length - activeVariantsCount;
    
    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-base font-medium mb-4 flex items-center gap-2"><span>คุณสมบัติสินค้า</span><TooltipProvider><Tooltip><TooltipTrigger asChild><button type="button" className="cursor-help"><Info className="h-4 w-4 text-muted-foreground" /></button></TooltipTrigger><TooltipContent><p className="max-w-sm">กำหนดคุณสมบัติ (เช่น สี, ขนาด) เพื่อสร้างตัวเลือกสินค้า</p></TooltipContent></Tooltip></TooltipProvider></h3>
                <div className="space-y-4">
                {optionFields.map((field, index) => (
                    <div key={field.id} className="grid grid-cols-1 md:grid-cols-[1fr_2fr_auto] gap-2 items-start">
                    <FormField name={`options.${index}.name`} control={control} render={({ field }) => (<FormItem><FormLabel>ชื่อคุณสมบัติ <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="เช่น สี" {...field} disabled={readOnly} /></FormControl><FormMessage /></FormItem>)}/>
                    <FormField name={`options.${index}.values`} control={control} render={({ field }) => (<FormItem><FormLabel>ค่าของคุณสมบัติ <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="ดำ, ขาว (คั่นด้วยจุลภาค)" {...field} disabled={readOnly} /></FormControl><FormMessage /></FormItem>)}/>
                    {!readOnly && <Button type="button" variant="ghost" size="icon" className="mt-8" onClick={() => removeOption(index)}><Trash2 className="h-4 w-4" /></Button>}
                    </div>
                ))}
                </div>
                {!readOnly && (
                    <div className="flex justify-between items-center mt-4">
                        <Button type="button" variant="outline" onClick={() => appendOption({ name: '', values: '' })}>เพิ่มคุณสมบัติ</Button>
                        <Button type="button" onClick={generateVariants}>สร้างตัวเลือกสินค้า</Button>
                    </div>
                )}
            </div>
            {variantFields.length > 0 && (
                <div className="pt-4">
                    <Separator />
                     <div className="flex justify-between items-center my-4">
                        <div><h3 className="text-base font-medium">รายการตัวเลือก ({activeVariantsCount})</h3><CardDescription>เลื่อนตารางไปทางขวาเพื่อกรอกข้อมูลเพิ่มเติม</CardDescription></div>
                        {archivedVariantsCount > 0 && <Button type="button" variant="link" onClick={() => setShowArchived(!showArchived)}>{showArchived ? 'ซ่อน' : 'แสดง'}ตัวเลือกที่ถูกจัดเก็บ ({archivedVariantsCount})</Button>}
                    </div>
                    <div className="relative w-full overflow-x-auto border rounded-lg">
                    <Table>
                        <TableHeader><TableRow>
                                {Object.keys(variantFields[0].attributes || {}).map(key => <TableHead key={key}>{key}</TableHead>)}
                                <TableHead className="min-w-[120px]">รูปภาพ</TableHead>
                                <TableHead className="min-w-[180px]">ราคา <span className="text-destructive">*</span></TableHead>
                                <TableHead className="min-w-[120px]">รหัสสินค้า (SKU)</TableHead>
                                <TableHead className="min-w-[120px]">บาร์โค้ด</TableHead>
                                <TableHead className="min-w-[100px]">สต็อก</TableHead>
                                <TableHead className="min-w-[100px]">สต็อกต่ำ</TableHead>
                                <TableHead className="min-w-[100px]">น้ำหนัก (kg) *</TableHead>
                                <TableHead className="min-w-[150px]">การตั้งค่าภาษี</TableHead>
                                <TableHead className="text-center w-12"><Truck className="h-5 w-5 mx-auto" /></TableHead>
                                <TableHead className="text-center w-12"><PackageIcon className="h-5 w-5 mx-auto" /></TableHead>
                                <TableHead className="w-[50px]"></TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                            {variantFields.map((field, index) => {
                                if (!showArchived && field.status === 'archived') return null;
                                return <VariantRow key={field.id} control={control} index={index} form={form} handleFileChange={handleFileChange} handleRemoveImage={handleRemoveImage} onAction={onVariantAction} readOnly={readOnly} />;
                            })}
                        </TableBody>
                    </Table>
                </div>
                </div>
            )}
        </div>
    );
};

const VariantRow = ({ control, index, form, handleFileChange, handleRemoveImage, onAction, readOnly }: any) => {
    const variantStatus = useWatch({ control, name: `multiVariants.${index}.status` });
    const taxStatus = useWatch({ control, name: `multiVariants.${index}.taxStatus` });
    const trackInventory = useWatch({ control, name: `multiVariants.${index}.trackInventory` });
    const requiresShipping = useWatch({ control, name: `multiVariants.${index}.requiresShipping` });
    const inventoryLots = useWatch({ control, name: `multiVariants.${index}.inventoryLots` }) || [];
    const totalStock = inventoryLots.reduce((sum: number, lot: InventoryLot) => sum + (lot.quantity || 0), 0);
    const variantAttributes = Object.keys(form.getValues('multiVariants')[0]?.attributes || {});
    const fieldValues = form.getValues(`multiVariants.${index}`);
    const isArchived = variantStatus === 'archived';
    
    return (
      <TableRow className={cn("align-top", isArchived && "bg-slate-50 text-muted-foreground")}>
        {variantAttributes.map(key => (<TableCell key={key} className="align-top font-medium p-2">{(fieldValues.attributes || {})[key]}{isArchived && <Badge variant="outline" className="ml-2">ถูกจัดเก็บ</Badge>}</TableCell>))}
        <TableCell className="align-top p-2">
          <FormField name={`multiVariants.${index}.imageUrls`} control={control} render={({ field: imageField }) => (
              <FormItem><div className="flex flex-col gap-2"><div className="flex flex-wrap gap-2">{(imageField.value || []).map((url: string, imgIndex: number) => (<div key={imgIndex} className="relative w-16 h-16"><img src={url} className="w-full h-full object-cover rounded-md border" />{!readOnly && <Button type="button" variant="destructive" size="icon" className="absolute -top-2 -right-2 h-6 w-6" onClick={() => handleRemoveImage(index, imgIndex)}><X className="h-3 w-3" /></Button>}</div>))}</div><FormControl><div><Input id={`v-img-${index}`} type="file" accept="image/*" className="sr-only" multiple onChange={(e) => handleFileChange(e, index)} disabled={readOnly} />{!readOnly && <Label htmlFor={`v-img-${index}`} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), "cursor-pointer text-xs h-8")}><ImagePlus className="mr-2 h-3 w-3" />เพิ่มรูป</Label>}</div></FormControl></div></FormItem>
          )} />
        </TableCell>
        <TableCell className="align-top p-2 space-y-1">
          <FormField name={`multiVariants.${index}.price`} control={control} render={({ field }) => (<FormItem className="space-y-0"><FormControl><NumericInput {...field} placeholder="ราคา" disabled={readOnly} /></FormControl><FormMessage/></FormItem>)} />
          <FormField name={`multiVariants.${index}.compareAtPrice`} control={control} render={({ field }) => (<FormItem className="space-y-0"><FormControl><NumericInput {...field} value={field.value ?? null} placeholder="ราคาเดิม" disabled={readOnly} /></FormControl><FormMessage/></FormItem>)} />
        </TableCell>
        <TableCell className="align-top p-2"><FormField name={`multiVariants.${index}.sku`} control={control} render={({ field }) => (<FormItem className="space-y-0"><FormControl><Input {...field} readOnly placeholder="สร้างอัตโนมัติ" /></FormControl></FormItem>)} /></TableCell>
        <TableCell className="align-top p-2"><FormField name={`multiVariants.${index}.barcode`} control={control} render={({ field }) => (<FormItem className="space-y-0"><FormControl><Input {...field} disabled={readOnly} /></FormControl></FormItem>)} /></TableCell>
        <TableCell className="align-top p-2"><Input readOnly disabled value={totalStock.toLocaleString()} className="text-center" /></TableCell>
        <TableCell className="align-top p-2"><FormField name={`multiVariants.${index}.lowStockThreshold`} control={control} render={({ field }) => (<FormItem className="space-y-0"><FormControl><NumericInput {...field} isDecimal={false} disabled={!trackInventory || readOnly} value={field.value ?? null} /></FormControl></FormItem>)} /></TableCell>
        <TableCell className="align-top p-2"><FormField name={`multiVariants.${index}.weight`} control={control} render={({ field }) => (<FormItem className="space-y-0"><FormControl><NumericInput {...field} disabled={!requiresShipping || readOnly} /></FormControl></FormItem>)} /></TableCell>
        <TableCell className="align-top p-2 space-y-2">
            <FormField name={`multiVariants.${index}.taxStatus`} control={control} render={({ field }) => (
                <FormItem className="space-y-0">
                    <Select onValueChange={field.onChange} value={field.value} disabled={readOnly}>
                        <FormControl><SelectTrigger className="h-8 text-[10px]"><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent><SelectItem value="TAXABLE">เสียภาษี</SelectItem><SelectItem value="EXEMPT">ยกเว้น</SelectItem></SelectContent>
                    </Select>
                </FormItem>
            )} />
            <FormField name={`multiVariants.${index}.taxMode`} control={control} render={({ field }) => (
                <FormItem className="space-y-0">
                    <Select onValueChange={field.onChange} value={field.value} disabled={taxStatus === 'EXEMPT' || readOnly}>
                        <FormControl><SelectTrigger className="h-8 text-[10px]"><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent><SelectItem value="INCLUSIVE">รวม VAT</SelectItem><SelectItem value="EXCLUSIVE">แยก VAT</SelectItem></SelectContent>
                    </Select>
                </FormItem>
            )} />
            <FormField name={`multiVariants.${index}.taxRate`} control={control} render={({ field }) => (<FormItem className="space-y-0"><FormControl><NumericInput {...field} className="h-8 text-[10px] text-center" disabled={taxStatus === 'EXEMPT' || readOnly} /></FormControl></FormItem>)} />
        </TableCell>
        <TableCell className="align-top p-2"><FormField control={control} name={`multiVariants.${index}.requiresShipping`} render={({ field }) => (<FormItem className="flex justify-center pt-2"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={readOnly} /></FormControl></FormItem>)} /></TableCell>
        <TableCell className="align-top p-2"><FormField control={control} name={`multiVariants.${index}.trackInventory`} render={({ field }) => (<FormItem className="flex justify-center pt-2"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={readOnly} /></FormControl></FormItem>)} /></TableCell>
        <TableCell className="align-top p-2">
            {!readOnly && <Button type="button" variant="ghost" size="icon" onClick={() => onAction(index, isArchived ? 'restore' : 'archive')}>{isArchived ? <RotateCw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}</Button>}
        </TableCell>
      </TableRow>
    );
};

export function ProductForm({ initialData, readOnly }: ProductFormProps) {
  const { toast } = useToast();
  const router = useRouter();
  const firestore = useFirestore();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditMode = !!initialData;
  const imageInputRef = useRef<HTMLInputElement>(null);
  const initializedRef = useRef(false);
  
  const [isConfirmDisableVariantDialogOpen, setIsConfirmDisableVariantDialogOpen] = useState(false);
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [nextPath, setNextPath] = useState<string | null>(null);
  const [isVariantActionDialogOpen, setIsVariantActionDialogOpen] = useState(false);
  const [variantAction, setVariantAction] = useState<{ index: number; action: 'archive' | 'restore' } | null>(null);
  const [allProductCategories, setAllProductCategories] = useState<ProductCategory[]>([]);
  const [areCategoriesLoading, setAreCategoriesLoading] = useState(true);
  const [isEditingStatus, setIsEditingStatus] = useState(false);

  const settingsRef = useMemoFirebase(() => firestore ? doc(firestore, 'settings', 'store') : null, [firestore]);
  const { data: storeSettings } = useDoc<StoreSettings>(settingsRef);
  const defaultTaxRate = storeSettings?.defaultTaxRate ?? 7;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { ...defaultFormValues, singleVariant: { ...DEFAULT_FORM_VARIANT, taxRate: defaultTaxRate } as any },
    mode: 'onChange',
  });
  
  const { formState: { isDirty }, watch, setValue, control, reset, getValues } = form;
  const hasVariants = watch('hasVariants');

  const catA_code = watch('categoryA');
  const catB_code = watch('categoryB');

  // Compute actual parent objects for accurate hierarchical filtering
  const parentA = useMemo(() => allProductCategories.find(c => c.code === catA_code && c.level === 'A'), [allProductCategories, catA_code]);
  const parentB = useMemo(() => allProductCategories.find(c => c.code === catB_code && c.level === 'B' && c.parentId === parentA?.id), [allProductCategories, catB_code, parentA]);

  useEffect(() => {
    const fetchData = async () => {
        try { const categories = await getProductCategories(); setAllProductCategories(categories); }
        catch (error) { toast({ variant: 'destructive', title: 'เกิดข้อผิดพลาด', description: 'ไม่สามารถโหลดข้อมูลหมวดหมู่ได้' }); }
        finally { setAreCategoriesLoading(false); }
    };
    fetchData();
  }, [toast]);

  useEffect(() => {
    if (isEditMode && initialData && !initializedRef.current) {
      const { productGroup, variants } = initialData;
      const hasMultipleVariants = variants.length > 1 || (productGroup.options && productGroup.options.length > 0);
      const variantsWithLots = variants.map(v => ({
          ...v,
          taxStatus: v.taxStatus || 'TAXABLE',
          taxMode: v.taxMode || 'INCLUSIVE',
          taxRate: v.taxRate ?? defaultTaxRate,
          status: v.status || 'active',
      }));
      const singleVariantData = !hasMultipleVariants ? (variantsWithLots[0] || DEFAULT_FORM_VARIANT) : DEFAULT_FORM_VARIANT;
      reset({
          name: productGroup.name,
          description: productGroup.description || '',
          unit: productGroup.unit,
          brand: productGroup.brand || '',
          status: productGroup.status || 'draft',
          customFields: Object.entries(productGroup.customFields || {}).map(([key, value]) => ({ key, value })),
          hasVariants: hasMultipleVariants,
          categoryA: productGroup.categoryA,
          categoryB: productGroup.categoryB,
          categoryC: productGroup.categoryC,
          options: hasMultipleVariants ? (productGroup.options || []).map(opt => ({ name: opt.name, values: opt.values.join(', ') })) : [],
          multiVariants: hasMultipleVariants ? variantsWithLots : [],
          singleVariant: !hasMultipleVariants ? singleVariantData as any : undefined,
      });
      initializedRef.current = true;
    } else if (!isEditMode && !isDirty && !initializedRef.current) {
        setValue('singleVariant.taxRate', defaultTaxRate);
    }
  }, [isEditMode, initialData, reset, defaultTaxRate, isDirty, setValue]);

  const saveProduct = async (values: FormValues): Promise<boolean> => {
    if (!user || !firestore || readOnly) return false;
    const batch = writeBatch(firestore);
    try {
      if (values.unit) {
        const unitsRef = collection(firestore, 'units');
        const q = query(unitsRef, where("name", "==", values.unit), limit(1));
        const snapshot = await getDocs(q);
        if (snapshot.empty) batch.set(doc(unitsRef), { name: values.unit });
      }
      
      const pA = allProductCategories.find(c => c.code === values.categoryA && c.level === 'A');
      const pB = allProductCategories.find(c => c.code === values.categoryB && c.level === 'B' && c.parentId === pA?.id);
      const categoryCObj = allProductCategories.find(cat => cat.code === values.categoryC && cat.level === 'C' && cat.parentId === pB?.id);
      
      if (!categoryCObj) { toast({ variant: 'destructive', title: 'ข้อผิดพลาด', description: 'ไม่พบข้อมูลหมวดหมู่สินค้า' }); return false; }
      
      let variantsRaw = values.hasVariants ? values.multiVariants : [values.singleVariant];
      const variantsToSubmit = await Promise.all(variantsRaw.map(async variant => {
        let sku = variant.sku;
        if (!variant.id || sku === 'สร้างอัตโนมัติ' || !sku) {
            sku = await generateUniqueSku(firestore, categoryCObj.id, { A: values.categoryA, B: values.categoryB, C: values.categoryC });
        }
        return { ...variant, sku, priceTiers: (variant.priceTiers || []).filter((t: PriceTier) => t.minQuantity != null && t.price != null) };
      }));
      const customFieldsObject = values.customFields?.reduce((acc, f) => { if (f.key) acc[f.key] = f.value; return acc; }, {} as any) || {};
      const productGroupData = { sellerId: user.id, name: values.name, description: values.description, category: categoryCObj.name, categoryA: values.categoryA, categoryB: values.categoryB, categoryC: values.categoryC, brand: values.brand, unit: values.unit, status: values.status, options: values.hasVariants ? values.options.map(o => ({ name: o.name.trim(), values: o.values.split(',').map(v => v.trim()).filter(v => v) })) : [], customFields: customFieldsObject };
      if (isEditMode) {
        const groupId = initialData!.productGroup.id;
        batch.update(doc(firestore, 'productGroups', groupId), { ...productGroupData, updatedAt: serverTimestamp() });
        for (const variant of variantsToSubmit) {
            if (variant.id) batch.update(doc(firestore, 'productGroups', groupId, 'productVariants', variant.id), { ...variant, productGroupId: groupId });
            else { const vRef = doc(collection(firestore, 'productGroups', groupId, 'productVariants')); batch.set(vRef, { ...variant, id: vRef.id, productGroupId: groupId, createdAt: serverTimestamp() }); }
        }
      } else {
        const pgRef = doc(collection(firestore, 'productGroups'));
        batch.set(pgRef, { ...productGroupData, createdAt: serverTimestamp() });
        variantsToSubmit.forEach(v => { const vRef = doc(collection(firestore, 'productGroups', pgRef.id, 'productVariants')); batch.set(vRef, { ...v, productGroupId: pgRef.id, createdAt: serverTimestamp() }); });
      }
      await batch.commit();
      
      clearGlobalCache('products-data'); 
      
      toast({ title: isEditMode ? 'บันทึกการเปลี่ยนแปลงแล้ว' : 'สร้างสินค้าสำเร็จ' });
      return true;
    } catch(error) { toast({ variant: "destructive", title: "เกิดข้อผิดพลาด", description: "ไม่สามารถบันทึกสินค้าได้" }); return false; }
  }

  async function onSubmit(values: FormValues) { 
    if (readOnly) return;
    setIsSubmitting(true); 
    if (await saveProduct(values)) router.push('/dashboard/products'); 
    setIsSubmitting(false); 
  }

  const handleArchive = async () => {
    if (!isEditMode || !initialData || !firestore || readOnly) return;
    setIsSubmitting(true);
    try { 
      await updateDoc(doc(firestore, 'productGroups', initialData.productGroup.id), { status: 'archived' }); 
      clearGlobalCache('products-data');
      toast({ title: 'ย้ายไปถังขยะแล้ว' }); 
      router.push('/dashboard/products'); 
    }
    catch (e) { toast({ variant: "destructive", title: "เกิดข้อผิดพลาด" }); }
    finally { setIsSubmitting(false); setIsArchiveDialogOpen(false); }
  }

  const { categoryAName, categoryBName, categoryCName } = useMemo(() => {
    if (areCategoriesLoading) return { categoryAName: '...', categoryBName: '...', categoryCName: '...' };
    return { categoryAName: parentA?.name || '-', categoryBName: parentB?.name || '-', categoryCName: allProductCategories.find(c => c.code === watch('categoryC') && c.level === 'C' && c.parentId === parentB?.id)?.name || '-' };
  }, [areCategoriesLoading, allProductCategories, watch('categoryC'), parentA, parentB]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader><CardTitle>รายละเอียดสินค้า</CardTitle></CardHeader>
              <CardContent className="space-y-6">
                <FormField name="name" control={control} render={({ field }) => (<FormItem><FormLabel>ชื่อสินค้า *</FormLabel><FormControl><Input {...field} disabled={readOnly} /></FormControl><FormMessage /></FormItem>)}/>
                <FormField name="description" control={control} render={({ field }) => (<FormItem><FormLabel>รายละเอียด</FormLabel><FormControl><Textarea rows={5} {...field} disabled={readOnly} /></FormControl><FormMessage /></FormItem>)}/>
                {!hasVariants && (
                  <FormField name="singleVariant.imageUrls" control={control} render={({ field }) => (
                    <FormItem>
                      <FormLabel>แกลเลอรีรูปภาพ</FormLabel>
                      <div className="grid grid-cols-4 gap-4">
                        {(field.value || []).map((url: string, i: number) => (
                          <div key={i} className="relative aspect-square">
                            <img src={url} className="w-full h-full object-cover rounded-md border" alt="Product" />
                            {!readOnly && (
                              <Button 
                                type="button" 
                                variant="destructive" 
                                size="icon" 
                                className="absolute -top-2 -right-2 h-6 w-6" 
                                onClick={() => setValue('singleVariant.imageUrls', field.value.filter((_: any, idx: number) => idx !== i), { shouldDirty: true })}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        ))}
                        {!readOnly && (
                          <Label htmlFor="img-up" className="aspect-square flex flex-col items-center justify-center border-2 border-dashed rounded-md cursor-pointer hover:bg-accent/50">
                            <ImagePlus className="h-8 w-8" />
                            <Input 
                              id="img-up" 
                              type="file" 
                              multiple 
                              accept="image/*" 
                              className="hidden" 
                              onChange={(e) => {
                                const f = e.target.files;
                                if (f) {
                                  Array.from(f).forEach(file => {
                                    const r = new FileReader();
                                    r.onload = (ev) => {
                                      const currentImages = getValues('singleVariant.imageUrls') || [];
                                      setValue('singleVariant.imageUrls', [...currentImages, ev.target?.result as string], { shouldDirty: true });
                                    };
                                    r.readAsDataURL(file);
                                  });
                                }
                              }} 
                            />
                          </Label>
                        )}
                      </div>
                    </FormItem>
                  )}/>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>ราคาและตัวเลือก</CardTitle></CardHeader>
              <CardContent className="space-y-6">
                <FormField control={control} name="hasVariants" render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-4"><div><FormLabel>สินค้านี้มีหลายตัวเลือก</FormLabel><FormDescription>เช่น มีหลายขนาดหรือหลายสี</FormDescription></div><FormControl><Switch checked={field.value} onCheckedChange={(c) => { if (c) { setValue('hasVariants', true); form.unregister('singleVariant'); } else setIsConfirmDisableVariantDialogOpen(true); }} disabled={readOnly} /></FormControl></FormItem>
                )}/>
                {hasVariants ? <MultiVariantFields form={form} isEditMode={isEditMode} onVariantAction={(i, a) => { setVariantAction({ index: i, action: a }); setIsVariantActionDialogOpen(true); }} defaultTaxRate={defaultTaxRate} readOnly={readOnly} /> : <SingleVariantFields form={form} readOnly={readOnly} />}
              </CardContent>
            </Card>
          </div>
          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle>สถานะ</CardTitle></CardHeader>
              <CardContent>
                <FormField control={control} name="status" render={({ field }) => (
                  <FormItem>
                    <FormLabel>สถานะ *</FormLabel>
                    {isEditMode && !isEditingStatus ? (
                      <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/5 animate-in fade-in duration-300">
                        <Badge variant={getStatusVariant(field.value)} className="h-7 px-3 text-sm shadow-sm">
                          {getStatusText(field.value)}
                        </Badge>
                        {!readOnly && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-primary transition-colors"
                            onClick={() => setIsEditingStatus(true)}
                            title="คลิกเพื่อเปลี่ยนสถานะ"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 animate-in slide-in-from-right-2 duration-300">
                        <div className="flex-1">
                          <Select onValueChange={(val) => { field.onChange(val); if (isEditMode) setIsEditingStatus(false); }} value={field.value} disabled={readOnly}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="เลือกสถานะ" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="active">เผยแพร่</SelectItem>
                              <SelectItem value="draft">ฉบับร่าง</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {isEditMode && isEditingStatus && (
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-10 w-10 shrink-0"
                            onClick={() => setIsEditingStatus(false)}
                            title="ยกเลิกการแก้ไข"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    )}
                    <FormMessage />
                  </FormItem>
                )}/>
              </CardContent>
            </Card>
            <Card><CardHeader><CardTitle>หมวดหมู่</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {isEditMode ? (<div className="space-y-4"><div><Label>หมวดหมู่หลัก</Label><Input readOnly disabled value={categoryAName} /></div><div><Label>หมวดหมู่ย่อย</Label><Input readOnly disabled value={categoryBName} /></div><div><Label>ประเภท</Label><Input readOnly disabled value={categoryCName} /></div></div>) : (
                  <>
                    <FormField name="categoryA" control={control} render={({ field }) => (<FormItem><FormLabel>หมวดหมู่หลัก *</FormLabel><Select onValueChange={(v)=>{field.onChange(v); setValue('categoryB', ''); setValue('categoryC', '');}} value={field.value} disabled={readOnly}><FormControl><SelectTrigger><SelectValue placeholder="เลือกหมวดหมู่หลัก" /></SelectTrigger></FormControl><SelectContent>{allProductCategories.filter(c=>c.level==='A').map(c=><SelectItem key={c.id} value={c.code}>{c.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)}/>
                    <FormField name="categoryB" control={control} render={({ field }) => (<FormItem><FormLabel>หมวดหมู่ย่อย *</FormLabel><Select onValueChange={(v)=>{field.onChange(v); setValue('categoryC', '');}} value={field.value} disabled={!catA_code || readOnly}><FormControl><SelectTrigger><SelectValue placeholder="เลือกหมวดหมู่ย่อย" /></SelectTrigger></FormControl><SelectContent>{allProductCategories.filter(c=>c.level==='B' && c.parentId === parentA?.id).map(c=><SelectItem key={c.id} value={c.code}>{c.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)}/>
                    <FormField name="categoryC" control={control} render={({ field }) => (<FormItem><FormLabel>ประเภท *</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={!catB_code || readOnly}><FormControl><SelectTrigger><SelectValue placeholder="เลือกประเภท" /></SelectTrigger></FormControl><SelectContent>{allProductCategories.filter(c=>c.level==='C' && c.parentId === parentB?.id).map(c=><SelectItem key={c.id} value={c.code}>{c.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)}/>
                  </>
                )}
                <FormField name="unit" control={control} render={({ field }) => (<FormItem><FormLabel>หน่วยนับ *</FormLabel><FormControl><UnitCombobox field={field} disabled={readOnly} /></FormControl><FormMessage /></FormItem>)}/>
              </CardContent>
            </Card>
          </div>
        </div>
        <div className="flex justify-between pt-6">
            {!readOnly ? (
                <Button type="submit" disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}บันทึกสินค้า</Button>
            ) : (
                <Button type="button" variant="outline" onClick={() => router.back()}>กลับไปที่รายการ</Button>
            )}
            {isEditMode && !readOnly && <Button type="button" variant="destructive" onClick={()=>setIsArchiveDialogOpen(true)}>ย้ายไปถังขยะ</Button>}
        </div>
      </form>
      <AlertDialog open={isVariantActionDialogOpen} onOpenChange={setIsVariantActionDialogOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>ยืนยันการดำเนินการ</AlertDialogTitle><AlertDialogDescription>คุณแน่ใจหรือไม่ว่าต้องการ{variantAction?.action==='archive'?'จัดเก็บ':'กู้คืน'}ตัวเลือกนี้?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel onClick={()=>setVariantAction(null)}>ยกเลิก</AlertDialogCancel><AlertDialogAction onClick={()=>{if(variantAction){setValue(`multiVariants.${variantAction.index}.status`, variantAction.action==='archive'?'archived':'active', {shouldDirty:true}); setVariantAction(null);}}}>ยืนยัน</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <AlertDialog open={isConfirmDisableVariantDialogOpen} onOpenChange={setIsConfirmDisableVariantDialogOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>ปิดใช้งานตัวเลือก?</AlertDialogTitle><AlertDialogDescription>ข้อมูลตัวเลือกทั้งหมดจะถูกลบและรีเซ็ตเป็นสินค้าชิ้นเดียว</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>ยกเลิก</AlertDialogCancel><AlertDialogAction onClick={()=>{setValue('hasVariants',false); form.unregister('multiVariants'); form.unregister('options'); setValue('singleVariant', {...DEFAULT_FORM_VARIANT, taxRate: defaultTaxRate} as any); setIsConfirmDisableVariantDialogOpen(false);}}>ยืนยัน</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <CustomDialog isOpen={isArchiveDialogOpen} onClose={()=>setIsArchiveDialogOpen(false)} title="ย้ายไปถังขยะ"><p>ยืนยันการย้ายสินค้าไปถังขยะ?</p><div className="flex justify-end gap-2 mt-6"><Button variant="outline" onClick={()=>setIsArchiveDialogOpen(false)}>ยกเลิก</Button><Button variant="destructive" onClick={handleArchive}>ยืนยัน</Button></div></CustomDialog>
    </Form>
  );
}
