'use client';

import { createContext, useState, useEffect, ReactNode, useMemo, useCallback } from 'react';
import type { CartItem, Product, ProductPackage, StoreSettings, Service } from '@/lib/types';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { calculateTotalShipping } from '@/lib/shipping-utils';
import { allocateLotsForCart, buildCartItemId, getDisplayPrice } from '@/lib/lot-pricing';

interface CartContextType {
  cartItems: CartItem[];
  addToCart: (item: Product | ProductPackage | Service, quantity?: number) => void;
  removeFromCart: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  clearCart: () => void;
  cartCount: number;
  cartTotal: number;
  shippingCost: number;
  isSettingsLoading: boolean;
  getPriceForQuantity: (product: Product, quantity: number) => number;
  storeSettings: StoreSettings | null;
}

export const CartContext = createContext<CartContextType | undefined>(undefined);

const getPriceForQuantity = (product: Product, quantity: number): number => {
    if (!product.priceTiers || product.priceTiers.length === 0) {
      return product.price;
    }
    const sortedTiers = [...product.priceTiers].sort((a, b) => (b.minQuantity || 0) - (a.minQuantity || 0));
    const applicableTier = sortedTiers.find(tier => tier.minQuantity != null && quantity >= tier.minQuantity);
    return applicableTier?.price ?? product.price;
};

