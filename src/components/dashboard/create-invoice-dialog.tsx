'use client';

import { useState, useEffect, useTransition, useMemo } from 'react';
import { CustomDialog } from './custom-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useFirestore } from '@/firebase';
import { collection, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { Branch } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Check, ChevronsUpDown } from 'lucide-react';
import { getBranches } from '@/app/actions';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, getDaysInMonth } from 'date-fns';
import { th } from 'date-fns/locale';

const formSchema = z.object({
  branchId: z.string().min(1, 'กรุณาเลือกสาขา'),
  amount: z.coerce.number().min(1, 'ยอดเงินต้องมากกว่า 0'),
  billingPeriod: z.string().min(1, 'กรุณาระบุรายการเรียกเก็บ'),
  dueDate: z.date({ required_error: 'กรุณาระบุวันครบกำหนด' }).nullable().refine(val => val !== null, 'กรุณาระบุวันครบกำหนด'),
});

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
                // Strip leading zeros but keep single zero or 0.
                v = v.replace(/^0+(?=\d)/, '');
                onChange(v);
            }}
        />
    );
};

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
    const years = useMemo(() => Array.from({ length: 11 }, (_, i) => currentYear + i), [currentYear]);
    const thaiMonths = useMemo(() => Array.from({ length: 12 }, (_, i) => ({
        value: i.toString(),
        label: format(new Date(2000, i, 1), 'MMMM', { locale: th }),
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
            const date = new Date(y, m, d);
            if (!isNaN(date.getTime())) field.onChange(date);
        } else field.onChange(null);
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

export function CreateInvoiceDialog({ isOpen, onClose, onSuccess }: { isOpen: boolean, onClose: () => void, onSuccess: () => void }) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const firestore = useFirestore();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      branchId: '',
      amount: 0,
      billingPeriod: '',
      dueDate: new Date(),
    },
  });

  useEffect(() => {
    if (isOpen) {
      const fetchBranches = async () => {
        setIsLoading(true);
        try {
          const data = await getBranches();
          setBranches(data);
        } catch (e) {
          console.error("Failed to fetch branches:", e);
        } finally {
          setIsLoading(false);
        }
      };
      fetchBranches();
    } else {
        setSearchTerm("");
        setIsPopoverOpen(false);
    }
  }, [isOpen]);

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!firestore || !values.dueDate) return;
    const branch = branches.find(b => b.id === values.branchId);
    if (!branch) return;

    startTransition(async () => {
      try {
        // Normalize due date to the VERY end of the day (23:59:59)
        const finalDueDate = new Date(values.dueDate);
        finalDueDate.setHours(23, 59, 59, 999);

        await addDoc(collection(firestore, 'feeInvoices'), {
          branchId: branch.id,
          branchName: branch.name,
          ownerId: branch.ownerId || '',
          amount: values.amount,
          status: 'PENDING',
          dueDate: Timestamp.fromDate(finalDueDate),
          billingPeriod: values.billingPeriod,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        toast({ title: 'ออกใบเรียกเก็บเงินสำเร็จ' });
        onSuccess();
        form.reset();
      } catch (error: any) {
        toast({ variant: 'destructive', title: 'เกิดข้อผิดพลาด', description: error.message });
      }
    });
  };

  const selectedBranchId = form.watch('branchId');
  const selectedBranch = branches.find(b => b.id === selectedBranchId);
  const filteredBranches = branches.filter(b => 
    b.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    b.branchCode.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <CustomDialog isOpen={isOpen} onClose={onClose} title="ออกใบเรียกเก็บเงินใหม่">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
          <FormField
            control={form.control}
            name="branchId"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>เลือกสาขา</FormLabel>
                <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        role="combobox"
                        className={cn(
                          "w-full justify-between h-11 text-left font-normal",
                          !field.value && "text-muted-foreground"
                        )}
                        disabled={isLoading}
                      >
                        {isLoading ? (
                            <div className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> กำลังโหลด...</div>
                        ) : selectedBranch 
                          ? `${selectedBranch.name} (${selectedBranch.branchCode})`
                          : "ค้นหาสาขา..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput 
                        placeholder="พิมพ์ชื่อสาขาหรือรหัสเพื่อค้นหา..." 
                        value={searchTerm}
                        onValueChange={setSearchTerm}
                      />
                      <CommandList>
                        {filteredBranches.length === 0 && (
                          <CommandEmpty>ไม่พบข้อมูลสาขา</CommandEmpty>
                        )}
                        <CommandGroup>
                          {filteredBranches.map((branch) => (
                            <CommandItem
                              key={branch.id}
                              value={branch.id}
                              onSelect={() => {
                                form.setValue("branchId", branch.id);
                                if (branch.recurringFees && branch.recurringFees.length > 0) {
                                    const firstFee = branch.recurringFees[0];
                                    form.setValue('amount', firstFee.amount);
                                    if (!form.getValues('billingPeriod')) form.setValue('billingPeriod', firstFee.label);
                                }
                                setIsPopoverOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  branch.id === field.value ? "opacity-100" : "opacity-0"
                                )}
                              />
                              <div className="flex flex-col">
                                <span className="font-medium">{branch.name}</span>
                                <span className="text-xs text-muted-foreground">{branch.branchCode}</span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="billingPeriod"
            render={({ field }) => (
              <FormItem>
                <FormLabel>รายการ / งวดงาน</FormLabel>
                <FormControl><Input placeholder="เช่น ค่าธรรมเนียมรายเดือน ต.ค. 2567" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>ยอดเงิน (บาท)</FormLabel>
                <FormControl>
                  <NumericInput {...field} placeholder="0.00" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="dueDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>วันครบกำหนด</FormLabel>
                <DateDropdownPicker field={field} />
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex justify-end gap-2 pt-6">
            <Button type="button" variant="outline" onClick={onClose}>ยกเลิก</Button>
            <Button type="submit" disabled={isPending || !form.watch('branchId')}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              ยืนยันการออกบิล
            </Button>
          </div>
        </form>
      </Form>
    </CustomDialog>
  );
}
