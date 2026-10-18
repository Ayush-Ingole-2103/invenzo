// ============================================
// Product Routes — PRD Section 12.2 & 11
// ============================================
const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { requireVendor } = require('../middleware/authMiddleware');
const { parseQuantityToMilli, formatQuantity, isWholeUnit } = require('../utils/quantity');
const { parseRupeesToPaise, formatRupees } = require('../utils/money');

// Apply vendor auth to all product routes
router.use(requireVendor);

// GET /api/products — list with pagination, search, filters, sorting
router.router_get = router.get('/', (req, res) => {
    try {
        const storeId = req.storeId;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 100));
        const offset = (page - 1) * limit;

        const search = req.query.search ? req.query.search.trim() : '';
        const categoryId = (req.query.categoryId || req.query.category) ? parseInt(req.query.categoryId || req.query.category) : null;
        const supplierId = (req.query.supplierId || req.query.supplier) ? parseInt(req.query.supplierId || req.query.supplier) : null;
        const stockStatus = req.query.stockStatus || req.query.status; // 'in_stock', 'low_stock', 'out_of_stock'
        const isQuick = req.query.isQuick === 'true' || req.query.isQuick === '1';
        const includeInactive = req.query.includeInactive === 'true' || req.query.includeInactive === '1';

        // Sorting
        const allowedSort = ['name', 'price', 'quantity_milli', 'sku', 'updated_at', 'created_at'];
        const sortBy = allowedSort.includes(req.query.sortBy) ? req.query.sortBy : 'updated_at';
        const sortDir = req.query.sortDir?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

        let whereClause = 'WHERE p.store_id = ?';
        const params = [storeId];

        if (!includeInactive) {
            whereClause += ' AND p.is_active = 1';
        }

        if (search) {
            whereClause += ` AND (p.name LIKE ? OR p.sku LIKE ? OR c.name LIKE ?)`;
            const term = `%${search}%`;
            params.push(term, term, term);
        }

        if (categoryId) {
            whereClause += ' AND p.category_id = ?';
            params.push(categoryId);
        }

        if (supplierId) {
            whereClause += ' AND p.supplier_id = ?';
            params.push(supplierId);
        }

        if (isQuick) {
            whereClause += ' AND p.is_quick_item = 1';
        }

        if (stockStatus === 'out_of_stock') {
            whereClause += ' AND p.quantity_milli = 0';
        } else if (stockStatus === 'low_stock') {
            whereClause += ' AND p.quantity_milli > 0 AND p.quantity_milli <= p.minimum_stock_milli';
        } else if (stockStatus === 'in_stock') {
            whereClause += ' AND p.quantity_milli > p.minimum_stock_milli';
        }

        // Count total
        const countQuery = `
            SELECT COUNT(*) as total
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id AND p.store_id = c.store_id
            ${whereClause}
        `;
        const total = db.get(countQuery, params)?.total || 0;

        // Fetch page
        const dataQuery = `
            SELECT p.*, c.name as category_name, s.name as supplier_name
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id AND p.store_id = c.store_id
            LEFT JOIN suppliers s ON p.supplier_id = s.id AND p.store_id = s.store_id
            ${whereClause}
            ORDER BY p.${sortBy} ${sortDir}
            LIMIT ? OFFSET ?
        `;
        const products = db.all(dataQuery, [...params, limit, offset]);

        const mapped = products.map(p => ({
            ...p,
            gst_rate: p.gst_rate_bps || 0,
            gst_rate_bps: p.gst_rate_bps || 0,
            gst_rate_display: p.gst_rate_bps ? `${p.gst_rate_bps / 100}%` : '0%',
            barcode: p.hsn_code || p.barcode || '',
            product_type: p.product_type || 'packaged',
            package_size_milli: p.package_size_milli || 1000,
            package_size: (p.package_size_milli || 1000) / 1000,
            price_display: formatRupees(p.price),
            cost_price_display: p.cost_price ? formatRupees(p.cost_price) : null,
            quantity: p.quantity_milli ? p.quantity_milli / 1000 : 0,
            minimum_stock: p.minimum_stock_milli ? p.minimum_stock_milli / 1000 : 10,
            quantity_display: formatQuantity(p.quantity_milli, p.unit),
            minimum_stock_display: formatQuantity(p.minimum_stock_milli, p.unit),
            status: p.quantity_milli === 0 ? 'out_of_stock' : (p.quantity_milli <= p.minimum_stock_milli ? 'low_stock' : 'in_stock')
        }));

        res.json({
            success: true,
            data: mapped,
            meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 }
        });
    } catch (err) {
        console.error('List products error:', err);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch products.' } });
    }
});

