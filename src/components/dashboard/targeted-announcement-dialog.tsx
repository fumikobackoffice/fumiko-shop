'use client';

import { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { doc, setDoc, serverTimestamp, collection, getDocs } from 'firebase/firestore';
import { TargetedAnnouncement, AppUser } from '@/lib/types';
import { provinces, regions, Region } from '@/lib/provinces';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ImagePlus, X, Search } from 'lucide-react';
import Image from 'next/image';
import { useUploadImage } from '@/firebase/storage/use-storage';

const formSchema = z.object({
  title: z.string().min(1, 'ระบุหัวข้อประกาศ'),
  content: z.string().optional(),
  imageUrl: z.string().optional(),
  active: z.boolean().default(true),
  targetType: z.enum(['ALL_SELLERS', 'BY_PROVINCE', 'BY_REGION', 'SPECIFIC_USERS']),
  targetProvinces: z.array(z.string()).optional(),
  targetRegions: z.array(z.string()).optional(),
  targetUserIds: z.array(z.string()).optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function TargetedAnnouncementDialog({ 
  open, 
  onOpenChange, 
  announcement 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  announcement?: TargetedAnnouncement | null;
}) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const { uploadImage } = useUploadImage();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Search state for users
  const [userSearch, setUserSearch] = useState("");
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: announcement?.title || '',
      content: announcement?.content || '',
      imageUrl: announcement?.imageUrl || '',
      active: announcement ? announcement.active : true,
      targetType: announcement?.targetType || 'ALL_SELLERS',
      targetProvinces: announcement?.targetProvinces || [],
      targetRegions: announcement?.targetRegions || [],
      targetUserIds: announcement?.targetUserIds || [],
    }
  });

  const targetType = form.watch('targetType');

  // Manual fetch state to accurately track loading independently of Firebase's real-time cache flaws
  const [usersData, setUsersData] = useState<AppUser[] | null>(null);
  const [isUsersLoading, setIsUsersLoading] = useState(false);

  useEffect(() => {
    if (!firestore || targetType !== 'SPECIFIC_USERS') return;
    if (usersData !== null) return; // Only fetch once to prevent heavy reads
    
    let isMounted = true;
    const fetchUsers = async () => {
      setIsUsersLoading(true);
      try {
        const snap = await getDocs(collection(firestore, 'users'));
        if (!isMounted) return;
        
        const users = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppUser));
        setUsersData(users);
      } catch (err) {
        console.error("Failed to load users", err);
      } finally {
        if (isMounted) setIsUsersLoading(false);
      }
    };
    
    fetchUsers();

    return () => { isMounted = false; };
  }, [firestore, targetType, usersData]);

  const sellers = (usersData || []).filter(u => u.role === 'seller');
  const filteredSellers = sellers.filter(s => 
    s.name?.toLowerCase().includes(userSearch.toLowerCase()) || 
    s.id.toLowerCase().includes(userSearch.toLowerCase())
  );

  // Clear related array fields when switching explicitly
  useEffect(() => {
    if (targetType === 'ALL_SELLERS') {
      form.setValue('targetProvinces', []);
      form.setValue('targetRegions', []);
      form.setValue('targetUserIds', []);
    }
  }, [targetType, form]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 1024 * 2) {
        toast({ variant: 'destructive', title: 'ไฟล์ใหญ่เกินไป', description: 'ขนาดไม่ควรเกิน 2MB' });
        return;
      }
      toast({ title: 'กำลังอัปโหลดรูปภาพ...' });
      try {
        const url = await uploadImage(file, 'announcements');
        form.setValue('imageUrl', url, { shouldDirty: true });
        toast({ title: 'อัปโหลดสำเร็จ' });
      } catch (error) {
        toast({ variant: 'destructive', title: 'อัปโหลดล้มเหลว', description: 'กรุณาลองใหม่อีกครั้ง' });
      }
    }
  };

  const onSubmit = async (values: FormValues) => {
    if (!firestore) return;
    setIsSubmitting(true);
    try {
      // Validate arrays based on type
      if (values.targetType === 'BY_PROVINCE' && (!values.targetProvinces || values.targetProvinces.length === 0)) {
        toast({ variant: 'destructive', title: 'ไม่สมบูรณ์', description: 'กรุณาเลือกอย่างน้อย 1 จังหวัด' });
        setIsSubmitting(false); return;
      }
      if (values.targetType === 'BY_REGION' && (!values.targetRegions || values.targetRegions.length === 0)) {
        toast({ variant: 'destructive', title: 'ไม่สมบูรณ์', description: 'กรุณาเลือกอย่างน้อย 1 ภูมิภาค' });
        setIsSubmitting(false); return;
      }
      if (values.targetType === 'SPECIFIC_USERS' && (!values.targetUserIds || values.targetUserIds.length === 0)) {
        toast({ variant: 'destructive', title: 'ไม่สมบูรณ์', description: 'กรุณาเลือกสาขาอย่างน้อย 1 แห่ง' });
        setIsSubmitting(false); return;
      }

      const id = announcement?.id || crypto.randomUUID();
      const ref = doc(firestore, 'targeted_announcements', id);
      
      const payload: TargetedAnnouncement = {
        id,
        title: values.title,
        content: values.content,
        imageUrl: values.imageUrl,
        active: values.active,
        targetType: values.targetType,
        targetProvinces: values.targetType === 'BY_PROVINCE' ? values.targetProvinces : [],
        targetRegions: values.targetType === 'BY_REGION' ? values.targetRegions : [],
        targetUserIds: values.targetType === 'SPECIFIC_USERS' ? values.targetUserIds : [],
        updatedAt: serverTimestamp(),
        // Only set createdAt for new items
        createdAt: announcement?.createdAt || serverTimestamp(),
      };

      await setDoc(ref, payload, { merge: true });
      toast({ title: 'บันทึกสำเร็จ', description: 'ข้อมูลประกาศถูกบันทึกเรียบร้อยแล้ว' });
      onOpenChange(false);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'บันทึกไม่สำเร็จ', description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const regionKeys = Object.keys(regions) as Region[];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold font-headline">
            {announcement ? 'แก้ไขประกาศเฉพาะกลุ่ม' : 'สร้างประกาศใหม่'}
          </DialogTitle>
          <DialogDescription>
            กำหนดข้อความที่ต้องการแจ้ง และเลือกว่าต้องการให้ "ใคร" เห็นประกาศตัวนี้บ้าง
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <FormField control={form.control} name="title" render={({ field }) => (
                  <FormItem><FormLabel>หัวข้อประกาศ (จำเป็น)</FormLabel>
                    <FormControl><Input placeholder="ระบุหัวข้อชัดเจน..." {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="content" render={({ field }) => (
                  <FormItem><FormLabel>เนื้อหาประกาศ (เว้นว่างได้ถ้ารูปภาพชัดเจนแล้ว)</FormLabel>
                    <FormControl><Textarea rows={4} placeholder="รายละเอียด..." {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="active" render={({ field }) => (
                  <FormItem className="flex items-center gap-2 p-3 bg-primary/5 rounded-lg border border-primary/20 space-y-0">
                    <FormLabel className="text-sm font-bold flex-1 cursor-pointer">เปิดใช้งานประกาศทันทีไหม?</FormLabel>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  </FormItem>
                )} />
              </div>

              <div className="space-y-4">
                <FormLabel>รูปภาพประกาศ</FormLabel>
                <div className="relative aspect-video rounded-lg border-2 border-dashed bg-muted overflow-hidden flex items-center justify-center">
                  {form.watch('imageUrl') ? (
                    <>
                      <Image src={form.watch('imageUrl')!} alt="Preview" fill className="object-contain" />
                      <Button type="button" variant="destructive" size="icon" className="absolute top-2 right-2 h-7 w-7 rounded-full" onClick={() => form.setValue('imageUrl', '')}>
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <div className="text-center p-4">
                      <ImagePlus className="h-10 w-10 text-muted-foreground mx-auto mb-2 opacity-50" />
                      <p className="text-xs text-muted-foreground">คลิกหรือลากไฟล์ภาพลงที่นี่</p>
                    </div>
                  )}
                  <input type="file" accept="image/*" onChange={handleImageUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t">
              <h4 className="text-lg font-bold font-headline mb-4">กลุ่มเป้าหมาย</h4>
              <FormField control={form.control} name="targetType" render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger className="font-bold border-primary/30 h-11">
                        <SelectValue placeholder="เลือกการส่ง..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL_SELLERS">📢 ส่งให้เจ้าของสาขาทุกคน</SelectItem>
                        <SelectItem value="BY_REGION">📍 ส่งเฉพาะแยกตาม "ภูมิภาค" (เช่น ภาคเหนือ, ภาคอีสาน)</SelectItem>
                        <SelectItem value="BY_PROVINCE">🏙️ ส่งเฉพาะบาง "จังหวัด"</SelectItem>
                        <SelectItem value="SPECIFIC_USERS">👤 ส่งเฉพาะแบบเจาะจงรายหัวเครือข่าย</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormControl>
                </FormItem>
              )} />
            </div>

            {/* Sub-Filters based on type */}
            <div className="bg-muted/10 rounded-lg">
              {targetType === 'BY_REGION' && (
                <FormField control={form.control} name="targetRegions" render={({ field }) => (
                  <FormItem className="p-4 border rounded-lg">
                    <FormLabel>เลือกภูมิภาคที่ต้องการ (เลือกได้หลายข้อ)</FormLabel>
                    <div className="flex gap-2 flex-wrap mb-3 mt-2">
                      {field.value?.map(r => (
                        <Badge key={r} variant="secondary" className="gap-1 bg-primary/10 hover:bg-primary/20 text-primary px-3 py-1">
                          {r} <X className="h-3 w-3 cursor-pointer" onClick={() => form.setValue('targetRegions', field.value?.filter(x => x !== r))} />
                        </Badge>
                      ))}
                      {(!field.value || field.value.length === 0) && <span className="text-xs text-muted-foreground py-1">ยังไม่ได้เลือกสักภูมิภาค</span>}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {regionKeys.map(region => (
                        <div key={region} className="flex items-center gap-2">
                          <Checkbox 
                            id={`region-${region}`} 
                            checked={field.value?.includes(region)} 
                            onCheckedChange={(checked) => {
                              const current = field.value || [];
                              if (checked) form.setValue('targetRegions', [...current, region]);
                              else form.setValue('targetRegions', current.filter(c => c !== region));
                            }} 
                            className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                          />
                          <label htmlFor={`region-${region}`} className="text-sm cursor-pointer hover:text-primary transition-colors">{region}</label>
                        </div>
                      ))}
                    </div>
                  </FormItem>
                )} />
              )}

              {targetType === 'BY_PROVINCE' && (
                <FormField control={form.control} name="targetProvinces" render={({ field }) => (
                  <FormItem className="p-4 border rounded-lg">
                    <FormLabel>เลือกจังหวัดที่ต้องการ</FormLabel>
                    <div className="flex gap-2 flex-wrap mb-3">
                      {field.value?.map(p => (
                        <Badge key={p} variant="secondary" className="gap-1 bg-primary/10 hover:bg-primary/20 text-primary px-3 py-1">
                          {p} <X className="h-3 w-3 cursor-pointer" onClick={() => form.setValue('targetProvinces', field.value?.filter(x => x !== p))} />
                        </Badge>
                      ))}
                      {(!field.value || field.value.length === 0) && <span className="text-xs text-muted-foreground py-1">ยังไม่ได้เลือกสักจังหวัด</span>}
                    </div>
                    <ScrollArea className="h-48 border rounded-md p-3">
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                        {provinces.map(prov => (
                          <div key={prov} className="flex items-center gap-2">
                            <Checkbox 
                              checked={field.value?.includes(prov)} 
                              onCheckedChange={(checked) => {
                                const current = field.value || [];
                                if (checked) form.setValue('targetProvinces', [...current, prov]);
                                else form.setValue('targetProvinces', current.filter(c => c !== prov));
                              }} 
                            />
                            <label className="text-xs truncate">{prov}</label>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </FormItem>
                )} />
              )}

              {targetType === 'SPECIFIC_USERS' && (
                <FormField control={form.control} name="targetUserIds" render={({ field }) => (
                  <FormItem className="p-4 border rounded-lg">
                    <FormLabel>เลือกบัญชีสาขาเป้าหมาย</FormLabel>
                    <div className="flex gap-2 flex-wrap mb-3">
                      {field.value?.map(uid => {
                        const user = sellers.find(s => s.id === uid);
                        return (
                          <Badge key={uid} variant="secondary" className="gap-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 px-3 py-1">
                            {user?.name || uid} <X className="h-3 w-3 cursor-pointer" onClick={() => form.setValue('targetUserIds', field.value?.filter(x => x !== uid))} />
                          </Badge>
                        )
                      })}
                      {(!field.value || field.value.length === 0) && <span className="text-xs text-muted-foreground py-1">ยังไม่มีรายชื่อสาขา</span>}
                    </div>
                    
                    <div className="relative mb-3">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input placeholder="ค้นหาชื่อสาขา หรือรหัสไอดี..." className="pl-9" value={userSearch} onChange={(e) => setUserSearch(e.target.value)} />
                    </div>

                    <ScrollArea className="h-48 border rounded-md">
                      <div className="divide-y">
                        {isUsersLoading ? (
                          <div className="p-8 text-center flex flex-col items-center justify-center gap-3">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                            <span className="text-sm text-muted-foreground">กำลังดาวน์โหลดรายชื่อ...</span>
                          </div>
                        ) : filteredSellers.length === 0 ? (
                          <div className="p-4 text-center text-xs text-muted-foreground">ไม่พบข้อมูลสาขา</div>
                        ) : (
                          filteredSellers.map(seller => (
                            <div key={seller.id} className="flex flex-row items-center space-x-3 p-3 hover:bg-muted/50 transition-colors">
                              <Checkbox 
                                id={`user-${seller.id}`}
                                checked={field.value?.includes(seller.id)} 
                                onCheckedChange={(checked) => {
                                  const current = field.value || [];
                                  if (checked) form.setValue('targetUserIds', [...current, seller.id]);
                                  else form.setValue('targetUserIds', current.filter(c => c !== seller.id));
                                }} 
                              />
                              <div className="flex flex-col flex-1 leading-none">
                                <label htmlFor={`user-${seller.id}`} className="text-sm font-medium cursor-pointer">{seller.name}</label>
                                <span className="text-xs text-muted-foreground mt-1">ID: {seller.id} • {seller.province || 'ไม่ระบุจังหวัด'}</span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  </FormItem>
                )} />
              )}
            </div>

            <DialogFooter className="pt-4 mt-6 border-t gap-3">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>ยกเลิก</Button>
              <Button type="submit" disabled={isSubmitting} className="font-bold">
                {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> กำลังบันทึก</> : 'บันทึกประกาศ'}
              </Button>
            </DialogFooter>
          </form>
        </Form>

      </DialogContent>
    </Dialog>
  );
}
