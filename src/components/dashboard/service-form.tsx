'use client';

import { useForm, Controller, useWatch } from 'react-hook-form';
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
import { useState, useEffect, useRef, ChangeEvent, useMemo } from 'react';
import { Loader2, X, ImagePlus, Archive, Info, Percent, Pencil } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc, serverTimestamp, writeBatch, collection, setDoc, updateDoc, runTransaction, Firestore } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { Service, ServiceCategory, StoreSettings } from '@/lib/types';
import { getServiceCategories } from '@/app/actions';
import { UnsavedChangesDialog } from './unsaved-changes-dialog';
import { Label } from '../ui/label';
import { Separator } from '../ui/separator';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { clearGlobalCache } from '@/hooks/use-smart-fetch';
import { useUploadImage } from '@/firebase/storage/use-storage';

const numericStringSchema = z.preprocess(
  (val) => {
    if (val === '' || val === null || val === undefined) return undefined;
    const num = parseFloat(String(val).replace(/,/g, ''));
    return isNaN(num) ? val : num;
  },
  z.number({ required_error: 'กรุณากรอกราคา', invalid_type_error: 'กรุณากรอกตัวเลขที่ถูกต้อง' }).min(0, 'ราคาต้องไม่ติดลบ')
);

const formSchema = z.object({
  name: z.string().min(1, 'กรุณากรอกชื่อบริการ'),
  sku: z.string().optional(),
  description: z.string().optional(),
  price: numericStringSchema,
  categoryA: z.string().min(1, 'กรุณาเลือกหมวดหมู่หลัก'),
  categoryB: z.string().min(1, 'กรุณาเลือกหมวดหมู่ย่อย'),
  categoryC: z.string().min(1, 'กรุณาเลือกประเภทบริการ'),
  status: z.enum(['active', 'draft', 'archived']),
  imageUrls: z.array(z.string()).default([]),
  taxStatus: z.enum(['TAXABLE', 'EXEMPT']).default('TAXABLE'),
  taxMode: z.enum(['INCLUSIVE', 'EXCLUSIVE']).default('INCLUSIVE'),
  taxRate: z.coerce.number().min(0).default(7),
});

type FormValues = z.infer<typeof formSchema>;

async function generateServiceSku(firestore: Firestore, categoryC_Id: string, codes: { A: string, B: string, C: string }) {
    const categoryRef = doc(firestore, "serviceCategories", categoryC_Id);
    try {
      const newSequence = await runTransaction(firestore, async (transaction) => {
        const categoryDoc = await transaction.get(categoryRef);
        if (!categoryDoc.exists()) throw new Error("ไม่พบข้อมูลประเภทบริการสำหรับการเจนรหัส");
        const currentCount = categoryDoc.data().serviceCount || 0;
        const newCount = currentCount + 1;
        transaction.update(categoryRef, { serviceCount: newCount });
        return newCount;
      });
      const sequenceString = newSequence.toString().padStart(3, '0');
      return `SRV-${codes.A}${codes.B}${codes.C}-${sequenceString}`;
    } catch (e) {
      console.error("Service SKU generation failed: ", e);
      throw e;
    }
}

const getStatusText = (status: Service['status']) => {
  switch (status) {
    case 'active': return 'เผยแพร่';
    case 'draft': return 'ฉบับร่าง';
    case 'archived': return 'จัดเก็บ';
    default: return status;
  }
};

const getStatusVariant = (status: Service['status']): "success" | "outline" | "destructive" | "default" => {
  switch (status) {
    case 'active': return 'success';
    case 'draft': return 'outline';
    case 'archived': return 'destructive';
    default: return 'default';
  }
};

