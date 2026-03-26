
'use client';

import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import { PointTransaction } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { cn } from '@/lib/utils';

function PointsPageContents() {
  const { user } = useAuth();
  const firestore = useFirestore();
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const transactionsQuery = useMemoFirebase(() => {
    if (!user || !firestore) return null;
    return query(
      collection(firestore, 'users', user.id, 'pointTransactions'),
      orderBy('createdAt', 'desc')
    );
  }, [user, firestore]);

  const { data: transactions, isLoading } = useCollection<PointTransaction>(transactionsQuery);

  const pageCount = useMemo(() => {
    return transactions ? Math.ceil(transactions.length / ITEMS_PER_PAGE) : 0;
  }, [transactions]);

  const paginatedTransactions = useMemo(() => {
    if (!transactions) return [];
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return transactions.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [transactions, currentPage]);


  const getTransactionTypeDescription = (type: PointTransaction['type']) => {
      switch (type) {
          case 'EARN_PURCHASE': return 'คะแนนจากการซื้อ';
          case 'REDEEM_DISCOUNT': return 'แลกส่วนลด';
          case 'BONUS_SIGNUP': return 'โบนัสสมัครสมาชิก';
          case 'ADJUSTMENT_ADD': return 'ปรับปรุงโดยผู้ดูแล';
          case 'ADJUSTMENT_DEDUCT': return 'ปรับปรุงโดยผู้ดูแล';
          default: return 'ไม่ระบุ';
      }
  };

  const balance = user?.pointsBalance || 0;

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle className="font-headline text-lg">คะแนนสะสมปัจจุบัน</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col">
            <p className={cn(
                "text-5xl font-bold tracking-tighter",
                balance < 0 ? "text-destructive" : "text-primary"
            )}>
                {balance.toLocaleString()} <span className="text-xl font-medium text-muted-foreground ml-1">คะแนน</span>
            </p>
            {balance < 0 && (
                <p className="text-sm text-destructive font-medium mt-2">
                    * คุณมีหนี้คะแนนค้างชำระจากการยกเลิกรายการ คะแนนที่ได้รับในอนาคตจะถูกนำมาหักลบยอดนี้โดยอัตโนมัติ
                </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-headline">ประวัติคะแนน</CardTitle>
          <CardDescription>รายการเคลื่อนไหวคะแนนทั้งหมดของคุณ</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !transactions || transactions.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">ยังไม่มีประวัติคะแนน</p>
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
                      {paginatedTransactions.map((tx) => {
                        const dateObj = tx.createdAt?.toDate ? tx.createdAt.toDate() : (tx.createdAt ? new Date(tx.createdAt) : null);
                        const dateStr = dateObj ? format(dateObj, 'd MMM ') + (dateObj.getFullYear() + 543) : '-';
                        return (
                          <TableRow key={tx.id}>
                              <TableCell className="text-xs">
                                {dateStr}
                              </TableCell>
                              <TableCell>
                                  <Badge variant={tx.amount > 0 ? 'success' : 'destructive'}>{getTransactionTypeDescription(tx.type)}</Badge>
                              </TableCell>
                              <TableCell className="text-xs">{tx.description}</TableCell>
                              <TableCell className={`text-right font-medium ${tx.amount > 0 ? 'text-primary' : 'text-destructive'}`}>
                                  {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString()}
                              </TableCell>
                          </TableRow>
                        )
                      })}
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
    </div>
  );
}

export default function PointsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!user || user.role !== 'seller')) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  if (loading || !user || user.role !== 'seller') {
    return <div className="h-screen w-screen flex items-center justify-center bg-background"><div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div></div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-headline font-bold">สมุดคะแนน</h1>
      </div>
      <PointsPageContents />
    </div>
  );
}
