// ============================================
// Developer Module Routes — PRD Section 17 & 19.4
// Prefix: /developer/api
// ============================================
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const router = express.Router();
const db = require('../database/db');
const { requireDeveloper } = require('../middleware/authMiddleware');
const { loginLimiter } = require('../middleware/rateLimitMiddleware');
const developerStats = require('../services/developer/developerStatsService');
const { formatRupees } = require('../utils/money');

// POST /developer/api/auth/login — Developer login
router.post('/auth/login', loginLimiter, (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Username and password are required.' }
            });
        }

        const dev = db.get('SELECT * FROM developers WHERE username = ? COLLATE NOCASE', [username.trim()]);
        if (!dev || !dev.is_active) {
            return res.status(401).json({
                success: false,
                error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password.' }
            });
        }

        const valid = bcrypt.compareSync(password, dev.password_hash);
        if (!valid) {
            try {
                db.run(`INSERT INTO developer_audit_logs (developer_id, action, details)
                        VALUES (?, 'LOGIN_FAILED', ?)`,
                    [dev.id, JSON.stringify({ reason: 'wrong_password' })]);
            } catch {}
            return res.status(401).json({
                success: false,
                error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password.' }
            });
        }

        // Establish developer session
        req.session.developer = {
            id: dev.id,
            name: dev.name,
            username: dev.username
        };

        db.run("UPDATE developers SET last_login_at = datetime('now') WHERE id = ?", [dev.id]);

        try {
            db.run(`INSERT INTO developer_audit_logs (developer_id, action)
                    VALUES (?, 'LOGIN_SUCCESS')`, [dev.id]);
        } catch {}

        res.json({
            success: true,
            data: {
                id: dev.id,
                name: dev.name,
                username: dev.username,
                role: 'developer',
                csrfToken: req.session.csrfToken
            }
        });
    } catch (err) {
        console.error('Developer login error:', err);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Developer login failed.' } });
    }
});

// POST /developer/api/auth/logout
router.post('/auth/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ success: false, error: { code: 'LOGOUT_ERROR', message: 'Failed to logout.' } });
        }
        res.clearCookie('stocker_developer_sid');
        res.json({ success: true, message: 'Developer logged out successfully.' });
    });
});

// Protect remaining developer routes
router.use(requireDeveloper);

// GET /developer/api/auth/me
router.get('/auth/me', (req, res) => {
    res.json({
        success: true,
        data: {
            id: req.session.developer.id,
            name: req.session.developer.name,
            username: req.session.developer.username,
            csrfToken: req.session.csrfToken
        }
    });
});

// GET /developer/api/overview — Platform totals
router.get('/overview', (req, res) => {
    try {
        const overview = developerStats.getPlatformOverview();
        const recentStores = db.all(`
            SELECT s.id, s.store_code, s.name, s.owner_name, s.city, s.status, s.created_at,
                   vu.username as vendor_username
            FROM stores s
            LEFT JOIN vendor_users vu ON s.id = vu.store_id
            ORDER BY s.created_at DESC LIMIT 5
        `);

        res.json({
            success: true,
            data: {
                ...overview,
                totalBilledDisplay: formatRupees(overview.totalBilled),
                recentStores
            }
        });
    } catch (err) {
        console.error('Overview error:', err);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch overview.' } });
    }
});

// GET /developer/api/stores — List stores with aggregate stats
router.get('/stores', (req, res) => {
    try {
        const search = req.query.search ? req.query.search.trim() : '';
        const status = req.query.status;

        let where = 'WHERE 1=1';
        const params = [];

        if (status) {
            where += ' AND s.status = ?';
            params.push(status);
        }

        if (search) {
            where += ' AND (s.name LIKE ? OR s.owner_name LIKE ? OR s.store_code LIKE ? OR s.city LIKE ?)';
            const term = `%${search}%`;
            params.push(term, term, term, term);
        }

        const stores = db.all(`
            SELECT s.id, s.store_code, s.name, s.owner_name, s.phone, s.email, s.city, s.status, s.created_at,
                   vu.username as vendor_username, vu.last_login_at,
                   COALESCE(dpc.product_count, 0) as product_count
            FROM stores s
            LEFT JOIN vendor_users vu ON s.id = vu.store_id
            LEFT JOIN dev_product_counts dpc ON s.id = dpc.store_id
            ${where}
            ORDER BY s.created_at DESC
        `, params);

        // Enrich with sales stats
        const enriched = stores.map(store => {
            const stats = developerStats.getStoreStats(store.id);
            return {
                ...store,
                totalBilled: stats.totalBilled,
                totalBilledDisplay: formatRupees(stats.totalBilled),
                salesThisWeek: stats.salesThisWeek,
                salesThisMonth: stats.salesThisMonth,
                salesThisYear: stats.salesThisYear
            };
        });

        res.json({ success: true, data: enriched });
    } catch (err) {
        console.error('Stores list error:', err);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch stores.' } });
    }
});

