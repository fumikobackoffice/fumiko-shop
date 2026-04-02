
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
import { useToast } from '@/hooks/use-toast';
import { useState, useMemo, useEffect } from 'react';
import { Loader2, PlusCircle, Pencil, Search, User, FileText, X, Info, History, RotateCw } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { collection, serverTimestamp, doc, query, orderBy, runTransaction } from 'firebase/firestore';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ProductGroup, ProductVariant, InventoryLot, StockAdjustmentTransaction } from '@/lib/types';
import { CustomDialog } from './custom-dialog';
import { v4 as uuidv4 } from 'uuid';
import { Label } from '../ui/label';
import { cn } from '@/lib/utils';
import { Skeleton } from '../ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '../ui/badge';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { Switch } from '@/components/ui/switch';
import { clearGlobalCache } from '@/hooks/use-smart-fetch';
import { getLatestLotSellingPrice } from '@/lib/lot-pricing';

const adjustmentFormSchema = z.object({
    adjustmentType: z.enum(['add', 'deduct', 'wastage']),
    quantity: z.coerce.number().int('ต้องเป็นจำนวนเต็ม').min(0, 'จำนวนต้องไม่ติดลบ'),
    cost: z.coerce.number().min(0, 'ต้นทุนต้องไม่ติดลบ').optional(),
    sellingPrice: z.coerce.number().min(0, 'ราคาขายต้องไม่ติดลบ').optional(),
    reason: z.string().min(1, 'กรุณาระบุเหตุผล'),
});

type AdjustmentFormValues = z.infer<typeof adjustmentFormSchema>;

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

