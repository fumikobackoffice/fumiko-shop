'use client';

import { Branch } from '@/lib/types';
import { CustomDialog } from './custom-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Store, 
  MapPin, 
  Phone, 
  FileText, 
  Calendar, 
  Banknote, 
  Percent, 
  User, 
  ExternalLink,
  Pencil,
  Image as ImageIcon,
  Clock,
  ShieldCheck,
  Car
} from 'lucide-react';
import Image from 'next/image';
import { Separator } from '@/components/ui/separator';
import { format, differenceInDays } from 'date-fns';
import { th } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useMemo } from 'react';

interface BranchQuickViewProps {
  branch: Branch | null;
  isOpen: boolean;
  onClose: () => void;
}

export function BranchQuickView({ branch, isOpen, onClose }: BranchQuickViewProps) {
  if (!branch) return null;

  const latestContract = useMemo(() => {
    if (!branch.contracts || branch.contracts.length === 0) return null;
    return [...branch.contracts].sort((a, b) => {
      const dateA = a.expiryDate?.toDate ? a.expiryDate.toDate() : new Date(a.expiryDate || 0);
      const dateB = b.expiryDate?.toDate ? b.expiryDate.toDate() : new Date(b.expiryDate || 0);
      return dateB.getTime() - dateA.getTime();
    })[0];
  }, [branch.contracts]);

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'OPERATING': return 'success';
      case 'FOLLOW_UP': return 'warning';
      case 'SUSPENDED': return 'secondary';
      case 'CLOSED': return 'destructive';
      default: return 'outline';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'OPERATING': return 'ดำเนินกิจการ';
      case 'FOLLOW_UP': return 'ต้องติดตาม';
      case 'SUSPENDED': return 'พักกิจการชั่วคราว';
      case 'CLOSED': return 'ปิดกิจการ';
      default: return status;
    }
  };

  const expiryDate = latestContract?.expiryDate?.toDate ? latestContract.expiryDate.toDate() : (latestContract?.expiryDate ? new Date(latestContract.expiryDate) : null);
  const startDate = latestContract?.startDate?.toDate ? latestContract.startDate.toDate() : (latestContract?.startDate ? new Date(latestContract.startDate) : null);
  
  const now = new Date();
  const daysToExpiry = expiryDate ? differenceInDays(expiryDate, now) : null;
  const isExpiringSoon = daysToExpiry !== null && daysToExpiry <= 30;
  const isExpired = daysToExpiry !== null && daysToExpiry < 0;

  return (
    <CustomDialog isOpen={isOpen} onClose={onClose} title="ข้อมูลสาขาแบบสรุป" size="2xl">
      <div className="space-y-6 pt-2">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row items-center gap-6 p-4 bg-muted/30 rounded-xl border">
          <div className="relative h-24 w-40 rounded-lg overflow-hidden border shadow-sm bg-muted shrink-0">
            {branch.imageUrl ? (
              <Image src={branch.imageUrl} alt={branch.name} fill className="object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center bg-primary/10 text-primary">
                <Store className="h-12 w-12 opacity-20" />
              </div>
            )}
          </div>
          <div className="text-center sm:text-left space-y-2 flex-1">
            <div>
              <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                <h3 className="text-2xl font-bold font-headline">{branch.name}</h3>
                <Badge variant="outline" className="font-mono text-[10px]">{branch.branchCode}</Badge>
              </div>
              <div className="flex flex-wrap justify-center sm:justify-start gap-2 mt-1">
                <Badge variant={getStatusVariant(branch.status)}>{getStatusText(branch.status)}</Badge>
                <Badge variant="secondary" className="text-[10px]">
                  {branch.type === 'MAIN' ? 'สาขาแม่' : 'สาขาลูก'}
                </Badge>
                {branch.freeShippingEnabled && (
                  <Badge variant="success" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                    <ShieldCheck className="mr-1 h-3 w-3" /> ส่งฟรี
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex items-center justify-center sm:justify-start gap-2 text-sm text-muted-foreground">
              <User className="h-4 w-4" />
              <span className="font-medium text-foreground">เจ้าของ: {branch.ownerName || '-'}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Location & Contact */}
          <div className="space-y-4">
            <h4 className="text-sm font-bold flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
              <MapPin className="h-4 w-4" /> ที่ตั้งและการติดต่อ
            </h4>
            <div className="space-y-3">
              <div className="p-3 border rounded-lg bg-card text-sm leading-relaxed">
                <p className="font-medium text-foreground mb-1">{branch.address}</p>
                <p>{branch.subdistrict}, {branch.district}</p>
                <p>{branch.province} {branch.postalCode}</p>
                {branch.googleMapsUrl && (
                  <Button variant="link" size="sm" asChild className="h-auto p-0 mt-2 text-primary">
                    <a href={branch.googleMapsUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> ดูแผนที่ Google Maps
                    </a>
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted border text-muted-foreground">
                  <Phone className="h-3.5 w-3.5" />
                  <span className="font-medium">{branch.phone || 'ไม่ระบุเบอร์โทร'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Contract & Financials */}
          <div className="space-y-4">
            <h4 className="text-sm font-bold flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
              <FileText className="h-4 w-4" /> ข้อมูลสัญญาและการเงิน
            </h4>
            <div className="bg-muted/50 p-4 rounded-lg space-y-4 border">
              {latestContract ? (
                <>
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase font-bold">สัญญาฉบับปัจจุบัน</p>
                      <p className="text-sm font-bold truncate max-w-[150px]">
                        {(latestContract.documentIds || []).join(', ')}
                      </p>
                    </div>
                    <Badge className={cn(
                      "text-[10px] h-5",
                      isExpired ? "bg-red-500" : isExpiringSoon ? "bg-orange-500" : "bg-emerald-500"
                    )}>
                      {isExpired ? 'หมดอายุ' : isExpiringSoon ? `อีก ${daysToExpiry} วัน` : 'ปกติ'}
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase font-bold">เงินประกัน</p>
                      <p className="text-base font-bold text-primary">
                        ฿{(latestContract.securityDeposit || 0).toLocaleString()}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase font-bold">อัตราดอกเบี้ย</p>
                      <p className="text-base font-bold text-blue-600">
                        {latestContract.interestRate || 0}% <span className="text-[10px] font-normal">/ปี</span>
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-dashed space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> ระยะเวลาสัญญา
                    </p>
                    <p className="text-xs">
                      {startDate ? format(startDate, 'd MMM yy', { locale: th }) : '-'} — {expiryDate ? format(expiryDate, 'd MMM yy', { locale: th }) : '-'}
                    </p>
                  </div>
                </>
              ) : (
                <div className="text-center py-4 italic text-muted-foreground text-sm">
                  ไม่มีข้อมูลสัญญาในระบบ
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Logistics Section */}
        {branch.lalamoveConfig?.enabled && (
          <div className="space-y-4">
            <h4 className="text-sm font-bold flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
              <Car className="h-4 w-4 text-blue-600" /> บริการจัดส่ง Lalamove
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(branch.lalamoveConfig.vehicles || []).map((v) => (
                <div key={v.id} className="p-2 border rounded-lg bg-blue-50/30 text-center">
                  <p className="text-[10px] font-bold text-blue-700 truncate">{v.type}</p>
                  <p className="text-sm font-bold mt-0.5">฿{v.price.toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>ปิดหน้าต่าง</Button>
          <Button asChild>
            <Link href={`/dashboard/branches/${branch.id}/edit`}>
              <Pencil className="mr-2 h-4 w-4" />
              แก้ไขข้อมูลเต็ม
            </Link>
          </Button>
        </div>
      </div>
    </CustomDialog>
  );
}
