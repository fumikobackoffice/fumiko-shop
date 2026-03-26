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
import { MoreHorizontal, Pen, Trash2, RotateCw, Archive, Eye } from 'lucide-react';
import { ProductPackage, AppUser } from '@/lib/types';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { useRouter } from 'next/navigation';
import { Checkbox } from '../ui/checkbox';
import { ActionType } from '@/app/dashboard/products/page'; // Re-using type from products page

const getStatusVariant = (status: ProductPackage['status']) => {
  switch (status) {
    case 'active':
      return 'success';
    case 'draft':
      return 'outline';
    case 'archived':
      return 'destructive';
    default:
      return 'default';
  }
};

const getStatusText = (status: ProductPackage['status']) => {
  switch (status) {
    case 'active':
      return 'เผยแพร่';
    case 'draft':
      return 'ฉบับร่าง';
    case 'archived':
      return 'อยู่ในถังขยะ';
    default:
      return status;
  }
};

export function PackagesTable({ 
    packages,
    openDialog,
    currentUser,
    activeTab,
    selectedIds,
    onSelectedIdsChange,
    canManage // Added canManage prop
}: { 
    packages: ProductPackage[],
    openDialog: (pkg: ProductPackage, action: ActionType) => void,
    currentUser: AppUser | null,
    activeTab: string,
    selectedIds: string[],
    onSelectedIdsChange: (ids: string[]) => void,
    canManage: boolean
}) {
  const router = useRouter();
  const isArchivedTab = activeTab === 'archived';
  const isSuperAdmin = currentUser?.role === 'super_admin';

  if (packages.length === 0) {
    return (
        <div className="rounded-lg border p-8 text-center text-muted-foreground">
            ไม่พบแพ็กเกจสินค้า
        </div>
    )
  }

  const handleSelectAll = (checked: boolean | 'indeterminate') => {
    onSelectedIdsChange(checked === true ? packages.map(p => p.id) : []);
  }

  const isAllSelected = packages.length > 0 && selectedIds.length === packages.length;
  const isSomeSelected = selectedIds.length > 0 && selectedIds.length < packages.length;

  const handleAction = (pkg: ProductPackage, action: ActionType) => {
    setTimeout(() => {
      openDialog(pkg, action);
    }, 100);
  };

  const handleNavigateToEdit = (pkgId: string) => {
    setTimeout(() => {
      router.push(`/dashboard/packages/${pkgId}/edit`);
    }, 100);
  }

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
                disabled={!canManage && !isArchivedTab}
              />
            </TableHead>
            <TableHead>ชื่อแพ็กเกจ</TableHead>
            <TableHead>สถานะ</TableHead>
            <TableHead>รหัสสินค้า</TableHead>
            <TableHead className="text-right">ราคา</TableHead>
            <TableHead className="whitespace-nowrap text-right">การดำเนินการ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {packages.map((pkg) => (
            <TableRow key={pkg.id} data-state={selectedIds.includes(pkg.id) ? "selected" : ""}>
               <TableCell className="px-4">
                <Checkbox
                    checked={selectedIds.includes(pkg.id)}
                    disabled={!canManage && !isArchivedTab}
                    onCheckedChange={(checked) => {
                        if (checked) {
                            onSelectedIdsChange([...selectedIds, pkg.id]);
                        } else {
                            onSelectedIdsChange(selectedIds.filter(id => id !== pkg.id));
                        }
                    }}
                    aria-label="Select row"
                />
              </TableCell>
              <TableCell className="font-medium">{pkg.name}</TableCell>
              <TableCell>
                <Badge variant={getStatusVariant(pkg.status)}>{getStatusText(pkg.status)}</Badge>
              </TableCell>
               <TableCell>{pkg.sku}</TableCell>
              <TableCell className="text-right">฿{pkg.price.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
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
                            <DropdownMenuItem onSelect={() => handleAction(pkg, 'restore')} disabled={!canManage}>
                                <RotateCw className="mr-2 h-4 w-4" />
                                กู้คืน
                            </DropdownMenuItem>
                            {isSuperAdmin && (
                            <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem 
                                className="text-destructive focus:text-destructive focus:bg-destructive/10" 
                                onSelect={() => handleAction(pkg, 'delete')}
                                >
                                <Trash2 className="mr-2 h-4 w-4" />
                                ลบถาวร
                                </DropdownMenuItem>
                            </>
                            )}
                        </>
                    ) : (
                        <>
                            <DropdownMenuItem onSelect={() => handleNavigateToEdit(pkg.id)}>
                                {canManage ? <Pen className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                                {canManage ? 'แก้ไข' : 'ดูรายละเอียด'}
                            </DropdownMenuItem>
                            {canManage && (
                              <DropdownMenuItem onSelect={() => handleAction(pkg, 'archive')}>
                                  <Archive className="mr-2 h-4 w-4" />
                                  ย้ายไปถังขยะ
                              </DropdownMenuItem>
                            )}
                        </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}