function AdjustmentForm({
    productGroup,
    selectedVariant,
    targetLot,
    onClose,
    onSuccess
}: {
    productGroup: ProductGroup;
    selectedVariant: ProductVariant;
    targetLot: InventoryLot | null;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { user: adminUser } = useAuth();
    const firestore = useFirestore();
    const isNewLot = targetLot === null;

    const form = useForm<AdjustmentFormValues>({
        resolver: zodResolver(adjustmentFormSchema),
        defaultValues: {
            adjustmentType: 'add',
            quantity: isNewLot ? 1 : 0,
            reason: isNewLot ? '' : 'อัปเดตราคา/จำนวน',
            cost: isNewLot ? 0 : undefined,
            sellingPrice: isNewLot ? getLatestLotSellingPrice(selectedVariant) : targetLot?.sellingPrice,
        },
    });

    const onSubmit = async (values: AdjustmentFormValues) => {
        setIsSubmitting(true);
        if (!adminUser || !firestore) {
            toast({ variant: 'destructive', title: 'เกิดข้อผิดพลาด', description: 'ข้อมูลไม่ครบถ้วน' });
            setIsSubmitting(false);
            return;
        }

        const { quantity, reason, cost } = values;
        let currentAdjustmentType = values.adjustmentType;
        
        const variantRef = doc(firestore, 'productGroups', productGroup.id, 'productVariants', selectedVariant.id);
        
        try {
            await runTransaction(firestore, async (transaction) => {
                const variantSnap = await transaction.get(variantRef);
                if (!variantSnap.exists()) throw new Error("ไม่พบข้อมูลสินค้า");
                
                const currentVariantData = variantSnap.data() as ProductVariant;
                let newInventoryLots = [...(currentVariantData.inventoryLots || [])];
                let transactionLotId = '';
                let finalAdjustmentType: StockAdjustmentTransaction['type'] = 'ADJUST_ADD';

                if (isNewLot) {
                    if (quantity <= 0) {
                        throw new Error('จำนวนการรับเข้าล็อตใหม่ต้องมากกว่า 0');
                    }
                    if (cost === undefined || cost === null) {
                        throw new Error('กรุณาระบุต้นทุนสำหรับล็อตใหม่');
                    }
                    finalAdjustmentType = 'MANUAL_ENTRY'; 
                    transactionLotId = uuidv4();
                    const newLot: InventoryLot = { 
                        lotId: transactionLotId, 
                        quantity: quantity, 
                        cost: cost!, 
                        sellingPrice: values.sellingPrice ?? undefined,
                        receivedAt: new Date(),
                        purchaseOrderNumber: 'MANUAL'
                    };
                    newInventoryLots.push(newLot);
                } else {
                    transactionLotId = targetLot.lotId;
                    if (currentAdjustmentType === 'add') finalAdjustmentType = 'ADJUST_ADD';
                    else if (currentAdjustmentType === 'deduct') finalAdjustmentType = 'ADJUST_DEDUCT';
                    else finalAdjustmentType = 'WASTAGE';
                    
                    let existingLotIndex = newInventoryLots.findIndex(l => l.lotId === transactionLotId);
                    
                    if (existingLotIndex === -1 && currentAdjustmentType === 'add') {
                        const resurrectedLot: InventoryLot = {
                            lotId: targetLot.lotId,
                            quantity: 0,
                            cost: targetLot.cost,
                            receivedAt: targetLot.receivedAt,
                            purchaseOrderNumber: targetLot.purchaseOrderNumber || 'HISTORY',
                            supplierId: targetLot.supplierId
                        };
                        newInventoryLots.push(resurrectedLot);
                        existingLotIndex = newInventoryLots.length - 1;
                    }

                    if (existingLotIndex === -1) throw new Error("ไม่พบข้อมูลล็อตสินค้าในระบบปัจจุบัน (อาจถูกลบไปแล้ว)");

                    const existingLot = newInventoryLots[existingLotIndex];
                    if (currentAdjustmentType !== 'add' && quantity > existingLot.quantity) {
                        throw new Error(`ไม่สามารถเบิกเกินจำนวนที่มี (${existingLot.quantity} ชิ้น)`);
                    }

                    const newQuantity = currentAdjustmentType === 'add' 
                        ? existingLot.quantity + quantity 
                        : existingLot.quantity - quantity;
                    
                    newInventoryLots[existingLotIndex] = { 
                        ...existingLot, 
                        quantity: newQuantity,
                        sellingPrice: values.sellingPrice ?? undefined
                    };
                    newInventoryLots = newInventoryLots.filter(lot => lot.quantity > 0);
                }

                transaction.update(variantRef, { inventoryLots: newInventoryLots });
                
                const adjustmentRef = doc(collection(firestore, 'productGroups', productGroup.id, 'productVariants', selectedVariant.id, 'stockAdjustments'));
                const adjustmentData: Omit<StockAdjustmentTransaction, 'id' | 'createdAt'> = {
                    productVariantId: selectedVariant.id,
                    lotId: transactionLotId,
                    adminUserId: adminUser.id,
                    adminName: adminUser.name,
                    type: quantity === 0 ? 'ADJUST_ADD' : finalAdjustmentType, // If only price adjusted
                    quantity: quantity,
                    reason: reason,
                };
                transaction.set(adjustmentRef, { ...adjustmentData, createdAt: serverTimestamp() });
            });

            toast({ title: 'ปรับปรุงสต็อกสำเร็จ' });
            clearGlobalCache('products-data');
            clearGlobalCache('inventory-ledger-data');
            onSuccess();

        } catch (error: any) {
            console.error('Error adjusting stock:', error);
            toast({ variant: 'destructive', title: 'เกิดข้อผิดพลาด', description: error.message });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="pt-2">
             <h3 className="font-semibold text-lg mb-1">
                {isNewLot ? 'เพิ่มล็อตสินค้าใหม่' : 'ปรับปรุงสต็อกล็อต'}
            </h3>
             <p className="text-sm text-muted-foreground mb-4">
                {isNewLot 
                    ? `สำหรับสินค้า: ${Object.values(selectedVariant.attributes).join(' / ') || 'ตัวเลือกหลัก'}`
                    : `Lot ID: ${targetLot.lotId.substring(0, 8)} (คงเหลือ: ${targetLot.quantity} ชิ้น)`
                }
            </p>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                     {!isNewLot && (
                        <FormField control={form.control} name="adjustmentType" render={({ field }) => (
                            <FormItem><FormLabel>ประเภทการปรับปรุง</FormLabel>
                                <FormControl>
                                  <RadioGroup 
                                    onValueChange={field.onChange} 
                                    value={field.value} 
                                    className="grid grid-cols-3 gap-2"
                                  >
                                    <div className="flex items-center space-x-2">
                                      <RadioGroupItem value="add" id="increase" className="peer sr-only" />
                                      <Label htmlFor="increase" className={cn("flex flex-col items-center justify-center rounded-md border-2 border-muted bg-popover p-2 hover:bg-accent hover:text-accent-foreground cursor-pointer peer-data-[state=checked]:border-primary h-16")}>
                                        <span className="text-xs font-bold">เพิ่มจำนวน</span>
                                      </Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      <RadioGroupItem value="deduct" id="decrease" className="peer sr-only" />
                                      <Label htmlFor="decrease" className={cn("flex flex-col items-center justify-center rounded-md border-2 border-muted bg-popover p-2 hover:bg-accent hover:text-accent-foreground cursor-pointer peer-data-[state=checked]:border-orange-500 h-16")}>
                                        <span className="text-xs font-bold">ลด (ทั่วไป)</span>
                                      </Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      <RadioGroupItem value="wastage" id="wastage" className="peer sr-only" />
                                      <Label htmlFor="wastage" className={cn("flex flex-col items-center justify-center rounded-md border-2 border-muted bg-popover p-2 hover:bg-accent hover:text-accent-foreground cursor-pointer peer-data-[state=checked]:border-destructive h-16")}>
                                        <span className="text-xs font-bold">ของเสีย/เน่า</span>
                                      </Label>
                                    </div>
                                  </RadioGroup>
                                </FormControl>
                            </FormItem>)} />
                    )}
                    <FormField control={form.control} name="quantity" render={({ field }) => (<FormItem><FormLabel>จำนวน <span className="text-muted-foreground text-xs">(กรอก 0 ได้ถ้าต้องการแก้แค่ราคา)</span></FormLabel><FormControl><NumericInput isDecimal={false} {...field} /></FormControl><FormMessage /></FormItem>)} />
                    {isNewLot && <FormField control={form.control} name="cost" render={({ field }) => (<FormItem><FormLabel>ต้นทุนต่อหน่วย <span className="text-destructive">*</span></FormLabel><FormControl><NumericInput {...field} /></FormControl><FormMessage /></FormItem>)} />}
                    <FormField control={form.control} name="sellingPrice" render={({ field }) => (<FormItem><FormLabel>ราคาขายต่อหน่วย <span className="text-muted-foreground text-xs">(ถ้าไม่กรอกจะใช้ราคามาตรฐาน)</span></FormLabel><FormControl><NumericInput {...field} value={field.value ?? ''} placeholder="ราคาขายของล็อตนี้" /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="reason" render={({ field }) => (<FormItem><FormLabel>เหตุผล <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="เช่น ของเสีย, นับสต็อก, อัปเดตราคา" {...field} /></FormControl><FormMessage /></FormItem>)} />

                    <div className="flex justify-end gap-2 pt-4">
                        <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>ยกเลิก</Button>
                        <Button type="submit" disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}ยืนยัน</Button>
                    </div>
                </form>
            </Form>
        </div>
    );
}

interface StockAdjustmentDialogProps {
  productGroup: ProductGroup;
  variants: ProductVariant[];
  initialVariantId?: string | null;
  onClose: () => void;
}

const getAdjustmentTypeStyle = (type: StockAdjustmentTransaction['type']) => {
    switch (type) {
        case 'ADJUST_ADD':
        case 'PURCHASE':
        case 'MANUAL_ENTRY':
            return { variant: 'secondary', text: 'นำเข้า/เพิ่ม' } as const;
        case 'ADJUST_DEDUCT':
            return { variant: 'destructive', text: 'เบิก/ลด' } as const;
        case 'WASTAGE':
            return { variant: 'destructive', text: 'ของเสีย/ทิ้ง' } as const;
        case 'SALE':
            return { variant: 'outline', text: 'ขายสินค้า' } as const;
        case 'RETURN':
            return { variant: 'secondary', text: 'คืนสต็อก' } as const;
        default:
            return { variant: 'outline', text: type } as const;
    }
};


export function StockAdjustmentDialog({ productGroup, variants, initialVariantId, onClose }: StockAdjustmentDialogProps) {
  const firestore = useFirestore();
  const [selectedVariantId, setSelectedVariantId] = useState<string>(initialVariantId || '');
  const [adjustmentTarget, setAdjustmentTarget] = useState<InventoryLot | 'new' | null>(null);
  
  const [activeTab, setActiveTab] = useState<string>("lots");
  const [historyLotFilter, setHistoryLotFilter] = useState<string | null>(null);
  const [showDepleted, setShowDepleted] = useState(false);

  const [lotCurrentPage, setLotCurrentPage] = useState(1);
  const [historyCurrentPage, setHistoryCurrentPage] = useState(1);
  const [lotSearchTerm, setLotSearchTerm] = useState('');
  const ITEMS_PER_PAGE = 10;
  
  const areVariantsLoading = !variants;

  const adjustmentsQuery = useMemoFirebase(() => {
    if (!firestore || !productGroup || !selectedVariantId) return null;
    return query(
        collection(firestore, 'productGroups', productGroup.id, 'productVariants', selectedVariantId, 'stockAdjustments'),
        orderBy('createdAt', 'desc')
    );
  }, [firestore, productGroup, selectedVariantId]);
  const { data: adjustments, isLoading: areAdjustmentsLoading } = useCollection<StockAdjustmentTransaction>(adjustmentsQuery);

  useEffect(() => {
    if (areVariantsLoading || !variants) return;

    const isSelectionInvalid = !selectedVariantId || !variants.some(v => v.id === selectedVariantId);
    if (variants.length > 0 && isSelectionInvalid) {
        setSelectedVariantId(variants[0].id);
    } else if (variants.length === 0) {
        setSelectedVariantId('');
    }

    setLotCurrentPage(1);
    setHistoryCurrentPage(1);
    setLotSearchTerm('');
    setHistoryLotFilter(null);
  }, [variants, areVariantsLoading, selectedVariantId]);


  const selectedVariant = useMemo(() => {
    return variants?.find(v => v.id === selectedVariantId);
  }, [variants, selectedVariantId]);

  const historicalLots = useMemo(() => {
    if (!adjustments || !selectedVariant) return [];
    
    const activeLotIds = new Set((selectedVariant.inventoryLots || []).map(l => l.lotId));
    const lotOrigins = adjustments.filter(adj => ['PURCHASE', 'MANUAL_ENTRY', 'INITIAL'].includes(adj.type));
    
    const depleted: InventoryLot[] = [];
    const seenIds = new Set<string>();

    lotOrigins.forEach(origin => {
        if (!activeLotIds.has(origin.lotId) && !seenIds.has(origin.lotId)) {
            seenIds.add(origin.lotId);
            depleted.push({
                lotId: origin.lotId,
                quantity: 0,
                cost: 0, 
                receivedAt: origin.createdAt,
                purchaseOrderNumber: origin.reason.includes('#') ? origin.reason.split('#')[1] : 'N/A'
            });
        }
    });

    return depleted;
  }, [adjustments, selectedVariant]);

  const filteredAndSortedLots = useMemo(() => {
    if (!selectedVariant) return [];
    
    let baseLots = [...(selectedVariant.inventoryLots || [])];
    if (showDepleted) {
        baseLots = [...baseLots, ...historicalLots];
    }
    
    const filtered = lotSearchTerm
        ? baseLots.filter(lot =>
            lot.lotId.toLowerCase().includes(lotSearchTerm.toLowerCase()) ||
            lot.purchaseOrderNumber?.toLowerCase().includes(lotSearchTerm.toLowerCase())
          )
        : baseLots;

    return [...filtered].sort((a, b) => {
        const dateA = a.receivedAt?.toDate ? a.receivedAt.toDate() : new Date(a.receivedAt || 0);
        const dateB = b.receivedAt?.toDate ? b.receivedAt.toDate() : new Date(b.receivedAt || 0);
        return dateB.getTime() - dateA.getTime();
    });
  }, [selectedVariant, historicalLots, lotSearchTerm, showDepleted]);

  useEffect(() => {
    setLotCurrentPage(1);
  }, [lotSearchTerm, showDepleted]);

  const lotPageCount = useMemo(() => {
    return filteredAndSortedLots ? Math.ceil(filteredAndSortedLots.length / ITEMS_PER_PAGE) : 0;
  }, [filteredAndSortedLots]);

  const paginatedLots = useMemo(() => {
    if (!filteredAndSortedLots) return [];
    const startIndex = (lotCurrentPage - 1) * ITEMS_PER_PAGE;
    return filteredAndSortedLots.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredAndSortedLots, lotCurrentPage]);

  const filteredAdjustments = useMemo(() => {
    if (!adjustments) return [];
    if (historyLotFilter) {
        return adjustments.filter(adj => adj.lotId === historyLotFilter);
    }
    return adjustments; // Show all history by default
  }, [adjustments, historyLotFilter]);

  const historyPageCount = useMemo(() => {
    return filteredAdjustments ? Math.ceil(filteredAdjustments.length / ITEMS_PER_PAGE) : 0;
  }, [filteredAdjustments]);

  const paginatedAdjustments = useMemo(() => {
    if (!filteredAdjustments) return [];
    const startIndex = (historyCurrentPage - 1) * ITEMS_PER_PAGE;
    return filteredAdjustments.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredAdjustments, historyCurrentPage]);

  const handleAdjustClick = (lot: InventoryLot) => setAdjustmentTarget(lot);
  const handleAddNewClick = () => setAdjustmentTarget('new');
  const handleFormClose = () => setAdjustmentTarget(null);

  const handleViewLotLog = (lotId: string) => {
    setHistoryLotFilter(lotId);
    setHistoryCurrentPage(1);
    setActiveTab("history");
  };

  return (
    <CustomDialog isOpen={true} onClose={onClose} title={`สมุดบันทึกสต็อก - ${productGroup.name}`} size="3xl">
        {areVariantsLoading ? <Skeleton className="h-40 w-full" /> : 
          adjustmentTarget !== null ? (
            <AdjustmentForm
              productGroup={productGroup}
              selectedVariant={selectedVariant!}
              targetLot={adjustmentTarget === 'new' ? null : adjustmentTarget}
              onClose={handleFormClose}
              onSuccess={handleFormClose}
            />
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <div className="flex items-center justify-between mb-4">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="lots">รายการล็อตปัจจุบัน</TabsTrigger>
                        <TabsTrigger value="history">ประวัติการเคลื่อนไหว</TabsTrigger>
                    </TabsList>
                </div>
                 <div className="px-1 mb-4">
                    <Label className="text-muted-foreground text-xs uppercase tracking-wider font-bold">ตัวเลือกสินค้า</Label>
                    <div className="flex items-center justify-between h-11 px-3 border rounded-md bg-muted/20 mt-1">
                        <span className="text-sm font-medium">
                            {Object.values(selectedVariant?.attributes || {}).join(' / ') || 'ตัวเลือกหลัก'}
                        </span>
                        <span className="text-xs text-muted-foreground font-mono">
                            SKU: {selectedVariant?.sku}
                        </span>
                    </div>
                 </div>
                
                <TabsContent value="lots" className="pt-2">
                    {selectedVariantId ? (
                       <>
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 px-1 gap-4">
                            <div className="relative flex-grow w-full">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="ค้นหาเลขล็อต หรือ PO..."
                                    value={lotSearchTerm}
                                    onChange={(e) => setLotSearchTerm(e.target.value)}
                                    className="pl-8"
                                />
                            </div>
                            <div className="flex items-center gap-4 shrink-0">
                                <div className="flex items-center gap-2">
                                    <Switch id="show-depleted" checked={showDepleted} onCheckedChange={setShowDepleted} />
                                    <Label htmlFor="show-depleted" className="text-xs font-bold cursor-pointer">แสดงที่หมดแล้ว</Label>
                                </div>
                                <Button onClick={handleAddNewClick} size="sm" className="h-9"><PlusCircle className="mr-2 h-4 w-4" /> เพิ่มล็อตใหม่</Button>
                            </div>
                        </div>
                        <div className="bg-primary/5 border border-primary/10 rounded-lg p-3 mb-4 flex justify-between items-center">
                            <span className="text-sm font-medium">จำนวนสินค้าคงเหลือรวม (ตัวเลือกนี้)</span>
                            <span className="text-xl font-bold text-primary">{(selectedVariant?.inventoryLots || []).reduce((sum, lot) => sum + lot.quantity, 0).toLocaleString()} <span className="text-sm font-normal text-muted-foreground">ชิ้น</span></span>
                        </div>
                        <div className="rounded-lg border overflow-hidden">
                            <Table><TableHeader className="bg-muted/50"><TableRow>
                                <TableHead>จำนวน</TableHead>
                                <TableHead>ต้นทุน/หน่วย</TableHead>
                                <TableHead>ราคาขาย/หน่วย</TableHead>
                                <TableHead>วันที่รับเข้า</TableHead>
                                <TableHead>Lot ID</TableHead>
                                <TableHead className="text-right">ดำเนินการ</TableHead>
                            </TableRow></TableHeader>
                            <TableBody>
                                {paginatedLots && paginatedLots.length > 0 ? (
                                    paginatedLots.map(lot => {
                                        const dateObj = lot.receivedAt?.toDate ? lot.receivedAt.toDate() : new Date(lot.receivedAt || 0);
                                        const displayDate = dateObj ? format(dateObj, 'd MMM ') + (dateObj.getFullYear() + 543) : '-';
                                        const isDepleted = lot.quantity <= 0;
                                        
                                        return (
                                            <TableRow key={lot.lotId} className={cn(isDepleted && "opacity-60 bg-muted/30")}>
                                                <TableCell className="font-bold">
                                                    {isDepleted ? (
                                                        <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-dashed">หมดสต็อก</Badge>
                                                    ) : (
                                                        <span>{lot.quantity.toLocaleString()} ชิ้น</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>{lot.cost > 0 ? `฿${lot.cost.toLocaleString('th-TH', {minimumFractionDigits: 2})}` : '-'}</TableCell>
                                                <TableCell className="text-emerald-600 font-medium">
                                                    {lot.sellingPrice != null ? `฿${lot.sellingPrice.toLocaleString('th-TH', {minimumFractionDigits: 2})}` : '-'}
                                                </TableCell>
                                                <TableCell className="text-xs">{displayDate}</TableCell>
                                                <TableCell className="text-xs font-mono text-muted-foreground">{lot.lotId.substring(0,8)}</TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <Button variant="outline" size="sm" onClick={() => handleViewLotLog(lot.lotId)} title="ดูสมุดบันทึกของล็อตนี้" className="h-8 text-xs">
                                                            <FileText className="mr-1.5 h-3.5 w-3.5"/>
                                                            บันทึก
                                                        </Button>
                                                        <Button variant="outline" size="sm" onClick={() => handleAdjustClick(lot)} title="ปรับปรุงสต็อก" className="h-8 text-xs">
                                                            <Pencil className="mr-1.5 h-3.5 w-3.5"/>
                                                            ปรับปรุง
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })
                                ) : (<TableRow><TableCell colSpan={6} className="text-center h-32 text-muted-foreground">ไม่มีสต็อกสินค้าในล็อตปัจจุบัน</TableCell></TableRow>)}
                            </TableBody></Table>
                        </div>
                        {lotPageCount > 1 && (
                          <div className="flex items-center justify-end space-x-2 pt-4">
                            <span className="text-xs text-muted-foreground">
                              หน้า {lotCurrentPage} จาก {lotPageCount}
                            </span>
                            <Button variant="outline" size="sm" onClick={() => setLotCurrentPage(p => p - 1)} disabled={lotCurrentPage === 1}>ก่อนหน้า</Button>
                            <Button variant="outline" size="sm" onClick={() => setLotCurrentPage(p => p + 1)} disabled={lotCurrentPage === lotPageCount}>ถัดไป</Button>
                          </div>
                        )}
                       </>
                    ) : <p className="text-center text-muted-foreground py-12">กรุณาเลือกตัวเลือกสินค้าเพื่อดูข้อมูลล็อต</p>}
                </TabsContent>

                <TabsContent value="history" className="pt-2">
                    {selectedVariantId ? (
                        areAdjustmentsLoading ? <Skeleton className="h-40 w-full" /> : (
                        <>
                            <div className="flex items-center justify-between mb-4">
                                {historyLotFilter ? (
                                    <div className="flex items-center gap-2 text-sm font-medium bg-accent/50 p-2 rounded-md border border-accent">
                                        <FileText className="h-4 w-4 text-primary" />
                                        <span>กำลังดูประวัติของล็อต: <span className="font-mono">{historyLotFilter.substring(0, 8)}</span></span>
                                        <Button variant="ghost" size="icon" onClick={() => setHistoryLotFilter(null)} className="h-6 w-6 ml-2 hover:bg-accent">
                                            <X className="h-3 w-3" />
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="text-sm font-medium flex items-center gap-2">
                                        <History className="h-4 w-4 text-primary" />
                                        <span>ประวัติการเคลื่อนไหวทั้งหมด</span>
                                    </div>
                                )}
                            </div>
                            <div className="rounded-lg border overflow-hidden">
                                <Table><TableHeader className="bg-muted/50"><TableRow>
                                    <TableHead>วันที่/เวลา</TableHead>
                                    <TableHead>ประเภท</TableHead>
                                    <TableHead className="text-right">จำนวน</TableHead>
                                    <TableHead>เหตุผล/Lot ID</TableHead>
                                    <TableHead>ผู้ดำเนินการ</TableHead>
                                </TableRow></TableHeader>
                                <TableBody>
                                    {paginatedAdjustments && paginatedAdjustments.length > 0 ? (
                                        paginatedAdjustments.map(adj => {
                                            const { variant, text } = getAdjustmentTypeStyle(adj.type);
                                            const isDeduct = ['ADJUST_DEDUCT', 'WASTAGE', 'SALE'].includes(adj.type);
                                            const dateObj = adj.createdAt?.toDate ? adj.createdAt.toDate() : new Date(adj.createdAt || 0);
                                            const displayDate = dateObj ? format(dateObj, 'd MMM ') + (dateObj.getFullYear() + 543) : '-';
                                            const displayTime = dateObj ? format(dateObj, 'HH:mm', { locale: th }) : '';
                                            
                                            return (
                                                <TableRow key={adj.id} className="text-sm">
                                                    <TableCell className="text-[11px] leading-tight text-muted-foreground">
                                                        {displayDate}<br/>
                                                        {displayTime}
                                                    </TableCell>
                                                    <TableCell><Badge variant={variant} className="text-[10px] px-1.5 h-5">{text}</Badge></TableCell>
                                                    <TableCell className={cn("text-right font-bold", isDeduct ? 'text-destructive' : 'text-green-600' )}>
                                                        {isDeduct ? '-' : '+'}{adj.quantity.toLocaleString()}
                                                    </TableCell>
                                                    <TableCell>
                                                        <p className="font-medium text-xs">{adj.reason}</p>
                                                        <p className="text-[10px] text-muted-foreground font-mono">Lot: {adj.lotId.substring(0,8)}</p>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-1.5">
                                                            <User className="h-3 w-3 text-muted-foreground" />
                                                            <span className="text-xs truncate max-w-[80px]">{adj.adminName || 'System'}</span>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            )
                                        })
                                    ) : (<TableRow><TableCell colSpan={5} className="text-center h-32 text-muted-foreground">ยังไม่มีประวัติความเคลื่อนไหว</TableCell></TableRow>)}
                                </TableBody></Table>
                            </div>
                            {historyPageCount > 1 && (
                                <div className="flex items-center justify-end space-x-2 pt-4">
                                    <span className="text-xs text-muted-foreground">
                                        หน้า {historyCurrentPage} จาก {historyPageCount}
                                    </span>
                                    <Button variant="outline" size="sm" onClick={() => setHistoryCurrentPage(p => p - 1)} disabled={historyCurrentPage === 1}>ก่อนหน้า</Button>
                                    <Button variant="outline" size="sm" onClick={() => setHistoryCurrentPage(p => p + 1)} disabled={historyCurrentPage === historyPageCount}>ถัดไป</Button>
                                </div>
                            )}
                        </>
                        )
                    ) : <p className="text-center text-muted-foreground py-12">กรุณาเลือกตัวเลือกสินค้าเพื่อดูประวัติ</p>}
                </TabsContent>
            </Tabs>
        )}
    </CustomDialog>
  );
}
