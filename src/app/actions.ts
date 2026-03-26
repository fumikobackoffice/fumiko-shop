
'use server';

import { unstable_noStore as noStore } from 'next/cache';
import { adminDb } from '@/lib/firebase-admin';
import { Order, UserProfile, ProductGroup, ProductVariant, ProductPackage, Supplier, PurchaseOrder, ProductCategory, OrderItem, BankAccount, Branch, FeeInvoice, FeeItemTemplate, ServiceCategory, Service, StockAdjustmentTransaction, StoreSettings } from '@/lib/types';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { format, subMonths, startOfMonth, endOfMonth, eachMonthOfInterval, getDaysInMonth, addDays, differenceInCalendarDays, addMonths, addYears, isBefore, isAfter, isEqual } from 'date-fns';
import { th } from 'date-fns/locale';
import { toZonedTime, formatInTimeZone } from 'date-fns-tz';

// Timezone constant for Thailand
const TIMEZONE = 'Asia/Bangkok';

/**
 * ข้อมูลจำลองจากระบบเก่า (Legacy Data) 
 * สำหรับเดือนที่ไม่ได้บันทึกไว้ในระบบปัจจุบัน เพื่อใช้แสดงผลสถิติภาพรวม
 */
const DASHBOARD_LEGACY_DATA: Record<string, { sales: number; cost: number; profit: number; orders: number }> = {
    "2025-08": { sales: 81506.00, cost: 45224.15, profit: 36281.85, orders: 26 },
    "2025-09": { sales: 126451.00, cost: 74769.58, profit: 51681.42, orders: 37 },
    "2025-10": { sales: 164801.00, cost: 97762.79, profit: 67038.21, orders: 45 },
    "2025-11": { sales: 206726.00, cost: 124722.16, profit: 82003.84, orders: 50 },
    "2025-12": { sales: 243560.00, cost: 147276.36, profit: 96283.64, orders: 73 },
    "2026-01": { sales: 171915.00, cost: 101669.57, profit: 70245.43, orders: 50 },
    "2026-02": { sales: 174395.00, cost: 103010.42, profit: 71384.58, orders: 55 },
};

/**
 * Helper to convert Firestore Timestamps, JS Dates, and complex objects to JSON-serializable format.
 */
const serializeTimestamps = (obj: any): any => {
    if (obj === undefined) return null;
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }

    if (typeof obj.toDate === 'function') {
        try {
            return obj.toDate().toISOString();
        } catch (e) {
            return null;
        }
    }

    if (obj instanceof Date) {
        return obj.toISOString();
    }

    if (obj.constructor && (obj.constructor.name === 'DocumentReference' || obj.constructor.name === 'CollectionReference')) {
        return obj.path;
    }

    if (Array.isArray(obj)) {
        return obj.map(serializeTimestamps);
    }

    const newObj: { [key: string]: any } = {};
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const value = serializeTimestamps(obj[key]);
            newObj[key] = value === undefined ? null : value;
        }
    }
    return newObj;
};

const getUnixTime = (date: any) => {
    if (!date) return 0;
    if (date.toDate) return date.toDate().getTime();
    if (typeof date === 'string') return new Date(date).getTime();
    if (date instanceof Date) return date.getTime();
    if (date?._seconds) return date._seconds * 1000;
    return 0;
};

// --- Settings ---
export async function getStoreSettings() {
    noStore();
    if (!adminDb) return null;
    const doc = await adminDb.collection('settings').doc('store').get();
    if (!doc.exists) return null;
    return serializeTimestamps(doc.data()) as StoreSettings;
}

// --- Global Points Distribution ---
export async function distributeGlobalPoints(amount: number, reason: string, adminId: string, adminName: string, excludedUserIds: string[] = []) {
    noStore();
    if (!adminDb) throw new Error('Admin Firestore is not initialized.');
    
    try {
        const sellersSnap = await adminDb.collection('users')
            .where('role', '==', 'seller')
            .where('status', '==', 'active')
            .get();

        if (sellersSnap.empty) {
            return { success: true, count: 0 };
        }

        const sellers = sellersSnap.docs.filter(doc => !excludedUserIds.includes(doc.id));
        
        if (sellers.length === 0) {
            return { success: true, count: 0 };
        }
        
        const chunkSize = 250;
        let processedCount = 0;
        
        for (let i = 0; i < sellers.length; i += chunkSize) {
            const chunk = sellers.slice(i, i + chunkSize);
            const batch = adminDb.batch();
            
            chunk.forEach(userDoc => {
                const userId = userDoc.id;
                const userRef = adminDb!.collection('users').doc(userId);
                const txRef = adminDb!.collection('users').doc(userId).collection('pointTransactions').doc();
                
                batch.update(userRef, { 
                    pointsBalance: FieldValue.increment(amount),
                    updatedAt: FieldValue.serverTimestamp()
                });

                batch.set(txRef, {
                    userId,
                    type: amount > 0 ? 'ADJUSTMENT_ADD' : 'ADJUSTMENT_DEDUCT',
                    amount,
                    description: reason,
                    createdAt: FieldValue.serverTimestamp(),
                    processedById: adminId,
                    processedByName: adminName
                });
                
                processedCount++;
            });

            await batch.commit();
        }

        const auditRef = adminDb.collection('auditLogs').doc();
        await auditRef.set({
            adminUserId: adminId,
            adminName: adminName,
            action: 'GLOBAL_POINTS_DISTRIBUTION',
            targetId: 'SYSTEM',
            details: { amount, reason, affectedUsers: processedCount, excludedCount: excludedUserIds.length },
            createdAt: FieldValue.serverTimestamp()
        });

        return { success: true, count: processedCount };
    } catch (error: any) {
        console.error("Global distribution failed:", error);
        throw new Error(error.message || "ไม่สามารถแจกคะแนนได้");
    }
}

