'use client';

import { useForm } from 'react-hook-form';
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
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { CustomDialog } from './custom-dialog';
import { BankAccount } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { saveBankAccount } from '@/app/actions';

const formSchema = z.object({
  bankName: z.string().min(1, 'กรุณากรอกชื่อธนาคาร'),
  accountName: z.string().min(1, 'กรุณากรอกชื่อบัญชี'),
  accountNumber: z.string().min(1, 'กรุณากรอกเลขที่บัญชี'),
});

type FormValues = z.infer<typeof formSchema>;

interface BankAccountFormDialogProps {
  accountToEdit?: BankAccount | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function BankAccountFormDialog({ accountToEdit, isOpen, onClose, onSuccess }: BankAccountFormDialogProps) {
  const { toast } = useToast();
  const isEditMode = !!accountToEdit;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      bankName: '',
      accountName: '',
      accountNumber: '',
    },
  });

  useEffect(() => {
    if (isOpen) {
      if (accountToEdit) {
        form.reset(accountToEdit);
      } else {
        form.reset({
            bankName: '',
            accountName: '',
            accountNumber: '',
        });
      }
    }
  }, [isOpen, accountToEdit, form]);

  async function onSubmit(values: FormValues) {
    form.clearErrors();
    const payload = {
        ...values,
        id: accountToEdit?.id,
    };
    
    const result = await saveBankAccount(payload);

    if (result.success) {
        toast({ title: result.message });
        onSuccess();
    } else {
        toast({ variant: 'destructive', title: 'เกิดข้อผิดพลาด', description: result.message });
    }
  }

  return (
    <CustomDialog
      isOpen={isOpen}
      onClose={onClose}
      title={isEditMode ? 'แก้ไขบัญชีธนาคาร' : 'เพิ่มบัญชีธนาคารใหม่'}
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
          <FormField name="bankName" control={form.control} render={({ field }) => (
            <FormItem><FormLabel>ชื่อธนาคาร <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
          )}/>
          <FormField name="accountName" control={form.control} render={({ field }) => (
            <FormItem><FormLabel>ชื่อบัญชี <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
          )}/>
           <FormField name="accountNumber" control={form.control} render={({ field }) => (
            <FormItem><FormLabel>เลขที่บัญชี <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
          )}/>
          
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={form.formState.isSubmitting}>ยกเลิก</Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              บันทึก
            </Button>
          </div>
        </form>
      </Form>
    </CustomDialog>
  );
}
