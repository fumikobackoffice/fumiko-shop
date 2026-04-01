'use client';

import { useState, useTransition, useMemo } from 'react';
import { UserProfile, PointTransaction } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { CustomDialog } from './custom-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useToast } from '@/hooks/use-toast';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, writeBatch, doc, serverTimestamp, increment } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Loader2, PlusCircle, Star } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { clearGlobalCache } from '@/hooks/use-smart-fetch';

interface UserPointsManagerProps {
  user: UserProfile;
}

const adjustmentSchema = z.object({
  type: z.enum(['add', 'deduct']),
  amount: z.coerce
    .number({
      invalid_type_error: 'กรุณากรอกเป็นตัวเลขเท่านั้น',
    })
    .int({ message: 'กรุณากรอกเป็นตัวเลขจำนวนเต็ม' })
    .min(1, { message: 'จำนวนคะแนนต้องเป็น 1 หรือมากกว่า' }),
  description: z.string().min(1, { message: 'กรุณาระบุเหตุผล' }),
});

const getTransactionTypeDescription = (type: PointTransaction['type']) => {
    switch (type) {
        case 'EARN_PURCHASE': return 'คะแนนจากการซื้อ';
        case 'REDEEM_DISCOUNT': return 'แลกส่วนลด';
        case 'BONUS_SIGNUP': return 'โบนัสสมัครสมาชิก';
        case 'ADJUSTMENT_ADD': return 'ปรับปรุง (เพิ่ม)';
        case 'ADJUSTMENT_DEDUCT': return 'ปรับปรุง (ลด)';
        default: return 'ไม่ระบุ';
    }
};

