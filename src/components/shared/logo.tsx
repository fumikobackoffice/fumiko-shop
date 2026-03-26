import { Store } from 'lucide-react';
import Link from 'next/link';

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 group">
      <div className="p-2 bg-primary text-primary-foreground rounded-lg group-hover:bg-accent transition-colors">
        <Store className="h-6 w-6" />
      </div>
      <span className="font-headline text-2xl font-bold">
        Fumiko Shop
      </span>
    </Link>
  );
}
