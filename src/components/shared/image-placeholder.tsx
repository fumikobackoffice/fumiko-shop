import { Package } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ImagePlaceholderProps {
  className?: string;
}

export function ImagePlaceholder({ className }: ImagePlaceholderProps) {
  return (
    <div
      className={cn(
        'flex h-full w-full items-center justify-center rounded-md bg-muted text-muted-foreground',
        className
      )}
    >
      <Package className="h-1/3 w-1/3" />
    </div>
  );
}
