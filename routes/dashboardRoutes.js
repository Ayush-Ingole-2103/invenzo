// ============================================
// Dashboard Routes — PRD Section 12.1
// ============================================
const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { requireVendor } = require('../middleware/authMiddleware');
const { formatRupees } = require('../utils/money');
const { formatQuantity } = require('../utils/quantity');

router.use(requireVendor);

function getStoreTimezone(storeId) {
    const store = db.get('SELECT timezone FROM stores WHERE id = ?', [storeId]);
    return store?.timezone || 'Asia/Kolkata';
}

function getStoreTodayString(timezone = 'Asia/Kolkata') {
    try {
        const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
        return formatter.format(new Date());
    } catch {
        return new Date().toISOString().split('T')[0];
    }
}

// GET /api/dashboard — main dashboard statistics
router.get('/', (req, res) => {
    try {
        const storeId = req.storeId;
        const timezone = getStoreTimezone(storeId);
        const todayStr = getStoreTodayString(timezone);

        // 1. Today panel (computed in store timezone)
        const todayStats = db.get(
            `SELECT
                COALESCE(SUM(total_amount), 0) as today_billed,
                COUNT(id) as today_count,
                COALESCE(SUM(CASE WHEN payment_mode = 'cash' THEN total_amount ELSE 0 END), 0) as cash_sales,
                COALESCE(SUM(CASE WHEN payment_mode = 'upi' THEN total_amount ELSE 0 END), 0) as upi_sales,
                COALESCE(SUM(CASE WHEN payment_mode = 'credit' THEN due_amount ELSE 0 END), 0) as credit_given
             FROM sales
             WHERE store_id = ? AND status = 'completed'
               AND date(created_at, '+5 hours', '+30 minutes') = ?`,
            [storeId, todayStr]
        );

        // Dues collected today (payments recorded in customer_ledger)
        const duesCollected = db.get(
            `SELECT COALESCE(SUM(ABS(amount_change)), 0) as dues_collected
             FROM customer_ledger
             WHERE store_id = ? AND type = 'payment'
               AND date(created_at, '+5 hours', '+30 minutes') = ?`,
            [storeId, todayStr]
        )?.dues_collected || 0;

        // 2. Store panel
        const prodCounts = db.get(
            `SELECT
                COUNT(id) as active_products,
                COALESCE(SUM(CASE WHEN quantity_milli = 0 THEN 1 ELSE 0 END), 0) as out_of_stock,
                COALESCE(SUM(CASE WHEN quantity_milli > 0 AND quantity_milli <= minimum_stock_milli THEN 1 ELSE 0 END), 0) as low_stock,
                COALESCE(SUM(CASE WHEN cost_price IS NOT NULL THEN (CAST(quantity_milli AS BIGINT) * CAST(cost_price AS BIGINT) / 1000) ELSE 0 END), 0) as stock_value
             FROM products
             WHERE store_id = ? AND is_active = 1`,
            [storeId]
        );

        // 3. Credit (udhaar) panel
        const creditStats = db.get(
            `SELECT
                COALESCE(SUM(CASE WHEN balance > 0 THEN balance ELSE 0 END), 0) as total_outstanding,
                COALESCE(SUM(CASE WHEN balance > 0 THEN 1 ELSE 0 END), 0) as customers_with_dues
             FROM customers
             WHERE store_id = ? AND is_active = 1`,
            [storeId]
        );

        // 4. Overall sales stats (all time completed)
        const allTimeSales = db.get(
            `SELECT
                COALESCE(SUM(total_amount), 0) as total_sales,
                COUNT(id) as total_transactions
             FROM sales
             WHERE store_id = ? AND status = 'completed'`,
            [storeId]
        );

        const totalTransactions = allTimeSales?.total_transactions || 0;
        const totalSalesPaise = allTimeSales?.total_sales || 0;
        const avgBillPaise = totalTransactions > 0 ? Math.round(totalSalesPaise / totalTransactions) : 0;

        // Top 5 selling products ranked by revenue
        const topProducts = db.all(
            `SELECT si.product_name, si.unit,
                    SUM(si.quantity_milli) as total_qty_milli,
                    SUM(si.subtotal) as total_revenue
             FROM sale_items si
             JOIN sales s ON si.sale_id = s.id AND si.store_id = s.store_id
             WHERE si.store_id = ? AND s.status = 'completed'
             GROUP BY si.product_id, si.product_name, si.unit
             ORDER BY total_revenue DESC
             LIMIT 5`,
            [storeId]
        );

        // Recent 10 stock movements
        const recentMovements = db.all(
            `SELECT sm.*, p.name as product_name, p.unit
             FROM stock_movements sm
             JOIN products p ON sm.product_id = p.id AND sm.store_id = p.store_id
             WHERE sm.store_id = ?
             ORDER BY sm.created_at DESC, sm.id DESC
             LIMIT 10`,
            [storeId]
        );

        // Low stock products preview
        const lowStockItems = db.all(
            `SELECT id, name, sku, unit, quantity_milli, minimum_stock_milli
             FROM products
             WHERE store_id = ? AND is_active = 1
               AND quantity_milli <= minimum_stock_milli
             ORDER BY quantity_milli ASC
             LIMIT 5`,
            [storeId]
        );

        res.json({
            success: true,
            data: {
                today: {
                    billed: formatRupees(todayStats?.today_billed || 0),
                    billedPaise: todayStats?.today_billed || 0,
                    billCount: todayStats?.today_count || 0,
                    cashSales: formatRupees(todayStats?.cash_sales || 0),
                    upiSales: formatRupees(todayStats?.upi_sales || 0),
                    creditGiven: formatRupees(todayStats?.credit_given || 0),
                    duesCollected: formatRupees(duesCollected)
                },
                store: {
                    activeProducts: prodCounts?.active_products || 0,
                    stockValueAtCost: formatRupees(prodCounts?.stock_value || 0),
                    lowStockCount: prodCounts?.low_stock || 0,
                    outOfStockCount: prodCounts?.out_of_stock || 0
                },
                credit: {
                    totalOutstanding: formatRupees(creditStats?.total_outstanding || 0),
                    totalOutstandingPaise: creditStats?.total_outstanding || 0,
                    customersWithDues: creditStats?.customers_with_dues || 0
                },
                allTime: {
                    totalSales: formatRupees(totalSalesPaise),
                    totalTransactions,
                    avgBillValue: formatRupees(avgBillPaise)
                },
                topProducts: topProducts.map(tp => ({
                    name: tp.product_name,
                    quantity: formatQuantity(tp.total_qty_milli, tp.unit),
                    revenue: formatRupees(tp.total_revenue),
                    revenuePaise: tp.total_revenue
                })),
                recentMovements: recentMovements.map(rm => ({
                    ...rm,
                    change_display: formatQuantity(rm.quantity_change_milli, rm.unit),
                    after_display: formatQuantity(rm.quantity_after_milli, rm.unit)
                })),
                lowStockItems: lowStockItems.map(l => ({
                    ...l,
                    stock_display: formatQuantity(l.quantity_milli, l.unit),
                    min_display: formatQuantity(l.minimum_stock_milli, l.unit)
                }))
            }
        });
    } catch (err) {
        console.error('Dashboard error:', err);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch dashboard.' } });
    }
});

