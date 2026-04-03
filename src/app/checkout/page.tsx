
'use client';

import { Header } from '@/components/shared/header';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { useCart } from '@/hooks/use-cart';
import { useToast } from '@/hooks/use-toast';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, serverTimestamp, writeBatch, doc, getDoc, DocumentReference, Firestore, increment, runTransaction, Timestamp, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import { CartItem, Product, ProductPackage, ProductVariant, InventoryLot, Address, UserProfile, ProductGroup, StoreSettings, ShippingRates, OrderItem, Branch, Service, TaxStatus, TaxMode, Order, LalamoveVehicle, StockAdjustmentTransaction } from '@/lib/types';
import { Loader2, MapPin, Truck, Ticket, ChevronLeft, Star, Package, Edit, PlusCircle, Store, Info, Briefcase, ReceiptText, Percent, AlertTriangle, Car, ShieldCheck } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { calculateTotalShipping } from '@/lib/shipping-utils';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { AddressFormDialog } from '@/components/dashboard/address-form-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ImpersonationBanner } from '@/components/shared/impersonation-banner';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { startOfDay } from 'date-fns';
import { Progress } from '@/components/ui/progress';

const getPriceForQuantity = (product: Product, quantity: number): number => {
    if (!product.priceTiers || product.priceTiers.length === 0) {
        return product.price;
    }
    const sortedTiers = [...(product.priceTiers || [])].sort((a, b) => (b.minQuantity || 0) - (a.minQuantity || 0));
    const applicableTier = sortedTiers.find(tier => tier.minQuantity != null && quantity >= tier.minQuantity);
    return applicableTier?.price ?? product.price;
};

const deductFromLots = (lots: InventoryLot[], quantityToDeduct: number) => {
    if (!lots) {
        throw new Error("Inventory lots data is missing.");
    }
    const fulfilledFromLots: { lotId: string; quantity: number; costPerItem: number; sellingPrice?: number; }[] = [];
    const remainingLots = [...lots].map(l => ({ ...l, receivedAt: l.receivedAt?.toDate ? l.receivedAt.toDate() : new Date(l.receivedAt) }))
        .sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());

    let needed = quantityToDeduct;

    for (const lot of remainingLots) {
        if (needed <= 0) break;
        const take = Math.min(lot.quantity, needed);
        if (take > 0) {
            fulfilledFromLots.push({ lotId: lot.lotId, quantity: take, costPerItem: lot.cost, ...(lot.sellingPrice != null ? { sellingPrice: lot.sellingPrice } : {}) });
            lot.quantity -= take;
            needed -= take;
        }
    }

    if (needed > 0) {
        throw new Error("Insufficient stock to fulfill the order.");
    }

    return {
        updatedLots: remainingLots.filter(lot => lot.quantity > 0),
        fulfilled: fulfilledFromLots,
    };
};

type OrderPreparationResult = {
    sellerIds: string[];
    orderItemsData: (Omit<OrderItem, 'id'> & { fulfilledFromLots: any[] })[];
    stockUpdates: { ref: DocumentReference; variantId: string; groupId: string; newLots: InventoryLot[]; fulfilled: any[] }[];
};

async function prepareOrderData(firestore: Firestore, cartItems: CartItem[], allowDrafts: boolean): Promise<OrderPreparationResult> {
    return await runTransaction(firestore, async (transaction) => {
        const sellerIds = new Set<string>();
        const orderItemsData: (Omit<OrderItem, 'id'> & { fulfilledFromLots: any[] })[] = [];
        const stockUpdates: { ref: DocumentReference; variantId: string; groupId: string; newLots: InventoryLot[]; fulfilled: any[] }[] = [];
        const variantCache = new Map<string, { variantData: ProductVariant, groupData: ProductGroup }>();

        for (const cartItem of cartItems) {
            const processVariant = async (variantId: string, groupId: string, quantityToDeduct: number) => {
                let cachedData = variantCache.get(variantId);
                if (!cachedData) {
                    const variantRef = doc(firestore, 'productGroups', groupId, 'productVariants', variantId);
                    const groupRef = doc(firestore, 'productGroups', groupId);
                    const [variantSnap, groupSnap] = await Promise.all([transaction.get(variantRef), transaction.get(groupRef)]);
                    
                    if (!variantSnap.exists() || !groupSnap.exists()) {
                        throw new Error(`Product data for variant ${variantId} not found.`);
                    }
                    
                    const variantData = variantSnap.data() as ProductVariant;
                    const groupData = groupSnap.data() as ProductGroup;
                    
                    const isDraftAllowed = allowDrafts && groupData.status === 'draft';
                    if ((groupData.status !== 'active' && !isDraftAllowed) || variantData.status === 'archived') {
                        throw new Error(`ขออภัย, สินค้า (${variantData.sku}) ไม่พร้อมจำหน่ายในขณะนี้`);
                    }

                    cachedData = { variantData, groupData };
                    variantCache.set(variantId, cachedData);
                }

                const { variantData, groupData } = cachedData;
                sellerIds.add(groupData.sellerId);
                
                if (!variantData.trackInventory) {
                    return []; 
                }

                const currentLots = variantData.inventoryLots || [];
                const totalStock = currentLots.reduce((acc, lot) => acc + lot.quantity, 0);

                if (totalStock < quantityToDeduct) {
                    throw new Error(`สต็อกไม่เพียงพอสำหรับ ${groupData.name}. ต้องการ ${quantityToDeduct}, มีอยู่ ${totalStock}.`);
                }

                const { updatedLots, fulfilled } = deductFromLots(currentLots, quantityToDeduct);
                stockUpdates.push({ 
                    ref: doc(firestore, 'productGroups', groupId, 'productVariants', variantId),
                    variantId,
                    groupId,
                    newLots: updatedLots,
                    fulfilled
                });
                return fulfilled;
            };

            let itemPrice = 0;
            let taxStatus: TaxStatus = 'TAXABLE';
            let taxMode: TaxMode = 'INCLUSIVE';
            let taxRate = 7;

            if (cartItem.type === 'PRODUCT') {
                const p = cartItem.item as Product;
                itemPrice = getPriceForQuantity(p, cartItem.quantity);
                taxStatus = p.taxStatus || 'TAXABLE';
                taxMode = p.taxMode || 'INCLUSIVE';
                taxRate = p.taxRate ?? 7;
            } else if (cartItem.type === 'PACKAGE') {
                const pkg = cartItem.item as ProductPackage;
                itemPrice = pkg.price;
                taxStatus = 'TAXABLE'; 
                taxMode = 'INCLUSIVE';
                taxRate = 7; 
            } else if (cartItem.type === 'SERVICE') {
                const s = cartItem.item as Service;
                itemPrice = s.price;
                taxStatus = s.taxStatus || 'TAXABLE';
                taxMode = s.taxMode || 'INCLUSIVE';
                taxRate = s.taxRate ?? 7;
            }

            if (cartItem.type === 'PRODUCT') {
                const product = cartItem.item as Product;
                const fulfilledFromLots = await processVariant(product.id, product.productGroupId, cartItem.quantity);
                orderItemsData.push({
                    orderId: '',
                    productId: product.id,
                    productGroupId: product.productGroupId,
                    type: 'PRODUCT',
                    productName: `${product.name} (${Object.entries(product.attributes).map(([key, value]) => `${key}: ${value}`).join(', ')})`.replace(/\s*\(\)$/, ''),
                    productImage: product.imageUrls?.[0] || '',
                    quantity: cartItem.quantity,
                    itemPrice: cartItem.lotPrice ?? itemPrice,
                    ...(cartItem.lotLabel ? { lotLabel: cartItem.lotLabel } : {}),
                    fulfilledFromLots,
                    taxStatus,
                    taxMode,
                    taxRate,
                });
            } else if (cartItem.type === 'PACKAGE') {
                const pkg = cartItem.item as ProductPackage;
                const packageFulfillment: any[] = [];
                for (const pkgItem of pkg.items) {
                    const fulfilled = await processVariant(pkgItem.productVariantId, pkgItem.productGroupId, pkgItem.quantity * cartItem.quantity);
                    if (fulfilled && fulfilled.length > 0) {
                        packageFulfillment.push({ variantId: pkgItem.productVariantId, groupId: pkgItem.productGroupId, lots: fulfilled });
                    }
                }
                orderItemsData.push({
                    orderId: '',
                    productId: pkg.id,
                    type: 'PACKAGE',
                    productName: `แพ็กเกจ: ${pkg.name}`,
                    productImage: pkg.imageUrls?.[0] || '',
                    quantity: cartItem.quantity,
                    itemPrice: pkg.price,
                    fulfilledFromLots: packageFulfillment,
                    taxStatus,
                    taxMode,
                    taxRate,
                });
            } else if (cartItem.type === 'SERVICE') {
                const service = cartItem.item as Service;
                sellerIds.add(service.sellerId);
                orderItemsData.push({
                    orderId: '',
                    productId: service.id,
                    type: 'SERVICE',
                    productName: `บริการ: ${service.name}`,
                    productImage: service.imageUrls?.[0] || '',
                    quantity: cartItem.quantity,
                    itemPrice: service.price,
                    fulfilledFromLots: [],
                    taxStatus,
                    taxMode,
                    taxRate,
                });
            }
        }

        return { sellerIds: Array.from(sellerIds), orderItemsData, stockUpdates };
    });
}

