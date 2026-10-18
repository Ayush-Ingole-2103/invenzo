// ============================================
// Reports & CSV Export Routes — PRD Section 12.10
// ============================================
const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { requireVendor } = require('../middleware/authMiddleware');
const { formatRupees } = require('../utils/money');
const { formatQuantity } = require('../utils/quantity');

router.use(requireVendor);

/**
 * Format CSV rows with UTF-8 BOM and formula injection protection
 */
function toCsv(headers, rows) {
    const sanitize = (val) => {
        if (val === null || val === undefined) return '';
        let str = val.toString().trim();
        // Prevent CSV formula injection
        if (/^[=+\-@]/.test(str)) {
            str = "'" + str;
        }
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            str = '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
    };

    const headerLine = headers.map(sanitize).join(',');
    const dataLines = rows.map(r => r.map(sanitize).join(','));
    // UTF-8 BOM (\uFEFF)
    return '\uFEFF' + [headerLine, ...dataLines].join('\r\n');
}

// GET /api/reports/inventory
router.get('/inventory', (req, res) => {
    try {
        const storeId = req.storeId;
        const includeInactive = req.query.includeInactive === 'true' || req.query.includeInactive === '1';
        const format = req.query.format;

        let sql = `
            SELECT p.id, p.name, p.sku, c.name as category, p.unit,
                   p.quantity_milli, p.minimum_stock_milli, p.price, p.cost_price, p.is_active
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id AND p.store_id = c.store_id
            WHERE p.store_id = ?
        `;
        if (!includeInactive) {
            sql += ' AND p.is_active = 1';
        }
        sql += ' ORDER BY p.name ASC';

        const products = db.all(sql, [storeId]);

        const mapped = products.map(p => {
            const stockVal = p.cost_price ? Math.round((p.quantity_milli * p.cost_price) / 1000) : 0;
            return {
                id: p.id,
                name: p.name,
                sku: p.sku,
                category: p.category || 'Uncategorized',
                stock: formatQuantity(p.quantity_milli, p.unit),
                minimum_stock: formatQuantity(p.minimum_stock_milli, p.unit),
                price: formatRupees(p.price),
                cost_price: p.cost_price ? formatRupees(p.cost_price) : '-',
                stock_value_at_cost: formatRupees(stockVal),
                status: p.quantity_milli === 0 ? 'Out of stock' : (p.quantity_milli <= p.minimum_stock_milli ? 'Low stock' : 'In stock'),
                active: p.is_active ? 'Active' : 'Inactive'
            };
        });

        if (format === 'csv') {
            const headers = ['Name', 'SKU', 'Category', 'Stock', 'Minimum Stock', 'Price', 'Cost Price', 'Stock Value', 'Status', 'Active'];
            const rows = mapped.map(m => [m.name, m.sku, m.category, m.stock, m.minimum_stock, m.price, m.cost_price, m.stock_value_at_cost, m.status, m.active]);
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', 'attachment; filename="inventory-report.csv"');
            return res.send(toCsv(headers, rows));
        }

        res.json({ success: true, data: mapped });
    } catch (err) {
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to generate inventory report.' } });
    }
});

// GET /api/reports/sales
router.get('/sales', (req, res) => {
    try {
        const storeId = req.storeId;
        const format = req.query.format;
        const startDate = req.query.startDate;
        const endDate = req.query.endDate;

        let sql = `
            SELECT s.*, c.name as customer_name
            FROM sales s
            LEFT JOIN customers c ON s.customer_id = c.id AND s.store_id = c.store_id
            WHERE s.store_id = ?
        `;
        const params = [storeId];

        if (startDate) {
            sql += ' AND s.created_at >= ?';
            params.push(`${startDate} 00:00:00`);
        }
        if (endDate) {
            sql += ' AND s.created_at <= ?';
            params.push(`${endDate} 23:59:59`);
        }

        sql += ' ORDER BY s.created_at DESC';
        const sales = db.all(sql, params);

        const prefix = db.get('SELECT value FROM store_settings WHERE store_id = ? AND key = "bill_prefix"', [storeId])?.value || '';

        const mapped = sales.map(s => ({
            bill_number: s.bill_number ? `${prefix}${s.bill_number}` : (s.offline_ref || `#${s.id}`),
            date: s.created_at,
            customer: s.customer_name || 'Walk-in',
            total: formatRupees(s.total_amount),
            payment_mode: s.payment_mode,
            paid: formatRupees(s.amount_paid),
            due: formatRupees(s.due_amount),
            status: s.status
        }));

        if (format === 'csv') {
            const headers = ['Bill Number', 'Date', 'Customer', 'Total', 'Payment Mode', 'Paid', 'Due', 'Status'];
            const rows = mapped.map(m => [m.bill_number, m.date, m.customer, m.total, m.payment_mode, m.paid, m.due, m.status]);
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', 'attachment; filename="sales-report.csv"');
            return res.send(toCsv(headers, rows));
        }

        res.json({ success: true, data: mapped });
    } catch (err) {
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to generate sales report.' } });
    }
});

