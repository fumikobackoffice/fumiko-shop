
'use client';
import React, { useState, useMemo, useTransition, useEffect, useCallback } from 'react';
import { useFirestore } from '@/firebase';
import { collection, writeBatch, doc, addDoc, updateDoc, where, getDocs, limit, deleteDoc } from 'firebase/firestore';
import { ServiceCategory } from '@/lib/types';
import { Button, buttonVariants } from '@/components/ui/button';
import { PlusCircle, Loader2, Archive, RotateCw, Edit, MoreHorizontal, Trash2, ChevronRight, Eye } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { CustomDialog } from './custom-dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '../ui/badge';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useAuth } from '@/hooks/use-auth';
import { Checkbox } from '../ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Separator } from '../ui/separator';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { clearGlobalCache } from '@/hooks/use-smart-fetch';

const categoryFormSchema = z.object({
  name: z.string().min(1, { message: "กรุณากรอกชื่อหมวดหมู่บริการ" }),
});

function CategoryFormDialog({
  isOpen,
  onClose,
  onSave,
  initialData,
  isPending,
  title,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (values: { name: string }) => void;
  initialData?: { name: string };
  isPending: boolean;
  title: string;
}) {
  const form = useForm<z.infer<typeof categoryFormSchema>>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: initialData || { name: '' },
  });

  useEffect(() => {
    if (isOpen) {
        if (initialData) {
            form.reset(initialData);
        } else {
            form.reset({ name: '' });
        }
    }
  }, [isOpen, initialData, form]);

  const onSubmit = (values: z.infer<typeof categoryFormSchema>) => {
    onSave(values);
  };

  return (
    <CustomDialog isOpen={isOpen} onClose={onClose} title={title}>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>ชื่อหมวดหมู่บริการ</FormLabel>
                <FormControl>
                  <Input placeholder="เช่น ซ่อมบำรุง, ให้คำปรึกษา" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>ยกเลิก</Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              บันทึก
            </Button>
          </div>
        </form>
      </Form>
    </CustomDialog>
  );
}

interface ServiceCategoryManagerProps {
  categories: ServiceCategory[];
  isLoading: boolean;
  onRefresh: () => void;
}

