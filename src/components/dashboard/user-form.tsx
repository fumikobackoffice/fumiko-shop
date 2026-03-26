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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useRouter, usePathname } from 'next/navigation';
import { collection, serverTimestamp, doc, getDocs, query, where, addDoc, updateDoc, limit, writeBatch } from 'firebase/firestore';
import { useState, useEffect, useMemo, useRef, ChangeEvent, RefObject } from 'react';
import { Loader2, X, Info, AlertCircle, ShieldCheck, CheckCircle2, ShieldAlert, Briefcase, MapPin, KeyRound, Eye, Settings2, ShieldOff, Pencil } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { UserProfile, StoreSettings } from '@/lib/types';
import { BankCombobox } from './bank-combobox';
import { format, getDaysInMonth } from 'date-fns';
import { th } from 'date-fns/locale';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '@/hooks/use-auth';
import { UnsavedChangesDialog } from './unsaved-changes-dialog';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { cn } from '@/lib/utils';
import { ProvinceCombobox } from './province-combobox';
import { CountryCombobox } from './country-combobox';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { clearGlobalCache } from '@/hooks/use-smart-fetch';

/**
 * คอมโพเนนต์เลือกวันที่แบบดรอปดาวน์แยกส่วน (วัน/เดือน/ปี)
 */
