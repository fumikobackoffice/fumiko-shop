
'use client';

import { useState, useEffect, useTransition, useMemo, useCallback } from 'react';
import { FeeInvoice } from '@/lib/types';
import { getAdminFeeInvoices } from '@/app/actions';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PlusCircle, RotateCw, Eye, CheckCircle, XCircle, Loader2, Image as ImageIcon, ChevronLeft, ChevronRight, MessageSquare, AlertCircle, User } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { CustomDialog } from './custom-dialog';
import { CreateInvoiceDialog } from './create-invoice-dialog';
import Image from 'next/image';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from '@/components/ui/switch';
import { useSmartFetch } from '@/hooks/use-smart-fetch';
import { SmartRefreshButton } from './smart-refresh-button';

const getStatusVariant = (status: FeeInvoice['status']) => {
  switch (status) {
    case 'PENDING': return 'warning';
    case 'PROCESSING': return 'info';
    case 'PAID': return 'success';
    case 'CANCELLED': return 'destructive';
    default: return 'outline';
  }
};

const getStatusText = (status: FeeInvoice['status']) => {
  switch (status) {
    case 'PENDING': return 'รอชำระเงิน';
    case 'PROCESSING': return 'รอตรวจสอบสลิป';
    case 'PAID': return 'ชำระแล้ว';
    case 'CANCELLED': return 'ยกเลิก';
    default: return status;
  }
};

