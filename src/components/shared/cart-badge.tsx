'use client';

import { useCart } from "@/hooks/use-cart";
import { Button } from "@/components/ui/button";
import { ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

export function CartBadge() {
  const { cartCount } = useCart();
  const { user, impersonatedUser } = useAuth();

  // Show if user is a seller OR if an admin is impersonating someone
  if (user?.role !== 'seller' && !impersonatedUser) {
    return null;
  }

  return (
    <Button 
      variant="outline" 
      size="icon" 
      asChild 
      className="relative h-11 w-11 rounded-xl border-muted-foreground/20 bg-background/50 hover:bg-muted/50 transition-colors"
    >
      <Link href="/cart">
        <ShoppingCart className="h-5 w-5" />
        {cartCount > 0 && (
          <span className={cn(
            "absolute -top-2 -right-2 flex items-center justify-center rounded-full bg-[#F43F5E] text-white text-[11px] font-bold shadow-sm ring-2 ring-background transition-all",
            cartCount > 9 ? "h-6 px-1.5 min-w-6" : "h-5 w-5"
          )}>
            {cartCount}
          </span>
        )}
        <span className="sr-only">ตะกร้าสินค้า</span>
      </Link>
    </Button>
  );
}