// --- Branches ---
export async function getBranches() {
    noStore();
    if (!adminDb) throw new Error('Admin Firestore is not initialized.');
    const snapshot = await adminDb.collection('branches').get();
    const branches = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    branches.sort((a: any, b: any) => getUnixTime(b.createdAt) - getUnixTime(a.createdAt));
    return serializeTimestamps(branches) as Branch[];
}

export async function getExpiringBranches() {
    noStore();
    if (!adminDb) throw new Error('Admin Firestore is not initialized.');
    
    const now = toZonedTime(new Date(), TIMEZONE);
    const thirtyDaysFromNow = addDays(now, 30);

    const snapshot = await adminDb.collection('branches')
        .where('status', '!=', 'CLOSED')
        .get();

    const branches = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Branch));
    
    const expiring = branches.filter(branch => {
        const activeContracts = (branch.contracts || []).filter(c => c.status === 'ACTIVE');
        if (activeContracts.length === 0) return false;
        
        const latestExpiry = activeContracts.reduce((latest, current) => {
            const currentExpiry = getUnixTime(current.expiryDate);
            return currentExpiry > latest ? currentExpiry : latest;
        }, 0);

        if (latestExpiry === 0) return false;
        return latestExpiry <= thirtyDaysFromNow.getTime();
    }).sort((a, b) => {
        const aExpiry = (a.contracts || []).filter(c => c.status === 'ACTIVE').reduce((max, c) => Math.max(max, getUnixTime(c.expiryDate)), 0);
        const bExpiry = (b.contracts || []).filter(c => c.status === 'ACTIVE').reduce((max, c) => Math.max(max, getUnixTime(c.expiryDate)), 0);
        return aExpiry - bExpiry;
    });

    return serializeTimestamps(expiring) as Branch[];
}

// --- Brand Security Deposits Refund Alerts ---
export async function getDepositRefundAlerts() {
    noStore();
    if (!adminDb) throw new Error('Admin Firestore is not initialized.');
    
    const now = toZonedTime(new Date(), TIMEZONE);
    const thirtyDaysFromNow = addDays(now, 30);

    const snapshot = await adminDb.collection('branches')
        .where('status', '!=', 'CLOSED')
        .get();

    const branches = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Branch));
    
    const alerts = branches.filter(branch => {
        const activeContracts = (branch.contracts || []).filter(c => c.status === 'ACTIVE');
        if (activeContracts.length === 0) return false;
        
        const latestContract = [...activeContracts].sort((a, b) => getUnixTime(b.expiryDate) - getUnixTime(a.expiryDate))[0];
        if (!latestContract || !latestContract.securityDeposit || latestContract.securityDeposit <= 0) return false;

        const latestExpiry = getUnixTime(latestContract.expiryDate);
        return latestExpiry > 0 && latestExpiry <= thirtyDaysFromNow.getTime();
    }).map(branch => {
        const activeContracts = (branch.contracts || []).filter(c => c.status === 'ACTIVE');
        
        let totalInterest = 0;
        let totalPrincipal = 0;
        let latestExpiry = 0;
        let latestRate = 0;

        activeContracts.forEach(c => {
            const start = getUnixTime(c.startDate);
            const end = getUnixTime(c.expiryDate);
            if (!start || !end) return;

            if (end > latestExpiry) {
                latestExpiry = end;
                totalPrincipal = c.securityDeposit || 0;
                latestRate = c.interestRate ?? 4.5;
            }

            const rate = (c.interestRate ?? 4.5) / 100;
            const principal = c.securityDeposit || 0;
            const days = Math.max(0, differenceInCalendarDays(new Date(end), new Date(start)));
            totalInterest += principal * rate * (days / 365);
        });

        const totalRefund = totalPrincipal + totalInterest;

        return {
            branchId: branch.id,
            branchName: branch.name,
            branchCode: branch.branchCode,
            expiryDate: new Date(latestExpiry).toISOString(),
            principal: totalPrincipal,
            interest: totalInterest,
            interestRate: latestRate,
            totalRefund,
            daysRemaining: differenceInCalendarDays(new Date(latestExpiry), now)
        };
    }).sort((a, b) => a.daysRemaining - b.daysRemaining);

    return serializeTimestamps(alerts);
}

// --- Fees & Invoices ---
export async function getAdminFeeInvoices() {
    noStore();
    if (!adminDb) throw new Error('Admin Firestore is not initialized.');
    const snapshot = await adminDb.collection('feeInvoices').get();
    const invoices = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    invoices.sort((a: any, b: any) => getUnixTime(b.createdAt) - getUnixTime(a.createdAt));
    return serializeTimestamps(invoices) as FeeInvoice[];
}

