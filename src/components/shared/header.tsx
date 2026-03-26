
'use client';

import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { Logo } from './logo';
import { UserNav } from './user-nav';
import { CartBadge } from './cart-badge';
import { useState } from 'react';
import { ThemeToggle } from './theme-toggle';
import { useRouter } from 'next/navigation';

export function Header() {
  const [searchValue, setSearchValue] = useState('');
  const router = useRouter();

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchValue.trim()) {
      router.push(`/shop?q=${encodeURIComponent(searchValue.trim())}`);
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-20 items-center px-4 sm:px-6 lg:px-8 w-full">
        <Logo />
        <div className="flex flex-1 items-center justify-end gap-3 sm:gap-4">
          <form onSubmit={handleSearchSubmit} className="relative hidden lg:block mr-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="ค้นหาสินค้า..."
              className="pl-9 w-64 xl:w-80 bg-muted/30 border-muted-foreground/20 rounded-full h-11 focus-visible:ring-primary/20 transition-all"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
            />
          </form>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <CartBadge />
            <UserNav />
          </div>
        </div>
      </div>
    </header>
  );
}
