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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useMemo, ChangeEvent, useRef } from 'react';
import { Loader2, ImagePlus, X, User, FileText, PlusCircle, Trash2, Banknote, Check, Edit2, Calendar, Info, Percent, ReceiptText, Power, PowerOff, Clock, Truck, Car, ShieldCheck, Pencil } from 'lucide-react';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { collection, serverTimestamp, doc, setDoc, updateDoc, runTransaction, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { Branch, ContractRecord, RecurringFeeRule, StoreSettings } from '@/lib/types';
import { ProvinceCombobox } from './province-combobox';
import { UserCombobox } from './user-combobox';
import { CountryCombobox } from './country-combobox';
import { FeeItemCombobox } from './fee-item-combobox';
import { UnsavedChangesDialog } from './unsaved-changes-dialog';
import { Label } from '@/components/ui/label';
import { format, getDaysInMonth, differenceInCalendarDays, isBefore } from 'date-fns';
import { th } from 'date-fns/locale';
import { Badge } from '../ui/badge';
import { v4 as uuidv4 } from 'uuid';
import { Separator } from '../ui/separator';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { syncRecurringInvoices } from '@/app/actions';
import { Switch } from '@/components/ui/switch';
import { Progress } from '../ui/progress';
import { clearGlobalCache } from '@/hooks/use-smart-fetch';

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
  yearType = 'all',
  minYear,
}: {
  field: { value?: Date | null; onChange: (date: Date | null) => void };
  disabled?: boolean;
  yearType?: 'past' | 'future' | 'all';
  minYear?: number;
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

    const currentYear = new Date().getFullYear();
    const years = useMemo(() => {
        let yearList: number[] = [];
        if (yearType === 'past') {
            yearList = Array.from({ length: 51 }, (_, i) => currentYear - i);
        } else if (yearType === 'future') {
            yearList = Array.from({ length: 21 }, (_, i) => currentYear + i);
        } else {
            yearList = Array.from({ length: 31 }, (_, i) => currentYear - 10 + i);
        }

        if (minYear) {
            yearList = yearList.filter(y => y >= minYear);
            const currentLowest = yearList.length > 0 ? Math.min(...yearList) : currentYear;
            if (minYear < currentLowest) {
                for (let y = minYear; y < currentLowest; y++) {
                    yearList.push(y);
                }
                yearList.sort((a, b) => yearType === 'past' ? b - a : a - b);
            }
        }
        return yearList;
    }, [currentYear, yearType, minYear]);

    const thaiMonths = useMemo(() => Array.from({ length: 12 }, (_, i) => ({ value: i.toString(), label: format(new Date(2000, i, 1), 'LLLL', { locale: th }) })), []);
    const daysInMonthLimit = useMemo(() => (year && month) ? getDaysInMonth(new Date(parseInt(year), parseInt(month))) : 31, [month, year]);

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
        } else { field.onChange(null); }
    };

    return (
        <div className="grid grid-cols-3 gap-2">
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
                <FormControl><SelectTrigger className="h-11"><SelectValue placeholder="ปี" /></SelectTrigger></FormControl>
                <SelectContent>
                    {years.map((y) => (
                        <SelectItem key={y} value={y.toString()}>{y + 543}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}

const getStatusVariant = (status: string) => {
  switch (status) {
    case 'OPERATING': return 'success';
    case 'FOLLOW_UP': return 'warning';
    case 'SUSPENDED': return 'secondary';
    case 'CLOSED': return 'destructive';
    default: return 'default';
  }
};

const getStatusText = (status: string) => {
  switch (status) {
    case 'OPERATING': return 'ดำเนินกิจการ';
    case 'FOLLOW_UP': return 'ต้องติดตาม';
    case 'SUSPENDED': return 'พักกิจการชั่วคราว';
    case 'CLOSED': return 'ปิดกิจการ';
    default: return status || 'เลือกสถานะ';
  }
};

const lalamoveVehicleSchema = z.object({
  id: z.string(),
  type: z.string().min(1, 'กรุณาระบุประเภทระ'),
  price: z.coerce.number().min(0, 'ต้องไม่ติดลบ'),
  maxCapacity: z.coerce.number().min(0.1, 'ต้องมากกว่า 0'),
});

const recurringFeeRuleSchema = z.object({
  id: z.string(),
  label: z.string().min(1, 'กรุณาระบุชื่อรายการ'),
  amount: z.coerce.number().min(0, 'ยอดเงินต้องไม่ติดลบ'),
  cycle: z.enum(['MONTHLY', 'YEARLY', 'NONE']),
  gracePeriodDays: z.coerce.number().min(0, 'ต้องไม่ติดลบ').default(7),
  nextBillingDate: z.date().nullable().optional(),
  billingEndDate: z.date().nullable().optional(),
});

const contractRecordSchema = z.object({
  id: z.string(),
  documentIds: z.array(z.string().trim().min(1, 'กรุณากรอกรหัสเอกสาร')).min(1, 'ต้องมีรหัสเอกสารอย่างน้อย 1 รายการ'),
  startDate: z.date().nullable().refine(val => val !== null, 'กรุณาเลือกวันเริ่มสัญญา'),
  expiryDate: z.date().nullable().refine(val => val !== null, 'กรุณาเลือกวันหมดสัญญา'),
  notes: z.string().optional(),
  securityDeposit: z.coerce.number().min(0, 'ยอดเงินประกันต้องไม่ติดลบ').default(0),
  interestRate: z.coerce.number().min(0, 'ดอกเบี้ยต้องไม่ติดลบ').default(4.5),
  recurringFees: z.array(recurringFeeRuleSchema).default([]),
  status: z.enum(['ACTIVE', 'CANCELLED']).default('ACTIVE'),
}).superRefine((data, ctx) => {
    if (data.startDate && data.expiryDate && data.expiryDate < data.startDate) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "วันหมดสัญญาต้องไม่ก่อนวันเริ่มสัญญา",
            path: ["expiryDate"],
        });
    }
});

