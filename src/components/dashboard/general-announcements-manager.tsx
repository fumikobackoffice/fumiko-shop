
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

const quizQuestionSchema = z.object({
  id: z.string(),
  question: z.string().min(1, 'กรุณากรอกคำถาม'),
  options: z.array(z.string().min(1, 'กรุณากรอกตัวเลือก')).min(2, 'ต้องมีตัวเลือกอย่างน้อย 2 ข้อ'),
  correctOptionIndex: z.number().min(0)
});

const mandatoryQuizSetSchema = z.object({
  id: z.string(),
  active: z.boolean().default(false),
  title: z.string().min(1, 'กรุณากรอกหัวข้อประกาศ'),
  content: z.string().optional(),
  imageUrl: z.string().optional(),
  questions: z.array(quizQuestionSchema).default([]),
}).superRefine((data, ctx) => {
  if (data.active) {
    if (data.questions.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'กรุณาเพิ่มคำถามอย่างน้อย 1 ข้อ', path: ['questions'] });
    }
  }
});

const announcementSchema = z.object({
  active: z.boolean().default(false),
  title: z.string().optional(),
  content: z.string().optional(),
  imageUrl: z.string().optional(),
  hasAckButton: z.boolean().default(true),
  frequency: z.enum(['ONLY_ONCE', 'EVERY_LOGIN']).default('ONLY_ONCE'),
}).superRefine((data, ctx) => {
  if (data.active) {
    if ((!data.title || !data.title.trim()) && !data.imageUrl) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'กรุณากรอกหัวข้อประกาศ หรือ อัปโหลดรูปภาพ', path: ['title'] });
    }
  }
});

const formSchema = z.object({
  announcement: announcementSchema.optional(),
  mandatoryQuizzes: z.array(mandatoryQuizSetSchema).default([]),
});

type FormValues = z.infer<typeof formSchema>;

const defaultFormValues: FormValues = {
  announcement: {
    active: false,
    title: '',
    content: '',
    imageUrl: '',
    hasAckButton: true,
    frequency: 'ONLY_ONCE',
  },
  mandatoryQuizzes: [],
};

interface GeneralAnnouncementsManagerProps {
  initialData?: StoreSettings;
  isLoading: boolean;
  readOnly?: boolean;
  onRefresh: () => void;
}

