// ============================================
// Vendor Authentication Routes — PRD Section 9
// ============================================
const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const db = require('../database/db');
const { requireVendor } = require('../middleware/authMiddleware');
const { loginLimiter } = require('../middleware/rateLimitMiddleware');

// POST /api/auth/login
router.post('/login', loginLimiter, (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Username and password are required.' }
            });
        }

        const cleanUser = username.trim();
        const vendor = db.get(
            `SELECT v.*, s.name as store_name, s.store_code, s.status as store_status, s.suspended_reason
             FROM vendor_users v
             JOIN stores s ON v.store_id = s.id
             WHERE v.username = ? COLLATE NOCASE`,
            [cleanUser]
        );

        if (!vendor) {
            return res.status(401).json({
                success: false,
                error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password.' }
            });
        }

        if (!vendor.is_active) {
            return res.status(401).json({
                success: false,
                error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password.' }
            });
        }

        const validPassword = bcrypt.compareSync(password, vendor.password_hash);
        if (!validPassword) {
            try {
                db.run(`INSERT INTO activity_logs (store_id, vendor_user_id, action, entity_type, entity_id, details)
                        VALUES (?, ?, 'LOGIN_FAILED', 'vendor_user', ?, ?)`,
                    [vendor.store_id, vendor.id, vendor.id, JSON.stringify({ reason: 'wrong_password' })]);
            } catch {}
            return res.status(401).json({
                success: false,
                error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password.' }
            });
        }

        // Check if store is suspended
        if (vendor.store_status === 'suspended') {
            return res.status(403).json({
                success: false,
                error: {
                    code: 'STORE_SUSPENDED',
                    message: 'This store account is suspended. Contact the application provider.'
                }
            });
        }

        // Establish vendor session
        req.session.vendorUser = {
            id: vendor.id,
            store_id: vendor.store_id,
            name: vendor.name,
            username: vendor.username,
            store_name: vendor.store_name,
            store_code: vendor.store_code,
            must_change_password: vendor.must_change_password
        };

        // Update last login
        db.run("UPDATE vendor_users SET last_login_at = datetime('now') WHERE id = ?", [vendor.id]);

        // Audit log
        try {
            db.run(`INSERT INTO activity_logs (store_id, vendor_user_id, action, entity_type, entity_id)
                    VALUES (?, ?, 'LOGIN_SUCCESS', 'vendor_user', ?)`,
                [vendor.store_id, vendor.id, vendor.id]);
        } catch {}

        res.json({
            success: true,
            data: {
                id: vendor.id,
                store_id: vendor.store_id,
                store_name: vendor.store_name,
                storeName: vendor.store_name,
                store_code: vendor.store_code,
                storeCode: vendor.store_code,
                name: vendor.name,
                username: vendor.username,
                must_change_password: vendor.must_change_password,
                csrfToken: req.session.csrfToken
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'An error occurred during login.' }
        });
    }
});

// GET /api/auth/me
router.get('/me', requireVendor, (req, res) => {
    try {
        const vendor = db.get(
            `SELECT v.id, v.store_id, v.name, v.username, v.must_change_password,
                    s.name as store_name, s.store_code, s.city
             FROM vendor_users v
             JOIN stores s ON v.store_id = s.id
             WHERE v.id = ?`,
            [req.vendorUserId]
        );

        if (!vendor) {
            return res.status(401).json({
                success: false,
                error: { code: 'UNAUTHORIZED', message: 'Vendor not found.' }
            });
        }

        res.json({
            success: true,
            data: {
                ...vendor,
                storeName: vendor.store_name,
                storeCode: vendor.store_code,
                csrfToken: req.session.csrfToken
            }
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve profile.' }
        });
    }
});

// POST /api/auth/change-password
router.post('/change-password', requireVendor, (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!newPassword || newPassword.length < 10) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'New password must be at least 10 characters long.' }
            });
        }

        const vendor = db.get('SELECT password_hash, username FROM vendor_users WHERE id = ?', [req.vendorUserId]);
        if (!vendor) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found.' } });
        }

        if (currentPassword) {
            const valid = bcrypt.compareSync(currentPassword, vendor.password_hash);
            if (!valid) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'INVALID_PASSWORD', message: 'Current password is incorrect.' }
                });
            }
        }

        if (newPassword.toLowerCase() === vendor.username.toLowerCase()) {
            return res.status(400).json({
                success: false,
                error: { code: 'INVALID_PASSWORD', message: 'New password must differ from username.' }
            });
        }

        const newHash = bcrypt.hashSync(newPassword, 12);
        db.run('UPDATE vendor_users SET password_hash = ?, must_change_password = 0 WHERE id = ?', [newHash, req.vendorUserId]);
        req.session.vendorUser.must_change_password = 0;

        db.run(`INSERT INTO activity_logs (store_id, vendor_user_id, action, entity_type, entity_id)
                VALUES (?, ?, 'PASSWORD_CHANGED', 'vendor_user', ?)`,
            [req.storeId, req.vendorUserId, req.vendorUserId]);

        res.json({ success: true, message: 'Password updated successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update password.' } });
    }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({
                success: false,
                error: { code: 'LOGOUT_ERROR', message: 'Failed to logout.' }
            });
        }
        res.clearCookie('stocker_vendor_sid');
        res.json({ success: true, message: 'Logged out successfully.' });
    });
});

module.exports = router;