export function FeesAdminView() {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const { toast } = useToast();
  const firestore = useFirestore();
  const [isPending, startTransition] = useTransition();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<FeeInvoice | null>(null);

  // Manual payment states
  const [isManualPaidDialogOpen, setIsManualPaidDialogOpen] = useState(false);
  const [invoiceForManualAction, setInvoiceForManualAction] = useState<FeeInvoice | null>(null);
  const [manualReason, setManualReason] = useState('');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  // Granular RBAC Check for Fees Management
  const canManageFees = useMemo(() => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    
    const perms = user.permissions || [];
    // Fee management is tied to branch management permissions
    return perms.includes('branches:manage') || perms.includes('manage_branches');
  }, [user]);

  // Use Centralized Hook
  const { 
    data: invoicesData, 
    isLoading, 
    isRefreshing, 
    isAuto, 
    badgeCount,
    setAuto, 
    refresh 
  } = useSmartFetch<FeeInvoice[]>({
    key: 'admin-fee-invoices',
    fetcher: getAdminFeeInvoices,
    localStorageKey: 'auto-refresh-fees',
    watchPath: 'feeInvoices'
  });

  const invoices = invoicesData || [];

  /**
   * ระบบล้างสถานะล็อกหน้าจออัตโนมัติ (Safety Modal Cleanup)
   */
  useEffect(() => {
    if (!selectedInvoice && !isManualPaidDialogOpen && !isCreateOpen) {
      const timeout = setTimeout(() => {
        document.body.style.pointerEvents = 'auto';
        document.body.style.overflow = 'auto';
      }, 300);
      return () => clearTimeout(timeout);
    }
  }, [selectedInvoice, isManualPaidDialogOpen, isCreateOpen]);

  const filteredInvoices = useMemo(() => {
    if (statusFilter === 'all') return invoices;
    return invoices.filter(inv => inv.status === statusFilter);
  }, [invoices, statusFilter]);

  const totalPages = Math.ceil(filteredInvoices.length / ITEMS_PER_PAGE);
  const paginatedInvoices = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredInvoices.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredInvoices, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter]);

  const handleUpdateStatus = (invoiceId: string, newStatus: FeeInvoice['status'], notes?: string) => {
    if (!firestore || !canManageFees || !user) return;
    
    startTransition(async () => {
      try {
        const updateData: any = {
          status: newStatus,
          updatedAt: serverTimestamp(),
          processedById: user.id,
          processedByName: user.name
        };
        if (notes) updateData.paymentNotes = notes;

        await updateDoc(doc(firestore, 'feeInvoices', invoiceId), updateData);
        toast({ title: 'อัปเดตสถานะสำเร็จ' });
        
        setIsManualPaidDialogOpen(false);
        setInvoiceForManualAction(null);
        setSelectedInvoice(null);
        setManualReason('');
        
        refresh(true);
      } catch (error: any) {
        toast({ variant: 'destructive', title: 'ล้มเหลว', description: error.message });
      }
    });
  };

  const openManualPaid = () => {
    if (!selectedInvoice) return;
    const target = { ...selectedInvoice };
    setManualReason('');
    setInvoiceForManualAction(target);
    setSelectedInvoice(null);
    setTimeout(() => {
      setIsManualPaidDialogOpen(true);
    }, 150);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2 px-3 bg-muted/30 rounded-md h-10 border border-muted-foreground/10 flex-1 sm:flex-none">
            <Switch 
              id="auto-refresh-fees" 
              checked={isAuto} 
              onCheckedChange={setAuto} 
            />
            <Label htmlFor="auto-refresh-fees" className="text-[10px] font-bold cursor-pointer whitespace-nowrap">รีเฟรชอัตโนมัติ</Label>
          </div>
          <SmartRefreshButton 
            refresh={refresh}
            isRefreshing={isRefreshing}
            badgeCount={badgeCount}
          />
          {canManageFees && (
            <Button onClick={() => setIsCreateOpen(true)} className="h-10 flex-1 sm:flex-none">
              <PlusCircle className="mr-2 h-4 w-4" /> ออกบิลใหม่
            </Button>
          )}
        </div>
      </div>

      <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="all">ทั้งหมด ({invoices.length})</TabsTrigger>
          <TabsTrigger value="PENDING">รอชำระ ({invoices.filter(i => i.status === 'PENDING').length})</TabsTrigger>
          <TabsTrigger value="PROCESSING">ตรวจสอบสลิป ({invoices.filter(i => i.status === 'PROCESSING').length})</TabsTrigger>
          <TabsTrigger value="PAID">ชำระแล้ว ({invoices.filter(i => i.status === 'PAID').length})</TabsTrigger>
          <TabsTrigger value="CANCELLED">ยกเลิก ({invoices.filter(i => i.status === 'CANCELLED').length})</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">วันที่สร้าง</TableHead>
              <TableHead className="whitespace-nowrap">สาขา</TableHead>
              <TableHead className="whitespace-nowrap">ประจำรอบบิล</TableHead>
              <TableHead className="text-right whitespace-nowrap">ยอดเงิน</TableHead>
              <TableHead className="whitespace-nowrap">สถานะ</TableHead>
              <TableHead className="text-right whitespace-nowrap">ดำเนินการ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && !isRefreshing ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}><Skeleton className="h-10 w-full" /></TableCell>
                </TableRow>
              ))
            ) : filteredInvoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">ไม่พบรายการใบเรียกเก็บเงินในสถานะนี้</TableCell>
              </TableRow>
            ) : (
              paginatedInvoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="text-xs whitespace-nowrap">{new Date(inv.createdAt).toLocaleDateString('th-TH')}</TableCell>
                  <TableCell className="font-medium whitespace-nowrap">{inv.branchName}</TableCell>
                  <TableCell className="text-sm min-w-[150px]">{inv.billingPeriod}</TableCell>
                  <TableCell className="text-right font-bold whitespace-nowrap">฿{inv.amount.toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge variant={getStatusVariant(inv.status)} className="whitespace-nowrap">{getStatusText(inv.status)}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => setSelectedInvoice(inv)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {!isLoading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6 py-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            className="h-8 w-24"
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> ก่อนหน้า
          </Button>
          <div className="text-sm font-medium px-4 border-x">
            หน้า {currentPage} จาก {totalPages}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
            className="h-8 w-24"
          >
            ถัดไป <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}

      <CreateInvoiceDialog 
        isOpen={isCreateOpen} 
        onClose={() => setIsCreateOpen(false)} 
        onSuccess={() => {
          setIsCreateOpen(false);
          refresh(true);
        }}
      />

      <CustomDialog 
        isOpen={!!selectedInvoice} 
        onClose={() => setSelectedInvoice(null)} 
        title="รายละเอียดใบเรียกเก็บเงิน"
        size="lg"
      >
        <div className={cn("space-y-6", !selectedInvoice && "hidden")}>
          {selectedInvoice && (
            <>
              <div className="grid grid-cols-2 gap-4 text-sm border p-4 rounded-lg bg-muted/20">
                <div><p className="text-muted-foreground">สาขา</p><p className="font-bold">{selectedInvoice.branchName}</p></div>
                <div><p className="text-muted-foreground">ยอดเงิน</p><p className="font-bold text-lg text-primary">฿{selectedInvoice.amount.toLocaleString()}</p></div>
                <div className="col-span-2 border-t pt-2 mt-2"><p className="text-muted-foreground">ประจำรอบบิล</p><p className="font-bold">{selectedInvoice.billingPeriod}</p></div>
                <div className="col-span-2"><p className="text-muted-foreground">วันครบกำหนดชำระ</p><p className="font-bold text-destructive">{new Date(selectedInvoice.dueDate).toLocaleDateString('th-TH')}</p></div>
              </div>

              {selectedInvoice.processedByName && (
                <div className="bg-muted/30 border border-border p-3 rounded-lg flex gap-3">
                  <User className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <p className="font-bold text-muted-foreground mb-1">ผู้ดำเนินการล่าสุด:</p>
                    <p className="font-medium text-foreground">{selectedInvoice.processedByName}</p>
                  </div>
                </div>
              )}

              {selectedInvoice.paymentNotes && (
                <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-lg flex gap-3">
                  <MessageSquare className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <p className="font-bold text-emerald-800 mb-1">หมายเหตุการชำระเงิน (แอดมินบันทึก):</p>
                    <p className="text-emerald-700 italic">{selectedInvoice.paymentNotes}</p>
                  </div>
                </div>
              )}

              {selectedInvoice.paymentSlipUrl && (
                <div className="space-y-2">
                  <p className="font-medium flex items-center gap-2"><ImageIcon className="h-4 w-4" /> หลักฐานการโอนเงิน</p>
                  <div className="relative w-full aspect-[9/16] rounded-lg overflow-hidden border bg-black/5 max-w-[240px] mx-auto">
                    <Image src={selectedInvoice.paymentSlipUrl} alt="Slip" fill className="object-contain" />
                  </div>
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-2 pt-4 border-t">
                {selectedInvoice.status === 'PROCESSING' && canManageFees && (
                  <>
                    <Button variant="outline" className="text-destructive" onClick={() => handleUpdateStatus(selectedInvoice.id, 'PENDING')} disabled={isPending}>
                      ปฏิเสธสลิป
                    </Button>
                    <Button onClick={() => handleUpdateStatus(selectedInvoice.id, 'PAID')} disabled={isPending}>
                      อนุมัติการชำระเงิน
                    </Button>
                  </>
                )}
                {selectedInvoice.status === 'PENDING' && canManageFees && (
                  <Button variant="secondary" className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-emerald-200" onClick={openManualPaid} disabled={isPending}>
                    <CheckCircle className="mr-2 h-4 w-4" /> เปลี่ยนเป็นชำระแล้ว (ระบุเหตุผล)
                  </Button>
                )}
                {(selectedInvoice.status === 'PENDING' || selectedInvoice.status === 'PROCESSING') && canManageFees && (
                  <Button variant="ghost" className="text-destructive" onClick={() => handleUpdateStatus(selectedInvoice.id, 'CANCELLED')} disabled={isPending}>
                    ยกเลิกบิล
                  </Button>
                )}
                <Button variant="outline" onClick={() => setSelectedInvoice(null)}>ปิด</Button>
              </div>
            </>
          )}
        </div>
      </CustomDialog>

      <AlertDialog 
        open={isManualPaidDialogOpen} 
        onOpenChange={(open) => {
          if (!isPending) {
            setIsManualPaidDialogOpen(open);
            if (!open) {
              setInvoiceForManualAction(null);
              setManualReason('');
            }
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-emerald-700">
              <AlertCircle className="h-5 w-5" />
              ยืนยันการชำระเงินด้วยตนเอง
            </AlertDialogTitle>
            <AlertDialogDescription>
              ใช้ในกรณีที่ลูกค้าชำระเงินผ่านช่องทางอื่นแล้ว หรือเป็นการบันทึกบิลย้อนหลัง
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4 space-y-3">
            <Label htmlFor="manual-reason" className="text-sm font-bold">ระบุเหตุผลการชำระเงิน <span className="text-destructive">*</span></Label>
            <Textarea 
              id="manual-reason"
              placeholder="เช่น ตรวจสอบยอดในบัญชีธนาคารแล้ว, ชำระเป็นเงินสดหน้าสาขา..."
              value={manualReason}
              onChange={(e) => setManualReason(e.target.value)}
              className="min-h-[100px]"
              disabled={isPending}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction 
              onClick={(e) => {
                e.preventDefault();
                if (invoiceForManualAction && manualReason.trim() && !isPending) {
                  handleUpdateStatus(invoiceForManualAction.id, 'PAID', manualReason);
                }
              }}
              disabled={!manualReason.trim() || isPending || !invoiceForManualAction}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              ยืนยันการรับเงิน
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