// GET /api/reports/payment-summary
router.get('/payment-summary', (req, res) => {
    try {
        const storeId = req.storeId;
        const startDate = req.query.startDate;
        const endDate = req.query.endDate;

        let whereClause = 'WHERE store_id = ? AND status = "completed"';
        const params = [storeId];

        if (startDate) {
            whereClause += ' AND created_at >= ?';
            params.push(`${startDate} 00:00:00`);
        }
        if (endDate) {
            whereClause += ' AND created_at <= ?';
            params.push(`${endDate} 23:59:59`);
        }

        const summary = db.get(
            `SELECT
                COALESCE(SUM(CASE WHEN payment_mode = 'cash' THEN total_amount ELSE 0 END), 0) as cash_total,
                COALESCE(SUM(CASE WHEN payment_mode = 'upi' THEN total_amount ELSE 0 END), 0) as upi_total,
                COALESCE(SUM(CASE WHEN payment_mode = 'credit' THEN total_amount ELSE 0 END), 0) as credit_total,
                COALESCE(SUM(CASE WHEN payment_mode = 'credit' THEN amount_paid ELSE 0 END), 0) as credit_paid_at_billing,
                COALESCE(SUM(CASE WHEN payment_mode = 'credit' THEN due_amount ELSE 0 END), 0) as credit_due,
                COALESCE(SUM(total_amount), 0) as grand_total
             FROM sales ${whereClause}`,
            params
        );

        // Customer payments against dues during this period
        let ldgWhere = 'WHERE store_id = ? AND type = "payment"';
        const ldgParams = [storeId];
        if (startDate) {
            ldgWhere += ' AND created_at >= ?';
            ldgParams.push(`${startDate} 00:00:00`);
        }
        if (endDate) {
            ldgWhere += ' AND created_at <= ?';
            ldgParams.push(`${endDate} 23:59:59`);
        }

        const ldgSummary = db.get(
            `SELECT
                COALESCE(SUM(CASE WHEN payment_mode = 'cash' THEN ABS(amount_change) ELSE 0 END), 0) as dues_cash,
                COALESCE(SUM(CASE WHEN payment_mode = 'upi' THEN ABS(amount_change) ELSE 0 END), 0) as dues_upi,
                COALESCE(SUM(ABS(amount_change)), 0) as dues_total
             FROM customer_ledger ${ldgWhere}`,
            ldgParams
        );

        res.json({
            success: true,
            data: {
                cashBilled: formatRupees(summary?.cash_total || 0),
                upiBilled: formatRupees(summary?.upi_total || 0),
                creditBilled: formatRupees(summary?.credit_total || 0),
                creditPaidAtBilling: formatRupees(summary?.credit_paid_at_billing || 0),
                creditDue: formatRupees(summary?.credit_due || 0),
                duesCollectedCash: formatRupees(ldgSummary?.dues_cash || 0),
                duesCollectedUpi: formatRupees(ldgSummary?.dues_upi || 0),
                duesCollectedTotal: formatRupees(ldgSummary?.dues_total || 0),
                grandTotal: formatRupees(summary?.grand_total || 0)
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to generate payment summary.' } });
    }
});

// GET /api/reports/customer-dues
router.get('/customer-dues', (req, res) => {
    try {
        const storeId = req.storeId;
        const format = req.query.format;

        const dues = db.all(
            `SELECT c.*,
                    (SELECT MAX(created_at) FROM customer_ledger cl WHERE cl.customer_id = c.id AND cl.type = 'payment') as last_payment_date
             FROM customers c
             WHERE c.store_id = ? AND c.balance > 0 AND c.is_active = 1
             ORDER BY c.balance DESC`,
            [storeId]
        );

        const mapped = dues.map(d => ({
            name: d.name,
            phone: d.phone || '-',
            balance: formatRupees(d.balance),
            credit_limit: d.credit_limit ? formatRupees(d.credit_limit) : '-',
            last_payment: d.last_payment_date || '-'
        }));

        if (format === 'csv') {
            const headers = ['Customer Name', 'Phone', 'Outstanding Dues', 'Credit Limit', 'Last Payment Date'];
            const rows = mapped.map(m => [m.name, m.phone, m.balance, m.credit_limit, m.last_payment]);
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', 'attachment; filename="customer-dues-report.csv"');
            return res.send(toCsv(headers, rows));
        }

        res.json({ success: true, data: mapped });
    } catch (err) {
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to generate customer dues report.' } });
    }
});

module.exports = router;