export async function getSellerFeeInvoices(sellerId: string) {
    noStore();
    if (!adminDb) throw new Error('Admin Firestore is not initialized.');
    const snapshot = await adminDb.collection('feeInvoices')
        .where('ownerId', '==', sellerId)
        .get();
    const invoices = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    invoices.sort((a: any, b: any) => getUnixTime(b.createdAt) - getUnixTime(a.createdAt));
    return serializeTimestamps(invoices) as FeeInvoice[];
}

/**
 * ระบบออกบิลค่าธรรมเนียมอัตโนมัติ (Autonomous Billing)
 */
export async function syncRecurringInvoices(targetBranchId?: string) {
    noStore();
    if (!adminDb) throw new Error('Admin Firestore is not initialized.');
    
    const now = new Date();
    const today = toZonedTime(now, TIMEZONE);
    today.setHours(12, 0, 0, 0);

    let branchesToProcess: Branch[] = [];

    if (targetBranchId) {
        const branchSnap = await adminDb.collection('branches').doc(targetBranchId).get();
        if (branchSnap.exists) {
            branchesToProcess = [{ id: branchSnap.id, ...branchSnap.data() } as Branch];
        }
    } else {
        const branchesSnap = await adminDb.collection('branches')
            .where('status', 'in', ['OPERATING', 'FOLLOW_UP', 'SUSPENDED'])
            .get();
        branchesToProcess = branchesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Branch));
    }
    
    const results = { created: 0, skipped: 0 };

    for (const branch of branchesToProcess) {
        if (!branch.contracts || branch.contracts.length === 0) continue;

        const existingInvoicesSnap = await adminDb.collection('feeInvoices')
            .where('branchId', '==', branch.id)
            .get();
        
        const existingActiveBills = new Set(
            existingInvoicesSnap.docs
                .filter(d => d.data().status !== 'CANCELLED')
                .map(d => {
                    const data = d.data();
                    return `${data.contractIdKey || 'LEGACY'}_${data.feeRuleId || 'LEGACY'}_${data.billingPeriod}`;
                })
        );

        for (const contract of branch.contracts) {
            if (contract.status !== 'ACTIVE') continue;
            if (!contract.recurringFees || contract.recurringFees.length === 0) continue;

            const contractIdKey = contract.id || 'LEGACY';
            const billingEndDate = contract.expiryDate instanceof Timestamp 
                ? contract.expiryDate.toDate() 
                : (contract.expiryDate ? new Date(contract.expiryDate) : null);

            for (const rule of contract.recurringFees) {
                const ruleId = rule.id || 'LEGACY';
                let checkDate = rule.nextBillingDate instanceof Timestamp 
                    ? rule.nextBillingDate.toDate() 
                    : (rule.nextBillingDate ? new Date(rule.nextBillingDate) : null);

                if (!checkDate || isNaN(checkDate.getTime())) continue;
                
                checkDate = toZonedTime(checkDate, TIMEZONE);
                checkDate.setHours(12, 0, 0, 0);

                let isCalculating = true;
                let iterationCount = 0;
                const MAX_ITERATIONS = 500;

                while (isCalculating && iterationCount < MAX_ITERATIONS) {
                    iterationCount++;
                    if (!checkDate || isNaN(checkDate.getTime())) { isCalculating = false; break; }
                    if (isAfter(checkDate, today)) { isCalculating = false; break; }
                    if (billingEndDate && isAfter(checkDate, billingEndDate)) { isCalculating = false; break; }

                    const yearBE = checkDate.getFullYear() + 543;
                    const monthName = formatInTimeZone(checkDate, TIMEZONE, 'MMMM', { locale: th });
                    const labelStr = rule.label || 'ค่าธรรมเนียม';
                    const billingPeriod = `${labelStr} (${monthName} ${yearBE})`;
                    
                    const fingerprint = `${contractIdKey}_${ruleId}_${billingPeriod}`;
                    const legacyFingerprint = `${contractIdKey}_LEGACY_${billingPeriod}`;

                    if (!existingActiveBills.has(fingerprint) && !existingActiveBills.has(legacyFingerprint)) {
                        const invoiceRef = adminDb.collection('feeInvoices').doc();
                        const gracePeriod = rule.gracePeriodDays ?? 7;
                        const dueDate = addDays(checkDate, gracePeriod);
                        dueDate.setHours(23, 59, 59, 999);

                        await invoiceRef.set({
                            id: invoiceRef.id,
                            branchId: branch.id || '',
                            branchName: branch.name || 'ไม่ทราบชื่อสาขา',
                            ownerId: branch.ownerId || '',
                            amount: rule.amount || 0,
                            status: 'PENDING',
                            dueDate: Timestamp.fromDate(dueDate),
                            billingPeriod: billingPeriod,
                            contractIdKey: contractIdKey,
                            feeRuleId: ruleId,
                            createdAt: FieldValue.serverTimestamp(),
                            updatedAt: FieldValue.serverTimestamp(),
                        });
                        results.created++;
                        existingActiveBills.add(fingerprint);
                    } else {
                        results.skipped++;
                    }

                    if (rule.cycle === 'MONTHLY') checkDate = addMonths(checkDate, 1);
                    else if (rule.cycle === 'YEARLY') checkDate = addYears(checkDate, 1);
                    else isCalculating = false;
                }
            }
        }
    }

    return serializeTimestamps(results);
}