// GET /developer/api/stores/:id — Store detail
router.get('/stores/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const store = db.get(`
            SELECT s.*, vu.username as vendor_username, vu.last_login_at, dev.name as created_by_name
            FROM stores s
            LEFT JOIN vendor_users vu ON s.id = vu.store_id
            LEFT JOIN developers dev ON s.created_by = dev.id
            WHERE s.id = ?
        `, [id]);

        if (!store) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Store not found.' } });
        }

        const stats = developerStats.getStoreStats(id);

        res.json({
            success: true,
            data: {
                store,
                stats: {
                    ...stats,
                    totalBilledDisplay: formatRupees(stats.totalBilled)
                }
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch store details.' } });
    }
});

// POST /developer/api/stores — Create store with initial vendor login (Section 17.1)
router.post('/stores', (req, res) => {
    try {
        const devId = req.developerId;
        const {
            name,
            ownerName,
            phone,
            email,
            address,
            city,
            timezone = 'Asia/Kolkata',
            vendorUsername,
            starterCategories = false
        } = req.body;

        if (!name || name.trim().length < 2 || name.trim().length > 120) {
            return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Store name must be 2 to 120 characters.' } });
        }

        if (!ownerName || ownerName.trim().length < 2) {
            return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Owner name is required.' } });
        }

        if (!vendorUsername || vendorUsername.trim().length < 4 || vendorUsername.trim().length > 30) {
            return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Vendor username must be 4 to 30 characters.' } });
        }

        // Check unique vendor username
        const dupUser = db.get('SELECT id FROM vendor_users WHERE username = ? COLLATE NOCASE', [vendorUsername.trim()]);
        if (dupUser) {
            return res.status(409).json({ success: false, error: { code: 'DUPLICATE_USERNAME', message: 'Vendor username already in use.' } });
        }

        // Generate temporary password (14 characters)
        const tempPassword = 'Temp_' + crypto.randomBytes(6).toString('hex') + '!';
        const passwordHash = bcrypt.hashSync(tempPassword, 12);

        let createdStoreId;
        let storeCode;

        db.transaction(() => {
            // Generate store code
            const maxStore = db.get('SELECT MAX(id) as max_id FROM stores');
            const nextId = (maxStore?.max_id || 0) + 1;
            storeCode = `STR-${nextId.toString().padStart(6, '0')}`;

            db.run(
                `INSERT INTO stores (
                    store_code, name, owner_name, phone, email, address, city, timezone, status, created_by
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
                [storeCode, name.trim(), ownerName.trim(), phone ? phone.trim() : null, email ? email.trim() : null, address ? address.trim() : null, city ? city.trim() : null, timezone, devId]
            );
            createdStoreId = db.getLastInsertRowId();

            // Create vendor login
            db.run(
                `INSERT INTO vendor_users (
                    store_id, name, username, password_hash, must_change_password, is_active
                ) VALUES (?, ?, ?, ?, 1, 1)`,
                [createdStoreId, ownerName.trim(), vendorUsername.trim(), passwordHash]
            );

            // Create default settings
            const defaultSettings = [
                ['default_minimum_stock', '10'],
                ['items_per_page', '20'],
                ['session_timeout_minutes', '30'],
                ['language', 'en'],
                ['upi_id', ''],
                ['bill_prefix', 'B'],
                ['receipt_width', '80mm'],
                ['receipt_footer', 'Thank you for your visit!'],
                ['expiry_alert_days', '30'],
                ['gst_mode', 'none'],
                ['gstin', ''],
                ['default_gst_rate_bps', '']
            ];
            for (const [k, v] of defaultSettings) {
                db.run('INSERT INTO store_settings (store_id, key, value) VALUES (?, ?, ?)', [createdStoreId, k, v]);
            }

            // Optional starter categories
            if (starterCategories) {
                const starters = ['Beverages', 'Dairy', 'Dry fruits', 'Grains', 'Household', 'Pulses', 'Snacks', 'Spices'];
                for (const catName of starters) {
                    db.run('INSERT INTO categories (store_id, name, is_active) VALUES (?, ?, 1)', [createdStoreId, catName]);
                }
            }

            // Developer audit log
            db.run(
                `INSERT INTO developer_audit_logs (developer_id, action, store_id, details)
                 VALUES (?, 'STORE_CREATE', ?, ?)`,
                [devId, createdStoreId, JSON.stringify({ storeCode, name: name.trim(), vendorUsername: vendorUsername.trim() })]
            );
        });

        // Return credentials ONCE
        res.status(201).json({
            success: true,
            data: {
                storeId: createdStoreId,
                storeCode,
                vendorUsername: vendorUsername.trim(),
                temporaryPassword: tempPassword,
                notice: 'This password is shown once. Provide it securely to the store owner.'
            }
        });
    } catch (err) {
        console.error('Create store error:', err);
        res.status(400).json({ success: false, error: { code: 'CREATE_FAILED', message: err.message } });
    }
});

