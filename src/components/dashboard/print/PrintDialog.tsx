
'use client';

import React, { useEffect, useState, useMemo } from "react";
import type { Order, OrderItem, ProductVariant, SenderAddress, ProductGroup, StoreSettings } from "@/lib/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useFirestore, useDoc, useMemoFirebase } from "@/firebase";
import { doc, getDoc } from "firebase/firestore";
import { Skeleton } from "@/components/ui/skeleton";
import { formatInTimeZone } from 'date-fns-tz';
import { th } from 'date-fns/locale';

const DEFAULT_SENDER_ADDRESS: SenderAddress = {
    name: "Fumiko Head Office",
    street: "106/19 หมู่ 6, บางรักพัฒนา",
    subdistrict: "บางรักพัฒนา",
    district: "บางบัวทอง",
    province: "นนทบุรี",
    postalCode: "11110",
    phone: "0657546699",
};

const packingSlipPrintStyles = `
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;700&display=swap');
    @page { size: A4; margin: 0; }
    body { margin: 0; font-family: 'Noto Sans Thai', sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .packing-slip-container {
        width: 210mm; min-height: 297mm; padding: 10mm;
        box-sizing: border-box; background-color: white; color: black; font-size: 10pt;
        display: flex; flex-direction: column;
    }
    .header-section { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #333; padding-bottom: 8px; margin-bottom: 12px; }
    .header-section h1 { font-size: 24pt; font-weight: 700; margin: 0; }
    .header-section p { margin: 0; font-size: 12pt; }
    .order-details { text-align: right; font-size: 9pt; }
    .address-section { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
    .address-box h3 { font-weight: 700; font-size: 10pt; margin: 0 0 4px 0; }
    .address-box p { margin: 0; line-height: 1.6; }
    .items-table { border-collapse: collapse; width: 100%; font-size: 10pt; }
    .items-table th, .items-table td { padding: 8px; border: 1px solid #ddd; text-align: left; vertical-align: top; }
    .items-table th { background-color: #f2f2f2; }
    .items-table .checkbox-cell { text-align: center; width: 40px; }
    .items-table .sku-cell { width: 120px; }
    .items-table .quantity-cell { text-align: center; width: 60px; font-weight: 700; }
    .items-table .unit-cell { text-align: center; width: 80px; }
    .print-checkbox { width: 16px; height: 16px; border: 1px solid #666; border-radius: 3px; display: inline-block; vertical-align: middle; }
    .footer { text-align: center; color: #aaa; font-size: 8pt; margin-top: auto; padding-top: 10px; }
`;

const shippingLabelPrintStyles = `
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;700&display=swap');
    @page {
        size: 100mm 150mm; /* ขนาดมาตรฐาน 4x6 นิ้ว */
        margin: 0;
    }
    body { 
        margin: 0; 
        font-family: 'Noto Sans Thai', sans-serif;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
    }
    .label-container {
        width: 100mm;
        height: 150mm;
        padding: 4mm;
        box-sizing: border-box;
        background-color: white;
        color: black;
        font-size: 11pt;
        display: flex;
        flex-direction: column;
    }
    .address-section {
        flex-grow: 1;
        display: flex;
        flex-direction: column;
        gap: 4mm;
    }
    .address-block {
        border: 1px solid #333;
        border-radius: 8px;
        padding: 3mm;
        display: flex;
        flex-direction: column;
        flex-grow: 1;
        flex-basis: 0;
    }
    .address-block h3 {
        font-weight: 700;
        font-size: 13pt;
        margin: 0 0 1mm 0;
        padding-bottom: 1mm;
        border-bottom: 1px solid #eee;
    }
    .address-block .address-content {
        flex-grow: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
        line-height: 1.7;
    }
     .address-block .address-content p {
        margin: 0;
    }
    .footer-section {
        border-top: 2px solid #333;
        padding-top: 2mm;
        margin-top: 4mm;
        text-align: center;
        font-size: 9pt;
        color: #555;
    }
`;

export type EnrichedOrderItem = OrderItem & { sku?: string; unit?: string };