// --- Orders Management ---
export async function getAdminOrders(limitCount: number = 100, offsetCount: number = 0) {
    noStore();
    if (!adminDb) return [];
    const snapshot = await adminDb.collection('orders').orderBy('orderDate', 'desc').limit(limitCount).get();
    return serializeTimestamps(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
}

export async function getSellerOrders(sellerId: string) {
    noStore();
    if (!adminDb) return [];
    const snapshot = await adminDb.collection('orders').where('buyerId', '==', sellerId).orderBy('orderDate', 'desc').get();
    return serializeTimestamps(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
}

// --- Dashboard Stats ---
export async function getDashboardStats() {
    noStore();
    if (!adminDb) throw new Error('Admin Firestore is not initialized.');
    
    try {
        let legacySales = 0;
        let legacyCost = 0;
        let legacyOrders = 0;
        
        Object.values(DASHBOARD_LEGACY_DATA).forEach(month => {
            legacySales += month.sales;
            legacyCost += month.cost;
            legacyOrders += month.orders;
        });

        const ordersSnapshot = await adminDb.collection('orders')
            .where('status', 'in', ['READY_TO_SHIP', 'SHIPPED', 'COMPLETED'])
            .get();

        let realNetRevenue = 0;
        let realCOGS = 0;
        let realOrdersCount = 0;

        if (!ordersSnapshot.empty) {
            const allOrders = ordersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Order);
            
            await Promise.all(allOrders.map(async (order) => {
                const orderItemsSnapshot = await adminDb!.collection('orders').doc(order.id).collection('orderItems').get();
                if (orderItemsSnapshot.empty) return;

                const orderNetRevenue = order.subtotalBeforeTax || (order.totalAmount - (order.shippingCost || 0) - (order.taxAmount || 0));
                if (order.totalAmount > 0) realOrdersCount++;
                realNetRevenue += orderNetRevenue;

                let orderCOGS = 0;
                orderItemsSnapshot.forEach(itemDoc => {
                    const item = itemDoc.data() as OrderItem;
                    if (item.fulfilledFromLots && Array.isArray(item.fulfilledFromLots)) {
                        orderCOGS += item.fulfilledFromLots.reduce((acc, lot) => acc + (lot.quantity * lot.costPerItem), 0);
                    }
                });
                realCOGS += orderCOGS;
            }));
        }
        
        const totalSales = legacySales + realNetRevenue;
        const totalCost = legacyCost + realCOGS;
        const totalGrossProfit = totalSales - totalCost;
        const salesGeneratingOrdersCount = legacyOrders + realOrdersCount;
        const grossMarginRate = totalSales > 0 ? (totalGrossProfit / totalSales) * 100 : 0;

        return serializeTimestamps({ totalSales, totalGrossProfit, grossMarginRate, salesGeneratingOrdersCount });
    } catch(error: any) {
        console.error("Error fetching dashboard stats:", error);
        throw new Error(`Failed to fetch stats: ${error.message}`);
    }
}

export async function getSellerDashboardStats(sellerId: string, branchId?: string) {
    noStore();
    if (!adminDb) throw new Error('Admin Firestore is not initialized.');
    
    try {
        let ordersQuery = adminDb.collection('orders').where('buyerId', '==', sellerId);
        let invoicesQuery = adminDb.collection('feeInvoices').where('ownerId', '==', sellerId);

        if (branchId && branchId !== 'all') {
            ordersQuery = ordersQuery.where('branchId', '==', branchId);
            invoicesQuery = invoicesQuery.where('branchId', '==', branchId);
        }

        const [ordersSnap, invoicesSnap, userSnap] = await Promise.all([
            ordersQuery.get(),
            invoicesQuery.get(),
            adminDb.collection('users').doc(sellerId).get()
        ]);

        const orders = ordersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
        const invoices = invoicesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FeeInvoice));
        const userData = userSnap.data() as UserProfile;

        orders.sort((a, b) => getUnixTime(b.orderDate) - getUnixTime(a.orderDate));

        const recentOrders = orders.slice(0, 5);
        const pendingOrdersCount = orders.filter(o => o.status === 'PENDING_PAYMENT').length;
        const inTransitCount = orders.filter(o => o.status === 'SHIPPED').length;
        const unpaidFees = invoices.filter(i => i.status === 'PENDING' || i.status === 'PROCESSING');
        const unpaidFeesCount = unpaidFees.filter(i => i.status === 'PENDING').length;

        const currentMonthStart = startOfMonth(toZonedTime(new Date(), TIMEZONE));
        const monthlySpent = orders
            .filter(o => {
                const date = o.orderDate instanceof Timestamp ? o.orderDate.toDate() : new Date(o.orderDate);
                return ['READY_TO_SHIP', 'SHIPPED', 'COMPLETED'].includes(o.status) && date >= currentMonthStart;
            })
            .reduce((sum, o) => sum + (o.subtotalBeforeTax || (o.totalAmount - (o.shippingCost || 0) - (o.taxAmount || 0))), 0);

        return serializeTimestamps({ pointsBalance: userData?.pointsBalance || 0, pendingOrdersCount, inTransitCount, unpaidFeesCount, monthlySpent, recentOrders, pendingInvoices: unpaidFees });
    } catch (error: any) {
        console.error("Error fetching seller dashboard stats:", error);
        throw new Error(`Failed to fetch seller stats: ${error.message}`);
    }
}