export function CartProvider({ children }: { children: ReactNode }) {
  const { user, impersonatedUser } = useAuth();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const { toast } = useToast();
  const firestore = useFirestore();

  // Use the impersonated user's ID for the cart storage key if active
  const effectiveUserId = impersonatedUser?.id || user?.id;
  const getStorageKey = useMemo(() => effectiveUserId ? `fumiko-cart-${effectiveUserId}` : null, [effectiveUserId]);

  const settingsRef = useMemoFirebase(() => firestore ? doc(firestore, 'settings', 'store') : null, [firestore]);
  const { data: storeSettings, isLoading: isSettingsLoading } = useDoc<StoreSettings>(settingsRef);

  useEffect(() => {
    if (getStorageKey) {
      try {
        const storedCart = localStorage.getItem(getStorageKey);
        if (storedCart) {
          setCartItems(JSON.parse(storedCart));
        } else {
          setCartItems([]);
        }
      } catch (error) {
        console.error('Failed to parse cart from localStorage', error);
        setCartItems([]);
      }
    } else {
        setCartItems([]);
    }
  }, [getStorageKey]);

  useEffect(() => {
    if (getStorageKey) {
      localStorage.setItem(getStorageKey, JSON.stringify(cartItems));
    }
  }, [cartItems, getStorageKey]);

  const addToCart = useCallback((item: Product | ProductPackage | Service, quantity: number = 1) => {
    let type: 'PRODUCT' | 'PACKAGE' | 'SERVICE';
    if ('productGroupId' in item) {
        type = 'PRODUCT';
    } else if ('items' in item) {
        type = 'PACKAGE';
    } else {
        type = 'SERVICE';
    }

    // For PACKAGE and SERVICE — simple add (no lot logic)
    if (type !== 'PRODUCT') {
      const existingItem = cartItems.find((cartItem) => cartItem.id === item.id);
      setCartItems((prevItems) => {
        const foundItem = prevItems.find((ci) => ci.id === item.id);
        if (foundItem) {
          return prevItems.map((ci) =>
            ci.id === item.id ? { ...ci, quantity: ci.quantity + quantity } : ci
          );
        }
        return [...prevItems, { id: item.id, item, type, quantity }];
      });
      toast({
        title: type === 'SERVICE' ? 'เพิ่มบริการลงตะกร้าแล้ว' : 'เพิ่มลงตะกร้าแล้ว',
        description: `${quantity} x ${item.name} ถูกเพิ่มลงในตะกร้าของคุณแล้ว`,
      });
      return;
    }

    // PRODUCT — lot-based pricing logic
    const product = item as Product;

    // Check total stock
    if (product.trackInventory) {
      const totalStock = (product.inventoryLots || []).reduce((sum, lot) => sum + lot.quantity, 0);
      // Calculate total already in cart for this variant (may be split across lot-price groups)
      const alreadyInCart = cartItems
        .filter(ci => ci.type === 'PRODUCT' && (ci.item as Product).id === product.id)
        .reduce((sum, ci) => sum + ci.quantity, 0);

      if (alreadyInCart + quantity > totalStock) {
        toast({
          variant: 'destructive',
          title: 'สินค้าไม่เพียงพอ',
          description: `มี ${product.name} ในสต็อกเพียง ${totalStock} ชิ้น`,
        });
        return;
      }
    }

    // Allocate lots: split by price, merge when same price
    const allocations = allocateLotsForCart(product as any, quantity);

    if (allocations.length === 0) {
      // No inventory lots (untracked product or empty) — add with base price
      setCartItems((prevItems) => {
        const foundItem = prevItems.find((ci) => ci.id === product.id);
        if (foundItem) {
          return prevItems.map((ci) =>
            ci.id === product.id ? { ...ci, quantity: ci.quantity + quantity } : ci
          );
        }
        return [...prevItems, { id: product.id, item: product, type: 'PRODUCT', quantity }];
      });
    } else {
      setCartItems((prevItems) => {
        let newItems = [...prevItems];

        for (const alloc of allocations) {
          // lotPrice is only set when the lot has a specific sellingPrice different from variant.price
          const effectiveLotPrice = alloc.price !== product.price ? alloc.price : undefined;
          const cartId = buildCartItemId(product.id, effectiveLotPrice);
          
          const existingIdx = newItems.findIndex(ci => ci.id === cartId);

          if (existingIdx >= 0) {
            // Update existing cart item
            const existing = newItems[existingIdx];
            const newQty = existing.quantity + alloc.quantity;
            newItems[existingIdx] = {
              ...existing,
              quantity: Math.min(newQty, alloc.maxAvailable),
            };
          } else {
            // Create new cart item
            newItems.push({
              id: cartId,
              item: product,
              type: 'PRODUCT',
              quantity: alloc.quantity,
              lotPrice: effectiveLotPrice,
              lotLabel: alloc.lotLabel ?? undefined,
              maxLotQuantity: alloc.maxAvailable,
            });
          }
        }
        return newItems;
      });
    }

    toast({
      title: 'เพิ่มลงตะกร้าแล้ว',
      description: `${quantity} x ${product.name} ถูกเพิ่มลงในตะกร้าของคุณแล้ว`,
    });
  }, [cartItems, toast]);

  const removeFromCart = useCallback((itemId: string) => {
    setCartItems((prevItems) => prevItems.filter((item) => item.id !== itemId));
  }, []);

  const updateQuantity = useCallback((itemId: string, quantity: number) => {
    setCartItems(prevItems => {
      const itemToUpdate = prevItems.find(i => i.id === itemId);
      if (!itemToUpdate) return prevItems;

      if (itemToUpdate.type === 'PRODUCT') {
        const product = itemToUpdate.item as Product;
        if (product.trackInventory) {
          // Check against lot-specific max if available, otherwise total stock
          const maxQty = itemToUpdate.maxLotQuantity 
            ?? (product.inventoryLots || []).reduce((sum, lot) => sum + lot.quantity, 0);
          
          if (quantity > maxQty) {
            toast({
              variant: 'destructive',
              title: 'สินค้าไม่เพียงพอ',
              description: itemToUpdate.lotLabel 
                ? `ล็อตนี้มีสินค้าเพียง ${maxQty} ชิ้น`
                : `มี ${product.name} ในสต็อกเพียง ${maxQty} ชิ้น`,
            });
            return prevItems.map((item) =>
              item.id === itemId ? { ...item, quantity: maxQty } : item
            );
          }
        }
      }
      
      return prevItems.map((item) =>
          item.id === itemId ? { ...item, quantity } : item
      ).filter(item => item.quantity > 0);
    });
  }, [toast]);

  const clearCart = useCallback(() => {
    setCartItems([]);
  }, []);

  const cartCount = useMemo(() => cartItems.reduce((count, item) => count + item.quantity, 0), [cartItems]);
  
  const cartTotal = useMemo(() => cartItems.reduce((total, cartItem) => {
    let basePrice = 0;
    let taxRate = 0;
    let taxMode = 'INCLUSIVE';
    let isTaxable = true;

    if (cartItem.type === 'PRODUCT') {
      const p = cartItem.item as Product;
      // Use lot price if available, otherwise standard pricing
      if (cartItem.lotPrice != null) {
        basePrice = cartItem.lotPrice;
      } else {
        basePrice = getPriceForQuantity(p, cartItem.quantity);
      }
      taxRate = p.taxRate ?? storeSettings?.defaultTaxRate ?? 7;
      taxMode = p.taxMode ?? 'INCLUSIVE';
      isTaxable = p.taxStatus !== 'EXEMPT';
    } else if (cartItem.type === 'PACKAGE') {
      basePrice = (cartItem.item as ProductPackage).price;
      taxRate = storeSettings?.defaultTaxRate ?? 7;
      taxMode = 'INCLUSIVE'; 
      isTaxable = true;
    } else if (cartItem.type === 'SERVICE') {
      const s = cartItem.item as Service;
      basePrice = s.price;
      taxRate = s.taxRate ?? storeSettings?.defaultTaxRate ?? 7;
      taxMode = s.taxMode ?? 'INCLUSIVE';
      isTaxable = s.taxStatus !== 'EXEMPT';
    }

    let sellingPrice = basePrice;
    if (isTaxable && taxMode === 'EXCLUSIVE') {
        sellingPrice = basePrice * (1 + (taxRate / 100));
    }

    return total + sellingPrice * cartItem.quantity;
  }, 0), [cartItems, storeSettings]);

  const shippingCost = useMemo(() => {
    if (!storeSettings?.defaultShippingRates || cartItems.length === 0) {
      return 0;
    }
    
    return calculateTotalShipping(cartItems, storeSettings.defaultShippingRates);
  }, [cartItems, storeSettings]);

  // Memoize the final context value
  const value = useMemo(() => ({ 
    cartItems, 
    addToCart, 
    removeFromCart, 
    updateQuantity, 
    clearCart, 
    cartCount, 
    cartTotal, 
    shippingCost, 
    isSettingsLoading, 
    getPriceForQuantity, 
    storeSettings 
  }), [cartItems, addToCart, removeFromCart, updateQuantity, clearCart, cartCount, cartTotal, shippingCost, isSettingsLoading, storeSettings]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
