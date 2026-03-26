
'use client';

import { Button } from "@/components/ui/button";
import { RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface SmartRefreshButtonProps {
  /** Function to trigger data refresh */
  refresh: (silent?: boolean) => void;
  /** Loading state from the fetcher */
  isRefreshing: boolean;
  /** Number of new updates detected in real-time */
  badgeCount: number;
  /** Tooltip text */
  title?: string;
  /** Optional additional classes */
  className?: string;
}

/**
 * A specialized refresh button that displays a real-time badge count
 * when new data is available in the background.
 */
export function SmartRefreshButton({ 
  refresh, 
  isRefreshing, 
  badgeCount, 
  title = "รีเฟรชข้อมูล",
  className 
}: SmartRefreshButtonProps) {
  return (
    <Button 
      variant="outline" 
      size="icon" 
      onClick={() => refresh()} 
      disabled={isRefreshing} 
      className={cn("h-10 w-10 shrink-0 relative", className)} 
      title={title}
    >
      <RotateCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
      
      {/* Real-time Badge with Ping Animation */}
      {badgeCount > 0 && (
        <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
          <span className="relative inline-flex rounded-full h-4 w-4 bg-destructive text-[10px] font-bold text-white items-center justify-center shadow-sm">
            {badgeCount > 9 ? '9+' : badgeCount}
          </span>
        </span>
      )}
    </Button>
  );
}
