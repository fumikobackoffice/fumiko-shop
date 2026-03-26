'use client';
import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, Pen, Trash2, Archive, RotateCw, Boxes, ChevronRight, Eye } from 'lucide-react';
import { ProductGroup, ProductVariant, AppUser } from '@/lib/types';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import Image from 'next/image';
import { ActionType } from '@/app/dashboard/products/page';
import { Checkbox } from '../ui/checkbox';
import { ImagePlaceholder } from '../shared/image-placeholder';
import { cn } from '@/lib/utils';

const getStatusText = (status: ProductGroup['status']) => {
  switch (status) {
    case 'active': return 'เผยแพร่';
    case 'draft': return 'ฉบับร่าง';
    case 'archived': return 'อยู่ในถังขยะ';
    default: return 'ไม่ระบุ';
  }
}

const getStatusVariant = (status: ProductGroup['status']): "success" | "outline" | "destructive" | "default" => {
  switch (status) {
    case 'active': return 'success';
    case 'draft': return 'outline';
    case 'archived': return 'destructive';
    default: return 'default';
  }
}

function VariantSubRow({ 
  variant, 
  group, 
  onManageStock,
  canManage
}: { 
  variant: ProductVariant; 
  group: ProductGroup; 
  onManageStock: (group: ProductGroup, variantId: string) => void;
  canManage: boolean;
}) {
  const stock = (variant.inventoryLots || []).reduce((sum, lot) => sum + lot.quantity, 0);
  const attributes = Object.entries(variant.attributes)
    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB, 'th'))
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');

  const isLowStock = variant.trackInventory && stock <= (variant.lowStockThreshold ?? 0);

  return (
    <TableRow className="bg-muted/20 hover:bg-muted/50">
      <TableCell></TableCell>
      <TableCell className="pl-12 font-medium text-muted-foreground">{attributes || 'ตัวเลือกหลัก'}</TableCell>
      <TableCell></TableCell>
      <TableCell>฿{variant.price.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
      <TableCell className={cn("text-right font-semibold", isLowStock && "text-destructive font-bold")}>
        {stock.toLocaleString()}
      </TableCell>
      <TableCell>{variant.sku}</TableCell>
      <TableCell className="text-right">
        {canManage && (
          <Button variant="outline" size="sm" onClick={() => onManageStock(group, variant.id)}>
            <Boxes className="mr-2 h-4 w-4" />
            จัดการสต็อก
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}


function ProductDataRow({ 
  group, 
  variants, 
  openDialog,
  currentUser, 
  activeTab,
  isSelected,
  onSelectionChange,
  isExpanded,
  onExpandToggle,
  hasVariants,
  onManageStock,
  canManage,
}: { 
  group: ProductGroup; 
  variants: ProductVariant[] | undefined; 
  openDialog: (group: ProductGroup, action: ActionType) => void;
  currentUser: AppUser; 
  activeTab: string;
  isSelected: boolean;
  onSelectionChange: (checked: boolean) => void;
  isExpanded: boolean;
  onExpandToggle: () => void;
  hasVariants: boolean;
  onManageStock: (group: ProductGroup, variantId?: string | null) => void;
  canManage: boolean;
}) {
  const router = useRouter();
  const isArchivedTab = activeTab === 'archived';
  const isSuperAdmin = currentUser?.role === 'super_admin';
  const isLoading = variants === undefined;

  const { priceRange, totalStockLabel, imageUrl, skuOrVariantCount, isAnyVariantLow } = React.useMemo(() => {
    if (isLoading || !variants || variants.length === 0) {
      return { priceRange: '-', totalStockLabel: '-', imageUrl: undefined, skuOrVariantCount: '...', isAnyVariantLow: false };
    }

    let minPrice = Infinity;
    let maxPrice = -Infinity;
    let stockSum = 0;
    let isTracked = false;
    let lowStockDetected = false;

    variants.forEach(variant => {
      if (variant.status === 'archived') return;

      if (variant.price < minPrice) minPrice = variant.price;
      if (variant.price > maxPrice) maxPrice = variant.price;
      
      if (variant.trackInventory) {
        const variantStock = (variant.inventoryLots || []).reduce((sum, lot) => sum + lot.quantity, 0);
        stockSum += variantStock;
        isTracked = true;
        
        const threshold = variant.lowStockThreshold ?? 0;
        if (variantStock <= threshold) {
          lowStockDetected = true;
        }
      }
    });

    const firstImageUrl = variants.find(v => v.imageUrls && v.imageUrls.length > 0)?.imageUrls?.[0];
    const imageUrl = firstImageUrl;

    let priceRangeStr: string;
    if (minPrice === Infinity) {
      priceRangeStr = '-';
    } else if (minPrice === maxPrice) {
      priceRangeStr = `฿${minPrice.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    } else {
      priceRangeStr = `฿${minPrice.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} - ฿${maxPrice.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    let skuOrVariantCount: string;
    if (variants.length === 1 && Object.keys(variants[0].attributes).length === 0) {
      skuOrVariantCount = `รหัสสินค้า: ${variants[0].sku}`;
    } else {
      skuOrVariantCount = `${variants.length} ตัวเลือก`;
    }

    return { 
      priceRange: priceRangeStr, 
      totalStockLabel: isTracked ? stockSum.toLocaleString() : '-', 
      imageUrl,
      skuOrVariantCount,
      isAnyVariantLow: lowStockDetected
    };
  }, [variants, isLoading]);

  const handleAction = (action: ActionType) => {
    setTimeout(() => {
      openDialog(group, action);
    }, 100);
  };

  const handleNavigateToEdit = () => {
    setTimeout(() => {
      router.push(`/dashboard/products/${group.id}/edit`);
    }, 100);
  }

  const handleManageStockAction = (variantId?: string | null) => {
    setTimeout(() => {
      onManageStock(group, variantId);
    }, 100);
  }

  if (isLoading) {
    return (
      <TableRow>
        <TableCell className="w-12 px-4"><Skeleton className="h-4 w-4" /></TableCell>
        <TableCell>
          <div className="flex items-center gap-4">
            <Skeleton className="h-12 w-12 rounded-md" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        </TableCell>
        <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
        <TableCell className="text-right"><Skeleton className="h-4 w-12 inline-block" /></TableCell>
        <TableCell><Skeleton className="h-4 w-28" /></TableCell>
        <TableCell><Skeleton className="h-8 w-8" /></TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow 
      data-state={isSelected ? "selected" : ""}
      className={cn(isArchivedTab ? "bg-muted/30" : "", isExpanded && "bg-muted/50")}
    >
      <TableCell className="px-4">
          <Checkbox
            checked={isSelected}
            onCheckedChange={onSelectionChange}
            aria-label="Select row"
            disabled={!canManage && !isArchivedTab}
          />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 shrink-0 rounded-md bg-muted">
            {imageUrl ? (
                <Image
                    src={imageUrl}
                    alt={group.name}
                    width={64}
                    height={64}
                    className="h-full w-full rounded-md object-cover aspect-square"
                />
            ) : (
                <ImagePlaceholder />
            )}
          </div>
          <div>
            <div className="font-medium">{group.name}</div>
            <div className="text-sm text-muted-foreground">
              {hasVariants ? (
                <button onClick={onExpandToggle} className="flex items-center gap-1.5 hover:text-foreground transition-colors">
                  <span>{skuOrVariantCount}</span>
                  <ChevronRight className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-90")} />
                </button>
              ) : (
                 <span>{skuOrVariantCount}</span>
              )}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant={getStatusVariant(group.status)}>
          {getStatusText(group.status)}
        </Badge>
      </TableCell>
      <TableCell>{priceRange}</TableCell>
      <TableCell className={cn("text-right", isAnyVariantLow && "text-destructive font-bold")}>
        {totalStockLabel}
      </TableCell>
      <TableCell>{group.category || '-'}</TableCell>
      <TableCell className="text-right">
         <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {isArchivedTab ? (
              <>
                <DropdownMenuItem onSelect={() => handleAction('restore')} disabled={!canManage}>
                  <RotateCw className="mr-2 h-4 w-4" />
                  กู้คืน
                </DropdownMenuItem>
                {isSuperAdmin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      className="text-destructive focus:text-destructive focus:bg-destructive/10" 
                      onSelect={() => handleAction('delete')}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      ลบถาวร
                    </DropdownMenuItem>
                  </>
                )}
              </>
            ) : (
              <>
                <DropdownMenuItem onSelect={handleNavigateToEdit}>
                  {canManage ? <Pen className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                  {canManage ? 'แก้ไข' : 'ดูรายละเอียด'}
                </DropdownMenuItem>
                {!hasVariants && canManage && (
                  <DropdownMenuItem onSelect={() => handleManageStockAction(null)}>
                    <Boxes className="mr-2 h-4 w-4" />
                    จัดการสต็อก
                  </DropdownMenuItem>
                )}
                {canManage && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => handleAction('archive')}>
                      <Archive className="mr-2 h-4 w-4" />
                      ย้ายไปถังขยะ
                    </DropdownMenuItem>
                  </>
                )}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

export function ProductsTable({ 
    productGroups, 
    variantsByGroup, 
    openDialog,
    currentUser, 
    activeTab,
    selectedIds,
    onSelectedIdsChange,
    onManageStock,
    canManage,
}: { 
    productGroups: ProductGroup[], 
    variantsByGroup: Record<string, ProductVariant[]>, 
    openDialog: (group: ProductGroup, action: ActionType) => void,
    currentUser: AppUser, 
    activeTab: string,
    selectedIds: string[],
    onSelectedIdsChange: (ids: string[]) => void,
    onManageStock: (group: ProductGroup, variantId?: string | null) => void,
    canManage: boolean;
}) {
  const [expandedIds, setExpandedIds] = React.useState<string[]>([]);

  const handleExpandToggle = (groupId: string) => {
    setExpandedIds(prev =>
      prev.includes(groupId)
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    );
  };
  
  if (productGroups.length === 0) {
    return (
        <div className="rounded-lg border p-8 text-center text-muted-foreground">
            ไม่พบสินค้า
        </div>
    )
  }

  const handleSelectAll = (checked: boolean | 'indeterminate') => {
    onSelectedIdsChange(checked === true ? productGroups.map(p => p.id) : []);
  }

  const isAllSelected = productGroups.length > 0 && selectedIds.length === productGroups.length;
  const isSomeSelected = selectedIds.length > 0 && selectedIds.length < productGroups.length;


  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 px-4">
              <Checkbox
                checked={isAllSelected ? true : isSomeSelected ? 'indeterminate' : false}
                onCheckedChange={handleSelectAll}
                aria-label="Select all"
                disabled={!canManage && activeTab !== 'archived'}
              />
            </TableHead>
            <TableHead className="w-[300px]">สินค้า</TableHead>
            <TableHead>สถานะ</TableHead>
            <TableHead>ราคา</TableHead>
            <TableHead className="text-right">สต็อกทั้งหมด</TableHead>
            <TableHead>หมวดหมู่</TableHead>
            <TableHead className="whitespace-nowrap text-right">การดำเนินการ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {productGroups.map((group) => {
             const variants = variantsByGroup[group.id];
             const hasVariants = variants && variants.length > 1 || (variants?.length === 1 && Object.keys(variants[0].attributes).length > 0);
             const isExpanded = expandedIds.includes(group.id);
            return (
               <React.Fragment key={group.id}>
                <ProductDataRow 
                  group={group} 
                  openDialog={openDialog}
                  variants={variants}
                  currentUser={currentUser}
                  activeTab={activeTab}
                  isSelected={selectedIds.includes(group.id)}
                  onSelectionChange={(checked) => {
                    if (checked) {
                      onSelectedIdsChange([...selectedIds, group.id]);
                    } else {
                      onSelectedIdsChange(selectedIds.filter(id => id !== group.id));
                    }
                  }}
                  isExpanded={isExpanded}
                  onExpandToggle={() => handleExpandToggle(group.id)}
                  hasVariants={hasVariants}
                  onManageStock={onManageStock}
                  canManage={canManage}
                />
                 {hasVariants && isExpanded && variants
                    ?.slice()
                    .sort((a, b) => {
                        const aStr = Object.entries(a.attributes).sort(([keyA], [keyB]) => keyA.localeCompare(keyB, 'th')).map(([k, v]) => `${k}:${v}`).join(',');
                        const bStr = Object.entries(b.attributes).sort(([keyA], [keyB]) => keyA.localeCompare(keyB, 'th')).map(([k, v]) => `${k}:${v}`).join(',');
                        return aStr.localeCompare(bStr, 'th');
                    })
                    .map(variant => (
                        <VariantSubRow 
                          key={variant.id} 
                          variant={variant} 
                          group={group} 
                          onManageStock={(g, vId) => {
                            setTimeout(() => onManageStock(g, vId), 100);
                          }} 
                          canManage={canManage}
                        />
                 ))}
               </React.Fragment>
            )
          })}
        </TableBody>
      </Table>
    </div>
  );
}
