
'use client';

import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { DashboardOverview } from '@/components/dashboard/dashboard-overview';
import { SellerDashboard } from '@/components/dashboard/seller-dashboard';
import { LayoutDashboard, ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  if (loading || !user) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Seller Role Dashboard
  if (user.role === 'seller') {
    return (
      <div className="space-y-8">
        <h1 className="text-3xl font-headline font-bold">ศูนย์ควบคุมสาขา</h1>
        <SellerDashboard user={user} />
      </div>
    );
  }

  // Admin / Super Admin Role Dashboard
  if (['super_admin', 'admin'].includes(user.role)) {
    // Permission Enforcement: Support both granular and legacy schema
    const hasRevenuePermission = user.role === 'super_admin' || 
                                 user.permissions?.includes('view_revenue') || 
                                 user.permissions?.includes('revenue:view') ||
                                 user.permissions?.includes('revenue:manage');

    if (!hasRevenuePermission) {
      return (
        <div className="space-y-8 animate-in fade-in duration-500">
          <h1 className="text-3xl font-headline font-bold">ระบบบริหารจัดการ Fumiko</h1>
          <div className="grid gap-6">
            <Card className="bg-primary/5 border-primary/20">
              <CardHeader>
                <div className="p-3 bg-primary/10 rounded-full w-fit text-primary mb-4">
                  <LayoutDashboard className="h-8 w-8" />
                </div>
                <CardTitle className="text-2xl">ยินดีต้อนรับ, {user.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground leading-relaxed">
                  คุณได้เข้าสู่ระบบในฐานะแอดมิน กรุณาเลือกเมนูที่ต้องการทางแถบด้านข้างเพื่อเริ่มต้นจัดการข้อมูล
                  ตามขอบเขตงานที่คุณได้รับมอบหมายครับ
                </p>
              </CardContent>
            </Card>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 flex items-start gap-4 text-amber-900">
              <ShieldAlert className="h-6 w-6 shrink-0 mt-1" />
              <div>
                <h3 className="font-bold text-lg">การจำกัดการเข้าถึงข้อมูล</h3>
                <p className="text-sm opacity-90 mt-1">
                  เนื่องจากความปลอดภัยของข้อมูล พนักงานบางส่วนจะไม่สามารถมองเห็นยอดขายและกำไรสุทธิของบริษัทได้ 
                  หากคุณจำเป็นต้องเข้าถึงข้อมูลส่วนนี้ กรุณาติดต่อแอดมินระดับสูงสุดเพื่อขอเพิ่มสิทธิ์ "การเงินและกำไร" ครับ
                </p>
              </div>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="space-y-8">
          <h1 className="text-3xl font-headline font-bold">แดชบอร์ดผู้ดูแลระบบ</h1>
          <DashboardOverview />
      </div>
    );
  }

  return null;
}
