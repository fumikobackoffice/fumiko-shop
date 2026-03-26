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
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { CustomDialog } from './custom-dialog';
import { Address } from '@/lib/types';
import { useFirestore } from '@/firebase';
import { collection, doc, writeBatch, getDocs, query, where } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect } from 'react';
import { Checkbox } from '../ui/checkbox';
import { Loader2, Info } from 'lucide-react';
import { Textarea } from '../ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { ProvinceCombobox } from './province-combobox';

const addressSchema = z.object({
  label: z.string().optional(),
  name: z.string().min(1, 'กรุณากรอกชื่อผู้รับ'),
  phone: z.string().min(1, 'กรุณากรอกเบอร์โทรศัพท์'),
  addressLine1: z.string().min(1, 'กรุณากรอกที่อยู่'),
  addressLine2: z.string().optional(),
  subdistrict: z.string().min(1, 'กรุณากรอกตำบล/แขวง'),
  district: z.string().min(1, 'กรุณากรอกอำเภอ/เขต'),
  province: z.string().min(1, 'กรุณาเลือกจังหวัด'),
  postalCode: z.string().min(1, 'กรุณากรอกรหัสไปรษณีย์'),
  googleMapsUrl: z.string().url('กรุณากรอกลิงก์ Google Maps ที่ถูกต้อง').min(1, 'กรุณากรอกลิงก์ Google Maps สำหรับจัดส่ง'),
  isDefault: z.boolean().default(false),
});

type FormValues = z.infer<typeof addressSchema>;

interface AddressFormDialogProps {
  userId: string;
  addressToEdit?: Address | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddressFormDialog({ userId, addressToEdit, isOpen, onClose, onSuccess }: AddressFormDialogProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditMode = !!addressToEdit;

  const form = useForm<FormValues>({
    resolver: zodResolver(addressSchema),
    defaultValues: {
      label: '',
      name: '',
      phone: '',
      addressLine1: '',
      addressLine2: '',
      subdistrict: '',
      district: '',
      province: '',
      postalCode: '',
      googleMapsUrl: '',
      isDefault: false,
    },
  });

  useEffect(() => {
    if (isOpen) {
      if (addressToEdit) {
        form.reset({
          label: addressToEdit.label || '',
          name: addressToEdit.name || '',
          phone: addressToEdit.phone || '',
          addressLine1: addressToEdit.addressLine1 || '',
          addressLine2: addressToEdit.addressLine2 || '',
          subdistrict: addressToEdit.subdistrict || '',
          district: addressToEdit.district || '',
          province: addressToEdit.province || '',
          postalCode: addressToEdit.postalCode || '',
          googleMapsUrl: addressToEdit.googleMapsUrl || '',
          isDefault: addressToEdit.isDefault || false,
        });
      } else {
        form.reset({
          label: '',
          name: '',
          phone: '',
          addressLine1: '',
          addressLine2: '',
          subdistrict: '',
          district: '',
          province: '',
          postalCode: '',
          googleMapsUrl: '',
          isDefault: false,
        });
      }
    }
  }, [isOpen, addressToEdit, form]);

  async function onSubmit(values: FormValues) {
    setIsSubmitting(true);
    if (!firestore) return;

    const batch = writeBatch(firestore);
    const addressesRef = collection(firestore, 'users', userId, 'addresses');
    
    if (values.isDefault) {
      const q = query(addressesRef, where('isDefault', '==', true));
      const querySnapshot = await getDocs(q);
      querySnapshot.forEach((docSnap) => {
        if (docSnap.id !== addressToEdit?.id) {
          batch.update(docSnap.ref, { isDefault: false });
        }
      });
    }

    try {
      if (isEditMode) {
        const addressRef = doc(addressesRef, addressToEdit.id);
        batch.update(addressRef, values);
      } else {
        const newAddressRef = doc(addressesRef);
        batch.set(newAddressRef, values);
      }
      await batch.commit();

      toast({
        title: isEditMode ? 'บันทึกที่อยู่แล้ว' : 'เพิ่มที่อยู่ใหม่สำเร็จ',
        description: 'ข้อมูลที่อยู่ของคุณได้รับการอัปเดตแล้ว',
      });
      onSuccess();

    } catch (error: any) {
      console.error("Error saving address:", error);
      toast({ variant: 'destructive', title: 'เกิดข้อผิดพลาด', description: 'ไม่สามารถบันทึกที่อยู่ได้' });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <CustomDialog
      isOpen={isOpen}
      onClose={onClose}
      title={isEditMode ? 'แก้ไขที่อยู่' : 'เพิ่มที่อยู่ใหม่'}
      size="2xl"
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField name="label" control={form.control} render={({ field }) => (
                <FormItem><FormLabel>ป้ายกำกับ (เช่น บ้าน, ที่ทำงาน)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )}/>
            <FormField name="name" control={form.control} render={({ field }) => (
                <FormItem><FormLabel>ชื่อ-นามสกุลผู้รับ <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )}/>
          </div>
          
          <FormField name="phone" control={form.control} render={({ field }) => (
            <FormItem><FormLabel>เบอร์โทรศัพท์ <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
          )}/>

          <FormField name="googleMapsUrl" control={form.control} render={({ field }) => (
            <FormItem>
              <FormLabel>ลิงก์ Google Maps <span className="text-destructive">*</span></FormLabel>
              <FormControl>
                <Input placeholder="https://maps.app.goo.gl/..." {...field} />
              </FormControl>
              <FormDescription>สำหรับจัดส่งสินค้าไปยังตำแหน่งนี้</FormDescription>
              <FormMessage />
            </FormItem>
          )}/>

          <FormField name="addressLine1" control={form.control} render={({ field }) => (
            <FormItem><FormLabel>ที่อยู่ (บ้านเลขที่, หมู่, ซอย, ถนน) <span className="text-destructive">*</span></FormLabel><FormControl><Textarea rows={3} {...field} /></FormControl><FormMessage /></FormItem>
          )}/>
          <FormField name="addressLine2" control={form.control} render={({ field }) => (
            <FormItem><FormLabel>ที่อยู่ (เพิ่มเติม)</FormLabel><FormControl><Input placeholder="เช่น อาคาร, ชั้น, ห้อง" {...field} /></FormControl><FormMessage /></FormItem>
          )}/>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <FormField name="subdistrict" control={form.control} render={({ field }) => (
                <FormItem><FormLabel>ตำบล/แขวง <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )}/>
             <FormField name="district" control={form.control} render={({ field }) => (
                <FormItem><FormLabel>อำเภอ/เขต <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )}/>
           </div>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <FormField name="province" control={form.control} render={({ field }) => (
                <FormItem>
                  <FormLabel>จังหวัด <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <ProvinceCombobox 
                      value={field.value} 
                      onChange={field.onChange} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
            )}/>
             <FormField name="postalCode" control={form.control} render={({ field }) => (
                <FormItem><FormLabel>รหัสไปรษณีย์ <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )}/>
           </div>
           <FormField control={form.control} name="isDefault" render={({ field }) => (
              <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel>ตั้งเป็นที่อยู่หลัก</FormLabel>
                </div>
              </FormItem>
            )}
          />

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>ยกเลิก</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              บันทึก
            </Button>
          </div>
        </form>
      </Form>
    </CustomDialog>
  );
}
