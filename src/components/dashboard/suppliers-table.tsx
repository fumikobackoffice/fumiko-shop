
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
import { MoreHorizontal, Pen, Trash2, RotateCw, Archive } from 'lucide-react';
import { Supplier, AppUser } from '@/lib/types';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { useRouter } from 'next/navigation';
import { Checkbox } from '../ui/checkbox';
import type { ActionType } from '@/app/dashboard/suppliers/page';

const getStatusVariant = (status: Supplier['status']): "success" | "destructive" | "default" => {
  switch (status) {
    case 'active':
      return 'success';
    case 'archived':
      return 'destructive';
    default:
      return 'default';
  }
};

const getStatusText = (status: Supplier['status']) => {
  switch (status) {
    case 'active':
      return 'ใช้งาน';
    case 'archived':
      return 'จัดเก็บ';
    default:
      return status;
  }
};

export function SuppliersTable({ 
    suppliers,
    openDialog,
    currentUser,
    activeTab,
    selectedIds,
    onSelectedIdsChange 
}: { 
    suppliers: Supplier[],
    openDialog: (supplier: Supplier, action: ActionType) => void,
    currentUser: AppUser | null,
    activeTab: string,
    selectedIds: string[],
    onSelectedIdsChange: (ids: string[]) => void
}) {
  const router = useRouter();
  const isArchivedTab = activeTab === 'archived';
  const isSuperAdmin = currentUser?.role === 'super_admin';

  if (suppliers.length === 0) {
    return (
        <div className="rounded-lg border p-8 text-center text-muted-foreground">
            ไม่พบข้อมูลแหล่งจัดซื้อ
        </div>
    )
  }

  const handleSelectAll = (checked: boolean | 'indeterminate') => {
    onSelectedIdsChange(checked === true ? suppliers.map(p => p.id) : []);
  }

  const isAllSelected = suppliers.length > 0 && selectedIds.length === suppliers.length;
  const isSomeSelected = selectedIds.length > 0 && selectedIds.length < suppliers.length;

  const handleAction = (supplier: Supplier, action: ActionType) => {
    setTimeout(() => {
      openDialog(supplier, action);
    }, 100);
  };

  const handleNavigateToEdit = (supplierId: string) => {
    setTimeout(() => {
      router.push(`/dashboard/suppliers/${supplierId}/edit`);
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
              />
            </TableHead>
            <TableHead>รหัส</TableHead>
            <TableHead>ชื่อ</TableHead>
            <TableHead>สถานะ</TableHead>
            <TableHead>ผู้ติดต่อ</TableHead>
            <TableHead>เบอร์โทรศัพท์</TableHead>
            <TableHead className="whitespace-nowrap text-right">การดำเนินการ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {suppliers.map((supplier) => (
            <TableRow key={supplier.id} data-state={selectedIds.includes(supplier.id) ? "selected" : ""}>
               <TableCell className="px-4">
                <Checkbox
                    checked={selectedIds.includes(supplier.id)}
                    onCheckedChange={(checked) => {
                        if (checked) {
                            onSelectedIdsChange([...selectedIds, supplier.id]);
                        } else {
                            onSelectedIdsChange(selectedIds.filter(id => id !== supplier.id));
                        }
                    }}
                    aria-label={`Select row`}
                />
              </TableCell>
              <TableCell className="font-mono text-sm">{supplier.code}</TableCell>
              <TableCell className="font-medium">{supplier.name}</TableCell>
              <TableCell>
                <Badge variant={getStatusVariant(supplier.status)}>{getStatusText(supplier.status)}</Badge>
              </TableCell>
               <TableCell>{supplier.contactName || '-'}</TableCell>
              <TableCell>{supplier.contactPhone || '-'}</TableCell>
              <TableCell className="text-right">
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0">
                      <span className="sr-only">Open menu</span>
                      < MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {isArchivedTab ? (
                        <>
                            <DropdownMenuItem onSelect={() => handleAction(supplier, 'restore')}>
                                <RotateCw className="mr-2 h-4 w-4" />
                                กู้คืน
                            </DropdownMenuItem>
                            {isSuperAdmin && (
                            <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem 
                                className="text-destructive focus:text-destructive focus:bg-destructive/10" 
                                onSelect={() => handleAction(supplier, 'delete')}
                                >
                                <Trash2 className="mr-2 h-4 w-4" />
                                ลบถาวร
                                </DropdownMenuItem>
                            </>
                            )}
                        </>
                    ) : (
                        <>
                            <DropdownMenuItem onSelect={() => handleNavigateToEdit(supplier.id)}>
                                <Pen className="mr-2 h-4 w-4" />
                                แก้ไข
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => handleAction(supplier, 'archive')}>
                                <Archive className="mr-2 h-4 w-4" />
                                จัดเก็บ
                            </DropdownMenuItem>
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