function DateDropdownPicker({
  field,
  disabled,
}: {
  field: { value?: Date | null; onChange: (date: Date | null) => void };
  disabled?: boolean;
}) {
    const [day, setDay] = useState<string | undefined>();
    const [month, setMonth] = useState<string | undefined>();
    const [year, setYear] = useState<string | undefined>();

    useEffect(() => {
        if (field.value) {
            const date = new Date(field.value);
            if (!isNaN(date.getTime())) {
                const targetDay = String(date.getDate());
                const targetMonth = String(date.getMonth());
                const targetYear = String(date.getFullYear());
                
                if (day !== targetDay || month !== targetMonth || year !== targetYear) {
                    setDay(targetDay);
                    setMonth(targetMonth);
                    setYear(targetYear);
                }
            }
        }
    }, [field.value, day, month, year]);

    const currentYear = new Date().getFullYear();
    const years = useMemo(() => Array.from({ length: 101 }, (_, i) => currentYear - i), [currentYear]);
    const thaiMonths = useMemo(() => Array.from({ length: 12 }, (_, i) => ({
        value: i.toString(),
        label: format(new Date(2000, i, 1), 'LLLL', { locale: th }),
    })), []);

    const daysInMonthLimit = useMemo(() => {
        if (year && month) return getDaysInMonth(new Date(parseInt(year), parseInt(month)));
        return 31;
    }, [month, year]);

    const handleDateChange = (part: 'day' | 'month' | 'year', value: string) => {
        if (disabled) return;
        
        let nextDay = day;
        let nextMonth = month;
        let nextYear = year;

        if (part === 'day') { setDay(value); nextDay = value; }
        if (part === 'month') { setMonth(value); nextMonth = value; }
        if (part === 'year') { setYear(value); nextYear = value; }

        if (nextDay && nextMonth && nextYear) {
            let d = parseInt(nextDay);
            const m = parseInt(nextMonth);
            const y = parseInt(nextYear);
            const maxDays = getDaysInMonth(new Date(y, m));
            if (d > maxDays) d = maxDays;
            
            const newDate = new Date(y, m, d, 12, 0, 0);
            if (!isNaN(newDate.getTime())) {
                field.onChange(newDate);
            }
        }
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

// แผนผังโมดูลสำหรับกำหนดสิทธิ์
const PERMISSION_MODULES = [
  { id: 'revenue', label: 'การเงินและกำไร', description: 'รายงานยอดขาย รายงานภาษี และสรุปผลกำไร' },
  { id: 'orders', label: 'จัดการออเดอร์', description: 'ตรวจสอบสลิป ยืนยันชำระเงิน และยกเลิกออเดอร์' },
  { id: 'shipping', label: 'การจัดส่งพัสดุ', description: 'พิมพ์ใบปะหน้า และบันทึกเลขพัสดุ' },
  { id: 'inventory', label: 'สต็อกสินค้า', description: 'จัดการสินค้า แพ็กเกจ ใบสั่งซื้อ (PO) และการรับของ' },
  { id: 'suppliers', label: 'แหล่งจัดซื้อ', description: 'จัดการข้อมูลบริษัทคู่ค้า/Supplier' },
  { id: 'branches', label: 'สาขาและสัญญา', description: 'จัดการข้อมูลสาขา สัญญา และบิลค่าธรรมเนียม' },
  { id: 'customers', label: 'เจ้าของสาขา', description: 'จัดการรายชื่อเจ้าของสาขา และคะแนนสะสม' },
  { id: 'system', label: 'ตั้งค่าระบบ', description: 'จัดการพนักงาน และตั้งค่าระบบร้านค้า' },
];

const ADMIN_POSITIONS = [
  { id: 'custom', label: 'กำหนดสิทธิ์เอง (Custom)', permissions: [] },
  { id: 'manager', label: 'ผู้จัดการทั่วไป', permissions: ['revenue:view', 'orders:manage', 'shipping:manage', 'inventory:manage', 'suppliers:manage', 'branches:manage', 'customers:manage', 'system:manage'] },
  { id: 'accounting', label: 'ฝ่ายบัญชีและการเงิน', permissions: ['revenue:view', 'orders:manage', 'suppliers:view', 'branches:manage'] },
  { id: 'warehouse', label: 'ฝ่ายคลังสินค้า', permissions: ['inventory:manage', 'shipping:manage'] },
  { id: 'sales', label: 'ฝ่ายขายและดูแลลูกค้า', permissions: ['orders:manage', 'customers:manage'] },
  { id: 'franchise', label: 'ฝ่ายบริหารสาขา', permissions: ['branches:manage', 'customers:manage'] },
];

const formSchema = z.object({
  firstName: z.string().min(1, { message: 'กรุณากรอกชื่อจริง' }),
  lastName: z.string().min(1, { message: 'กรุณากรอกนามสกุล' }),
  email: z.string().email({ message: 'ที่อยู่อีเมลไม่ถูกต้อง' }),
  password: z.string().optional(),
  role: z.enum(['seller', 'admin', 'super_admin'], { required_error: 'กรุณาเลือกบทบาท' }),
  positionId: z.string().optional(),
  phone: z.string().optional(),
  contactEmail: z.string().email({ message: 'อีเมลติดต่อไม่ถูกต้อง' }).optional().or(z.literal('')),
  lineId: z.string().optional(),
  dob: z.date().optional().nullable(),
  bankName: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  nationalIdCardUrl: z.string().optional(),
  faceImageUrl: z.string().optional(),
  permissions: z.array(z.string()).default([]),
  
  address: z.string().optional(),
  subdistrict: z.string().optional(),
  district: z.string().optional(),
  province: z.string().optional(),
  country: z.string().optional(),
  postalCode: z.string().optional(),
});

interface UserFormProps {
  initialData?: UserProfile;
  sideContent?: React.ReactNode;
}

export function UserForm({ initialData, sideContent }: UserFormProps) {
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const firestore = useFirestore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const nationalIdInputRef = useRef<HTMLInputElement>(null);
  const faceImageInputRef = useRef<HTMLInputElement>(null);
  
  const { user: currentUser } = useAuth();
  const isSuperAdmin = currentUser?.role === 'super_admin';
  const isAdmin = currentUser?.role === 'admin';
  const isSeller = currentUser?.role === 'seller';
  const isEditMode = !!initialData;

  const isStaffFlow = pathname.includes('/dashboard/staff');
  const isSellerFlow = pathname.includes('/dashboard/users');
  const isProfileFlow = pathname.includes('/account/profile');

  const isEditingSelf = currentUser?.id === initialData?.id;
  const isTargetSuperAdmin = initialData?.role === 'super_admin';
  const isTargetSeller = initialData?.role === 'seller';
  const isEditingOtherSuperAdmin = isTargetSuperAdmin && !isProfileFlow && !isEditingSelf;
  
  let canEdit = true; 
  if (isEditMode) {
    if (isSeller) {
      canEdit = false;
    } else if (isSuperAdmin) {
      canEdit = !isEditingOtherSuperAdmin;
    } else if (isAdmin) {
      if (isEditingSelf) {
        canEdit = true;
      } else if (isTargetSeller && currentUser?.permissions?.includes('manage_customers') && isSellerFlow) {
        canEdit = true;
      } else {
        canEdit = false;
      }
    }
  }

  const isReadOnly = !canEdit && isEditMode;
  const canEditPassword = isSuperAdmin || isEditingSelf;

  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [nextPath, setNextPath] = useState<string | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: '', lastName: '', email: '', password: '', role: isStaffFlow ? 'admin' : 'seller', positionId: 'custom',
      phone: '', contactEmail: '', lineId: '', dob: undefined, bankName: '', bankAccountNumber: '', nationalIdCardUrl: '',
      faceImageUrl: '', permissions: [], address: '', subdistrict: '', district: '', province: '', country: '', postalCode: '',
    },
  });
  
  const { watch, setValue, control, reset } = form;

  const lastLoadedUserId = useRef<string | null>(null);
  useEffect(() => {
    if (initialData && initialData.id !== lastLoadedUserId.current) {
      const dobData = initialData.dob?.toDate ? initialData.dob.toDate() : (initialData.dob ? new Date(initialData.dob) : null);
      reset({
        ...initialData,
        dob: dobData,
        password: '', 
        positionId: 'custom',
        permissions: initialData.permissions || [],
      });
      lastLoadedUserId.current = initialData.id;
    } else if (!isEditMode && !initialData && !lastLoadedUserId.current) {
        if (isStaffFlow) setValue('role', 'admin');
        else if (isSellerFlow) setValue('role', 'seller');
        lastLoadedUserId.current = 'new_user';
    }
  }, [initialData, reset, isStaffFlow, isSellerFlow, setValue, isEditMode]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>, fieldName: 'nationalIdCardUrl' | 'faceImageUrl') => {
    if (isReadOnly) return;
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => setValue(fieldName, e.target?.result as string, { shouldValidate: true, shouldDirty: true });
      reader.readAsDataURL(file);
    }
  };
  
  const handleRemoveImage = (fieldName: 'nationalIdCardUrl' | 'faceImageUrl', inputRef: RefObject<HTMLInputElement>) => {
    if (isReadOnly) return;
    setValue(fieldName, '', { shouldValidate: true, shouldDirty: true });
    if (inputRef.current) inputRef.current.value = '';
  };

  const handlePositionChange = (positionId: string) => {
    if (isReadOnly) return;
    setValue('positionId', positionId);
    const position = ADMIN_POSITIONS.find(p => p.id === positionId);
    if (position && positionId !== 'custom') {
      setValue('permissions', position.permissions, { shouldDirty: true });
    }
  };

  const currentPermissions = watch('permissions') || [];

  const getLevelForModule = (moduleId: string): 'none' | 'view' | 'manage' => {
    if (currentPermissions.includes(`${moduleId}:manage`)) return 'manage';
    if (currentPermissions.includes(`${moduleId}:view`)) return 'view';
    
    // Legacy support check
    const legacyMap: Record<string, string> = {
        'revenue': 'view_revenue',
        'orders': 'manage_orders',
        'shipping': 'manage_shipping',
        'inventory': 'manage_inventory',
        'suppliers': 'manage_suppliers',
        'branches': 'manage_branches',
        'customers': 'manage_customers',
        'system': 'manage_system'
    };
    if (legacyMap[moduleId] && currentPermissions.includes(legacyMap[moduleId])) {
        return moduleId === 'revenue' ? 'view' : 'manage';
    }
    
    return 'none';
  };

  const setLevelForModule = (moduleId: string, level: 'none' | 'view' | 'manage') => {
    if (isReadOnly) return;
    setValue('positionId', 'custom');
    
    let newPermissions = currentPermissions.filter(p => !p.startsWith(`${moduleId}:`) && p !== `view_revenue` && p !== `manage_${moduleId}`);
    
    if (level !== 'none') {
        newPermissions.push(`${moduleId}:${level}`);
    }
    
    setValue('permissions', newPermissions, { shouldDirty: true });
  };

  const saveUser = async (values: z.infer<typeof formSchema>): Promise<boolean> => {
    if (!firestore) return false;
    try {
      const userProfileData: Partial<UserProfile> = {
          name: `${values.firstName} ${values.lastName}`,
          firstName: values.firstName, 
          lastName: values.lastName, 
          email: values.email, 
          role: values.role,
          phone: values.phone || '', 
          contactEmail: values.contactEmail || '', 
          lineId: values.lineId || '', 
          bankName: values.bankName || '',
          bankAccountNumber: values.bankAccountNumber || '', 
          dob: values.dob || null, 
          nationalIdCardUrl: values.nationalIdCardUrl || '',
          faceImageUrl: values.faceImageUrl || '', 
          permissions: values.role === 'super_admin' ? [] : (values.permissions || []),
          address: values.address || '', 
          subdistrict: values.subdistrict || '', 
          district: values.district || '', 
          province: values.province || '',
          country: values.country || '', 
          postalCode: values.postalCode || '',
        };

      if (values.password && values.password.length >= 6) {
        userProfileData.password = values.password;
      }

      const batch = writeBatch(firestore);
      if (isEditMode) {
        if (!initialData) return false;
        batch.update(doc(firestore, 'users', initialData.id), userProfileData);
        batch.set(doc(firestore, 'user_roles', initialData.id), { role: values.role }, { merge: true });
      } else {
        if (!values.password || values.password.length < 6) { form.setError('password', { message: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' }); return false; }
        const usersRef = collection(firestore, 'users');
        const q = query(usersRef, where("email", "==", values.email));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) { form.setError('email', { message: 'อีเมลนี้ถูกใช้งานแล้ว' }); return false; }
        const userId = uuidv4();
        const finalUserData = { ...userProfileData, id: userId, password: values.password, status: 'active', createdAt: serverTimestamp() };
        batch.set(doc(firestore, 'users', userId), finalUserData);
        batch.set(doc(firestore, 'user_roles', userId), { role: values.role });
      }
      await batch.commit();
      
      clearGlobalCache('users-data');
      clearGlobalCache('staff-data');

      toast({ title: isEditMode ? 'บันทึกการเปลี่ยนแปลงแล้ว' : 'สร้างบัญชีแล้ว' });
      return true;
    } catch (error: any) { 
      toast({ variant: 'destructive', title: 'เกิดข้อผิดพลาด', description: error.message }); 
      return false; 
    }
  }

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (isReadOnly) return;
    setIsSubmitting(true);
    const success = await saveUser(values);
    if (success) {
      const redirectPath = (values.role === 'admin' || values.role === 'super_admin') ? '/dashboard/staff' : '/dashboard/users';
      setTimeout(() => router.push(redirectPath), 50);
    }
    setIsSubmitting(false);
  }

  const handleSaveAndNavigate = async () => {
    setIsSubmitting(true);
    const isValid = await form.trigger();
    if (isValid) {
      const success = await saveUser(form.getValues());
      if (success && nextPath) setTimeout(() => router.push(nextPath), 50);
    }
    setIsSubmitting(false); setShowUnsavedDialog(false);
  };

  const handleDiscardAndNavigate = () => { if (nextPath) router.push(nextPath); setShowUnsavedDialog(false); };

  const selectedRole = watch('role');
  const nationalIdPreview = watch('nationalIdCardUrl');
  const faceImagePreview = watch('faceImageUrl');

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {isReadOnly && (
          <Alert variant="default" className="bg-amber-50 border-amber-200 text-amber-900 shadow-sm border-l-4 border-l-amber-500">
            {isEditingOtherSuperAdmin ? <ShieldAlert className="h-4 w-4 text-red-600" /> : <AlertCircle className="h-4 w-4 text-amber-600" />}
            <AlertTitle className="font-bold">{isEditingOtherSuperAdmin ? 'บัญชีผู้ดูแลระบบสูงสุดถูกคุ้มครอง' : 'ข้อมูลส่วนตัวถูกล็อกไว้'}</AlertTitle>
            <AlertDescription className="text-xs">{isEditingOtherSuperAdmin ? 'ระบบไม่อนุญาตให้แก้ไขข้อมูลพนักงานระดับ Super Admin ผ่านหน้านี้' : 'ระบบไม่อนุญาตให้เจ้าของสาขาแก้ไขข้อมูลสำคัญด้วยตนเอง'}</AlertDescription>
          </Alert>
        )}

        <div className={cn("grid grid-cols-1 gap-6", !isReadOnly ? "lg:grid-cols-3" : "lg:grid-cols-1")}>
          <div className={cn("space-y-6", !isReadOnly ? "lg:col-span-2" : "")}>
            <Card>
              <CardHeader><CardTitle className="font-headline">{isStaffFlow ? 'ข้อมูลทีมงาน / แอดมิน' : isSellerFlow ? 'ข้อมูลเจ้าของสาขา' : 'รายละเอียดโปรไฟล์'}</CardTitle></CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField name="firstName" control={control} render={({ field }) => (
                      <FormItem>
                        <FormLabel>ชื่อจริง <span className="text-destructive">*</span></FormLabel>
                        <FormControl>
                          <Input placeholder="สมชาย" {...field} disabled={isReadOnly || isEditingSelf} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField name="lastName" control={control} render={({ field }) => (
                      <FormItem>
                        <FormLabel>นามสกุล <span className="text-destructive">*</span></FormLabel>
                        <FormControl>
                          <Input placeholder="ใจดี" {...field} disabled={isReadOnly || isEditingSelf} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                </div>
                <FormField name="email" control={control} render={({ field }) => (<FormItem><FormLabel>อีเมลเข้าใช้งาน <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="name@example.com" {...field} disabled={isEditMode || isReadOnly} /></FormControl><FormMessage /></FormItem>)} />
                
                {(!isReadOnly && (!isEditMode || canEditPassword)) && (
                  <FormField 
                    name="password" 
                    control={control} 
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <KeyRound className="h-4 w-4 text-primary" />
                          {isEditMode ? 'รหัสผ่านใหม่' : 'รหัสผ่าน'} <span className="text-destructive">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input 
                            type="password" 
                            placeholder={isEditMode ? '•••••••• (ปล่อยว่างหากไม่ต้องการเปลี่ยน)' : '••••••••'} 
                            {...field} 
                            disabled={isReadOnly}
                          />
                        </FormControl>
                        {isEditMode && <FormDescription className="text-[10px]">กรอกเมื่อต้องการเปลี่ยนรหัสผ่านเข้าใช้งานใหม่เท่านั้น</FormDescription>}
                        <FormMessage />
                      </FormItem>
                    )} 
                  />
                )}

                {selectedRole === 'seller' && (
                  <>
                    <Separator />
                    <div className="space-y-6">
                        <h3 className="text-lg font-medium">ข้อมูลการติดต่อ</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormField name="phone" control={control} render={({ field }) => (<FormItem><FormLabel>เบอร์โทรศัพท์</FormLabel><FormControl><Input {...field} disabled={isReadOnly} /></FormControl><FormMessage /></FormItem>)} />
                            <FormField name="contactEmail" control={control} render={({ field }) => (<FormItem><FormLabel>อีเมลติดต่อสำรอง</FormLabel><FormControl><Input placeholder="contact@example.com" {...field} disabled={isReadOnly} /></FormControl><FormMessage /></FormItem>)} />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                            <FormField name="lineId" control={control} render={({ field }) => (<FormItem><FormLabel>LINE ID</FormLabel><FormControl><Input {...field} disabled={isReadOnly} /></FormControl><FormMessage /></FormItem>)} />
                            
                            <FormField name="dob" control={control} render={({ field }) => (
                              <FormItem>
                                <FormLabel>วันเกิด</FormLabel>
                                <DateDropdownPicker field={field} disabled={isReadOnly} />
                                <FormMessage />
                              </FormItem>
                            )} />
                        </div>

                        <Separator />
                        <h3 className="text-lg font-medium flex items-center gap-2"><MapPin className="h-5 w-5 text-primary" />ข้อมูลที่อยู่</h3>
                        <div className="space-y-4">
                          <FormField name="address" control={control} render={({ field }) => (<FormItem><FormLabel>ที่อยู่ (บ้านเลขที่, หมู่, ถนน)</FormLabel><FormControl><Textarea rows={2} {...field} disabled={isReadOnly} /></FormControl><FormMessage /></FormItem>)} />
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormField name="subdistrict" control={control} render={({ field }) => (<FormItem><FormLabel>แขวง / ตำบล</FormLabel><FormControl><Input {...field} disabled={isReadOnly} /></FormControl><FormMessage /></FormItem>)} />
                            <FormField name="district" control={control} render={({ field }) => (<FormItem><FormLabel>เขต / อำเภอ</FormLabel><FormControl><Input {...field} disabled={isReadOnly} /></FormControl><FormMessage /></FormItem>)} />
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormField name="province" control={control} render={({ field }) => (<FormItem><FormLabel>จังหวัด</FormLabel><FormControl><ProvinceCombobox value={field.value || ''} onChange={field.onChange} disabled={isReadOnly} /></FormControl><FormMessage /></FormItem>)} />
                            <FormField name="country" control={control} render={({ field }) => (<FormItem><FormLabel>ประเทศ</FormLabel><FormControl><CountryCombobox value={field.value || ''} onChange={field.onChange} disabled={isReadOnly} /></FormControl><FormMessage /></FormItem>)} />
                          </div>
                          <FormField name="postalCode" control={control} render={({ field }) => (<FormItem><FormLabel>รหัสไปรษณีย์</FormLabel><FormControl><Input {...field} disabled={isReadOnly} /></FormControl><FormMessage /></FormItem>)} />
                        </div>

                        <Separator />
                        <h3 className="text-lg font-medium">เอกสารยืนยันตัวตน</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                          <div>
                            <FormLabel>รูปบัตรประชาชน</FormLabel>
                            <FormControl>{(isSuperAdmin || isAdmin) && !isReadOnly ? (<Input ref={nationalIdInputRef} type="file" accept="image/*" onChange={(e) => handleFileChange(e, 'nationalIdCardUrl')} className="mt-2" />) : (<div className="flex items-center gap-2 text-sm text-muted-foreground p-3 border rounded-md bg-muted/50 mt-2"><Info className="h-4 w-4" /><span>{nationalIdPreview ? 'ข้อมูลได้รับการตรวจสอบแล้ว' : 'ยังไม่ได้อัปโหลดข้อมูล'}</span></div>)}</FormControl>
                            {nationalIdPreview && (<div className="mt-4 relative w-full max-w-xs"><img src={nationalIdPreview} className="w-full rounded-md border" alt="National ID" />{(isSuperAdmin || isAdmin) && !isReadOnly && (<Button type="button" variant="destructive" size="icon" className="absolute -top-2 -right-2 h-6 w-6 rounded-full" onClick={() => handleRemoveImage('nationalIdCardUrl', nationalIdInputRef)}><X className="h-4 w-4" /></Button>)}</div>)}
                          </div>
                          <div>
                            <FormLabel>รูปใบหน้า</FormLabel>
                            <FormControl>{(isSuperAdmin || isAdmin) && !isReadOnly ? (<Input ref={faceImageInputRef} type="file" accept="image/*" onChange={(e) => handleFileChange(e, 'faceImageUrl')} className="mt-2" />) : (<div className="flex items-center gap-2 text-sm text-muted-foreground p-3 border rounded-md bg-muted/50 mt-2"><Info className="h-4 w-4" /><span>{faceImagePreview ? 'ข้อมูลได้รับการตรวจสอบแล้ว' : 'ยังไม่ได้อัปโหลดข้อมูล'}</span></div>)}</FormControl>
                            {faceImagePreview && (<div className="mt-4 relative w-full max-w-xs"><img src={faceImagePreview} className="w-full rounded-md border" alt="Face" />{(isSuperAdmin || isAdmin) && !isReadOnly && (<Button type="button" variant="destructive" size="icon" className="absolute -top-2 -right-2 h-6 w-6 rounded-full" onClick={() => handleRemoveImage('faceImageUrl', faceImageInputRef)}><X className="h-4 w-4" /></Button>)}</div>)}
                          </div>
                        </div>
                        <Separator />
                        <h3 className="text-lg font-medium">ข้อมูลบัญชีธนาคาร</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormField name="bankName" control={control} render={({ field }) => (<FormItem><FormLabel>ธนาคาร</FormLabel><FormControl><BankCombobox field={field} disabled={isReadOnly} /></FormControl><FormMessage /></FormItem>)} />
                            <FormField name="bankAccountNumber" control={control} render={({ field }) => (<FormItem><FormLabel>เลขที่บัญชี</FormLabel><FormControl><Input {...field} disabled={isReadOnly} /></FormControl><FormMessage /></FormItem>)} />
                        </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {isStaffFlow && selectedRole === 'admin' && (
              <Card className="border-primary/20 shadow-md">
                <CardHeader className="bg-primary/5 rounded-t-lg border-b border-primary/10">
                  <div className="flex items-center gap-2 text-primary"><ShieldCheck className="h-5 w-5" /><CardTitle className="text-lg">สิทธิ์การใช้งาน (Permissions)</CardTitle></div>
                  <CardDescription>กำหนดระดับการเข้าถึงข้อมูลและอำนาจการสั่งการแยกตามส่วนงาน</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-muted-foreground border-b">
                            <tr>
                                <th className="text-left py-3 px-6 font-bold uppercase tracking-tight text-[10px]">โมดูล / ส่วนงาน</th>
                                <th className="text-center py-3 px-2 w-24 font-bold uppercase tracking-tight text-[10px]">ไม่มีสิทธิ์</th>
                                <th className="text-center py-3 px-2 w-24 font-bold uppercase tracking-tight text-[10px]">ดูอย่างเดียว</th>
                                <th className="text-center py-3 px-2 w-24 font-bold uppercase tracking-tight text-[10px]">จัดการได้</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {PERMISSION_MODULES.map((module) => {
                                const level = getLevelForModule(module.id);
                                return (
                                    <tr key={module.id} className="hover:bg-muted/30 transition-colors">
                                        <td className="py-4 px-6">
                                            <div className="font-bold text-foreground">{module.label}</div>
                                            <p className="text-[10px] text-muted-foreground mt-0.5">{module.description}</p>
                                        </td>
                                        <td className="py-4 px-2 text-center">
                                            <label className="flex items-center justify-center cursor-pointer h-full">
                                                <input 
                                                    type="radio" 
                                                    name={`perm-${module.id}`}
                                                    checked={level === 'none'}
                                                    onChange={() => setLevelForModule(module.id, 'none')}
                                                    disabled={isReadOnly}
                                                    className="h-4 w-4 text-primary border-muted-foreground/30 focus:ring-primary"
                                                />
                                            </label>
                                        </td>
                                        <td className="py-4 px-2 text-center">
                                            <label className={cn("flex flex-col items-center justify-center cursor-pointer h-full gap-1", level === 'view' && "text-blue-600 font-bold")}>
                                                <input 
                                                    type="radio" 
                                                    name={`perm-${module.id}`}
                                                    checked={level === 'view'}
                                                    onChange={() => setLevelForModule(module.id, 'view')}
                                                    disabled={isReadOnly}
                                                    className="h-4 w-4 text-blue-600 border-muted-foreground/30 focus:ring-blue-500"
                                                />
                                                <Eye className="h-3 w-3" />
                                            </label>
                                        </td>
                                        <td className="py-4 px-2 text-center">
                                            <label className={cn("flex flex-col items-center justify-center cursor-pointer h-full gap-1", level === 'manage' && "text-primary font-bold")}>
                                                <input 
                                                    type="radio" 
                                                    name={`perm-${module.id}`}
                                                    checked={level === 'manage'}
                                                    onChange={() => setLevelForModule(module.id, 'manage')}
                                                    disabled={isReadOnly}
                                                    className="h-4 w-4 text-primary border-muted-foreground/30 focus:ring-primary"
                                                />
                                                <Settings2 className="h-3 w-3" />
                                            </label>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {!isReadOnly && (
            <div className="space-y-6">
              <Card>
                <CardHeader><CardTitle className="text-base">สถานะและบทบาท</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {(isStaffFlow || isSellerFlow) && !isProfileFlow ? (
                    <>
                      <FormField name="role" control={control} render={({ field }) => (
                        <FormItem>
                          <FormLabel>ประเภทบัญชี <span className="text-destructive">*</span></FormLabel>
                          <Select onValueChange={field.onChange} value={field.value} disabled={initialData?.role === 'super_admin' || !isSuperAdmin || isReadOnly}>
                            <FormControl><SelectTrigger><SelectValue placeholder="เลือกบทบาท" /></SelectTrigger></FormControl>
                            <SelectContent>
                              {isSellerFlow && <SelectItem value="seller">เจ้าของสาขา (Seller)</SelectItem>}
                              {isStaffFlow && (
                                <>
                                  <SelectItem value="admin">ผู้ดูแลระบบ (Admin)</SelectItem>
                                  {initialData?.role === 'super_admin' && (
                                    <SelectItem value="super_admin">ผู้ดูแลระบบสูงสุด</SelectItem>
                                  )}
                                </>
                              )}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                      {selectedRole === 'admin' && (
                        <FormField name="positionId" control={control} render={({ field }) => (
                            <FormItem><FormLabel className="flex items-center gap-2 text-foreground font-bold"><Briefcase className="h-4 w-4 text-primary" />ตำแหน่งงาน</FormLabel>
                              <Select onValueChange={handlePositionChange} value={field.value} disabled={isReadOnly}><FormControl><SelectTrigger className="h-11 border-2"><SelectValue placeholder="เลือกตำแหน่งเพื่อตั้งค่าสิทธิ์" /></SelectTrigger></FormControl><SelectContent>{ADMIN_POSITIONS.map(pos => <SelectItem key={pos.id} value={pos.id}>{pos.label}</SelectItem>)}</SelectContent></Select>
                              <FormDescription className="text-[10px]">ระบุตำแหน่งเพื่อตั้งค่าสิทธิ์พื้นฐานให้อัตโนมัติ</FormDescription>
                            </FormItem>
                          )} />
                      )}
                    </>
                  ) : (
                    <div className="space-y-2">
                      <Label>บทบาทผู้ใช้</Label>
                      <div className="flex items-center gap-2 p-2 bg-muted rounded-md text-sm font-bold text-primary">
                        <ShieldCheck className="h-4 w-4" /> 
                        {selectedRole === 'super_admin' ? 'ผู้ดูแลระบบสูงสุด' : selectedRole === 'admin' ? 'ผู้ดูแลระบบ' : 'เจ้าของสาขา'}
                      </div>
                    </div>
                  )}
                  <div className="pt-4"><Button type="submit" className="w-full" size="lg" disabled={isSubmitting || isReadOnly}>{isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} {isEditMode ? 'บันทึกการเปลี่ยนแปลง' : 'สร้างบัญชี'}</Button></div>
                </CardContent>
              </Card>
              {initialData?.role === 'super_admin' && (<Alert className="bg-primary/5 border-primary/20"><ShieldCheck className="h-4 w-4 text-primary" /><AlertTitle className="text-xs font-bold text-primary">บัญชีระดับสูงสุด</AlertTitle><AlertDescription className="text-[10px]">บัญชีนี้ได้รับสิทธิ์เข้าถึงทุกส่วนของระบบโดยอัตโนมัติ</AlertDescription></Alert>)}
              
              {/* Additional sidebar content (e.g., Migration Tool) */}
              {sideContent}
            </div>
          )}
        </div>
      </form>
      <UnsavedChangesDialog isOpen={showUnsavedDialog} onOpenChange={setShowUnsavedDialog} onSaveAndExit={handleSaveAndNavigate} onDiscardAndExit={handleDiscardAndNavigate} isSaving={isSubmitting} />
    </Form>
  );
}
