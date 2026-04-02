import { ProductGroup, ProductVariant } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ImagePlaceholder } from '../shared/image-placeholder';

export function ProductQuickView({ 
    productGroup, 
    variants,
    onClose 
}: { 
    productGroup: ProductGroup | null;
    variants: ProductVariant[];
    onClose: () => void;
}) {
    if (!productGroup) return null;

    const firstImageUrl = variants.find(v => v.imageUrls && v.imageUrls.length > 0)?.imageUrls?.[0];
    const hasVariants = variants.length > 1 || (variants.length === 1 && Object.keys(variants[0].attributes).length > 0);

    return (
        <Dialog open={!!productGroup} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-3xl max-h-[90vh]">
                <DialogHeader>
                    <DialogTitle className="text-xl">รายละเอียดสินค้า (Quick View)</DialogTitle>
                </DialogHeader>

                <ScrollArea className="h-full pr-4 pb-4">
                    <div className="flex gap-6 mb-6 mt-2">
                        <div className="w-32 h-32 shrink-0 bg-muted rounded-lg overflow-hidden border">
                            {firstImageUrl ? (
                                <img src={firstImageUrl} alt={productGroup.name} className="w-full h-full object-cover" />
                            ) : (
                                <ImagePlaceholder />
                            )}
                        </div>
                        <div className="flex-1 space-y-4">
                            <div>
                                <h3 className="font-semibold text-2xl mb-1">{productGroup.name}</h3>
                                {productGroup.description && (
                                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{productGroup.description}</p>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-y-2 text-sm">
                                <div><span className="text-muted-foreground">หมวดหมู่หลัก:</span> {productGroup.categoryA || '-'}</div>
                                <div><span className="text-muted-foreground">หมวดหมู่ย่อย:</span> {productGroup.categoryB || '-'}</div>
                                <div><span className="text-muted-foreground">ประเภท:</span> {productGroup.categoryC || '-'}</div>
                                <div><span className="text-muted-foreground">สถานะ:</span> <Badge className="ml-1" variant={productGroup.status === 'active' ? 'success' : productGroup.status === 'draft' ? 'outline' : 'destructive'}>{productGroup.status === 'active' ? 'เผยแพร่' : productGroup.status === 'draft' ? 'ฉบับร่าง' : 'ถังขยะ'}</Badge></div>
                                <div><span className="text-muted-foreground">หน่วยนับ:</span> {productGroup.unit || '-'}</div>
                                <div><span className="text-muted-foreground">แบรนด์:</span> {productGroup.brand || '-'}</div>
                            </div>
                        </div>
                    </div>

                    <Separator className="my-6" />

                    <h4 className="font-semibold text-lg mb-4">ตัวเลือกสินค้าและสต็อก</h4>
                    
                    <div className="rounded-lg border overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-muted">
                                <tr>
                                    <th className="px-4 py-2 text-left font-medium">SKU / ตัวเลือก</th>
                                    <th className="px-4 py-2 text-right font-medium">ราคา</th>
                                    <th className="px-4 py-2 text-right font-medium">สต็อกคงเหลือ</th>
                                    <th className="px-4 py-2 text-center font-medium">ภาษี (VAT)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {variants.map((v) => {
                                    const stock = (v.inventoryLots || []).reduce((sum, lot) => sum + lot.quantity, 0);
                                    let vatText = "รวม VAT";
                                    if (v.taxStatus === 'EXEMPT') vatText = "ยกเว้นภาษี";
                                    else if (v.taxMode === 'EXCLUSIVE') vatText = "ไม่รวม VAT";

                                    return (
                                        <tr key={v.id} className="hover:bg-muted/50">
                                            <td className="px-4 py-3">
                                                <div className="font-medium">{v.sku}</div>
                                                {hasVariants && (
                                                    <div className="text-xs text-muted-foreground mt-0.5">
                                                        {Object.entries(v.attributes).map(([k, val]) => `${k}: ${val}`).join(', ') || 'ตัวเลือกหลัก'}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-right">฿{v.price.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                            <td className="px-4 py-3 text-right">
                                                <span className={stock <= (v.lowStockThreshold || 0) && v.trackInventory ? "text-destructive font-bold" : ""}>
                                                    {v.trackInventory ? stock.toLocaleString() : '-'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-center text-muted-foreground">{vatText}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}
