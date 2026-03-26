'use client';

import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useState, useMemo, useEffect, useRef, ChangeEvent } from 'react';
import { Loader2, PlusCircle, Trash2, X, ImagePlus, Info, Banknote, Tag, Pencil } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, serverTimestamp, writeBatch, doc, addDoc, updateDoc, getDocs, runTransaction, setDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { ProductPackage, ProductGroup, ProductVariant } from '@/lib/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { ProductSearchDialog } from './product-search-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { CustomDialog } from './custom-dialog';
import { ImagePlaceholder } from '../shared/image-placeholder';
import { UnsavedChangesDialog } from './unsaved-changes-dialog';
import { Label } from '../ui/label';
import { Separator } from '../ui/separator';
import { Badge } from '@/components/ui/badge';
import { clearGlobalCache } from '@/hooks/use-smart-fetch';

const formSchema = z.object({
  name: z.string().min(1, { message: 'กรุณากรอกชื่อแพ็กเกจ' }),
  description: z.string().optional(),
  price: z.coerce.number().min(0, { message: 'ราคาต้องเป็น 0 หรือมากกว่า' }),
  sku: z.string().optional(),
  status: z.enum(['active', 'draft', 'archived']),
  imageUrls: z.array(z.string()).optional(),
  items: z.array(z.object({
      productGroupId: z.string(),
      productVariantId: z.string(),
      quantity: z.coerce.number().min(1, 'จำนวนต้องอย่างน้อย 1'),
    })).min(1, 'ต้องมีสินค้าในแพ็กเกจอย่างน้อย 1 รายการ'),
});

type FormValues = z.infer<typeof formSchema>;

interface PackageFormProps {
  initialData?: ProductPackage;
  readOnly?: boolean;
}

const defaultPackageFormValues: Partial<FormValues> = {
  name: '',
  description: '',
  price: undefined,
  sku: '',
  status: 'active',
  imageUrls: [],
  items: [],
};

const getStatusText = (status: ProductPackage['status']) => {
  switch (status) {
    case 'active': return 'เผยแพร่';
    case 'draft': return 'ฉบับร่าง';
    case 'archived': return 'อยู่ในถังขยะ';
    default: return status;
  }
};

const getStatusVariant = (status: ProductPackage['status']): "success" | "outline" | "destructive" | "default" => {
  switch (status) {
    case 'active': return 'success';
    case 'draft': return 'outline';
    case 'archived': return 'destructive';
    default: return 'default';
  }
};

