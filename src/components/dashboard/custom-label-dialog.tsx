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
import { Textarea } from '@/components/ui/textarea';
import { CustomDialog } from './custom-dialog';
import { useFirestore, useDoc, useMemoFirebase, useCollection } from '@/firebase';
import { doc, collection, query, orderBy, addDoc, serverTimestamp, updateDoc, deleteDoc } from 'firebase/firestore';
import { StoreSettings, SenderAddress, LabelTemplate } from '@/lib/types';
import { Printer, User, Phone, MapPin, Loader2, Save, BookText, Trash2, History, Check, Info, X, Search } from 'lucide-react';
import { ProvinceCombobox } from './province-combobox';
import { useState, useTransition, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '../ui/badge';
import { cn } from '@/lib/utils';
import { ScrollArea } from '../ui/scroll-area';
import { Skeleton } from '../ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const DEFAULT_SENDER: SenderAddress = {
  name: "Fumiko Head Office",
  street: "106/19 หมู่ 6, บางรักพัฒนา",
  subdistrict: "บางรักพัฒนา",
  district: "บางบัวทอง",
  province: "นนทบุรี",
  postalCode: "11110",
  phone: "0657546699",
};

const labelFormSchema = z.object({
  recipientName: z.string().min(1, 'กรุณากรอกชื่อผู้รับ'),
  recipientPhone: z.string().min(9, 'กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง'),
  addressLine1: z.string().min(1, 'กรุณากรอกที่อยู่'),
  subdistrict: z.string().min(1, 'กรุณากรอกตำบล/แขวง'),
  district: z.string().min(1, 'กรุณากรอกอำเภอ/เขต'),
  province: z.string().min(1, 'กรุณาเลือกจังหวัด'),
  postalCode: z.string().length(5, 'รหัสไปรษณีย์ต้องมี 5 หลัก'),
});

type LabelFormValues = z.infer<typeof labelFormSchema>;

const emptyFormValues: LabelFormValues = {
  recipientName: '',
  recipientPhone: '',
  addressLine1: '',
  subdistrict: '',
  district: '',
  province: '',
  postalCode: '',
};

