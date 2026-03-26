'use client';

import { Button } from "@/components/ui/button";
import { useCart } from "@/hooks/use-cart";
import { Product, ProductPackage } from "@/lib/types";
import { ShoppingCart } from "lucide-react";

interface AddToCartButtonProps {
  item: Product | ProductPackage;
  quantity?: number;
  showText?: boolean;
  disabled?: boolean;
}

export function AddToCartButton({ item, quantity = 1, showText = false, disabled = false }: AddToCartButtonProps) {
  const { addToCart } = useCart();

  const handleAddToCart = () => {
    // Note: The CartProvider already handles showing a success toast notification
    addToCart(item, quantity);
  };

  if (showText) {
    return (
        <Button onClick={handleAddToCart} size="lg" disabled={disabled}>
            <ShoppingCart className="mr-2 h-5 w-5" />
            เพิ่มลงตะกร้า
        </Button>
    )
  }

  return (
    <Button onClick={handleAddToCart} size="icon" aria-label="เพิ่มลงตะกร้า" disabled={disabled}>
      <ShoppingCart className="h-5 w-5" />
    </Button>
  );
}
