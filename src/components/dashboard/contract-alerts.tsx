
'use client';

import { Branch } from "@/lib/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CalendarClock, ArrowRight } from "lucide-react";
import Link from "next/link";
import { format, differenceInDays } from "date-fns";
import { th } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface ContractAlertsProps {
    branches: Branch[];
    isLoading: boolean;
}

export function ContractAlerts({ branches, isLoading }: ContractAlertsProps) {
    if (isLoading && branches.length === 0) return null;
    if (branches.length === 0) return null;

    const now = new Date();

    return (
        <Alert variant="default" className="bg-orange-50 dark:bg-orange-950/20 border-orange-200 text-orange-900 dark:text-orange-200 mb-6">
            <CalendarClock className="h-4 w-4 text-orange-600" />
            <AlertTitle className="font-bold flex items-center justify-between">
                สัญญาแฟรนไชส์ใกล้หมดอายุ ({branches.length} สาขา)
                <Link href="/dashboard/branches" className="text-xs underline hover:text-orange-800">จัดการสาขา</Link>
            </AlertTitle>
            <AlertDescription className="mt-2 space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {branches.slice(0, 6).map((branch) => {
                        // Find current latest contract
                        const latestContract = [...(branch.contracts || [])].sort((a, b) => {
                            const dateA = a.expiryDate ? new Date(a.expiryDate) : new Date(0);
                            const dateB = b.expiryDate ? new Date(b.expiryDate) : new Date(0);
                            return dateB.getTime() - dateA.getTime();
                        })[0];

                        if (!latestContract) return null;

                        const expiryDate = new Date(latestContract.expiryDate);
                        const daysLeft = differenceInDays(expiryDate, now);
                        const isExpired = daysLeft < 0;

                        return (
                            <Link 
                                key={branch.id} 
                                href={`/dashboard/branches/${branch.id}/edit`}
                                className="block p-2 rounded-md bg-white/50 dark:bg-white/5 hover:bg-white/80 dark:hover:bg-white/10 border border-orange-100 dark:border-orange-900/30 transition-colors group"
                            >
                                <div className="flex justify-between items-start gap-2">
                                    <div className="truncate">
                                        <p className="text-xs font-bold truncate">{branch.name}</p>
                                        <p className="text-[10px] opacity-70">
                                            เอกสาร: {(latestContract.documentIds || []).join(', ')}
                                        </p>
                                    </div>
                                    <div className={cn(
                                        "text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap",
                                        isExpired ? "bg-red-500 text-white" : "bg-orange-500 text-white"
                                    )}>
                                        {isExpired ? 'หมดอายุแล้ว' : `อีก ${daysLeft} วัน`}
                                    </div>
                                </div>
                            </Link>
                        );
                    })}
                </div>
                {branches.length > 6 && (
                    <p className="text-[10px] opacity-70 pt-1">
                        และสาขาอื่นๆ อีก {branches.length - 6} รายการที่กำลังจะหมดสัญญา
                    </p>
                )}
            </AlertDescription>
        </Alert>
    );
}
