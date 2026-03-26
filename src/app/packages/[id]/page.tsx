
'use client';

import { Header } from '@/components/shared/header';
import Image from 'next/image';
import { notFound, useParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useEffect, useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { doc, getDoc } from 'firebase/firestore';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { ProductPackage, ProductGroup, ProductVariant, Product as ProductType } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { AddToCartButton } from '@/components/shop/add-to-cart-button';
import Link from 'next/link';
import { ImagePlaceholder } from '@/components/shared/image-placeholder';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Info, Tag, CheckCircle2, TrendingDown, ChevronLeft, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

function PackagePageSkeleton() {
  return (
    <div className="py-12 px-4 sm:px-6 lg:px-8">
       <div className="grid md:grid-cols-2 gap-12 items-start max-w-7xl mx-auto">
          <Skeleton className="w-full aspect-square rounded-lg" />
          <div className="space-y-6">
            <Skeleton className="h-12 w-3/4" />
            <Skeleton className="h-10 w-1/4" />
            <Skeleton className="h-5 w-full" />
            <div className="space-y-4 pt-4">
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
            </div>
            <div className="flex items-center gap-4 pt-4">
              <Skeleton className="h-12 w-48" />
            </div>
          </div>
        </div>
    </div>
  )
}

function PackageDetails() {
  const params = useParams();
  const firestore = useFirestore();
  const packageId = params.id as string;

  const packageRef = useMemoFirebase(() => doc(firestore, 'productPackages', packageId), [firestore, packageId]);
  const { data: productPackage, isLoading: isPackageLoading } = useDoc<ProductPackage>(packageRef);

  const [includedItems, setIncludedItems] = useState<(ProductType & { quantity: number; currentStock: number; isAvailable: boolean })[]>([]);
  const [areItemsLoading, setAreItemsLoading] = useState(true);

  useEffect(() => {
    const fetchIncludedItems = async () => {
        if (!productPackage || !firestore) return;

        setAreItemsLoading(true);
        try {
            const itemPromises = productPackage.items.map(async (item) => {
                const groupRef = doc(firestore, 'productGroups', item.productGroupId);
                const variantRef = doc(firestore, 'productGroups', item.productGroupId, 'productVariants', item.productVariantId);
                
                const [groupSnap, variantSnap] = await Promise.all([getDoc(groupRef), getDoc(variantRef)]);

                if (groupSnap.exists() && variantSnap.exists()) {
                    const group = { id: groupSnap.id, ...groupSnap.data() } as ProductGroup;
                    const variant = { id: variantSnap.id, ...variantSnap.data() } as ProductVariant;
                    
                    const totalStock = (variant.inventoryLots || []).reduce((acc, lot) => acc + lot.quantity, 0);
                    const isAvailable = !variant.trackInventory || totalStock >= item.quantity;

                    const resolvedProduct: ProductType = {
                        ...variant,
                        name: group.name,
                        description: group.description,
                        category: group.category,
                        brand: group.brand,
                        unit: group.unit,
                        priceType: (group as any).priceType || 'fixed',
                        status: group.status,
                        sellerId: group.sellerId,
                    };
                    return { ...resolvedProduct, quantity: item.quantity, currentStock: totalStock, isAvailable };
                }
                return null;
            });

            const resolvedItems = (await Promise.all(itemPromises)).filter(Boolean) as (ProductType & { quantity: number; currentStock: number; isAvailable: boolean })[];
            setIncludedItems(resolvedItems);

        } catch (error) {
            console.error("Error fetching package items details: ", error);
        } finally {
            setAreItemsLoading(false);
        }
    };
    fetchIncludedItems();
  }, [productPackage, firestore]);
  
  const isPackageOutOfStock = useMemo(() => {
    if (areItemsLoading) return false;
    return includedItems.some(item => !item.isAvailable);
  }, [includedItems, areItemsLoading]);

  const dynamicTotalRetailPrice = useMemo(() => {
    return includedItems.reduce((total, item) => total + (item.price * item.quantity), 0);
  }, [includedItems]);

  const isLoading = isPackageLoading || areItemsLoading;

  if (isLoading) {
    return <PackagePageSkeleton />;
  }
  
  if (!productPackage) {
    notFound();
  }

  const displayImages = productPackage.imageUrls || [];
  const totalRetailPrice = dynamicTotalRetailPrice > 0 ? dynamicTotalRetailPrice : (productPackage.totalRetailPrice || 0);
  const savings = totalRetailPrice > productPackage.price ? totalRetailPrice - productPackage.price : 0;
  const savingsPercent = totalRetailPrice > 0 ? Math.round((savings / totalRetailPrice) * 100) : 0;

  return (
      <main className="py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto mb-6">
            <Button variant="ghost" asChild className="-ml-4 text-muted-foreground hover:text-foreground">
                <Link href="/shop">
                    <ChevronLeft className="mr-2 h-4 w-4" />
                    กลับไปหน้าเลือกซื้อสินค้า
                </Link>
            </Button>
        </div>

        <div className="grid md:grid-cols-2 gap-8 lg:gap-12 items-start max-w-7xl mx-auto">
          <div className="grid gap-4">
            <Carousel className="w-full">
                <CarouselContent>
                    {displayImages.length > 0 ? (
                        displayImages.map((url, index) => (
                            <CarouselItem key={index}>
                                <div className="w-full aspect-square relative overflow-hidden rounded-lg shadow-lg bg-muted">
                                    {isPackageOutOfStock && (
                                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-20">
                                          <Badge variant="secondary" className="bg-white/90 text-destructive font-bold px-4 py-2 shadow-lg">
                                              <AlertTriangle className="mr-2 h-5 w-5" />
                                              สินค้าไม่พอ
                                          </Badge>
                                      </div>
                                    )}
                                    <Image
                                        src={url}
                                        alt={`${productPackage.name} image ${index + 1}`}
                                        fill
                                        className="object-cover"
                                    />
                                </div>
                            </CarouselItem>
                        ))
                    ) : (
                        <CarouselItem>
                            <div className="w-full aspect-square relative overflow-hidden rounded-lg shadow-lg bg-muted">
                                {isPackageOutOfStock && (
                                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-20">
                                      <Badge variant="secondary" className="bg-white/90 text-destructive font-bold px-4 py-2 shadow-lg">
                                          <AlertTriangle className="mr-2 h-5 w-5" />
                                          สินค้าไม่พอ
                                      </Badge>
                                  </div>
                                )}
                                <ImagePlaceholder />
                            </div>
                        </CarouselItem>
                    )}
                </CarouselContent>
                <CarouselPrevious className="!absolute !left-2 top-1/2 -translate-y-1/2 z-10 bg-black/30 text-white hover:bg-black/50 disabled:hidden" />
                <CarouselNext className="!absolute !right-2 top-1/2 -translate-y-1/2 z-10 bg-black/30 text-white hover:bg-black/50 disabled:hidden" />
            </Carousel>
          </div>
          <div className="flex flex-col gap-6">
            <div className="space-y-2">
                <Badge variant="outline" className="text-primary border-primary/20 bg-primary/5 px-3 py-1 text-sm font-bold uppercase tracking-wider">แพ็กเกจสุดคุ้ม</Badge>
                <h1 className="text-4xl md:text-5xl font-headline font-bold">{productPackage.name}</h1>
            </div>
            
            <div className="flex items-baseline gap-4">
              <p className="text-4xl font-bold text-primary">฿{productPackage.price.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              {savings > 0 && (
                <p className="text-xl text-muted-foreground line-through decoration-destructive/50">
                  ฿{totalRetailPrice.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              )}
            </div>

            {isPackageOutOfStock && (
                <Alert variant="destructive" className="bg-destructive/5 border-destructive/20 text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle className="font-bold">สินค้าบางรายการหมด</AlertTitle>
                    <AlertDescription className="text-xs">
                        ขออภัย สินค้าบางรายการในแพ็กเกจนี้มีจำนวนไม่เพียงพอในคลังสินค้า ทำให้ไม่สามารถสั่งซื้อได้ในขณะนี้
                    </AlertDescription>
                </Alert>
            )}

            {!isPackageOutOfStock && savings > 0 && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-5 flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-full bg-green-600 flex items-center justify-center text-white shadow-inner">
                            <TrendingDown className="h-6 w-6" />
                        </div>
                        <div>
                            <p className="text-xs text-green-700 dark:text-green-400 font-bold uppercase tracking-tight">สรุปความประหยัด</p>
                            <p className="text-xl font-bold text-green-800 dark:text-green-300">
                                ประหยัดไปได้ถึง ฿{savings.toLocaleString()} {savingsPercent >= 5 && <span className="text-sm font-medium">({savingsPercent}%)</span>}
                            </p>
                        </div>
                    </div>
                    <div className="hidden sm:block">
                        <Badge className="bg-green-600 hover:bg-green-600 text-white animate-pulse px-3 py-1">คุ้มค่าที่สุด!</Badge>
                    </div>
                </div>
            )}

            <p className="text-muted-foreground leading-relaxed text-lg">{productPackage.description || 'ชุดสินค้าราคาพิเศษที่รวบรวมรายการยอดนิยมไว้ให้คุณในหนึ่งเดียว'}</p>
            
            <Separator />

            <div className="space-y-4">
                <h3 className="text-lg font-semibold font-headline flex items-center gap-2 text-foreground">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    รายการสินค้าที่ได้รับ
                </h3>
                <ul className="space-y-4">
                    {includedItems.map(item => {
                        const itemImageUrl = item.imageUrls?.[0];
                        return (
                            <li key={item.id}>
                                <div className={cn(
                                    "flex items-center gap-4 p-3 rounded-xl transition-all border",
                                    item.isAvailable ? "bg-muted/30 border-transparent" : "bg-destructive/5 border-destructive/20"
                                )}>
                                    <div className="h-16 w-16 shrink-0 bg-muted rounded-md relative overflow-hidden shadow-sm">
                                        {itemImageUrl ? (
                                            <Image src={itemImageUrl} alt={item.name} fill className="object-cover aspect-square" />
                                        ) : (
                                            <ImagePlaceholder />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold truncate">{item.name}</p>
                                        <p className="text-xs text-muted-foreground truncate">
                                            {Object.entries(item.attributes).map(([key, value]) => `${key}: ${value}`).join(' / ')}
                                        </p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <Badge variant="secondary" className="h-5 text-[10px] px-1.5 font-bold">x {item.quantity} {item.unit}</Badge>
                                            {!item.isAvailable && (
                                                <span className="text-[10px] text-destructive font-bold flex items-center gap-1">
                                                    <AlertTriangle className="h-3 w-3" /> ไม่พอ (มีเพียง {item.currentStock})
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </li>
                        )
                    })}
                </ul>
            </div>
            
            <Separator />

            <div className="flex flex-col sm:flex-row items-center gap-4 pt-2">
               <div className="w-full sm:w-auto">
                  <AddToCartButton 
                    item={productPackage} 
                    quantity={1} 
                    showText={true} 
                    disabled={isPackageOutOfStock} 
                  />
               </div>
               <div className="text-center sm:text-left">
                  <p className="text-xs text-muted-foreground font-mono">SKU: {productPackage.sku}</p>
                  <p className="text-xs text-muted-foreground">น้ำหนักรวม: {productPackage.weight?.toFixed(2) || '0.00'} kg</p>
               </div>
            </div>
          </div>
        </div>
      </main>
  )
}

export default function PackagePageClient() {
  const { user, loading, impersonatedUser } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.replace('/login');
      } else if (user.role !== 'seller' && !impersonatedUser) {
        router.replace('/dashboard');
      }
    }
  }, [user, loading, router, impersonatedUser]);

  if (loading || !user || (user.role !== 'seller' && !impersonatedUser)) {
    return <div className="h-screen w-screen flex items-center justify-center bg-background"><div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <PackageDetails />
    </div>
  );
}