export function PackageForm({ initialData, readOnly }: PackageFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user } = useAuth();
  const firestore = useFirestore();
  const router = useRouter();
  const isEditMode = !!initialData;
  const imageInputRef = useRef<HTMLInputElement>(null);
  
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [nextPath, setNextPath] = useState<string | null>(null);
  const [isEditingStatus, setIsEditingStatus] = useState(false);

  const productGroupsQuery = useMemoFirebase(() =>
    !firestore ? null : collection(firestore, 'productGroups'),
    [firestore]
  );
  const { data: productGroups, isLoading: areGroupsLoading } = useCollection<ProductGroup>(productGroupsQuery);
  
  const [allVariants, setAllVariants] = useState<ProductVariant[]>([]);
  const [areVariantsLoading, setAreVariantsLoading] = useState(true);
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData ? {
        ...initialData,
        items: initialData.items || [],
        imageUrls: initialData.imageUrls || [],
      } : defaultPackageFormValues,
  });
  
  const { formState: { isDirty }, control, watch, setValue } = form;

  useEffect(() => {
    if (areGroupsLoading || !productGroups || !firestore) return;
    
    let isMounted = true;
    const fetchAllVariants = async () => {
      setAreVariantsLoading(true);
      const variantsData: ProductVariant[] = [];
      try {
        await Promise.all(productGroups.map(async (group) => {
          const variantsRef = collection(firestore, 'productGroups', group.id, 'productVariants');
          const variantsSnapshot = await getDocs(variantsRef);
          variantsSnapshot.forEach(doc => {
            variantsData.push({ ...doc.data(), id: doc.id } as ProductVariant);
          });
        }));
        if (isMounted) setAllVariants(variantsData);
      } catch (error) {
        console.error("Error fetching all variants for package form:", error);
      } finally {
        if (isMounted) setAreVariantsLoading(false);
      }
    };
  
    fetchAllVariants();
  
    return () => { isMounted = false; };
  }, [productGroups, firestore, areGroupsLoading]);


  useEffect(() => {
    if (readOnly) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isDirty && !isSubmitting) {
        event.preventDefault();
        event.returnValue = '';
      }
    };

    const handleAnchorClick = (event: MouseEvent) => {
      const target = event.currentTarget as HTMLAnchorElement;
      const targetUrl = new URL(target.href);
      const currentUrl = new URL(window.location.href);

      if (target.target === '_blank' || targetUrl.origin !== currentUrl.origin) {
        return;
      }
      
      if (isDirty && !isSubmitting && target.href !== window.location.href) {
        event.preventDefault();
        setNextPath(target.href);
        setShowUnsavedDialog(true);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.querySelectorAll('a').forEach(a => a.addEventListener('click', handleAnchorClick));

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.querySelectorAll('a').forEach(a => a.removeEventListener('click', handleAnchorClick));
    };
  }, [isDirty, isSubmitting, readOnly]);


  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const handleProductSelect = (variant: ProductVariant) => {
     if (readOnly) return;
     if (fields.some(item => item.productVariantId === variant.id)) {
      toast({
        variant: 'destructive',
        title: 'สินค้าซ้ำ',
        description: 'สินค้านี้อยู่ในแพ็กเกจแล้ว',
      });
      return;
    }
    append({ productGroupId: variant.productGroupId, productVariantId: variant.id, quantity: 1 });
  };
  
  const combinedProductData = useMemo(() => {
    if (areGroupsLoading || areVariantsLoading) return {};
    const data: Record<string, { variant: ProductVariant, group: ProductGroup }> = {};
    allVariants.forEach(variant => {
        const group = productGroups?.find(g => g.id === variant.productGroupId);
        if (group) {
            data[variant.id] = { variant, group };
        }
    });
    return data;
  }, [areGroupsLoading, areVariantsLoading, allVariants, productGroups]);

  // Price Calculation Logic
  const itemsValue = watch('items');
  const packagePrice = watch('price') || 0;

  const totalRetailPrice = useMemo(() => {
    return itemsValue.reduce((total, item) => {
      const productInfo = combinedProductData[item.productVariantId];
      if (productInfo) {
        return total + (productInfo.variant.price * item.quantity);
      }
      return total;
    }, 0);
  }, [itemsValue, combinedProductData]);

  const savings = totalRetailPrice > 0 ? totalRetailPrice - packagePrice : 0;
  const isPriceInvalid = packagePrice > totalRetailPrice && totalRetailPrice > 0;

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (readOnly) return;
    const files = event.target.files;
    if (files) {
      const currentImages = watch('imageUrls') || [];
      const newImages = [...currentImages];
      
      Array.from(files).forEach(file => {
        if (file.size > 1024 * 1024) {
          toast({ variant: 'destructive', title: 'ไฟล์ใหญ่เกินไป', description: `รูป ${file.name} มีขนาดเกิน 1MB` });
          return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
          if(e.target?.result) {
            newImages.push(e.target.result as string);
            setValue('imageUrls', newImages, { shouldValidate: true, shouldDirty: true });
          }
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const handleRemoveImage = (index: number) => {
    if (readOnly) return;
    const currentImages = watch('imageUrls') || [];
    const newImages = currentImages.filter((_, i) => i !== index);
    setValue('imageUrls', newImages, { shouldValidate: true, shouldDirty: true });
    if (imageInputRef.current) imageInputRef.current.value = '';
  };


  const savePackage = async (values: FormValues): Promise<boolean> => {
    if (!user || !firestore || readOnly) return false;

    if (isPriceInvalid) {
      toast({
        variant: 'destructive',
        title: 'ราคาไม่ถูกต้อง',
        description: 'ราคาแพ็กเกจไม่สามารถสูงกว่าราคารวมสินค้าปกติได้',
      });
      return false;
    }

    const totalWeight = values.items.reduce((acc, item) => {
      const variant = allVariants.find(v => v.id === item.productVariantId);
      return acc + ((variant?.weight || 0) * item.quantity);
    }, 0);

    try {
      if (isEditMode) {
          const batch = writeBatch(firestore);
          const packageRef = doc(firestore, 'productPackages', initialData.id);
          const packageData = {
              name: values.name,
              description: values.description || '',
              price: values.price,
              totalRetailPrice: totalRetailPrice,
              weight: totalWeight,
              sku: initialData.sku,
              status: values.status,
              items: values.items,
              imageUrls: values.imageUrls || [],
          };
          batch.update(packageRef, { ...packageData, updatedAt: serverTimestamp() });
          await batch.commit();
      } else {
          const counterRef = doc(firestore, 'counters', 'packageCounter');
          
          const newSku = await runTransaction(firestore, async (transaction) => {
              const counterDoc = await transaction.get(counterRef);
              const newCount = (counterDoc.exists() ? counterDoc.data().count : 0) + 1;
              transaction.set(counterRef, { count: newCount }, { merge: true });
              return `PACK-${new Date().getFullYear()}-${String(newCount).padStart(4, '0')}`;
          });

          const packageRef = doc(collection(firestore, 'productPackages'));
          const packageData = {
              id: packageRef.id,
              name: values.name,
              description: values.description || '',
              price: values.price,
              totalRetailPrice: totalRetailPrice,
              weight: totalWeight,
              sku: newSku,
              status: values.status,
              items: values.items,
              imageUrls: values.imageUrls || [],
              createdAt: serverTimestamp(),
          };
          await setDoc(packageRef, packageData);
      }

      clearGlobalCache('packages-data');

      toast({
          title: isEditMode ? 'บันทึกแพ็กเกจแล้ว' : 'สร้างแพ็กเกจสำเร็จ',
          description: `แพ็กเกจ "${values.name}" ถูกบันทึกแล้ว`,
      });
      return true;
    } catch(error) {
      console.error("Error saving package:", error);
      toast({ variant: "destructive", title: "เกิดข้อผิดพลาด", description: "ไม่สามารถบันทึกแพ็กเกจได้" });
      return false;
    }
  }

  async function onSubmit(values: FormValues) {
    if (readOnly) return;
    setIsSubmitting(true);
    const success = await savePackage(values);
    if (success) {
      setTimeout(() => router.push('/dashboard/packages'), 50);
    }
    setIsSubmitting(false);
  }

  const handleSaveAndNavigate = async () => {
    setIsSubmitting(true);
    const isValid = await form.trigger();
    if (isValid) {
      const values = form.getValues();
      const success = await savePackage(values);
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

  const handleArchive = async () => {
    if (!isEditMode || !initialData || !firestore || readOnly) return;
    setIsSubmitting(true);
    try {
        await updateDoc(doc(firestore, 'productPackages', initialData.id), { status: 'archived' });
        clearGlobalCache('packages-data');
        toast({ title: 'ย้ายไปถังขยะแล้ว', description: `แพ็กเกจ "${initialData.name}" ถูกย้ายไปที่ถังขยะแล้ว` });
        setTimeout(() => router.push('/dashboard/packages'), 50);
    } catch (error: any) {
        console.error("Error archiving package:", error);
        toast({ variant: "destructive", title: "เกิดข้อผิดพลาด", description: "ไม่สามารถย้ายแพ็กเกจไปถังขยะได้" });
    } finally {
        setIsSubmitting(false);
        setIsArchiveDialogOpen(false);
    }
  }

  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="font-headline">รายละเอียดแพ็กเกจ</CardTitle>
                  <CardDescription>กรอกข้อมูลหลักของแพ็กเกจ</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FormField name="name" control={form.control} render={({ field }) => (
                    <FormItem><FormLabel>ชื่อแพ็กเกจ <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="เช่น ชุดเริ่มต้นสำหรับคาเฟ่" {...field} disabled={readOnly} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField name="description" control={form.control} render={({ field }) => (
                    <FormItem><FormLabel>รายละเอียด</FormLabel><FormControl><Textarea rows={5} placeholder="อธิบายรายละเอียดแพ็กเกจของคุณ..." {...field} disabled={readOnly} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <Separator />
                  <FormField
                    name="imageUrls"
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>รูปภาพแพ็กเกจ</FormLabel>
                        <FormControl>
                          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
                            {(field.value || []).map((url: string, index: number) => (
                              <div key={index} className="relative w-full aspect-square">
                                <Image src={url} alt={`Package Image ${index + 1}`} fill className="object-cover rounded-md border" />
                                {!readOnly && (
                                  <Button
                                    type="button"
                                    variant="destructive"
                                    size="icon"
                                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                                    onClick={() => handleRemoveImage(index)}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            ))}
                            {!readOnly && (
                              <Label
                                htmlFor="package-image-upload"
                                className="cursor-pointer aspect-square flex flex-col items-center justify-center rounded-md border-2 border-dashed border-muted-foreground/30 bg-muted/25 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                              >
                                <ImagePlus className="h-8 w-8" />
                                <span className="mt-2 text-xs font-medium">เพิ่มรูป</span>
                                <Input
                                  id="package-image-upload"
                                  ref={imageInputRef}
                                  type="file"
                                  accept="image/*"
                                  className="sr-only"
                                  multiple
                                  onChange={handleFileChange}
                                />
                              </Label>
                            )}
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card>
                  <CardHeader>
                      <CardTitle className="font-headline">สินค้าในแพ็กเกจ</CardTitle>
                      <CardDescription>เลือกสินค้าและจำนวนที่จะรวมอยู่ในแพ็กเกจนี้</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {fields.length > 0 ? (
                        <div className="rounded-lg border">
                         <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[80px]">รูปภาพ</TableHead>
                                    <TableHead>สินค้า</TableHead>
                                    <TableHead className="w-[120px]">จำนวน</TableHead>
                                    <TableHead className="text-right w-[120px]">ราคาปกติ</TableHead>
                                    <TableHead className="w-[50px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {fields.map((item, index) => {
                                    const productInfo = combinedProductData[item.productVariantId];
                                    if (!productInfo) return (
                                        <TableRow key={item.id}>
                                            <TableCell colSpan={5}>กำลังโหลดข้อมูลสินค้า...</TableCell>
                                        </TableRow>
                                    );
                                    const { variant, group } = productInfo;
                                    const imageUrl = variant.imageUrls?.[0];
                                    const attributesString = Object.entries(variant.attributes)
                                        .map(([key, value]) => `${key}: ${value}`)
                                        .join(', ');
                                    return (
                                        <TableRow key={item.id}>
                                            <TableCell>
                                                <div className="h-12 w-12 rounded-md bg-muted">
                                                {imageUrl ? (
                                                    <Image
                                                        src={imageUrl}
                                                        alt={group.name}
                                                        width={48}
                                                        height={48}
                                                        className="h-full w-full rounded-md object-cover aspect-square"
                                                    />
                                                ) : (
                                                    <ImagePlaceholder />
                                                )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <p className="font-medium">{group.name}</p>
                                                <p className="text-sm text-muted-foreground">{attributesString}</p>
                                            </TableCell>
                                            <TableCell>
                                                <FormField
                                                    control={form.control}
                                                    name={`items.${index}.quantity`}
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormControl>
                                                                <Input 
                                                                  type="text" 
                                                                  inputMode="numeric" 
                                                                  {...field} 
                                                                  onChange={(e) => field.onChange(e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, ''))}
                                                                  disabled={readOnly}
                                                                />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <p className="text-sm font-medium">฿{(variant.price * item.quantity).toLocaleString()}</p>
                                                {item.quantity > 1 && (
                                                    <p className="text-[10px] text-muted-foreground">ชิ้นละ ฿{variant.price.toLocaleString()}</p>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {!readOnly && (
                                                  <Button variant="ghost" size="icon" onClick={() => remove(index)}>
                                                      <Trash2 className="h-4 w-4 text-destructive"/>
                                                  </Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                         </Table>
                        </div>
                    ): (
                        <div className="text-center text-muted-foreground border-dashed border-2 rounded-lg p-8">
                            <p>ยังไม่มีสินค้าในแพ็กเกจนี้</p>
                        </div>
                    )}
                    {!readOnly && (
                      <Button type="button" variant="outline" className="mt-4" onClick={() => setIsSearchOpen(true)} disabled={areGroupsLoading || areVariantsLoading}>
                          {areVariantsLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                          เพิ่มสินค้า
                      </Button>
                    )}
                    <FormMessage>{form.formState.errors.items?.root?.message || form.formState.errors.items?.message}</FormMessage>
                  </CardContent>
              </Card>
            </div>
            <div className="lg:col-span-1 space-y-6">
              <Card>
                  <CardHeader>
                      <CardTitle className="font-headline">การตั้งค่าแพ็กเกจ</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                      <FormField control={form.control} name="status" render={({ field }) => (
                          <FormItem>
                              <FormLabel>สถานะ <span className="text-destructive">*</span></FormLabel>
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
                                        <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="เลือกสถานะ" />
                                        </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="active">เผยแพร่</SelectItem>
                                            <SelectItem value="draft">ฉบับร่าง</SelectItem>
                                            <SelectItem value="archived" className="hidden">อยู่ในถังขยะ</SelectItem>
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
                      )}/>
                      
                      <div className="space-y-4">
                        <FormField name="price" control={form.control} render={({ field }) => (
                            <FormItem data-form-field-name="price">
                                <FormLabel>ราคาแพ็กเกจ <span className="text-destructive">*</span></FormLabel>
                                <FormControl>
                                    <div className="relative">
                                        <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input 
                                            type="text" 
                                            inputMode="decimal" 
                                            className={cn("pl-9 h-11 text-lg font-bold", isPriceInvalid && "border-destructive text-destructive focus-visible:ring-destructive")}
                                            {...field} 
                                            onChange={(e) => field.onChange(e.target.value.replace(/[^0-9.]/g, '').replace(/^0+(?=\d)/, ''))} 
                                            disabled={readOnly}
                                        />
                                    </div>
                                </FormControl>
                                {isPriceInvalid && (
                                    <p className="text-xs font-medium text-destructive mt-1">ราคาแพ็กเกจต้องไม่สูงกว่าราคารวมปกติ</p>
                                )}
                                <FormMessage />
                            </FormItem>
                        )} />

                        <div className="bg-muted/30 rounded-lg p-4 space-y-3 border">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-muted-foreground flex items-center gap-1.5"><Tag className="h-3.5 w-3.5" /> ราคารวมปกติ</span>
                                <span className="font-semibold">฿{totalRetailPrice.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                            </div>
                            <Separator />
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-muted-foreground flex items-center gap-1.5"><Info className="h-3.5 w-3.5" /> ประหยัดไป</span>
                                <span className={cn("font-bold", savings > 0 ? "text-green-600" : savings < 0 ? "text-destructive" : "text-muted-foreground")}>
                                    {savings > 0 ? `฿${savings.toLocaleString('th-TH', { minimumFractionDigits: 2 })}` : '-'}
                                </span>
                            </div>
                            {savings > 0 && totalRetailPrice > 0 && (
                                <p className="text-[10px] text-center text-green-600 font-bold bg-green-50 rounded py-1 border border-green-100">
                                    ลูกค้าประหยัดได้ {((savings / totalRetailPrice) * 100).toFixed(0)}%
                                </p>
                            )}
                        </div>
                      </div>

                      <FormField name="sku" control={form.control} render={({ field }) => (
                        <FormItem>
                          <FormLabel>รหัสสินค้า</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              readOnly
                              placeholder={isEditMode ? '' : '(สร้างอัตโนมัติ)'}
                              className="bg-muted/50"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                  </CardContent>
              </Card>
            </div>
          </div>
          <div className="flex justify-between items-center pt-6">
            {!readOnly ? (
              <Button type="submit" disabled={isSubmitting || isPriceInvalid} size="lg">
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSubmitting ? 'กำลังบันทึก...' : isEditMode ? 'บันทึกการเปลี่ยนแปลง' : 'บันทึกแพ็กเกจ'}
              </Button>
            ) : (
              <Button type="button" variant="outline" onClick={() => router.back()}>กลับไปที่รายการ</Button>
            )}
            {isEditMode && initialData?.status !== 'archived' && !readOnly && (
              <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setIsArchiveDialogOpen(true)}
                  disabled={isSubmitting}
              >
                  <Trash2 className="mr-2 h-4 w-4" />
                  ย้ายไปถังขยะ
              </Button>
            )}
          </div>
        </form>
      </Form>
      <ProductSearchDialog 
        isOpen={isSearchOpen}
        onOpenChange={setIsSearchOpen}
        onProductSelect={handleProductSelect}
        productGroups={productGroups || []}
        allVariants={allVariants}
        existingVariantIds={fields.map(item => item.productVariantId)}
      />
       <UnsavedChangesDialog
        isOpen={showUnsavedDialog}
        onOpenChange={setShowUnsavedDialog}
        onSaveAndExit={handleSaveAndNavigate}
        onDiscardAndExit={handleDiscardAndNavigate}
        isSaving={isSubmitting}
      />
      <CustomDialog
        isOpen={isArchiveDialogOpen}
        onClose={() => setIsArchiveDialogOpen(false)}
        title="ยืนยันการย้ายไปถังขยะ"
      >
        <p className="text-sm text-muted-foreground">
            คุณแน่ใจหรือไม่ว่าต้องการย้ายแพ็กเกจ "{initialData?.name}" ไปที่ถังขยะ?
        </p>
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-6">
            <Button variant="outline" onClick={() => setIsArchiveDialogOpen(false)}>ยกเลิก</Button>
            <Button
                onClick={handleArchive}
                variant="destructive"
                disabled={isSubmitting}
            >
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                ยืนยัน
            </Button>
        </div>
      </CustomDialog>
    </>
  );
}