export async function getMonthlySalesData() {
    noStore();
    if (!adminDb) throw new Error('Admin Firestore is not initialized.');

    const now = toZonedTime(new Date(), TIMEZONE);
    const endDate = now;
    const startDate = subMonths(endDate, 11);
    const months = eachMonthOfInterval({ start: startOfMonth(startDate), end: startOfMonth(endDate) });
    const monthlyData: Record<string, { sales: number; cost: number; profit: number; orders: number }> = {};

    months.forEach(month => {
        const monthKey = format(month, 'yyyy-MM');
        monthlyData[monthKey] = DASHBOARD_LEGACY_DATA[monthKey] ? { ...DASHBOARD_LEGACY_DATA[monthKey] } : { sales: 0, cost: 0, profit: 0, orders: 0 };
    });

    const ordersSnapshot = await adminDb.collection('orders')
        .where('orderDate', '>=', startOfMonth(startDate))
        .where('orderDate', '<=', endOfMonth(endDate))
        .get();

    if (!ordersSnapshot.empty) {
        const allowedStatuses = ['READY_TO_SHIP', 'SHIPPED', 'COMPLETED'];
        const filteredOrders = ordersSnapshot.docs
            .map(doc => ({ ...doc.data(), id: doc.id }) as Order)
            .filter(order => allowedStatuses.includes(order.status));

        for (const order of filteredOrders) {
            const orderDate = order.orderDate.toDate();
            const monthKey = format(orderDate, 'yyyy-MM');
            if (monthlyData[monthKey]) {
                const orderNetRevenue = order.subtotalBeforeTax || (order.totalAmount - (order.shippingCost || 0) - (order.taxAmount || 0));
                const itemsSnapshot = await adminDb.collection('orders').doc(order.id).collection('orderItems').get();
                let orderCOGS = 0;
                itemsSnapshot.forEach(itemDoc => {
                    const item = itemDoc.data() as OrderItem;
                    if (item.fulfilledFromLots && Array.isArray(item.fulfilledFromLots)) {
                        orderCOGS += item.fulfilledFromLots.reduce((sum, lot) => sum + (lot.quantity * lot.costPerItem), 0);
                    }
                });
                monthlyData[monthKey].sales += orderNetRevenue;
                monthlyData[monthKey].cost += orderCOGS;
                monthlyData[monthKey].profit += (orderNetRevenue - orderCOGS);
                monthlyData[monthKey].orders += 1;
            }
        }
    }

    const result = Object.keys(monthlyData).sort().map(monthKey => ({
        monthKey: monthKey,
        month: formatInTimeZone(new Date(monthKey + '-02'), TIMEZONE, 'MMM yy', { locale: th }),
        ...monthlyData[monthKey]
    }));

    return serializeTimestamps(result);
}

