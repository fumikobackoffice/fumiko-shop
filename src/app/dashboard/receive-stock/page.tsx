import { getPurchaseOrders } from '@/app/actions';
import { ReceiveStockClient } from '@/components/dashboard/receive-stock-client';
import { PurchaseOrder } from '@/lib/types';

export default async function ReceiveStockHubPage() {
  // Fetch data on the server
  const { purchaseOrders, supplierMap } = await getPurchaseOrders();

  // The server action returns purchaseOrders with serialized dates (ISO strings).
  // Convert them back to Date objects for the client component.
  const purchaseOrdersWithDates = purchaseOrders.map(po => ({
    ...po,
    orderDate: new Date(po.orderDate),
    expectedDeliveryDate: po.expectedDeliveryDate ? new Date(po.expectedDeliveryDate) : null,
    createdAt: po.createdAt ? new Date(po.createdAt) : null,
    updatedAt: po.updatedAt ? new Date(po.updatedAt) : null,
  })) as PurchaseOrder[];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-headline font-bold">รับสินค้าเข้าคลัง</h1>
      </div>
      <ReceiveStockClient purchaseOrders={purchaseOrdersWithDates} supplierMap={supplierMap} />
    </div>
  );
}