const formSchema = z.object({
  name: z.string().min(1, 'กรุณากรอกชื่อสาขา'),
  ownerId: z.string().optional(),
  ownerName: z.string().optional(),
  type: z.enum(['MAIN', 'SUB']),
  address: z.string().min(1, 'กรุณากรอกที่อยู่'),
  phone: z.string().min(1, 'กรุณากรอกเบอร์โทรศัพท์สาขา'),
  subdistrict: z.string().min(1, 'กรุณากรอกตำบล/แขวง'),
  district: z.string().min(1, 'กรุณากรอกอำเภอ/เขต'),
  province: z.string().min(1, 'กรุณาเลือกจังหวัด'),
  postalCode: z.string().min(1, 'กรุณากรอกรหัสไปรษณีย์'),
  country: z.string().min(1, 'กรุณาเลือกประเทศ'),
  googleMapsUrl: z.string().url('ลิงก์ Google Maps ไม่ถูกต้อง').min(1, 'กรุณากรอกลิงก์ Google Maps สำหรับจัดส่ง'),
  contracts: z.array(contractRecordSchema).default([]),
  freeShippingEnabled: z.boolean().default(false),
  lalamoveConfig: z.object({
    enabled: z.boolean().default(false),
    vehicles: z.array(lalamoveVehicleSchema).default([]),
  }).optional(),
  status: z.enum(['OPERATING', 'FOLLOW_UP', 'SUSPENDED', 'CLOSED']),
  imageUrl: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function BranchForm({ initialData, readOnly }: { initialData?: Branch, readOnly?: boolean }) {
  const { toast } = useToast();
  const router = useRouter();
  const firestore = useFirestore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditMode = !!initialData;
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [nextPath, setNextPath] = useState<string | null>(null);
  
  const [editingContractIndices, setEditingContractIndices] = useState<number[]>([]);
  const [editingFeeIndices, setEditingFeeIndices] = useState<string[]>([]);
  const [isEditingStatus, setIsEditingStatus] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '', ownerId: '', ownerName: '', type: 'SUB', address: '', phone: '', subdistrict: '', district: '', province: '', postalCode: '', country: '', googleMapsUrl: '', 
      status: undefined as any, imageUrl: '', contracts: [], freeShippingEnabled: false, lalamoveConfig: { enabled: false, vehicles: [] },
    },
  });

  const { formState: { isDirty }, control, watch, setValue, reset, trigger, getValues } = form;
  const { fields: contractFields, append: appendContract, remove: removeContract } = useFieldArray({ control, name: "contracts" });
  const { fields: lalamoveFields, replace: replaceVehicles } = useFieldArray({ control, name: "lalamoveConfig.vehicles" });

  const currentName = watch('name');
  const currentType = watch('type');
  const currentOwnerId = watch('ownerId');
  useEffect(() => {
    if (!isEditMode || !initialData || isDirty) return;
    if (currentName !== initialData.name) setValue('name', initialData.name, { shouldDirty: false });
    if (currentType !== initialData.type) setValue('type', initialData.type, { shouldDirty: false });
    if (currentOwnerId !== initialData.ownerId) {
        setValue('ownerId', initialData.ownerId, { shouldDirty: false });
        setValue('ownerName', initialData.ownerName, { shouldDirty: false });
    }
  }, [initialData, currentName, currentType, currentOwnerId, isDirty, isEditMode, setValue]);

  const currentAddress = watch('address');
  const currentProvince = watch('province');
  const currentPhone = watch('phone');
  useEffect(() => {
    if (!isEditMode || !initialData || isDirty) return;
    if (currentAddress !== initialData.address) setValue('address', initialData.address, { shouldDirty: false });
    if (currentProvince !== initialData.province) setValue('province', initialData.province, { shouldDirty: false });
    if (currentPhone !== initialData.phone) setValue('phone', initialData.phone, { shouldDirty: false });
    
    const fields: (keyof FormValues)[] = ['subdistrict', 'district', 'postalCode', 'country', 'googleMapsUrl', 'imageUrl'];
    fields.forEach(f => {
        const val = (initialData as any)[f];
        if (val !== undefined && watch(f) !== val) setValue(f, val, { shouldDirty: false });
    });
  }, [initialData, currentAddress, currentProvince, currentPhone, isDirty, isEditMode, setValue, watch]);

  const currentFreeShipping = watch('freeShippingEnabled');
  const currentLalamoveEnabled = watch('lalamoveConfig.enabled');
  useEffect(() => {
    if (!isEditMode || !initialData || isDirty) return;
    const dbFreeShip = !!initialData.freeShippingEnabled;
    const dbLalamove = initialData.lalamoveConfig || { enabled: false, vehicles: [] };
    if (currentFreeShipping !== dbFreeShip) setValue('freeShippingEnabled', dbFreeShip, { shouldDirty: false });
    if (currentLalamoveEnabled !== dbLalamove.enabled) setValue('lalamoveConfig.enabled', dbLalamove.enabled, { shouldDirty: false });
    const currentVehiclesJSON = JSON.stringify(watch('lalamoveConfig.vehicles') || []);
    const dbVehiclesJSON = JSON.stringify(dbLalamove.vehicles || []);
    if (currentVehiclesJSON !== dbVehiclesJSON) replaceVehicles(dbLalamove.vehicles || []);
  }, [initialData, currentFreeShipping, currentLalamoveEnabled, isDirty, isEditMode, setValue, watch, replaceVehicles]);

  const currentContracts = watch('contracts');
  useEffect(() => {
    if (!isEditMode || !initialData?.contracts || isDirty) return;
    const preparedContracts = initialData.contracts.map(c => ({
        ...c,
        id: c.id || uuidv4(),
        status: (c.status as string)?.toUpperCase() as any || 'ACTIVE',
        securityDeposit: c.securityDeposit || 0,
        interestRate: c.interestRate ?? 4.5,
        documentIds: c.documentIds || [],
        startDate: c.startDate?.toDate ? c.startDate.toDate() : (c.startDate ? new Date(c.startDate) : null),
        expiryDate: c.expiryDate?.toDate ? c.expiryDate.toDate() : (c.expiryDate ? new Date(c.expiryDate) : null),
        recurringFees: (c.recurringFees || []).map(f => ({
          ...f,
          id: f.id || uuidv4(),
          gracePeriodDays: f.gracePeriodDays ?? 7,
          nextBillingDate: f.nextBillingDate?.toDate ? f.nextBillingDate.toDate() : (f.nextBillingDate ? new Date(f.nextBillingDate) : null),
          billingEndDate: f.billingEndDate?.toDate ? f.billingEndDate.toDate() : (f.billingEndDate ? new Date(f.billingEndDate) : null),
        })),
    }));
    if (JSON.stringify(currentContracts) !== JSON.stringify(preparedContracts)) setValue('contracts', preparedContracts, { shouldDirty: false });
  }, [initialData, currentContracts, isDirty, isEditMode, setValue]);

  const currentStatus = watch('status');
  const dbStatus = useMemo(() => initialData?.status?.toUpperCase(), [initialData?.status]);
  useEffect(() => {
    if (!isEditMode || !dbStatus || isEditingStatus) return;
    if (currentStatus !== dbStatus) setValue('status', dbStatus as any, { shouldDirty: false });
  }, [dbStatus, currentStatus, isEditMode, isEditingStatus, setValue]);

  useEffect(() => {
    if (readOnly) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => { if (isDirty && !isSubmitting) { event.preventDefault(); event.returnValue = ''; } };
    const handleAnchorClick = (event: MouseEvent) => {
      const target = event.currentTarget as HTMLAnchorElement;
      const targetUrl = new URL(target.href);
      const currentUrl = new URL(window.location.href);
      if (targetUrl.origin !== window.location.origin) return;
      if (isDirty && !isSubmitting && target.href !== window.location.href) { event.preventDefault(); setNextPath(target.href); setShowUnsavedDialog(true); }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.querySelectorAll('a').forEach(a => a.addEventListener('click', handleAnchorClick));
    return () => { window.removeEventListener('beforeunload', handleBeforeUnload); document.querySelectorAll('a').forEach(a => a.removeEventListener('click', handleAnchorClick)); };
  }, [isDirty, isSubmitting, readOnly]);

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    if (readOnly) return;
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 1024) {
        toast({ variant: 'destructive', title: 'ไฟล์ใหญ่เกินไป', description: 'กรุณาใช้รูปภาพขนาดไม่เกิน 1MB' });
        return;
      }
      const reader = new FileReader();
      reader.onload = () => { setValue('imageUrl', reader.result as string, { shouldDirty: true }); };
      reader.readAsDataURL(file);
    }
  };

  const saveBranch = async (values: FormValues) => {
    if (!firestore || readOnly) return false;
    const processedContracts = (values.contracts || []).map(c => ({
        ...c,
        id: c.id || uuidv4(),
        recurringFees: (c.recurringFees || []).map(f => ({
            ...f,
            id: f.id || uuidv4(),
            billingEndDate: c.expiryDate
        }))
    }));
    const latestActiveContract = [...processedContracts]
        .filter(c => c.status === 'ACTIVE')
        .sort((a, b) => {
            const dateA = a.expiryDate ? new Date(a.expiryDate).getTime() : 0;
            const dateB = b.expiryDate ? new Date(b.expiryDate).getTime() : 0;
            return dateB - dateA;
        })[0];
    const sanitizedValues = {
        ...values,
        contracts: processedContracts,
        securityDeposit: latestActiveContract?.securityDeposit || 0,
        recurringFees: latestActiveContract 
            ? (latestActiveContract.recurringFees || []).map(f => ({
                ...f,
                billingEndDate: latestActiveContract.expiryDate
            }))
            : [],
        updatedAt: serverTimestamp()
    };
    try {
      let activeId = '';
      if (isEditMode) { 
        activeId = initialData!.id;
        await updateDoc(doc(firestore, 'branches', activeId), sanitizedValues); 
      } else {
        const branchCode = await runTransaction(firestore, async (transaction) => {
          const counterDoc = await transaction.get(doc(firestore, 'counters', 'branchCounter'));
          const newCount = (counterDoc.exists() ? counterDoc.data().count : 0) + 1;
          transaction.set(doc(firestore, 'counters', 'branchCounter'), { count: newCount }, { merge: true });
          return `BR-${new Date().getFullYear() + 543}-${String(newCount).padStart(4, '0')}`;
        });
        const newBranchRef = doc(collection(firestore, 'branches'));
        activeId = newBranchRef.id;
        await setDoc(newBranchRef, { ...sanitizedValues, id: newBranchRef.id, branchCode, createdAt: serverTimestamp() });
      }
      
      clearGlobalCache('branches-data');
      clearGlobalCache('branch-insights-data');

      if (processedContracts.length > 0) await syncRecurringInvoices(activeId);
      toast({ title: 'บันทึกสำเร็จ' }); 
      return true;
    } catch (error: any) { 
        console.error("Save branch error:", error);
        toast({ variant: 'destructive', title: 'เกิดข้อผิดพลาด', description: error.message }); 
        return false; 
    }
  };

  async function onSubmit(values: FormValues) {
    if (readOnly) return;
    if (editingContractIndices.length > 0) { toast({ variant: 'destructive', title: 'กรุณากด "ตกลง" ที่รายการสัญญาที่ค้างอยู่' }); return; }
    if (editingFeeIndices.length > 0) { toast({ variant: 'destructive', title: 'กรุณากด "ตกลง" ที่รายการค่าธรรมเนียมที่ค้างอยู่' }); return; }
    setIsSubmitting(true);
    const success = await saveBranch(values);
    if (success) setTimeout(() => router.push('/dashboard/branches'), 50);
    setIsSubmitting(false);
  }

  const toggleEditContract = (index: number) => setEditingContractIndices(prev => prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]);
  const handleConfirmContract = async (index: number) => { if (await form.trigger(`contracts.${index}`)) toggleEditContract(index); };
  const toggleEditFee = (path: string) => setEditingFeeIndices(prev => prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]);
  const handleConfirmFee = async (contractIdx: number, feeIdx: number) => {
      const path = `contracts.${contractIdx}.recurringFees.${feeIdx}`;
      if (await trigger(path as any)) toggleEditFee(`${contractIdx}-${feeIdx}`);
  };

  const handleRemoveContract = (index: number) => {
    if (readOnly) return;
    removeContract(index);
    setEditingContractIndices(prev => prev.filter(i => i !== index).map(i => i > index ? i - 1 : i));
    setEditingFeeIndices(prev => prev.filter(p => !p.startsWith(`${index}-`)).map(p => { const [cIdx, fIdx] = p.split('-').map(Number); return cIdx > index ? `${cIdx - 1}-${fIdx}` : p; }));
  };

  const handleRemoveFee = (contractIdx: number, feeIdx: number) => {
    if (readOnly) return;
    const currentFees = getValues(`contracts.${contractIdx}.recurringFees`) || [];
    const newFees = [...currentFees];
    newFees.splice(feeIdx, 1);
    setValue(`contracts.${contractIdx}.recurringFees`, newFees, { shouldDirty: true });
    setEditingFeeIndices(prev => prev.filter(p => p !== `${contractIdx}-${feeIdx}`));
  };

  const interestStats = useMemo(() => {
    const contracts = (watch('contracts') || []).filter(c => c.status === 'ACTIVE');
    const now = new Date();
    let totalAccrued = 0, totalMaturity = 0, lastDeposit = 0;
    contracts.forEach(c => {
        const start = c.startDate, end = c.expiryDate;
        if (!start || !end) return;
        const rate = (c.interestRate ?? 4.5) / 100, principal = c.securityDeposit || 0;
        lastDeposit = principal;
        const totalPeriodDays = Math.max(0, differenceInCalendarDays(new Date(end), new Date(start)));
        totalMaturity += principal * rate * (totalPeriodDays / 365);
        const effectiveEnd = now > end ? end : now;
        const accruedPeriodDays = Math.max(0, differenceInCalendarDays(new Date(effectiveEnd), new Date(start)));
        if (accruedPeriodDays > 0) totalAccrued += principal * rate * (accruedPeriodDays / 365);
    });
    return { accrued: totalAccrued, maturity: totalMaturity, principal: lastDeposit };
  }, [watch('contracts')]);

  const isLalamoveEnabled = watch('lalamoveConfig.enabled');

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {readOnly && (
            <Alert className="bg-primary/5 border-primary/20 border-l-4 border-l-primary shadow-sm">
                <Info className="h-4 w-4 text-primary" />
                <AlertTitle className="font-bold">โหมดดูข้อมูลสาขา</AlertTitle>
                <AlertDescription className="text-xs">คุณกำลังดูรายละเอียดข้อมูลสาขาของคุณเองในโหมดอ่านอย่างเดียว หากต้องการแก้ไขข้อมูลสำคัญ กรุณาติดต่อแอดมินสำนักงานใหญ่ครับ</AlertDescription>
            </Alert>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader><CardTitle>ข้อมูลทั่วไป</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField name="name" control={form.control} render={({ field }) => (
                    <FormItem><FormLabel>ชื่อสาขา <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="สาขาอารีย์" {...field} disabled={readOnly} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField name="type" control={form.control} render={({ field }) => (
                    <FormItem>
                      <FormLabel>ประเภทสาขา <span className="text-destructive">*</span></FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={readOnly}>
                        <FormControl><SelectTrigger className="h-11"><SelectValue placeholder="เลือกประเภท" /></SelectTrigger></FormControl>
                        <SelectContent><SelectItem value="MAIN">สาขาแม่</SelectItem><SelectItem value="SUB">สาขาลูก</SelectItem></SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <FormField name="ownerId" control={form.control} render={({ field }) => (<FormItem><FormLabel className="flex items-center gap-2"><User className="h-4 w-4" /><span>เจ้าของสาขา</span></FormLabel><FormControl><UserCombobox value={field.value} initialName={watch('ownerName')} onChange={(id, name) => { form.setValue('ownerId', id, { shouldDirty: true }); form.setValue('ownerName', name, { shouldDirty: true }); }} disabled={readOnly} /></FormControl><FormMessage /></FormItem>)} />
                <FormField name="address" control={form.control} render={({ field }) => (<FormItem><FormLabel>ที่อยู่ (เลขที่, ถนน) <span className="text-destructive">*</span></FormLabel><FormControl><Textarea rows={2} {...field} disabled={readOnly} /></FormControl><FormMessage /></FormItem>)} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField name="subdistrict" control={form.control} render={({ field }) => (<FormItem><FormLabel>ตำบล/แขวง <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} disabled={readOnly} /></FormControl><FormMessage /></FormItem>)} />
                  <FormField name="district" control={form.control} render={({ field }) => (<FormItem><FormLabel>อำเภอ/เขต <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} disabled={readOnly} /></FormControl><FormMessage /></FormItem>)} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField name="province" control={form.control} render={({ field }) => (<FormItem><FormLabel>จังหวัด <span className="text-destructive">*</span></FormLabel><ProvinceCombobox value={field.value} onChange={field.onChange} disabled={readOnly} /><FormMessage /></FormItem>)} />
                  <FormField name="postalCode" control={form.control} render={({ field }) => (<FormItem><FormLabel>รหัสไปรษณีย์ <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} disabled={readOnly} /></FormControl><FormMessage /></FormItem>)} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField name="country" control={form.control} render={({ field }) => (<FormItem><FormLabel>ประเทศ <span className="text-destructive">*</span></FormLabel><CountryCombobox value={field.value} onChange={field.onChange} disabled={readOnly} /><FormMessage /></FormItem>)} />
                  <FormField name="phone" control={form.control} render={({ field }) => (<FormItem><FormLabel>เบอร์โทรศัพท์สาขา <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} disabled={readOnly} /></FormControl><FormMessage /></FormItem>)} />
                </div>
                <FormField name="googleMapsUrl" control={form.control} render={({ field }) => (<FormItem><FormLabel>ลิงก์ Google Maps <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="https://maps.app.goo.gl/..." {...field} disabled={readOnly} /></FormControl><FormMessage /></FormItem>)} />
              </CardContent>
            </Card>

            <Card className="border-emerald-200">
              <CardHeader className="bg-emerald-50/50 rounded-t-lg border-b border-emerald-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-emerald-600" /><CardTitle className="text-lg">สิทธิ์การจัดส่งฟรี</CardTitle></div>
                  <FormField name="freeShippingEnabled" control={form.control} render={({ field }) => (
                    <FormItem className="flex items-center gap-2 space-y-0">
                      <FormLabel className="text-sm font-bold">{field.value ? 'เปิดใช้' : 'ปิดอยู่'}</FormLabel>
                      <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={readOnly} /></FormControl>
                    </FormItem>
                  )} />
                </div>
                <CardDescription>หากเปิดใช้งาน สาขานี้จะไม่เสียค่าจัดส่งในทุกออเดอร์ (ระบุเป็นกรณีพิเศษ)</CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-blue-200">
              <CardHeader className="bg-blue-50/50 rounded-t-lg border-b border-blue-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><Truck className="h-5 w-5 text-blue-600" /><CardTitle className="text-lg">ระบบขนส่ง Lalamove</CardTitle></div>
                  <FormField name="lalamoveConfig.enabled" control={form.control} render={({ field }) => (<FormItem className="flex items-center gap-2 space-y-0"><FormLabel className="text-sm font-bold">{field.value ? 'เปิดใช้' : 'ปิดอยู่'}</FormLabel><FormControl><Switch checked={field.value} onCheckedChange={(checked) => { field.onChange(checked); if (checked) { const types = ['รถเก๋ง', 'รถเอสยูวี', 'รถกระบะ', 'รถกระบะตู้ทึบ']; const caps: Record<string, number> = { 'รถเก๋ง': 2, 'รถเอสยูวี': 4, 'รถกระบะ': 8, 'รถกระบะตู้ทึบ': 12 }; const cur = getValues('lalamoveConfig.vehicles') || []; const next = types.filter(t => !cur.some(v => v.type === t)).map(type => ({ id: uuidv4(), type, price: 0, maxCapacity: caps[type] })); replaceVehicles([...cur, ...next].sort((a, b) => types.indexOf(a.type) - types.indexOf(b.type))); } }} disabled={readOnly} /></FormControl></FormItem>)} />
                </div>
                <CardDescription>ตั้งค่าพาหนะและค่าบริการสำหรับจัดส่งด่วนผ่าน Lalamove</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                {isLalamoveEnabled ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1fr] gap-4 px-2 py-2 text-xs font-bold text-muted-foreground uppercase tracking-wider border-b"><div>ประเภทรถ</div><div className="text-center">ค่าบริการ (บาท)</div><div className="text-center">ความจุสูงสุด (หน่วย)</div></div>
                    {lalamoveFields.map((field, index) => (
                      <div key={field.id} className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1fr] gap-4 items-center py-2 border-b last:border-0 border-muted/20"><div className="font-bold text-sm text-foreground px-2">{watch(`lalamoveConfig.vehicles.${index}.type`)}</div><FormField name={`lalamoveConfig.vehicles.${index}.price`} control={form.control} render={({ field }) => (<FormItem className="space-y-0"><FormControl><NumericInput className="h-10 text-center font-bold text-blue-600" {...field} disabled={readOnly} /></FormControl><FormMessage /></FormItem>)} /><FormField name={`lalamoveConfig.vehicles.${index}.maxCapacity`} control={form.control} render={({ field }) => (<FormItem className="space-y-0"><FormControl><NumericInput className="h-10 text-center" {...field} disabled={readOnly} /></FormControl><FormMessage /></FormItem>)} /></div>
                    ))}
                  </div>
                ) : (<div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg bg-muted/5"><Car className="h-10 w-10 mx-auto mb-2 opacity-20" /><p className="text-sm">ระบบ Lalamove ปิดใช้งานอยู่ ลูกค้าจะใช้ได้เพียงการส่งพัสดุปกติ</p></div>)}
              </CardContent>
            </Card>

            <div className="space-y-4">
                <div className="flex justify-between items-center px-1"><h3 className="text-xl font-bold flex items-center gap-2"><FileText className="text-primary h-6 w-6" /> ประวัติสัญญาและการเงิน</h3>{!readOnly && (<Button type="button" variant="outline" size="sm" onClick={() => { const idx = contractFields.length; const prev = idx > 0 ? watch(`contracts.${idx-1}`) : null; appendContract({ id: uuidv4(), documentIds: [''], startDate: null, expiryDate: null, notes: '', securityDeposit: prev?.securityDeposit || 0, interestRate: prev?.interestRate || 4.5, status: 'ACTIVE', recurringFees: (prev?.recurringFees || []).map(f => ({ ...f, id: uuidv4() })) }); setEditingContractIndices(p => [...p, idx]); }}><PlusCircle className="mr-2 h-4 w-4" /> เพิ่มสัญญาฉบับใหม่</Button>)}</div>
                {contractFields.map((contractField, contractIdx) => {
                  const isEditing = editingContractIndices.includes(contractIdx) && !readOnly;
                  const data = watch(`contracts.${contractIdx}`);
                  const isActive = data.status === 'ACTIVE';
                  if (!isEditing) return (<div key={contractField.id} className={cn("group relative p-5 border rounded-xl bg-card hover:border-primary/50 transition-all shadow-sm", !isActive && "opacity-60 bg-muted/20")}><div className="flex justify-between items-start"><div className="space-y-3 flex-1"><div className="flex flex-wrap items-center gap-3"><span className="font-bold text-lg">ฉบับ: {(data.documentIds || []).join(', ') || '-'}</span>{isActive ? (<Badge className="bg-emerald-500 hover:bg-emerald-500 text-white border-none flex gap-1.5 items-center h-6 px-2.5 whitespace-nowrap shrink-0"><Power className="h-3 w-3" /> กำลังใช้งาน</Badge>) : (<Badge variant="outline" className="text-destructive border-destructive flex gap-1.5 items-center h-6 px-2.5 whitespace-nowrap shrink-0"><PowerOff className="h-3 w-3" /> ยกเลิกสัญญา</Badge>)}</div><div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-xs"><div><p className="text-muted-foreground uppercase tracking-wider font-bold text-[10px]">เริ่มสัญญา</p><p className="font-medium mt-0.5">{data.startDate ? format(new Date(data.startDate), 'dd/MM/') + (new Date(data.startDate).getFullYear() + 543) : '-'}</p></div><div><p className="text-muted-foreground uppercase tracking-wider font-bold text-[10px]">หมดสัญญา</p><p className="font-medium mt-0.5">{data.expiryDate ? format(new Date(data.expiryDate), 'dd/MM/') + (new Date(data.expiryDate).getFullYear() + 543) : '-'}</p></div><div><p className="text-muted-foreground uppercase tracking-wider font-bold text-[10px]">เงินประกัน</p><p className="font-bold text-primary mt-0.5">฿{(data.securityDeposit || 0).toLocaleString()}</p></div><div><p className="text-muted-foreground uppercase tracking-wider font-bold text-[10px]">ดอกเบี้ย</p><p className="font-bold text-blue-600 mt-0.5">{data.interestRate || 0}% ต่อปี</p></div><div><p className="text-muted-foreground uppercase tracking-wider font-bold text-[10px]">ค่าธรรมเนียม</p><p className="font-medium mt-0.5">{data.recurringFees?.length || 0} รายการ</p></div></div></div>{!readOnly && (<div className="flex gap-2"><Button type="button" variant="ghost" size="sm" onClick={() => toggleEditContract(contractIdx)} className="h-8"><Edit2 className="h-3.5 w-3.5 mr-1.5" /> แก้ไข</Button><Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveContract(contractIdx)} className="h-8 w-8 text-destructive" disabled={contractFields.length === 1 && !isEditMode}><Trash2 className="h-4 w-4" /></Button></div>)}</div></div>);
                  return (<Card key={contractField.id} className="border-2 border-primary shadow-lg overflow-hidden"><div className="bg-primary px-4 py-2 flex justify-between items-center"><span className="text-primary-foreground font-bold text-sm">กำลังแก้ไขข้อมูลรอบสัญญา</span><Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveContract(contractIdx)} className="text-primary-foreground hover:bg-white/20" disabled={contractFields.length === 1 && !isEditMode}><Trash2 className="h-4 w-4" /></Button></div><CardContent className="p-6 space-y-8"><div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b"><FormField name={`contracts.${contractIdx}.status`} control={form.control} render={({ field }) => (<FormItem><FormLabel className="font-bold text-primary">สถานะสัญญาฉบับนี้</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={readOnly}><FormControl><SelectTrigger className="h-11 border-2"><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="ACTIVE" className="text-emerald-600 font-bold">ปกติ (ACTIVE)</SelectItem><SelectItem value="CANCELLED" className="text-destructive font-bold">ยกเลิก (CANCELLED)</SelectItem></SelectContent></Select><FormDescription>หากยกเลิกสัญญา ระบบจะหยุดการออกบิลทั้งหมดของสัญญานนี้ทันที</FormDescription></FormItem>)} /></div><div className="space-y-4"><div className="flex items-center gap-2 text-primary font-bold"><FileText className="h-4 w-4" /> ข้อมูลเอกสารสัญญา <span className="text-destructive">*</span></div><div className="space-y-2">{(data.documentIds || []).map((_, docIdx) => (<FormField key={`${contractField.id}-doc-${docIdx}`} name={`contracts.${contractIdx}.documentIds.${docIdx}`} control={form.control} render={({ field: docField }) => (<div className="flex gap-2"><FormControl><Input placeholder="เลขที่เอกสาร" className="h-11" {...docField} disabled={readOnly} /></FormControl>{!readOnly && (<Button type="button" variant="ghost" size="icon" onClick={() => { const current = [...(data.documentIds || [])]; if (current.length > 1) { current.splice(docIdx, 1); setValue(`contracts.${contractIdx}.documentIds`, current); } }} disabled={(data.documentIds || []).length === 1}><X className="h-4 w-4" /></Button>)}</div>)} />))}{!readOnly && (<Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs font-bold text-primary" onClick={() => { const current = [...(data.documentIds || [])]; current.push(''); setValue(`contracts.${contractIdx}.documentIds`, current); }}><PlusCircle className="mr-1 h-3 w-3" /> เพิ่มเลขที่เอกสาร</Button>)}<FormField name={`contracts.${contractIdx}.documentIds`} control={form.control} render={({ fieldState: { error } }) => (<p className="text-[0.8rem] font-medium text-destructive">{error?.message}</p>)} /></div><div className="grid grid-cols-1 md:grid-cols-2 gap-6"><FormField name={`contracts.${contractIdx}.startDate`} control={form.control} render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>วันเริ่มสัญญา <span className="text-destructive">*</span></FormLabel><DateDropdownPicker field={field} disabled={readOnly} /><FormMessage /></FormItem>)} /><FormField name={`contracts.${contractIdx}.expiryDate`} control={form.control} render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>วันหมดสัญญา <span className="text-destructive">*</span></FormLabel><DateDropdownPicker field={field} disabled={readOnly} /><FormMessage /></FormItem>)} /></div></div><div className="space-y-6 pt-6 border-t"><div className="flex items-center gap-2 text-primary font-bold"><Banknote className="h-4 w-4" /> เงื่อนไขการเงินในรอบสัญญานี้</div><div className="grid grid-cols-1 md:grid-cols-2 gap-6"><FormField name={`contracts.${contractIdx}.securityDeposit`} control={form.control} render={({ field }) => (<FormItem><FormLabel>เงินประกันแบรนด์สำหรับรอบนี้ (บาท)</FormLabel><FormControl><NumericInput placeholder="0.00" className="h-11 font-bold text-primary" {...field} disabled={readOnly} /></FormControl><FormMessage /></FormItem>)} /><FormField name={`contracts.${contractIdx}.interestRate`} control={form.control} render={({ field }) => (<FormItem><FormLabel>อัตราดอกเบี้ยต่อปี (%)</FormLabel><FormControl><div className="relative"><Percent className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><NumericInput placeholder="4.5" className="h-11 font-bold text-blue-600 pr-10" {...field} disabled={readOnly} /></div></FormControl><FormDescription>ดอกเบี้ยแบบต้น คิดจากเงินประกันในรอบนี้</FormDescription><FormMessage /></FormItem>)} /></div><div className="space-y-4"><div className="flex justify-between items-center px-1"><div className="flex items-center gap-2 font-bold text-primary"><ReceiptText className="h-4 w-4" /> รายการเรียกเก็บเงินค่าธรรมเนียม</div>{!readOnly && (<Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => { const current = [...(data.recurringFees || [])]; const newIdx = current.length; current.push({ id: uuidv4(), label: '', amount: 0, cycle: 'MONTHLY', gracePeriodDays: 7, nextBillingDate: data.startDate, billingEndDate: data.expiryDate }); setValue(`contracts.${contractIdx}.recurringFees`, current, { shouldDirty: true }); toggleEditFee(`${contractIdx}-${newIdx}`); }}><PlusCircle className="mr-1.5 h-3.5 w-3.5" /> เพิ่มรายการ</Button>)}</div><div className="space-y-3">{(data.recurringFees || []).map((fee, feeIdx) => { const feeKey = `${contractIdx}-${feeIdx}`; const isEditingFee = editingFeeIndices.includes(feeKey) && !readOnly; if (!isEditingFee) return (<div key={feeIdx} className="group relative p-4 border rounded-lg bg-muted/10 transition-all border-l-4 border-l-primary"><div className="flex justify-between items-center"><div className="flex-1 space-y-1.5"><div className="flex items-center gap-2"><span className="font-bold text-base text-primary/90">{fee.label || 'ไม่ระบุชื่อรายการ'}</span><Badge variant="outline" className="text-[10px] h-5 bg-background">{fee.cycle === 'MONTHLY' ? 'รายเดือน' : fee.cycle === 'YEARLY' ? 'รายปี' : 'ครั้งเดียว'}</Badge><Badge variant="secondary" className="text-[10px] h-5 gap-1"><Clock className="h-3 w-3" /> ชำระใน {fee.gracePeriodDays} วัน</Badge></div><p className="text-xs text-foreground/70 flex items-center gap-1.5 font-medium"><Calendar className="h-3.5 w-3.5 text-primary/60" /> เริ่มบิลแรก <span className="text-foreground font-bold">{fee.nextBillingDate ? format(new Date(fee.nextBillingDate), 'd MMM ', { locale: th }) + (new Date(fee.nextBillingDate).getFullYear() + 543).toString().slice(-2) : '-'}</span> <span className="mx-1 opacity-30">•</span> สิ้นสุด <span className="text-foreground font-bold">{data.expiryDate ? format(new Date(data.expiryDate), 'd MMM ', { locale: th }) + (new Date(data.expiryDate).getFullYear() + 543).toString().slice(-2) : '-'}</span></p></div><div className="text-right flex items-center gap-4"><p className="font-bold text-lg text-primary">฿{(fee.amount || 0).toLocaleString()}</p>{!readOnly && (<Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={(e) => { e.stopPropagation(); handleRemoveFee(contractIdx, feeIdx); }}><Trash2 className="h-4 w-4" /></Button>)}</div></div></div>); return (<div key={feeIdx} className="p-5 border-2 border-dashed border-primary/30 rounded-xl space-y-5 bg-primary/5 relative animate-in fade-in slide-in-from-top-2 duration-300"><Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2 h-7 w-7 text-destructive" onClick={() => handleRemoveFee(contractIdx, feeIdx)}><Trash2 className="h-4 w-4" /></Button><div className="grid grid-cols-1 md:grid-cols-3 gap-5"><FormField name={`contracts.${contractIdx}.recurringFees.${feeIdx}.label`} control={form.control} render={({ field }) => (<FormItem><FormLabel className="text-xs">ชื่อรายการ</FormLabel><FeeItemCombobox value={field.value} onChange={field.onChange} disabled={readOnly} /><FormMessage /></FormItem>)} /><FormField name={`contracts.${contractIdx}.recurringFees.${feeIdx}.cycle`} control={form.control} render={({ field }) => (<FormItem><FormLabel className="text-xs">รอบการเก็บ</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={readOnly}><FormControl><SelectTrigger className="h-11"><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="NONE">ครั้งเดียว</SelectItem><SelectItem value="MONTHLY">รายเดือน</SelectItem><SelectItem value="YEARLY">รายปี</SelectItem></SelectContent></Select></FormItem>)} /><FormField name={`contracts.${contractIdx}.recurringFees.${feeIdx}.gracePeriodDays`} control={form.control} render={({ field }) => (<FormItem><FormLabel className="text-xs">ระยะเวลาให้ชำระ (วัน)</FormLabel><FormControl><div className="relative"><Clock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><NumericInput isDecimal={false} className="h-11 pr-10" {...field} disabled={readOnly} /></div></FormControl><FormDescription className="text-[10px]">นับจากวันที่ออกบิล</FormDescription></FormItem>)} /></div><div className="grid grid-cols-1 md:grid-cols-2 gap-5"><FormField name={`contracts.${contractIdx}.recurringFees.${feeIdx}.nextBillingDate`} control={form.control} render={({ field }) => (<FormItem className="flex flex-col"><FormLabel className="text-xs">วันที่เริ่มออกบิลย้อนหลัง/งวดแรก</FormLabel><DateDropdownPicker field={field} disabled={readOnly} /><FormMessage /></FormItem>)} /><FormField name={`contracts.${contractIdx}.recurringFees.${feeIdx}.amount`} control={form.control} render={({ field }) => (<FormItem className="text-xs"><FormLabel>ยอดเงิน (บาท)</FormLabel><FormControl><NumericInput className="h-11 font-bold" {...field} disabled={readOnly} /></FormControl><FormMessage /></FormItem>)} /></div>{!readOnly && (<div className="flex justify-end gap-4 pt-2"><Button type="button" onClick={() => handleConfirmFee(contractIdx, feeIdx)} size="sm" className="w-full sm:w-auto h-9 shrink-0"><Check className="mr-2 h-4 w-4" /> ตกลงรายการนี้</Button></div>)}</div>); })}</div></div></div>{!readOnly && (<div className="pt-6 border-t flex justify-end gap-2"><Button type="button" size="lg" onClick={() => handleConfirmContract(contractIdx)}><Check className="mr-2 h-5 w-5" /> ตกลงข้อมูลสัญญานี้</Button></div>)}</CardContent></Card>); })}
                {contractFields.length === 0 && <div className="text-center py-12 border-2 border-dashed rounded-xl text-muted-foreground bg-muted/5">ยังไม่มีข้อมูลสัญญา</div>}<div className="px-1"><FormField name="contracts" control={form.control} render={() => <FormMessage />} /></div>
            </div>
          </div>

          <div className="space-y-6">
            <Card><CardHeader><CardTitle>สรุปการเงินและประกัน</CardTitle><CardDescription>คำนวณจากข้อมูลในประวัติสัญญาทั้งหมด (เฉพาะฉบับที่ใช้งาน)</CardDescription></CardHeader><CardContent className="space-y-6"><div className="space-y-1"><Label className="text-xs text-muted-foreground">เงินประกันแบรนด์รวม</Label><p className="text-3xl font-bold text-primary">฿{interestStats.principal.toLocaleString()}</p></div>{interestStats.principal > 0 && (<div className="bg-muted/30 border rounded-lg p-4 space-y-3"><div className="flex justify-between text-xs"><span className="text-muted-foreground">ดอกเบี้ยสะสมถึงวันนี้:</span><span className="font-bold text-emerald-600">฿{interestStats.accrued.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span></div><div className="flex justify-between text-xs"><span className="text-muted-foreground">ดอกเบี้ยรวมเมื่อจบสัญญา:</span><span className="font-bold text-blue-600">฿{interestStats.maturity.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span></div><div className="flex justify-between text-sm font-bold border-t pt-2"><span>ยอดคืนรวมเมื่อจบสัญญา:</span><span>฿{(interestStats.principal + interestStats.maturity).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span></div></div>)}</CardContent></Card>
            
            <Card>
              <CardHeader><CardTitle>สถานะและการควบคุม</CardTitle></CardHeader>
              <CardContent className="space-y-6">
                <FormField name="status" control={form.control} render={({ field }) => (
                  <FormItem>
                    <FormLabel>สถานะการดำเนินงาน <span className="text-destructive">*</span></FormLabel>
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
                          <Select onValueChange={(val) => { field.onChange(val); }} value={field.value} disabled={readOnly}>
                            <FormControl>
                              <SelectTrigger className="h-11">
                                <SelectValue placeholder="เลือกสถานะ" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="OPERATING">ดำเนินกิจการ</SelectItem>
                              <SelectItem value="FOLLOW_UP">ต้องติดตาม</SelectItem>
                              <SelectItem value="SUSPENDED">พักกิจการชั่วคราว</SelectItem>
                              <SelectItem value="CLOSED">ปิดกิจการ</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {isEditMode && isEditingStatus && (
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-11 w-11 shrink-0"
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
              </CardContent>
            </Card>

            <Card><CardHeader><CardTitle>รูปภาพสาขา</CardTitle></CardHeader><CardContent><div className="space-y-4">{watch('imageUrl') ? (<div className="relative aspect-video w-full overflow-hidden rounded-lg border"><img src={watch('imageUrl')} alt="Branch preview" className="h-full w-full object-cover" />{!readOnly && (<Button type="button" variant="destructive" size="icon" className="absolute top-2 right-2 h-8 w-8 rounded-full" onClick={() => form.setValue('imageUrl', '', { shouldDirty: true })}><X className="h-4 w-4" /></Button>)}</div>) : (<Label htmlFor="branch-image-upload" className={cn("flex aspect-video w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/25 transition-colors", readOnly ? "cursor-not-allowed opacity-50" : "hover:bg-muted/50")}><ImagePlus className="mb-2 h-10 w-10 text-muted-foreground opacity-40" /><span className="text-sm font-medium text-muted-foreground">อัปโหลดรูปภาพ</span>{!readOnly && <Input id="branch-image-upload" type="file" accept="image/*" className="sr-only" onChange={handleImageUpload} />}</Label>)}</div></CardContent></Card>
          </div>
        </div>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => router.back()}>{readOnly ? 'ปิดหน้าต่าง' : 'ยกเลิก'}</Button>{!readOnly && (<Button type="submit" size="lg" disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {isEditMode ? 'บันทึกการเปลี่ยนแปลงทั้งหมด' : 'สร้างสาขา'}</Button>)}</div>
      </form>
      <UnsavedChangesDialog ignoreClickEvents={true} isOpen={showUnsavedDialog} onOpenChange={setShowUnsavedDialog} onSaveAndExit={async () => { if (await saveBranch(form.getValues()) && nextPath) router.push(nextPath); }} onDiscardAndExit={() => nextPath && router.push(nextPath)} isSaving={isSubmitting} />
    </Form>
  );
}