function PackingSlipPreview({ order, orderItems, senderAddress }: { order: Order; orderItems: EnrichedOrderItem[]; senderAddress: SenderAddress | null }) {
    if (!senderAddress) {
        return <Skeleton className="w-full h-full" />;
    }
    
    const orderDate = order.orderDate?.toDate ? order.orderDate.toDate() : new Date(order.orderDate);

    return (
        <div className="bg-white text-black p-4 text-[5px] leading-tight w-full h-full flex flex-col font-body">
            <div className="flex justify-between items-start pb-2 mb-2 border-b-2 border-gray-800">
                <div>
                    <h1 className="text-xl font-bold leading-tight">ใบจัดของ/ส่งของ</h1>
                    <p className="text-base leading-tight">Packing Slip</p>
                </div>
                <div className="text-right text-[4px] leading-tight">
                    <p><strong>เลขที่ออเดอร์:</strong> #{order.id}</p>
                    <p><strong>วันที่สั่งซื้อ:</strong> {orderDate.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                    <p><strong>วิธีจัดส่ง:</strong> {order.shippingMethod || '-'}</p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4 text-[4.5px] leading-snug">
                <div>
                    <h3 className="font-bold text-[5px]">ผู้ส่ง (FROM)</h3>
                    <p>{senderAddress.name}</p>
                    <p>{senderAddress.street}</p>
                    <p>{senderAddress.subdistrict}, {senderAddress.district}</p>
                    <p>{senderAddress.province} {senderAddress.postalCode}</p>
                    <p>โทร: {senderAddress.phone}</p>
                </div>
                <div>
                    <h3 className="font-bold text-[5px]">ผู้รับ (TO)</h3>
                    <p>{order.shippingAddress?.name || '-'}</p>
                    <p>{order.shippingAddress?.addressLine1 || '-'}{order.shippingAddress?.addressLine2 ? `, ${order.shippingAddress.addressLine2}` : ''}</p>
                    <p>{order.shippingAddress?.subdistrict || ''}, {order.shippingAddress?.district || ''}</p>
                    <p>{order.shippingAddress?.province || ''} {order.shippingAddress?.postalCode || ''}</p>
                    <p>โทร: {order.shippingAddress?.phone || '-'}</p>
                </div>
            </div>

            <h3 className="font-bold text-[5px] mb-1">รายการสินค้า</h3>
            <div className="border border-gray-300">
                <table className="w-full text-[5px]">
                    <thead>
                        <tr className="bg-gray-100">
                            <th className="p-1 text-center border-b border-r border-gray-300 w-8">จัด</th>
                            <th className="p-1 text-left border-b border-r border-gray-300 w-16">SKU</th>
                            <th className="p-1 text-left border-b border-r border-gray-300">ชื่อสินค้า</th>
                            <th className="p-1 text-center border-b border-gray-300 w-12">จำนวน</th>
                            <th className="p-1 text-center border-b border-gray-300 w-12">หน่วย</th>
                        </tr>
                    </thead>
                    <tbody>
                        {orderItems.map((item, index) => (
                            <tr key={item.id || index} className="border-b border-gray-200">
                                <td className="p-1 text-center border-r border-gray-300">
                                    <div className="w-2.5 h-2.5 border border-gray-500 rounded-sm mx-auto"></div>
                                </td>
                                <td className="p-1 border-r border-gray-300">{item.sku || 'N/A'}</td>
                                <td className="p-1 ">{item.productName.replace(/\s*\(\)$/, '')}</td>
                                <td className="p-1 text-center font-bold text-[6px] border-r border-gray-300">{item.quantity}</td>
                                <td className="p-1 text-center border-gray-300">{item.unit || '-'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            
            <div className="flex-grow"></div> 
            
            <div className="text-center text-gray-500 text-[4px] pt-2 mt-auto">
                ขอขอบคุณที่ใช้บริการ Fumiko Shop
            </div>
        </div>
    );
}

function LabelPreview({ order, senderAddress }: { order: Order; senderAddress: SenderAddress | null }) {
    if (!senderAddress) {
        return <Skeleton className="w-full h-full" />;
    }

    return (
        <div className="p-4 bg-white text-black flex flex-col h-full font-body rounded-md shadow-lg">
            <div className="flex-grow flex flex-col gap-4">
                <div className="border border-gray-700 rounded-lg p-3 flex-grow flex flex-col">
                    <h3 className="font-bold text-lg mb-1 pb-1 border-b">ผู้ส่ง (FROM)</h3>
                    <div className="flex-grow flex flex-col justify-center text-sm space-y-1">
                        <p>{senderAddress.name}</p>
                        <p>{senderAddress.street}</p>
                        <p>{senderAddress.subdistrict}, {senderAddress.district}</p>
                        <p>{senderAddress.province} {senderAddress.postalCode}</p>
                        <p>โทร: {senderAddress.phone}</p>
                    </div>
                </div>
                <div className="border border-gray-700 rounded-lg p-3 flex-grow flex flex-col">
                    <h3 className="font-bold text-lg mb-1 pb-1 border-b">ผู้รับ (TO)</h3>
                    <div className="flex-grow flex flex-col justify-center text-sm space-y-1">
                        <p>{order.shippingAddress?.name || '-'}</p>
                        <p>{order.shippingAddress?.addressLine1 || '-'}{order.shippingAddress?.addressLine2 ? `, ${order.shippingAddress.addressLine2}` : ''}</p>
                        <p>{order.shippingAddress?.subdistrict || ''}, {order.shippingAddress?.district || ''}</p>
                        <p>{order.shippingAddress?.province || ''} {order.shippingAddress?.postalCode || ''}</p>
                        <p>โทร: {order.shippingAddress?.phone || '-'}</p>
                    </div>
                </div>
            </div>
            <div className="border-t-2 border-gray-800 pt-2 mt-4 text-center text-xs text-gray-600">
                <p className="break-all font-bold">วิธีจัดส่ง: {order.shippingMethod || '-'}</p>
                <p className="break-all">Order ID: {order.id} | จัดส่งโดย Fumiko</p>
            </div>
        </div>
    );
}


export function PrintDialog({ order, orderItems, isOpen, onClose }: { order: Order; orderItems: OrderItem[]; isOpen: boolean; onClose: () => void }) {
    const firestore = useFirestore();
    const [enrichedItems, setEnrichedItems] = useState<EnrichedOrderItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const settingsRef = useMemoFirebase(() => firestore ? doc(firestore, 'settings', 'store') : null, [firestore]);
    const { data: storeSettings } = useDoc<StoreSettings>(settingsRef);

    const senderAddress = useMemo(() => {
        return storeSettings?.companyAddress || DEFAULT_SENDER_ADDRESS;
    }, [storeSettings]);

    useEffect(() => {
        if (!isOpen || !orderItems.length || !firestore) {
            if (!isOpen) {
                setEnrichedItems([]);
                setIsLoading(true);
            }
            return;
        }

        const fetchItemDetails = async () => {
            setIsLoading(true);
            const nestedItems = await Promise.all(
                orderItems.map(async (item) => {
                    // 1. Handle Package expansion into constituent products
                    if (item.type === 'PACKAGE') {
                        try {
                            const pkgRef = doc(firestore, 'productPackages', item.productId);
                            const pkgSnap = await getDoc(pkgRef);
                            
                            if (!pkgSnap.exists()) {
                                return [{ ...item, sku: 'Err: Pkg Not Found', unit: 'แพ็ก' }];
                            }
                            
                            const pkgData = pkgSnap.data();
                            const subItems = await Promise.all(
                                (pkgData.items || []).map(async (bundleItem: any) => {
                                    const groupRef = doc(firestore, 'productGroups', bundleItem.productGroupId);
                                    const variantRef = doc(firestore, 'productGroups', bundleItem.productGroupId, 'productVariants', bundleItem.productVariantId);
                                    
                                    const [groupSnap, variantSnap] = await Promise.all([
                                        getDoc(groupRef),
                                        getDoc(variantRef)
                                    ]);
                                    
                                    if (!groupSnap.exists() || !variantSnap.exists()) {
                                        return null;
                                    }
                                    
                                    const variantData = variantSnap.data() as ProductVariant;
                                    const groupData = groupSnap.data() as ProductGroup;
                                    
                                    const attrs = Object.values(variantData.attributes).join('/');
                                    
                                    return {
                                        ...item,
                                        id: `${item.id}-${variantSnap.id}`, // Unique ID for list rendering
                                        productName: `[แพ็ก] ${groupData.name}${attrs ? ` (${attrs})` : ''}`,
                                        sku: variantData.sku,
                                        quantity: bundleItem.quantity * item.quantity,
                                        unit: groupData.unit
                                    };
                                })
                            );
                            
                            const validSubItems = subItems.filter(Boolean) as EnrichedOrderItem[];
                            return validSubItems.length > 0 ? validSubItems : [{ ...item, sku: 'Empty Pkg', unit: 'แพ็ก' }];
                        } catch (e) {
                            console.error("Error expanding package:", item.productId, e);
                            return [{ ...item, sku: 'Error', unit: 'แพ็ก' }];
                        }
                    }
        
                    // 2. Handle Standard Product
                    if (item.type === 'PRODUCT' && item.productGroupId) {
                        try {
                            const groupRef = doc(firestore, 'productGroups', item.productGroupId);
                            const variantRef = doc(firestore, 'productGroups', item.productGroupId, 'productVariants', item.productId);
                            
                            const [groupSnap, variantSnap] = await Promise.all([
                                getDoc(groupRef),
                                getDoc(variantRef)
                            ]);
                            
                            if (!groupSnap?.exists() || !variantSnap?.exists()) {
                                return [{ ...item, sku: 'N/A', unit: '-' }];
                            }
                
                            const vData = variantSnap.data() as ProductVariant;
                            const gData = groupSnap.data() as ProductGroup;
                            return [{ ...item, sku: vData.sku ?? 'N/A', unit: gData.unit ?? '-' }];
                        } catch (e) {
                            return [{ ...item, sku: 'Error', unit: '-' }];
                        }
                    }

                    // 3. Handle Service or Unknown
                    return [{ ...item, sku: item.type === 'SERVICE' ? 'SERVICE' : (item as any).sku || 'N/A', unit: (item as any).unit || 'ครั้ง' }];
                })
            );
            
            // Flatten the nested array to get a single picking list
            setEnrichedItems(nestedItems.flat());
            setIsLoading(false);
        };

        fetchItemDetails();
    }, [isOpen, orderItems, firestore]);
    
    const openPrintWindow = (styles: string, content: string) => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            alert("Please allow pop-ups to print.");
            return;
        }
        printWindow.document.write(`<html><head><title>Print</title><style>${styles}</style></head><body>${content}</body></html>`);
        printWindow.document.close();
        setTimeout(() => {
            printWindow.focus();
            printWindow.print();
        }, 500);
    };

    const handlePrint = (type: 'packingSlip' | 'shippingLabel') => {
        const orderDate = 'toDate' in order.orderDate ? order.orderDate.toDate() : new Date(order.orderDate);
        const formattedDate = orderDate.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
        const shippingMethod = order.shippingMethod || '-';
        
        if (type === 'shippingLabel') {
            const styles = shippingLabelPrintStyles;
            const content = `
                <div class="label-container">
                    <div class="address-section">
                        <div class="address-block">
                            <h3>ผู้ส่ง (FROM)</h3>
                            <div class="address-content">
                                <p>${senderAddress.name}</p>
                                <p>${senderAddress.street}</p>
                                <p>${senderAddress.subdistrict}, ${senderAddress.district}</p>
                                <p>${senderAddress.province} ${senderAddress.postalCode}</p>
                                <p>โทร: ${senderAddress.phone}</p>
                            </div>
                        </div>
                        <div class="address-block">
                            <h3>ผู้รับ (TO)</h3>
                            <div class="address-content">
                                <p>${order.shippingAddress?.name || '-'}</p>
                                <p>${order.shippingAddress?.addressLine1 || '-'}${order.shippingAddress?.addressLine2 ? `<br>${order.shippingAddress.addressLine2}` : ''}</p>
                                <p>${order.shippingAddress?.subdistrict || ''}, ${order.shippingAddress?.district || ''}</p>
                                <p>${order.shippingAddress?.province || ''} ${order.shippingAddress?.postalCode || ''}</p>
                                <p>โทร: ${order.shippingAddress?.phone || '-'}</p>
                            </div>
                        </div>
                    </div>
                    <div class="footer-section">
                        <p style="margin: 0; font-weight: bold; font-size: 11pt;">วิธีจัดส่ง: ${shippingMethod}</p>
                        <p style="margin: 2mm 0 0 0;">Order ID: ${order.id} | จัดส่งโดย Fumiko</p>
                    </div>
                </div>
            `;
            openPrintWindow(styles, content);
        } else {
            const styles = packingSlipPrintStyles;
            const itemsHtml = enrichedItems.map(item => `
                <tr>
                    <td class="checkbox-cell"><div class="print-checkbox"></div></td>
                    <td class="sku-cell">${item.sku || 'N/A'}</td>
                    <td class="name-cell">${item.productName.replace(/\s*\(\)$/, '')}</td>
                    <td class="quantity-cell"><strong>${item.quantity}</strong></td>
                    <td class="unit-cell">${item.unit || '-'}</td>
                </tr>
            `).join('');

            const content = `
                <div class="packing-slip-container">
                    <div class="header-section">
                        <div>
                            <h1>ใบจัดของ/ส่งของ</h1>
                            <p>Packing Slip</p>
                        </div>
                        <div class="order-details">
                            <p><strong>เลขที่ออเดอร์:</strong> #${order.id}</p>
                            <p><strong>วันที่สั่ง:</strong> ${formattedDate}</p>
                            <p><strong>วิธีจัดส่ง:</strong> ${shippingMethod}</p>
                        </div>
                    </div>
                    <div class="address-section">
                         <div class="address-box">
                            <h3>ผู้ส่ง (FROM)</h3>
                            <p>${senderAddress.name}</p>
                            <p>${senderAddress.street}</p>
                            <p>${senderAddress.subdistrict}, ${senderAddress.district}</p>
                            <p>${senderAddress.province} ${senderAddress.postalCode}</p>
                            <p>โทร: ${senderAddress.phone}</p>
                        </div>
                        <div class="address-box">
                            <h3>ผู้รับ (TO)</h3>
                            <p>${order.shippingAddress?.name || '-'}</p>
                             <p>${order.shippingAddress?.addressLine1 || '-'}${order.shippingAddress?.addressLine2 ? `<br>${order.shippingAddress.addressLine2}` : ''}</p>
                            <p>${order.shippingAddress?.subdistrict || ''}, ${order.shippingAddress?.district || ''}</p>
                            <p>${order.shippingAddress?.province || ''} ${order.shippingAddress?.postalCode || ''}</p>
                            <p>โทร: ${order.shippingAddress?.phone || '-'}</p>
                        </div>
                    </div>
                    <table class="items-table">
                        <thead>
                            <tr>
                                <th class="checkbox-cell">จัด</th>
                                <th class="sku-cell">รหัสสินค้า</th>
                                <th class="name-cell">ชื่อสินค้า</th>
                                <th class="quantity-cell">จำนวน</th>
                                <th class="unit-cell">หน่วย</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsHtml}
                        </tbody>
                    </table>
                     <div class="footer">
                        ขอขอบคุณที่ใช้บริการ Fumiko Shop
                    </div>
                </div>
            `;
            openPrintWindow(styles, content);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl flex flex-col">
                <DialogHeader>
                    <DialogTitle>พิมพ์เอกสารสำหรับออเดอร์ #{order.id}</DialogTitle>
                </DialogHeader>
                {isLoading ? (
                    <div className="flex-grow grid md:grid-cols-2 gap-6 p-4 items-center">
                        <Skeleton className="w-full aspect-[1/1.414]" />
                        <Skeleton className="w-full aspect-[1/1.414]" />
                    </div>
                ) : (
                    <div className="flex-grow grid md:grid-cols-2 gap-8 p-4 bg-muted/50 rounded-md overflow-hidden items-start">
                        <div className="flex flex-col items-center gap-4">
                            <h3 className="font-semibold">ใบจัดของ/ส่งของ (A4)</h3>
                            <div onClick={() => handlePrint('packingSlip')} className="w-full aspect-[1/1.414] bg-white shadow-lg rounded-md overflow-hidden cursor-pointer hover:ring-2 ring-primary ring-offset-2 transition-all">
                                <PackingSlipPreview order={order} orderItems={enrichedItems} senderAddress={senderAddress} />
                            </div>
                        </div>
                         <div className="flex flex-col items-center gap-4 h-full">
                            <h3 className="font-semibold">ใบปะหน้า (4x6 นิ้ว)</h3>
                            <div className="w-full flex-grow flex items-center justify-center">
                                <div onClick={() => handlePrint('shippingLabel')} className="h-full aspect-[2/3] bg-white shadow-lg rounded-md overflow-hidden cursor-pointer hover:ring-2 ring-primary ring-offset-2 transition-all">
                                    <LabelPreview order={order} senderAddress={senderAddress} />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
