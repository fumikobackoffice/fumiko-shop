
'use client';

import { ProductPackage } from "@/lib/types";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Package, Tag, AlertTriangle } from "lucide-react";
import { ImagePlaceholder } from "../shared/image-placeholder";
import { Badge } from "../ui/badge";
import { cn } from "@/lib/utils";

export function PackageCard({ productPackage, isOutOfStock }: { productPackage: ProductPackage, isOutOfStock?: boolean }) {
  const displayImage = productPackage.imageUrls?.[0];
  const totalRetailPrice = productPackage.totalRetailPrice || 0;
  const savings = totalRetailPrice > productPackage.price ? totalRetailPrice - productPackage.price : 0;

  const taxLabel = productPackage.taxStatus === 'EXEMPT' 
    ? "ไม่มี VAT" 
    : `${productPackage.taxMode === 'EXCLUSIVE' ? 'แยก' : 'รวม'} VAT ${productPackage.taxRate ?? 7}%`;

  return (
    <Card className={cn(
        "overflow-hidden flex flex-col group transition-all duration-300 bg-card",
        isOutOfStock ? "opacity-85 grayscale-[0.3]" : "hover:shadow-xl hover:-translate-y-1"
    )}>
      <CardHeader className="p-0">
        <Link href={`/packages/${productPackage.id}`} className="block overflow-hidden aspect-square relative bg-muted">
           {displayImage ? (
              <Image
                src={displayImage}
                alt={productPackage.name}
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-300"
              />
           ) : (
            <ImagePlaceholder className="group-hover:scale-105 transition-transform duration-300" />
           )}
           
           {isOutOfStock ? (
             <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-20">
                <Badge variant="secondary" className="bg-white/90 text-destructive font-bold px-3 py-1 shadow-lg">
                    <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
                    สินค้าไม่พอ
                </Badge>
             </div>
           ) : savings > 0 && (
             <Badge className="absolute top-2 right-2 z-10 bg-green-600 hover:bg-green-600 text-white border-none text-[10px] h-5 px-1.5 shadow-md animate-in fade-in zoom-in duration-500">
               ประหยัด ฿{Math.floor(savings).toLocaleString()}
             </Badge>
           )}
        </Link>
      </CardHeader>
      <CardContent className="p-4 flex-grow">
        <CardTitle className="font-headline text-lg mb-2">
          <Link href={`/packages/${productPackage.id}`} className="hover:text-primary transition-colors flex items-center gap-2">
            <Package className="h-5 w-5 text-primary/80 shrink-0"/>
            <span className="truncate">{productPackage.name}</span>
          </Link>
        </CardTitle>
        <p className="text-sm text-muted-foreground line-clamp-2">{productPackage.description || 'ไม่มีรายละเอียดเพิ่มเติม'}</p>
      </CardContent>
      <CardFooter className="p-4 flex flex-col items-start gap-3">
        <div className="flex flex-col gap-0.5">
            <div className="flex items-baseline gap-2">
                <p className="text-xl font-bold text-primary">
                    ฿{productPackage.price.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                {savings > 0 && (
                    <p className="text-xs text-muted-foreground line-through">
                        ฿{totalRetailPrice.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                )}
            </div>
            <p className="text-[9px] text-muted-foreground font-medium">{taxLabel}</p>
            {!isOutOfStock && savings > 0 && (
                <p className="text-[10px] font-bold text-green-600 flex items-center gap-1 mt-1">
                    <Tag className="h-3 w-3" />
                    ราคาคุ้มกว่าซื้อแยกชิ้น
                </p>
            )}
        </div>
        <Button asChild variant={isOutOfStock ? "secondary" : "outline"} className="w-full h-10 border-primary/20 hover:bg-primary/5 hover:text-primary transition-all">
            <Link href={`/packages/${productPackage.id}`}>
                {isOutOfStock ? "ตรวจสอบสินค้าภายใน" : "ดูรายละเอียด"}
            </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
