
'use client';

import { useForm } from 'react-hook-form';
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
import { useToast } from '@/hooks/use-toast';
import { collection, serverTimestamp, doc, runTransaction, setDoc, updateDoc } from 'firebase/firestore';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useFirestore } from '@/firebase';
import { Supplier } from '@/lib/types';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { 
  Loader2, 
  Building2, 
  User, 
  Phone, 
  MapPin, 
  Archive,
  Mail,
  X,
  Briefcase,
  Globe,
  Printer,
  ChevronDown,
  ChevronUp,
  RotateCw,
  AlertCircle
} from 'lucide-react';
import { CustomDialog } from './custom-dialog';
import { useAuth } from '@/hooks/use-auth';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { CountryCombobox } from './country-combobox';
import { ProvinceCombobox } from './province-combobox';
import { clearGlobalCache } from '@/hooks/use-smart-fetch';

const formSchema = z.object({
  name: z.string().optional().default(''),
  isThaiRegistration: z.boolean().default(true),
  taxId: z.string().refine(val => val.replace(/\s/g, '').length === 13, {
    message: 'กรุณากรอกเลขทะเบียนให้ครบ 13 หลัก'
  }),
  branchType: z.enum(['HEAD', 'BRANCH', 'NONE']).default('HEAD'),
  entityType: z.enum(['JURISTIC', 'INDIVIDUAL']).default('JURISTIC'),
  juristicType: z.string().optional(),
  individualType: z.string().optional(),
  individualPrefix: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  contactName: z.string().optional(),
  contactEmail: z.string().email('อีเมลไม่ถูกต้อง').optional().or(z.literal('')),
  contactPhone: z.string().optional(),
  website: z.string().optional(),
  fax: z.string().optional(),
  address: z.string().optional(),
  subdistrict: z.string().optional(),
  district: z.string().optional(),
  province: z.string().optional(),
  country: z.string().optional(),
  postalCode: z.string().optional(),
  status: z.enum(['active', 'archived']).default('active'),
  
  contactPrefix: z.string().optional(),
  contactFirstName: z.string().optional(),
  contactLastName: z.string().optional(),
  contactNickname: z.string().optional(),
  contactPosition: z.string().optional(),
  contactPersonPhone: z.string().optional(),
  contactPersonEmail: z.string().email('อีเมลไม่ถูกต้อง').optional().or(z.literal('')),
}).superRefine((data, ctx) => {
  if (data.entityType === 'INDIVIDUAL' && data.individualType === 'บุคคลธรรมดา') {
    if (!data.firstName || data.firstName.trim() === '') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "กรุณาระบุชื่อจริง", path: ["firstName"] });
    }
  }
  if (data.entityType === 'JURISTIC' || (data.entityType === 'INDIVIDUAL' && data.individualType !== 'บุคคลธรรมดา')) {
    if (!data.name || data.name.trim() === '') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "กรุณากรอกชื่อกิจการ", path: ["name"] });
    }
  }
});

type FormValues = z.infer<typeof formSchema>;

const getJuristicAffix = (type: string) => {
  switch (type) {
    case 'บริษัทจำกัด': return { prefix: 'บริษัท', suffix: 'จำกัด' };
    case 'ห้างหุ้นส่วนจำกัด': return { prefix: 'ห้างหุ้นส่วนจำกัด', suffix: '' };
    case 'บริษัทมหาชนจำกัด': return { prefix: 'บริษัท', suffix: 'จำกัด (มหาชน)' };
    default: return { prefix: '', suffix: '' };
  }
};

const getIndividualPrefix = (type: string) => {
  switch (type) {
    case 'ห้างหุ้นส่วนสามัญ': return 'ห้างหุ้นส่วนสามัญ';
    case 'คณะบุคคล': return 'คณะบุคคล';
    case 'ร้านค้า': return 'ร้านค้า';
    default: return '';
  }
}