interface CustomLabelDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CustomLabelDialog({ isOpen, onClose }: CustomLabelDialogProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [templateToDelete, setTemplateToDelete] = useState<LabelTemplate | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const settingsRef = useMemoFirebase(() => firestore ? doc(firestore, 'settings', 'store') : null, [firestore]);
  const { data: storeSettings, isLoading: isSettingsLoading } = useDoc<StoreSettings>(settingsRef);

  const templatesQuery = useMemoFirebase(() => 
    firestore ? query(collection(firestore, 'labelTemplates'), orderBy('createdAt', 'desc')) : null, 
    [firestore]
  );
  const { data: templates, isLoading: isTemplatesLoading } = useCollection<LabelTemplate>(templatesQuery);

  // Search Logic: Filter templates by recipientName (Full Name)
  const filteredTemplates = useMemo(() => {
    if (!templates) return [];
    if (!searchTerm.trim()) return templates;
    const lowerSearch = searchTerm.toLowerCase().trim();
    return templates.filter(t => t.recipientName.toLowerCase().includes(lowerSearch));
  }, [templates, searchTerm]);

  const senderAddress = storeSettings?.companyAddress || DEFAULT_SENDER;

  const form = useForm<LabelFormValues>({
    resolver: zodResolver(labelFormSchema),
    defaultValues: emptyFormValues,
  });

  const handleSelectTemplate = (template: LabelTemplate) => {
    form.reset({
      recipientName: template.recipientName,
      recipientPhone: template.recipientPhone,
      addressLine1: template.addressLine1,
      subdistrict: template.subdistrict,
      district: template.district,
      province: template.province,
      postalCode: template.postalCode,
    });
    setSelectedTemplateId(template.id);
    toast({ title: 'โหลดข้อมูลแม่แบบแล้ว' });
  };

  const handleClearForm = () => {
    form.reset(emptyFormValues);
    setSelectedTemplateId(null);
  };

  const handleSaveTemplate = () => {
    if (!firestore) return;
    
    startTransition(async () => {
      const isValid = await form.trigger();
      if (!isValid) {
        toast({ variant: 'destructive', title: 'ข้อมูลไม่ครบถ้วน', description: 'กรุณากรอกข้อมูลผู้รับให้ครบก่อนบันทึก' });
        return;
      }

      const values = form.getValues();
      const templateName = values.recipientName;

      try {
        if (selectedTemplateId) {
          await updateDoc(doc(firestore, 'labelTemplates', selectedTemplateId), {
            ...values,
            templateName,
            updatedAt: serverTimestamp(),
          });
          toast({ title: 'อัปเดตแม่แบบสำเร็จ' });
        } else {
          await addDoc(collection(firestore, 'labelTemplates'), {
            ...values,
            templateName,
            createdAt: serverTimestamp(),
          });
          toast({ title: 'บันทึกแม่แบบใหม่สำเร็จ' });
        }
      } catch (e: any) {
        toast({ variant: 'destructive', title: 'บันทึกล้มเหลว', description: e.message });
      }
    });
  };

  const confirmDeleteTemplate = () => {
    if (!firestore || !templateToDelete) return;
    
    startTransition(async () => {
      try {
        await deleteDoc(doc(firestore, 'labelTemplates', templateToDelete.id));
        if (selectedTemplateId === templateToDelete.id) setSelectedTemplateId(null);
        toast({ title: 'ลบแม่แบบเรียบร้อยแล้ว' });
        setTemplateToDelete(null);
      } catch (e: any) {
        toast({ variant: 'destructive', title: 'ลบแม่แบบล้มเหลว', description: e.message });
      }
    });
  };

  const handlePrint = (values: LabelFormValues) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const styles = `
      @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;700&display=swap');
      @page { size: 100mm 150mm; margin: 0; }
      body { margin: 0; font-family: 'Noto Sans Thai', sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .label-container { width: 100mm; height: 150mm; padding: 5mm; box-sizing: border-box; display: flex; flex-direction: column; gap: 4mm; color: black; }
      .address-block { border: 1.5px solid #000; border-radius: 8px; padding: 4mm; flex: 1; display: flex; flex-direction: column; }
      .address-block h3 { margin: 0 0 2mm 0; font-size: 14pt; border-bottom: 1px solid #ccc; padding-bottom: 1mm; font-weight: 700; }
      .content { flex: 1; display: flex; flex-direction: column; justify-content: center; font-size: 12pt; line-height: 1.6; }
      .content p { margin: 0; }
      .footer { text-align: center; font-size: 9pt; color: #666; border-top: 1px solid #000; pt: 2mm; margin-top: 2mm; }
    `;

    const html = `
      <html>
        <head>
          <title>Shipping Label</title>
          <style>${styles}</style>
        </head>
        <body>
          <div class="label-container">
            <div class="address-block">
              <h3>ผู้ส่ง (FROM)</h3>
              <div class="content">
                <p><strong>${senderAddress.name}</strong></p>
                <p>${senderAddress.street}</p>
                <p>${senderAddress.subdistrict}, ${senderAddress.district}</p>
                <p>${senderAddress.province} ${senderAddress.postalCode}</p>
                <p>โทร: ${senderAddress.phone}</p>
              </div>
            </div>
            <div class="address-block" style="border-width: 2px;">
              <h3>ผู้รับ (TO)</h3>
              <div class="content" style="font-size: 14pt;">
                <p><strong>${values.recipientName}</strong></p>
                <p>${values.addressLine1}</p>
                <p>${values.subdistrict}, ${values.district}</p>
                <p>${values.province} ${values.postalCode}</p>
                <p style="font-size: 16pt; margin-top: 2mm;"><strong>โทร: ${values.recipientPhone}</strong></p>
              </div>
            </div>
            <div class="footer">
              สร้างโดยระบบ Fumiko Shop (Manual Label)
            </div>
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      printWindow.close();
    }, 500);
  };

  // Limit characters for UI display
  const MAX_DISPLAY_NAME = 31;

  return (
    <>
      <CustomDialog isOpen={isOpen} onClose={onClose} title="สร้างใบปะหน้าอิสระ" size="4xl">
        <div className="grid grid-cols-1 lg:grid-cols-12 pt-2 h-full max-h-[85vh] overflow-hidden -mx-6 -mb-6 border-t">
          {/* Left Sidebar: Templates */}
          <div className="lg:col-span-4 bg-muted/30 flex flex-col border-r h-full min-w-0">
            <div className="p-4 flex flex-col h-full space-y-4 min-w-0">
              <div className="flex items-center justify-between shrink-0">
                <h3 className="text-xs font-bold flex items-center gap-2 text-muted-foreground uppercase tracking-widest">
                  <History className="h-3.5 w-3.5" />
                  แม่แบบที่บันทึกไว้
                </h3>
                <button 
                  type="button"
                  className="text-[10px] text-muted-foreground hover:text-primary transition-colors font-medium underline underline-offset-2"
                  onClick={handleClearForm}
                >
                  ล้างฟอร์ม
                </button>
              </div>

              {/* Template Search Box */}
              <div className="relative shrink-0">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input 
                  placeholder="ค้นหาชื่อผู้รับ..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-9 pl-8 text-xs bg-white/80 border-primary/10 focus-visible:ring-primary/20"
                />
                {searchTerm && (
                  <button 
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 rounded-full flex items-center justify-center hover:bg-muted"
                  >
                    <X className="h-3 w-3 text-muted-foreground" />
                  </button>
                )}
              </div>

              <ScrollArea className="flex-1">
                <div className="space-y-3 pb-4 pr-6 min-w-0">
                  {isTemplatesLoading ? (
                    Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-md" />)
                  ) : filteredTemplates.length === 0 ? (
                    <div className="text-center py-10 opacity-40">
                      <BookText className="mx-auto h-8 w-8 mb-2" />
                      <p className="text-xs">{searchTerm ? 'ไม่พบชื่อที่ค้นหา' : 'ยังไม่มีแม่แบบ'}</p>
                    </div>
                  ) : (
                    filteredTemplates.map((t) => {
                      const displayName = t.recipientName.length > MAX_DISPLAY_NAME
                        ? t.recipientName.substring(0, MAX_DISPLAY_NAME) + '...'
                        : t.recipientName;

                      return (
                        <div 
                          key={t.id}
                          onClick={() => handleSelectTemplate(t)}
                          className={cn(
                            "group relative p-3 rounded-lg border cursor-pointer transition-all hover:border-primary/50 hover:bg-white shadow-sm w-full max-w-full overflow-hidden min-w-0",
                            selectedTemplateId === t.id 
                              ? "border-primary bg-white ring-2 ring-primary/20 scale-[1.02] z-10" 
                              : "bg-white/80"
                          )}
                        >
                          <div className="flex flex-col gap-1.5 pr-6 min-w-0">
                            <p 
                              className="text-sm font-bold truncate leading-tight text-foreground" 
                              title={t.recipientName}
                            >
                              {displayName}
                            </p>
                            <div className="flex items-center gap-1.5 text-muted-foreground min-w-0">
                              <MapPin className="h-3 w-3 shrink-0" />
                              <p className="text-[10px] truncate">{t.province} {t.postalCode}</p>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute top-2 right-1 h-6 w-6 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              setTemplateToDelete(t);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                          {selectedTemplateId === t.id && (
                            <div className="absolute bottom-2 right-2">
                              <Check className="h-3.5 w-3.5 text-primary" />
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>

          {/* Right Main Content: Form */}
          <div className="lg:col-span-8 bg-background h-full overflow-y-auto">
            <div className="p-6 space-y-8">
              <div className="bg-primary/5 border border-primary/10 rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-widest">
                  <Printer className="h-4 w-4" /> ข้อมูลผู้ส่ง (SENDER)
                </div>
                {isSettingsLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                ) : (
                  <div className="text-sm">
                    <p className="font-bold text-foreground">{senderAddress.name}</p>
                    <p className="text-muted-foreground leading-relaxed mt-1">
                      {senderAddress.street}, {senderAddress.subdistrict}, {senderAddress.district}, {senderAddress.province} {senderAddress.postalCode}
                    </p>
                    <div className="flex items-center gap-1.5 text-primary font-medium mt-1.5">
                      <Phone className="h-3.5 w-3.5" />
                      <span>{senderAddress.phone}</span>
                    </div>
                  </div>
                )}
              </div>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(handlePrint)} className="space-y-6">
                  <div className="flex items-center justify-between border-b pb-2">
                    <h3 className="text-base font-bold flex items-center gap-2 text-foreground">
                      <User className="h-5 w-5 text-primary" />
                      ข้อมูลผู้รับ (RECIPIENT)
                    </h3>
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm" 
                      className={cn("h-8 text-xs font-bold", selectedTemplateId && "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100")}
                      onClick={handleSaveTemplate}
                      disabled={isPending}
                    >
                      {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                      {selectedTemplateId ? 'อัปเดตแม่แบบนี้' : 'บันทึกเป็นแม่แบบใหม่'}
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField name="recipientName" control={form.control} render={({ field }) => (
                      <FormItem>
                        <FormLabel>ชื่อผู้รับ/บริษัท *</FormLabel>
                        <FormControl><Input placeholder="สมชาย ใจดี" className="h-11" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField name="recipientPhone" control={form.control} render={({ field }) => (
                      <FormItem>
                        <FormLabel>เบอร์โทรศัพท์ *</FormLabel>
                        <FormControl><Input placeholder="0xx-xxx-xxxx" className="h-11" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  <FormField name="addressLine1" control={form.control} render={({ field }) => (
                    <FormItem>
                      <FormLabel>ที่อยู่ (บ้านเลขที่, หมู่, ซอย, ถนน) *</FormLabel>
                      <FormControl><Textarea rows={3} placeholder="ระบุรายละเอียดที่อยู่" className="resize-none" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField name="subdistrict" control={form.control} render={({ field }) => (
                      <FormItem><FormLabel>แขวง / ตำบล *</FormLabel><FormControl><Input className="h-11" {...field} /></FormControl></FormItem>
                    )} />
                    <FormField name="district" control={form.control} render={({ field }) => (
                      <FormItem><FormLabel>เขต / อำเภอ *</FormLabel><FormControl><Input className="h-11" {...field} /></FormControl></FormItem>
                    )} />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField name="province" control={form.control} render={({ field }) => (
                      <FormItem>
                        <FormLabel>จังหวัด *</FormLabel>
                        <FormControl><ProvinceCombobox value={field.value} onChange={field.onChange} className="h-11" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField name="postalCode" control={form.control} render={({ field }) => (
                      <FormItem><FormLabel>รหัสไปรษณีย์ *</FormLabel><FormControl><Input maxLength={5} placeholder="xxxxx" className="h-11 font-mono" {...field} /></FormControl></FormItem>
                    )} />
                  </div>

                  <div className="flex justify-end gap-3 pt-6 border-t mt-8">
                    <Button type="button" variant="outline" onClick={onClose} className="h-12 px-6">ยกเลิก</Button>
                    <Button type="submit" className="h-12 px-10 font-bold flex-1 md:flex-none shadow-lg">
                      <Printer className="mr-2 h-5 w-5" />
                      พิมพ์ใบปะหน้า (4x6 นิ้ว)
                    </Button>
                  </div>
                </form>
              </Form>
            </div>
          </div>
        </div>
      </CustomDialog>

      <AlertDialog open={!!templateToDelete} onOpenChange={(open) => !open && setTemplateToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              ยืนยันการลบแม่แบบ
            </AlertDialogTitle>
            <AlertDialogDescription>
              คุณแน่ใจหรือไม่ว่าต้องการลบแม่แบบของ <span className="font-bold text-foreground">"{templateToDelete?.recipientName}"</span>? การดำเนินการนี้ไม่สามารถย้อนกลับได้
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDeleteTemplate} 
              className="bg-destructive hover:bg-destructive/90 text-white"
              disabled={isPending}
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              ยืนยันการลบ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