// POST /developer/api/stores/:id/suspend
router.post('/stores/:id/suspend', (req, res) => {
    try {
        const devId = req.developerId;
        const id = parseInt(req.params.id);
        const { reason = 'Administrative suspension' } = req.body;

        db.run("UPDATE stores SET status = 'suspended', suspended_reason = ?, updated_at = datetime('now') WHERE id = ?", [reason.trim(), id]);

        db.run(
            `INSERT INTO developer_audit_logs (developer_id, action, store_id, details)
             VALUES (?, 'STORE_SUSPEND', ?, ?)`,
            [devId, id, JSON.stringify({ reason: reason.trim() })]
        );

        res.json({ success: true, message: 'Store suspended successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to suspend store.' } });
    }
});

// POST /developer/api/stores/:id/reactivate
router.post('/stores/:id/reactivate', (req, res) => {
    try {
        const devId = req.developerId;
        const id = parseInt(req.params.id);

        db.run("UPDATE stores SET status = 'active', suspended_reason = NULL, updated_at = datetime('now') WHERE id = ?", [id]);

        db.run(
            `INSERT INTO developer_audit_logs (developer_id, action, store_id)
             VALUES (?, 'STORE_REACTIVATE', ?)`,
            [devId, id]
        );

        res.json({ success: true, message: 'Store reactivated successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to reactivate store.' } });
    }
});

