
'use client';

import { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandList, CommandItem } from '@/components/ui/command';
import { ProductGroup, ProductVariant } from '@/lib/types';
import Image from 'next/image';
import { ImagePlaceholder } from '../shared/image-placeholder';
import { Badge } from '@/components/ui/badge';

interface ProductSearchDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onProductSelect: (variant: ProductVariant) => void;
  productGroups: ProductGroup[];
  allVariants: ProductVariant[];
  existingVariantIds: string[];
}

export function ProductSearchDialog({
  isOpen,
  onOpenChange,
  onProductSelect,
  productGroups,
  allVariants,
  existingVariantIds,
}: ProductSearchDialogProps) {
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setSearchTerm('');
    }
  }, [isOpen]);

  const groupsById = useMemo(() => {
    return productGroups.reduce((acc, group) => {
      acc[group.id] = group;
      return acc;
    }, {} as Record<string, ProductGroup>);
  }, [productGroups]);

  const filteredVariants = useMemo(() => {
    // Filter variants based on status
    // 1. Variant status must not be archived
    // 2. Parent Group status must not be archived (can be active or draft)
    const availableVariants = allVariants.filter(variant => {
      const group = groupsById[variant.productGroupId];
      if (!group) return false;
      
      const isVariantArchived = variant.status === 'archived';
      const isGroupArchived = group.status === 'archived';
      
      // We only show items that are NOT archived in either level
      return !isVariantArchived && !isGroupArchived;
    });
    
    if (!searchTerm) {
      return availableVariants;
    }

    const lowercasedTerm = searchTerm.toLowerCase();
    return availableVariants.filter(variant => {
      const group = groupsById[variant.productGroupId];
      if (!group) return false;

      const groupNameMatch = group.name.toLowerCase().includes(lowercasedTerm);
      const skuMatch = variant.sku && variant.sku.toLowerCase().includes(lowercasedTerm);
      
      const attributeMatch = Object.values(variant.attributes).some(val => val.toLowerCase().includes(lowercasedTerm));

      return groupNameMatch || skuMatch || attributeMatch;
    });
  }, [searchTerm, allVariants, groupsById]);

  const handleSelect = (variant: ProductVariant) => {
    onProductSelect(variant);
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>ค้นหาสินค้าเพื่อเพิ่มในรายการ</DialogTitle>
        </DialogHeader>
        <Command shouldFilter={false} className="mt-4">
          <CommandInput
            placeholder="ค้นหาด้วยชื่อสินค้า, รหัสสินค้า, หรือคุณสมบัติ..."
            value={searchTerm}
            onValueChange={setSearchTerm}
          />
          <CommandList>
            {filteredVariants.length === 0 && <CommandEmpty>ไม่พบสินค้า</CommandEmpty>}
            <CommandGroup>
              {filteredVariants.map(variant => {
                const group = groupsById[variant.productGroupId];
                if (!group) return null;
                const isExisting = existingVariantIds.includes(variant.id);
                const imageUrl = variant.imageUrls?.[0];
                const attributesString = Object.entries(variant.attributes)
                    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB, 'th'))
                    .map(([key, value]) => `${key}: ${value}`)
                    .join(', ');

                return (
                  <CommandItem
                    key={variant.id}
                    value={`${group.name} ${attributesString} ${variant.sku}`}
                    onSelect={() => handleSelect(variant)}
                    disabled={isExisting}
                    className="flex items-center gap-4 cursor-pointer"
                  >
                    <div className="h-10 w-10 shrink-0 rounded-md bg-muted">
                        {imageUrl ? (
                            <Image
                                src={imageUrl}
                                alt={group.name}
                                width={40}
                                height={40}
                                className="h-full w-full rounded-md object-cover aspect-square"
                            />
                        ) : (
                            <ImagePlaceholder />
                        )}
                    </div>
                    <div className="flex-grow">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{group.name}</p>
                        {group.status === 'draft' && (
                          <Badge variant="outline" className="text-[10px] h-4 text-muted-foreground border-muted-foreground/30">ฉบับร่าง</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {attributesString ? `(${attributesString})` : ''} รหัสสินค้า: {variant.sku}
                      </p>
                    </div>
                    {isExisting && <span className="text-xs text-muted-foreground">เพิ่มแล้ว</span>}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
