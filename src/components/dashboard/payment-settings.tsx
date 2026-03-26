'use client';

import { useState, useEffect, useTransition } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '../ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { getBankAccounts, setActiveBankAccount, deleteBankAccount } from '@/app/actions';
import { BankAccount } from '@/lib/types';
import { PlusCircle, Edit, Trash2, Loader2, MoreHorizontal } from 'lucide-react';
import { BankAccountFormDialog } from './bank-account-form-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { CustomDialog } from './custom-dialog';

export function PaymentSettings() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [isFormOpen, setFormOpen] = useState(false);
  const [accountToEdit, setAccountToEdit] = useState<BankAccount | null>(null);

  const [isDeleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState<BankAccount | null>(null);
  
  const { toast } = useToast();

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getBankAccounts();
      setAccounts(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSetActive = (accountId: string, currentState: boolean) => {
    if (currentState) return; // Already active
    startTransition(async () => {
        const result = await setActiveBankAccount(accountId);
        if (result.success) {
            toast({ title: result.message });
            fetchData();
        } else {
            toast({ variant: 'destructive', title: 'เกิดข้อผิดพลาด', description: result.message });
        }
    });
  };

  const openFormDialog = (account: BankAccount | null) => {
    setAccountToEdit(account);
    setFormOpen(true);
  }
  
  const openDeleteDialog = (account: BankAccount) => {
    if (account.isActive) {
        toast({ variant: 'destructive', title: 'ไม่สามารถลบได้', description: 'กรุณาเปลี่ยนบัญชีที่ใช้งานก่อนทำการลบ' });
        return;
    }
    setAccountToDelete(account);
    setDeleteConfirmOpen(true);
  }

  const handleDelete = () => {
    if (!accountToDelete) return;
    startTransition(async () => {
        try {
            const result = await deleteBankAccount(accountToDelete.id);
            if (result.success) {
                toast({ title: result.message });
                fetchData();
            } else {
                toast({ variant: 'destructive', title: 'เกิดข้อผิดพลาด', description: result.message });
            }
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'เกิดข้อผิดพลาด', description: e.message });
        } finally {
            setDeleteConfirmOpen(false);
            setAccountToDelete(null);
        }
    });
  };


  const renderContent = () => {
    if (isLoading) {
      return <Skeleton className="h-40 w-full" />;
    }
    if (error) {
      return <div className="text-destructive">เกิดข้อผิดพลาด: {error}</div>;
    }
    if (accounts.length === 0) {
        return (
            <div className="text-center p-8 text-muted-foreground border-2 border-dashed rounded-lg">
                <p>ยังไม่มีบัญชีธนาคาร</p>
                <p>เริ่มต้นด้วยการเพิ่มบัญชีแรกของคุณ</p>
            </div>
        )
    }

    return (
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">สถานะ</TableHead>
              <TableHead>ธนาคาร</TableHead>
              <TableHead>ชื่อบัญชี</TableHead>
              <TableHead>เลขที่บัญชี</TableHead>
              <TableHead className="text-right">ดำเนินการ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((account) => (
              <TableRow key={account.id}>
                <TableCell>
                  <div className="flex items-center gap-3 whitespace-nowrap">
                    <Switch
                        id={`active-switch-${account.id}`}
                        checked={account.isActive}
                        onCheckedChange={() => handleSetActive(account.id, account.isActive)}
                        disabled={isPending || account.isActive}
                    />
                    <label 
                      htmlFor={`active-switch-${account.id}`} 
                      className={cn(
                        "text-sm font-bold transition-colors",
                        account.isActive ? "text-emerald-600" : "text-muted-foreground"
                      )}
                    >
                      {account.isActive ? 'ใช้งาน' : 'ปิด'}
                    </label>
                  </div>
                </TableCell>
                <TableCell>{account.bankName}</TableCell>
                <TableCell>{account.accountName}</TableCell>
                <TableCell>{account.accountNumber}</TableCell>
                <TableCell className="text-right">
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setTimeout(() => openFormDialog(account), 100)}>
                          <Edit className="mr-2 h-4 w-4" /> แก้ไข
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onSelect={() => setTimeout(() => openDeleteDialog(account), 100)}
                            className="text-destructive focus:text-destructive focus:bg-destructive/10"
                            disabled={account.isActive}
                        >
                            <Trash2 className="mr-2 h-4 w-4" /> ลบ
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>บัญชีธนาคารสำหรับรับเงิน</CardTitle>
            <CardDescription>
              จัดการบัญชีธนาคารที่ลูกค้าจะใช้โอนเงิน (เปิดใช้งานได้ทีละ 1 บัญชี)
            </CardDescription>
          </div>
          <Button onClick={() => openFormDialog(null)}>
            <PlusCircle className="mr-2 h-4 w-4" /> เพิ่มบัญชี
          </Button>
        </CardHeader>
        <CardContent>
          {renderContent()}
        </CardContent>
      </Card>

      <BankAccountFormDialog 
        isOpen={isFormOpen}
        onClose={() => setFormOpen(false)}
        onSuccess={() => {
            setFormOpen(false);
            fetchData();
        }}
        accountToEdit={accountToEdit}
      />

      <CustomDialog
        isOpen={isDeleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title="ยืนยันการลบ?"
      >
        <p className="text-sm text-muted-foreground">
            คุณแน่ใจหรือไม่ว่าต้องการลบบัญชีธนาคาร "{accountToDelete?.bankName}" นี้? การกระทำนี้ไม่สามารถย้อนกลับได้
        </p>
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-6">
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>ยกเลิก</Button>
            <Button
                onClick={handleDelete}
                variant="destructive"
                disabled={isPending}
            >
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                ยืนยันการลบ
            </Button>
        </div>
      </CustomDialog>
    </>
  );
}
