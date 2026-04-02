import type { ProductVariant, InventoryLot } from './types';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';

/**
 * แปลง receivedAt (Timestamp / Date / string) เป็น Date
 */
function toDate(val: any): Date {
  if (!val) return new Date(0);
  if (val.toDate) return val.toDate(); // Firestore Timestamp
  if (val instanceof Date) return val;
  return new Date(val);
}

/**
 * เรียงล็อตตาม FIFO (ล็อตเก่าสุดก่อน)
 */
function sortLotsFIFO(lots: InventoryLot[]): InventoryLot[] {
  return [...lots].sort((a, b) => toDate(a.receivedAt).getTime() - toDate(b.receivedAt).getTime());
}

/**
 * คืนราคาแสดงจาก FIFO first lot (ล็อตแรกที่มีสต็อก)
 * ถ้าไม่มี sellingPrice → fallback ไปที่ variant.price
 */
export function getDisplayPrice(variant: ProductVariant): number {
  const sortedLots = sortLotsFIFO(variant.inventoryLots || []);
  const firstLotWithStock = sortedLots.find(lot => lot.quantity > 0);
  return firstLotWithStock?.sellingPrice ?? variant.price;
}

/**
 * คืน sellingPrice ของล็อตล่าสุด (receivedAt ใหม่สุด) สำหรับ auto-fill
 * คืน undefined ถ้าเป็นสินค้าใหม่ (ไม่มีล็อตเก่า)
 */
export function getLatestLotSellingPrice(variant: ProductVariant): number | undefined {
  const lots = variant.inventoryLots || [];
  if (lots.length === 0) return undefined;
  
  const sortedDesc = [...lots].sort((a, b) => toDate(b.receivedAt).getTime() - toDate(a.receivedAt).getTime());
  return sortedDesc[0]?.sellingPrice ?? undefined;
}

/**
 * สร้างป้ายกำกับล็อต จากข้อมูล PO number + วันที่รับ
 * เช่น "PO-2024001 (10/01/67)" หรือ "ล็อต 10/01/67" (ถ้าไม่มี PO)
 */
export function buildLotLabel(lot: InventoryLot): string {
  const dateStr = format(toDate(lot.receivedAt), 'dd/MM/yy', { locale: th });
  if (lot.purchaseOrderNumber) {
    return `${lot.purchaseOrderNumber} (${dateStr})`;
  }
  return `ล็อต ${dateStr}`;
}

/**
 * กำหนด effective selling price ของล็อต
 * ถ้ามี sellingPrice → ใช้
 * ถ้าไม่มี → ใช้ variant.price (fallback)
 */
function getEffectiveLotPrice(lot: InventoryLot, variantPrice: number): number {
  return lot.sellingPrice ?? variantPrice;
}

/**
 * ข้อมูลที่คืนจาก allocateLotsForCart()
 */
export type CartLotAllocation = {
  price: number;           // ราคาขายต่อหน่วย
  quantity: number;        // จำนวนที่จัดสรร
  maxAvailable: number;    // สต็อกสูงสุดของกลุ่มราคานี้
  lotLabel: string | null; // ป้ายกำกับล็อต (null = ไม่ต้องแสดง)
  lotIds: string[];        // lotId ที่อยู่ในกลุ่มนี้
};

/**
 * จัดสรรล็อตสำหรับตะกร้า — แยกตามราคา
 * 
 * กฎ:
 * - ล็อตที่ราคาเท่ากัน → รวมเป็น 1 group (ไม่บอกเลขล็อต)
 * - ล็อตที่ราคาต่างกัน → แยกเป็น group ใหม่ (บอกเลขล็อต)
 * - เรียงตาม FIFO (ล็อตเก่าก่อน)
 * 
 * @param variant - Product variant ที่มี inventoryLots
 * @param totalQuantity - จำนวนที่ต้องการ
 * @returns Array ของ allocation groups
 */
export function allocateLotsForCart(
  variant: ProductVariant,
  totalQuantity: number
): CartLotAllocation[] {
  const lots = sortLotsFIFO(variant.inventoryLots || []).filter(l => l.quantity > 0);
  if (lots.length === 0) return [];

  // Step 1: จัดกลุ่มตามราคา (FIFO order preserved)
  const priceGroups: Map<number, { lots: InventoryLot[]; totalStock: number }> = new Map();
  
  for (const lot of lots) {
    const price = getEffectiveLotPrice(lot, variant.price);
    if (!priceGroups.has(price)) {
      priceGroups.set(price, { lots: [], totalStock: 0 });
    }
    const group = priceGroups.get(price)!;
    group.lots.push(lot);
    group.totalStock += lot.quantity;
  }

  // Step 2: ตรวจสอบว่ามีราคาเดียวหรือหลายราคา
  const hasMultiplePrices = priceGroups.size > 1;

  // Step 3: จัดสรรจำนวนตาม FIFO
  const allocations: CartLotAllocation[] = [];
  let remaining = totalQuantity;

  for (const [price, group] of priceGroups) {
    if (remaining <= 0) break;

    const take = Math.min(remaining, group.totalStock);
    
    // สร้าง label: ถ้ามีหลายราคา → บอกล็อต, ราคาเดียว → ไม่บอก
    let lotLabel: string | null = null;
    if (hasMultiplePrices) {
      // ใช้ label ของล็อตแรกในกลุ่ม (เพราะรวมล็อตราคาเดียวกัน)
      const labels = group.lots.map(lot => buildLotLabel(lot));
      lotLabel = labels.length === 1 ? labels[0] : labels[0] + (labels.length > 1 ? ` (+${labels.length - 1})` : '');
    }

    allocations.push({
      price,
      quantity: take,
      maxAvailable: group.totalStock,
      lotLabel,
      lotIds: group.lots.map(l => l.lotId),
    });

    remaining -= take;
  }

  return allocations;
}

/**
 * สร้าง cart item ID ที่รองรับราคาล็อต
 * ราคาเท่ากัน → id เดียวกัน → รวมรายการ
 * ราคาต่างกัน → id ต่างกัน → แยกรายการ
 */
export function buildCartItemId(variantId: string, lotPrice?: number): string {
  if (lotPrice != null) {
    return `${variantId}:${lotPrice}`;
  }
  return variantId;
}

/**
 * ดึง variantId จาก cart item ID
 */
export function extractVariantId(cartItemId: string): string {
  return cartItemId.split(':')[0];
}
