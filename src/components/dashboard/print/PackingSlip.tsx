
'use client';

import React from 'react';
import type { Order, SenderAddress } from '@/lib/types';
import type { EnrichedOrderItem } from './PrintDialog';
import { formatInTimeZone } from 'date-fns-tz';
import { th } from 'date-fns/locale';

export function PackingSlip({ order, orderItems, senderAddress }: { order: Order; orderItems: EnrichedOrderItem[]; senderAddress: SenderAddress }) {
    return (
        <div className="packing-slip-container">
            <div className="header-section">
                <div>
                    <h1>ใบจัดของ/ส่งของ</h1>
                    <p>Packing Slip / Delivery Note</p>
                </div>
                <div className="order-details">
                    <p><strong>เลขที่ออเดอร์:</strong> #{order.id.substring(0, 8)}</p>
                    <p><strong>วันที่สั่ง:</strong> {formatInTimeZone(order.orderDate.toDate(), 'Asia/Bangkok', 'd MMM yyyy', { locale: th })}</p>
                </div>
            </div>
            <div className="address-section">
                <div className="address-box">
                    <h3>ผู้ส่ง (FROM)</h3>
                    <p>{senderAddress.name}</p>
                    <p>{senderAddress.street}</p>
                    <p>{senderAddress.subdistrict}, {senderAddress.district}</p>
                    <p>{senderAddress.province} {senderAddress.postalCode}</p>
                    <p>โทร: {senderAddress.phone}</p>
                </div>
                <div className="address-box">
                    <h3>ผู้รับ (TO)</h3>
                    <p>{order.shippingAddress.name}</p>
                    <p>{order.shippingAddress.addressLine1}{order.shippingAddress.addressLine2 ? `, ${order.shippingAddress.addressLine2}` : ''}</p>
                    <p>{order.shippingAddress.subdistrict}, {order.shippingAddress.district}</p>
                    <p>{order.shippingAddress.province} {order.shippingAddress.postalCode}</p>
                    <p>โทร: {order.shippingAddress.phone}</p>
                </div>
            </div>
            <table className="items-table">
                <thead>
                    <tr>
                        <th className="checkbox-cell">จัด</th>
                        <th className="sku-cell">รหัสสินค้า</th>
                        <th className="name-cell">ชื่อสินค้า</th>
                        <th className="quantity-cell">จำนวน</th>
                    </tr>
                </thead>
                <tbody>
                    {orderItems.map((item, i) => (
                        <tr key={item.id || i}>
                            <td className="checkbox-cell"><div className="print-checkbox"></div></td>
                            <td className="sku-cell">{item.sku || 'N/A'}</td>
                            <td className="name-cell">{item.productName}</td>
                            <td className="quantity-cell"><strong>{item.quantity}</strong></td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
