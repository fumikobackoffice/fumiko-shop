'use client';
import { ProductGroup, ProductVariant, ProductPackage, Product, Service } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Image from "next/image";
import { useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useMemo, useState, useEffect } from "react";
import { PackageCard } from "@/components/shop/package-card";
import { ServiceCard } from "@/components/shop/service-card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCart } from "@/hooks/use-cart";
import { useToast } from "@/hooks/use-toast";
import { Minus, Plus, ShoppingCart, Search as SearchIcon, X, LayoutGrid, Package, Briefcase, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PriceTierInfo } from "@/components/shop/price-tier-info";
import { ImagePlaceholder } from "@/components/shared/image-placeholder";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";
import { useAuth } from "@/hooks/use-auth";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/shared/app-sidebar";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { UserNav } from "@/components/shared/user-nav";
import { CartBadge } from "@/components/shared/cart-badge";
import { ImpersonationBanner } from "@/components/shared/impersonation-banner";

function ProductGroupCard({ productGroup, variants: allVariants }: { productGroup: ProductGroup, variants: ProductVariant[] }) {
  const { cartItems, addToCart } = useCart();
  const { toast } = useToast();
  
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);
  const [api, setApi] = useState<CarouselApi>()

  const hasOptions = productGroup.options && productGroup.options.length > 0;

  useEffect(() => {
    if (hasOptions && allVariants?.length > 0) {
      const defaultOptions: Record<string, string> = {};
      productGroup.options.forEach(option => {
        if (option.values.length > 0) {
          defaultOptions[option.name] = option.values[0];
        }
      });
      setSelectedOptions(defaultOptions);
    }
  }, [productGroup, allVariants, hasOptions]);

  const selectedVariant = useMemo(() => {
    if (!allVariants || allVariants.length === 0) return null;
    if (!hasOptions) return allVariants[0];
    
    if (Object.keys(selectedOptions).length < productGroup.options.length) return null;

    return allVariants.find(variant => 
      Object.entries(selectedOptions).every(([key, value]) => variant.attributes[key] === value)
    );
  }, [allVariants, selectedOptions, hasOptions, productGroup]);
  
  useEffect(() => {
    if (api) {
      api.scrollTo(0);
    }
  }, [selectedVariant, api]);

  const displayImages = useMemo(() => {
    if (!allVariants || allVariants.length === 0) return [];
    
    const urls = new Set<string>();

    if (selectedVariant && selectedVariant.imageUrls && selectedVariant.imageUrls.length > 0) {
      selectedVariant.imageUrls.forEach(url => urls.add(url));
    }

    allVariants.forEach(variant => {
      if (variant.imageUrls) {
        variant.imageUrls.forEach(url => urls.add(url));
      }
    });

    return Array.from(urls);
  }, [allVariants, selectedVariant]);

  const validPriceTiers = useMemo(() => {
    if (!selectedVariant || !selectedVariant.priceTiers) return [];
    return (selectedVariant.priceTiers)
      .filter(tier => tier.minQuantity != null && tier.price != null)
      .sort((a, b) => (a.minQuantity || 0) - (b.minQuantity || 0));
  }, [selectedVariant]);

  const productForCart: Product | null = useMemo(() => {
    if (selectedVariant && productGroup) {
      return {
        ...selectedVariant,
        name: productGroup.name,
        description: productGroup.description,
        category: productGroup.category,
        brand: productGroup.brand,
        unit: productGroup.unit,
        priceType: (productGroup as any).priceType || 'fixed',
        status: productGroup.status,
        sellerId: productGroup.sellerId,
        id: selectedVariant.id 
      };
    }
    return null;
  }, [selectedVariant, productGroup]);

  const displayPrice = selectedVariant?.price ?? allVariants?.[0]?.price;
  const displayCompareAtPrice = selectedVariant?.compareAtPrice ?? allVariants?.[0]?.compareAtPrice;
  const isSale = displayPrice !== undefined && displayCompareAtPrice && displayCompareAtPrice > displayPrice;
  
  const totalStock = useMemo(() => {
    if (!selectedVariant) return 0;
    return (selectedVariant.inventoryLots || []).reduce((sum, lot) => sum + lot.quantity, 0);
  }, [selectedVariant]);
  
  const quantityInCart = useMemo(() => {
    if (!selectedVariant) return 0;
    const itemInCart = cartItems.find(item => item.id === selectedVariant.id);
    return itemInCart?.quantity ?? 0;
  }, [cartItems, selectedVariant]);

  const availableStock = useMemo(() => {
      if (!selectedVariant || !selectedVariant.trackInventory) return Infinity;
      return totalStock - quantityInCart;
  }, [totalStock, quantityInCart, selectedVariant]);
  
  useEffect(() => {
    if (quantity > availableStock && availableStock > 0) {
        setQuantity(availableStock);
    }
  }, [availableStock, quantity]);

  const isOutOfStock = !!(selectedVariant && selectedVariant.trackInventory && totalStock <= 0);
  const canAddToCart = !!productForCart && availableStock > 0;
  
  const handleAddToCart = () => {
    if (!productForCart) return;

    if (quantity > availableStock) {
      toast({
        variant: 'destructive',
        title: 'สินค้าไม่เพียงพอ',
        description: `คุณสามารถเพิ่ม ${productForCart.name} ได้อีก ${availableStock} ชิ้น`,
      });
      setQuantity(availableStock > 0 ? availableStock : 1);
      return;
    }

    addToCart(productForCart, quantity);
  };

  const adjustQuantity = (amount: number) => {
    setQuantity(prev => {
      const newQuantity = prev + amount;
      if (newQuantity < 1) return 1;
      if (availableStock !== Infinity && newQuantity > availableStock) return availableStock;
      return newQuantity;
    });
  };

  let stockMessage;
  if (selectedVariant) {
    if (isOutOfStock) {
      stockMessage = <span className="text-destructive font-medium">สินค้าหมด</span>;
    } else if (selectedVariant.trackInventory) {
      if (quantityInCart > 0) {
        stockMessage = `มีสินค้า ${totalStock} ชิ้น (ในตะกร้า ${quantityInCart} ชิ้น)`;
      } else {
        stockMessage = `มีสินค้า ${totalStock} ชิ้น`;
      }
    } else {
      stockMessage = 'มีสินค้า';
    }
  }

  const taxLabel = useMemo(() => {
    if (!selectedVariant) return null;
    if (selectedVariant.taxStatus === 'EXEMPT') return "ไม่มี VAT";
    return `${selectedVariant.taxMode === 'INCLUSIVE' ? 'รวม' : 'แยก'} VAT ${selectedVariant.taxRate}%`;
  }, [selectedVariant]);
  
  return (
    <Card className={cn(
      "overflow-hidden flex flex-col group transition-all duration-300 bg-card text-card-foreground",
      isOutOfStock ? "opacity-85 grayscale-[0.3]" : "hover:shadow-xl hover:-translate-y-1"
    )}>
      <CardHeader className="p-0">
        <Carousel className="w-full relative" setApi={setApi}>
            <CarouselContent>
                {displayImages.length > 0 ? (
                    displayImages.map((url, index) => (
                        <CarouselItem key={index}>
                           <div className="overflow-hidden aspect-square relative bg-muted">
                            {isSale && (
                                <Badge variant="destructive" className="absolute top-2 right-2 z-10 text-[10px] h-5 px-1.5">ลดราคา</Badge>
                            )}
                            {productGroup.status === 'draft' && (
                                <Badge variant="outline" className="absolute top-2 left-2 z-10 text-[10px] h-5 px-1.5 bg-background/80">ฉบับร่าง</Badge>
                            )}
                            {isOutOfStock && (
                              <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-20">
                                  <Badge variant="secondary" className="bg-white/90 text-destructive font-bold px-3 py-1 shadow-lg">
                                      <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
                                      สินค้าหมด
                                  </Badge>
                              </div>
                            )}
                            <Image
                                src={url}
                                alt={`${productGroup.name} image ${index + 1}`}
                                fill
                                className="object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                           </div>
                        </CarouselItem>
                    ))
                ) : (
                    <CarouselItem>
                         <div className="overflow-hidden aspect-square relative bg-muted">
                          {isOutOfStock && (
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-20">
                                <Badge variant="secondary" className="bg-white/90 text-destructive font-bold px-3 py-1 shadow-lg">
                                    <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
                                    สินค้าหมด
                                </Badge>
                            </div>
                          )}
                          <ImagePlaceholder className="group-hover:scale-105 transition-transform duration-300" />
                         </div>
                    </CarouselItem>
                )}
            </CarouselContent>
            <CarouselPrevious className="!absolute left-2 top-1/2 -translate-y-1/2 z-10 bg-black/30 text-white hover:bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity disabled:hidden h-6 w-6" />
            <CarouselNext className="!absolute right-2 top-1/2 -translate-y-1/2 z-10 bg-black/30 text-white hover:bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity disabled:hidden h-6 w-6" />
        </Carousel>
      </CardHeader>
      <CardContent className="p-3 sm:p-4 flex-grow flex flex-col">
        <CardTitle className="font-headline text-sm sm:text-base mb-1 line-clamp-1">
           {productGroup.name}
        </CardTitle>
        
        {productGroup.description && (
          <p className="text-[10px] sm:text-xs text-muted-foreground line-clamp-2 mb-2 min-h-[2.5rem]">{productGroup.description}</p>
        )}

        {displayPrice !== undefined ? (
            <div className="flex flex-col mb-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                <div className="flex items-baseline gap-1.5">
                  <p className="text-base sm:text-lg font-bold text-primary">
                      ฿{displayPrice.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  {isSale && (
                      <p className="text-[10px] sm:text-xs text-muted-foreground line-through">
                          ฿{displayCompareAtPrice?.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                  )}
                </div>
                {validPriceTiers.length > 0 && selectedVariant && (
                  <PriceTierInfo tiers={validPriceTiers} basePrice={selectedVariant.price} unit={productGroup.unit} />
                )}
              </div>
              {taxLabel && (
                <p className="text-[9px] text-muted-foreground font-medium mt-0.5">{taxLabel}</p>
              )}
            </div>
         ) : (
            <Skeleton className="h-6 w-1/3 mb-3" />
         )}

        <div className="flex-grow" />

        <div className="space-y-3">
          {productGroup.options?.map((option) => (
            <div key={option.name}>
              <p className="text-[9px] sm:text-[10px] font-medium text-muted-foreground mb-1">{option.name}</p>
              <div className="flex flex-wrap gap-1">
                {option.values.map(value => (
                  <Button 
                    key={value}
                    variant={selectedOptions[option.name] === value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedOptions(prev => ({...prev, [option.name]: value}))}
                    className="text-[9px] h-6 px-1.5"
                  >
                    {value}
                  </Button>
                ))}
              </div>
            </div>
          ))}
          {selectedVariant && (
            <p className="text-[9px] sm:text-[10px] text-muted-foreground h-4">
              {stockMessage}
            </p>
          )}
          <div className="flex items-center gap-1.5">
              <Button variant="outline" size="icon" className="h-7 w-7 sm:h-8 sm:w-8" onClick={() => adjustQuantity(-1)} disabled={quantity <= 1 || isOutOfStock}>
                  <Minus className="h-3 w-3" />
              </Button>
              <Input
                  type="text"
                  inputMode="numeric"
                  value={quantity === 0 ? '' : quantity}
                  onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
                      const num = val === '' ? 0 : parseInt(val, 10);
                      if (availableStock !== Infinity && num > availableStock) {
                          setQuantity(availableStock);
                      } else {
                          setQuantity(num);
                      }
                  }}
                  onBlur={() => {
                      if (quantity < 1 && availableStock > 0) setQuantity(1);
                  }}
                  className="w-12 sm:w-16 h-7 sm:h-8 text-center text-xs sm:text-sm"
                  disabled={availableStock === 0 || isOutOfStock}
              />
              <Button variant="outline" size="icon" className="h-7 w-7 sm:h-8 sm:w-8" onClick={() => adjustQuantity(1)} disabled={quantity >= availableStock || availableStock === 0 || isOutOfStock}>
                  <Plus className="h-3 w-3" />
              </Button>
          </div>
          <Button className="w-full h-8 sm:h-9 text-xs sm:text-sm" onClick={handleAddToCart} disabled={!canAddToCart || isOutOfStock}>
              {!productForCart ? 'เลือกตัวเลือก' : isOutOfStock ? 'สินค้าหมด' : 'เพิ่มลงตะกร้า'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}


function ProductGridSkeleton() {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
            {Array.from({ length: 10 }).map((_, i) => (
                <Card key={i}>
                    <Skeleton className="w-full aspect-square" />
                    <CardContent className="p-4 space-y-3">
                        <Skeleton className="h-5 w-3/4" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-2/3" />
                        <Skeleton className="h-7 w-1/3 pt-2" />
                         <div className="space-y-4 pt-4">
                           <div className="flex gap-2">
                             <Skeleton className="h-8 w-12" />
                             <Skeleton className="h-8 w-12" />
                           </div>
                           <Skeleton className="h-10 w-full" />
                           <Skeleton className="h-12 w-full" />
                         </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    )
}

function ShopPageContents() {
    const firestore = useFirestore();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, impersonatedUser } = useAuth();
    
    const [sortOrder, setSortOrder] = useState('name-asc');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [typeFilter, setTypeFilter] = useState('all');
    const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || '');

    useEffect(() => {
      const q = searchParams.get('q');
      if (q !== null) {
        setSearchTerm(q);
      }
    }, [searchParams]);
    
    const allowedStatuses = useMemo(() => {
        return impersonatedUser && (user?.role === 'admin' || user?.role === 'super_admin')
            ? ['active', 'draft']
            : ['active'];
    }, [user, impersonatedUser]);

    const productGroupsQuery = useMemoFirebase(() => 
        query(collection(firestore, 'productGroups'), where('status', 'in', allowedStatuses)), 
        [firestore, allowedStatuses]
    );
    const { data: productGroups, isLoading: areGroupsLoading } = useCollection<ProductGroup>(productGroupsQuery);

    const packagesQuery = useMemoFirebase(() => 
        query(collection(firestore, 'productPackages'), where('status', 'in', allowedStatuses)), 
        [firestore, allowedStatuses]
    );
    const { data: packages, isLoading: arePackagesLoading } = useCollection<ProductPackage>(packagesQuery);

    const servicesQuery = useMemoFirebase(() => 
        query(collection(firestore, 'services'), where('status', 'in', allowedStatuses)), 
        [firestore, allowedStatuses]
    );
    const { data: services, isLoading: areServicesLoading } = useCollection<Service>(servicesQuery);
    
    const [variantsByGroup, setVariantsByGroup] = useState<Record<string, ProductVariant[]>>({});
    const [areVariantsLoading, setAreVariantsLoading] = useState(true);

    useEffect(() => {
        if (areGroupsLoading || !productGroups || !firestore) {
          if (!productGroups) setAreVariantsLoading(true);
          return;
        }
      
        let isMounted = true;
        const fetchAllVariants = async () => {
          setAreVariantsLoading(true);
          const variantsData: Record<string, ProductVariant[]> = {};
          try {
            await Promise.all(productGroups.map(async (group) => {
              const variantsRef = collection(firestore, 'productGroups', group.id, 'productVariants');
              const variantsSnapshot = await getDocs(variantsRef);
              variantsData[group.id] = variantsSnapshot.docs
                .map(doc => ({ ...doc.data(), id: doc.id }) as ProductVariant)
                .filter(v => v.status !== 'archived');
            }));
      
            if (isMounted) {
              setVariantsByGroup(variantsData);
            }
          } catch (error) {
            console.error("Error fetching all variants:", error);
          } finally {
            if (isMounted) {
              setAreVariantsLoading(false);
            }
          }
        };
      
        fetchAllVariants();
      
        return () => {
          isMounted = false;
        };
      }, [productGroups, firestore, areGroupsLoading]);


    const categories = useMemo(() => {
      if (!productGroups && !services) return [];
      const pCats = (productGroups || []).map(p => p.category);
      const sCats = (services || []).map(s => s.category);
      return ['all', ...Array.from(new Set([...pCats, ...sCats]))].filter(Boolean);
    }, [productGroups, services]);
    
    const sortedAndFilteredItems = useMemo(() => {
        if (areGroupsLoading || arePackagesLoading || areVariantsLoading || areServicesLoading) return [];
        
        let allItems: ( (ProductGroup & {itemType: 'group'}) | (ProductPackage & {itemType: 'package'}) | (Service & {itemType: 'service'}) )[] = [
          ...(productGroups || []).map(item => ({ ...item, itemType: 'group' as const })),
          ...(packages || []).map(item => ({ ...item, itemType: 'package' as const })),
          ...(services || []).map(item => ({ ...item, itemType: 'service' as const })),
        ];

        if (typeFilter === 'products') {
            allItems = allItems.filter(i => i.itemType === 'group' || i.itemType === 'package');
        } else if (typeFilter === 'services') {
            allItems = allItems.filter(i => i.itemType === 'service');
        }

        if (searchTerm.trim()) {
          const s = searchTerm.toLowerCase().trim();
          allItems = allItems.filter(item => {
            const nameMatch = item.name.toLowerCase().includes(s);
            const descMatch = item.description?.toLowerCase().includes(s);
            let variantMatch = false;
            if (item.itemType === 'group' && variantsByGroup[item.id]) {
              variantMatch = variantsByGroup[item.id].some(v => 
                v.sku.toLowerCase().includes(s) || 
                Object.values(v.attributes).some(val => val.toLowerCase().includes(s))
              );
            } else if (item.itemType === 'package' || item.itemType === 'service') {
              variantMatch = item.sku?.toLowerCase().includes(s) || false;
            }
            return nameMatch || descMatch || variantMatch;
          });
        }

        if (selectedCategory !== 'all') {
          allItems = allItems.filter(item => {
            return (item.itemType === 'group' || item.itemType === 'service') && item.category === selectedCategory;
          });
        }
        
        switch (sortOrder) {
          case 'name-asc':
            allItems.sort((a, b) => a.name.localeCompare(b.name, 'th'));
            break;
          case 'latest':
          default:
            allItems.sort((a, b) => {
              const dateA = a.createdAt?.toDate() || new Date(0);
              const dateB = b.createdAt?.toDate() || new Date(0);
              return dateB.getTime() - dateA.getTime();
            });
            break;
        }

        return allItems;
    }, [productGroups, packages, services, sortOrder, selectedCategory, typeFilter, searchTerm, variantsByGroup, areGroupsLoading, arePackagesLoading, areVariantsLoading, areServicesLoading]);


    const isLoading = areGroupsLoading || arePackagesLoading || areVariantsLoading || areServicesLoading;

    const handleSearchSubmit = (e: React.FormEvent) => {
      e.preventDefault();
    };

    const isPackageOutOfStock = (pkg: ProductPackage) => {
      return pkg.items.some(item => {
        const variants = variantsByGroup[item.productGroupId];
        const variant = variants?.find(v => v.id === item.productVariantId);
        if (!variant) return true;
        if (!variant.trackInventory) return false;
        const stock = (variant.inventoryLots || []).reduce((sum, lot) => sum + lot.quantity, 0);
        return stock < item.quantity;
      });
    };

    const isSellerView = user?.role === 'seller' || impersonatedUser;

    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <ImpersonationBanner />
          <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex h-16 items-center px-4 gap-4">
              {!isSellerView && <SidebarTrigger className="md:hidden" />}
              <form onSubmit={handleSearchSubmit} className="flex-1 max-w-md relative">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="ค้นหาชื่อสินค้า, รหัสสินค้า หรือคุณสมบัติ..."
                  className="pl-9 bg-muted/30 border-muted-foreground/20 rounded-full h-10 focus-visible:ring-primary/20"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </form>
              <div className="flex items-center gap-2 ml-auto">
                <ThemeToggle />
                <CartBadge />
                <UserNav />
              </div>
            </div>
          </header>

          <main className="p-4 sm:p-6 lg:p-8 bg-muted/10 min-h-[calc(100vh-64px)]">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-6">
                <div className="text-left flex-grow">
                    <h1 className="text-2xl sm:text-3xl font-headline font-bold">
                      {searchTerm ? `ผลการค้นหาสำหรับ "${searchTerm}"` : 'หน้าร้านค้าสั่งซื้อ'}
                    </h1>
                    {searchTerm && (
                      <Button 
                        variant="link" 
                        onClick={() => setSearchTerm('')}
                        className="p-0 h-auto mt-1 text-muted-foreground text-xs"
                      >
                        <X className="mr-1 h-3 w-3" /> ล้างการค้นหา
                      </Button>
                    )}
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
                  <Tabs value={typeFilter} onValueChange={setTypeFilter} className="w-full sm:w-auto">
                      <TabsList className="grid grid-cols-3 w-full sm:w-[280px]">
                        <TabsTrigger value="all" className="text-xs">ทั้งหมด</TabsTrigger>
                        <TabsTrigger value="products" className="text-xs">สินค้า</TabsTrigger>
                        <TabsTrigger value="services" className="text-xs">บริการ</TabsTrigger>
                      </TabsList>
                  </Tabs>
                  <div className="flex items-center gap-2">
                      <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                        <SelectTrigger className="flex-1 sm:w-[150px] h-9 text-xs">
                            <SelectValue placeholder="หมวดหมู่" />
                        </SelectTrigger>
                        <SelectContent>
                            {categories.map(cat => (
                                <SelectItem key={cat} value={cat}>{cat === 'all' ? 'ทุกหมวดหมู่' : cat}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <Select value={sortOrder} onValueChange={setSortOrder}>
                        <SelectTrigger className="flex-1 sm:w-[130px] h-9 text-xs">
                            <SelectValue placeholder="เรียงตาม" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="latest">ล่าสุด</SelectItem>
                            <SelectItem value="name-asc">ชื่อ (ก-ฮ)</SelectItem>
                        </SelectContent>
                      </Select>
                  </div>
                </div>
            </div>

            {isLoading ? (
                <ProductGridSkeleton />
            ) : sortedAndFilteredItems.length === 0 ? (
                <div className="text-center py-20 bg-card rounded-xl border-2 border-dashed">
                    <SearchIcon className="mx-auto h-12 w-12 text-muted-foreground opacity-20 mb-4" />
                    <h2 className="text-xl font-semibold mb-2">ไม่พบรายการที่ตรงกัน</h2>
                    <p className="text-sm text-muted-foreground mb-6">ลองเปลี่ยนคำค้นหา หรือใช้ตัวกรองหมวดหมู่แทน</p>
                    <Button variant="outline" onClick={() => { setSearchTerm(''); setSelectedCategory('all'); setTypeFilter('all'); }}>
                      แสดงรายการทั้งหมด
                    </Button>
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
                    {sortedAndFilteredItems.map((item) => {
                        if (item.itemType === 'group') {
                            return <ProductGroupCard key={`group-${item.id}`} productGroup={item} variants={variantsByGroup[item.id]} />;
                        }
                        if (item.itemType === 'package') {
                            return <PackageCard key={`package-${item.id}`} productPackage={item} isOutOfStock={isPackageOutOfStock(item)} />;
                        }
                        if (item.itemType === 'service') {
                            return <ServiceCard key={`service-${item.id}`} service={item} />;
                        }
                        return null;
                    })}
                </div>
            )}
          </main>
        </SidebarInset>
      </SidebarProvider>
    )
}


export default function ShopPage() {
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
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  return <ShopPageContents />;
}
