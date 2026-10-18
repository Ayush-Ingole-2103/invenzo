// ============================================
// Stock, Expiry & Reorder Routes — PRD 12.7, 12.8, 12.9
// ============================================
const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { requireVendor } = require('../middleware/authMiddleware');
const { parseQuantityToMilli, formatQuantity } = require('../utils/quantity');
const { formatRupees } = require('../utils/money');

router.use(requireVendor);

// POST /api/stock/add — add stock (restock)
router.post('/add', (req, res) => {
    try {
        const storeId = req.storeId;
        const vendorUserId = req.vendorUserId;
        const { productId, quantity, note = '', expiryDate, batchLabel } = req.body;

        if (!productId) {
            return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Product ID is required.' } });
        }

        const product = db.get('SELECT * FROM products WHERE id = ? AND store_id = ? AND is_active = 1', [productId, storeId]);
        if (!product) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Active product not found.' } });
        }

        const addMilli = parseQuantityToMilli(quantity, product.unit);
        if (addMilli <= 0) {
            return res.status(400).json({ success: false, error: { code: 'INVALID_QUANTITY', message: 'Added quantity must be greater than zero.' } });
        }

        if (product.track_expiry) {
            if (!expiryDate) {
                return res.status(400).json({ success: false, error: { code: 'EXPIRY_REQUIRED', message: 'Expiry date is required for this product.' } });
            }
        }

        let newQty = 0;
        db.transaction(() => {
            newQty = product.quantity_milli + addMilli;
            db.run('UPDATE products SET quantity_milli = ?, updated_at = datetime("now") WHERE id = ? AND store_id = ?', [newQty, productId, storeId]);

            db.run(
                `INSERT INTO stock_movements (
                    store_id, product_id, type, quantity_change_milli, quantity_after_milli, note, created_by
                ) VALUES (?, ?, 'restock', ?, ?, ?, ?)`,
                [storeId, productId, addMilli, newQty, note ? note.trim() : 'Stock added', vendorUserId]
            );
            const movementId = db.getLastInsertRowId();

            if (product.track_expiry && expiryDate) {
                db.run(
                    `INSERT INTO stock_batches (
                        store_id, product_id, batch_label, expiry_date, quantity_received_milli, movement_id, created_by
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [storeId, productId, batchLabel ? batchLabel.trim() : null, expiryDate, addMilli, movementId, vendorUserId]
                );
            }

            db.run(
                `INSERT INTO activity_logs (store_id, vendor_user_id, action, entity_type, entity_id, details)
                 VALUES (?, ?, 'STOCK_ADDED', 'product', ?, ?)`,
                [storeId, vendorUserId, productId, JSON.stringify({ addedMilli: addMilli, newQtyMilli: newQty })]
            );
        });

        res.json({
            success: true,
            data: {
                productId,
                quantityAdded: formatQuantity(addMilli, product.unit),
                newQuantity: formatQuantity(newQty, product.unit),
                newQuantityMilli: newQty
            }
        });
    } catch (err) {
        console.error('Stock add error:', err);
        res.status(400).json({ success: false, error: { code: 'ADD_FAILED', message: err.message } });
    }
});

// POST /api/stock/adjust — adjust stock with required reason
router.post('/adjust', (req, res) => {
    try {
        const storeId = req.storeId;
        const vendorUserId = req.vendorUserId;
        const { productId, quantity, reason } = req.body;

        if (!productId) {
            return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Product ID is required.' } });
        }

        if (!reason || reason.trim().length < 3) {
            return res.status(400).json({
                success: false,
                error: { code: 'REASON_REQUIRED', message: 'Reason of at least 3 characters is required for stock adjustments.' }
            });
        }

        const product = db.get('SELECT * FROM products WHERE id = ? AND store_id = ? AND is_active = 1', [productId, storeId]);
        if (!product) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Active product not found.' } });
        }

        // quantity can be signed (e.g. -5, +10)
        const changeMilli = parseQuantityToMilli(quantity, product.unit);
        if (changeMilli === 0) {
            return res.status(400).json({ success: false, error: { code: 'INVALID_QUANTITY', message: 'Adjustment quantity cannot be zero.' } });
        }

        const newQty = product.quantity_milli + changeMilli;
        if (newQty < 0) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'NEGATIVE_STOCK',
                    message: `Adjustment would result in negative stock (${formatQuantity(newQty, product.unit)}). Current stock is ${formatQuantity(product.quantity_milli, product.unit)}.`
                }
            });
        }

        db.transaction(() => {
            db.run('UPDATE products SET quantity_milli = ?, updated_at = datetime("now") WHERE id = ? AND store_id = ?', [newQty, productId, storeId]);

            db.run(
                `INSERT INTO stock_movements (
                    store_id, product_id, type, quantity_change_milli, quantity_after_milli, note, created_by
                ) VALUES (?, ?, 'adjustment', ?, ?, ?, ?)`,
                [storeId, productId, changeMilli, newQty, reason.trim(), vendorUserId]
            );

            db.run(
                `INSERT INTO activity_logs (store_id, vendor_user_id, action, entity_type, entity_id, details)
                 VALUES (?, ?, 'STOCK_ADJUSTED', 'product', ?, ?)`,
                [storeId, vendorUserId, productId, JSON.stringify({ changeMilli, newQtyMilli: newQty, reason: reason.trim() })]
            );
        });

        res.json({
            success: true,
            data: {
                productId,
                adjustment: formatQuantity(changeMilli, product.unit),
                newQuantity: formatQuantity(newQty, product.unit),
                newQuantityMilli: newQty
            }
        });
    } catch (err) {
        console.error('Stock adjust error:', err);
        res.status(400).json({ success: false, error: { code: 'ADJUST_FAILED', message: err.message } });
    }
});

// GET /api/stock/movements — paginated history
router.get('/movements', (req, res) => {
    try {
        const storeId = req.storeId;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
        const offset = (page - 1) * limit;

        const productId = req.query.productId ? parseInt(req.query.productId) : null;
        const type = req.query.type; // 'restock', 'sale', 'adjustment', 'void_reversal'
        const startDate = req.query.startDate;
        const endDate = req.query.endDate;

        let whereClause = 'WHERE sm.store_id = ?';
        const params = [storeId];

        if (productId) {
            whereClause += ' AND sm.product_id = ?';
            params.push(productId);
        }

        if (type) {
            whereClause += ' AND sm.type = ?';
            params.push(type);
        }

        if (startDate) {
            whereClause += ' AND sm.created_at >= ?';
            params.push(`${startDate} 00:00:00`);
        }

        if (endDate) {
            whereClause += ' AND sm.created_at <= ?';
            params.push(`${endDate} 23:59:59`);
        }

        const countQuery = `SELECT COUNT(*) as total FROM stock_movements sm ${whereClause}`;
        const total = db.get(countQuery, params)?.total || 0;

        const dataQuery = `
            SELECT sm.*, p.name as product_name, p.unit, p.sku, vu.name as created_by_name
            FROM stock_movements sm
            JOIN products p ON sm.product_id = p.id AND sm.store_id = p.store_id
            LEFT JOIN vendor_users vu ON sm.created_by = vu.id
            ${whereClause}
            ORDER BY sm.created_at DESC, sm.id DESC
            LIMIT ? OFFSET ?
        `;
        const movements = db.all(dataQuery, [...params, limit, offset]);

        const mapped = movements.map(m => ({
            ...m,
            quantity_change_display: formatQuantity(m.quantity_change_milli, m.unit),
            quantity_after_display: formatQuantity(m.quantity_after_milli, m.unit)
        }));

        res.json({
            success: true,
            data: mapped,
            meta: { page, limit, total }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch movements.' } });
    }
});

// GET /api/stock/low — low stock items
router.get('/low', (req, res) => {
    try {
        const storeId = req.storeId;
        const items = db.all(
            `SELECT p.*, c.name as category_name
             FROM products p
             LEFT JOIN categories c ON p.category_id = c.id AND p.store_id = c.store_id
             WHERE p.store_id = ? AND p.is_active = 1
               AND p.quantity_milli > 0 AND p.quantity_milli <= p.minimum_stock_milli
             ORDER BY p.name ASC`,
            [storeId]
        );

        const mapped = items.map(p => ({
            ...p,
            price_display: formatRupees(p.price),
            quantity_display: formatQuantity(p.quantity_milli, p.unit),
            minimum_stock_display: formatQuantity(p.minimum_stock_milli, p.unit)
        }));

        res.json({ success: true, data: mapped });
    } catch (err) {
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch low stock.' } });
    }
});

// GET /api/stock/out — out of stock items
router.get('/out', (req, res) => {
    try {
        const storeId = req.storeId;
        const items = db.all(
            `SELECT p.*, c.name as category_name
             FROM products p
             LEFT JOIN categories c ON p.category_id = c.id AND p.store_id = c.store_id
             WHERE p.store_id = ? AND p.is_active = 1 AND p.quantity_milli = 0
             ORDER BY p.name ASC`,
            [storeId]
        );

        const mapped = items.map(p => ({
            ...p,
            price_display: formatRupees(p.price),
            quantity_display: formatQuantity(p.quantity_milli, p.unit),
            minimum_stock_display: formatQuantity(p.minimum_stock_milli, p.unit)
        }));

        res.json({ success: true, data: mapped });
    } catch (err) {
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch out of stock.' } });
    }
});

// GET /api/stock/expiry — Expiry tracking with FIFO estimation (PRD Section 12.8)
router.get('/expiry', (req, res) => {
    try {
        const storeId = req.storeId;
        const alertDays = parseInt(db.get('SELECT value FROM store_settings WHERE store_id = ? AND key = "expiry_alert_days"', [storeId])?.value || '30', 10);

        const trackedProducts = db.all(
            `SELECT id, name, sku, unit, quantity_milli
             FROM products
             WHERE store_id = ? AND track_expiry = 1 AND is_active = 1`,
            [storeId]
        );

        const todayStr = new Date().toISOString().split('T')[0];
        const alertThreshold = new Date(Date.now() + alertDays * 86400000).toISOString().split('T')[0];

        const expiryList = [];

        for (const prod of trackedProducts) {
            const batches = db.all(
                `SELECT * FROM stock_batches
                 WHERE product_id = ? AND store_id = ?
                 ORDER BY expiry_date DESC, created_at DESC`,
                [prod.id, storeId]
            );

            let remaining = prod.quantity_milli;

            for (const batch of batches) {
                const batchRemaining = Math.min(batch.quantity_received_milli, remaining);
                remaining = Math.max(0, remaining - batchRemaining);

                if (batchRemaining > 0) {
                    let status = 'ok';
                    if (batch.expiry_date < todayStr) {
                        status = 'expired';
                    } else if (batch.expiry_date <= alertThreshold) {
                        status = 'expiring_soon';
                    }

                    const daysDiff = Math.round((new Date(batch.expiry_date) - new Date(todayStr)) / 86400000);

                    expiryList.push({
                        productId: prod.id,
                        productName: prod.name,
                        sku: prod.sku,
                        unit: prod.unit,
                        batchId: batch.id,
                        batchLabel: batch.batch_label || '-',
                        expiryDate: batch.expiry_date,
                        estimatedRemainingMilli: batchRemaining,
                        estimatedRemainingDisplay: formatQuantity(batchRemaining, prod.unit),
                        status,
                        daysDiff
                    });
                }
            }

            if (remaining > 0) {
                expiryList.push({
                    productId: prod.id,
                    productName: prod.name,
                    sku: prod.sku,
                    unit: prod.unit,
                    batchId: null,
                    batchLabel: 'No expiry recorded',
                    expiryDate: '-',
                    estimatedRemainingMilli: remaining,
                    estimatedRemainingDisplay: formatQuantity(remaining, prod.unit),
                    status: 'ok',
                    daysDiff: null
                });
            }
        }

        res.json({
            success: true,
            data: expiryList
        });
    } catch (err) {
        console.error('Expiry list error:', err);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch expiry data.' } });
    }
});

// GET /api/stock/reorder — Reorder list grouped by supplier (PRD Section 12.9)
router.get('/reorder', (req, res) => {
    try {
        const storeId = req.storeId;
        const lowProducts = db.all(
            `SELECT p.*, s.id as sup_id, s.name as sup_name, s.phone as sup_phone
             FROM products p
             LEFT JOIN suppliers s ON p.supplier_id = s.id AND p.store_id = s.store_id
             WHERE p.store_id = ? AND p.is_active = 1
               AND p.quantity_milli <= p.minimum_stock_milli
             ORDER BY s.name ASC, p.name ASC`,
            [storeId]
        );

        // Group by supplier
        const groups = {};
        for (const p of lowProducts) {
            const supKey = p.sup_id || 'none';
            if (!groups[supKey]) {
                groups[supKey] = {
                    supplierId: p.sup_id,
                    supplierName: p.sup_name || 'No supplier',
                    supplierPhone: p.sup_phone,
                    items: []
                };
            }

            // Suggested reorder quantity calculation:
            // if reorder_quantity set -> use it; else 2 * min - qty
            let suggestedMilli = p.reorder_quantity_milli;
            if (!suggestedMilli) {
                const calculated = (2 * p.minimum_stock_milli) - p.quantity_milli;
                suggestedMilli = Math.max(0, calculated);
            }

            groups[supKey].items.push({
                productId: p.id,
                name: p.name,
                sku: p.sku,
                unit: p.unit,
                currentStock: formatQuantity(p.quantity_milli, p.unit),
                currentStockMilli: p.quantity_milli,
                minimumStock: formatQuantity(p.minimum_stock_milli, p.unit),
                suggestedQuantity: formatQuantity(suggestedMilli, p.unit),
                suggestedQuantityMilli: suggestedMilli
            });
        }

        res.json({
            success: true,
            data: Object.values(groups)
        });
    } catch (err) {
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch reorder list.' } });
    }
});

module.exports = router;
