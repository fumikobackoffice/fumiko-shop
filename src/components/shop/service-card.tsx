'use client';

import { Service } from "@/lib/types";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Briefcase, Info } from "lucide-react";
import { ImagePlaceholder } from "../shared/image-placeholder";
import { Badge } from "../ui/badge";
import { useCart } from "@/hooks/use-cart";

export function ServiceCard({ service }: { service: Service }) {
  const { addToCart } = useCart();
  const displayImage = service.imageUrls?.[0];

  const taxLabel = service.taxStatus === 'EXEMPT' 
    ? "ไม่มี VAT" 
    : `${service.taxMode === 'INCLUSIVE' ? 'รวม' : 'แยก'} VAT ${service.taxRate}%`;

  return (
    <Card className="overflow-hidden flex flex-col group transition-all duration-300 hover:shadow-xl hover:-translate-y-1 bg-[#FAF9F6] dark:bg-card border-primary/10">
      <CardHeader className="p-0 relative">
        <div className="block overflow-hidden aspect-square relative bg-muted">
           {displayImage ? (
              <Image
                src={displayImage}
                alt={service.name}
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-300"
              />
           ) : (
            <ImagePlaceholder className="group-hover:scale-105 transition-transform duration-300" />
           )}
           <Badge className="absolute top-2 left-2 z-10 bg-primary text-primary-foreground border-none text-[10px] h-5 px-2 shadow-md">
             <Briefcase className="mr-1 h-3 w-3" />
             งานบริการ
           </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-4 flex-grow">
        <div className="mb-1 text-[10px] font-bold text-primary uppercase tracking-wider">{service.category}</div>
        <CardTitle className="font-headline text-lg mb-2 line-clamp-1">
          {service.name}
        </CardTitle>
        <p className="text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem]">
          {service.description || 'บริการคุณภาพจากผู้เชี่ยวชาญ พร้อมดูแลสาขาของคุณ'}
        </p>
      </CardContent>
      <CardFooter className="p-4 flex flex-col items-start gap-3 border-t bg-white/50 dark:bg-black/5">
        <div className="flex flex-col">
            <p className="text-xl font-bold text-primary">
                ฿{service.price.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-[10px] text-muted-foreground font-medium mt-0.5">{taxLabel}</p>
            <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-1">
                <Info className="h-3 w-3" />
                ราคาค่าบริการคงที่
            </p>
        </div>
        <Button 
          className="w-full h-10 font-bold"
          onClick={() => addToCart(service, 1)}
        >
            สั่งซื้อบริการ
        </Button>
      </CardFooter>
    </Card>
  );
}
