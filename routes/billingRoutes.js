// ============================================
// Billing Catalog & Fast Lookup — PRD Section 12.4
// ============================================
const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { requireVendor } = require('../middleware/authMiddleware');
const { formatQuantity } = require('../utils/quantity');
const { formatRupees } = require('../utils/money');

router.use(requireVendor);

// GET /api/billing/catalog — compact active products for fast client-side lookup
router.get('/catalog', (req, res) => {
    try {
        const storeId = req.storeId;
        const products = db.all(
            `SELECT p.id, p.name, p.sku, p.unit, p.price, p.quantity_milli,
                    p.is_quick_item, p.product_type, p.package_size_milli, c.name as category_name
             FROM products p
             LEFT JOIN categories c ON p.category_id = c.id AND p.store_id = c.store_id
             WHERE p.store_id = ? AND p.is_active = 1
             ORDER BY p.name ASC`,
            [storeId]
        );

        const mapped = products.map(p => {
            const isLoose = p.product_type === 'loose';
            const packSize = (p.package_size_milli || 1000) / 1000;
            return {
                id: p.id,
                name: p.name,
                sku: p.sku,
                unit: p.unit,
                price: p.price, // paise
                price_display: formatRupees(p.price),
                quantity: formatQuantity(p.quantity_milli, p.unit),
                quantity_milli: p.quantity_milli,
                category: p.category_name,
                quick: Boolean(p.is_quick_item),
                product_type: p.product_type || 'packaged',
                package_size_milli: p.package_size_milli || 1000,
                package_size: packSize,
                is_loose: isLoose,
                active: true
            };
        });

        res.json({
            success: true,
            data: {
                generatedAt: new Date().toISOString(),
                products: mapped
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch catalog.' } });
    }
});

// GET /api/billing/customers — compact active customers for billing credit selection
router.get('/customers', (req, res) => {
    try {
        const storeId = req.storeId;
        const customers = db.all(
            `SELECT id, name, phone, balance, credit_limit
             FROM customers
             WHERE store_id = ? AND is_active = 1
             ORDER BY name ASC`,
            [storeId]
        );

        const mapped = customers.map(c => ({
            id: c.id,
            name: c.name,
            phone: c.phone,
            balance: c.balance,
            balance_display: formatRupees(c.balance),
            credit_limit: c.credit_limit,
            credit_limit_display: c.credit_limit ? formatRupees(c.credit_limit) : null
        }));

        res.json({ success: true, data: mapped });
    } catch (err) {
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch customers.' } });
    }
});

module.exports = router;
