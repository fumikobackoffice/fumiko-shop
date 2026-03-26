'use client';

import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface CustomDialogProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  title: string;
  size?: 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl';
}

export function CustomDialog({ isOpen, onClose, children, title, size = 'lg' }: CustomDialogProps) {
  const sizeClasses = {
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
    '4xl': 'max-w-4xl',
    '5xl': 'max-w-5xl',
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className={cn(sizeClasses[size], "max-h-[95vh] overflow-y-auto")}>
        <DialogHeader>
          <DialogTitle className="font-headline text-xl">{title}</DialogTitle>
        </DialogHeader>
        <div className="pt-2">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}
