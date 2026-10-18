// ============================================
// Supplier Routes — PRD Section 12.3, C9 & C10
// ============================================
const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { requireVendor } = require('../middleware/authMiddleware');

router.use(requireVendor);

// Helper: check active products count for supplier
function getActiveProductsCount(supplierId, storeId) {
    const res = db.get('SELECT COUNT(*) as count FROM products WHERE supplier_id = ? AND store_id = ? AND is_active = 1', [supplierId, storeId]);
    return res ? res.count : 0;
}

// GET /api/suppliers — list with active product count
router.get('/', (req, res) => {
    try {
        const storeId = req.storeId;
        const includeInactive = req.query.includeInactive === 'true' || req.query.includeInactive === '1';
        const search = req.query.search ? req.query.search.trim() : '';

        let sql = `
            SELECT s.*, COUNT(p.id) as product_count
            FROM suppliers s
            LEFT JOIN products p ON s.id = p.supplier_id AND s.store_id = p.store_id AND p.is_active = 1
            WHERE s.store_id = ?
        `;
        const params = [storeId];

        if (!includeInactive) {
            sql += ' AND s.is_active = 1';
        }

        if (search) {
            sql += ' AND (s.name LIKE ? OR s.phone LIKE ?)';
            const term = `%${search}%`;
            params.push(term, term);
        }

        sql += ' GROUP BY s.id ORDER BY s.name ASC';

        const suppliers = db.all(sql, params);
        res.json({ success: true, data: suppliers });
    } catch (err) {
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch suppliers.' } });
    }
});

// POST /api/suppliers — create supplier
router.post('/', (req, res) => {
    try {
        const storeId = req.storeId;
        const vendorUserId = req.vendorUserId;
        const { name, phone, email, address } = req.body;

        if (!name || name.trim().length < 2 || name.trim().length > 120) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Supplier name must be between 2 and 120 characters.' }
            });
        }

        db.run(
            `INSERT INTO suppliers (store_id, name, phone, email, address, is_active)
             VALUES (?, ?, ?, ?, ?, 1)`,
            [storeId, name.trim(), phone ? phone.trim() : null, email ? email.trim() : null, address ? address.trim() : null]
        );
        const id = db.getLastInsertRowId();

        db.run(
            `INSERT INTO activity_logs (store_id, vendor_user_id, action, entity_type, entity_id, details)
             VALUES (?, ?, 'SUPPLIER_CREATED', 'supplier', ?, ?)`,
            [storeId, vendorUserId, id, JSON.stringify({ name: name.trim() })]
        );

        res.status(201).json({ success: true, data: { id, name: name.trim() } });
    } catch (err) {
        res.status(400).json({ success: false, error: { code: 'CREATE_FAILED', message: err.message } });
    }
});

// PUT /api/suppliers/:id — update supplier
router.put('/:id', (req, res) => {
    try {
        const storeId = req.storeId;
        const id = parseInt(req.params.id);
        const { name, phone, email, address } = req.body;

        if (!name || name.trim().length < 2 || name.trim().length > 120) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Supplier name must be between 2 and 120 characters.' }
            });
        }

        const sup = db.get('SELECT * FROM suppliers WHERE id = ? AND store_id = ?', [id, storeId]);
        if (!sup) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Supplier not found.' } });
        }

        db.run(
            `UPDATE suppliers SET
                name = ?, phone = ?, email = ?, address = ?
             WHERE id = ? AND store_id = ?`,
            [name.trim(), phone ? phone.trim() : null, email ? email.trim() : null, address ? address.trim() : null, id, storeId]
        );

        res.json({ success: true, message: 'Supplier updated successfully.' });
    } catch (err) {
        res.status(400).json({ success: false, error: { code: 'UPDATE_FAILED', message: err.message } });
    }
});

// POST /api/suppliers/:id/deactivate
router.post('/:id/deactivate', (req, res) => {
    try {
        const storeId = req.storeId;
        const id = parseInt(req.params.id);

        const activeCount = getActiveProductsCount(id, storeId);
        if (activeCount > 0) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'DELETE_BLOCKED',
                    message: 'This supplier has active products. Reassign or deactivate those products first.',
                    details: { activeProductsCount: activeCount }
                }
            });
        }

        db.run('UPDATE suppliers SET is_active = 0 WHERE id = ? AND store_id = ?', [id, storeId]);
        res.json({ success: true, message: 'Supplier deactivated successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to deactivate supplier.' } });
    }
});

// DELETE /api/suppliers/:id (alias for deactivate with delete protection check)
router.delete('/:id', (req, res) => {
    try {
        const storeId = req.storeId;
        const id = parseInt(req.params.id);

        const activeCount = getActiveProductsCount(id, storeId);
        if (activeCount > 0) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'DELETE_BLOCKED',
                    message: 'This supplier has active products. Reassign or deactivate those products first.',
                    details: { activeProductsCount: activeCount }
                }
            });
        }

        db.run('UPDATE suppliers SET is_active = 0 WHERE id = ? AND store_id = ?', [id, storeId]);
        res.json({ success: true, message: 'Supplier deactivated successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete supplier.' } });
    }
});

// POST /api/suppliers/:id/reactivate
router.post('/:id/reactivate', (req, res) => {
    try {
        const storeId = req.storeId;
        const id = parseInt(req.params.id);
        db.run('UPDATE suppliers SET is_active = 1 WHERE id = ? AND store_id = ?', [id, storeId]);
        res.json({ success: true, message: 'Supplier reactivated successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to reactivate supplier.' } });
    }
});

module.exports = router;
