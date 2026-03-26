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
import { MoreHorizontal, Pen, Trash2, Archive, RotateCw, Eye } from 'lucide-react';
import { Service } from '@/lib/types';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { ImagePlaceholder } from '../shared/image-placeholder';
import { Checkbox } from '../ui/checkbox';

const getStatusVariant = (status: Service['status']) => {
  switch (status) {
    case 'active': return 'success';
    case 'draft': return 'outline';
    case 'archived': return 'destructive';
    default: return 'default';
  }
};

const getStatusText = (status: Service['status']) => {
  switch (status) {
    case 'active': return 'เผยแพร่';
    case 'draft': return 'ฉบับร่าง';
    case 'archived': return 'จัดเก็บ';
    default: return status;
  }
};

interface ServicesTableProps {
  services: Service[];
  onAction: (service: Service, type: 'archive' | 'restore' | 'delete') => void;
  selectedIds: string[];
  onSelectedIdsChange: (ids: string[]) => void;
  canManage: boolean;
  activeTab: string;
}

export function ServicesTable({ 
  services, 
  onAction,
  selectedIds,
  onSelectedIdsChange,
  canManage,
  activeTab
}: ServicesTableProps) {
  const router = useRouter();

  if (services.length === 0) {
    return <div className="rounded-lg border p-12 text-center text-muted-foreground bg-card">ไม่พบรายการบริการ</div>;
  }

  const handleSelectAll = (checked: boolean | 'indeterminate') => {
    onSelectedIdsChange(checked === true ? services.map(s => s.id) : []);
  };

  const isAllSelected = services.length > 0 && selectedIds.length === services.length;
  const isSomeSelected = selectedIds.length > 0 && selectedIds.length < services.length;

  const handleAction = (service: Service, type: 'archive' | 'restore' | 'delete') => {
    setTimeout(() => {
      onAction(service, type);
    }, 100);
  };

  return (
    <div className="rounded-lg border bg-card">
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
            <TableHead className="w-[80px]">รูปภาพ</TableHead>
            <TableHead>รหัสบริการ</TableHead>
            <TableHead>ชื่อบริการ</TableHead>
            <TableHead>หมวดหมู่</TableHead>
            <TableHead className="text-right">ราคา</TableHead>
            <TableHead>สถานะ</TableHead>
            <TableHead className="text-right">ดำเนินการ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {services.map((s) => (
            <TableRow key={s.id} data-state={selectedIds.includes(s.id) ? "selected" : ""}>
              <TableCell className="px-4">
                <Checkbox
                  checked={selectedIds.includes(s.id)}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      onSelectedIdsChange([...selectedIds, s.id]);
                    } else {
                      onSelectedIdsChange(selectedIds.filter(id => id !== s.id));
                    }
                  }}
                  aria-label={`Select service ${s.name}`}
                  disabled={!canManage && activeTab !== 'archived'}
                />
              </TableCell>
              <TableCell>
                <div className="h-12 w-12 rounded-md bg-muted relative overflow-hidden">
                  {s.imageUrls?.[0] ? (
                    <Image src={s.imageUrls[0]} alt={s.name} fill className="object-cover" />
                  ) : <ImagePlaceholder />}
                </div>
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{s.sku || '-'}</TableCell>
              <TableCell className="font-bold">{s.name}</TableCell>
              <TableCell className="text-sm">{s.category}</TableCell>
              <TableCell className="text-right font-mono font-bold">฿{s.price.toLocaleString()}</TableCell>
              <TableCell>
                <Badge variant={getStatusVariant(s.status)}>{getStatusText(s.status)}</Badge>
              </TableCell>
              <TableCell className="text-right">
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {s.status === 'archived' ? (
                      <>
                        <DropdownMenuItem onSelect={() => handleAction(s, 'restore')} disabled={!canManage}>
                          <RotateCw className="mr-2 h-4 w-4" /> กู้คืน
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          className="text-destructive focus:text-destructive focus:bg-destructive/10" 
                          onSelect={() => handleAction(s, 'delete')}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> ลบถาวร
                        </DropdownMenuItem>
                      </>
                    ) : (
                      <>
                        <DropdownMenuItem onSelect={() => router.push(`/dashboard/services/${s.id}/edit`)}>
                          {canManage ? <Pen className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                          {canManage ? 'แก้ไข' : 'ดูรายละเอียด'}
                        </DropdownMenuItem>
                        {canManage && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onSelect={() => handleAction(s, 'archive')} 
                              className="text-destructive focus:text-destructive focus:bg-destructive/10"
                            >
                              <Archive className="mr-2 h-4 w-4" /> ย้ายไปที่เก็บถาวร
                            </DropdownMenuItem>
                          </>
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