// GET /api/dashboard/sales — 7d / 30d / 12m continuous real-time time-series charts
router.get('/sales', (req, res) => {
    try {
        const storeId = req.storeId;
        const range = req.query.range || '7d'; // '7d', '30d', '12m'
        const timezone = getStoreTimezone(storeId);
        const todayStr = getStoreTodayString(timezone);
        const [curYear, curMonth, curDay] = todayStr.split('-').map(Number);

        if (range === '12m') {
            const monthsMap = new Map();
            const monthKeys = [];

            for (let i = 11; i >= 0; i--) {
                const dt = new Date(curYear, curMonth - 1 - i, 1);
                const yyyy = dt.getFullYear();
                const mm = String(dt.getMonth() + 1).padStart(2, '0');
                const key = `${yyyy}-${mm}`;
                const shortMonth = dt.toLocaleString('en-US', { month: 'short' });
                const label = `${shortMonth} '${String(yyyy).slice(-2)}`;
                monthKeys.push(key);
                monthsMap.set(key, { key, label, total: 0, count: 0 });
            }

            const oldestKey = monthKeys[0];
            const salesMonths = db.all(
                `SELECT strftime('%Y-%m', created_at, '+5 hours', '+30 minutes') as period,
                        COALESCE(SUM(total_amount), 0) as total,
                        COUNT(id) as count
                 FROM sales
                 WHERE store_id = ? AND status = 'completed'
                   AND strftime('%Y-%m', created_at, '+5 hours', '+30 minutes') >= ?
                 GROUP BY period`,
                [storeId, oldestKey]
            );

            for (const row of salesMonths) {
                if (monthsMap.has(row.period)) {
                    const item = monthsMap.get(row.period);
                    item.total = Math.round(row.total) / 100;
                    item.count = row.count;
                }
            }

            const data = monthKeys.map(k => monthsMap.get(k));
            return res.json({ success: true, data });
        }

        const numDays = range === '30d' ? 30 : 7;
        const daysMap = new Map();
        const dayKeys = [];

        for (let i = numDays - 1; i >= 0; i--) {
            const dt = new Date(curYear, curMonth - 1, curDay);
            dt.setDate(dt.getDate() - i);
            const yyyy = dt.getFullYear();
            const mm = String(dt.getMonth() + 1).padStart(2, '0');
            const dd = String(dt.getDate()).padStart(2, '0');
            const key = `${yyyy}-${mm}-${dd}`;
            const shortMonth = dt.toLocaleString('en-US', { month: 'short' });
            const label = `${dd} ${shortMonth}`;
            dayKeys.push(key);
            daysMap.set(key, { key, label, total: 0, count: 0 });
        }

        const startDate = dayKeys[0];
        const salesDaily = db.all(
            `SELECT date(created_at, '+5 hours', '+30 minutes') as period,
                    COALESCE(SUM(total_amount), 0) as total,
                    COUNT(id) as count
             FROM sales
             WHERE store_id = ? AND status = 'completed'
               AND date(created_at, '+5 hours', '+30 minutes') >= ?
             GROUP BY period`,
            [storeId, startDate]
        );

        for (const row of salesDaily) {
            if (daysMap.has(row.period)) {
                const item = daysMap.get(row.period);
                item.total = Math.round(row.total) / 100;
                item.count = row.count;
            }
        }

        const data = dayKeys.map(k => daysMap.get(k));
        res.json({ success: true, data });
    } catch (err) {
        console.error('Sales chart error:', err);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch sales chart.' } });
    }
});

module.exports = router;
