'use client';

import { UserProfile } from '@/lib/types';
import { CustomDialog } from './custom-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  User, 
  Mail, 
  Phone, 
  LineChart, 
  CreditCard, 
  MapPin, 
  Calendar, 
  ShieldCheck, 
  Ticket, 
  Image as ImageIcon,
  ExternalLink,
  MessageCircle,
  Pencil
} from 'lucide-react';
import Image from 'next/image';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

interface UserQuickViewProps {
  user: UserProfile | null;
  isOpen: boolean;
  onClose: () => void;
}

export function UserQuickView({ user, isOpen, onClose }: UserQuickViewProps) {
  const pathname = usePathname();
  
  if (!user) return null;

  const getRoleText = (role: string) => {
    switch (role) {
      case 'super_admin': return 'ผู้ดูแลระบบสูงสุด';
      case 'admin': return 'ผู้ดูแลระบบ';
      case 'seller': return 'เจ้าของสาขา';
      default: return role;
    }
  };

  const getRoleVariant = (role: string) => {
    switch (role) {
      case 'super_admin': return 'destructive';
      case 'admin': return 'default';
      case 'seller': return 'secondary';
      default: return 'outline';
    }
  };

  const dobDate = user.dob?.toDate ? user.dob.toDate() : (user.dob ? new Date(user.dob) : null);
  const formattedDob = dobDate ? format(dobDate, 'd MMMM ', { locale: th }) + (dobDate.getFullYear() + 543) : '-';

  const editUrl = pathname.includes('/staff') 
    ? `/dashboard/staff/${user.id}/edit` 
    : `/dashboard/users/${user.id}/edit`;

  return (
    <CustomDialog isOpen={isOpen} onClose={onClose} title="ข้อมูลผู้ใช้งานแบบสรุป" size="2xl">
      <div className="space-y-6 pt-2">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row items-center gap-6 p-4 bg-muted/30 rounded-xl border">
          <div className="relative h-24 w-24 rounded-full overflow-hidden border-4 border-background shadow-md bg-muted shrink-0">
            {user.faceImageUrl ? (
              <Image src={user.faceImageUrl} alt={user.name} fill className="object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center bg-primary/10 text-primary">
                <User className="h-12 w-12" />
              </div>
            )}
          </div>
          <div className="text-center sm:text-left space-y-2 flex-1">
            <div>
              <h3 className="text-2xl font-bold font-headline">{user.name}</h3>
              <div className="flex flex-wrap justify-center sm:justify-start gap-2 mt-1">
                <Badge variant={getRoleVariant(user.role)}>{getRoleText(user.role)}</Badge>
                <Badge variant={user.status === 'active' ? 'success' : 'outline'} className="text-[10px]">
                  {user.status === 'active' ? 'กำลังใช้งาน' : 'ถูกระงับ/จัดเก็บ'}
                </Badge>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
          {user.role === 'seller' && (
            <div className="bg-primary/10 p-4 rounded-xl text-center min-w-[120px]">
              <p className="text-[10px] font-bold text-primary uppercase tracking-wider mb-1">คะแนนสะสม</p>
              <p className="text-2xl font-bold text-primary">{(user.pointsBalance || 0).toLocaleString()}</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Contact Section */}
          <div className="space-y-4">
            <h4 className="text-sm font-bold flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
              <Phone className="h-4 w-4" /> ช่องทางติดต่อ
            </h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-1 border-b border-dashed">
                <span className="text-muted-foreground">เบอร์โทรศัพท์</span>
                <span className="font-medium">{user.phone || '-'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-dashed">
                <span className="text-muted-foreground">LINE ID</span>
                <span className="font-medium text-emerald-600 font-bold">{user.lineId || '-'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-dashed">
                <span className="text-muted-foreground">อีเมลสำรอง</span>
                <span className="font-medium">{user.contactEmail || '-'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-dashed">
                <span className="text-muted-foreground">วันเกิด</span>
                <span className="font-medium">{formattedDob}</span>
              </div>
            </div>
          </div>

          {/* Financial Section */}
          <div className="space-y-4">
            <h4 className="text-sm font-bold flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
              <CreditCard className="h-4 w-4" /> บัญชีธนาคาร
            </h4>
            <div className="bg-muted/50 p-4 rounded-lg space-y-3">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-bold">ธนาคาร</p>
                <p className="font-bold">{user.bankName || 'ไม่ได้ระบุ'}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-bold">เลขที่บัญชี</p>
                <p className="font-mono font-bold text-lg text-primary tracking-tighter">
                  {user.bankAccountNumber || 'xxxx-xxxx-xxxx'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Address Section */}
        <div className="space-y-4">
          <h4 className="text-sm font-bold flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
            <MapPin className="h-4 w-4" /> ที่อยู่ตามทะเบียน
          </h4>
          <div className="p-4 border rounded-lg bg-card">
            <p className="text-sm leading-relaxed">
              {user.address ? (
                <>
                  {user.address} {user.subdistrict} {user.district} {user.province} {user.postalCode}
                </>
              ) : (
                <span className="italic text-muted-foreground">ไม่ได้ระบุที่อยู่</span>
              )}
            </p>
          </div>
        </div>

        {/* Identity Documents */}
        {user.role === 'seller' && (
          <div className="space-y-4">
            <h4 className="text-sm font-bold flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
              <ImageIcon className="h-4 w-4" /> เอกสารยืนยันตัวตน
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-muted-foreground">บัตรประชาชน</p>
                <div className="relative aspect-[3/2] w-full rounded-md border overflow-hidden bg-muted group">
                  {user.nationalIdCardUrl ? (
                    <Image src={user.nationalIdCardUrl} alt="National ID" fill className="object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center italic text-[10px] text-muted-foreground">ไม่มีข้อมูล</div>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-muted-foreground">รูปถ่ายใบหน้า</p>
                <div className="relative aspect-[3/2] w-full rounded-md border overflow-hidden bg-muted">
                  {user.faceImageUrl ? (
                    <Image src={user.faceImageUrl} alt="Face Photo" fill className="object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center italic text-[10px] text-muted-foreground">ไม่มีข้อมูล</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>ปิดหน้าต่าง</Button>
          <Button asChild>
            <Link href={editUrl}>
              <Pencil className="mr-2 h-4 w-4" />
              แก้ไขข้อมูลเต็ม
            </Link>
          </Button>
        </div>
      </div>
    </CustomDialog>
  );
}