function CheckoutPageContents() {
    const { user, impersonatedUser, stopImpersonation } = useAuth();
    const firestore = useFirestore();
    const { cartItems, cartTotal, cartCount, isSettingsLoading, storeSettings } = useCart();
    const router = useRouter();
    const { toast } = useToast();
    
    const effectiveUser = impersonatedUser || user;

    const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
    const [selectedBranchId, setSelectedBranchId] = useState<string>('');
    const [selectedShippingMethodId, setSelectedShippingMethodId] = useState<string>('weight-based');
    const [lastAutoCheapestId, setLastAutoCheapestId] = useState<string>('');
    
    const [pointsToUse, setPointsToUse] = useState<number>(0);
    const [pointsDiscount, setPointsDiscount] = useState<number>(0);
    const [isProcessing, setIsProcessing] = useState(false);
    const [pointsInput, setPointsInput] = useState('');
    const [pointsUsedToday, setPointsUsedToday] = useState<number>(0);

    const [isAddressFormOpen, setIsAddressFormOpen] = useState(false);
    const [addressToEdit, setAddressToEdit] = useState<Address | null>(null);

    const [variantStocks, setVariantStocks] = useState<Record<string, number>>({});

    const addressesQuery = useMemoFirebase(() => {
        if (!effectiveUser || !firestore) return null;
        return collection(firestore, 'users', effectiveUser.id, 'addresses');
    }, [effectiveUser?.id, firestore]);
    const { data: addresses, isLoading: addressesLoading } = useCollection<Address>(addressesQuery);

    const branchesQuery = useMemoFirebase(() => {
        if (!effectiveUser || !firestore) return null;
        return query(collection(firestore, 'branches'), where('ownerId', '==', effectiveUser.id));
    }, [effectiveUser?.id, firestore]);
    const { data: userBranches, isLoading: branchesLoading } = useCollection<Branch>(branchesQuery);

    const selectedBranch = useMemo(() => {
        return userBranches?.find(b => b.id === selectedBranchId);
    }, [userBranches, selectedBranchId]);

    const hasPhysicalItems = useMemo(() => {
        return cartItems.some(i => i.type === 'PRODUCT' || i.type === 'PACKAGE');
    }, [cartItems]);

    const totalCapacityUnits = useMemo(() => {
        return cartItems.reduce((acc, cartItem) => {
            if (cartItem.type === 'PRODUCT') {
                const p = cartItem.item as Product;
                return acc + ((p.lalamoveCapacityUnit || 0) * cartItem.quantity);
            }
            return acc;
        }, 0);
    }, [cartItems]);

    useEffect(() => {
        if (isSettingsLoading || !storeSettings || !hasPhysicalItems) return;

        const options: { id: string; price: number }[] = [];

        let effectiveRates: ShippingRates = storeSettings.defaultShippingRates;
        if (selectedAddress && storeSettings.provincialShippingRates) {
            const provincialRate = storeSettings.provincialShippingRates.find(r => r.province === selectedAddress.province);
            if (provincialRate) effectiveRates = provincialRate.rates;
        }
        const weightCost = calculateTotalShipping(cartItems, effectiveRates);
        options.push({ id: 'weight-based', price: weightCost });

        if (selectedBranch?.lalamoveConfig?.enabled) {
            selectedBranch.lalamoveConfig.vehicles.forEach(v => {
                if (totalCapacityUnits <= v.maxCapacity) {
                    options.push({ id: `lalamove-${v.id}`, price: v.price });
                }
            });
        }

        if (options.length > 0) {
            const cheapest = options.reduce((prev, curr) => (prev.price <= curr.price ? prev : curr));
            const currentSelectionIsValid = options.some(o => o.id === selectedShippingMethodId);

            if (!currentSelectionIsValid || cheapest.id !== lastAutoCheapestId) {
                setSelectedShippingMethodId(cheapest.id);
                setLastAutoCheapestId(cheapest.id);
            }
        }
    }, [
        cartItems, 
        storeSettings, 
        selectedAddress, 
        isSettingsLoading, 
        selectedBranch, 
        totalCapacityUnits, 
        hasPhysicalItems,
        lastAutoCheapestId,
        selectedShippingMethodId
    ]);

    useEffect(() => {
        if (!effectiveUser || !firestore) return;

        const checkDailyPoints = async () => {
            const todayStart = startOfDay(new Date()).getTime();
            const q = query(
                collection(firestore, 'orders'),
                where('buyerId', '==', effectiveUser.id)
            );

            try {
                const snap = await getDocs(q);
                let total = 0;
                snap.forEach(docSnap => {
                    const orderData = docSnap.data() as Order;
                    const orderDate = orderData.orderDate?.toDate ? orderData.orderDate.toDate().getTime() : new Date(orderData.orderDate).getTime();
                    if (orderDate >= todayStart && !['CANCELLED', 'EXPIRED'].includes(orderData.status)) {
                        total += (orderData.pointsUsed || 0);
                    }
                });
                setPointsUsedToday(total);
            } catch (err) {
                console.error("Error checking daily points:", err);
            }
        };

        checkDailyPoints();
    }, [effectiveUser?.id, firestore]);

    useEffect(() => {
        if (effectiveUser && pointsToUse > (effectiveUser.pointsBalance ?? 0)) {
            setPointsToUse(0);
            setPointsDiscount(0);
            setPointsInput('');
            toast({
                variant: 'destructive',
                title: 'คะแนนสะสมมีการเปลี่ยนแปลง',
                description: 'คะแนนของคุณถูกปรับปรุงโดยผู้ดูแลระบบ กรุณาตรวจสอบคะแนนใหม่ก่อนทำรายการ',
            });
        }
    }, [effectiveUser?.pointsBalance, pointsToUse, toast]);

    useEffect(() => {
        if (!firestore || cartItems.length === 0) return;

        const unsubs = cartItems.map(cartItem => {
            if (cartItem.type === 'PRODUCT') {
                const p = cartItem.item as Product;
                const vRef = doc(firestore, 'productGroups', p.productGroupId, 'productVariants', p.id);
                return onSnapshot(vRef, (snap) => {
                    if (snap.exists()) {
                        const data = snap.data() as ProductVariant;
                        const stock = data.trackInventory ? (data.inventoryLots || []).reduce((sum, lot) => sum + lot.quantity, 0) : Infinity;
                        setVariantStocks(prev => ({ ...prev, [cartItem.id]: stock }));
                    }
                }, async (err) => {
                    errorEmitter.emit('permission-error', new FirestorePermissionError({
                        path: vRef.path,
                        operation: 'get'
                    }));
                });
            }
            return () => {};
        });

        return () => unsubs.forEach(unsub => unsub());
    }, [firestore, cartItems]);

    const itemsWithStockIssues = useMemo(() => {
        return cartItems.filter(ci => {
            const currentStock = variantStocks[ci.id];
            return currentStock !== undefined && currentStock < ci.quantity;
        });
    }, [cartItems, variantStocks]);

    useEffect(() => {
        if (addresses && addresses.length > 0) {
            const currentSelection = addresses.find(a => a.id === selectedAddress?.id);
            if (currentSelection) {
                setSelectedAddress(currentSelection);
            } else {
                const defaultAddress = addresses.find(a => a.isDefault) || addresses[0];
                setSelectedAddress(defaultAddress);
            }
        }
    }, [addresses]);

    useEffect(() => {
        if (userBranches && userBranches.length > 0 && !selectedBranchId) {
            setSelectedBranchId(userBranches[0].id);
        }
    }, [userBranches, selectedBranchId]);
    
    const shippingCost = useMemo(() => {
        if (isSettingsLoading || !storeSettings || !hasPhysicalItems) return 0;
        
        if (selectedBranch?.freeShippingEnabled) return 0;

        if (selectedShippingMethodId.startsWith('lalamove-') && selectedBranch?.lalamoveConfig?.enabled) {
            const vehicleId = selectedShippingMethodId.replace('lalamove-', '');
            const vehicle = selectedBranch.lalamoveConfig.vehicles.find(v => v.id === vehicleId);
            return vehicle?.price || 0;
        }

        let effectiveRates: ShippingRates | undefined = storeSettings.defaultShippingRates;
        if (selectedAddress && storeSettings.provincialShippingRates) {
            const provincialRate = storeSettings.provincialShippingRates.find(r => r.province === selectedAddress.province);
            if (provincialRate) effectiveRates = provincialRate.rates;
        }
        if (!effectiveRates) return 0;
        return calculateTotalShipping(cartItems, effectiveRates);
    }, [cartItems, storeSettings, selectedAddress, isSettingsLoading, selectedShippingMethodId, selectedBranch, hasPhysicalItems]);

    const handleApplyPoints = () => {
        const points = parseInt(pointsInput, 10);
        if (isNaN(points) || points < 0) {
            toast({ variant: 'destructive', title: 'คะแนนไม่ถูกต้อง' });
            return;
        }
        
        if (points > 500) {
            toast({ 
                variant: 'destructive', 
                title: 'เกินขีดจำกัดต่อรอบ', 
                description: 'คุณสามารถใช้คะแนนได้สูงสุด 500 คะแนนต่อหนึ่งคำสั่งซื้อ' 
            });
            return;
        }

        if (points + pointsUsedToday > 500) {
            const remaining = 500 - pointsUsedToday;
            toast({ 
                variant: 'destructive', 
                title: 'เกินขีดจำกัดต่อวัน', 
                description: remaining > 0 
                    ? `วันนี้คุณใช้คะแนนไปแล้ว ${pointsUsedToday} คะแนน คุณเหลือโควตาใชีกเพียง ${remaining} คะแนนเท่านั้น`
                    : `วันนี้คุณใช้โควตาคะแนนส่วนลดครบ 500 คะแนนแล้ว`
            });
            return;
        }

        if (points > (effectiveUser?.pointsBalance ?? 0)) {
            toast({ variant: 'destructive', title: 'คะแนนไม่เพียงพอ' });
            return;
        }
        const pointValue = storeSettings?.pointValue ?? 1;
        const potentialDiscount = points * pointValue;
        const totalBeforeDiscount = cartTotal + shippingCost;
        const actualDiscount = Math.min(potentialDiscount, totalBeforeDiscount);
        const finalPointsToUse = actualDiscount === potentialDiscount ? points : Math.ceil(actualDiscount / pointValue);
        setPointsToUse(finalPointsToUse);
        setPointsDiscount(actualDiscount);
        toast({ title: 'ใช้คะแนนสำเร็จ', description: `คุณได้รับส่วนลด ${actualDiscount.toLocaleString()} บาท` });
    };
    
    const grandTotal = Math.max(0, cartTotal + shippingCost - pointsDiscount);
    const pointsRate = storeSettings?.pointsRate || 100;
    
    const taxSummary = useMemo(() => {
        let totalTaxAmount = 0;
        let totalSubtotalBeforeTax = 0;

        cartItems.forEach(cartItem => {
            let basePrice = 0;
            let taxRate = 7;
            let taxMode: TaxMode = 'INCLUSIVE';
            let isTaxable = true;

            if (cartItem.type === 'PRODUCT') {
                const p = cartItem.item as Product;
                basePrice = cartItem.lotPrice ?? getPriceForQuantity(p, cartItem.quantity);
                taxRate = p.taxRate ?? storeSettings?.defaultTaxRate ?? 7;
                taxMode = p.taxMode || 'INCLUSIVE';
                isTaxable = p.taxStatus !== 'EXEMPT';
            } else if (cartItem.type === 'PACKAGE') {
                basePrice = (cartItem.item as ProductPackage).price;
                taxRate = storeSettings?.defaultTaxRate ?? 7;
                taxMode = 'INCLUSIVE'; 
                isTaxable = true;
            } else {
                const s = cartItem.item as Service;
                basePrice = s.price;
                taxRate = s.taxRate ?? storeSettings?.defaultTaxRate ?? 7;
                taxMode = s.taxMode || 'INCLUSIVE';
                isTaxable = s.taxStatus !== 'EXEMPT';
            }

            const itemLineTotal = basePrice * cartItem.quantity;

            if (isTaxable) {
                if (taxMode === 'INCLUSIVE') {
                    const lineBeforeTax = itemLineTotal / (1 + (taxRate / 100));
                    const lineTax = itemLineTotal - lineBeforeTax;
                    totalTaxAmount += lineTax;
                    totalSubtotalBeforeTax += lineBeforeTax;
                } else {
                    const lineTax = itemLineTotal * (taxRate / 100);
                    totalTaxAmount += lineTax;
                    totalSubtotalBeforeTax += itemLineTotal;
                }
            } else {
                totalSubtotalBeforeTax += itemLineTotal;
            }
        });

        if (shippingCost > 0) {
            const defaultRate = storeSettings?.defaultTaxRate ?? 7;
            const shippingBeforeTax = shippingCost / (1 + (defaultRate / 100));
            const shippingTax = shippingCost - shippingBeforeTax;
            totalTaxAmount += shippingTax;
            totalSubtotalBeforeTax += shippingBeforeTax;
        }

        const discountFactor = (cartTotal + shippingCost) > 0 ? grandTotal / (cartTotal + shippingCost) : 0;
        const finalTaxAmount = totalTaxAmount * discountFactor;
        const finalSubtotalBeforeTax = totalSubtotalBeforeTax * discountFactor;

        return {
            taxAmount: finalTaxAmount,
            subtotalBeforeTax: finalSubtotalBeforeTax,
            defaultTaxRate: storeSettings?.defaultTaxRate ?? 7
        };
    }, [cartItems, storeSettings, cartTotal, shippingCost, grandTotal]);

    const pointsEligibleTotal = useMemo(() => {
        const eligibleSubtotal = cartItems
            .filter(item => item.type !== 'SERVICE')
            .reduce((sum, cartItem) => {
                let price = 0;
                if (cartItem.type === 'PRODUCT') price = cartItem.lotPrice ?? getPriceForQuantity(cartItem.item as Product, cartItem.quantity);
                else if (cartItem.type === 'PACKAGE') price = (cartItem.item as ProductPackage).price;
                return sum + price * cartItem.quantity;
            }, 0);
        
        const netPaidAmount = Math.max(0, grandTotal - shippingCost);
        return Math.min(eligibleSubtotal, netPaidAmount);
    }, [cartItems, grandTotal, shippingCost]);

    const pointsToEarn = Math.floor(pointsEligibleTotal / pointsRate);

    async function handlePlaceOrder() {
        if (!effectiveUser || !firestore) return;
        if (hasPhysicalItems && !selectedAddress) {
            toast({ variant: 'destructive', title: 'กรุณาเลือกที่อยู่สำหรับจัดส่ง' });
            return;
        }
        if (itemsWithStockIssues.length > 0) {
            toast({ variant: 'destructive', title: 'การสั่งซื้อไม่สำเร็จ', description: 'มีสินค้าบางรายการถูกสั่งซื้อจนสต็อกไม่พอแล้ว กรุณาตรวจสอบอีกครั้ง' });
            return;
        }
        const branch = userBranches?.find(b => b.id === selectedBranchId);
        if (userBranches && userBranches.length > 0 && !branch) {
            toast({ variant: 'destructive', title: 'กรุณาเลือกสาขาที่สั่งซื้อ' });
            return;
        }

        if (pointsToUse + pointsUsedToday > 500) {
            toast({ variant: 'destructive', title: 'โควตาคะแนนวันนี้เต็มแล้ว', description: 'กรุณาล้างส่วนลดคะแนนออกเพื่อสั่งซื้อสินค้าตามปกติ' });
            return;
        }

        setIsProcessing(true);
        const isAdminImpersonating = impersonatedUser && (user?.role === 'admin' || user?.role === 'super_admin');

        try {
            const { sellerIds, orderItemsData, stockUpdates } = await prepareOrderData(firestore, cartItems, !!isAdminImpersonating);
            const batch = writeBatch(firestore);
            const orderRef = doc(collection(firestore, 'orders'));
            
            let shippingAddressData = null;
            if (selectedAddress) {
                const {id, label, isDefault, ...rest} = selectedAddress;
                shippingAddressData = rest;
            } else if (!hasPhysicalItems) {
                shippingAddressData = {
                    name: effectiveUser.name,
                    phone: effectiveUser.phone || '',
                    addressLine1: 'สั่งซื้อบริการ (ไม่มีการจัดส่ง)',
                    subdistrict: '-',
                    district: '-',
                    province: '-',
                    postalCode: '-',
                    googleMapsUrl: ''
                };
            }

            const now = new Date();
            const expiresAt = new Date(now.getTime() + 15 * 60 * 1000); 

            let lalamoveVehicleInfo = null;
            let shippingMethod = "จัดส่งตามน้ำหนัก/ค่าส่งคงที่";

            if (selectedShippingMethodId.startsWith('lalamove-') && branch?.lalamoveConfig?.enabled) {
                const vehicleId = selectedShippingMethodId.replace('lalamove-', '');
                const vehicle = branch.lalamoveConfig.vehicles.find(v => v.id === vehicleId);
                if (vehicle) {
                    lalamoveVehicleInfo = { type: vehicle.type, price: vehicle.price };
                    shippingMethod = `Lalamove (${vehicle.type})`;
                }
            } else if (!hasPhysicalItems) {
                shippingMethod = "บริการ (ไม่มีการจัดส่ง)";
            }

            if (branch?.freeShippingEnabled) {
                shippingMethod += " (สิทธิ์ส่งฟรีรายสาขา)";
            }

            batch.set(orderRef, {
                buyerId: effectiveUser.id,
                buyerName: effectiveUser.name, 
                sellerIds: sellerIds,
                branchId: branch?.id || '',
                branchName: branch?.name || '',
                orderDate: serverTimestamp(),
                status: 'PENDING_PAYMENT',
                totalAmount: grandTotal,
                customerName: shippingAddressData?.name || effectiveUser.name,
                shippingAddress: shippingAddressData,
                shippingMethod: shippingMethod,
                shippingCost: shippingCost,
                pointsUsed: pointsToUse,
                pointsDiscount: pointsDiscount,
                expiresAt: Timestamp.fromDate(expiresAt),
                isNew: true,
                updatedAt: serverTimestamp(),
                isServiceOnly: !hasPhysicalItems,
                lalamoveVehicle: lalamoveVehicleInfo,
                taxRate: taxSummary.defaultTaxRate,
                taxAmount: taxSummary.taxAmount,
                subtotalBeforeTax: taxSummary.subtotalBeforeTax,
                createdById: user?.id, 
            });

            orderItemsData.forEach(itemData => {
                const orderItemRef = doc(collection(firestore, 'orders', orderRef.id, 'orderItems'));
                batch.set(orderItemRef, { ...itemData, orderId: orderRef.id });
            });

            // Update stock and create movement logs
            stockUpdates.forEach(({ ref, variantId, groupId, newLots, fulfilled }) => {
                batch.update(ref, { inventoryLots: newLots });
                
                // Log every lot deduction for the inventory ledger
                fulfilled.forEach((f: any) => {
                    const adjustmentRef = doc(collection(firestore, 'productGroups', groupId, 'productVariants', variantId, 'stockAdjustments'));
                    const logData: Omit<StockAdjustmentTransaction, 'id' | 'createdAt'> = {
                        productVariantId: variantId,
                        lotId: f.lotId,
                        adminUserId: user?.id || 'system',
                        adminName: user?.name || 'ระบบอัตโนมัติ',
                        type: 'SALE',
                        quantity: f.quantity,
                        reason: `ตัดสต็อกสำหรับคำสั่งซื้อ #${orderRef.id.substring(0, 8)}`,
                    };
                    batch.set(adjustmentRef, { ...logData, createdAt: serverTimestamp() });
                });
            });

            if (pointsToUse > 0) {
                const userRef = doc(firestore, 'users', effectiveUser.id);
                batch.update(userRef, { pointsBalance: increment(-pointsToUse) });
            }
            
            await batch.commit();
            toast({ title: 'สร้างคำสั่งซื้อสำเร็จ!', description: impersonatedUser ? `สร้างออเดอร์ให้ ${impersonatedUser.name} เรียบร้อยแล้ว` : 'กำลังนำคุณไปยังหน้าชำระเงิน...' });
            
            if (impersonatedUser) {
                // สำหรับแอดมิน: ให้หยุดโหมดสั่งแทนลูกค้า และเด้งกลับไปหน้าจัดการออเดอร์หลัก
                stopImpersonation();
            } else {
                router.push(`/payment/${orderRef.id}`);
            }
        } catch (error: any) {
            console.error("Error placing order: ", error);
            toast({ variant: "destructive", title: "การสั่งซื้อล้มเหลว", description: error.message || "เกิดข้อผิดพลาดในการสั่งซื้อ กรุณาลองใหม่อีกครั้ง" });
            setIsProcessing(false);
        }
    }

    const openEditAddress = (address: Address) => {
        setAddressToEdit(address);
        setIsAddressFormOpen(true);
    };

    const openAddAddress = () => {
        setAddressToEdit(null);
        setIsAddressFormOpen(true);
    };
  
    return (
        <div className="max-w-7xl mx-auto">
            <div className="mb-6">
                <Button variant="ghost" asChild className="-ml-4 text-muted-foreground hover:text-foreground">
                    <Link href="/cart">
                        <ChevronLeft className="mr-2 h-4 w-4" />
                        กลับไปที่ตะกร้าสินค้า
                    </Link>
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
                <div className="lg:col-span-3 space-y-6">
                    {itemsWithStockIssues.length > 0 && (
                        <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-4">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle className="font-bold">สินค้าบางรายการไม่เพียงพอ</AlertTitle>
                            <AlertDescription>
                                สินค้า <strong>{itemsWithStockIssues.map(i => i.item.name).join(', ')}</strong> ถูกลูกค้าท่านอื่นจองหรือสั่งซื้อไปก่อนหน้า ทำให้สต็อกไม่เพียงพอในขณะนี้ 
                                <p className="mt-2 text-xs">กรุณาย้อนกลับไปที่ตะกร้าเพื่อปรับลดจำนวนหรือเลือกสินค้าอื่นแทนครับ</p>
                            </AlertDescription>
                        </Alert>
                    )}

                    {selectedBranch?.freeShippingEnabled && (
                        <Alert className="bg-emerald-50 border-emerald-200 text-emerald-900 animate-in fade-in slide-in-from-top-4">
                            <ShieldCheck className="h-4 w-4 text-emerald-600" />
                            <AlertTitle className="font-bold">สิทธิ์การจัดส่งฟรีรายสาขา</AlertTitle>
                            <AlertDescription className="text-xs">
                                สาขานี้ได้รับสิทธิ์จัดส่งฟรี ระบบได้ปรับค่าส่งเป็น 0 บาท และล็อกตัวเลือกที่ดีที่สุดไว้ให้คุณโดยอัตโนมัติแล้วครับ
                            </AlertDescription>
                        </Alert>
                    )}

                    <Card>
                        <CardHeader className="pb-4">
                            <CardTitle className="font-headline text-2xl flex items-center gap-2"><Store className="h-6 w-6"/>เลือกสาขาที่สั่งซื้อ</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {branchesLoading ? (
                                <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
                            ) : userBranches && userBranches.length > 0 ? (
                                <RadioGroup value={selectedBranchId} onValueChange={setSelectedBranchId} className="grid gap-3">
                                    {userBranches.map(branch => (
                                        <div 
                                            key={branch.id} 
                                            className={cn(
                                                "relative border rounded-md p-4 transition-all", 
                                                selectedBranchId === branch.id ? "border-primary ring-2 ring-primary bg-primary/5" : "hover:border-primary/50"
                                            )}
                                        >
                                            <Label htmlFor={`branch-${branch.id}`} className="flex items-center gap-4 cursor-pointer">
                                                <RadioGroupItem value={branch.id} id={`branch-${branch.id}`} />
                                                <div className="flex-1">
                                                    <div className="flex items-center justify-between">
                                                        <p className="font-semibold">{branch.name}</p>
                                                        {branch.freeShippingEnabled && <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200 h-5 text-[10px]">ส่งฟรี</Badge>}
                                                    </div>
                                                    <p className="text-xs text-muted-foreground">{branch.branchCode} • {branch.district}, {branch.province}</p>
                                                </div>
                                            </Label>
                                        </div>
                                    ))}
                                </RadioGroup>
                            ) : (
                                <Alert variant="default" className="bg-amber-50 border-amber-200">
                                    <Info className="h-4 w-4 text-amber-600" />
                                    <AlertTitle className="text-amber-800">ไม่พบข้อมูลสาขา</AlertTitle>
                                    <AlertDescription className="text-amber-700">
                                        {impersonatedUser ? `คุณ ${impersonatedUser.name} ยังไม่มีข้อมูลสาขาในระบบ` : 'คุณยังไม่มีข้อมูลสาขาในระบบ กรุณาติดต่อผู้ดูแลระบบเพื่อเพิ่มข้อมูลสาขาสำหรับการสั่งซื้อ'}
                                    </AlertDescription>
                                </Alert>
                            )}
                        </CardContent>
                    </Card>

                    {hasPhysicalItems && (
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                                <CardTitle className="font-headline text-2xl flex items-center gap-2"><MapPin className="h-6 w-6"/>ที่อยู่สำหรับจัดส่ง</CardTitle>
                                <Button variant="outline" size="sm" onClick={openAddAddress} className="h-8">
                                    <PlusCircle className="mr-2 h-4 w-4" />
                                    เพิ่มที่อยู่ใหม่
                                </Button>
                            </CardHeader>
                            <CardContent>
                            {addressesLoading ? <p>กำลังโหลดที่อยู่...</p> : (
                                <RadioGroup value={selectedAddress?.id} onValueChange={(id) => setSelectedAddress(addresses?.find(a => a.id === id) || null)} className="grid gap-3">
                                    {addresses?.map(address => (
                                        <div 
                                            key={address.id} 
                                            className={cn(
                                                "relative border rounded-md p-4 transition-all", 
                                                selectedAddress?.id === address.id ? "border-primary ring-2 ring-primary bg-primary/5" : "hover:border-primary/50"
                                            )}
                                        >
                                            <div className="flex justify-between items-start gap-4">
                                                <Label htmlFor={address.id} className="flex items-start gap-4 cursor-pointer flex-1">
                                                    <RadioGroupItem value={address.id} id={address.id} className="mt-1" />
                                                    <div className="text-sm">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <p className="font-semibold">{address.name}, {address.phone}</p>
                                                            {address.isDefault && <Badge variant="secondary" className="h-5 text-[10px] px-1.5 font-normal">ที่อยู่หลัก</Badge>}
                                                        </div>
                                                        <p className="text-muted-foreground mt-1 line-clamp-2">{`${address.addressLine1}${address.addressLine2 ? ', ' + address.addressLine2 : ''}, ${address.subdistrict}, ${address.district}, ${address.province} ${address.postalCode}`}</p>
                                                    </div>
                                                </Label>
                                                <Button 
                                                    variant="ghost" 
                                                    size="icon" 
                                                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted"
                                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); openEditAddress(address); }}
                                                >
                                                    <Edit className="h-4 w-4" />
                                                    <span className="sr-only">แก้ไขที่อยู่</span>
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </RadioGroup>
                            )}
                            {(!addresses || addresses.length === 0) && !addressesLoading && (
                                    <p className="text-center text-muted-foreground p-4">ไม่พบที่อยู่, กรุณาเพิ่มที่อยู่ใหม่เพื่อดำเนินการต่อ</p>
                            )}
                            </CardContent>
                        </Card>
                    )}

                    {hasPhysicalItems && (
                        <Card>
                            <CardHeader><CardTitle className="font-headline text-2xl flex items-center gap-2"><Truck className="h-6 w-6"/>วิธีจัดส่ง</CardTitle></CardHeader>
                            <CardContent>
                                <RadioGroup 
                                    value={selectedShippingMethodId} 
                                    onValueChange={setSelectedShippingMethodId} 
                                    className="grid gap-3"
                                    disabled={selectedBranch?.freeShippingEnabled}
                                >
                                    <div className={cn(
                                        "relative border rounded-md p-4 transition-all", 
                                        selectedShippingMethodId === 'weight-based' ? "border-primary ring-2 ring-primary bg-primary/5" : "hover:border-primary/50",
                                        selectedBranch?.freeShippingEnabled && selectedShippingMethodId !== 'weight-based' && "opacity-50"
                                    )}>
                                        <Label htmlFor="method-weight" className={cn("flex items-center justify-between", (selectedBranch?.freeShippingEnabled && selectedShippingMethodId !== 'weight-based') ? "cursor-not-allowed" : "cursor-pointer")}>
                                            <div className="flex items-center gap-4">
                                                <RadioGroupItem value="weight-based" id="method-weight" disabled={selectedBranch?.freeShippingEnabled && selectedShippingMethodId !== 'weight-based'} />
                                                <div>
                                                    <p className="font-semibold">จัดส่งตามน้ำหนัก / ค่าจัดส่งคงที่</p>
                                                    <p className="text-xs text-muted-foreground">คำนวณตามที่อยู่จัดส่งและน้ำหนักสินค้าในตะกร้า</p>
                                                </div>
                                            </div>
                                            {isSettingsLoading ? (
                                                <Skeleton className="h-5 w-16" />
                                            ) : (
                                                <p className={cn("font-bold", selectedBranch?.freeShippingEnabled && "text-emerald-600")}>
                                                    {selectedBranch?.freeShippingEnabled ? 'ฟรี' : `฿${calculateTotalShipping(cartItems, storeSettings?.defaultShippingRates || { baseRate: 0, stepRate: 0, blockRate: 0 }).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`}
                                                </p>
                                            )}
                                        </Label>
                                    </div>

                                    {selectedBranch?.lalamoveConfig?.enabled && selectedBranch.lalamoveConfig.vehicles.map((v) => {
                                        const isOverCapacity = totalCapacityUnits > v.maxCapacity;
                                        const isSelected = selectedShippingMethodId === `lalamove-${v.id}`;
                                        return (
                                            <div key={v.id} className={cn(
                                                "relative border rounded-md p-4 transition-all", 
                                                isSelected ? "border-primary ring-2 ring-primary bg-primary/5" : "hover:border-primary/50",
                                                (isOverCapacity || (selectedBranch?.freeShippingEnabled && !isSelected)) && "opacity-60 bg-muted/20"
                                            )}>
                                                <Label htmlFor={`lalamove-${v.id}`} className={cn("flex items-center justify-between", (isOverCapacity || (selectedBranch?.freeShippingEnabled && !isSelected)) ? "cursor-not-allowed" : "cursor-pointer")}>
                                                    <div className="flex items-center gap-4">
                                                        <RadioGroupItem value={`lalamove-${v.id}`} id={`lalamove-${v.id}`} disabled={isOverCapacity || (selectedBranch?.freeShippingEnabled && !isSelected)} />
                                                        <div>
                                                            <p className="font-semibold flex items-center gap-2">
                                                                <Car className="h-4 w-4 text-blue-600" />
                                                                Lalamove ({v.type})
                                                            </p>
                                                            <div className="flex flex-col gap-1 mt-1">
                                                                <div className="flex items-center gap-2">
                                                                    <Progress value={Math.min(100, (totalCapacityUnits / v.maxCapacity) * 100)} className={cn("h-1.5 w-24", isOverCapacity ? "[&>div]:bg-destructive" : "[&>div]:bg-blue-500")} />
                                                                    <span className={cn("text-[10px] font-bold", isOverCapacity ? "text-destructive" : "text-blue-600")}>
                                                                        {totalCapacityUnits.toFixed(1)} / {v.maxCapacity} หน่วย
                                                                    </span>
                                                                </div>
                                                                {isOverCapacity && (
                                                                    <p className="text-[10px] text-destructive font-bold flex items-center gap-1">
                                                                        <AlertTriangle className="h-3 w-3" /> สินค้าในตะกร้ามีปริมาตรเกินความจุรถรุ่นนี้
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <p className={cn("font-bold", selectedBranch?.freeShippingEnabled ? "text-emerald-600" : "text-blue-600")}>
                                                        {selectedBranch?.freeShippingEnabled ? 'ฟรี' : `฿${v.price.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`}
                                                    </p>
                                                </Label>
                                            </div>
                                        );
                                    })}
                                </RadioGroup>
                            </CardContent>
                        </Card>
                    )}

                    {!hasPhysicalItems && (
                        <Alert className="bg-primary/5 border-primary/20">
                            <Briefcase className="h-4 w-4 text-primary" />
                            <AlertTitle className="text-primary font-bold">รายการสั่งซื้อเฉพาะงานบริการ</AlertTitle>
                            <AlertDescription>
                                รายการในตะกร้าของคุณเป็นงานบริการทั้งหมด จึงไม่มีค่าใช้จ่ายในการจัดส่ง
                            </AlertDescription>
                        </Alert>
                    )}
                </div>

                <div className="lg:col-span-2 sticky top-24">
                    <Card className="bg-[#FAF9F6] dark:bg-card border-[#E8E4D9] dark:border-border shadow-md">
                        <CardHeader>
                            <CardTitle className="font-headline text-xl text-[#4A3F35] dark:text-card-foreground">สรุปคำสั่งซื้อ</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <Accordion type="single" collapsible className="w-full">
                                <AccordionItem value="items" className="border-b-[#E8E4D9] dark:border-b-border">
                                    <AccordionTrigger className="hover:no-underline py-2 text-[#4A3F35] dark:text-card-foreground">
                                        <span>{cartCount} รายการ</span>
                                    </AccordionTrigger>
                                    <AccordionContent>
                                        <div className="space-y-3 pt-2">
                                            {cartItems.map((cartItem) => {
                                                let basePrice = 0;
                                                let taxRate = 7;
                                                let taxMode: TaxMode = 'INCLUSIVE';
                                                let isTaxable = true;

                                                if (cartItem.type === 'PRODUCT') {
                                                    const p = cartItem.item as Product;
                                                    basePrice = cartItem.lotPrice ?? getPriceForQuantity(p, cartItem.quantity);
                                                    taxRate = p.taxRate ?? 7;
                                                    taxMode = p.taxMode || 'INCLUSIVE';
                                                    isTaxable = p.taxStatus !== 'EXEMPT';
                                                } else if (cartItem.type === 'PACKAGE') {
                                                    basePrice = (cartItem.item as ProductPackage).price;
                                                } else {
                                                    const s = cartItem.item as Service;
                                                    basePrice = s.price;
                                                    taxRate = s.taxRate ?? 7;
                                                    taxMode = s.taxMode || 'INCLUSIVE';
                                                    isTaxable = s.taxStatus !== 'EXEMPT';
                                                }

                                                let displayLinePrice = basePrice;
                                                if (isTaxable && taxMode === 'EXCLUSIVE') {
                                                    displayLinePrice = basePrice * (1 + (taxRate/100));
                                                }

                                                const itemStockIssue = itemsWithStockIssues.some(i => i.id === cartItem.id);

                                                return (
                                                    <div key={cartItem.id} className="flex justify-between text-sm">
                                                        <span className={cn("text-muted-foreground line-clamp-1 flex-1 pr-4", itemStockIssue && "text-destructive line-through")}>
                                                            {cartItem.type === 'SERVICE' && <Briefcase className="h-3 w-3 inline mr-1" />}
                                                            {cartItem.item.name} x {cartItem.quantity}
                                                            {itemStockIssue && <span className="ml-2 font-bold text-[10px]">(ไม่พอ)</span>}
                                                        </span>
                                                        <span className={cn("font-medium", itemStockIssue && "text-destructive line-through")}>฿{(displayLinePrice * cartItem.quantity).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            </Accordion>

                            <div className="space-y-3">
                                <div className="flex flex-col gap-1">
                                    <p className="text-sm font-medium text-[#4A3F35] dark:text-card-foreground">
                                        ใช้คะแนนเป็นส่วนลด (ใช้ได้ {(effectiveUser?.pointsBalance ?? 0).toLocaleString()} คะแนน)
                                    </p>
                                    <p className="text-[10px] text-muted-foreground font-bold uppercase">
                                        * จำกัดสูงสุด 500 คะแนน ต่อรอบ ต่อวัน
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <Input 
                                        placeholder="กรอกคะแนน" 
                                        value={pointsInput} 
                                        onChange={(e) => {
                                            const val = e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
                                            setPointsInput(val);
                                            if (val === '') {
                                                setPointsToUse(0);
                                                setPointsDiscount(0);
                                            }
                                        }}
                                        className="bg-white dark:bg-background border-[#E8E4D9] dark:border-border focus-visible:ring-[#8B7E66] dark:focus-visible:ring-ring"
                                    />
                                    <Button onClick={handleApplyPoints} variant="secondary" className="bg-[#C4B5A2] dark:bg-secondary hover:bg-[#B3A491] dark:hover:bg-secondary/80 text-white shrink-0">ใช้คะแนน</Button>
                                </div>
                                <div className="flex justify-between items-center text-[10px] text-muted-foreground">
                                    <span>1 คะแนน = {storeSettings?.pointValue ?? 1} บาท</span>
                                    {pointsUsedToday > 0 && <span>วันนี้ใช้ไปแล้ว: {pointsUsedToday} คะแนน</span>}
                                </div>
                            </div>

                            <Separator className="bg-[#E8E4D9] dark:bg-border" />

                            <div className="space-y-3">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-muted-foreground flex items-center gap-1.5"><ReceiptText className="h-3.5 w-3.5" /> มูลค่าก่อนภาษี</span>
                                    <span className="font-medium">฿{taxSummary.subtotalBeforeTax.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-muted-foreground flex items-center gap-1.5"><Percent className="h-3.5 w-3.5" /> ภาษีมูลค่าเพิ่ม ({taxSummary.defaultTaxRate}%)</span>
                                    <span className="font-medium">฿{taxSummary.taxAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-muted-foreground flex items-center gap-1.5"><Truck className="h-3.5 w-3.5" /> ค่าจัดส่ง</span>
                                    <span className={cn("font-medium", selectedBranch?.freeShippingEnabled && "text-emerald-600 font-bold")}>
                                        {selectedBranch?.freeShippingEnabled ? 'ฟรี' : `฿${shippingCost.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                    </span>
                                </div>
                                {pointsDiscount > 0 && (
                                    <div className="flex justify-between text-primary text-sm">
                                        <span>ส่วนลดจากคะแนน ({pointsToUse.toLocaleString()} คะแนน)</span>
                                        <span className="font-medium">- ฿{pointsDiscount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    </div>
                                )}
                                <div className="flex justify-between items-center pt-1 border-t border-dashed mt-2">
                                    <div className="flex items-center gap-1.5 text-green-600 font-medium text-xs">
                                        <Star className="h-3.5 w-3.5" />
                                        <span>คะแนนที่จะได้รับ</span>
                                    </div>
                                    <span className="text-green-600 font-bold text-sm">+{pointsToEarn.toLocaleString()}</span>
                                </div>
                            </div>

                            <Separator className="bg-[#E8E4D9] dark:bg-border" />

                            <div className="flex justify-between items-center">
                                <span className="text-lg font-bold text-[#4A3F35] dark:text-card-foreground">ยอดสุทธิ (รวมภาษี)</span>
                                <span className="text-xl font-bold text-[#4A3F35] dark:text-card-foreground">
                                    {isSettingsLoading ? <Skeleton className="h-2 w-24" /> : `฿${grandTotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                </span>
                            </div>
                        </CardContent>
                        <CardFooter className="pt-2">
                            <Button 
                                onClick={handlePlaceOrder} 
                                className="w-full h-12 bg-[#8B7E66] dark:bg-primary hover:bg-[#7A6D55] dark:hover:bg-primary/90 text-base font-semibold" 
                                disabled={isProcessing || (hasPhysicalItems && !selectedAddress) || isSettingsLoading || (userBranches && userBranches.length > 0 && !selectedBranchId) || itemsWithStockIssues.length > 0}
                            >
                                {isProcessing || isSettingsLoading ? (
                                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{isProcessing ? 'กำลังดำเนินการ...' : 'กำลังคำนวณ...'}</>
                                ) : (
                                    impersonatedUser ? 'สร้างคำสั่งซื้อส่งให้ลูกค้า' : 'ดำเนินการต่อเพื่อชำระเงิน'
                                )}
                            </Button>
                        </CardFooter>
                    </Card>
                </div>
            </div>

            {effectiveUser && (
                <AddressFormDialog 
                    userId={effectiveUser.id}
                    isOpen={isAddressFormOpen}
                    onClose={() => setIsAddressFormOpen(false)}
                    onSuccess={() => setIsAddressFormOpen(false)}
                    addressToEdit={addressToEdit}
                />
            )}
        </div>
    );
}

export default function CheckoutPage() {
  const { user, loading, impersonatedUser } = useAuth();
  const { cartCount } = useCart();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user || (user.role !== 'seller' && !impersonatedUser)) {
        router.replace('/login');
      } else if (cartCount === 0) {
        router.replace('/shop');
      }
    }
  }, [user, loading, router, cartCount, impersonatedUser]);
  
  if (loading || !user || (user.role !== 'seller' && !impersonatedUser) || cartCount === 0) {
    return <div className="h-screen w-screen flex items-center justify-center bg-background"><div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <ImpersonationBanner />
      <Header />
      <main className="py-8 px-2 sm:px-6 lg:px-8">
        <CheckoutPageContents />
      </main>
    </div>
  );
}
