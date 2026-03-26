
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
import { Card, CardContent } from '@/components/ui/card';
import { 
  Eye, 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Star,
  Award,
  CircleUser,
  Zap,
  BarChart3
} from 'lucide-react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { useState } from 'react';
import { CustomDialog } from './custom-dialog';
import { BranchProductStats } from './branch-product-stats';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface BranchInsight {
    branchId: string;
    branchName: string;
    branchCode: string;
    ownerName: string;
    lastOrderDate: string | null;
    inactivityDays: number | null;
    totalOrders: number;
    lifetimeValue: number;
    averageCycleDays: number | null;
    growthTrend: number;
    branchGrade: 'A' | 'B' | 'C';
    products: any[];
}

const getHealthStatus = (inactivity: number | null, avgCycle: number | null) => {
    if (inactivity === null) return { label: 'ยังไม่เคยสั่ง', variant: 'secondary' as const, icon: Clock, description: 'ไม่มีประวัติออเดอร์ในระบบ' };
    
    let warnThreshold = 14;
    let criticalThreshold = 30;
    let isSmart = false;

    if (avgCycle && avgCycle > 0) {
        warnThreshold = Math.max(7, avgCycle + 2);
        criticalThreshold = Math.max(14, avgCycle * 2);
        isSmart = true;
    }

    if (inactivity < warnThreshold) {
        return { 
            label: 'ปกติ', 
            variant: 'success' as const, 
            icon: CheckCircle2, 
            isSmart,
            description: isSmart ? `สั่งซื้อภายในรอบปกติ (ทุกๆ ${avgCycle} วัน)` : 'สั่งซื้อภายใน 14 วันล่าสุด'
        };
    }
    if (inactivity <= criticalThreshold) {
        return { 
            label: 'เริ่มหาย', 
            variant: 'warning' as const, 
            icon: AlertTriangle, 
            isSmart,
            description: isSmart ? `เกินรอบสั่งซื้อปกติมาแล้ว (รอบละ ${avgCycle} วัน)` : 'ไม่ได้สั่งซื้อ 14-30 วัน'
        };
    }
    return { 
        label: 'หยุดสั่งนาน', 
        variant: 'destructive' as const, 
        icon: AlertTriangle, 
        isSmart,
        description: isSmart ? `ขาดการสั่งซื้อเกิน 2 เท่าของรอบปกติ` : 'ไม่ได้สั่งซื้อนานกว่า 30 วัน'
    };
};

const getGradeInfo = (grade: 'A' | 'B' | 'C') => {
    switch (grade) {
        case 'A': return { 
            label: 'Grade A', 
            icon: Star, 
            iconColor: 'text-yellow-500 fill-yellow-500', 
            container: 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800/50 text-yellow-700 dark:text-yellow-500' 
        };
        case 'B': return { 
            label: 'Grade B', 
            icon: Award, 
            iconColor: 'text-slate-400 fill-slate-400', 
            container: 'bg-slate-50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-700/50 text-slate-600 dark:text-slate-400' 
        };
        case 'C': return { 
            label: 'Grade C', 
            icon: CircleUser, 
            iconColor: 'text-orange-400', 
            container: 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800/50 text-orange-700 dark:text-orange-500' 
        };
    }
};

