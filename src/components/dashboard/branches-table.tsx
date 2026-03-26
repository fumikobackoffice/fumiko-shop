'use client';

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
import { MoreHorizontal, Pen, User, MapPin, Phone, AlertTriangle, FileText, Eye, IdCard } from 'lucide-react';
import { Branch } from '@/lib/types';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { useRouter } from 'next/navigation';
import { format, differenceInDays } from 'date-fns';
import { th } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useMemo, useState } from 'react';
import { BranchQuickView } from './branch-quick-view';

const getStatusVariant = (status: Branch['status']) => {
  switch (status) {
    case 'OPERATING': return 'success';
    case 'FOLLOW_UP': return 'warning';
    case 'SUSPENDED': return 'secondary';
    case 'CLOSED': return 'destructive';
    default: return 'default';
  }
};

const getStatusText = (status: Branch['status']) => {
  switch (status) {
    case 'OPERATING': return 'ดำเนินกิจการ';
    case 'FOLLOW_UP': return 'ต้องติดตาม';
    case 'SUSPENDED': return 'พักกิจการชั่วคราว';
    case 'CLOSED': return 'ปิดกิจการ';
    default: return status;
  }
};

export function BranchesTable({ branches, canManage }: { branches: Branch[], canManage: boolean }) {
  const router = useRouter();
  const [quickViewBranch, setQuickViewBranch] = useState<Branch | null>(null);

  if (branches.length === 0) {
    return (
      <div className="rounded-lg border p-8 text-center text-muted-foreground">
        ไม่พบข้อมูลสาขา
      </div>
    );
  }

  const now = new Date();

  return (
    <>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>รหัส</TableHead>
              <TableHead>ชื่อสาขา</TableHead>
              <TableHead>เจ้าของสาขา</TableHead>
              <TableHead>ประเภท</TableHead>
              <TableHead>สถานะ</TableHead>
              <TableHead>รอบสัญญาปัจจุบัน</TableHead>
              <TableHead className="text-right">ดำเนินการ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {branches.map((branch) => {
              const latestContract = [...(branch.contracts || [])].sort((a, b) => {
                  const dateA = a.expiryDate?.toDate ? a.expiryDate.toDate() : new Date(a.expiryDate);
                  const dateB = b.expiryDate?.toDate ? b.expiryDate.toDate() : new Date(b.expiryDate);
                  return dateB.getTime() - dateA.getTime();
              })[0];

              const expiryDate = latestContract?.expiryDate?.toDate ? latestContract.expiryDate.toDate() : (latestContract?.expiryDate ? new Date(latestContract.expiryDate) : null);
              const daysLeft = expiryDate ? differenceInDays(expiryDate, now) : null;
              const isNearExpiry = daysLeft !== null && daysLeft <= 30;
              const isExpired = daysLeft !== null && daysLeft < 0;

              return (
                <TableRow key={branch.id} className={cn(isExpired && "bg-destructive/5")}>
                  <TableCell className="font-mono font-medium text-xs">{branch.branchCode}</TableCell>
                  <TableCell>
                    <div className="font-semibold">{branch.name}</div>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                      <MapPin className="h-3 w-3" /> {branch.province}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{branch.ownerName || '-'}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">{branch.type === 'MAIN' ? 'สาขาแม่' : 'สาขาลูก'}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusVariant(branch.status)} className="text-[10px]">{getStatusText(branch.status)}</Badge>
                  </TableCell>
                  <TableCell>
                    {latestContract ? (
                      <div className="flex flex-col">
                          <div className="flex items-center gap-1.5 font-bold text-xs">
                              <FileText className="h-3 w-3 text-primary" />
                              <span className="truncate max-w-[150px]">{(latestContract.documentIds || []).join(', ') || 'N/A'}</span>
                          </div>
                          <span className={cn(
                              "text-[11px]",
                              isExpired ? "text-destructive font-bold" : isNearExpiry ? "text-orange-600 font-bold" : "text-muted-foreground"
                          )}>
                              {expiryDate ? format(expiryDate, 'd MMM ', { locale: th }) + (expiryDate.getFullYear() + 543) : '-'}
                              {isNearExpiry && (
                                  <span className="ml-1">
                                      ({isExpired ? 'หมดอายุ' : `อีก ${daysLeft} วัน`})
                                  </span>
                              )}
                          </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs italic">ไม่มีข้อมูลสัญญา</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-primary hover:bg-primary/10"
                        onClick={() => setQuickViewBranch(branch)}
                        title="ดูข้อมูลสรุป"
                      >
                        <IdCard className="h-4 w-4" />
                      </Button>

                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => {
                            setTimeout(() => router.push(`/dashboard/branches/${branch.id}/edit`), 100);
                          }}>
                            {canManage ? <Pen className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                            {canManage ? 'แก้ไขข้อมูล' : 'ดูรายละเอียด'}
                          </DropdownMenuItem>
                          {branch.googleMapsUrl && (
                            <DropdownMenuItem asChild>
                              <a href={branch.googleMapsUrl} target="_blank" rel="noopener noreferrer">
                                <MapPin className="mr-2 h-4 w-4" /> ดูในแผนที่
                              </a>
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <BranchQuickView 
        branch={quickViewBranch}
        isOpen={!!quickViewBranch}
        onClose={() => setQuickViewBranch(null)}
      />
    </>
  );
}
