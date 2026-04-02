'use client';

import { Header } from '@/components/shared/header';
import { useAuth } from '@/hooks/use-auth';
import { useCart } from '@/hooks/use-cart';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import Image from 'next/image';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import { Minus, Plus, Trash2, Package, Loader2, ChevronLeft, Briefcase } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Product, ProductPackage, Service } from '@/lib/types';
import { ImagePlaceholder } from '@/components/shared/image-placeholder';
import { useFirestore } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { ImpersonationBanner } from '@/components/shared/impersonation-banner';


function CartPageContents() {
  const { cartItems, updateQuantity, removeFromCart, cartTotal, cartCount, getPriceForQuantity, shippingCost, isSettingsLoading } = useCart();
  const router = useRouter();
  const firestore = useFirestore();
  const { user, impersonatedUser } = useAuth();
  const { toast } = useToast();
  const validationRunRef = useRef(false);

  useEffect(() => {
    if (!firestore || cartItems.length === 0 || validationRunRef.current) {
        return;
    }
    validationRunRef.current = true;

    const validateCartItems = async () => {
      const invalidItems: { id: string, name: string }[] = [];
      const isAdminImpersonating = impersonatedUser && (user?.role === 'admin' || user?.role === 'super_admin');

      await Promise.all(cartItems.map(async (cartItem) => {
        let isValid = false;
        try {
          if (cartItem.type === 'PRODUCT') {
            const product = cartItem.item as Product;
            const groupRef = doc(firestore, 'productGroups', product.productGroupId);
            const variantRef = doc(firestore, 'productGroups', product.productGroupId, 'productVariants', product.id);
            const [groupSnap, variantSnap] = await Promise.all([getDoc(groupRef), getDoc(variantRef)]);
            
            if (groupSnap.exists() && variantSnap.exists() && variantSnap.data().status !== 'archived') {
              const groupStatus = groupSnap.data().status;
              if (groupStatus === 'active' || (groupStatus === 'draft' && isAdminImpersonating)) {
                isValid = true;
              }
            }
          } else if (cartItem.type === 'PACKAGE') {
            const pkgRef = doc(firestore, 'productPackages', cartItem.id);
            const pkgSnap = await getDoc(pkgRef);
            if (pkgSnap.exists() && pkgSnap.data().status !== 'archived') {
              const pkgStatus = pkgSnap.data().status;
              if (pkgStatus === 'active' || (pkgStatus === 'draft' && isAdminImpersonating)) {
                isValid = true;
              }
            }
          } else if (cartItem.type === 'SERVICE') {
            const serviceRef = doc(firestore, 'services', cartItem.id);
            const serviceSnap = await getDoc(serviceRef);
            if (serviceSnap.exists() && serviceSnap.data().status !== 'archived') {
              const serviceStatus = serviceSnap.data().status;
              if (serviceStatus === 'active' || (serviceStatus === 'draft' && isAdminImpersonating)) {
                isValid = true;
              }
            }
          }
        } catch (e) {
          console.error(`Error validating cart item ${cartItem.id}:`, e);
          isValid = false;
        }

        if (!isValid) {
          invalidItems.push({ id: cartItem.id, name: cartItem.item.name });
        }
      }));

      if (invalidItems.length > 0) {
        toast({
          variant: "destructive",
          title: "ปรับปรุงรายการสินค้าในตะกร้า",
          description: `สินค้า/บริการ ${invalidItems.length} รายการไม่พร้อมจำหน่ายและถูกนำออกแล้ว`,
        });
        invalidItems.forEach(item => removeFromCart(item.id));
      }
    };

    validateCartItems();
  }, [firestore, cartItems, removeFromCart, toast, user, impersonatedUser]);

  if (cartCount === 0) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-semibold mb-4">ตะกร้าของคุณว่างเปล่า</h2>
        <Button asChild>
          <Link href="/shop">ไปที่หน้าร้านค้า</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="mb-6">
        <Button variant="ghost" asChild className="-ml-4 text-muted-foreground hover:text-foreground">
          <Link href="/shop">
            <ChevronLeft className="mr-2 h-4 w-4" />
            กลับไปหน้าเลือกสินค้า/บริการ
          </Link>
        </Button>
      </div>
      
      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="font-headline text-2xl">รายการในตะกร้า ({cartCount})</CardTitle>
            </CardHeader>
            <CardContent className="divide-y p-0 sm:p-6">
              {cartItems.map((cartItem) => {
                const { id, type, item, quantity } = cartItem;
                const isPackage = type === 'PACKAGE';
                const isService = type === 'SERVICE';
                
                const product = type === 'PRODUCT' ? item as Product : null;
                const pkg = isPackage ? item as ProductPackage : null;
                const service = isService ? item as Service : null;

                const name = item.name;
                const imageUrl = item.imageUrls?.[0];
                
                let pricePerItem = 0;
                if (type === 'PRODUCT') {
                    // Use lot price if available (lot-based pricing)
                    if (cartItem.lotPrice != null) {
                        pricePerItem = cartItem.lotPrice;
                    } else {
                        pricePerItem = getPriceForQuantity(product!, quantity);
                    }
                } else if (isPackage) {
                    pricePerItem = pkg!.price;
                } else {
                    pricePerItem = service!.price;
                }

                const isDiscounted = type === 'PRODUCT' && cartItem.lotPrice == null && pricePerItem < product!.price;
                
                let maxQuantity = Infinity;
                if (product && product.trackInventory) {
                  // Use lot-specific max if available, otherwise total stock
                  maxQuantity = cartItem.maxLotQuantity 
                    ?? (product.inventoryLots || []).reduce((sum, lot) => sum + lot.quantity, 0);
                }

                return (
                <div key={id} className="flex gap-3 sm:gap-4 py-4 px-4 sm:px-0">
                  <div className="aspect-square w-[80px] sm:w-[100px] shrink-0 bg-muted rounded-md overflow-hidden relative">
                    {imageUrl ? (
                      <Image
                        src={imageUrl}
                        alt={name}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <ImagePlaceholder />
                    )}
                  </div>

                  <div className="flex-grow flex flex-col justify-between min-w-0">
                    <div className="space-y-1">
                      <div className="flex justify-between items-start gap-2">
                        <h3 className="font-semibold text-sm sm:text-base line-clamp-2 flex-1">
                          {isPackage && <Package className="h-4 w-4 inline mr-1 text-muted-foreground" />}
                          {isService && <Briefcase className="h-4 w-4 inline mr-1 text-primary" />}
                          {name}
                        </h3>
                        <p className="font-bold text-sm sm:text-base whitespace-nowrap">
                          ฿{(pricePerItem * quantity).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      
                      <div className="text-[10px] sm:text-xs text-muted-foreground">
                        {type === 'PRODUCT' && product!.attributes && Object.keys(product!.attributes).length > 0 && (
                            <p className="line-clamp-1">
                                {Object.entries(product!.attributes).map(([key, value]) => `${key}: ${value}`).join(' / ')}
                            </p>
                        )}
                        {isService && <p className="text-primary font-medium">รายการนี้ไม่ต้องมีการจัดส่ง</p>}
                        <p>ราคา: ฿{pricePerItem.toLocaleString('th-TH', { minimumFractionDigits: 2 })} {isPackage ? '/แพ็กเกจ' : isService ? '/บริการ' : '/หน่วย'}</p>
                        {isDiscounted && <Badge variant="secondary" className="mt-1 text-[9px] h-4">ราคาขั้นบันได</Badge>}
                        {cartItem.lotLabel && <Badge variant="outline" className="mt-1 text-[9px] h-4">📦 {cartItem.lotLabel}</Badge>}
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-1">
                        <Button 
                          variant="outline" 
                          size="icon" 
                          className="h-7 w-7 sm:h-8 sm:w-8" 
                          onClick={() => updateQuantity(id, quantity - 1)}
                        >
                          <Minus className="h-3 w-3 sm:h-4 w-4" />
                        </Button>
                        <Input
                          type="text"
                          inputMode="numeric"
                          value={quantity}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
                            const newQty = Math.max(1, parseInt(val) || 1);
                            updateQuantity(id, newQty > maxQuantity ? maxQuantity : newQty);
                          }}
                          className="w-10 sm:w-14 h-7 sm:h-8 text-center text-xs p-0 px-1"
                        />
                        <Button 
                          variant="outline" 
                          size="icon" 
                          className="h-7 w-7 sm:h-8 sm:w-8" 
                          onClick={() => updateQuantity(id, quantity + 1)} 
                          disabled={quantity >= maxQuantity}
                        >
                          <Plus className="h-3 w-3 sm:h-4 w-4" />
                        </Button>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-muted-foreground hover:text-destructive" 
                        onClick={() => removeFromCart(id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )})}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="sticky top-24">
            <CardHeader>
              <CardTitle className="font-headline">สรุปรายการสั่งซื้อ</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">ยอดรวม</span>
                <span className="font-medium">฿{cartTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">ค่าจัดส่ง</span>
                {isSettingsLoading ? (
                  <Skeleton className="h-5 w-16" />
                ) : (
                  <span className="font-medium">฿{shippingCost.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                )}
              </div>
              <Separator />
              <div className="flex justify-between items-baseline">
                <span className="font-bold text-lg">ยอดสุทธิ</span>
                <div className="text-right">
                  {isSettingsLoading ? (
                    <Skeleton className="h-8 w-24" />
                  ) : (
                    <p className="text-xl font-bold text-primary">
                      ฿{(cartTotal + shippingCost).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button className="w-full h-12 text-base font-semibold" size="lg" onClick={() => router.push('/checkout')} disabled={isSettingsLoading}>
                {isSettingsLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                ไปยังหน้าชำระเงิน
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function CartPage() {
  const { user, loading, impersonatedUser } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!user || (user.role !== 'seller' && !impersonatedUser))) {
      router.replace('/login');
    }
  }, [user, loading, router, impersonatedUser]);

  if (loading || !user || (user.role !== 'seller' && !impersonatedUser)) {
    return <div className="h-screen w-screen flex items-center justify-center bg-background"><div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div></div>;
  }

  return (
    <div className="min-h-screen bg-background pb-12">
      <ImpersonationBanner />
      <Header />
      <main className="py-8">
        <CartPageContents />
      </main>
    </div>
  );
}