// POST /developer/api/stores/:id/reset-vendor-password
router.post('/stores/:id/reset-vendor-password', (req, res) => {
    try {
        const devId = req.developerId;
        const storeId = parseInt(req.params.id);

        const vendor = db.get('SELECT id, username FROM vendor_users WHERE store_id = ?', [storeId]);
        if (!vendor) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Vendor account not found for this store.' } });
        }

        const tempPassword = 'Reset_' + crypto.randomBytes(6).toString('hex') + '!';
        const hash = bcrypt.hashSync(tempPassword, 12);

        db.run('UPDATE vendor_users SET password_hash = ?, must_change_password = 1 WHERE id = ?', [hash, vendor.id]);

        db.run(
            `INSERT INTO developer_audit_logs (developer_id, action, store_id, details)
             VALUES (?, 'VENDOR_PASSWORD_RESET', ?, ?)`,
            [devId, storeId, JSON.stringify({ vendorUsername: vendor.username })]
        );

        res.json({
            success: true,
            data: {
                vendorUsername: vendor.username,
                temporaryPassword: tempPassword,
                notice: 'This password is shown once. Provide it to the vendor.'
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to reset password.' } });
    }
});

// DELETE /developer/api/stores/:id — Permanently delete store and all associated data (PRD Admin / Developer Purge)
router.delete('/stores/:id', (req, res) => {
    try {
        const devId = req.developerId;
        const id = parseInt(req.params.id);
        const { confirmation } = req.body || {};

        const store = db.get('SELECT id, store_code, name, owner_name FROM stores WHERE id = ?', [id]);
        if (!store) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Store not found.' }
            });
        }

        // Validate double confirmation phrase
        const conf = (confirmation || '').trim();
        const validConfirmation = 
            conf.toUpperCase() === 'DELETE' || 
            conf.toUpperCase() === store.store_code.toUpperCase() ||
            conf.toLowerCase() === store.name.trim().toLowerCase();

        if (!validConfirmation) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'CONFIRMATION_REQUIRED',
                    message: `Confirmation mismatch. You must enter '${store.store_code}' or 'DELETE' to confirm deletion.`
                }
            });
        }

        // Execute atomic cascade purge across all tenant tables
        db.transaction(() => {
            // Temporarily drop append-only audit and ledger triggers
            db.exec(`
                DROP TRIGGER IF EXISTS trg_customer_ledger_no_delete;
                DROP TRIGGER IF EXISTS trg_customer_ledger_no_update;
                DROP TRIGGER IF EXISTS trg_stock_movements_no_delete;
                DROP TRIGGER IF EXISTS trg_stock_movements_no_update;
                DROP TRIGGER IF EXISTS trg_activity_logs_no_delete;
                DROP TRIGGER IF EXISTS trg_activity_logs_no_update;
                DROP TRIGGER IF EXISTS trg_dev_audit_no_delete;
                DROP TRIGGER IF EXISTS trg_dev_audit_no_update;
            `);

            // 1. Stock batches
            db.run('DELETE FROM stock_batches WHERE store_id = ?', [id]);
            // 2. Stock movements
            db.run('DELETE FROM stock_movements WHERE store_id = ?', [id]);
            // 3. Sale items
            db.run('DELETE FROM sale_items WHERE store_id = ?', [id]);
            // 4. Sales records
            db.run('DELETE FROM sales WHERE store_id = ?', [id]);
            // 5. Customer ledger & debts
            db.run('DELETE FROM customer_ledger WHERE store_id = ?', [id]);
            // 6. Customers
            db.run('DELETE FROM customers WHERE store_id = ?', [id]);
            // 7. Products
            db.run('DELETE FROM products WHERE store_id = ?', [id]);
            // 8. Suppliers
            db.run('DELETE FROM suppliers WHERE store_id = ?', [id]);
            // 9. Categories
            db.run('DELETE FROM categories WHERE store_id = ?', [id]);
            // 10. Activity logs
            db.run('DELETE FROM activity_logs WHERE store_id = ?', [id]);
            // 11. Store settings
            db.run('DELETE FROM store_settings WHERE store_id = ?', [id]);
            // 12. Prior audit logs referencing this store
            db.run('DELETE FROM developer_audit_logs WHERE store_id = ?', [id]);
            // 13. Vendor user account
            db.run('DELETE FROM vendor_users WHERE store_id = ?', [id]);
            // 14. Store record itself
            db.run('DELETE FROM stores WHERE id = ?', [id]);

            // Re-create append-only protection triggers
            db.exec(`
                CREATE TRIGGER IF NOT EXISTS trg_customer_ledger_no_update
                BEFORE UPDATE ON customer_ledger
                BEGIN
                    SELECT RAISE(ABORT, 'customer_ledger is append-only');
                END;

                CREATE TRIGGER IF NOT EXISTS trg_customer_ledger_no_delete
                BEFORE DELETE ON customer_ledger
                BEGIN
                    SELECT RAISE(ABORT, 'customer_ledger is append-only');
                END;

                CREATE TRIGGER IF NOT EXISTS trg_stock_movements_no_update
                BEFORE UPDATE ON stock_movements
                BEGIN
                    SELECT RAISE(ABORT, 'stock_movements is append-only');
                END;

                CREATE TRIGGER IF NOT EXISTS trg_stock_movements_no_delete
                BEFORE DELETE ON stock_movements
                BEGIN
                    SELECT RAISE(ABORT, 'stock_movements is append-only');
                END;

                CREATE TRIGGER IF NOT EXISTS trg_activity_logs_no_update
                BEFORE UPDATE ON activity_logs
                BEGIN
                    SELECT RAISE(ABORT, 'activity_logs is append-only');
                END;

                CREATE TRIGGER IF NOT EXISTS trg_activity_logs_no_delete
                BEFORE DELETE ON activity_logs
                BEGIN
                    SELECT RAISE(ABORT, 'activity_logs is append-only');
                END;

                CREATE TRIGGER IF NOT EXISTS trg_dev_audit_no_update
                BEFORE UPDATE ON developer_audit_logs
                BEGIN
                    SELECT RAISE(ABORT, 'developer_audit_logs is append-only');
                END;

                CREATE TRIGGER IF NOT EXISTS trg_dev_audit_no_delete
                BEFORE DELETE ON developer_audit_logs
                BEGIN
                    SELECT RAISE(ABORT, 'developer_audit_logs is append-only');
                END;
            `);

            // Developer audit log entry (store_id is null since store was purged)
            db.run(
                `INSERT INTO developer_audit_logs (developer_id, action, details)
                 VALUES (?, 'STORE_DELETE', ?)`,
                [devId, JSON.stringify({
                    storeId: id,
                    storeCode: store.store_code,
                    name: store.name,
                    ownerName: store.owner_name,
                    deletedAt: new Date().toISOString()
                })]
            );
        });

        res.json({
            success: true,
            message: `Store ${store.name} (${store.store_code}) and all associated data have been permanently deleted.`
        });
    } catch (err) {
        console.error('Delete store error:', err);
        res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to delete store: ' + err.message }
        });
    }
});

// GET /developer/api/audit — Developer audit logs
router.get('/audit', (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
        const offset = (page - 1) * limit;

        const countQuery = 'SELECT COUNT(*) as total FROM developer_audit_logs';
        const total = db.get(countQuery)?.total || 0;

        const logs = db.all(`
            SELECT dal.*, dev.name as developer_name, s.name as store_name
            FROM developer_audit_logs dal
            LEFT JOIN developers dev ON dal.developer_id = dev.id
            LEFT JOIN stores s ON dal.store_id = s.id
            ORDER BY dal.created_at DESC
            LIMIT ? OFFSET ?
        `, [limit, offset]);

        res.json({
            success: true,
            data: logs,
            meta: { page, limit, total }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch audit log.' } });
    }
});

module.exports = router;
