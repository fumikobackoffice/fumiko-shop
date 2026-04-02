
'use client';

import { Header } from '@/components/shared/header';
import Image from 'next/image';
import { notFound, useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useEffect, useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { AddToCartButton } from '@/components/shop/add-to-cart-button';
import { collection, doc, query, where } from 'firebase/firestore';
import { useDoc, useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { ProductGroup, ProductVariant, Product as ProductType } from '@/lib/types';
import { getDisplayPrice } from '@/lib/lot-pricing';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { ImagePlaceholder } from '@/components/shared/image-placeholder';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

function ProductPageSkeleton() {
  return (
    <div className="py-12 px-4 sm:px-6 lg:px-8">
       <div className="grid md:grid-cols-2 gap-12 items-start max-w-7xl mx-auto">
          <Skeleton className="w-full aspect-square rounded-lg" />
          <div className="space-y-6">
            <Skeleton className="h-12 w-3/4" />
            <Skeleton className="h-10 w-1/4" />
            <Skeleton className="h-5 w-full" />
            <div className="space-y-4 pt-4">
                <Skeleton className="h-6 w-16" />
                <div className="flex gap-2">
                    <Skeleton className="h-10 w-20" />
                    <Skeleton className="h-10 w-20" />
                    <Skeleton className="h-10 w-20" />
                </div>
            </div>
            <div className="flex items-center gap-4 pt-4">
              <Skeleton className="h-12 w-48" />
            </div>
          </div>
        </div>
    </div>
  )
}

function ProductDetails() {
  const params = useParams();
  const firestore = useFirestore();
  const groupId = params.id as string;

  const groupRef = useMemoFirebase(() => doc(firestore, 'productGroups', groupId), [firestore, groupId]);
  const { data: productGroup, isLoading: isGroupLoading } = useDoc<ProductGroup>(groupRef);

  const variantsRef = useMemoFirebase(() => {
    if (!firestore || !groupId) return null;
    // CRITICAL: Ensure archived variants are not fetched
    return query(collection(firestore, 'productGroups', groupId, 'productVariants'), where('status', '!=', 'archived'));
  }, [firestore, groupId]);
  const { data: variants, isLoading: areVariantsLoading } = useCollection<ProductVariant>(variantsRef);

  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});

  // Set default options on load
  useEffect(() => {
    if (productGroup && productGroup.options.length > 0 && variants && variants.length > 0) {
      const defaultOptions: Record<string, string> = {};
      productGroup.options.forEach(option => {
        const firstVariantValue = variants[0].attributes[option.name];
        if (firstVariantValue) {
           defaultOptions[option.name] = firstVariantValue;
        } else if (option.values.length > 0) {
          defaultOptions[option.name] = option.values[0];
        }
      });
      setSelectedOptions(defaultOptions);
    }
  }, [productGroup, variants]);
  
  const selectedVariant = useMemo(() => {
    if (!variants) return null;
    if (variants.length === 1 && Object.keys(variants[0].attributes).length === 0) {
        return variants[0];
    }
    if (Object.keys(selectedOptions).length === 0) return null;
    return variants.find(variant => 
      Object.entries(selectedOptions).every(([key, value]) => variant.attributes[key] === value)
    );
  }, [variants, selectedOptions]);

  const handleOptionSelect = (optionName: string, value: string) => {
    setSelectedOptions(prev => ({ ...prev, [optionName]: value }));
  };

  const isLoading = isGroupLoading || areVariantsLoading;

  if (isLoading) {
    return <ProductPageSkeleton />;
  }
  
  if (!productGroup) {
    notFound();
  }

  // This is the fully resolved product object to be used for cart operations
  const productForCart: ProductType | null = useMemo(() => {
    if (selectedVariant && productGroup) {
      return {
        ...selectedVariant,
        name: productGroup.name,
        description: productGroup.description,
        category: productGroup.category,
        brand: productGroup.brand,
        unit: productGroup.unit,
        priceType: productGroup.priceType,
        status: productGroup.status,
        sellerId: productGroup.sellerId,
        id: selectedVariant.id 
      };
    }
    return null;
  }, [selectedVariant, productGroup]);
  
  const displayImages = useMemo(() => {
    if (!variants) return [];
    const allImageUrls = new Set<string>();
    
    const orderedVariants = selectedVariant 
      ? [selectedVariant, ...variants.filter(v => v.id !== selectedVariant.id)]
      : variants;

    orderedVariants.forEach(variant => {
      if (variant.imageUrls) {
        variant.imageUrls.forEach(url => allImageUrls.add(url));
      }
    });
    
    return Array.from(allImageUrls);
  }, [variants, selectedVariant]);


  const displayPrice = selectedVariant ? getDisplayPrice(selectedVariant) : (variants?.[0] ? getDisplayPrice(variants[0]) : 0);
  const displayCompareAtPrice = selectedVariant?.compareAtPrice ?? (variants?.[0]?.compareAtPrice);
  const isSale = !!(displayCompareAtPrice && displayCompareAtPrice > displayPrice);
  
  const totalStock = useMemo(() => {
    if (!selectedVariant) return 0;
    return (selectedVariant.inventoryLots || []).reduce((sum, lot) => sum + lot.quantity, 0);
  }, [selectedVariant]);

  const isOutOfStock = !!(selectedVariant && selectedVariant.trackInventory && totalStock <= 0);
  
  const validPriceTiers = useMemo(() => {
    return (selectedVariant?.priceTiers || [])
      .filter(tier => tier.minQuantity != null && tier.price != null)
      .sort((a, b) => a.minQuantity - b.minQuantity);
  }, [selectedVariant]);


  return (
      <main className="py-12 px-4 sm:px-6 lg:px-8">
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
                        {isSale && (
                          <Badge variant="destructive" className="absolute top-4 right-4 z-10">ลดราคา</Badge>
                        )}
                        {isOutOfStock && (
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-20">
                              <Badge variant="secondary" className="bg-white/90 text-destructive font-bold px-4 py-2 shadow-lg">
                                  <AlertTriangle className="mr-2 h-5 w-5" />
                                  สินค้าหมด
                              </Badge>
                          </div>
                        )}
                        <Image
                          src={url}
                          alt={`${productGroup.name} image ${index + 1}`}
                          fill
                          className="object-cover"
                        />
                      </div>
                    </CarouselItem>
                  ))
                ) : (
                  <CarouselItem>
                    <div className="w-full aspect-square relative overflow-hidden rounded-lg shadow-lg bg-muted">
                      {isSale && (
                          <Badge variant="destructive" className="absolute top-4 right-4 z-10">ลดราคา</Badge>
                      )}
                      {isOutOfStock && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-20">
                            <Badge variant="secondary" className="bg-white/90 text-destructive font-bold px-4 py-2 shadow-lg">
                                <AlertTriangle className="mr-2 h-5 w-5" />
                                สินค้าหมด
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
                <p className="text-sm font-medium text-muted-foreground">{productGroup.category}{productGroup.brand && ` • ${productGroup.brand}`}</p>
                <h1 className="text-4xl md:text-5xl font-headline font-bold">{productGroup.name}</h1>
            </div>
            
            <div className="flex items-baseline gap-3">
              <p className="text-3xl font-bold text-primary">฿{displayPrice.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / {productGroup.unit}</p>
              {isSale && (
                <p className="text-xl text-muted-foreground line-through">
                  ฿{displayCompareAtPrice?.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              )}
            </div>

            {isOutOfStock && (
                <Alert variant="destructive" className="bg-destructive/5 border-destructive/20 text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle className="font-bold">สินค้าหมด</AlertTitle>
                    <AlertDescription className="text-xs">
                        ขออภัย สินค้าตัวเลือกนี้หมดสต็อกชั่วคราว คุณยังสามารถเลือกตัวเลือกอื่นที่มีสินค้า หรือสอบถามแอดมินเพิ่มเติมได้ครับ
                    </AlertDescription>
                </Alert>
            )}

            {validPriceTiers.length > 0 && (
              <div className="p-4 bg-muted/50 rounded-lg">
                <h3 className="text-sm font-semibold text-foreground mb-2">ราคาขั้นบันได</h3>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {validPriceTiers.map(tier => (
                    <li key={tier.minQuantity} className="flex justify-between">
                      <span>ซื้อ {tier.minQuantity} ชิ้นขึ้นไป</span>
                      <span className="font-medium text-primary">ราคาชิ้นละ ฿{tier.price.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-muted-foreground leading-relaxed">{productGroup.description}</p>
            
            {productGroup.options && productGroup.options.length > 0 && <Separator />}
            
            <div className="space-y-4">
              {productGroup.options.map((option) => (
                <div key={option.name}>
                  <h3 className="text-sm font-medium text-muted-foreground">{option.name}</h3>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {option.values.map((value) => (
                       <Button 
                         key={value} 
                         variant={selectedOptions[option.name] === value ? 'default' : 'outline'}
                         onClick={() => handleOptionSelect(option.name, value)}
                       >
                         {value}
                       </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-4 pt-4">
              {productForCart ? (
                <AddToCartButton item={productForCart} quantity={1} showText={true} disabled={isOutOfStock} />
              ) : (
                <Button size="lg" disabled>กรุณาเลือกตัวเลือก</Button>
              )}
            </div>
             {selectedVariant && (
                <p className="text-sm text-muted-foreground">
                    {isOutOfStock ? <span className="text-destructive font-medium">สินค้าหมด</span> : selectedVariant.trackInventory ? `มีสินค้า ${totalStock} ชิ้น` : 'มีสินค้าพร้อมจำหน่าย'} (รหัสสินค้า: {selectedVariant.sku})
                </p>
            )}

            {productGroup.customFields && Object.keys(productGroup.customFields).length > 0 && (
              <>
                <Separator />
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold font-headline">ข้อมูลจำเพาะ</h3>
                  <ul className="space-y-2 text-sm">
                    {Object.entries(productGroup.customFields).map(([key, value]) => (
                      <li key={key} className="flex justify-between">
                        <span className="font-medium text-muted-foreground">{key}:</span>
                        <span className="text-right">{value}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
  )
}

export default function ProductPageClient() {
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
      <ProductDetails />
    </div>
  );
}
