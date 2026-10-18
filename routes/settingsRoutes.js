// ============================================
// Store Profile & Settings Routes — PRD 12.12
// ============================================
const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { requireVendor } = require('../middleware/authMiddleware');

router.use(requireVendor);

// GET /api/settings — fetch store profile & settings
router.get('/', (req, res) => {
    try {
        const storeId = req.storeId;
        const store = db.get('SELECT * FROM stores WHERE id = ?', [storeId]);
        const settingsRows = db.all('SELECT key, value FROM store_settings WHERE store_id = ?', [storeId]);

        const settings = {};
        settingsRows.forEach(r => settings[r.key] = r.value);

        res.json({
            success: true,
            data: {
                store: {
                    id: store.id,
                    storeCode: store.store_code,
                    name: store.name,
                    ownerName: store.owner_name,
                    phone: store.phone,
                    email: store.email,
                    address: store.address,
                    city: store.city,
                    timezone: store.timezone,
                    status: store.status
                },
                settings: {
                    defaultMinimumStock: settings.default_minimum_stock || '10',
                    itemsPerPage: settings.items_per_page || '20',
                    sessionTimeoutMinutes: settings.session_timeout_minutes || '30',
                    language: settings.language || 'en',
                    upiId: settings.upi_id || '',
                    billPrefix: settings.bill_prefix || 'B',
                    receiptWidth: settings.receipt_width || '80mm',
                    receiptFooter: settings.receipt_footer || 'Thank you for your visit!',
                    expiryAlertDays: settings.expiry_alert_days || '30',
                    gstin: settings.gstin || '27AAPCS1234F1Z5',
                    gstMode: settings.gst_mode || 'regular',
                    defaultGstRateBps: settings.default_gst_rate_bps || '500'
                }
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch settings.' } });
    }
});

// PUT /api/settings — update store profile & preferences
router.put('/', (req, res) => {
    try {
        const storeId = req.storeId;
        const vendorUserId = req.vendorUserId;
        const { store = {}, settings = {} } = req.body;

        db.transaction(() => {
            // Update store profile fields
            if (store.name || store.ownerName || store.phone || store.email || store.address || store.city) {
                db.run(
                    `UPDATE stores SET
                        name = COALESCE(?, name),
                        owner_name = COALESCE(?, owner_name),
                        phone = COALESCE(?, phone),
                        email = COALESCE(?, email),
                        address = COALESCE(?, address),
                        city = COALESCE(?, city),
                        updated_at = datetime('now')
                     WHERE id = ?`,
                    [store.name || null, store.ownerName || null, store.phone || null, store.email || null, store.address || null, store.city || null, storeId]
                );
            }

            // Update settings
            const allowedKeys = [
                'default_minimum_stock',
                'items_per_page',
                'session_timeout_minutes',
                'language',
                'upi_id',
                'bill_prefix',
                'receipt_width',
                'receipt_footer',
                'expiry_alert_days',
                'gstin',
                'gst_mode',
                'default_gst_rate_bps'
            ];

            // Normalize key mappings if camelCase provided
            const keyMap = {
                defaultMinimumStock: 'default_minimum_stock',
                itemsPerPage: 'items_per_page',
                sessionTimeoutMinutes: 'session_timeout_minutes',
                language: 'language',
                upiId: 'upi_id',
                billPrefix: 'bill_prefix',
                receiptWidth: 'receipt_width',
                receiptFooter: 'receipt_footer',
                expiryAlertDays: 'expiry_alert_days',
                gstin: 'gstin',
                gstMode: 'gst_mode',
                defaultGstRateBps: 'default_gst_rate_bps'
            };

            const mergedSettings = {};
            for (const [k, v] of Object.entries(settings)) {
                const normKey = keyMap[k] || k;
                if (allowedKeys.includes(normKey)) {
                    mergedSettings[normKey] = v;
                }
            }

            for (const [k, v] of Object.entries(mergedSettings)) {
                db.run(
                    `INSERT INTO store_settings (store_id, key, value, updated_at)
                     VALUES (?, ?, ?, datetime('now'))
                     ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
                    [storeId, k, v.toString()]
                );
            }

            db.run(
                `INSERT INTO activity_logs (store_id, vendor_user_id, action, entity_type, entity_id)
                 VALUES (?, ?, 'SETTINGS_UPDATED', 'store', ?)`,
                [storeId, vendorUserId, storeId]
            );
        });

        res.json({ success: true, message: 'Settings updated successfully.' });
    } catch (err) {
        console.error('Update settings error:', err);
        res.status(400).json({ success: false, error: { code: 'UPDATE_FAILED', message: err.message } });
    }
});

module.exports = router;
