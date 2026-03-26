
'use client';

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Banknote, ArrowRight, Info, AlertTriangle, Percent } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { th } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Skeleton } from "../ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { Button } from "@/components/ui/button";

interface RefundAlert {
    branchId: string;
    branchName: string;
    branchCode: string;
    expiryDate: string;
    principal: number;
    interest: number;
    interestRate: number;
    totalRefund: number;
    daysRemaining: number;
}

interface DepositRefundAlertsProps {
    alerts: RefundAlert[];
    isLoading: boolean;
}

export function DepositRefundAlerts({ alerts, isLoading }: DepositRefundAlertsProps) {
    if (isLoading && alerts.length === 0) return <Skeleton className="h-32 w-full mb-6" />;
    if (alerts.length === 0) return null;

    return (
        <Alert variant="default" className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 text-blue-900 dark:text-blue-200 mb-6">
            <Banknote className="h-4 w-4 text-blue-600" />
            <AlertTitle className="font-bold flex items-center justify-between">
                รายการเตรียมคืนเงินประกันแบรนด์ ({alerts.length} สาขา)
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Info className="h-3.5 w-3.5 text-blue-400 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                            <p className="text-xs">คำนวณดอกเบี้ยตามอัตราที่ระบุไว้ในสัญญาของแต่ละช่วงเวลา โดยนับจากวันเริ่มสัญญาจนถึงวันหมดสัญญาล่าสุด</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </AlertTitle>
            <AlertDescription className="mt-3 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {alerts.map((alert) => {
                        const isExpired = alert.daysRemaining < 0;
                        return (
                            <div 
                                key={alert.branchId} 
                                className="p-3 rounded-lg bg-white/60 dark:bg-white/5 border border-blue-100 dark:border-blue-900/30 shadow-sm"
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold truncate text-blue-950 dark:text-blue-100">{alert.branchName}</p>
                                        <p className="text-[10px] opacity-70">{alert.branchCode}</p>
                                    </div>
                                    <div className={cn(
                                        "text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap shadow-sm",
                                        isExpired ? "bg-red-500 text-white" : "bg-blue-600 text-white"
                                    )}>
                                        {isExpired ? 'ครบกำหนดแล้ว' : `อีก ${alert.daysRemaining} วัน`}
                                    </div>
                                </div>
                                
                                <div className="space-y-1.5 pt-2 border-t border-blue-100/50 dark:border-blue-900/20">
                                    <div className="flex justify-between text-[10px]">
                                        <span className="opacity-70">เงินต้น (ปัจจุบัน):</span>
                                        <span className="font-medium">฿{alert.principal.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between text-[10px]">
                                        <div className="flex items-center gap-1 opacity-70">
                                            <span>ดอกเบี้ยสะสม:</span>
                                            <span className="inline-flex items-center gap-0.5 px-1 bg-blue-100 dark:bg-blue-900/40 rounded text-[8px] font-bold">
                                                <Percent className="h-2 w-2" /> {alert.interestRate}%
                                            </span>
                                        </div>
                                        <span className="font-medium text-green-600">+ ฿{alert.interest.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="flex justify-between text-xs font-bold pt-1 text-blue-800 dark:text-blue-300">
                                        <span>ยอดคืนสุทธิ:</span>
                                        <span>฿{alert.totalRefund.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    </div>
                                </div>
                                
                                <Button variant="ghost" size="sm" asChild className="w-full h-7 mt-3 text-[10px] hover:bg-blue-100 dark:hover:bg-blue-900/40">
                                    <Link href={`/dashboard/branches/${alert.branchId}/edit`}>
                                        ดูรายละเอียดสัญญา <ArrowRight className="ml-1 h-3 w-3" />
                                    </Link>
                                </Button>
                            </div>
                        );
                    })}
                </div>
            </AlertDescription>
        </Alert>
    );
}