export function ServiceForm({ initialData, readOnly }: { initialData?: Service, readOnly?: boolean }) {
  const { toast } = useToast();
  const router = useRouter();
  const firestore = useFirestore();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [isLoadingCats, setIsLoadingCats] = useState(true);
  const isEditMode = !!initialData;
  const initializedRef = useRef(false);

  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [nextPath, setNextPath] = useState<string | null>(null);
  const [isEditingStatus, setIsEditingStatus] = useState(false);

  const settingsRef = useMemoFirebase(() => firestore ? doc(firestore, 'settings', 'store') : null, [firestore]);
  const { data: storeSettings } = useDoc<StoreSettings>(settingsRef);
  const defaultTaxRate = storeSettings?.defaultTaxRate ?? 7;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '', sku: '', description: '', price: undefined, categoryA: '', categoryB: '', categoryC: '', status: 'active', imageUrls: [],
      taxStatus: 'TAXABLE', taxMode: 'INCLUSIVE', taxRate: defaultTaxRate,
    },
  });

  const { formState: { isDirty }, setValue, control, reset, watch } = form;
  const taxStatusValue = watch('taxStatus');
  const catAValue = watch('categoryA');
  const catBValue = watch('categoryB');
  const { uploadImage, deleteImage } = useUploadImage();

  const handleImageUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const f=e.target.files; 
    if(f){
        toast({ title: 'กำลังอัปโหลด...', description: 'กรุณารอสักครู่' });
        try {
            const newUrls = await Promise.all(Array.from(f).map(file => uploadImage(file, 'services')));
            setValue('imageUrls', [...(watch('imageUrls') || []), ...newUrls], {shouldDirty:true});
            toast({ title: 'อัปโหลดสำเร็จ' });
        } catch (error) {
            toast({ variant: 'destructive', title: 'ผิดพลาด', description: 'อัปโหลดรูปไม่สำเร็จ' });
        }
    }
  };

  const parentA = useMemo(() => categories.find(p => p.code === catAValue && p.level === 'A'), [categories, catAValue]);
  const parentB = useMemo(() => categories.find(p => p.code === catBValue && p.level === 'B' && p.parentId === parentA?.id), [categories, catBValue, parentA]);

  useEffect(() => {
    const fetchCats = async () => {
      try { const data = await getServiceCategories(); setCategories(data); }
      catch (e) { console.error(e); }
      finally { setIsLoadingCats(false); }
    };
    fetchCats();
  }, []);

  useEffect(() => {
    if (initialData && !initializedRef.current) {
      reset({
        ...initialData,
        description: initialData.description || '',
        taxRate: initialData.taxRate ?? defaultTaxRate,
        taxStatus: initialData.taxStatus || 'TAXABLE',
        taxMode: initialData.taxMode || 'INCLUSIVE',
      });
      initializedRef.current = true;
    }
  }, [initialData, reset, defaultTaxRate]);

  const saveService = async (values: FormValues) => {
    if (!user || !firestore || readOnly) return false;
    
    const pA = categories.find(p => p.code === values.categoryA && p.level === 'A');
    const pB = categories.find(p => p.code === values.categoryB && p.level === 'B' && p.parentId === pA?.id);
    const categoryCObj = categories.find(c => c.code === values.categoryC && c.level === 'C' && c.parentId === pB?.id);
    
    if (!categoryCObj) {
        toast({ variant: 'destructive', title: 'ข้อผิดพลาด', description: 'กรุณาเลือกหมวดหมู่บริการให้ครบถ้วน' });
        return false;
    }

    try {
      let data: any = { ...values, category: categoryCObj.name, sellerId: user.id, updatedAt: serverTimestamp() };
      if (isEditMode) {
        await updateDoc(doc(firestore, 'services', initialData!.id), data);
      } else {
        const sku = await generateServiceSku(firestore, categoryCObj.id, { A: values.categoryA, B: values.categoryB, C: values.categoryC });
        const newRef = doc(collection(firestore, 'services'));
        await setDoc(newRef, { ...data, id: newRef.id, sku, createdAt: serverTimestamp() });
      }
      
      clearGlobalCache('services-data');
      
      toast({ title: 'บันทึกบริการสำเร็จ' });
      return true;
    } catch (e: any) { toast({ variant: 'destructive', title: 'ล้มเหลว', description: e.message }); return false; }
  };

  const onSubmit = async (values: FormValues) => {
    if (readOnly) return;
    setIsSubmitting(true);
    if (await saveService(values)) router.push('/dashboard/services');
    setIsSubmitting(false);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader><CardTitle>รายละเอียดบริการ</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <FormField name="name" control={control} render={({ field }) => (<FormItem><FormLabel>ชื่อบริการ *</FormLabel><FormControl><Input {...field} disabled={readOnly} /></FormControl><FormMessage /></FormItem>)} />
                <FormField name="description" control={control} render={({ field }) => (<FormItem><FormLabel>รายละเอียด</FormLabel><FormControl><Textarea rows={4} {...field} disabled={readOnly} /></FormControl><FormMessage /></FormItem>)} />
                <Separator />
                <div>
                  <FormLabel className="mb-2 block">รูปภาพ</FormLabel>
                  <div className="grid grid-cols-4 gap-4">
                    {watch('imageUrls')?.map((url, i) => (
                      <div key={i} className="relative aspect-square rounded-md border overflow-hidden"><img src={url} className="h-full w-full object-cover" alt="Service" />{!readOnly && <Button type="button" variant="destructive" size="icon" className="absolute top-1 right-1 h-6 w-6" onClick={() => { const removedUrl = url; setValue('imageUrls', watch('imageUrls').filter((_, idx) => idx !== i), { shouldDirty: true }); if (removedUrl) deleteImage(removedUrl); }}><X className="h-4 w-4" /></Button>}</div>
                    ))}
                    {!readOnly && (
                      <Label htmlFor="img-up" className="aspect-square flex flex-col items-center justify-center border-2 border-dashed rounded-md cursor-pointer hover:bg-accent/50"><ImagePlus className="h-8 w-8 text-muted-foreground" /><Input id="img-up" type="file" multiple accept="image/*" className="hidden" onChange={handleImageUpload}/></Label>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Percent className="h-5 w-5 text-primary" /> การตั้งค่าภาษี (VAT)</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <FormField name="taxStatus" control={control} render={({ field }) => (
                        <FormItem>
                            <FormLabel>สถานะภาษี *</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value} disabled={readOnly}>
                                <FormControl><SelectTrigger><SelectValue placeholder="เลือก" /></SelectTrigger></FormControl>
                                <SelectContent><SelectItem value="TAXABLE">เสียภาษี</SelectItem><SelectItem value="EXEMPT">ยกเว้นภาษี</SelectItem></SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )} />
                    <FormField name="taxMode" control={control} render={({ field }) => (
                        <FormItem>
                            <FormLabel className={cn((taxStatusValue === 'EXEMPT' || readOnly) && "opacity-50")}>รูปแบบการคิดภาษี</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value} disabled={taxStatusValue === 'EXEMPT' || readOnly}>
                                <FormControl><SelectTrigger><SelectValue placeholder="เลือกรูปแบบ" /></SelectTrigger></FormControl>
                                <SelectContent><SelectItem value="INCLUSIVE">รวมภาษีแล้ว</SelectItem><SelectItem value="EXCLUSIVE">ยังไม่รวมภาษี</SelectItem></SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )} />
                    <FormField name="taxRate" control={control} render={({ field }) => (
                        <FormItem>
                            <FormLabel className={cn((taxStatusValue === 'EXEMPT' || readOnly) && "opacity-50")}>อัตราภาษี (%)</FormLabel>
                            <FormControl><Input type="text" inputMode="decimal" {...field} disabled={taxStatusValue === 'EXEMPT' || readOnly} onChange={(e) => field.onChange(e.target.value.replace(/[^0-9.]/g, '').replace(/^0+(?=\d)/, ''))}/></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                </CardContent>
            </Card>
          </div>
          <div className="space-y-6">
            <Card><CardHeader><CardTitle>การตั้งค่าและราคา</CardTitle></CardHeader><CardContent className="space-y-4">
                <FormField name="status" control={control} render={({ field }) => (
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
                            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
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
                )} />
                <FormField name="price" control={control} render={({ field }) => (<FormItem><FormLabel>ราคาค่าบริการ *</FormLabel><FormControl><Input type="text" inputMode="decimal" {...field} value={field.value === undefined ? '' : field.value} onChange={e => field.onChange(e.target.value.replace(/[^0-9.]/g, '').replace(/^0+(?=\d)/, ''))} disabled={readOnly} /></FormControl><FormMessage /></FormItem>)} />
                <FormField name="sku" control={control} render={({ field }) => (
                    <FormItem><FormLabel>รหัสบริการ (SKU)</FormLabel><FormControl><Input {...field} readOnly placeholder={isEditMode ? '' : '(สร้างอัตโนมัติเมื่อบันทึก)'} className="bg-muted/50 font-mono" /></FormControl><FormMessage /></FormItem>
                )} />
            </CardContent></Card>
            <Card><CardHeader><CardTitle>หมวดหมู่บริการ</CardTitle></CardHeader><CardContent className="space-y-4">
                <FormField name="categoryA" control={control} render={({ field }) => (<FormItem><FormLabel>หมวดหมู่หลัก *</FormLabel><Select onValueChange={v => { field.onChange(v); setValue('categoryB', ''); setValue('categoryC', ''); }} value={field.value} disabled={isLoadingCats || isEditMode || readOnly}><FormControl><SelectTrigger><SelectValue placeholder="เลือก" /></SelectTrigger></FormControl><SelectContent>{categories.filter(c => c.level === 'A').map(c => <SelectItem key={c.id} value={c.code}>{c.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
                <FormField name="categoryB" control={control} render={({ field }) => (<FormItem><FormLabel>หมวดหมู่ย่อย *</FormLabel><Select onValueChange={v => { field.onChange(v); setValue('categoryC', ''); }} value={field.value} disabled={!catAValue || isLoadingCats || isEditMode || readOnly}><FormControl><SelectTrigger><SelectValue placeholder="เลือก" /></SelectTrigger></FormControl><SelectContent>{categories.filter(c => c.level === 'B' && c.parentId === parentA?.id).map(c => <SelectItem key={c.id} value={c.code}>{c.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
                <FormField name="categoryC" control={control} render={({ field }) => (<FormItem><FormLabel>ประเภท *</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={!catBValue || isLoadingCats || isEditMode || readOnly}><FormControl><SelectTrigger><SelectValue placeholder="เลือก" /></SelectTrigger></FormControl><SelectContent>{categories.filter(c => c.level === 'C' && c.parentId === parentB?.id).map(c => <SelectItem key={c.id} value={c.code}>{c.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
                {isEditMode && <p className="text-[10px] text-muted-foreground italic">*ไม่สามารถแก้ไขหมวดหมู่ได้หลังสร้างบริการแล้ว</p>}
            </CardContent></Card>
          </div>
        </div>
        <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.back()}>{readOnly ? 'กลับไปที่รายการ' : 'ยกเลิก'}</Button>
            {!readOnly && <Button type="submit" disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} บันทึกบริการ</Button>}
        </div>
      </form>
      <UnsavedChangesDialog isOpen={showUnsavedDialog} onOpenChange={setShowUnsavedDialog} onSaveAndExit={async () => { if (await saveService(form.getValues()) && nextPath) router.push(nextPath); }} onDiscardAndExit={() => nextPath && router.push(nextPath)} isSaving={isSubmitting} />
    </Form>
  );
}