export function GeneralAnnouncementsManager({ initialData, isLoading, readOnly, onRefresh }: GeneralAnnouncementsManagerProps) {
  const { toast } = useToast();
  const firestore = useFirestore();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [nextPath, setNextPath] = useState<string | null>(null);
  const [isEditingFrequency, setIsEditingFrequency] = useState(false);
  const { uploadImage, deleteImage } = useUploadImage();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultFormValues,
  });

  const { formState: { isDirty }, reset, control, watch, setValue } = form;

  const { fields: quizzes, append: appendQuiz, remove: removeQuiz } = useFieldArray({ control, name: "mandatoryQuizzes" });

  useEffect(() => {
    if (initialData) {
      const rawAnn = initialData.announcement;
      const rawQuizzes = initialData.mandatoryQuizzes || [];
      const dbFreq = (rawAnn?.frequency as string);
      const freqValue: 'ONLY_ONCE' | 'EVERY_LOGIN' = (dbFreq === 'EVERY_LOGIN') ? 'EVERY_LOGIN' : 'ONLY_ONCE';

      reset({
        announcement: {
          active: !!rawAnn?.active,
          title: rawAnn?.title || '',
          content: rawAnn?.content || '',
          imageUrl: rawAnn?.imageUrl || '',
          hasAckButton: rawAnn?.hasAckButton !== false,
          frequency: freqValue,
        },
        mandatoryQuizzes: rawQuizzes.map(q => ({
          id: q.id || crypto.randomUUID(),
          active: !!q.active,
          title: q.title || '',
          content: q.content || '',
          imageUrl: q.imageUrl || '',
          questions: q.questions?.length ? q.questions : [],
        }))
      });
      setIsEditingFrequency(false);
    }
  }, [initialData, reset]);

  const saveSettings = async (values: FormValues) => {
    if (!firestore || readOnly) return false;
    try {
        const { dirtyFields } = form.formState;
        
        // Smartly preserve or bump timestamps based on actual data changes (deep comparison)
        
        // 1. Check Announcement
        const annRaw = { active: values.announcement?.active, title: values.announcement?.title, content: values.announcement?.content, imageUrl: values.announcement?.imageUrl, hasAckButton: values.announcement?.hasAckButton, frequency: values.announcement?.frequency };
        const oldAnnRaw = { active: initialData?.announcement?.active, title: initialData?.announcement?.title, content: initialData?.announcement?.content, imageUrl: initialData?.announcement?.imageUrl, hasAckButton: initialData?.announcement?.hasAckButton, frequency: initialData?.announcement?.frequency };
        
        const isAnnChanged = JSON.stringify(annRaw) !== JSON.stringify(oldAnnRaw);
        
        const announcementUpdate = values.announcement ? { 
            ...values.announcement, 
            updatedAt: isAnnChanged ? serverTimestamp() : (initialData?.announcement?.updatedAt || serverTimestamp()) 
        } : null;
        
        // 2. Check each Mandatory Quiz individually
        const quizzesUpdate = values.mandatoryQuizzes.map(q => {
            const oldQ = (initialData?.mandatoryQuizzes || []).find(oq => oq.id === q.id);
            if (!oldQ) {
                return { ...q, updatedAt: Timestamp.now() }; // New Quiz
            }
            
            const qRaw = { active: q.active, title: q.title, content: q.content, imageUrl: q.imageUrl, questions: q.questions };
            const oldQRaw = { active: oldQ.active, title: oldQ.title, content: oldQ.content, imageUrl: oldQ.imageUrl, questions: oldQ.questions };
            
            if (JSON.stringify(qRaw) !== JSON.stringify(oldQRaw)) {
                return { ...q, updatedAt: Timestamp.now() }; // Changed Quiz
            }
            
            return { ...q, updatedAt: oldQ.updatedAt || Timestamp.now() }; // Unchanged Quiz
        });

        const settingsRef = doc(firestore, 'settings', 'store');
        await setDoc(settingsRef, { ...values, announcement: announcementUpdate, mandatoryQuizzes: quizzesUpdate }, { merge: true });
        
        // Remove old mandatoryQuiz field if exists
        setDoc(settingsRef, { mandatoryQuiz: null }, { merge: true });
        
        clearGlobalCache('store-settings-data');
        onRefresh();
        
        toast({ title: "บันทึกการตั้งค่าแล้ว" });
        setIsEditingFrequency(false);
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

  const handleAnnouncementImage = async (e: ChangeEvent<HTMLInputElement>) => {
    if (readOnly) return;
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 1024) {
        toast({ variant: 'destructive', title: 'ไฟล์ใหญ่เกินไป', description: 'กรุณาใช้รูปภาพขนาดไม่เกิน 1MB' });
        return;
      }
      toast({ title: 'กำลังอัปโหลดรูปภาพ...', description: 'กรุณารอสักครู่' });
      try {
        const url = await uploadImage(file, 'settings');
        setValue('announcement.imageUrl', url, { shouldDirty: true });
        toast({ title: 'อัปโหลดสำเร็จ', description: 'อัปโหลดรูปภาพพร้อมใช้งานแล้ว' });
      } catch (error) {
        console.error("Upload error:", error);
        toast({ variant: 'destructive', title: 'อัปโหลดล้มเหลว', description: 'เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ' });
      }
    }
  };



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
          <Card className="border-primary/20 shadow-md">
            <CardHeader className="bg-primary/5 rounded-t-lg border-b border-primary/10">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2"><Megaphone className="h-5 w-5 text-primary" />ระบบแจ้งประกาศสำหรับลูกค้า</CardTitle>
                  <CardDescription>ตั้งค่าข้อความและรูปภาพที่จะแสดงให้เจ้าของสาขาเห็นเมื่อล็อกอิน</CardDescription>
                </div>
                <FormField name="announcement.active" control={form.control} render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormLabel className="text-sm font-bold">{field.value ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}</FormLabel>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={readOnly} /></FormControl>
                  </FormItem>
                )} />
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <FormField name="announcement.title" control={form.control} render={({ field }) => (
                    <FormItem><FormLabel>หัวข้อประกาศ</FormLabel><FormControl><Input placeholder="เช่น ประกาศปรับปรุงระบบ" {...field} disabled={readOnly} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField name="announcement.content" control={form.control} render={({ field }) => (
                    <FormItem><FormLabel>เนื้อหาประกาศ</FormLabel><FormControl><Textarea rows={6} placeholder="พิมพ์เนื้อหาประกาศที่นี่..." {...field} disabled={readOnly} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField name="announcement.frequency" control={form.control} render={({ field }) => (
                      <FormItem>
                        <FormLabel>ความถี่ในการแสดง</FormLabel>
                        {!isEditingFrequency ? (
                          <div className="flex items-center justify-between h-11 px-3 border rounded-md bg-muted/5 animate-in fade-in duration-300">
                            <Badge variant="outline" className="h-6 px-3 text-xs font-bold bg-white dark:bg-background">
                              {field.value === 'EVERY_LOGIN' ? 'แสดงทุกวัน' : 'แสดงครั้งเดียว'}
                            </Badge>
                            {!readOnly && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-primary transition-colors"
                                onClick={() => setIsEditingFrequency(true)}
                                title="คลิกเพื่อแก้ไขความถี่"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 animate-in slide-in-from-right-2 duration-300">
                            <div className="flex-1">
                              <Select 
                                onValueChange={field.onChange} 
                                value={field.value || 'ONLY_ONCE'} 
                                disabled={readOnly}
                              >
                                <FormControl>
                                  <SelectTrigger className="h-11 border-primary/50">
                                    <SelectValue placeholder="เลือกความถี่" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="ONLY_ONCE">แสดงครั้งเดียว</SelectItem>
                                  <SelectItem value="EVERY_LOGIN">แสดงทุกวัน</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-11 w-11 shrink-0"
                              onClick={() => setIsEditingFrequency(false)}
                              title="ยกเลิกการแก้ไข"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField name="announcement.hasAckButton" control={form.control} render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 space-y-0">
                        <div className="space-y-0.5"><FormLabel className="text-xs">ปุ่มรับทราบ</FormLabel></div>
                        <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={readOnly} /></FormControl>
                      </FormItem>
                    )} />
                  </div>
                </div>
                <div className="space-y-4">
                  <FormLabel>รูปภาพประกอบประกาศ</FormLabel>
                  {watch('announcement.imageUrl') ? (
                    <div className="relative aspect-video w-full overflow-hidden rounded-lg border bg-muted/20 flex items-center justify-center group">
                      <img src={watch('announcement.imageUrl')} alt="Announcement" className="h-full w-full object-contain" />
                      {!readOnly && (
                        <Button type="button" variant="destructive" size="icon" className="absolute top-2 right-2 h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg" onClick={() => { const removedUrl = watch('announcement.imageUrl'); setValue('announcement.imageUrl', '', { shouldDirty: true }); if (removedUrl) deleteImage(removedUrl); }}><X className="h-4 w-4" /></Button>
                      )}
                    </div>
                  ) : (
                    <label htmlFor="announcement-img" className={cn("flex aspect-video w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/5 transition-colors", readOnly ? "cursor-default" : "cursor-pointer hover:bg-muted/10")}>
                      <ImagePlus className="mb-2 h-10 w-10 text-muted-foreground opacity-40" />
                      <span className="text-sm font-medium text-muted-foreground">{readOnly ? 'ไม่มีรูปภาพ' : 'คลิกเพื่ออัปโหลดรูปภาพ'}</span>
                      {!readOnly && <Input id="announcement-img" type="file" accept="image/*" className="sr-only" onChange={handleAnnouncementImage} />}
                    </label>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-emerald-500/20 shadow-md">
            <CardHeader className="bg-emerald-50/50 dark:bg-emerald-950/10 rounded-t-lg border-b border-emerald-500/10">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="h-5 w-5" /> ระบบประกาศ/คำถามบังคับขั้นเด็ดขาด (Mandatory Quizzes)
                  </CardTitle>
                  <CardDescription>สร้างประกาศกี่เรื่องก็ได้ ลูกค้าจะต้องเปิดอ่านและตอบคำถามบังคับให้ครบทุกประกาศที่เปิดใช้งาน (เรียงตามลำดับ)</CardDescription>
                </div>
                {!readOnly && (
                  <Button
                    type="button"
                    onClick={() => appendQuiz({ id: crypto.randomUUID(), active: true, title: '', content: '', imageUrl: '', questions: [{ id: crypto.randomUUID(), question: '', options: ['', ''], correctOptionIndex: 0 }] })}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    <PlusCircle className="mr-2 h-4 w-4" /> สร้างประกาศใหม่
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              {quizzes.length === 0 ? (
                 <div className="p-8 text-center text-muted-foreground border-2 border-dashed border-emerald-200/50 bg-emerald-50/20 rounded-lg">ยังไม่มีประกาศบังคับ คลิก "สร้างประกาศใหม่" มุมขวาบนเพื่อเริ่มต้น</div>
              ) : (
                <Accordion type="multiple" className="w-full space-y-4">
                  {quizzes.map((quizField, quizIdx) => (
                    <AccordionItem key={quizField.id} value={quizField.id} className="border border-emerald-200 dark:border-emerald-800 rounded-lg overflow-hidden bg-card">
                      <div className="flex items-center justify-between pr-4 bg-emerald-50/30 dark:bg-emerald-950/20">
                        <AccordionTrigger className="flex-1 hover:no-underline px-4 py-4 data-[state=open]:border-b border-emerald-100">
                          <div className="flex items-center gap-3 w-full">
                            <span className="font-semibold text-emerald-800 dark:text-emerald-300">
                              {watch(`mandatoryQuizzes.${quizIdx}.title`) || 'ประกาศใหม่ (ยังไม่ระบุหัวข้อค่อยกรอก)'}
                            </span>
                            <div className="flex items-center gap-2 ml-4">
                              <Badge variant={watch(`mandatoryQuizzes.${quizIdx}.active`) ? "default" : "secondary"} className={watch(`mandatoryQuizzes.${quizIdx}.active`) ? "bg-emerald-500" : ""}>
                                {watch(`mandatoryQuizzes.${quizIdx}.active`) ? 'เปิดใช้งาน' : 'ปิดการใช้งาน'}
                              </Badge>
                              <Badge variant="outline" className="border-emerald-200">{(watch(`mandatoryQuizzes.${quizIdx}.questions`) || []).length} คำถาม</Badge>
                            </div>
                          </div>
                        </AccordionTrigger>
                        {!readOnly && (
                           <Button type="button" variant="ghost" size="icon" className="text-destructive shrink-0 z-10 hover:bg-destructive/10" onClick={(e) => { e.stopPropagation(); removeQuiz(quizIdx); }}>
                             <Trash2 className="h-4 w-4" />
                           </Button>
                        )}
                      </div>
                      <AccordionContent className="p-6">
                         <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                           <div className="space-y-6">
                              <div className="flex items-center justify-between mb-2">
                                 <h4 className="font-semibold text-lg text-emerald-800">ตั้งค่าเนื้อหาประกาศ</h4>
                                 <FormField name={`mandatoryQuizzes.${quizIdx}.active`} control={form.control} render={({ field }) => (
                                   <FormItem className="flex items-center gap-2 space-y-0">
                                     <FormLabel className="text-sm font-bold text-emerald-700">{field.value ? 'กำลังเปิดประกาศอยู่' : 'ปิดใช้งานอยู่'}</FormLabel>
                                     <FormControl><Switch className="data-[state=checked]:bg-emerald-600" checked={field.value} onCheckedChange={field.onChange} disabled={readOnly} /></FormControl>
                                   </FormItem>
                                 )} />
                              </div>

                              <FormField name={`mandatoryQuizzes.${quizIdx}.title`} control={form.control} render={({ field }) => (
                                <FormItem><FormLabel className="font-bold">หัวข้อประกาศสำคัญรหัส: <span className="text-muted-foreground font-normal text-xs">{quizField.id.slice(0, 8)}</span> *</FormLabel><FormControl><Input className="bg-white dark:bg-black/20" placeholder="เช่น กฎระเบียบใหม่" {...field} disabled={readOnly} /></FormControl><FormMessage /></FormItem>
                              )} />
                              <FormField name={`mandatoryQuizzes.${quizIdx}.content`} control={form.control} render={({ field }) => (
                                <FormItem><FormLabel>เนื้อหาบรรยาย (ใส่หรือไม่ใส่ก็ได้)</FormLabel><FormControl><Textarea className="bg-white dark:bg-black/20" rows={4} placeholder="พิมพ์อธิบายให้เข้าใจก่อนตอบคำถาม..." {...field} disabled={readOnly} /></FormControl><FormMessage /></FormItem>
                              )} />
                              
                              <div className="space-y-4">
                                <FormLabel>รูปภาพประกอบประกาศ</FormLabel>
                                {watch(`mandatoryQuizzes.${quizIdx}.imageUrl`) ? (
                                  <div className="relative aspect-video w-full overflow-hidden rounded-lg border bg-muted/20 flex items-center justify-center group">
                                    <img src={watch(`mandatoryQuizzes.${quizIdx}.imageUrl`)} alt="Quiz" className="h-full w-full object-contain" />
                                    {!readOnly && (
                                      <Button type="button" variant="destructive" size="icon" className="absolute top-2 right-2 h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg" onClick={() => { const removedUrl = watch(`mandatoryQuizzes.${quizIdx}.imageUrl`); setValue(`mandatoryQuizzes.${quizIdx}.imageUrl`, '', { shouldDirty: true }); if (removedUrl) deleteImage(removedUrl); }}><X className="h-4 w-4" /></Button>
                                    )}
                                  </div>
                                ) : (
                                  <label htmlFor={`mandatoryquiz-img-${quizIdx}`} className={cn("flex aspect-video w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-emerald-200 bg-emerald-50/50 hover:bg-emerald-100/50 transition-colors", readOnly ? "cursor-default" : "cursor-pointer")}>
                                    <ImagePlus className="mb-2 h-10 w-10 text-emerald-500 opacity-60" />
                                    <span className="text-sm font-medium text-emerald-700">{readOnly ? 'ไม่มีรูปภาพ' : 'คลิกเพื่ออัปโหลดรูปภาพ'}</span>
                                    {!readOnly && <Input id={`mandatoryquiz-img-${quizIdx}`} type="file" accept="image/*" className="sr-only" onChange={async (e) => {
                                          const file = e.target.files?.[0];
                                          if (!file) return;
                                          try {
                                            toast({ title: 'กำลังอัปโหลดรูประบบคำถามบังคับ...' });
                                            const url = await uploadImage(file, 'store-settings');
                                            setValue(`mandatoryQuizzes.${quizIdx}.imageUrl`, url, { shouldDirty: true });
                                            toast({ title: 'อัปโหลดรูปสำเร็จ' });
                                          } catch (error) {
                                            toast({ variant: 'destructive', title: 'อัปโหลดล้มเหลว' });
                                          }
                                    }} />}
                                  </label>
                                )}
                              </div>
                           </div>

                           <div className="space-y-6">
                             <h4 className="font-semibold text-lg text-emerald-800">จัดการคำถามชุดนี้</h4>
                             <div className="space-y-4">
                              {(watch(`mandatoryQuizzes.${quizIdx}.questions`) || []).map((qField: any, qIdx: number) => (
                                <div key={qField.id} className="p-4 border border-emerald-500/30 rounded-lg bg-emerald-50/30 dark:bg-emerald-950/20 shadow-inner relative group">
                                  {!readOnly && (
                                    <Button 
                                      type="button" 
                                      variant="destructive" 
                                      size="icon" 
                                      className="absolute -top-3 -right-3 h-8 w-8 rounded-full shadow-md z-10 opacity-0 md:opacity-100 group-hover:opacity-100 transition-opacity" 
                                      onClick={() => {
                                         const qs = [...(watch(`mandatoryQuizzes.${quizIdx}.questions`) || [])];
                                         qs.splice(qIdx, 1);
                                         setValue(`mandatoryQuizzes.${quizIdx}.questions`, qs, { shouldDirty: true, shouldValidate: true });
                                      }}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                  <div className="flex items-center gap-2 mb-4 pb-2 border-b border-emerald-200/50">
                                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500 text-white text-xs font-bold">{qIdx + 1}</span>
                                      <h4 className="font-semibold text-emerald-800 dark:text-emerald-300">คำถามข้อที่ {qIdx + 1}</h4>
                                  </div>
                                  
                                  <FormField name={`mandatoryQuizzes.${quizIdx}.questions.${qIdx}.question`} control={form.control} render={({ field }) => (
                                    <FormItem><FormLabel className="text-emerald-800 dark:text-emerald-300">โจทย์คำถาม *</FormLabel><FormControl><Input className="border-emerald-200 bg-white dark:bg-background" placeholder="ตั้งคำถามเพื่อทดสอบว่าอ่านเข้าใจหรือไม่..." {...field} disabled={readOnly} /></FormControl><FormMessage /></FormItem>
                                  )} />

                                  <div className="mt-4 space-y-3">
                                    <FormLabel>กำหนดตัวเลือก</FormLabel>
                                    {(watch(`mandatoryQuizzes.${quizIdx}.questions.${qIdx}.options`) || []).map((opt: string, optIdx: number) => (
                                      <div key={optIdx} className="flex gap-2 items-center">
                                        <span className="text-sm font-bold text-muted-foreground w-4">{optIdx + 1}.</span>
                                        <FormField name={`mandatoryQuizzes.${quizIdx}.questions.${qIdx}.options.${optIdx}`} control={form.control} render={({ field }) => (
                                          <FormItem className="flex-1 space-y-0"><FormControl><Input className="bg-white dark:bg-background h-9 text-sm" placeholder={`ตัวเลือกที่ ${optIdx + 1}`} {...field} disabled={readOnly} /></FormControl></FormItem>
                                        )} />
                                        {!readOnly && (watch(`mandatoryQuizzes.${quizIdx}.questions.${qIdx}.options`) || []).length > 2 && (
                                          <Button type="button" variant="ghost" size="icon" className="text-destructive h-8 w-8 shrink-0" onClick={() => {
                                              const opts = [...(watch(`mandatoryQuizzes.${quizIdx}.questions.${qIdx}.options`) || [])];
                                              opts.splice(optIdx, 1);
                                              form.setValue(`mandatoryQuizzes.${quizIdx}.questions.${qIdx}.options`, opts, { shouldDirty: true, shouldValidate: true });
                                              const correctIdx = watch(`mandatoryQuizzes.${quizIdx}.questions.${qIdx}.correctOptionIndex`) || 0;
                                              if (correctIdx >= opts.length) form.setValue(`mandatoryQuizzes.${quizIdx}.questions.${qIdx}.correctOptionIndex`, Math.max(0, opts.length - 1));
                                          }}><Trash2 className="h-4 w-4" /></Button>
                                        )}
                                      </div>
                                    ))}
                                    
                                    {(form.formState.errors.mandatoryQuizzes as any)?.[quizIdx]?.questions?.[qIdx]?.options?.root?.message && (
                                        <p className="text-sm font-medium text-destructive">{(form.formState.errors.mandatoryQuizzes as any)[quizIdx].questions[qIdx].options.root.message}</p>
                                    )}
                                    
                                    {!readOnly && (watch(`mandatoryQuizzes.${quizIdx}.questions.${qIdx}.options`) || []).length < 4 && (
                                      <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => {
                                        const opts = [...(watch(`mandatoryQuizzes.${quizIdx}.questions.${qIdx}.options`) || [])];
                                        opts.push('');
                                        form.setValue(`mandatoryQuizzes.${quizIdx}.questions.${qIdx}.options`, opts, { shouldDirty: true });
                                      }}><PlusCircle className="mr-2 h-3 w-3 text-emerald-600" /> เพิ่มตัวเลือก</Button>
                                    )}
                                  </div>

                                  <div className="mt-4">
                                    <FormField name={`mandatoryQuizzes.${quizIdx}.questions.${qIdx}.correctOptionIndex`} control={form.control} render={({ field }) => (
                                      <FormItem>
                                        <FormLabel className="text-emerald-700 dark:text-emerald-400">เลือกข้อที่ถูกต้อง (เฉลย) *</FormLabel>
                                        <Select onValueChange={(val) => field.onChange(parseInt(val))} value={field.value?.toString() || "0"} disabled={readOnly}>
                                          <FormControl>
                                            <SelectTrigger className="w-full h-10 bg-white dark:bg-background text-sm"><SelectValue placeholder="เลือกข้อถูก" /></SelectTrigger>
                                          </FormControl>
                                          <SelectContent>
                                            {(watch(`mandatoryQuizzes.${quizIdx}.questions.${qIdx}.options`) || []).map((opt: string, optIdx: number) => (
                                              <SelectItem key={optIdx} value={optIdx.toString()}>ข้อที่ {optIdx + 1}. {opt || '(ยังไม่ได้กำหนด)'}</SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                        <FormMessage />
                                      </FormItem>
                                    )} />
                                  </div>
                                </div>
                              ))}
                              
                              {!readOnly && (
                                <Button 
                                  type="button" 
                                  variant="outline" 
                                  className="w-full py-6 border-dashed border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                                  onClick={() => {
                                     const qs = [...(watch(`mandatoryQuizzes.${quizIdx}.questions`) || [])];
                                     qs.push({ id: crypto.randomUUID(), question: '', options: ['', ''], correctOptionIndex: 0 });
                                     setValue(`mandatoryQuizzes.${quizIdx}.questions`, qs, { shouldDirty: true });
                                  }}
                                >
                                  <PlusCircle className="mr-2 h-5 w-5" /> เพิ่มคำถามในชุดประกาศนี้
                                </Button>
                              )}
                              {(form.formState.errors.mandatoryQuizzes as any)?.[quizIdx]?.questions?.root?.message && (
                                  <p className="text-sm font-medium text-destructive text-center">{(form.formState.errors.mandatoryQuizzes as any)[quizIdx].questions.root.message}</p>
                              )}
                             </div>
                           </div>
                         </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
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