// GET /api/products/:id — single product detail with stats
router.get('/:id', (req, res) => {
    try {
        const storeId = req.storeId;
        const id = parseInt(req.params.id);

        const product = db.get(
            `SELECT p.*, c.name as category_name, s.name as supplier_name, s.phone as supplier_phone
             FROM products p
             LEFT JOIN categories c ON p.category_id = c.id AND p.store_id = c.store_id
             LEFT JOIN suppliers s ON p.supplier_id = s.id AND p.store_id = s.store_id
             WHERE p.id = ? AND p.store_id = ?`,
            [id, storeId]
        );

        if (!product) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Product not found.' } });
        }

        // Stats: total sales value, total quantity sold
        const salesStats = db.get(
            `SELECT COALESCE(SUM(si.quantity_milli), 0) as total_sold_milli,
                    COALESCE(SUM(si.subtotal), 0) as total_sales_amount
             FROM sale_items si
             JOIN sales sa ON si.sale_id = sa.id AND si.store_id = sa.store_id
             WHERE si.product_id = ? AND si.store_id = ? AND sa.status = 'completed'`,
            [id, storeId]
        );

        // Last 10 movements
        const movements = db.all(
            `SELECT * FROM stock_movements
             WHERE product_id = ? AND store_id = ?
             ORDER BY created_at DESC LIMIT 10`,
            [id, storeId]
        );

        // Expiry batches if tracked
        let batches = [];
        if (product.track_expiry) {
            batches = db.all(
                `SELECT * FROM stock_batches
                 WHERE product_id = ? AND store_id = ?
                 ORDER BY expiry_date ASC`,
                [id, storeId]
            );
        }

        res.json({
            success: true,
            data: {
                ...product,
                gst_rate: product.gst_rate_bps || 0,
                gst_rate_bps: product.gst_rate_bps || 0,
                gst_rate_display: product.gst_rate_bps ? `${product.gst_rate_bps / 100}%` : '0%',
                barcode: product.hsn_code || product.barcode || '',
                product_type: product.product_type || 'packaged',
                package_size_milli: product.package_size_milli || 1000,
                package_size: (product.package_size_milli || 1000) / 1000,
                price_display: formatRupees(product.price),
                cost_price_display: product.cost_price ? formatRupees(product.cost_price) : null,
                quantity: product.quantity_milli ? product.quantity_milli / 1000 : 0,
                minimum_stock: product.minimum_stock_milli ? product.minimum_stock_milli / 1000 : 10,
                quantity_display: formatQuantity(product.quantity_milli, product.unit),
                minimum_stock_display: formatQuantity(product.minimum_stock_milli, product.unit),
                total_sold_display: formatQuantity(salesStats?.total_sold_milli || 0, product.unit),
                total_sales_display: formatRupees(salesStats?.total_sales_amount || 0),
                recent_movements: movements,
                batches
            }
        });
    } catch (err) {
        console.error('Product detail error:', err);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch product.' } });
    }
});

