
'use client';

import { useAuth } from '@/hooks/use-auth';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import { Branch } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Store, ExternalLink, Calendar, Phone, Loader2, AlertTriangle, FileText, Eye } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { format, differenceInDays } from 'date-fns';
import { th } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import Link from 'next/link';

export function SellerBranchList() {
  const { user } = useAuth();
  const firestore = useFirestore();

  const branchesQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(collection(firestore, 'branches'), where('ownerId', '==', user.id));
  }, [firestore, user]);

  const { data: branches, isLoading } = useCollection<Branch>(branchesQuery);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!branches || branches.length === 0) {
    return null;
  }

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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline flex items-center gap-2">
          < Store className="h-5 w-5 text-primary" />
          สาขาภายใต้การดูแล
        </CardTitle>
        <CardDescription>รายการสาขาที่คุณเป็นเจ้าของและดำเนินกิจการอยู่</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {branches.map((branch) => {
          // Find latest contract
          const latestContract = [...(branch.contracts || [])].sort((a, b) => {
              const dateA = a.expiryDate?.toDate ? a.expiryDate.toDate() : new Date(a.expiryDate);
              const dateB = b.expiryDate?.toDate ? b.expiryDate.toDate() : new Date(b.expiryDate);
              return dateB.getTime() - dateA.getTime();
          })[0];

          const expiryDate = latestContract?.expiryDate?.toDate ? latestContract.expiryDate.toDate() : (latestContract?.expiryDate ? new Date(latestContract.expiryDate) : null);
          const now = new Date();
          const daysToExpiry = expiryDate ? differenceInDays(expiryDate, now) : null;
          const isExpiringSoon = daysToExpiry !== null && daysToExpiry <= 30;
          const isExpired = daysToExpiry !== null && daysToExpiry < 0;
          
          return (
            <div key={branch.id} className={cn(
                "border rounded-lg p-4 flex flex-col md:flex-row justify-between items-start gap-4 hover:bg-muted/5 transition-colors relative overflow-hidden",
                isExpired ? "border-red-200 bg-red-50/30" : isExpiringSoon ? "border-orange-200 bg-orange-50/30" : ""
            )}>
              {isExpiringSoon && (
                  <div className={cn(
                      "absolute top-0 left-0 w-1 h-full",
                      isExpired ? "bg-red-500" : "bg-orange-500"
                  )} />
              )}
              
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <h3 className="font-bold text-lg">{branch.name}</h3>
                  <Badge variant="outline" className="font-mono text-[10px]">{branch.branchCode}</Badge>
                  <Badge variant={getStatusVariant(branch.status)} className="h-5 text-[10px]">{getStatusText(branch.status)}</Badge>
                  <Badge variant="secondary" className="h-5 text-[10px]">{branch.type === 'MAIN' ? 'สาขาแม่' : 'สาขาลูก'}</Badge>
                  
                  {isExpired ? (
                      <Badge variant="destructive" className="h-5 text-[10px] animate-pulse">
                          <AlertTriangle className="mr-1 h-3 w-3" /> หมดอายุสัญญา
                      </Badge>
                  ) : isExpiringSoon && (
                      <Badge variant="warning" className="h-5 text-[10px] bg-orange-500 text-white border-none">
                          <AlertTriangle className="mr-1 h-3 w-3" /> จะหมดอายุใน {daysToExpiry} วัน
                      </Badge>
                  )}
                </div>
                
                <div className="grid sm:grid-cols-2 gap-x-8 gap-y-1 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5" />
                    <span>{branch.district}, {branch.province}</span>
                  </div>
                  {branch.phone && (
                    <div className="flex items-center gap-2">
                      Phone: {branch.phone}
                    </div>
                  )}
                  {latestContract && (
                    <div className="flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5" />
                      <span className="font-medium text-foreground truncate max-w-[200px]">
                        สัญญา: {(latestContract.documentIds || []).join(', ') || '-'}
                      </span>
                    </div>
                  )}
                  {expiryDate && (
                    <div className="flex items-center gap-2">
                      <Calendar className={cn("h-3.5 w-3.5", isExpiringSoon ? "text-orange-600" : "")} />
                      <span className={cn(isExpiringSoon ? "font-bold text-orange-700" : "")}>
                          หมดสัญญา: {expiryDate.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                  )}
                </div>
                
                {isExpiringSoon && !isExpired && (
                    <p className="text-[10px] text-orange-700 font-medium bg-orange-100 inline-block px-2 py-0.5 rounded-full mt-2">
                        กรุณาติดต่อแอดมินเพื่อดำเนินการต่ออายุสัญญา
                    </p>
                )}
              </div>
              
              <div className="flex flex-col gap-2 shrink-0 w-full md:w-auto">
                <Button variant="outline" size="sm" asChild className="h-8 text-xs w-full bg-primary/5 border-primary/20 text-primary hover:bg-primary/10">
                    <Link href={`/dashboard/branches/${branch.id}/edit`}>
                        <Eye className="mr-2 h-3.5 w-3.5" />
                        ดูรายละเอียด
                    </Link>
                </Button>
                {branch.googleMapsUrl && (
                    <Button variant="ghost" size="sm" asChild className="h-8 text-[10px] w-full text-muted-foreground">
                    <a href={branch.googleMapsUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="mr-2 h-3.5 w-3.5" />
                        เปิด Google Maps
                    </a>
                    </Button>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