export async function getMonthlyReportData(targetDateString: string) {
    noStore();
    if (!adminDb) throw new Error('Admin Firestore is not initialized.');

    try {
        const targetDate = toZonedTime(new Date(targetDateString), TIMEZONE);
        const startDate = startOfMonth(targetDate);
        const endDate = endOfMonth(targetDate);
        const monthKey = format(targetDate, 'yyyy-MM');

        const dailyData = Array.from({ length: getDaysInMonth(targetDate) }, (_, i) => {
            const date = new Date(targetDate.getFullYear(), targetDate.getMonth(), i + 1);
            return { day: format(date, 'EEE d', { locale: th }).replace('.', ''), date: format(date, 'yyyy-MM-dd'), sales: 0, orders: 0 };
        });

        const ordersByDayOfWeek: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
        const spendingByUser: Record<string, number> = {};
        const productSales: Record<string, { id: string; quantity: number; totalProfit: number; name: string; sku: string; imageUrl?: string; groupId?: string }> = {};
        
        let realNetRevenue = 0, realOrders = 0, realCOGS = 0;

        const ordersSnapshot = await adminDb.collection('orders').where('orderDate', '>=', startDate).where('orderDate', '<=', endDate).get();

        if (!ordersSnapshot.empty) {
            const allowedStatuses = ['READY_TO_SHIP', 'SHIPPED', 'COMPLETED'];
            const filteredOrders = ordersSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Order)).filter(o => allowedStatuses.includes(o.status));

            for (const order of filteredOrders) {
                const orderDate = order.orderDate.toDate();
                const orderSalesExTax = order.subtotalBeforeTax || (order.totalAmount - (order.shippingCost || 0) - (order.taxAmount || 0));
                const dayIndex = orderDate.getDate() - 1;
                if (dailyData[dayIndex]) { dailyData[dayIndex].sales += orderSalesExTax; dailyData[dayIndex].orders += 1; }
                spendingByUser[order.buyerId] = (spendingByUser[order.buyerId] || 0) + orderSalesExTax;
                ordersByDayOfWeek[orderDate.getDay()] += 1;
                realOrders++;
                realNetRevenue += orderSalesExTax;
                
                const itemsSnapshot = await adminDb.collection('orders').doc(order.id).collection('orderItems').get();
                for (const itemDoc of itemsSnapshot.docs) {
                    const item = itemDoc.data() as OrderItem;
                    const itemCOGS = (item.fulfilledFromLots || []).reduce((sum, lot) => sum + ((lot.costPerItem || 0) * lot.quantity), 0);
                    realCOGS += itemCOGS;
                    let itemRevenue = item.itemPrice * item.quantity;
                    if (item.taxStatus === 'TAXABLE' && item.taxMode === 'INCLUSIVE') itemRevenue = itemRevenue / (1 + ((item.taxRate || 7) / 100));
                    const itemProfit = itemRevenue - itemCOGS;
                    if (!productSales[item.productId]) productSales[item.productId] = { id: item.productId, quantity: 0, totalProfit: 0, name: item.productName, sku: '...', imageUrl: item.productImage, groupId: item.productGroupId };
                    productSales[item.productId].quantity += item.quantity;
                    productSales[item.productId].totalProfit += itemProfit;
                }
            }
        }
        
        const legacy = DASHBOARD_LEGACY_DATA[monthKey];
        const finalSales = realNetRevenue + (legacy?.sales || 0), finalCOGS = realCOGS + (legacy?.cost || 0), finalOrders = realOrders + (legacy?.orders || 0);
        const finalProfit = finalSales - finalCOGS, finalMargin = finalSales > 0 ? (finalProfit / finalSales) * 100 : 0;

        const sortedSpenderEntries = Object.entries(spendingByUser).sort((a, b) => b[1] - a[1]).slice(0, 10);
        const topUserIds = sortedSpenderEntries.map(e => e[0]);
        let topSpenders: any[] = [];
        if (topUserIds.length > 0) {
            const usersSnapshot = await adminDb.collection('users').where('id', 'in', topUserIds).get();
            const usersMap = new Map(usersSnapshot.docs.map(doc => [doc.id, doc.data() as UserProfile]));
            topSpenders = sortedSpenderEntries.map(([userId, total]) => ({ userId, name: usersMap.get(userId)?.name || 'Unknown User', email: usersMap.get(userId)?.email || 'No email', totalSpent: total }));
        }

        await Promise.all(Object.values(productSales).map(async (data) => {
            if (data.groupId) {
                const vSnap = await adminDb!.collection('productGroups').doc(data.groupId).collection('productVariants').doc(data.id).get();
                if (vSnap.exists) data.sku = vSnap.data()?.sku || 'N/A';
            }
        }));
        
        return serializeTimestamps({ summary: { totalSales: finalSales, totalProfit: finalProfit, totalCost: finalCOGS, profitMargin: finalMargin, totalOrders: finalOrders }, dailyData, topDays: Object.entries(ordersByDayOfWeek).map(([idx, count]) => ({ dayName: ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'][parseInt(idx)], dayIndex: parseInt(idx), orders: count })).sort((a,b)=>b.orders-a.orders), topSpenders, topProfitableProducts: Object.values(productSales).sort((a,b)=>b.totalProfit - a.totalProfit).slice(0, 5), bestSellingProducts: Object.values(productSales).sort((a,b)=>b.quantity - a.quantity) });
    } catch(error: any) { throw new Error(`Failed to fetch report: ${error.message}`); }
}

export async function getTopSpenders() {
    noStore();
    if (!adminDb) return [];
    try {
        const ordersSnapshot = await adminDb.collection('orders').where('status', 'in', ['SHIPPED', 'COMPLETED']).get();
        if (ordersSnapshot.empty) return [];
        const spending: Record<string, number> = {};
        ordersSnapshot.docs.forEach(doc => { const o = doc.data() as Order; spending[o.buyerId] = (spending[o.buyerId] || 0) + (o.subtotalBeforeTax || (o.totalAmount - (o.shippingCost || 0) - (o.taxAmount || 0))); });
        const sorted = Object.entries(spending).sort((a,b)=>b[1]-a[1]).slice(0, 10);
        const userIds = sorted.map(e => e[0]);
        if (userIds.length === 0) return [];
        const usersSnapshot = await adminDb.collection('users').where('id', 'in', userIds).get();
        const usersMap = new Map<string, UserProfile>();
        usersSnapshot.forEach(doc => usersMap.set(doc.id, doc.data() as UserProfile));
        return serializeTimestamps(sorted.map(([id, total]) => ({ userId: id, name: usersMap.get(id)?.name || 'Unknown', email: usersMap.get(id)?.email || 'N/A', totalSpent: total })));
    } catch (e: any) { throw new Error(`Failed to fetch top spenders: ${e.message}`); }
}

export async function getBranchInsightsData() {
    noStore();
    if (!adminDb) return [];
    try {
        const branchesSnapshot = await adminDb.collection('branches').get();
        const branches = branchesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Branch));
        const ordersSnapshot = await adminDb.collection('orders').get();
        const allOrders = ordersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order)).filter(o => o.branchId);
        const now = toZonedTime(new Date(), TIMEZONE);

        const insights = await Promise.all(branches.map(async (branch) => {
            const branchOrders = allOrders.filter(o => o.branchId === branch.id);
            branchOrders.sort((a, b) => getUnixTime(b.orderDate) - getUnixTime(a.orderDate));
            const lastOrder = branchOrders[0];
            const lastOrderDate = lastOrder ? (lastOrder.orderDate instanceof Timestamp ? lastOrder.orderDate.toDate() : new Date(lastOrder.orderDate)) : null;
            const inactivityDays = lastOrderDate ? differenceInCalendarDays(now, lastOrderDate) : null;
            const lifetimeValue = branchOrders.reduce((sum, o) => sum + (o.subtotalBeforeTax || (o.totalAmount - (o.shippingCost || 0) - (o.taxAmount || 0))), 0);
            let averageCycleDays = null;
            if (branchOrders.length > 1) {
                const dates = branchOrders.map(o => o.orderDate instanceof Timestamp ? o.orderDate.toDate() : new Date(o.orderDate)).sort((a, b) => a.getTime() - b.getTime());
                let totalDiff = 0;
                for (let i = 1; i < dates.length; i++) totalDiff += differenceInCalendarDays(dates[i], dates[i-1]);
                averageCycleDays = Math.round(totalDiff / (dates.length - 1));
            }
            const currentMonthStart = startOfMonth(now);
            const currentSales = branchOrders.filter(o => { const d = o.orderDate instanceof Timestamp ? o.orderDate.toDate() : new Date(o.orderDate); return d >= currentMonthStart; }).reduce((sum, o) => sum + (o.subtotalBeforeTax || (o.totalAmount - (o.shippingCost || 0) - (o.taxAmount || 0))), 0);
            const prevStart = startOfMonth(subMonths(now, 1)), prevEnd = endOfMonth(subMonths(now, 1));
            const previousSales = branchOrders.filter(o => { const d = o.orderDate instanceof Timestamp ? o.orderDate.toDate() : new Date(o.orderDate); return d >= prevStart && d <= prevEnd; }).reduce((sum, o) => sum + (o.subtotalBeforeTax || (o.totalAmount - (o.shippingCost || 0) - (o.taxAmount || 0))), 0);
            let trend = previousSales > 0 ? Math.round(((currentSales - previousSales) / previousSales) * 100) : (currentSales > 0 ? 100 : 0);
            let grade: 'A' | 'B' | 'C' = lifetimeValue >= 50000 || (branchOrders.length >= 8 && (inactivityDays !== null && inactivityDays < 10)) ? 'A' : (lifetimeValue >= 10000 || branchOrders.length >= 3 ? 'B' : 'C');
            const productStats: Record<string, any> = {};
            await Promise.all(branchOrders.map(async (o) => {
                const itemsSnapshot = await adminDb!.collection('orders').doc(o.id).collection('orderItems').get();
                itemsSnapshot.docs.forEach(doc => {
                    const item = doc.data() as OrderItem;
                    const date = o.orderDate instanceof Timestamp ? o.orderDate.toDate() : new Date(o.orderDate);
                    if (!productStats[item.productId]) productStats[item.productId] = { name: item.productName.replace(/\s*\(\)$/, ''), lastOrdered: date, totalQty: item.quantity, inactivityDays: differenceInCalendarDays(now, date) };
                    else { productStats[item.productId].totalQty += item.quantity; if (date > productStats[item.productId].lastOrdered) { productStats[item.productId].lastOrdered = date; productStats[item.productId].inactivityDays = differenceInCalendarDays(now, date); } }
                });
            }));
            return { branchId: branch.id, branchName: branch.name, branchCode: branch.branchCode, ownerName: branch.ownerName || '-', province: branch.province || '-', lastOrderDate, inactivityDays, totalOrders: branchOrders.length, lifetimeValue, averageCycleDays, growthTrend: trend, branchGrade: grade, products: Object.values(productStats).sort((a, b) => b.totalQty - a.totalQty) };
        }));
        insights.sort((a, b) => getUnixTime(b.lastOrderDate) - getUnixTime(a.lastOrderDate));
        return serializeTimestamps(insights);
    } catch (e: any) { throw new Error(`Failed to generate insights: ${e.message}`); }
}