export function BranchInsightsTable({ data }: { data: BranchInsight[] }) {
  const [selectedBranch, setSelectedBranch] = useState<BranchInsight | null>(null);

  if (data.length === 0) {
    return (
      <div className="rounded-lg border p-12 text-center text-muted-foreground bg-card">
        <BarChart3 className="mx-auto h-12 w-12 opacity-20 mb-4" />
        ไม่พบข้อมูลการวิเคราะห์
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-[110px]">ระดับ</TableHead>
              <TableHead>ข้อมูลสาขา</TableHead>
              <TableHead className="text-right">ยอดซื้อสะสม (LTV)</TableHead>
              <TableHead>แนวโน้ม</TableHead>
              <TableHead>สั่งซื้อล่าสุด</TableHead>
              <TableHead className="text-right">ขาดสั่ง (วัน)</TableHead>
              <TableHead>สุขภาพสาขา</TableHead>
              <TableHead className="text-right">ดำเนินการ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((insight) => {
              const status = getHealthStatus(insight.inactivityDays, insight.averageCycleDays);
              const grade = getGradeInfo(insight.branchGrade);
              
              const lastOrderDateObj = insight.lastOrderDate ? new Date(insight.lastOrderDate) : null;
              const formattedDate = lastOrderDateObj 
                ? format(lastOrderDateObj, 'd MMM ', { locale: th }) + (lastOrderDateObj.getFullYear() + 543).toString().slice(-2)
                : '-';

              return (
                <TableRow key={insight.branchId} className="hover:bg-muted/30 transition-colors group">
                  <TableCell>
                    <div className={cn("flex items-center justify-center gap-1.5 py-1 px-2 rounded-md border text-[10px] font-bold shadow-sm transition-transform group-hover:scale-105 whitespace-nowrap", grade.container)}>
                        <grade.icon className={cn("h-3.5 w-3.5", grade.iconColor)} />
                        {grade.label}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-bold text-sm">{insight.branchName}</div>
                    <div className="text-[10px] text-muted-foreground font-mono flex items-center gap-1 mt-0.5">
                        {insight.branchCode} • {insight.ownerName}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="font-bold text-sm">฿{insight.lifetimeValue.toLocaleString('th-TH')}</div>
                    <div className="text-[10px] text-muted-foreground">ออเดอร์: {insight.totalOrders}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                        {insight.growthTrend > 0 ? (
                            <div className="flex items-center text-green-600 font-bold text-xs">
                                <TrendingUp className="h-3.5 w-3.5 mr-1" />
                                {insight.growthTrend}%
                            </div>
                        ) : insight.growthTrend < 0 ? (
                            <div className="flex items-center text-destructive font-bold text-xs">
                                <TrendingDown className="h-3.5 w-3.5 mr-1" />
                                {Math.abs(insight.growthTrend)}%
                            </div>
                        ) : (
                            <div className="flex items-center text-muted-foreground font-bold text-xs">
                                <Minus className="h-3.5 w-3.5 mr-1" />
                                0%
                            </div>
                        )}
                    </div>
                    <div className="text-[10px] text-muted-foreground">MoM Growth</div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {formattedDate}
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold text-sm">
                    {insight.inactivityDays ?? '-'}
                  </TableCell>
                  <TableCell>
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Badge variant={status.variant} className="gap-1 px-2 text-[10px] h-6 cursor-help whitespace-nowrap">
                                    <status.icon className="h-3 w-3" />
                                    {status.label}
                                    {status.isSmart && <Zap className="h-2.5 w-2.5 ml-0.5 fill-current" />}
                                </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>{status.description}</p>
                                {status.isSmart && <p className="text-[10px] mt-1 opacity-80">*วิเคราะห์ตามรอบสั่งซื้อเฉลี่ยของสาขานี้</p>}
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => setSelectedBranch(insight)} className="h-8 text-xs group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                      <Eye className="mr-1.5 h-3.5 w-3.5" />
                      วิเคราะห์
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {selectedBranch && (
        <CustomDialog
          isOpen={!!selectedBranch}
          onClose={() => setSelectedBranch(null)}
          title={`ข้อมูลเชิงลึก: ${selectedBranch.branchName}`}
          size="3xl"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <Card className="bg-muted/20 border-none shadow-none">
                <CardContent className="p-4">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold mb-1 tracking-wider">ยอดซื้อสะสม</p>
                    <p className="text-2xl font-bold text-primary">฿{selectedBranch.lifetimeValue.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</p>
                </CardContent>
            </Card>
            <Card className="bg-muted/20 border-none shadow-none">
                <CardContent className="p-4">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold mb-1 tracking-wider">รอบการสั่งซื้อเฉลี่ย</p>
                    <p className="text-2xl font-bold">
                        {selectedBranch.averageCycleDays 
                            ? `ทุกๆ ${selectedBranch.averageCycleDays} วัน` 
                            : 'ข้อมูลไม่พอ'}
                    </p>
                </CardContent>
            </Card>
            <Card className="bg-muted/20 border-none shadow-none">
                <CardContent className="p-4">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold mb-1 tracking-wider">การเติบโตเดือนนี้</p>
                    <div className={cn("text-2xl font-bold flex items-center", selectedBranch.growthTrend >= 0 ? "text-green-600" : "text-destructive")}>
                        {selectedBranch.growthTrend >= 0 ? <TrendingUp className="mr-2 h-6 w-6" /> : <TrendingDown className="mr-2 h-6 w-6" />}
                        {Math.abs(selectedBranch.growthTrend)}%
                    </div>
                </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
                <h3 className="font-bold text-lg">รายการสินค้าที่เคยสั่งซื้อ</h3>
                <Badge variant="outline" className="font-normal text-xs">{selectedBranch.products.length} รายการ</Badge>
            </div>
            <BranchProductStats products={selectedBranch.products} />
          </div>
          
          <div className="mt-8 flex justify-end">
            <Button variant="outline" onClick={() => setSelectedBranch(null)}>ปิดหน้าต่าง</Button>
          </div>
        </CustomDialog>
      )}
    </>
  );
}