export function SupplierForm({ initialData, onSuccess, onCancel }: { initialData?: Supplier; onSuccess?: () => void; onCancel?: () => void; }) {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user: currentUser } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
  const [isRestoreDialogOpen, setIsRestoreDialogOpen] = useState(false);
  const isEditMode = !!initialData;
  const initializedRef = useRef(false);

  const [expandedSections, setExpandedSections] = useState({ address: true, mainContact: true, person: true });

  const hasSupplierPermission = useMemo(() => {
    if (!currentUser) return false;
    if (currentUser.role === 'super_admin') return true;
    const perms = currentUser.permissions || [];
    return currentUser.role === 'admin' && (perms.includes('suppliers:manage') || perms.includes('manage_suppliers'));
  }, [currentUser]);

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '', isThaiRegistration: true, taxId: '', branchType: 'HEAD', entityType: 'JURISTIC', juristicType: 'บริษัทจำกัด', individualType: 'บุคคลธรรมดา', individualPrefix: 'นาย',
      firstName: '', lastName: '', contactName: '', contactEmail: '', contactPhone: '', website: '', fax: '', address: '', subdistrict: '', district: '', province: '', country: '', postalCode: '',
      status: 'active', contactPrefix: 'ไม่มี', contactFirstName: '', contactLastName: '', contactNickname: '', contactPosition: '', contactPersonPhone: '', contactPersonEmail: '',
    },
  });

  const { watch, setValue, reset } = form;
  const entityType = watch('entityType');
  const juristicType = watch('juristicType');
  const indType = watch('individualType');
  const nameValue = watch('name') || '';
  const firstNameValue = watch('firstName') || '';
  const lastNameValue = watch('lastName') || '';
  const jurAffixes = useMemo(() => getJuristicAffix(juristicType || ''), [juristicType]);
  const indPrefixText = useMemo(() => getIndividualPrefix(indType || ''), [indType]);

  useEffect(() => {
    if (initialData && !initializedRef.current) {
      const isInd = initialData.entityType === 'INDIVIDUAL';
      let coreName = initialData.name || '';
      if (initialData.entityType === 'JURISTIC') {
        const aff = getJuristicAffix(initialData.juristicType || '');
        if (aff.prefix && coreName.startsWith(aff.prefix)) coreName = coreName.substring(aff.prefix.length).trim();
        if (aff.suffix && coreName.endsWith(aff.suffix)) coreName = coreName.substring(0, coreName.length - aff.suffix.length).trim();
      } else if (isInd && initialData.individualType !== 'บุคคลธรรมดา') {
        const pref = getIndividualPrefix(initialData.individualType || '');
        if (pref && coreName.startsWith(pref)) coreName = coreName.substring(pref.length).trim();
      } else if (isInd && initialData.individualType === 'บุคคลธรรมดา') coreName = '';

      reset({
        ...initialData, name: coreName, isThaiRegistration: initialData.isThaiRegistration ?? true, taxId: (initialData.taxId || '').padEnd(13, ' '),
        branchType: initialData.branchType || 'HEAD', entityType: initialData.entityType || 'JURISTIC', juristicType: initialData.juristicType || 'บริษัทจำกัด',
        individualType: initialData.individualType || 'บุคคลธรรมดา', individualPrefix: initialData.individualPrefix || 'นาย', firstName: initialData.firstName || '', lastName: initialData.lastName || '',
        contactEmail: initialData.contactEmail || '', status: initialData.status || 'active', country: initialData.country || '',
      });
      initializedRef.current = true;
    }
  }, [initialData, reset]);

  const taxIdPartsRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];
  const handleTaxIdChange = (index: number, value: string) => {
    const numericValue = value.replace(/[^0-9]/g, '');
    let currentTaxId = (form.getValues('taxId') || '').padEnd(13, ' ');
    const positions = [[0, 1], [1, 5], [5, 10], [10, 13]];
    const [start, end] = positions[index];
    const maxLength = end - start;
    const slice = numericValue.substring(0, maxLength).padEnd(maxLength, ' ');
    const newTaxId = currentTaxId.substring(0, start) + slice + currentTaxId.substring(end);
    form.setValue('taxId', newTaxId, { shouldDirty: true, shouldValidate: true });
    if (numericValue.length === maxLength && index < 3) taxIdPartsRefs[index + 1].current?.focus();
  };
  const getPartValue = (index: number) => {
    const taxId = form.watch('taxId') || '';
    const positions = [[0, 1], [1, 5], [5, 10], [10, 13]];
    return taxId.substring(positions[index][0], positions[index][1]).trim();
  };

  const handleArchive = async () => {
    if (!isEditMode || !initialData || !firestore) return;
    setIsSubmitting(true);
    try {
      await updateDoc(doc(firestore, 'suppliers', initialData.id), { status: 'archived', updatedAt: serverTimestamp() });
      clearGlobalCache('suppliers-data');
      toast({ title: 'ย้ายไปจัดเก็บแล้ว' });
      setIsArchiveDialogOpen(false);
      onSuccess?.();
    } catch (error: any) { toast({ variant: "destructive", title: "เกิดข้อผิดพลาด" }); }
    finally { setIsSubmitting(false); }
  };

  const handleRestore = async () => {
    if (!isEditMode || !initialData || !firestore) return;
    setIsSubmitting(true);
    try {
      await updateDoc(doc(firestore, 'suppliers', initialData.id), { status: 'active', updatedAt: serverTimestamp() });
      clearGlobalCache('suppliers-data');
      toast({ title: 'กู้คืนสำเร็จ', description: `แหล่งจัดซื้อ "${initialData.name}" กลับมาใช้งานได้ปกติแล้ว` });
      setIsRestoreDialogOpen(false);
      onSuccess?.();
    } catch (error: any) { toast({ variant: "destructive", title: "เกิดข้อผิดพลาด", description: error.message }); }
    finally { setIsSubmitting(false); }
  };

  const saveSupplier = async (values: FormValues) => {
    if (!firestore || !hasSupplierPermission) return;
    setIsSubmitting(true);
    
    let fullName = values.name || '';
    if (values.entityType === 'JURISTIC') {
      const aff = getJuristicAffix(values.juristicType || '');
      fullName = `${aff.prefix} ${values.name} ${aff.suffix}`.trim().replace(/\s+/g, ' ');
    } else if (values.entityType === 'INDIVIDUAL') {
      if (values.individualType === 'บุคคลธรรมดา') fullName = `${values.individualPrefix || ''}${values.firstName} ${values.lastName || ''}`.trim().replace(/\s+/g, ' ');
      else fullName = `${getIndividualPrefix(values.individualType || '')} ${values.name}`.trim().replace(/\s+/g, ' ');
    }
    
    const cleanTaxId = values.taxId.replace(/\s/g, '');
    
    const finalValues = { ...values };
    if (values.entityType === 'JURISTIC') {
      finalValues.individualType = '';
      finalValues.individualPrefix = '';
      finalValues.firstName = '';
      finalValues.lastName = '';
    } else if (values.entityType === 'INDIVIDUAL') {
      finalValues.juristicType = '';
      if (values.individualType === 'บุคคลธรรมดา') {
        finalValues.name = '';
      } else {
        finalValues.firstName = '';
        finalValues.lastName = '';
        finalValues.individualPrefix = '';
      }
    }

    try {
      const supplierData = { 
        ...finalValues, 
        name: fullName, 
        taxId: cleanTaxId, 
        updatedAt: serverTimestamp() 
      };

      if (isEditMode) await updateDoc(doc(firestore, 'suppliers', initialData!.id), supplierData);
      else {
        const counterRef = doc(firestore, 'counters', 'supplierCounter');
        const newCode = await runTransaction(firestore, async (transaction) => {
          const counterDoc = await transaction.get(counterRef);
          const newCount = (counterDoc.exists() ? counterDoc.data().count : 0) + 1;
          transaction.set(counterRef, { count: newCount }, { merge: true });
          return `SUP-${String(newCount).padStart(4, '0')}`;
        });
        const newDocRef = doc(collection(firestore, 'suppliers'));
        await setDoc(newDocRef, { ...supplierData, id: newDocRef.id, code: newCode, createdAt: serverTimestamp() });
      }
      clearGlobalCache('suppliers-data');
      toast({ title: 'บันทึกสำเร็จ' });
      onSuccess?.();
    } catch (error: any) { toast({ variant: 'destructive', title: 'ผิดพลาด', description: error.message }); }
    finally { setIsSubmitting(false); }
  };

  // Enforcement check
  const isReadOnly = initialData?.status === 'archived' || !hasSupplierPermission;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(saveSupplier)} className="space-y-8">
        {!hasSupplierPermission && (
          <Alert variant="default" className="bg-amber-50 border-amber-200 text-amber-900 border-l-4 border-l-amber-500 shadow-sm">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertTitle className="font-bold">โหมดอ่านอย่างเดียว</AlertTitle>
            <AlertDescription className="text-xs">คุณไม่มีสิทธิ์ในการแก้ไขหรือจัดการข้อมูลแหล่งจัดซื้อ กรุณาติดต่อ Super Admin เพื่อขอสิทธิ์จัดการ</AlertDescription>
          </Alert>
        )}

        <section className="space-y-6">
          <div className="flex items-center gap-2 pb-2 border-b">
            <Building2 className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-bold font-headline">ข้อมูลกิจการ</h2>
          </div>
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <Label className="text-sm font-medium w-32 flex items-center gap-1"><span>เลขทะเบียน 13 หลัก</span><span className="text-destructive font-bold">*</span></Label>
              <FormField control={form.control} name="isThaiRegistration" render={({ field }) => (
                <RadioGroup onValueChange={(val) => field.onChange(val === 'thai')} value={field.value ? 'thai' : 'other'} className="flex gap-6" disabled={isReadOnly}>
                  <div className="flex items-center space-x-2"><RadioGroupItem value="thai" id="reg-thai" /><Label htmlFor="reg-thai" className="cursor-pointer">ไทย</Label></div>
                  <div className="flex items-center space-x-2"><RadioGroupItem value="other" id="reg-other" /><Label htmlFor="reg-other" className="cursor-pointer">ประเทศอื่น</Label></div>
                </RadioGroup>
              )} />
            </div>
            <div className="flex flex-wrap items-center gap-2 pl-0 sm:pl-36">
              {[1, 4, 5, 3].map((len, i) => (
                <Input key={i} ref={taxIdPartsRefs[i]} className={cn("h-12 text-center text-lg font-mono tracking-widest p-0 bg-white", i === 0 ? "w-10" : i === 1 ? "w-20" : i === 2 ? "w-24" : "w-16")} maxLength={len} value={getPartValue(i)} onChange={(e) => handleTaxIdChange(i, e.target.value)} disabled={isReadOnly} />
              ))}
            </div>
            <FormField name="taxId" control={form.control} render={() => <FormMessage className="sm:pl-36" />} />
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="w-32" />
            <FormField control={form.control} name="branchType" render={({ field }) => (
              <RadioGroup onValueChange={field.onChange} value={field.value} className="flex gap-6" disabled={isReadOnly}>
                <div className="flex items-center space-x-2"><RadioGroupItem value="HEAD" id="br-head" /><Label htmlFor="br-head" className="cursor-pointer">สำนักงานใหญ่</Label></div>
                <div className="flex items-center space-x-2"><RadioGroupItem value="BRANCH" id="br-sub" /><Label htmlFor="br-sub" className="cursor-pointer">สาขา</Label></div>
                <div className="flex items-center space-x-2"><RadioGroupItem value="NONE" id="br-none" /><Label htmlFor="br-none" className="cursor-pointer">ไม่ระบุ</Label></div>
              </RadioGroup>
            )} />
          </div>
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <Label className="text-sm font-medium w-32">ชื่อกิจการ</Label>
              <FormField control={form.control} name="entityType" render={({ field }) => (
                <RadioGroup onValueChange={(val) => { 
                  field.onChange(val); 
                  if (val === 'JURISTIC') setValue('branchType', 'HEAD'); 
                  else setValue('branchType', 'NONE'); 
                }} value={field.value} className="flex gap-6" disabled={isReadOnly}>
                  <div className="flex items-center space-x-2"><RadioGroupItem value="JURISTIC" id="ent-jur" /><Label htmlFor="ent-jur" className="cursor-pointer">นิติบุคคล</Label></div>
                  <div className="flex items-center space-x-2"><RadioGroupItem value="INDIVIDUAL" id="ent-ind" /><Label htmlFor="ent-ind" className="cursor-pointer">บุคคลธรรมดา</Label></div>
                </RadioGroup>
              )} />
            </div>
            {entityType === 'JURISTIC' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:pl-36 animate-in slide-in-from-left-2">
                <FormField name="juristicType" control={form.control} render={({ field }) => (
                  <FormItem className="relative border rounded-md h-14 px-3 pt-1.5 bg-white space-y-0 focus-within:ring-2 focus-within:ring-primary/20">
                    <div className="flex items-center gap-1 leading-tight"><span className="text-[11px] font-bold text-blue-600 uppercase">ประเภทนิติบุคคล</span><span className="text-destructive font-bold text-[11px]">*</span></div>
                    <FormControl><Select onValueChange={field.onChange} value={field.value} disabled={isReadOnly}><SelectTrigger className="h-8 border-none p-0 focus:ring-0 shadow-none bg-transparent"><SelectValue placeholder="เลือกประเภท" /></SelectTrigger><SelectContent><SelectItem value="บริษัทจำกัด">บริษัทจำกัด</SelectItem><SelectItem value="ห้างหุ้นส่วนจำกัด">ห้างหุ้นส่วนจำกัด</SelectItem><SelectItem value="บริษัทมหาชนจำกัด">บริษัทมหาชนจำกัด</SelectItem><SelectItem value="องค์กร">องค์กร</SelectItem></SelectContent></Select></FormControl>
                  </FormItem>
                )} />
                <FormField name="name" control={form.control} render={({ field }) => (
                  <FormItem className="relative border rounded-md h-14 px-3 pt-1.5 bg-white space-y-0 focus-within:ring-2 focus-within:ring-primary/20">
                    <div className="flex justify-between items-center leading-tight"><div className="flex items-center gap-1"><span className="text-[11px] font-bold text-blue-600 uppercase">ชื่อกิจการ</span><span className="text-destructive font-bold text-[11px]">*</span></div><span className="text-[10px] text-muted-foreground font-mono">{(nameValue || '').length}/95</span></div>
                    <FormControl><div className="flex items-center gap-1.5 h-8">{jurAffixes.prefix && <span className="text-sm font-bold text-blue-600 shrink-0">{jurAffixes.prefix}</span>}<Input placeholder="กรอกชื่อกิจการ" className="h-full border-none p-0 focus-visible:ring-0 text-sm bg-transparent shadow-none" maxLength={95} {...field} disabled={isReadOnly} />{jurAffixes.suffix && <span className="text-sm font-bold text-muted-foreground shrink-0">{jurAffixes.suffix}</span>}</div></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            ) : (
              <div className="space-y-4 sm:pl-36 animate-in slide-in-from-left-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField name="individualType" control={form.control} render={({ field }) => (
                    <FormItem className="relative border rounded-md h-14 px-3 pt-1.5 bg-white space-y-0 focus-within:ring-2 focus-within:ring-primary/20">
                      <div className="flex items-center gap-1 leading-tight"><span className="text-[11px] font-bold text-blue-600 uppercase">ประเภทบุคคล</span><span className="text-destructive font-bold text-[11px]">*</span></div>
                      <FormControl><Select onValueChange={field.onChange} value={field.value} disabled={isReadOnly}><SelectTrigger className="h-8 border-none p-0 focus:ring-0 shadow-none bg-transparent"><SelectValue placeholder="เลือกประเภท" /></SelectTrigger><SelectContent><SelectItem value="บุคคลธรรมดา">บุคคลธรรมดา</SelectItem><SelectItem value="คณะบุคคล">คณะบุคคล</SelectItem><SelectItem value="ห้างหุ้นส่วนสามัญ">ห้างหุ้นส่วนสามัญ</SelectItem><SelectItem value="ร้านค้า">ร้านค้า</SelectItem></SelectContent></Select></FormControl>
                    </FormItem>
                  )} />
                  {indType === 'บุคคลธรรมดา' ? (
                    <FormField name="individualPrefix" control={form.control} render={({ field }) => (
                      <FormItem className="relative border rounded-md h-14 px-3 pt-1.5 bg-white space-y-0 focus-within:ring-2 focus-within:ring-primary/20">
                        <div className="flex items-center gap-1 leading-tight"><span className="text-[11px] font-bold text-blue-600 uppercase">คำนำหน้า</span></div>
                        <FormControl>
                          <Select onValueChange={field.onChange} value={field.value} disabled={isReadOnly}>
                            <SelectTrigger className="h-8 border-none p-0 focus:ring-0 shadow-none bg-transparent">
                              <SelectValue placeholder="คำนำหน้า" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="นาย">นาย</SelectItem>
                              <SelectItem value="นาง">นาง</SelectItem>
                              <SelectItem value="นางสาว">นางสาว</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormControl>
                      </FormItem>
                    )} />
                  ) : (
                    <FormField name="name" control={form.control} render={({ field }) => (
                      <FormItem className="relative border rounded-md h-14 px-3 pt-1.5 bg-white space-y-0 focus-within:ring-2 focus-within:ring-primary/20">
                        <div className="flex justify-between items-center leading-tight"><div className="flex items-center gap-1"><span className="text-[11px] font-bold text-blue-600 uppercase">ชื่อกิจการ</span><span className="text-destructive font-bold text-[11px]">*</span></div><span className="text-[10px] text-muted-foreground font-mono">{(nameValue || '').length}/95</span></div>
                        <FormControl><div className="flex items-center gap-1.5 h-8">{indPrefixText && <span className="text-sm font-bold text-blue-600 shrink-0">{indPrefixText}</span>}<Input placeholder="กรอกชื่อกิจการ" className="h-full border-none p-0 focus-visible:ring-0 text-sm bg-transparent shadow-none" maxLength={95} {...field} disabled={isReadOnly} /></div></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  )}
                </div>
                {indType === 'บุคคลธรรมดา' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in slide-in-from-top-2">
                    <FormField name="firstName" control={form.control} render={({ field }) => (
                      <FormItem className="relative border rounded-md h-14 px-3 pt-1.5 bg-white space-y-0 focus-within:ring-2 focus-within:ring-primary/20">
                        <div className="flex justify-between items-center leading-tight"><div className="flex items-center gap-1"><span className="text-[11px] font-bold text-blue-600 uppercase">ชื่อจริง</span><span className="text-destructive font-bold text-[11px]">*</span></div><span className="text-[10px] text-muted-foreground font-mono">{(firstNameValue || '').length}/40</span></div>
                        <FormControl><Input placeholder="ชื่อจริง" className="h-8 border-none p-0 focus-visible:ring-0 text-sm bg-transparent shadow-none" maxLength={40} {...field} disabled={isReadOnly} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField name="lastName" control={form.control} render={({ field }) => (
                      <FormItem className="relative border rounded-md h-14 px-3 pt-1.5 bg-white space-y-0 focus-within:ring-2 focus-within:ring-primary/20">
                        <div className="flex justify-between items-center leading-tight"><span className="text-[11px] font-bold text-blue-600 uppercase">นามสกุล</span><span className="text-[10px] text-muted-foreground font-mono">{(lastNameValue || '').length}/40</span></div>
                        <FormControl><Input placeholder="นามสกุล" className="h-8 border-none p-0 focus-visible:ring-0 text-sm bg-transparent shadow-none" maxLength={40} {...field} disabled={isReadOnly} /></FormControl>
                      </FormItem>
                    )} />
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between pb-2 border-b">
            <div className="flex items-center gap-2"><MapPin className="h-5 w-5 text-primary" /><h2 className="text-xl font-bold font-headline">ที่อยู่จดทะเบียน</h2></div>
            <Button type="button" variant="ghost" size="sm" onClick={() => toggleSection('address')} className="h-8 text-xs">{expandedSections.address ? <div className="flex items-center gap-1">ย่อ <ChevronUp className="h-3 w-3" /></div> : <div className="flex items-center gap-1">ขยาย <ChevronDown className="h-3 w-3" /></div>}</Button>
          </div>
          {expandedSections.address && (
            <div className="space-y-4 animate-in slide-in-from-top-2">
              <FormField name="contactName" control={form.control} render={({ field }) => (
                <FormItem className="relative border rounded-md h-14 px-3 pt-1.5 bg-white space-y-0 focus-within:ring-2 focus-within:ring-primary/20">
                  <div className="flex justify-between items-center leading-tight"><span className="text-[11px] font-bold text-blue-600 uppercase">ผู้ติดต่อ</span><span className="text-[10px] text-muted-foreground font-mono">{(field.value || '').length}/100</span></div>
                  <FormControl><Input placeholder="ระบุชื่อผู้ติดต่อ" className="h-8 border-none p-0 focus-visible:ring-0 text-sm bg-transparent shadow-none" maxLength={100} {...field} disabled={isReadOnly} /></FormControl>
                </FormItem>
              )} />
              <FormField name="address" control={form.control} render={({ field }) => (
                <FormItem className="relative border rounded-md h-14 px-3 pt-1.5 bg-white space-y-0 focus-within:ring-2 focus-within:ring-primary/20">
                  <div className="flex justify-between items-center leading-tight"><span className="text-[11px] font-bold text-blue-600 uppercase">ที่อยู่</span><span className="text-[10px] text-muted-foreground font-mono">{(field.value || '').length}/200</span></div>
                  <FormControl><div className="flex items-center gap-2 h-8"><MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><Input placeholder="เลขที่, อาคาร, หมู่บ้าน, ถนน" className="h-full border-none p-0 focus-visible:ring-0 text-sm bg-transparent shadow-none" maxLength={200} {...field} disabled={isReadOnly} /></div></FormControl>
                </FormItem>
              )} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField name="subdistrict" control={form.control} render={({ field }) => (
                  <FormItem className="relative border rounded-md h-14 px-3 pt-1.5 bg-white space-y-0 focus-within:ring-2 focus-within:ring-primary/20"><div className="flex justify-between items-center leading-tight"><span className="text-[11px] font-bold text-blue-600 uppercase">แขวง / ตำบล</span><span className="text-[10px] text-muted-foreground font-mono">{(field.value || '').length}/100</span></div><FormControl><Input placeholder="แขวง / ตำบล" className="h-8 border-none p-0 focus-visible:ring-0 text-sm bg-transparent shadow-none" maxLength={100} {...field} disabled={isReadOnly} /></FormControl></FormItem>
                )} />
                <FormField name="district" control={form.control} render={({ field }) => (
                  <FormItem className="relative border rounded-md h-14 px-3 pt-1.5 bg-white space-y-0 focus-within:ring-2 focus-within:ring-primary/20"><div className="flex justify-between items-center leading-tight"><span className="text-[11px] font-bold text-blue-600 uppercase">เขต / อำเภอ</span><span className="text-[10px] text-muted-foreground font-mono">{(field.value || '').length}/100</span></div><FormControl><Input placeholder="เขต / อำเภอ" className="h-8 border-none p-0 focus-visible:ring-0 text-sm bg-transparent shadow-none" maxLength={100} {...field} disabled={isReadOnly} /></FormControl></FormItem>
                )} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField name="province" control={form.control} render={({ field }) => (
                  <FormItem className="relative border rounded-md h-14 px-3 pt-1.5 bg-white space-y-0 focus-within:ring-2 focus-within:ring-primary/20">
                    <div className="flex justify-between items-center leading-tight">
                      <span className="text-[11px] font-bold text-blue-600 uppercase">จังหวัด</span>
                    </div>
                    <FormControl>
                      <ProvinceCombobox 
                        value={field.value || ''} 
                        onChange={field.onChange} 
                        disabled={isReadOnly}
                        className="h-8 border-none p-0 focus-visible:ring-0 text-sm bg-transparent shadow-none hover:bg-transparent"
                      />
                    </FormControl>
                  </FormItem>
                )} />
                <FormField name="country" control={form.control} render={({ field }) => (
                  <FormItem className="relative border rounded-md h-14 px-3 pt-1.5 bg-white space-y-0 focus-within:ring-2 focus-within:ring-primary/20">
                    <div className="flex justify-between items-center leading-tight">
                      <span className="text-[11px] font-bold text-blue-600 uppercase">ประเทศ</span>
                    </div>
                    <FormControl>
                      <CountryCombobox 
                        value={field.value || ''} 
                        onChange={field.onChange} 
                        disabled={isReadOnly}
                        className="h-8 border-none p-0 focus-visible:ring-0 text-sm bg-transparent shadow-none hover:bg-transparent"
                      />
                    </FormControl>
                  </FormItem>
                )} />
              </div>
              <FormField name="postalCode" control={form.control} render={({ field }) => (
                <FormItem className="relative border rounded-md h-14 px-3 pt-1.5 bg-white space-y-0 focus-within:ring-2 focus-within:ring-primary/20"><div className="flex justify-between items-center leading-tight"><span className="text-[11px] font-bold text-blue-600 uppercase">รหัสไปรษณีย์</span><span className="text-[10px] text-muted-foreground font-mono">{(field.value || '').length}/10</span></div><FormControl><Input placeholder="รหัสไปรษณีย์" className="h-8 border-none p-0 focus-visible:ring-0 text-sm bg-transparent shadow-none" maxLength={10} {...field} disabled={isReadOnly} /></FormControl></FormItem>
              )} />
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between pb-2 border-b">
            <div className="flex items-center gap-2"><Phone className="h-5 w-5 text-primary" /><h2 className="text-xl font-bold font-headline">ช่องทางติดต่อหลัก</h2></div>
            <Button type="button" variant="ghost" size="sm" onClick={() => toggleSection('mainContact')} className="h-8 text-xs">{expandedSections.mainContact ? <div className="flex items-center gap-1">ย่อ <ChevronUp className="h-3 w-3" /></div> : <div className="flex items-center gap-1">ขยาย <ChevronDown className="h-3 w-3" /></div>}</Button>
          </div>
          {expandedSections.mainContact && (
            <div className="space-y-4 animate-in slide-in-from-top-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField name="contactPhone" control={form.control} render={({ field }) => (
                  <FormItem className="relative border rounded-md h-14 px-3 pt-1.5 bg-white space-y-0 focus-within:ring-2 focus-within:ring-primary/20"><div className="flex justify-between items-center leading-tight"><span className="text-[11px] font-bold text-blue-600 uppercase">เบอร์โทรศัพท์</span></div><FormControl><div className="flex items-center gap-2 h-8"><Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><Input placeholder="0xx-xxx-xxxx" className="h-full border-none p-0 focus-visible:ring-0 text-sm bg-transparent shadow-none" {...field} disabled={isReadOnly} /></div></FormControl></FormItem>
                )} />
                <FormField name="contactEmail" control={form.control} render={({ field }) => (
                  <FormItem className="relative border rounded-md h-14 px-3 pt-1.5 bg-white space-y-0 focus-within:ring-2 focus-within:ring-primary/20"><div className="flex justify-between items-center leading-tight"><span className="text-[11px] font-bold text-blue-600 uppercase">อีเมลติดต่อ</span></div><FormControl><div className="flex items-center gap-2 h-8"><Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><Input placeholder="email@example.com" className="h-full border-none p-0 focus-visible:ring-0 text-sm bg-transparent shadow-none" {...field} disabled={isReadOnly} /></div></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField name="website" control={form.control} render={({ field }) => (
                  <FormItem className="relative border rounded-md h-14 px-3 pt-1.5 bg-white space-y-0 focus-within:ring-2 focus-within:ring-primary/20"><div className="flex justify-between items-center leading-tight"><span className="text-[11px] font-bold text-blue-600 uppercase">เว็บไซต์</span></div><FormControl><div className="flex items-center gap-2 h-8"><Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><Input placeholder="www.example.com" className="h-full border-none p-0 focus-visible:ring-0 text-sm bg-transparent shadow-none" {...field} disabled={isReadOnly} /></div></FormControl></FormItem>
                )} />
                <FormField name="fax" control={form.control} render={({ field }) => (
                  <FormItem className="relative border rounded-md h-14 px-3 pt-1.5 bg-white space-y-0 focus-within:ring-2 focus-within:ring-primary/20"><div className="flex justify-between items-center leading-tight"><span className="text-[11px] font-bold text-blue-600 uppercase">เบอร์แฟกซ์</span></div><FormControl><div className="flex items-center gap-2 h-8"><Printer className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><Input placeholder="0xx-xxx-xxxx" className="h-full border-none p-0 focus-visible:ring-0 text-sm bg-transparent shadow-none" {...field} disabled={isReadOnly} /></div></FormControl></FormItem>
                )} />
              </div>
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between pb-2 border-b">
            <div className="flex items-center gap-2"><User className="h-5 w-5 text-primary" /><h2 className="text-xl font-bold font-headline">ข้อมูลบุคคลที่ติดต่อได้</h2></div>
            <Button type="button" variant="ghost" size="sm" onClick={() => toggleSection('person')} className="h-8 text-xs">{expandedSections.person ? <div className="flex items-center gap-1">ย่อ <ChevronUp className="h-3 w-3" /></div> : <div className="flex items-center gap-1">ขยาย <ChevronDown className="h-3 w-3" /></div>}</Button>
          </div>
          {expandedSections.person && (
            <div className="space-y-4 animate-in slide-in-from-top-2">
              <FormField name="contactPrefix" control={form.control} render={({ field }) => (
                <FormItem className="relative border rounded-md h-14 px-3 pt-1.5 bg-white space-y-0 focus-within:ring-2 focus-within:ring-primary/20">
                  <div className="flex items-center gap-1 leading-tight"><span className="text-[11px] font-bold text-blue-600 uppercase">คำนำหน้า</span></div>
                  <FormControl>
                    <Select onValueChange={field.onChange} value={field.value} disabled={isReadOnly}>
                      <SelectTrigger className="h-8 border-none p-0 focus:ring-0 shadow-none bg-transparent">
                        <SelectValue placeholder="เลือก" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ไม่มี">ไม่มี</SelectItem>
                        <SelectItem value="นาย">นาย</SelectItem>
                        <SelectItem value="นาง">นาง</SelectItem>
                        <SelectItem value="นางสาว">นางสาว</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormControl>
                </FormItem>
              )} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField name="contactFirstName" control={form.control} render={({ field }) => (
                  <FormItem className="relative border rounded-md h-14 px-3 pt-1.5 bg-white space-y-0 focus-within:ring-2 focus-within:ring-primary/20"><div className="flex justify-between items-center leading-tight"><span className="text-[11px] font-bold text-blue-600 uppercase">ชื่อจริง</span><span className="text-[10px] text-muted-foreground font-mono">{(field.value || '').length}/70</span></div><FormControl><Input placeholder="กรุณาระบุชื่อจริง" className="h-8 border-none p-0 focus-visible:ring-0 text-sm bg-transparent shadow-none" maxLength={70} {...field} disabled={isReadOnly} /></FormControl></FormItem>
                )} />
                <FormField name="contactLastName" control={form.control} render={({ field }) => (
                  <FormItem className="relative border rounded-md h-14 px-3 pt-1.5 bg-white space-y-0 focus-within:ring-2 focus-within:ring-primary/20"><div className="flex justify-between items-center leading-tight"><span className="text-[11px] font-bold text-blue-600 uppercase">นามสกุล</span><span className="text-[10px] text-muted-foreground font-mono">{(field.value || '').length}/70</span></div><FormControl><Input placeholder="กรุณาระบุนามสกุล" className="h-8 border-none p-0 focus-visible:ring-0 text-sm bg-transparent shadow-none" maxLength={70} {...field} disabled={isReadOnly} /></FormControl></FormItem>
                )} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField name="contactNickname" control={form.control} render={({ field }) => (
                  <FormItem className="relative border rounded-md h-14 px-3 pt-1.5 bg-white space-y-0 focus-within:ring-2 focus-within:ring-primary/20"><div className="flex justify-between items-center leading-tight"><span className="text-[11px] font-bold text-blue-600 uppercase">ชื่อเล่น</span><span className="text-[10px] text-muted-foreground font-mono">{(field.value || '').length}/20</span></div><FormControl><Input placeholder="ระบุชื่อเล่น" className="h-8 border-none p-0 focus-visible:ring-0 text-sm bg-transparent shadow-none" maxLength={20} {...field} disabled={isReadOnly} /></FormControl></FormItem>
                )} />
                <FormField name="contactPersonEmail" control={form.control} render={({ field }) => (
                  <FormItem className="relative border rounded-md h-14 px-3 pt-1.5 bg-white space-y-0 focus-within:ring-2 focus-within:ring-primary/20"><div className="flex justify-between items-center leading-tight"><span className="text-[11px] font-bold text-blue-600 uppercase">อีเมลบุคคลติดต่อ</span><span className="text-[10px] text-muted-foreground font-mono">{(field.value || '').length}/50</span></div><FormControl><Input placeholder="email@example.com" className="h-8 border-none p-0 focus-visible:ring-0 text-sm bg-transparent shadow-none" maxLength={50} {...field} disabled={isReadOnly} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField name="contactPersonPhone" control={form.control} render={({ field }) => (
                  <FormItem className="relative border rounded-md h-14 px-3 pt-1.5 bg-white space-y-0 focus-within:ring-2 focus-within:ring-primary/20"><div className="flex justify-between items-center leading-tight"><span className="text-[11px] font-bold text-blue-600 uppercase">เบอร์โทรศัพท์</span><span className="text-[10px] text-muted-foreground font-mono">{(field.value || '').length}/20</span></div><FormControl><div className="flex items-center gap-2 h-8"><Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><Input placeholder="0xx-xxx-xxxx" className="h-full border-none p-0 focus-visible:ring-0 text-sm bg-transparent shadow-none" maxLength={20} {...field} disabled={isReadOnly} /></div></FormControl></FormItem>
                )} />
                <FormField name="contactPosition" control={form.control} render={({ field }) => (
                  <FormItem className="relative border rounded-md h-14 px-3 pt-1.5 bg-white space-y-0 focus-within:ring-2 focus-within:ring-primary/20"><div className="flex justify-between items-center leading-tight"><span className="text-[11px] font-bold text-blue-600 uppercase">ตำแหน่งงาน</span><span className="text-[10px] text-muted-foreground font-mono">{(field.value || '').length}/40</span></div><FormControl><div className="flex items-center gap-2 h-8"><Briefcase className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><Input placeholder="ระบุตำแหน่ง" className="h-full border-none p-0 focus-visible:ring-0 text-sm bg-transparent shadow-none" maxLength={40} {...field} disabled={isReadOnly} /></div></FormControl></FormItem>
                )} />
              </div>
            </div>
          )}
        </section>

        <div className="flex justify-between items-center pt-8 border-t">
          <Button type="button" variant="ghost" onClick={onCancel} className="text-muted-foreground">ยกเลิก</Button>
          <div className="flex gap-3">
            {isEditMode && initialData?.status === 'archived' && (
              <Button 
                type="button" 
                variant="outline" 
                className="text-emerald-600 border-emerald-200 hover:bg-emerald-50" 
                onClick={() => setIsRestoreDialogOpen(true)} 
                disabled={isSubmitting || !hasSupplierPermission}
              >
                <RotateCw className="h-4 w-4 mr-2" /> กู้คืนจากการจัดเก็บ
              </Button>
            )}
            {isEditMode && initialData?.status !== 'archived' && (
              <Button type="button" variant="outline" className="text-destructive border-destructive/20 hover:bg-destructive/5" onClick={() => setIsArchiveDialogOpen(true)} disabled={isSubmitting || !hasSupplierPermission}><Archive className="h-4 w-4 mr-2" /> ย้ายไปจัดเก็บ</Button>
            )}
            <Button type="submit" size="lg" className="min-w-[150px] font-bold" disabled={isSubmitting || isReadOnly}>{isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}{isEditMode ? 'บันทึกการแก้ไข' : 'สร้างแหล่งจัดซื้อ'}</Button>
          </div>
        </div>
      </form>

      <CustomDialog isOpen={isArchiveDialogOpen} onClose={() => setIsArchiveDialogOpen(false)} title="ยืนยันการจัดเก็บ">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">คุณแน่ใจหรือไม่ว่าต้องการย้ายแหล่งจัดซื้อ <span className="font-bold text-foreground">"{initialData?.name}"</span> ไปที่เก็บถาวร?</p>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => setIsArchiveDialogOpen(false)} disabled={isSubmitting}>ยกเลิก</Button>
            <Button variant="destructive" onClick={handleArchive} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}ยืนยันการจัดเก็บ
            </Button>
          </div>
        </div>
      </CustomDialog>

      <CustomDialog isOpen={isRestoreDialogOpen} onClose={() => setIsRestoreDialogOpen(false)} title="ยืนยันการกู้คืน">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">คุณแน่ใจหรือไม่ว่าต้องการกู้คืนแหล่งจัดซื้อ <span className="font-bold text-foreground">"{initialData?.name}"</span> กลับมาใช้งานปกติ?</p>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => setIsRestoreDialogOpen(false)} disabled={isSubmitting}>ยกเลิก</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleRestore} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}ยืนยันการกู้คืน
            </Button>
          </div>
        </div>
      </CustomDialog>
    </Form>
  );
}
