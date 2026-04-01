
'use client';

import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect, ChangeEvent, useMemo } from 'react';
import { Loader2, PlusCircle, Trash2, Building2, Headset, Percent, Megaphone, ImagePlus, X, Pencil, Info, CheckCircle2 } from 'lucide-react';
import { useFirestore } from '@/firebase';
import { doc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { StoreSettings } from '@/lib/types';
import { Skeleton } from '../ui/skeleton';
import { UnsavedChangesDialog } from './unsaved-changes-dialog';
import { useRouter } from 'next/navigation';
import { Separator } from '../ui/separator';
import { ProvinceCombobox } from './province-combobox';
import { Textarea } from '../ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Badge } from '../ui/badge';
import { clearGlobalCache } from '@/hooks/use-smart-fetch';
import { useUploadImage } from '@/firebase/storage/use-storage';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

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

const shippingRatesSchema = z.object({
  baseRate: z.coerce.number().min(0, 'ต้องไม่ติดลบ'),
  stepRate: z.coerce.number().min(0, 'ต้องไม่ติดลบ'),
  blockRate: z.coerce.number().min(0, 'ต้องไม่ติดลบ'),
});

const provincialShippingRateSchema = z.object({
  province: z.string().min(1, 'กรุณาเลือกจังหวัด'),
  rates: shippingRatesSchema,
});

const companyAddressSchema = z.object({
  name: z.string().min(1, 'กรุณากรอกชื่อบริษัท'),
  street: z.string().min(1, 'กรุณากรอกที่อยู่'),
  subdistrict: z.string().min(1, 'กรุณากรอกตำบล/แขวง'),
  district: z.string().min(1, 'กรุณากรอกอำเภอ/เขต'),
  province: z.string().min(1, 'กรุณาเลือกจังหวัด'),
  postalCode: z.string().min(1, 'กรุณากรอกรหัสไปรษณีย์'),
  phone: z.string().min(1, 'กรุณากรอกเบอร์โทรศัพท์'),
});

const formSchema = z.object({
  defaultShippingRates: shippingRatesSchema,
  provincialShippingRates: z.array(provincialShippingRateSchema).optional(),
  pointsRate: z.coerce.number().min(1, 'อัตราคะแนนต้องมีค่าอย่างน้อย 1'),
  pointValue: z.coerce.number().min(0.01, 'มูลค่าคะแนนต้องมากกว่า 0'),
  defaultTaxRate: z.coerce.number().min(0).max(100),
  companyAddress: companyAddressSchema.optional(),
  supportPhone: z.string().optional(),
  supportLineId: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

const defaultFormValues: FormValues = {
  defaultShippingRates: { baseRate: 45, stepRate: 5, blockRate: 35 },
  provincialShippingRates: [],
  pointsRate: 100,
  pointValue: 1,
  defaultTaxRate: 7,
  companyAddress: {
    name: 'Fumiko Head Office',
    street: '106/19 หมู่ 6, บางรักพัฒนา',
    subdistrict: 'บางรักพัฒนา',
    district: 'บางบัวทอง',
    province: 'นนทบุรี',
    postalCode: '11110',
    phone: '0657546699',
  },
  supportPhone: '0657546699',
  supportLineId: '@fumiko_support',
};

interface StoreSettingsFormProps {
  initialData?: StoreSettings;
  isLoading: boolean;
  readOnly?: boolean;
  onRefresh: () => void;
}

export function StoreSettingsForm({ initialData, isLoading, readOnly, onRefresh }: StoreSettingsFormProps) {
  const { toast } = useToast();
  const firestore = useFirestore();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [nextPath, setNextPath] = useState<string | null>(null);
  const { deleteImage } = useUploadImage();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultFormValues,
  });

  const { formState: { isDirty }, reset, control, watch, setValue } = form;

  const { fields, append, remove } = useFieldArray({ control, name: "provincialShippingRates" });

  useEffect(() => {
    if (initialData) {
      reset({
        defaultShippingRates: initialData.defaultShippingRates || defaultFormValues.defaultShippingRates,
        provincialShippingRates: initialData.provincialShippingRates || [],
        pointsRate: initialData.pointsRate || 100,
        pointValue: initialData.pointValue || 1,
        defaultTaxRate: initialData.defaultTaxRate ?? 7,
        companyAddress: initialData.companyAddress || defaultFormValues.companyAddress,
        supportPhone: initialData.supportPhone || '',
        supportLineId: initialData.supportLineId || '',
      });
    }
  }, [initialData, reset]);

  const saveSettings = async (values: FormValues) => {
    if (!firestore || readOnly) return false;
    try {
        const { dirtyFields } = form.formState;
        
        const settingsRef = doc(firestore, 'settings', 'store');
        await setDoc(settingsRef, values, { merge: true });
        
        clearGlobalCache('store-settings-data');
        onRefresh();
        
        return true;
    } catch (error: any) {
        toast({ variant: 'destructive', title: "เกิดข้อผิดพลาด", description: error.message });
        return false;
    }
  }

  async function onSubmit(values: FormValues) {
    if (readOnly) return;
    setIsSubmitting(true);
    if(await saveSettings(values)) reset(values);
    setIsSubmitting(false);
  }

  const handleSaveAndNavigate = async () => {
    setIsSubmitting(true);
    const isValid = await form.trigger();
    if (isValid) {
      const values = form.getValues();
      const success = await saveSettings(values);
      if (success && nextPath) {
        setTimeout(() => router.push(nextPath), 50);
      }
    }
    setIsSubmitting(false);
    setShowUnsavedDialog(false);
  };

  const handleDiscardAndNavigate = () => {
    if (nextPath) {
      router.push(nextPath);
    }
    setShowUnsavedDialog(false);
  };



  const selectedProvinces = watch('provincialShippingRates')?.map(r => r.province) || [];

  if (isLoading) return (
    <div className="space-y-6">
        {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}><CardHeader><Skeleton className="h-7 w-48" /><Skeleton className="h-4 w-64 mt-2" /></CardHeader><CardContent className="space-y-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></CardContent></Card>
        ))}
    </div>
  );
  
  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">


          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" />ข้อมูลที่อยู่บริษัท (ผู้ส่ง)</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField name="companyAddress.name" control={form.control} render={({ field }) => (<FormItem><FormLabel>ชื่อบริษัท/ชื่อผู้ส่ง</FormLabel><FormControl><Input {...field} disabled={readOnly} /></FormControl><FormMessage /></FormItem>)} />
                <FormField name="companyAddress.phone" control={form.control} render={({ field }) => (<FormItem><FormLabel>เบอร์โทรศัพท์ติดต่อ</FormLabel><FormControl><Input {...field} disabled={readOnly} /></FormControl><FormMessage /></FormItem>)} />
              </div>
              <FormField name="companyAddress.street" control={form.control} render={({ field }) => (<FormItem><FormLabel>ที่อยู่ (บ้านเลขที่, ถนน, หมู่)</FormLabel><FormControl><Textarea rows={2} {...field} disabled={readOnly} /></FormControl><FormMessage /></FormItem>)} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField name="companyAddress.subdistrict" control={form.control} render={({ field }) => (<FormItem><FormLabel>ตำบล/แขวง</FormLabel><FormControl><Input {...field} disabled={readOnly} /></FormControl><FormMessage /></FormItem>)} />
                <FormField name="companyAddress.district" control={form.control} render={({ field }) => (<FormItem><FormLabel>อำเภอ/เขต</FormLabel><FormControl><Input {...field} disabled={readOnly} /></FormControl><FormMessage /></FormItem>)} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField name="companyAddress.province" control={form.control} render={({ field }) => (<FormItem><FormLabel>จังหวัด</FormLabel><FormControl><ProvinceCombobox value={field.value || ''} onChange={field.onChange} disabled={readOnly} /></FormControl><FormMessage /></FormItem>)} />
                <FormField name="companyAddress.postalCode" control={form.control} render={({ field }) => (<FormItem><FormLabel>รหัสไปรษณีย์</FormLabel><FormControl><Input {...field} disabled={readOnly} /></FormControl><FormMessage /></FormItem>)} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Headset className="h-5 w-5 text-primary" />ช่องทางติดต่อสำหรับสาขา (Support)</CardTitle></CardHeader>
            <CardContent className="space-y-4"><div className="grid grid-cols-1 md:grid-cols-2 gap-4"><FormField name="supportPhone" control={form.control} render={({ field }) => (<FormItem><FormLabel>เบอร์โทรศัพท์ซัพพอร์ต</FormLabel><FormControl><Input {...field} disabled={readOnly} /></FormControl><FormMessage /></FormItem>)} /><FormField name="supportLineId" control={form.control} render={({ field }) => (<FormItem><FormLabel>LINE ID</FormLabel><FormControl><Input {...field} disabled={readOnly} /></FormControl><FormMessage /></FormItem>)} /></div></CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Percent className="h-5 w-5 text-primary" /> การตั้งค่าภาษี (VAT)</CardTitle></CardHeader>
            <CardContent>
              <FormField name="defaultTaxRate" control={form.control} render={({ field }) => (
                <FormItem className="max-w-xs">
                  <FormLabel>อัตราภาษีเริ่มต้น (%)</FormLabel>
                  <FormControl><NumericInput {...field} disabled={readOnly} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <Card>
             <CardHeader><CardTitle>อัตราค่าจัดส่งตามน้ำหนัก (ค่าเริ่มต้น)</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <FormField name="defaultShippingRates.baseRate" control={form.control} render={({ field }) => (<FormItem><FormLabel>ค่าส่งเริ่มต้น (บาท)</FormLabel><FormControl><NumericInput {...field} disabled={readOnly} /></FormControl><FormMessage /></FormItem>)} />
                <FormField name="defaultShippingRates.stepRate" control={form.control} render={({ field }) => (<FormItem><FormLabel>ค่าส่งต่อ 500g (บาท)</FormLabel><FormControl><NumericInput {...field} disabled={readOnly} /></FormControl><FormMessage /></FormItem>)} />
                <FormField name="defaultShippingRates.blockRate" control={form.control} render={({ field }) => (<FormItem><FormLabel>ค่าธรรมเนียมช่วง 5kg (บาท)</FormLabel><FormControl><NumericInput {...field} disabled={readOnly} /></FormControl><FormMessage /></FormItem>)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>อัตราค่าจัดส่งพิเศษตามจังหวัด</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                {fields.map((field, index) => (
                  <div key={field.id} className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1fr_1fr_40px] gap-4 items-center p-2 border rounded-md">
                    <FormField control={control} name={`provincialShippingRates.${index}.province`} render={({ field: pf }) => (<FormItem className="space-y-0"><ProvinceCombobox value={pf.value} onChange={pf.onChange} disabledProvinces={selectedProvinces} disabled={readOnly} /></FormItem>)} />
                    <FormField name={`provincialShippingRates.${index}.rates.baseRate`} control={control} render={({ field: bf }) => (<FormItem className="space-y-0"><NumericInput {...bf} disabled={readOnly} /></FormItem>)} />
                    <FormField name={`provincialShippingRates.${index}.rates.stepRate`} control={control} render={({ field: sf }) => (<FormItem className="space-y-0"><NumericInput {...sf} disabled={readOnly} /></FormItem>)} />
                    <FormField name={`provincialShippingRates.${index}.rates.blockRate`} control={control} render={({ field: bkf }) => (<FormItem className="space-y-0"><NumericInput {...bkf} disabled={readOnly} /></FormItem>)} />
                    {!readOnly && <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => remove(index)}><Trash2 className="h-4 w-4" /></Button>}
                  </div>
                ))}
              </div>
              {!readOnly && <Button type="button" variant="outline" size="sm" onClick={() => append({ province: '', rates: watch('defaultShippingRates') })}><PlusCircle className="mr-2 h-4 w-4" /> เพิ่มจังหวัด</Button>}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader><CardTitle>การตั้งค่าระบบคะแนน</CardTitle></CardHeader>
            <CardContent className="space-y-6">
                <FormField name="pointsRate" control={form.control} render={({ field }) => (<FormItem><FormLabel>อัตราการได้รับคะแนน</FormLabel><FormControl><div className="flex items-center gap-2 max-w-sm"><span>ทุกๆ</span><NumericInput isDecimal={false} {...field} disabled={readOnly} className="w-24 text-center" /><span>บาท จะได้รับ 1 คะแนน</span></div></FormControl></FormItem>)} />
                <FormField name="pointValue" control={form.control} render={({ field }) => (<FormItem><FormLabel>มูลค่าของคะแนน (บาท)</FormLabel><FormControl><div className="flex items-center gap-2 max-w-sm"><span>1 คะแนน มีมูลค่าเท่ากับ</span><NumericInput {...field} disabled={readOnly} className="w-24 text-center" /><span>บาท</span></div></FormControl></FormItem>)} />
            </CardContent>
          </Card>
          {!readOnly && (
            <div className="flex justify-end"><Button type="submit" disabled={isSubmitting || !isDirty} size="lg">{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}บันทึกการเปลี่ยนแปลง</Button></div>
          )}
        </form>
      </Form>
      <UnsavedChangesDialog isOpen={showUnsavedDialog} onOpenChange={setShowUnsavedDialog} onSaveAndExit={handleSaveAndNavigate} onDiscardAndExit={handleDiscardAndNavigate} isSaving={isSubmitting} />
    </>
  );
}