export async function getInventoryAlerts() {
    noStore();
    if (!adminDb) return [];
    const groupsSnapshot = await adminDb.collection('productGroups').get();
    const alerts: any[] = [];
    await Promise.all(groupsSnapshot.docs.map(async (groupDoc) => {
        const groupData = groupDoc.data() as ProductGroup;
        const variantsSnapshot = await adminDb!.collection('productGroups').doc(groupDoc.id).collection('productVariants').get();
        variantsSnapshot.docs.forEach(doc => {
            const data = doc.data() as ProductVariant;
            if (!data.trackInventory) return;
            const totalStock = (data.inventoryLots || []).reduce((sum, lot) => sum + lot.quantity, 0);
            if (totalStock <= (data.lowStockThreshold ?? 5)) alerts.push({ id: doc.id, sku: data.sku, stock: totalStock, threshold: data.lowStockThreshold ?? 5, productName: groupData.name, attributes: data.attributes });
        });
    }));
    return serializeTimestamps(alerts);
}

export async function getInventoryLedger(monthKey?: string) {
    noStore();
    if (!adminDb) return [];
    try {
        const adjustmentsSnap = await adminDb.collectionGroup('stockAdjustments').get();
        if (adjustmentsSnap.empty) return [];
        let raw = adjustmentsSnap.docs.map(doc => ({ id: doc.id, path: doc.ref.path, ...doc.data() })) as (StockAdjustmentTransaction & { path: string })[];
        if (monthKey) raw = raw.filter(adj => format(adj.createdAt?.toDate ? adj.createdAt.toDate() : new Date(adj.createdAt), 'yyyy-MM') === monthKey);
        raw.sort((a, b) => getUnixTime(b.createdAt) - getUnixTime(a.createdAt));
        const productInfoMap: Record<string, any> = {};
        const ledger = await Promise.all(raw.slice(0, monthKey ? undefined : 200).map(async (adj) => {
            const vId = adj.productVariantId;
            if (!productInfoMap[vId]) {
                const parts = adj.path.split('/');
                const [gSnap, vSnap] = await Promise.all([adminDb!.collection('productGroups').doc(parts[1]).get(), adminDb!.collection('productGroups').doc(parts[1]).collection('productVariants').doc(parts[3]).get()]);
                if (gSnap.exists && vSnap.exists) productInfoMap[vId] = { name: gSnap.data()?.name, sku: vSnap.data()?.sku, attributes: Object.values(vSnap.data()?.attributes || {}).join(' / ') };
                else productInfoMap[vId] = { name: 'Unknown', sku: 'N/A', attributes: '' };
            }
            const info = productInfoMap[vId];
            return { ...adj, productName: info.name, sku: info.sku, attributes: info.attributes };
        }));
        return serializeTimestamps(ledger);
    } catch (e: any) { throw new Error(`Failed to fetch ledger: ${e.message}`); }
}