export function ServiceCategoryManager({ categories: flatCategories, isLoading, onRefresh }: ServiceCategoryManagerProps) {
  const { user } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState('active');

  // RBAC check
  const canManageInventory = useMemo(() => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    const perms = user.permissions || [];
    return perms.includes('inventory:manage') || perms.includes('manage_inventory');
  }, [user]);

  const [dialogState, setDialogState] = useState<{
    isOpen: boolean;
    mode: 'add' | 'edit';
    title: string;
    level?: 'A' | 'B' | 'C';
    parentId?: string | null;
    category?: ServiceCategory;
  }>({ isOpen: false, mode: 'add', title: '' });

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isActionDialogOpen, setIsActionDialogOpen] = useState(false);
  const [categoryToAction, setCategoryToAction] = useState<ServiceCategory | null>(null);
  const [actionType, setActionType] = useState<'archive' | 'restore' | 'delete' | null>(null);

  useEffect(() => {
    setSelectedIds([]);
  }, [activeTab]);

  const getLevelName = (level: 'A' | 'B' | 'C') => {
    switch (level) {
        case 'A': return 'หมวดหมู่หลัก';
        case 'B': return 'หมวดหมู่ย่อย';
        case 'C': return 'ประเภทบริการ';
    }
  }
  
  const { activeTree, archivedList } = useMemo(() => {
    if (!flatCategories) return { activeTree: [], archivedList: [] };

    const activeCategories = flatCategories.filter(cat => cat.status === 'active');
    const archived = flatCategories.filter(cat => cat.status === 'archived');

    const categoryMap: Record<string, ServiceCategory & { subCategories: any[] }> = {};
    activeCategories.forEach(cat => {
      categoryMap[cat.id] = { ...cat, subCategories: [] };
    });

    const tree: (ServiceCategory & { subCategories: any[] })[] = [];
    activeCategories.forEach(cat => {
      if (cat.parentId && categoryMap[cat.parentId]) {
        categoryMap[cat.parentId].subCategories.push(categoryMap[cat.id]);
      } else {
        tree.push(categoryMap[cat.id]);
      }
    });

    return { activeTree: tree, archivedList: archived };
  }, [flatCategories]);

  const handleOpenDialog = (
    mode: 'add' | 'edit',
    category?: ServiceCategory,
    level?: 'A' | 'B' | 'C',
    parentId?: string | null
  ) => {
    if (!canManageInventory) return;
    let title = '';
    if (mode === 'add') {
        title = level === 'A' ? 'เพิ่มหมวดหมู่บริการหลัก' : level === 'B' ? 'เพิ่มหมวดหมู่บริการย่อย' : 'เพิ่มประเภทบริการ';
    } else {
        title = `แก้ไข: ${category?.name}`;
    }
    setDialogState({
      isOpen: true,
      mode,
      title,
      level,
      parentId: parentId === undefined ? null : parentId,
      category,
    });
  };

  const handleCloseDialog = () => {
    setDialogState({ isOpen: false, mode: 'add', title: '' });
  };
  
  const handleSaveCategory = (values: { name: string }) => {
    if (!firestore || !canManageInventory) return;
    const { mode, category, level, parentId } = dialogState;

    startTransition(async () => {
      try {
        if (mode === 'edit' && category) {
          const categoryRef = doc(firestore, 'serviceCategories', category.id);
          await updateDoc(categoryRef, { name: values.name });
          toast({ title: 'สำเร็จ', description: 'หมวดหมู่บริการได้รับการอัปเดตแล้ว' });
        } else if (mode === 'add' && level) {
          const siblings = flatCategories?.filter(c => c.level === level && c.parentId === parentId) || [];
          const maxSortOrder = siblings.reduce((max, cat) => Math.max(max, cat.sortOrder), -1);
          const maxCode = siblings.reduce((max, cat) => {
            const codeNum = parseInt(cat.code, 10);
            return isNaN(codeNum) ? max : Math.max(max, codeNum);
          }, 0);
          
          const newCode = (maxCode + 1).toString().padStart(level === 'C' ? 2 : 1, '0');

          await addDoc(collection(firestore, 'serviceCategories'), {
            name: values.name,
            code: newCode,
            level: level,
            parentId: parentId,
            sortOrder: maxSortOrder + 1,
            status: 'active',
          });
          toast({ title: 'สำเร็จ', description: `สร้างหมวดหมู่บริการ "${values.name}" แล้ว` });
        }
        
        clearGlobalCache('service-categories-data');
        onRefresh();
        handleCloseDialog();
      } catch (error: any) {
        console.error("Error saving service category:", error);
        toast({ variant: 'destructive', title: 'เกิดข้อผิดพลาด', description: error.message });
      }
    });
  };

  const openActionDialog = useCallback((category: ServiceCategory | null, type: 'archive' | 'restore' | 'delete') => {
    if (!canManageInventory) return;
    setTimeout(() => {
      setCategoryToAction(category);
      setActionType(type);
      setIsActionDialogOpen(true);
    }, 100);
  }, [canManageInventory]);
  
  const closeActionDialog = () => {
    setIsActionDialogOpen(false);
    setCategoryToAction(null);
    setActionType(null);
  };
  
  const handleConfirmAction = () => {
    if (!actionType || !firestore || !canManageInventory) return;

    const isBulk = categoryToAction === null;
    const idsToProcess = isBulk ? selectedIds : [categoryToAction!.id];

    if (idsToProcess.length === 0) {
        closeActionDialog();
        return;
    }

    startTransition(async () => {
        try {
            const allCats = flatCategories || [];
            const docsToProcess = new Map<string, ServiceCategory>();

            const findAllDescendants = (parentId: string) => {
                const children = allCats.filter(cat => cat.parentId === parentId);
                for (const child of children) {
                    if (!docsToProcess.has(child.id)) {
                        docsToProcess.set(child.id, child);
                        findAllDescendants(child.id);
                    }
                }
            };

            for (const id of idsToProcess) {
                const cat = allCats.find(c => c.id === id);
                if (cat && !docsToProcess.has(id)) {
                    docsToProcess.set(id, cat);
                    findAllDescendants(id);
                }
            }

            const categoriesToUpdate = Array.from(docsToProcess.values());
            
            const batch = writeBatch(firestore);

            if (actionType === 'delete') {
              if (user?.role !== 'super_admin') {
                toast({ variant: 'destructive', title: 'ไม่มีสิทธิ์', description: 'เฉพาะ Super Admin เท่านั้นที่สามารถลบถาวรได้' });
                return;
              }
              categoriesToUpdate.forEach(cat => batch.delete(doc(firestore, 'serviceCategories', cat.id)));
            } else {
              const newStatus = actionType === 'archive' ? 'archived' : 'active';
              categoriesToUpdate.forEach(cat => batch.update(doc(firestore, 'serviceCategories', cat.id), { status: newStatus }));
            }
            
            await batch.commit();
            
            clearGlobalCache('service-categories-data');
            onRefresh();

            const actionTextMap = { archive: 'จัดเก็บ', restore: 'กู้คืน', delete: 'ลบถาวร' };
            const successMessage = isBulk 
                ? `${actionTextMap[actionType]} ${idsToProcess.length} รายการสำเร็จ`
                : `${actionTextMap[actionType]}หมวดหมู่ "${categoryToAction!.name}" สำเร็จ`;
            toast({ title: 'สำเร็จ', description: successMessage });
        } catch (error: any) {
            console.error(`Error performing ${actionType}:`, error);
            toast({ variant: 'destructive', title: 'เกิดข้อผิดพลาด', description: error.message });
        } finally {
            closeActionDialog();
            setSelectedIds([]);
        }
    });
  };

  if (isLoading) {
    return (
        <Card>
            <div className="p-6">
                <Skeleton className="h-8 w-48" />
            </div>
            <CardContent>
                <div className="flex items-center justify-center py-16 text-muted-foreground">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    <span>กำลังโหลดหมวดหมู่บริการ...</span>
                </div>
            </CardContent>
        </Card>
    );
  }

  const isAllArchivedSelected = archivedList.length > 0 && selectedIds.length === archivedList.length;
  const isSomeArchivedSelected = archivedList.length > 0 && selectedIds.length > 0;
  
  const dialogContentMap: { [key in 'archive' | 'restore' | 'delete']?: { title: string; description: (name?: string, count?: number) => string; actionText: string; variant: string; } } = {
    archive: {
      title: 'ยืนยันการจัดเก็บ',
      description: (name) => `คุณแน่ใจหรือไม่ว่าต้องการจัดเก็บหมวดหมู่บริการ "${name}" และหมวดหมู่ย่อยทั้งหมด?`,
      actionText: 'ยืนยัน',
      variant: 'destructive',
    },
    restore: {
      title: 'ยืนยันการกู้คืน',
      description: (name, count) => name ? `คุณแน่ใจหรือไม่ว่าต้องการกู้คืนหมวดหมู่บริการ "${name}"?` : `คุณแน่ใจหรือไม่ว่าต้องการกู้คืน ${count} รายการที่เลือก?`,
      actionText: 'ยืนยันการกู้คืน',
      variant: 'default',
    },
    delete: {
      title: 'ยืนยันการลบถาวร',
      description: (name, count) => name ? `คุณแน่ใจหรือไม่ว่าต้องการลบหมวดหมู่บริการ "${name}" และหมวดหมู่ย่อยอย่างถาวร?` : `คุณแน่ใจหรือไม่ว่าต้องการลบ ${count} รายการที่เลือกอย่างถาวร?`,
      actionText: 'ยืนยันการลบถาวร',
      variant: 'destructive',
    },
  };
  const currentDialogContent = actionType ? dialogContentMap[actionType] : null;

  return (
    <>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex justify-between items-center mb-4">
            <TabsList>
                <TabsTrigger value="active">หมวดหมู่ที่ใช้งาน ({activeTree.length})</TabsTrigger>
                <TabsTrigger value="archived">ที่เก็บถาวร ({archivedList.length})</TabsTrigger>
            </TabsList>
            {activeTab === 'active' && canManageInventory && (
              <Button onClick={() => handleOpenDialog('add', undefined, 'A', null)} disabled={isPending}>
                <PlusCircle className="mr-2 h-4 w-4" /> เพิ่มหมวดหมู่หลัก
              </Button>
            )}
        </div>
        <TabsContent value="active">
            {activeTree.length > 0 ? (
                <Accordion type="multiple" className="w-full space-y-3">
                    {activeTree.map((catA) => (
                        <AccordionItem value={catA.id} key={catA.id} className="border-none">
                            <Card className="overflow-hidden border shadow-sm">
                                <div className="flex items-center justify-between w-full p-4 hover:bg-accent/5 transition-colors">
                                  <AccordionTrigger className="p-0 text-left hover:no-underline flex-1">
                                      <div className="flex flex-col">
                                          <div className="font-bold flex items-center gap-2 text-base text-foreground">
                                              {catA.name}
                                              <Badge variant="outline" className="font-normal text-xs h-5 bg-background">หมวดหมู่หลัก</Badge>
                                          </div>
                                          <p className="text-xs text-muted-foreground font-mono mt-0.5">รหัส: {catA.code}</p>
                                      </div>
                                  </AccordionTrigger>
                                  <div className="flex items-center gap-1 shrink-0 ml-4">
                                      {canManageInventory && (
                                        <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleOpenDialog('add', undefined, 'B', catA.id); }} disabled={isPending} className="h-9 text-sm font-medium">
                                            <PlusCircle className="mr-1.5 h-4 w-4" />
                                            หมวดหมู่ย่อย
                                        </Button>
                                      )}
                                      <DropdownMenu>
                                          <DropdownMenuTrigger asChild>
                                          <Button variant="ghost" size="icon" className="h-9 w-9">
                                              <MoreHorizontal className="h-5 w-5" />
                                          </Button>
                                          </DropdownMenuTrigger>
                                          <DropdownMenuContent align="end">
                                          <DropdownMenuItem onSelect={() => {
                                            setTimeout(() => handleOpenDialog('edit', catA), 100);
                                          }} disabled={isPending}>
                                              {canManageInventory ? <Edit className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                                              <span>{canManageInventory ? 'แก้ไขชื่อ' : 'ดูรายละเอียด'}</span>
                                          </DropdownMenuItem>
                                          {canManageInventory && (
                                            <DropdownMenuItem onSelect={() => openActionDialog(catA, 'archive')} disabled={isPending}>
                                                <Archive className="mr-2 h-4 w-4" />
                                                <span>จัดเก็บ</span>
                                            </DropdownMenuItem>
                                          )}
                                          </DropdownMenuContent>
                                      </DropdownMenu>
                                  </div>
                                </div>
                                <AccordionContent className="p-0 bg-muted/5 border-t">
                                {catA.subCategories && catA.subCategories.length > 0 ? (
                                    <div className="py-4 pr-4 pl-10 space-y-6 relative">
                                    <div className="absolute left-6 top-0 bottom-0 w-px bg-border" />
                                    
                                    {catA.subCategories.map((catB) => (
                                        <div key={catB.id} className="relative">
                                        <div className="absolute -left-[17px] top-6 w-4 h-px bg-border" />
                                        
                                        {catB.subCategories && catB.subCategories.length > 0 ? (
                                            <Collapsible defaultOpen>
                                            <div className="flex items-center justify-between p-3 rounded-lg bg-card border shadow-sm group hover:border-primary/30 transition-all">
                                                <div className="flex items-center gap-1">
                                                <CollapsibleTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 hover:bg-primary/10">
                                                    <ChevronRight className="h-5 w-5 transition-transform duration-200 data-[state=open]:rotate-90" />
                                                    </Button>
                                                </CollapsibleTrigger>
                                                <div className="flex flex-col">
                                                    <div className="font-bold flex items-center gap-2 text-base">
                                                        {catB.name} 
                                                        <Badge variant="secondary" className="font-normal text-xs h-5 px-1.5 bg-muted/50">หมวดหมู่ย่อย</Badge>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground font-mono leading-tight">รหัส: {catB.code}</p>
                                                </div>
                                                </div>
                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {canManageInventory && (
                                                  <Button size="sm" variant="ghost" onClick={() => handleOpenDialog('add', undefined, 'C', catB.id)} disabled={isPending} className="h-8 text-xs">
                                                      <PlusCircle className="mr-1.5 h-3.5 w-3.5" />เพิ่มประเภท
                                                  </Button>
                                                )}
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onSelect={() => {
                                                          setTimeout(() => handleOpenDialog('edit', catB), 100);
                                                        }} disabled={isPending}>
                                                          {canManageInventory ? <Edit className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                                                          <span>{canManageInventory ? 'แก้ไขชื่อ' : 'ดูรายละเอียด'}</span>
                                                        </DropdownMenuItem>
                                                        {canManageInventory && (
                                                          <DropdownMenuItem onSelect={() => openActionDialog(catB, 'archive')} disabled={isPending}><Archive className="mr-2 h-4 w-4" /><span>จัดเก็บ</span></DropdownMenuItem>
                                                        )}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                                </div>
                                            </div>
                                            <CollapsibleContent>
                                                <div className="ml-6 pl-6 border-l-2 border-muted/50 mt-2 space-y-3 relative">
                                                {catB.subCategories.map((catC) => (
                                                    <div key={catC.id} className="relative flex items-center justify-between p-3 pl-4 rounded-md border border-transparent hover:border-border hover:bg-card transition-all group/type">
                                                    <div className="absolute -left-[26px] top-1/2 -translate-y-1/2 w-6 h-px bg-muted/50" />
                                                    
                                                    <div className="flex flex-col min-w-0">
                                                        <div className="font-medium flex items-center gap-2 text-base">
                                                            {catC.name} 
                                                            <Badge variant="outline" className="font-normal text-xs h-5 px-1.5">ประเภทบริการ</Badge>
                                                        </div>
                                                        <p className="text-xs text-muted-foreground font-mono leading-tight">รหัส: {catC.code}</p>
                                                    </div>
                                                    <div className="flex items-center gap-1 opacity-0 group-hover/type:opacity-100 transition-opacity">
                                                        <DropdownMenu>
                                                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem onSelect={() => {
                                                              setTimeout(() => handleOpenDialog('edit', catC), 100);
                                                            }} disabled={isPending}>
                                                              {canManageInventory ? <Edit className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                                                              <span>{canManageInventory ? 'แก้ไขชื่อ' : 'ดูรายละเอียด'}</span>
                                                            </DropdownMenuItem>
                                                            {canManageInventory && (
                                                              <DropdownMenuItem onSelect={() => openActionDialog(catC, 'archive')} disabled={isPending}><Archive className="mr-2 h-4 w-4" /><span>จัดเก็บ</span></DropdownMenuItem>
                                                            )}
                                                        </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </div>
                                                    </div>
                                                ))}
                                                </div>
                                            </CollapsibleContent>
                                            </Collapsible>
                                        ) : (
                                            <div className="flex items-center justify-between p-3 rounded-lg bg-card border shadow-sm group hover:border-primary/30 transition-all">
                                                <div className="flex flex-col pl-8">
                                                    <div className="font-bold flex items-center gap-2 text-base">
                                                        {catB.name} 
                                                        <Badge variant="secondary" className="font-normal text-xs h-5 px-1.5 bg-muted/50">หมวดหมู่ย่อย</Badge>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground font-mono leading-tight">รหัส: {catB.code}</p>
                                                </div>
                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {canManageInventory && (
                                                      <Button size="sm" variant="ghost" onClick={() => handleOpenDialog('add', undefined, 'C', catB.id)} disabled={isPending} className="h-8 text-xs">
                                                          <PlusCircle className="mr-1.5 h-3.5 w-3.5" />เพิ่มประเภท
                                                      </Button>
                                                    )}
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem onSelect={() => {
                                                              setTimeout(() => handleOpenDialog('edit', catB), 100);
                                                            }} disabled={isPending}>
                                                              {canManageInventory ? <Edit className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                                                              <span>{canManageInventory ? 'แก้ไขชื่อ' : 'ดูรายละเอียด'}</span>
                                                            </DropdownMenuItem>
                                                            {canManageInventory && (
                                                              <DropdownMenuItem onSelect={() => openActionDialog(catB, 'archive')} disabled={isPending}><Archive className="mr-2 h-4 w-4" /><span>จัดเก็บ</span></DropdownMenuItem>
                                                            )}
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </div>
                                            </div>
                                        )}
                                        </div>
                                    ))}
                                    </div>
                                ) : (
                                    <div className="p-10 text-center text-base text-muted-foreground italic">
                                    ยังไม่มีหมวดหมู่ย่อยในหมวดหมู่นี้
                                    </div>
                                )}
                                </AccordionContent>
                            </Card>
                        </AccordionItem>
                    ))}
                </Accordion>
            ) : (
                <div className="text-center py-16 border bg-card rounded-lg border-dashed">
                    <p className="text-muted-foreground text-lg">ยังไม่มีหมวดหมู่บริการ เริ่มต้นด้วยการ "เพิ่มหมวดหมู่หลัก"</p>
                </div>
            )}
        </TabsContent>
         <TabsContent value="archived">
            {archivedList.length > 0 ? (
              <div className="rounded-lg border bg-card overflow-hidden">
                <Table>
                   <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead className="w-[50px] px-4 text-center">
                           <Checkbox
                              checked={isAllArchivedSelected ? true : isSomeArchivedSelected ? 'indeterminate' : false}
                              onCheckedChange={(checked) => setSelectedIds(checked ? archivedList.map(c => c.id) : [])}
                              disabled={!canManageInventory}
                            />
                        </TableHead>
                        <TableHead>หมวดหมู่บริการ</TableHead>
                        <TableHead className="text-right">ดำเนินการ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                        {archivedList.map(cat => (
                           <TableRow key={cat.id} data-state={selectedIds.includes(cat.id) ? "selected" : ""} className="hover:bg-muted/30">
                                <TableCell className="px-4 text-center">
                                  <Checkbox
                                      checked={selectedIds.includes(cat.id)}
                                      onCheckedChange={(checked) => {
                                          setSelectedIds(
                                              checked
                                                  ? [...selectedIds, cat.id]
                                                  : selectedIds.filter((id) => id !== cat.id)
                                          );
                                      }}
                                      disabled={!canManageInventory}
                                  />
                                </TableCell>
                                <TableCell>
                                  <div className="font-medium flex items-center gap-2 text-base">
                                    {cat.name}
                                    <Badge variant="outline" className="font-normal text-xs h-5">{getLevelName(cat.level)}</Badge>
                                  </div>
                                  <p className="text-xs text-muted-foreground font-mono">รหัส: {cat.code}</p>
                                </TableCell>
                                <TableCell className="text-right">
                                  <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                          <Button variant="ghost" size="icon" className="h-9 w-9">
                                            <MoreHorizontal className="h-5 w-5" />
                                          </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                          {canManageInventory && (
                                            <DropdownMenuItem onSelect={() => openActionDialog(cat, 'restore')} disabled={isPending}>
                                                <RotateCw className="mr-2 h-4 w-4" />
                                                <span>กู้คืน</span>
                                            </DropdownMenuItem>
                                          )}
                                          {user?.role === 'super_admin' && (
                                              <DropdownMenuItem onSelect={() => openActionDialog(cat, 'delete')} className="text-destructive focus:text-destructive focus:bg-destructive/10" disabled={isPending}>
                                                  <Trash2 className="mr-2 h-4 w-4" />
                                                  <span>ลบถาวร</span>
                                              </DropdownMenuItem>
                                          )}
                                          {!canManageInventory && (
                                            <DropdownMenuItem disabled>ไม่มีสิทธิ์จัดการ</DropdownMenuItem>
                                          )}
                                      </DropdownMenuContent>
                                  </DropdownMenu>
                                </TableCell>
                           </TableRow>
                        ))}
                    </TableBody>
                </Table>
              </div>
            ) : (
                <div className="text-center py-16 border bg-card rounded-lg border-dashed">
                    <p className="text-muted-foreground text-lg">ไม่มีหมวดหมู่ที่จัดเก็บ</p>
                </div>
            )}
        </TabsContent>
      </Tabs>

      {selectedIds.length > 0 && activeTab === 'archived' && canManageInventory && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 animate-in fade-in-0 slide-in-from-bottom-5">
              <div className="bg-card text-card-foreground rounded-lg border shadow-lg flex items-center h-14 px-6 gap-4">
                <span className="text-base font-medium">{selectedIds.length} รายการที่เลือก</span>
                <Separator orientation="vertical" className="h-8" />
                <Button variant="outline" size="sm" onClick={() => openActionDialog(null, 'restore')}>
                  <RotateCw className="mr-2 h-4 w-4" />
                  กู้คืน
                </Button>
                {user?.role === 'super_admin' && (
                    <Button variant="destructive" size="sm" onClick={() => openActionDialog(null, 'delete')}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      ลบถาวร
                  </Button>
                )}
              </div>
          </div>
      )}
      
      <CategoryFormDialog 
        isOpen={dialogState.isOpen}
        onClose={handleCloseDialog}
        onSave={handleSaveCategory}
        initialData={dialogState.mode === 'edit' ? { name: dialogState.category!.name } : undefined}
        isPending={isPending}
        title={dialogState.title}
      />

       {currentDialogContent && (
        <CustomDialog isOpen={isActionDialogOpen} onClose={closeActionDialog} title={currentDialogContent.title}>
            <p className="text-base text-muted-foreground">{currentDialogContent.description(categoryToAction?.name, selectedIds.length)}</p>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-6">
                <Button variant="outline" onClick={closeActionDialog}>ยกเลิก</Button>
                <Button
                    onClick={handleConfirmAction}
                    disabled={isPending}
                    className={cn(buttonVariants({ variant: currentDialogContent.variant as any | 'default' }))}
                >
                    {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {currentDialogContent.actionText}
                </Button>
            </div>
        </CustomDialog>
      )}
    </>
  );
}