// POST /api/products — create product
router.post('/', (req, res) => {
    try {
        const storeId = req.storeId;
        const vendorUserId = req.vendorUserId;

        const name = req.body.name;
        const categoryId = req.body.categoryId || req.body.category_id || null;
        const supplierId = req.body.supplierId || req.body.supplier_id || null;
        let sku = req.body.sku;
        const price = req.body.price;
        const costPrice = req.body.costPrice !== undefined ? req.body.costPrice : req.body.cost_price;
        const initialQuantity = req.body.initialQuantity !== undefined ? req.body.initialQuantity : (req.body.quantity !== undefined ? req.body.quantity : 0);
        const minimumStock = req.body.minimumStock !== undefined ? req.body.minimumStock : (req.body.minimum_stock !== undefined ? req.body.minimum_stock : 10);
        const reorderQuantity = req.body.reorderQuantity !== undefined ? req.body.reorderQuantity : req.body.reorder_quantity;
        let unit = req.body.unit || 'piece';
        if (unit === 'packet') unit = 'pack';
        const trackExpiry = req.body.trackExpiry !== undefined ? req.body.trackExpiry : (req.body.track_expiry || false);
        const isQuickItem = req.body.isQuickItem !== undefined ? req.body.isQuickItem : (req.body.is_quick_item || false);
        const expiryDate = req.body.expiryDate || req.body.expiry_date;
        const batchLabel = req.body.batchLabel || req.body.batch_label;
        const gstRate = req.body.gstRate !== undefined ? req.body.gstRate : (req.body.gst_rate || 0);
        const barcode = req.body.barcode || null;
        const productType = req.body.productType || req.body.product_type || 'packaged';
        const rawPkgSize = req.body.packageSize !== undefined ? req.body.packageSize : req.body.package_size;
        const packageSizeMilli = rawPkgSize ? Math.round(parseFloat(rawPkgSize) * 1000) : (productType === 'loose' ? 1000 : 1000);

        if (!name || name.trim().length < 2 || name.trim().length > 120) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Product name must be between 2 and 120 characters.' }
            });
        }

        if (!sku || sku.trim().length === 0) {
            sku = 'SKU-' + Date.now().toString(36).toUpperCase();
        } else if (sku.trim().length < 2 || sku.trim().length > 40) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'SKU must be between 2 and 40 characters.' }
            });
        }

        // Verify active category belongs to this store if provided
        if (categoryId) {
            const cat = db.get('SELECT id FROM categories WHERE id = ? AND store_id = ? AND is_active = 1', [categoryId, storeId]);
            if (!cat) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'VALIDATION_ERROR', message: 'Selected category does not exist or is inactive.' }
                });
            }
        }

        // Verify supplier if provided
        if (supplierId) {
            const sup = db.get('SELECT id FROM suppliers WHERE id = ? AND store_id = ? AND is_active = 1', [supplierId, storeId]);
            if (!sup) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'VALIDATION_ERROR', message: 'Selected supplier does not exist or is inactive.' }
                });
            }
        }

        // Check SKU uniqueness within store
        const existingSku = db.get('SELECT id FROM products WHERE store_id = ? AND sku = ? COLLATE NOCASE', [storeId, sku.trim()]);
        if (existingSku) {
            return res.status(409).json({
                success: false,
                error: { code: 'DUPLICATE_SKU', message: 'A product with this SKU already exists in this store.' }
            });
        }

        // Check quick item limit (max 24)
        if (isQuickItem) {
            const quickCount = db.get('SELECT COUNT(*) as count FROM products WHERE store_id = ? AND is_quick_item = 1 AND is_active = 1', [storeId])?.count || 0;
            if (quickCount >= 24) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'QUICK_ITEM_LIMIT', message: 'A store can have at most 24 quick items.' }
                });
            }
        }

        // Price in paise
        const pricePaise = typeof price === 'number' && Number.isInteger(price) && price > 100000
            ? price // direct paise
            : parseRupeesToPaise(price);

        if (pricePaise < 0 || pricePaise > 10000000) { // max ₹1,00,000
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Price must be between ₹0 and ₹1,00,000.' }
            });
        }

        const costPricePaise = costPrice !== undefined && costPrice !== null && costPrice !== ''
            ? (typeof costPrice === 'number' && Number.isInteger(costPrice) && costPrice > 100000 ? costPrice : parseRupeesToPaise(costPrice))
            : null;

        // Parse quantities
        const qtyMilli = initialQuantity !== undefined && initialQuantity !== null
            ? parseQuantityToMilli(initialQuantity, unit)
            : 0;

        if (qtyMilli < 0) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Initial quantity cannot be negative.' }
            });
        }

        const minStockMilli = minimumStock !== undefined && minimumStock !== null && minimumStock !== ''
            ? parseQuantityToMilli(minimumStock, unit)
            : 10000;

        const reorderMilli = reorderQuantity ? parseQuantityToMilli(reorderQuantity, unit) : null;

        if (trackExpiry && qtyMilli > 0 && !expiryDate) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Expiry date is required for products tracking expiry with initial stock.' }
            });
        }

        let productId;
        db.transaction(() => {
            db.run(
                `INSERT INTO products (
                    store_id, name, category_id, supplier_id, sku, price, cost_price,
                    quantity_milli, minimum_stock_milli, reorder_quantity_milli,
                    unit, track_expiry, is_quick_item, product_type, package_size_milli,
                    gst_rate_bps, hsn_code, is_active
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
                [
                    storeId, name.trim(), categoryId, supplierId || null, sku.trim(),
                    pricePaise, costPricePaise, qtyMilli, minStockMilli, reorderMilli,
                    unit, trackExpiry ? 1 : 0, isQuickItem ? 1 : 0, productType, packageSizeMilli,
                    gstRate || 0, req.body.hsnCode || req.body.barcode || null
                ]
            );
            productId = db.getLastInsertRowId();

            // Record initial movement
            if (qtyMilli > 0) {
                db.run(
                    `INSERT INTO stock_movements (
                        store_id, product_id, type, quantity_change_milli, quantity_after_milli, note, created_by
                    ) VALUES (?, ?, 'restock', ?, ?, 'Initial stock', ?)`,
                    [storeId, productId, qtyMilli, qtyMilli, vendorUserId]
                );
                const movementId = db.getLastInsertRowId();

                if (trackExpiry && expiryDate) {
                    db.run(
                        `INSERT INTO stock_batches (
                            store_id, product_id, batch_label, expiry_date, quantity_received_milli, movement_id, created_by
                        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [storeId, productId, batchLabel ? batchLabel.trim() : null, expiryDate, qtyMilli, movementId, vendorUserId]
                    );
                }
            }

            // Log activity
            db.run(
                `INSERT INTO activity_logs (store_id, vendor_user_id, action, entity_type, entity_id, details)
                 VALUES (?, ?, 'PRODUCT_CREATED', 'product', ?, ?)`,
                [storeId, vendorUserId, productId, JSON.stringify({ name: name.trim(), sku: sku.trim() })]
            );
        });

        res.status(201).json({
            success: true,
            data: { id: productId, message: 'Product created successfully.' }
        });
    } catch (err) {
        console.error('Create product error:', err);
        const errCode = (err.message && (err.message.includes('Fractional quantities') || err.message.includes('quantity'))) ? 'INVALID_QUANTITY' : 'CREATE_FAILED';
        res.status(400).json({
            success: false,
            error: { code: errCode, message: err.message || 'Failed to create product.' }
        });
    }
});

