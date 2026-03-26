'use client';

import { createContext, useState, useEffect, ReactNode, useMemo, useCallback } from 'react';
import type { CartItem, Product, ProductPackage, StoreSettings, Service } from '@/lib/types';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { calculateTotalShipping } from '@/lib/shipping-utils';

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
    const existingItem = cartItems.find((cartItem) => cartItem.id === item.id);
    
    let type: 'PRODUCT' | 'PACKAGE' | 'SERVICE';
    if ('productGroupId' in item) {
        type = 'PRODUCT';
    } else if ('items' in item) {
        type = 'PACKAGE';
    } else {
        type = 'SERVICE';
    }

    if (type === 'PRODUCT') {
      const product = item as Product;
      if (product.trackInventory) {
        const stock = (product.inventoryLots || []).reduce((sum, lot) => sum + lot.quantity, 0);
        const newQuantity = (existingItem?.quantity || 0) + quantity;
        if (newQuantity > stock) {
          toast({
            variant: 'destructive',
            title: 'สินค้าไม่เพียงพอ',
            description: `มี ${product.name} ในสต็อกเพียง ${stock} ชิ้น`,
          });
          return;
        }
      }
    }

    setCartItems((prevItems) => {
      const foundItem = prevItems.find((cartItem) => cartItem.id === item.id);
      if (foundItem) {
        return prevItems.map((cartItem) =>
          cartItem.id === item.id
            ? { ...cartItem, quantity: cartItem.quantity + quantity }
            : cartItem
        );
      }
      return [...prevItems, { id: item.id, item, type, quantity }];
    });

    toast({
      title: type === 'SERVICE' ? 'เพิ่มบริการลงตะกร้าแล้ว' : 'เพิ่มลงตะกร้าแล้ว',
      description: `${quantity} x ${item.name} ถูกเพิ่มลงในตะกร้าของคุณแล้ว`,
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
          const stock = (product.inventoryLots || []).reduce((sum, lot) => sum + lot.quantity, 0);
          if (quantity > stock) {
            toast({
              variant: 'destructive',
              title: 'สินค้าไม่เพียงพอ',
              description: `มี ${product.name} ในสต็อกเพียง ${stock} ชิ้น`,
            });
            return prevItems.map((item) =>
              item.id === itemId ? { ...item, quantity: stock } : item
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
      basePrice = getPriceForQuantity(p, cartItem.quantity);
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
