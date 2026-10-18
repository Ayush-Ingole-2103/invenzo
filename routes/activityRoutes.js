// ============================================
// Activity Log Routes — PRD Section 12.11
// ============================================
const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { requireVendor } = require('../middleware/authMiddleware');

router.use(requireVendor);

// GET /api/activity — list store activity logs
router.get('/', (req, res) => {
    try {
        const storeId = req.storeId;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
        const offset = (page - 1) * limit;

        const action = req.query.action;
        let whereClause = 'WHERE a.store_id = ?';
        const params = [storeId];

        if (action) {
            whereClause += ' AND a.action = ?';
            params.push(action);
        }

        const countQuery = `SELECT COUNT(*) as total FROM activity_logs a ${whereClause}`;
        const total = db.get(countQuery, params)?.total || 0;

        const dataQuery = `
            SELECT a.*, vu.name as user_name
            FROM activity_logs a
            LEFT JOIN vendor_users vu ON a.vendor_user_id = vu.id
            ${whereClause}
            ORDER BY a.created_at DESC, a.id DESC
            LIMIT ? OFFSET ?
        `;
        const logs = db.all(dataQuery, [...params, limit, offset]);

        res.json({
            success: true,
            data: logs,
            meta: { page, limit, total }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch activity logs.' } });
    }
});

module.exports = router;