export function UserPointsManager({ user: userToEdit }: UserPointsManagerProps) {
  const { user: adminUser } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const form = useForm<z.infer<typeof adjustmentSchema>>({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: { type: 'add', amount: 0, description: '' },
  });

  const transactionsQuery = useMemoFirebase(() => {
    if (!firestore || !userToEdit) return null;
    return query(
      collection(firestore, 'users', userToEdit.id, 'pointTransactions'),
      orderBy('createdAt', 'desc')
    );
  }, [userToEdit, firestore]);

  const { data: transactions, isLoading } = useCollection<PointTransaction>(transactionsQuery);

  const pageCount = useMemo(() => {
    return transactions ? Math.ceil(transactions.length / ITEMS_PER_PAGE) : 0;
  }, [transactions]);

  const paginatedTransactions = useMemo(() => {
    if (!transactions) return [];
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return transactions.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [transactions, currentPage]);

  const openAdjustmentDialog = () => {
    form.reset({ type: 'add', amount: 0, description: '' });
    setIsDialogOpen(true);
  };

  const handleAdjustPoints = (values: z.infer<typeof adjustmentSchema>) => {
    if (!firestore || !adminUser || !['super_admin', 'admin'].includes(adminUser.role)) {
      toast({ variant: 'destructive', title: 'ไม่มีสิทธิ์', description: 'คุณไม่มีสิทธิ์ในการดำเนินการนี้' });
      return;
    }
    
    startTransition(async () => {
        const batch = writeBatch(firestore);
        const userRef = doc(firestore, 'users', userToEdit.id);
        const transactionRef = doc(collection(firestore, 'users', userToEdit.id, 'pointTransactions'));
        
        const amount = values.type === 'add' ? values.amount : -values.amount;
        const transactionType = values.type === 'add' ? 'ADJUSTMENT_ADD' : 'ADJUSTMENT_DEDUCT';

        batch.set(transactionRef, {
            userId: userToEdit.id,
            type: transactionType,
            amount: amount,
            description: values.description,
            createdAt: serverTimestamp()
        });

        batch.update(userRef, {
            pointsBalance: increment(amount)
        });

        try {
            await batch.commit();
            clearGlobalCache('users-data');
            toast({ title: 'ปรับปรุงคะแนนสำเร็จ', description: `ได้ปรับปรุงคะแนนของ ${userToEdit.name} จำนวน ${amount} คะแนน` });
            setIsDialogOpen(false);
            form.reset();
        } catch (error: any) {
            console.error("Error adjusting points:", error);
            toast({ variant: 'destructive', title: 'เกิดข้อผิดพลาด', description: error.message || 'ไม่สามารถปรับปรุงคะแนนได้' });
        }
    });
  };

  if (userToEdit.role !== 'seller') {
    return null; // Only show this manager for 'seller' role
  }
  
  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
            <div>
                <CardTitle className="font-headline">สมุดคะแนน</CardTitle>
                <CardDescription>
                    คะแนนสะสมปัจจุบัน: <span className="font-bold text-primary">{userToEdit.pointsBalance?.toLocaleString() || 0}</span> คะแนน
                </CardDescription>
            </div>
            {adminUser && ['super_admin', 'admin'].includes(adminUser.role) && (
                 <Button onClick={openAdjustmentDialog}><PlusCircle className="mr-2 h-4 w-4" /> ปรับปรุงคะแนน</Button>
            )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !transactions || transactions.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">ยังไม่มีประวัติคะแนน</p>
          ) : (
            <>
                <div className="rounded-lg border">
                <Table>
                    <TableHeader>
                    <TableRow>
                        <TableHead>วันที่</TableHead>
                        <TableHead>ประเภท</TableHead>
                        <TableHead>รายละเอียด</TableHead>
                        <TableHead className="text-right">คะแนน</TableHead>
                    </TableRow>
                    </TableHeader>
                    <TableBody>
                    {paginatedTransactions.map((tx) => (
                        <TableRow key={tx.id}>
                        <TableCell>{tx.createdAt ? new Date(tx.createdAt.toDate()).toLocaleDateString('th-TH') : '-'}</TableCell>
                        <TableCell>
                            <Badge variant={tx.amount > 0 ? 'success' : 'warning'}>{getTransactionTypeDescription(tx.type)}</Badge>
                        </TableCell>
                        <TableCell>{tx.description}</TableCell>
                        <TableCell className={`text-right font-medium ${tx.amount > 0 ? 'text-primary' : 'text-destructive'}`}>
                            {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString()}
                        </TableCell>
                        </TableRow>
                    ))}
                    </TableBody>
                </Table>
                </div>
                {pageCount > 1 && (
                    <div className="flex items-center justify-end space-x-2 pt-4">
                        <span className="text-sm text-muted-foreground">
                            หน้า {currentPage} จาก {pageCount}
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(p => p - 1)}
                            disabled={currentPage === 1}
                        >
                            ก่อนหน้า
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(p => p + 1)}
                            disabled={currentPage === pageCount}
                        >
                            ถัดไป
                        </Button>
                    </div>
                )}
            </>
          )}
        </CardContent>
      </Card>

      <CustomDialog isOpen={isDialogOpen} onClose={() => setIsDialogOpen(false)} title={`ปรับปรุงคะแนนของ ${userToEdit.name}`}>
          <div className="mb-6 p-4 bg-primary/5 rounded-xl border border-primary/20 flex justify-between items-center shadow-inner">
              <div className="flex items-center gap-2">
                  <Star className="h-5 w-5 text-primary" />
                  <span className="text-sm font-bold text-muted-foreground uppercase tracking-tight">คะแนนสะสมปัจจุบัน</span>
              </div>
              <p className="text-2xl font-bold text-primary">
                  {(userToEdit.pointsBalance || 0).toLocaleString()} 
                  <span className="text-xs font-medium text-muted-foreground ml-1">คะแนน</span>
              </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleAdjustPoints)} className="space-y-4">
                <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                        <RadioGroup
                            onValueChange={field.onChange}
                            value={field.value}
                            className="grid grid-cols-2 gap-4"
                        >
                            <FormItem>
                                <FormControl>
                                    <RadioGroupItem value="add" id="add" className="peer sr-only" />
                                </FormControl>
                                <Label
                                    htmlFor="add"
                                    className={cn(
                                        "flex items-center justify-center rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground cursor-pointer",
                                        "peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                                    )}
                                >
                                    เพิ่มคะแนน
                                </Label>
                            </FormItem>
                            <FormItem>
                                <FormControl>
                                    <RadioGroupItem value="deduct" id="deduct" className="peer sr-only" />
                                </FormControl>
                                <Label
                                    htmlFor="deduct"
                                    className={cn(
                                        "flex items-center justify-center rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground cursor-pointer",
                                        "peer-data-[state=checked]:border-destructive [&:has([data-state=checked])]:border-destructive"
                                    )}
                                >
                                    ลบคะแนน
                                </Label>
                            </FormItem>
                        </RadioGroup>
                    )}
                />
                <FormField
                    control={form.control}
                    name="amount"
                    render={({ field }) => (
                        <FormItem>
                            <Label>จำนวนคะแนน <span className="text-destructive">*</span></Label>
                            <FormControl>
                                <Input
                                    placeholder="กรอกจำนวนคะแนน"
                                    {...field}
                                    onChange={(e) => {
                                        const value = e.target.value.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');
                                        field.onChange(value === '' ? '' : Number(value));
                                    }}
                                    value={field.value === 0 ? '' : field.value}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                        <FormItem>
                            <Label>เหตุผล <span className="text-destructive">*</span></Label>
                            <FormControl>
                                <Input
                                    placeholder="เช่น โบนัสพิเศษ, แก้ไขข้อผิดพลาด"
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>ยกเลิก</Button>
                    <Button type="submit" disabled={isPending}>
                        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        ยืนยัน
                    </Button>
                </div>
            </form>
          </Form>
      </CustomDialog>
    </>
  );
}
