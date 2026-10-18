// ============================================
// Category Routes — PRD Section 12.3 & C10
// ============================================
const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { requireVendor } = require('../middleware/authMiddleware');

router.use(requireVendor);

// GET /api/categories — list categories with active product count
router.get('/', (req, res) => {
    try {
        const storeId = req.storeId;
        const includeInactive = req.query.includeInactive === 'true' || req.query.includeInactive === '1';
        const search = req.query.search ? req.query.search.trim() : '';

        let sql = `
            SELECT c.*, COUNT(p.id) as product_count
            FROM categories c
            LEFT JOIN products p ON c.id = p.category_id AND c.store_id = p.store_id AND p.is_active = 1
            WHERE c.store_id = ?
        `;
        const params = [storeId];

        if (!includeInactive) {
            sql += ' AND c.is_active = 1';
        }

        if (search) {
            sql += ' AND c.name LIKE ?';
            params.push(`%${search}%`);
        }

        sql += ' GROUP BY c.id ORDER BY c.name ASC';

        const categories = db.all(sql, params);
        res.json({ success: true, data: categories });
    } catch (err) {
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch categories.' } });
    }
});

// POST /api/categories — create category
router.post('/', (req, res) => {
    try {
        const storeId = req.storeId;
        const vendorUserId = req.vendorUserId;
        const { name } = req.body;

        if (!name || name.trim().length < 2 || name.trim().length > 100) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Category name must be between 2 and 100 characters.' }
            });
        }

        const existing = db.get('SELECT id FROM categories WHERE store_id = ? AND name = ? COLLATE NOCASE', [storeId, name.trim()]);
        if (existing) {
            return res.status(409).json({
                success: false,
                error: { code: 'DUPLICATE_CATEGORY', message: 'Category with this name already exists.' }
            });
        }

        db.run('INSERT INTO categories (store_id, name, is_active) VALUES (?, ?, 1)', [storeId, name.trim()]);
        const id = db.getLastInsertRowId();

        db.run(
            `INSERT INTO activity_logs (store_id, vendor_user_id, action, entity_type, entity_id, details)
             VALUES (?, ?, 'CATEGORY_CREATED', 'category', ?, ?)`,
            [storeId, vendorUserId, id, JSON.stringify({ name: name.trim() })]
        );

        res.status(201).json({ success: true, data: { id, name: name.trim() } });
    } catch (err) {
        res.status(400).json({ success: false, error: { code: 'CREATE_FAILED', message: err.message } });
    }
});

// PUT /api/categories/:id — update category
router.put('/:id', (req, res) => {
    try {
        const storeId = req.storeId;
        const id = parseInt(req.params.id);
        const { name } = req.body;

        if (!name || name.trim().length < 2 || name.trim().length > 100) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Category name must be between 2 and 100 characters.' }
            });
        }

        const cat = db.get('SELECT * FROM categories WHERE id = ? AND store_id = ?', [id, storeId]);
        if (!cat) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Category not found.' } });
        }

        const dup = db.get('SELECT id FROM categories WHERE store_id = ? AND name = ? COLLATE NOCASE AND id <> ?', [storeId, name.trim(), id]);
        if (dup) {
            return res.status(409).json({ success: false, error: { code: 'DUPLICATE_CATEGORY', message: 'Category with this name already exists.' } });
        }

        db.run('UPDATE categories SET name = ? WHERE id = ? AND store_id = ?', [name.trim(), id, storeId]);
        res.json({ success: true, message: 'Category updated successfully.' });
    } catch (err) {
        res.status(400).json({ success: false, error: { code: 'UPDATE_FAILED', message: err.message } });
    }
});

// Helper: check active products count
function getActiveProductsCount(categoryId, storeId) {
    const res = db.get('SELECT COUNT(*) as count FROM products WHERE category_id = ? AND store_id = ? AND is_active = 1', [categoryId, storeId]);
    return res ? res.count : 0;
}

// POST /api/categories/:id/deactivate
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
                    message: 'This category has active products. Reassign or deactivate those products first.',
                    details: { activeProductsCount: activeCount }
                }
            });
        }

        db.run('UPDATE categories SET is_active = 0 WHERE id = ? AND store_id = ?', [id, storeId]);
        res.json({ success: true, message: 'Category deactivated successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to deactivate category.' } });
    }
});

// DELETE /api/categories/:id (alias for deactivate with delete protection check)
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
                    message: 'This category has active products. Reassign or deactivate those products first.',
                    details: { activeProductsCount: activeCount }
                }
            });
        }

        db.run('UPDATE categories SET is_active = 0 WHERE id = ? AND store_id = ?', [id, storeId]);
        res.json({ success: true, message: 'Category deactivated successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete category.' } });
    }
});

// POST /api/categories/:id/reactivate
router.post('/:id/reactivate', (req, res) => {
    try {
        const storeId = req.storeId;
        const id = parseInt(req.params.id);
        db.run('UPDATE categories SET is_active = 1 WHERE id = ? AND store_id = ?', [id, storeId]);
        res.json({ success: true, message: 'Category reactivated successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to reactivate category.' } });
    }
});

module.exports = router;