// PUT /api/products/:id — update product details (cannot update quantity)
router.put('/:id', (req, res) => {
    try {
        const storeId = req.storeId;
        const vendorUserId = req.vendorUserId;
        const id = parseInt(req.params.id);

        const product = db.get('SELECT * FROM products WHERE id = ? AND store_id = ?', [id, storeId]);
        if (!product) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Product not found.' } });
        }

        const {
            name,
            categoryId,
            supplierId,
            sku,
            price,
            costPrice,
            minimumStock,
            reorderQuantity,
            unit,
            trackExpiry,
            isQuickItem,
            productType,
            packageSize
        } = req.body;

        const rawPkgSize = packageSize !== undefined ? packageSize : req.body.package_size;
        const packageSizeMilli = rawPkgSize !== undefined && rawPkgSize !== null && rawPkgSize !== ''
            ? Math.round(parseFloat(rawPkgSize) * 1000)
            : null;
        const pType = productType || req.body.product_type || null;

        if (name && (name.trim().length < 2 || name.trim().length > 120)) {
            return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Name must be 2 to 120 characters.' } });
        }

        if (sku && sku.trim() !== product.sku) {
            const dup = db.get('SELECT id FROM products WHERE store_id = ? AND sku = ? COLLATE NOCASE AND id <> ?', [storeId, sku.trim(), id]);
            if (dup) {
                return res.status(409).json({ success: false, error: { code: 'DUPLICATE_SKU', message: 'SKU already in use.' } });
            }
        }

        // Unit change rules: only allowed if same kind (whole to whole, measured to measured), or no sales/movements
        let newUnit = unit || product.unit;
        if (newUnit === 'packet') newUnit = 'pack';
        if (newUnit !== product.unit) {
            const hasMovements = db.get('SELECT id FROM stock_movements WHERE product_id = ? AND store_id = ? LIMIT 1', [id, storeId]);
            const sameKind = (isWholeUnit(product.unit) && isWholeUnit(newUnit)) || (!isWholeUnit(product.unit) && !isWholeUnit(newUnit));
            if (hasMovements && !sameKind) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'INVALID_UNIT_CHANGE', message: 'Cannot change unit between whole and measured once stock movements exist.' }
                });
            }
        }

        const pricePaise = price !== undefined
            ? (typeof price === 'number' && Number.isInteger(price) && price > 100000 ? price : parseRupeesToPaise(price))
            : product.price;

        const costPricePaise = costPrice !== undefined && costPrice !== null && costPrice !== ''
            ? (typeof costPrice === 'number' && Number.isInteger(costPrice) && costPrice > 100000 ? costPrice : parseRupeesToPaise(costPrice))
            : product.cost_price;

        const minStockMilli = minimumStock !== undefined && minimumStock !== null && minimumStock !== ''
            ? parseQuantityToMilli(minimumStock, newUnit)
            : product.minimum_stock_milli;

        const reorderMilli = reorderQuantity ? parseQuantityToMilli(reorderQuantity, newUnit) : product.reorder_quantity_milli;

        const gstRateBps = req.body.gstRate !== undefined
            ? parseInt(req.body.gstRate)
            : (req.body.gst_rate_bps !== undefined ? parseInt(req.body.gst_rate_bps) : (product.gst_rate_bps || 0));

        const hsnCode = req.body.hsnCode || req.body.barcode || product.hsn_code;

        db.run(
            `UPDATE products SET
                name = COALESCE(?, name),
                category_id = COALESCE(?, category_id),
                supplier_id = ?,
                sku = COALESCE(?, sku),
                price = ?,
                cost_price = ?,
                minimum_stock_milli = ?,
                reorder_quantity_milli = ?,
                unit = ?,
                track_expiry = COALESCE(?, track_expiry),
                is_quick_item = COALESCE(?, is_quick_item),
                product_type = COALESCE(?, product_type),
                package_size_milli = COALESCE(?, package_size_milli),
                gst_rate_bps = ?,
                hsn_code = ?,
                updated_at = datetime('now')
             WHERE id = ? AND store_id = ?`,
            [
                name ? name.trim() : null,
                categoryId || null,
                supplierId || null,
                sku ? sku.trim() : null,
                pricePaise,
                costPricePaise,
                minStockMilli,
                reorderMilli,
                newUnit,
                trackExpiry !== undefined ? (trackExpiry ? 1 : 0) : null,
                isQuickItem !== undefined ? (isQuickItem ? 1 : 0) : null,
                pType,
                packageSizeMilli,
                gstRateBps,
                hsnCode,
                id,
                storeId
            ]
        );

        // Update quantity if explicitly passed
        if (req.body.quantity !== undefined && req.body.quantity !== null && req.body.quantity !== '') {
            const newQtyMilli = parseQuantityToMilli(req.body.quantity, newUnit);
            if (newQtyMilli !== product.quantity_milli) {
                const qtyDiff = newQtyMilli - product.quantity_milli;
                db.run('UPDATE products SET quantity_milli = ? WHERE id = ? AND store_id = ?', [newQtyMilli, id, storeId]);
                db.run(
                    `INSERT INTO stock_movements (
                        store_id, product_id, type, quantity_change_milli, quantity_after_milli, note, created_by
                    ) VALUES (?, ?, ?, ?, ?, 'Stock updated via product edit', ?)`,
                    [storeId, id, qtyDiff > 0 ? 'restock' : 'adjustment', qtyDiff, newQtyMilli, vendorUserId]
                );
            }
        }

        const expiryDate = req.body.expiryDate || req.body.expiry_date;
        const batchLabel = req.body.batchLabel || req.body.batch_label;
        if (expiryDate) {
            const existingBatch = db.get('SELECT id FROM stock_batches WHERE product_id = ? AND store_id = ? ORDER BY id DESC LIMIT 1', [id, storeId]);
            if (existingBatch) {
                db.run('UPDATE stock_batches SET expiry_date = ?, batch_label = COALESCE(?, batch_label) WHERE id = ?', [expiryDate, batchLabel || null, existingBatch.id]);
            } else {
                db.run(
                    `INSERT INTO stock_batches (store_id, product_id, batch_label, expiry_date, quantity_received_milli, created_by)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [storeId, id, batchLabel || 'BATCH-01', expiryDate, product.quantity_milli || 0, vendorUserId]
                );
            }
        }

        db.run(
            `INSERT INTO activity_logs (store_id, vendor_user_id, action, entity_type, entity_id, details)
             VALUES (?, ?, 'PRODUCT_UPDATED', 'product', ?, ?)`,
            [storeId, vendorUserId, id, JSON.stringify({ name: name || product.name })]
        );

        res.json({ success: true, message: 'Product updated successfully.' });
    } catch (err) {
        console.error('Update product error:', err);
        res.status(400).json({ success: false, error: { code: 'UPDATE_FAILED', message: err.message || 'Failed to update product.' } });
    }
});

// POST /api/products/:id/deactivate — soft delete (C3)
router.post('/:id/deactivate', (req, res) => {
    try {
        const storeId = req.storeId;
        const vendorUserId = req.vendorUserId;
        const id = parseInt(req.params.id);

        const product = db.get('SELECT * FROM products WHERE id = ? AND store_id = ?', [id, storeId]);
        if (!product) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Product not found.' } });
        }

        db.run('UPDATE products SET is_active = 0, updated_at = datetime("now") WHERE id = ? AND store_id = ?', [id, storeId]);

        db.run(
            `INSERT INTO activity_logs (store_id, vendor_user_id, action, entity_type, entity_id)
             VALUES (?, ?, 'PRODUCT_DEACTIVATED', 'product', ?)`,
            [storeId, vendorUserId, id]
        );

        res.json({ success: true, message: 'Product deactivated successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to deactivate product.' } });
    }
});

// POST /api/products/:id/reactivate
router.post('/:id/reactivate', (req, res) => {
    try {
        const storeId = req.storeId;
        const vendorUserId = req.vendorUserId;
        const id = parseInt(req.params.id);

        const product = db.get('SELECT * FROM products WHERE id = ? AND store_id = ?', [id, storeId]);
        if (!product) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Product not found.' } });
        }

        // Check if category is active
        const cat = db.get('SELECT is_active FROM categories WHERE id = ? AND store_id = ?', [product.category_id, storeId]);
        if (!cat || !cat.is_active) {
            return res.status(400).json({
                success: false,
                error: { code: 'INACTIVE_CATEGORY', message: 'Cannot reactivate product because its category is inactive. Reactivate the category first.' }
            });
        }

        // Check if supplier is active
        if (product.supplier_id) {
            const sup = db.get('SELECT is_active FROM suppliers WHERE id = ? AND store_id = ?', [product.supplier_id, storeId]);
            if (!sup || !sup.is_active) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'INACTIVE_SUPPLIER', message: 'Cannot reactivate product because its supplier is inactive. Reactivate the supplier first.' }
                });
            }
        }

        db.run('UPDATE products SET is_active = 1, updated_at = datetime("now") WHERE id = ? AND store_id = ?', [id, storeId]);

        db.run(
            `INSERT INTO activity_logs (store_id, vendor_user_id, action, entity_type, entity_id)
             VALUES (?, ?, 'PRODUCT_REACTIVATED', 'product', ?)`,
            [storeId, vendorUserId, id]
        );

        res.json({ success: true, message: 'Product reactivated successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to reactivate product.' } });
    }
});

// DELETE /api/products/:id — soft-deactivates product (backward compatibility with earlier tests)
router.delete('/:id', (req, res) => {
    try {
        const storeId = req.storeId;
        const vendorUserId = req.vendorUserId;
        const id = parseInt(req.params.id);

        const product = db.get('SELECT * FROM products WHERE id = ? AND store_id = ?', [id, storeId]);
        if (!product) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Product not found.' } });
        }

        db.run('UPDATE products SET is_active = 0, updated_at = datetime("now") WHERE id = ? AND store_id = ?', [id, storeId]);
        res.json({ success: true, message: 'Product deactivated successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to deactivate product.' } });
    }
});

module.exports = router;