export async function getActiveSellersForCombobox() {
    noStore();
    if (!adminDb) return [];
    const snapshot = await adminDb.collection('users').where('role', '==', 'seller').where('status', '==', 'active').get();
    return snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name, email: doc.data().email }));
}

export async function getProductCategories() {
    noStore();
    if (!adminDb) return [];
    const snapshot = await adminDb.collection('productCategories').orderBy('sortOrder').get();
    return serializeTimestamps(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))) as ProductCategory[];
}

export async function getServiceCategories() {
    noStore();
    if (!adminDb) return [];
    const snapshot = await adminDb.collection('serviceCategories').orderBy('sortOrder').get();
    return serializeTimestamps(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))) as ServiceCategory[];
}

export async function getProductData() {
    noStore();
    if (!adminDb) return { productGroups: [], variantsByGroup: {} };
    const groupsSnap = await adminDb.collection('productGroups').get();
    const groups = groupsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProductGroup));
    const variants: Record<string, ProductVariant[]> = {};
    await Promise.all(groups.map(async (g) => {
        const variantsSnap = await adminDb!.collection('productGroups').doc(g.id).collection('productVariants').get();
        variants[g.id] = variantsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProductVariant));
    }));
    return serializeTimestamps({ productGroups: groups, variantsByGroup: variants });
}

export async function getPackages() {
    noStore();
    if (!adminDb) return [];
    const snapshot = await adminDb.collection('productPackages').get();
    return serializeTimestamps(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
}

export async function getServices() {
    noStore();
    if (!adminDb) return [];
    const snapshot = await adminDb.collection('services').get();
    return serializeTimestamps(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
}

export async function getUsers() {
    noStore();
    if (!adminDb) return [];
    const snapshot = await adminDb.collection('users').get();
    return serializeTimestamps(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
}

export async function getSuppliers() {
    noStore();
    if (!adminDb) return [];
    const snapshot = await adminDb.collection('suppliers').get();
    return serializeTimestamps(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
}

export async function getPurchaseOrders() {
    noStore();
    if (!adminDb) return { purchaseOrders: [], supplierMap: {} };
    const [posSnap, suppliersSnap] = await Promise.all([adminDb.collection('purchaseOrders').orderBy('orderDate', 'desc').get(), adminDb.collection('suppliers').get()]);
    const supplierMap: Record<string, string> = {};
    suppliersSnap.forEach(doc => { supplierMap[doc.id] = doc.data().name; });
    return serializeTimestamps({ purchaseOrders: posSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })), supplierMap });
}

export async function getBankAccounts() {
    noStore();
    if (!adminDb) return [];
    const snapshot = await adminDb.collection('bankAccounts').orderBy('createdAt', 'desc').get();
    return serializeTimestamps(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
}

export async function setActiveBankAccount(accountId: string) {
    if (!adminDb) return { success: false, message: 'DB not ready' };
    const batch = adminDb.batch();
    const accounts = await adminDb.collection('bankAccounts').get();
    accounts.forEach(doc => batch.update(doc.ref, { isActive: doc.id === accountId }));
    await batch.commit();
    return { success: true, message: 'ตั้งค่าบัญชีหลักแล้ว' };
}

export async function deleteBankAccount(accountId: string) {
    if (!adminDb) return { success: false, message: 'DB not ready' };
    await adminDb.collection('bankAccounts').doc(accountId).delete();
    return { success: true, message: 'ลบบัญชีแล้ว' };
}

export async function saveBankAccount(data: any) {
    if (!adminDb) return { success: false, message: 'DB not ready' };
    const { id, ...rest } = data;
    if (id) await adminDb.collection('bankAccounts').doc(id).update(rest);
    else await adminDb.collection('bankAccounts').add({ ...rest, isActive: false, createdAt: FieldValue.serverTimestamp() });
    return { success: true, message: 'บันทึกแล้ว' };
}
