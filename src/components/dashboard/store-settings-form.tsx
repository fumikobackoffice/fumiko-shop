
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
import { Loader2, PlusCircle, Trash2, Building2, Headset, Percent, Megaphone, ImagePlus, X, Pencil, Info, CheckCircle2, Construction, Eye, AlertTriangle } from 'lucide-react';
import { useFirestore } from '@/firebase';
import { doc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { StoreSettings, MaintenanceConfig } from '@/lib/types';
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
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { Alert, AlertDescription } from '@/components/ui/alert';

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

const maintenanceModeSchema = z.object({
  enabled: z.boolean().default(false),
  title: z.string().optional(),
  message: z.string().optional(),
  imageUrl: z.string().optional(),
  estimatedEndDate: z.string().optional(),
  estimatedEndTime: z.string().optional(),
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
  maintenanceMode: maintenanceModeSchema.optional(),
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
  maintenanceMode: {
    enabled: false,
    title: '',
    message: '',
    imageUrl: '',
    estimatedEndDate: '',
    estimatedEndTime: '',
  },
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
  const [isMaintenancePreviewOpen, setIsMaintenancePreviewOpen] = useState(false);
  const { uploadImage, deleteImage } = useUploadImage('maintenance');

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultFormValues,
  });

  const { formState: { isDirty }, reset, control, watch, setValue } = form;

  const { fields, append, remove } = useFieldArray({ control, name: "provincialShippingRates" });

  useEffect(() => {
    if (initialData) {
      // Parse estimatedEndTime for maintenance mode
      let estDate = '';
      let estTime = '';
      if (initialData.maintenanceMode?.estimatedEndTime) {
        const d = initialData.maintenanceMode.estimatedEndTime?.toDate
          ? initialData.maintenanceMode.estimatedEndTime.toDate()
          : new Date(initialData.maintenanceMode.estimatedEndTime);
        if (!isNaN(d.getTime())) {
          estDate = format(d, 'yyyy-MM-dd');
          estTime = format(d, 'HH:mm');
        }
      }

      reset({
        defaultShippingRates: initialData.defaultShippingRates || defaultFormValues.defaultShippingRates,
        provincialShippingRates: initialData.provincialShippingRates || [],
        pointsRate: initialData.pointsRate || 100,
        pointValue: initialData.pointValue || 1,
        defaultTaxRate: initialData.defaultTaxRate ?? 7,
        companyAddress: initialData.companyAddress || defaultFormValues.companyAddress,
        supportPhone: initialData.supportPhone || '',
        supportLineId: initialData.supportLineId || '',
        maintenanceMode: {
          enabled: initialData.maintenanceMode?.enabled || false,
          title: initialData.maintenanceMode?.title || '',
          message: initialData.maintenanceMode?.message || '',
          imageUrl: initialData.maintenanceMode?.imageUrl || '',
          estimatedEndDate: estDate,
          estimatedEndTime: estTime,
        },
      });
    }
  }, [initialData, reset]);

  const saveSettings = async (values: FormValues) => {
    if (!firestore || readOnly) return false;
    try {
        const settingsRef = doc(firestore, 'settings', 'store');
        
        // Transform maintenance mode date/time to Firestore-compatible format
        const dataToSave: any = { ...values };
        if (values.maintenanceMode) {
          const { estimatedEndDate, estimatedEndTime, ...rest } = values.maintenanceMode;
          let estimatedEnd: Date | null = null;
          if (estimatedEndDate) {
            const timePart = estimatedEndTime || '00:00';
            estimatedEnd = new Date(`${estimatedEndDate}T${timePart}:00`);
            if (isNaN(estimatedEnd.getTime())) estimatedEnd = null;
          }
          dataToSave.maintenanceMode = {
            ...rest,
            estimatedEndTime: estimatedEnd,
            updatedAt: serverTimestamp(),
          };
        }

        await setDoc(settingsRef, dataToSave, { merge: true });
        
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

          {/* Maintenance Mode Card */}
          <Card className={cn("border-2 transition-colors", watch('maintenanceMode.enabled') ? 'border-destructive bg-destructive/5' : 'border-orange-200')}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Construction className={cn("h-5 w-5", watch('maintenanceMode.enabled') ? 'text-destructive' : 'text-orange-500')} />
                ปิดปรับปรุงเว็บไซต์ (Maintenance Mode)
                {watch('maintenanceMode.enabled') && (
                  <Badge variant="destructive" className="ml-2 animate-pulse">กำลังเปิดใช้งาน</Badge>
                )}
              </CardTitle>
              <CardDescription className="text-xs">เมื่อเปิดโหมดนี้ ลูกค้าทุกคนจะไม่สามารถใช้งานระบบได้ และจะเห็นหน้าประกาศปิดปรับปรุงตามที่กำหนดไว้</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {watch('maintenanceMode.enabled') && (
                <Alert variant="destructive" className="bg-destructive/10">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs font-bold">
                    ⚠️ Maintenance Mode เปิดอยู่! ลูกค้าทุกคนจะไม่สามารถเข้าใช้งานระบบได้ กรุณาปิดเมื่อปรับปรุงเสร็จ
                  </AlertDescription>
                </Alert>
              )}

              <FormField name="maintenanceMode.enabled" control={form.control} render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base font-bold">เปิดโหมดปิดปรับปรุง</FormLabel>
                    <FormDescription className="text-xs">เมื่อเปิด ลูกค้าจะเห็นเฉพาะหน้าปิดปรับปรุง ระบบจะไม่ trigger ประกาศหรือคำถามบังคับใดๆ</FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} disabled={readOnly} />
                  </FormControl>
                </FormItem>
              )} />

              <Separator />

              <div className="space-y-4">
                <h3 className="text-sm font-bold text-muted-foreground">ข้อมูลที่แสดงในหน้าปิดปรับปรุง</h3>

                <FormField name="maintenanceMode.title" control={form.control} render={({ field }) => (
                  <FormItem>
                    <FormLabel>หัวข้อประกาศ</FormLabel>
                    <FormControl><Input placeholder="เช่น ระบบปิดปรับปรุงชั่วคราว" {...field} disabled={readOnly} /></FormControl>
                  </FormItem>
                )} />

                <FormField name="maintenanceMode.message" control={form.control} render={({ field }) => (
                  <FormItem>
                    <FormLabel>รายละเอียดข้อความ</FormLabel>
                    <FormControl><Textarea rows={3} placeholder="เช่น เรากำลังปรับปรุงระบบเพื่อให้บริการที่ดียิ่งขึ้น..." {...field} disabled={readOnly} /></FormControl>
                  </FormItem>
                )} />

                {/* Image Upload */}
                <div className="space-y-2">
                  <FormLabel>รูปภาพประกอบ</FormLabel>
                  {watch('maintenanceMode.imageUrl') ? (
                    <div className="relative group aspect-video max-w-sm rounded-lg overflow-hidden border">
                      <img src={watch('maintenanceMode.imageUrl')} alt="Maintenance" className="h-full w-full object-contain" />
                      {!readOnly && (
                        <Button type="button" variant="destructive" size="icon" className="absolute top-2 right-2 h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg" onClick={() => {
                          const removedUrl = watch('maintenanceMode.imageUrl');
                          setValue('maintenanceMode.imageUrl', '', { shouldDirty: true });
                          if (removedUrl) deleteImage(removedUrl);
                        }}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ) : (
                    <label htmlFor="maintenance-img-upload" className={cn("flex aspect-video max-w-sm w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-orange-200 bg-orange-50/50 hover:bg-orange-100/50 transition-colors", readOnly ? 'cursor-default' : 'cursor-pointer')}>
                      <ImagePlus className="h-8 w-8 mb-2 text-orange-300" />
                      <span className="text-xs text-muted-foreground">คลิกเพื่ออัปโหลดรูปภาพ</span>
                      {!readOnly && <Input id="maintenance-img-upload" type="file" accept="image/*" className="sr-only" onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 5 * 1024 * 1024) { toast({ variant: 'destructive', title: 'ไฟล์ใหญ่เกินไป' }); return; }
                        toast({ title: 'กำลังอัปโหลด...' });
                        try {
                          const url = await uploadImage(file);
                          setValue('maintenanceMode.imageUrl', url, { shouldDirty: true });
                          toast({ title: 'อัปโหลดสำเร็จ' });
                        } catch { toast({ variant: 'destructive', title: 'อัปโหลดล้มเหลว' }); }
                      }} />}
                    </label>
                  )}
                </div>

                {/* Estimated End Time */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField name="maintenanceMode.estimatedEndDate" control={form.control} render={({ field }) => (
                    <FormItem>
                      <FormLabel>วันที่คาดว่าจะกลับมา (ไม่บังคับ)</FormLabel>
                      <FormControl><Input type="date" {...field} disabled={readOnly} /></FormControl>
                    </FormItem>
                  )} />
                  <FormField name="maintenanceMode.estimatedEndTime" control={form.control} render={({ field }) => (
                    <FormItem>
                      <FormLabel>เวลาที่คาดว่าจะกลับมา</FormLabel>
                      <FormControl><Input type="time" {...field} disabled={readOnly} /></FormControl>
                    </FormItem>
                  )} />
                </div>
              </div>

              {/* Preview Button */}
              {!readOnly && (
                <div className="flex justify-end pt-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setIsMaintenancePreviewOpen(true)}>
                    <Eye className="mr-2 h-4 w-4" /> ดูตัวอย่างหน้าปิดปรับปรุง
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Maintenance Preview Dialog */}
          <Dialog open={isMaintenancePreviewOpen} onOpenChange={setIsMaintenancePreviewOpen}>
            <DialogContent className="max-w-lg p-0 overflow-hidden gap-0">
              <DialogTitle className="sr-only">ตัวอย่างหน้าปิดปรับปรุง</DialogTitle>
              <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-8 text-center space-y-4 min-h-[400px] flex flex-col items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center ring-4 ring-amber-500/10">
                  <Construction className="h-8 w-8 text-amber-400" />
                </div>
                <h2 className="text-2xl font-bold">{watch('maintenanceMode.title') || 'ระบบปิดปรับปรุงชั่วคราว'}</h2>
                {watch('maintenanceMode.message') && (
                  <p className="text-sm text-slate-300 whitespace-pre-wrap max-w-md">{watch('maintenanceMode.message')}</p>
                )}
                {watch('maintenanceMode.imageUrl') && (
                  <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-white/10 max-w-sm mx-auto">
                    <img src={watch('maintenanceMode.imageUrl')} alt="Preview" className="w-full h-full object-contain bg-black/20" />
                  </div>
                )}
                {watch('maintenanceMode.estimatedEndDate') && (
                  <p className="text-xs text-slate-400">
                    คาดว่าจะกลับมาเปิดให้บริการ: <span className="font-bold text-white">{watch('maintenanceMode.estimatedEndDate')} {watch('maintenanceMode.estimatedEndTime') || ''}</span>
                  </p>
                )}
                <p className="text-[11px] text-slate-500 pt-4">ขออภัยในความไม่สะดวก ระบบกำลังปรับปรุงเพื่อให้บริการที่ดียิ่งขึ้น</p>
              </div>
            </DialogContent>
          </Dialog>

          {!readOnly && (
            <div className="flex justify-end"><Button type="submit" disabled={isSubmitting || !isDirty} size="lg">{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}บันทึกการเปลี่ยนแปลง</Button></div>
          )}
        </form>
      </Form>
      <UnsavedChangesDialog isOpen={showUnsavedDialog} onOpenChange={setShowUnsavedDialog} onSaveAndExit={handleSaveAndNavigate} onDiscardAndExit={handleDiscardAndNavigate} isSaving={isSubmitting} />
    </>
  );
}
