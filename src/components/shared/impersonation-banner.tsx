'use client';

import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { User, X, ShoppingCart } from "lucide-react";

export function ImpersonationBanner() {
  const { impersonatedUser, stopImpersonation } = useAuth();

  if (!impersonatedUser) return null;

  return (
    <div className="bg-orange-500 text-white py-2 px-4 shadow-md flex items-center justify-center sticky top-0 z-[100] border-b border-orange-600 animate-in slide-in-from-top duration-300">
      <div className="max-w-7xl w-full flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
            <User className="h-4 w-4" />
          </div>
          <div className="text-xs sm:text-sm">
            <span className="font-medium opacity-90">คุณกำลังสั่งซื้อแทน: </span>
            <span className="font-bold underline underline-offset-2">{impersonatedUser.name}</span>
            <span className="ml-2 hidden md:inline opacity-80">({impersonatedUser.email})</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="hidden lg:flex items-center gap-1.5 px-3 py-1 bg-white/10 rounded-full text-[10px] font-bold uppercase tracking-wider">
            <ShoppingCart className="h-3 w-3" />
            Admin Impersonation Mode
          </div>
          <Button 
            size="sm" 
            variant="outline" 
            className="h-8 bg-white/10 border-white/30 text-white hover:bg-white hover:text-orange-600 border-none px-4 font-bold"
            onClick={stopImpersonation}
          >
            <X className="mr-1.5 h-3.5 w-3.5" />
            สิ้นสุดการสั่งซื้อแทน
          </Button>
        </div>
      </div>
    </div>
  );
}
