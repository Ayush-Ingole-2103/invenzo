// ============================================
// Customer & Credit (Udhaar) Routes — PRD Section 12.6
// ============================================
const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { requireVendor } = require('../middleware/authMiddleware');
const { formatRupees, parseRupeesToPaise } = require('../utils/money');

router.use(requireVendor);

/**
 * Normalize Indian 10-digit mobile number
 */
function normalizePhone(phone) {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10 && /^[6-9]/.test(digits)) {
        return digits;
    }
    if (digits.length === 12 && digits.startsWith('91') && /^[6-9]/.test(digits.slice(2))) {
        return digits.slice(2);
    }
    if (digits.length === 11 && digits.startsWith('0') && /^[6-9]/.test(digits.slice(1))) {
        return digits.slice(1);
    }
    return null;
}

// GET /api/customers — list with search, filter with dues, pagination
router.get('/', (req, res) => {
    try {
        const storeId = req.storeId;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
        const offset = (page - 1) * limit;

        const search = req.query.search ? req.query.search.trim() : '';
        const withDues = req.query.withDues === 'true' || req.query.withDues === '1';
        const includeInactive = req.query.includeInactive === 'true' || req.query.includeInactive === '1';

        let whereClause = 'WHERE c.store_id = ?';
        const params = [storeId];

        if (!includeInactive) {
            whereClause += ' AND c.is_active = 1';
        }

        if (withDues) {
            whereClause += ' AND c.balance > 0';
        }

        if (search) {
            whereClause += ' AND (c.name LIKE ? OR c.phone LIKE ?)';
            const term = `%${search}%`;
            params.push(term, term);
        }

        const countQuery = `SELECT COUNT(*) as total, COALESCE(SUM(CASE WHEN c.balance > 0 THEN c.balance ELSE 0 END), 0) as total_outstanding FROM customers c ${whereClause}`;
        const countStats = db.get(countQuery, params);
        const total = countStats?.total || 0;
        const totalOutstanding = countStats?.total_outstanding || 0;

        const dataQuery = `
            SELECT c.*,
                   (SELECT MAX(created_at) FROM customer_ledger cl WHERE cl.customer_id = c.id AND cl.store_id = c.store_id) as last_activity
            FROM customers c
            ${whereClause}
            ORDER BY c.balance DESC, c.name ASC
            LIMIT ? OFFSET ?
        `;
        const customers = db.all(dataQuery, [...params, limit, offset]);

        const mapped = customers.map(c => ({
            ...c,
            balance_display: formatRupees(c.balance),
            credit_limit_display: c.credit_limit ? formatRupees(c.credit_limit) : null,
            is_advance: c.balance < 0
        }));

        res.json({
            success: true,
            data: mapped,
            meta: { page, limit, total, totalOutstanding, totalOutstandingDisplay: formatRupees(totalOutstanding) }
        });
    } catch (err) {
        console.error('List customers error:', err);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch customers.' } });
    }
});

// GET /api/customers/:id — customer profile & ledger
router.get('/:id', (req, res) => {
    try {
        const storeId = req.storeId;
        const id = parseInt(req.params.id);

        const customer = db.get('SELECT * FROM customers WHERE id = ? AND store_id = ?', [id, storeId]);
        if (!customer) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Customer not found.' } });
        }

        const ledger = db.all(
            `SELECT cl.*, vu.name as created_by_name
             FROM customer_ledger cl
             LEFT JOIN vendor_users vu ON cl.created_by = vu.id
             WHERE cl.customer_id = ? AND cl.store_id = ?
             ORDER BY cl.created_at DESC, cl.id DESC`,
            [id, storeId]
        );

        const mappedLedger = ledger.map(l => ({
            ...l,
            amount_change_display: formatRupees(l.amount_change),
            balance_after_display: formatRupees(l.balance_after)
        }));

        res.json({
            success: true,
            data: {
                ...customer,
                balance_display: formatRupees(customer.balance),
                credit_limit_display: customer.credit_limit ? formatRupees(customer.credit_limit) : null,
                ledger: mappedLedger
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch customer.' } });
    }
});

// POST /api/customers — create customer (requires consent checkbox)
router.post('/', (req, res) => {
    try {
        const storeId = req.storeId;
        const vendorUserId = req.vendorUserId;
        const { name, phone, creditLimit, consentGiven } = req.body;

        if (!name || name.trim().length < 2 || name.trim().length > 80) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Customer name must be between 2 and 80 characters.' }
            });
        }

        if (!consentGiven) {
            return res.status(400).json({
                success: false,
                error: { code: 'CONSENT_REQUIRED', message: 'Customer agreement/consent is required to record credit account details.' }
            });
        }

        let normalizedPhone = null;
        if (phone && phone.trim()) {
            normalizedPhone = normalizePhone(phone);
            if (!normalizedPhone) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'INVALID_PHONE', message: 'Invalid Indian phone number. Please enter a valid 10-digit mobile number.' }
                });
            }

            const dup = db.get('SELECT id FROM customers WHERE store_id = ? AND phone = ?', [storeId, normalizedPhone]);
            if (dup) {
                return res.status(409).json({
                    success: false,
                    error: { code: 'DUPLICATE_PHONE', message: 'A customer with this phone number already exists.' }
                });
            }
        }

        const limitPaise = creditLimit ? parseRupeesToPaise(creditLimit) : null;

        db.run(
            `INSERT INTO customers (store_id, name, phone, credit_limit, balance, consent_recorded_at, is_active)
             VALUES (?, ?, ?, ?, 0, datetime('now'), 1)`,
            [storeId, name.trim(), normalizedPhone, limitPaise]
        );
        const id = db.getLastInsertRowId();

        db.run(
            `INSERT INTO activity_logs (store_id, vendor_user_id, action, entity_type, entity_id, details)
             VALUES (?, ?, 'CUSTOMER_CREATED', 'customer', ?, ?)`,
            [storeId, vendorUserId, id, JSON.stringify({ name: name.trim() })]
        );

        res.status(201).json({
            success: true,
            data: { id, name: name.trim(), phone: normalizedPhone, balance: 0 }
        });
    } catch (err) {
        res.status(400).json({ success: false, error: { code: 'CREATE_FAILED', message: err.message } });
    }
});

// POST /api/customers/:id/payments — record payment against credit
router.post('/:id/payments', (req, res) => {
    try {
        const storeId = req.storeId;
        const vendorUserId = req.vendorUserId;
        const id = parseInt(req.params.id);
        const { amount, paymentMode = 'cash', note = '' } = req.body;

        const customer = db.get('SELECT * FROM customers WHERE id = ? AND store_id = ?', [id, storeId]);
        if (!customer) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Customer not found.' } });
        }

        if (customer.balance <= 0) {
            return res.status(400).json({
                success: false,
                error: { code: 'NO_DUES', message: 'Customer has no outstanding dues to pay.' }
            });
        }

        const amountPaise = typeof amount === 'number' && Number.isInteger(amount) && amount > 100000
            ? amount
            : parseRupeesToPaise(amount);

        if (amountPaise <= 0) {
            return res.status(400).json({
                success: false,
                error: { code: 'INVALID_AMOUNT', message: 'Payment amount must be greater than zero.' }
            });
        }

        if (amountPaise > customer.balance) {
            return res.status(400).json({
                success: false,
                error: { code: 'AMOUNT_EXCEEDS_BALANCE', message: `Payment amount (${formatRupees(amountPaise)}) cannot exceed current balance (${formatRupees(customer.balance)}).` }
            });
        }

        let newBalance = 0;
        db.transaction(() => {
            newBalance = customer.balance - amountPaise;
            db.run('UPDATE customers SET balance = ?, updated_at = datetime("now") WHERE id = ? AND store_id = ?', [newBalance, id, storeId]);

            db.run(
                `INSERT INTO customer_ledger (
                    store_id, customer_id, type, amount_change, balance_after, payment_mode, note, created_by
                ) VALUES (?, ?, 'payment', ?, ?, ?, ?, ?)`,
                [storeId, id, -amountPaise, newBalance, paymentMode, note ? note.trim() : 'Payment received', vendorUserId]
            );

            db.run(
                `INSERT INTO activity_logs (store_id, vendor_user_id, action, entity_type, entity_id, details)
                 VALUES (?, ?, 'CUSTOMER_PAYMENT', 'customer', ?, ?)`,
                [storeId, vendorUserId, id, JSON.stringify({ amountPaise, paymentMode, newBalance })]
            );
        });

        res.json({
            success: true,
            data: {
                customerId: id,
                amountPaid: amountPaise,
                amountPaidDisplay: formatRupees(amountPaise),
                newBalance,
                newBalanceDisplay: formatRupees(newBalance)
            }
        });
    } catch (err) {
        console.error('Payment error:', err);
        res.status(400).json({ success: false, error: { code: 'PAYMENT_FAILED', message: err.message } });
    }
});

// POST /api/customers/:id/writeoffs — write off debt
router.post('/:id/writeoffs', (req, res) => {
    try {
        const storeId = req.storeId;
        const vendorUserId = req.vendorUserId;
        const id = parseInt(req.params.id);
        const { amount, reason } = req.body;

        if (!reason || reason.trim().length < 3) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Reason of at least 3 characters is required to write off dues.' }
            });
        }

        const customer = db.get('SELECT * FROM customers WHERE id = ? AND store_id = ?', [id, storeId]);
        if (!customer) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Customer not found.' } });
        }

        if (customer.balance <= 0) {
            return res.status(400).json({ success: false, error: { code: 'NO_DUES', message: 'Customer has no outstanding balance.' } });
        }

        const amountPaise = typeof amount === 'number' && Number.isInteger(amount) && amount > 100000
            ? amount
            : parseRupeesToPaise(amount);

        if (amountPaise <= 0 || amountPaise > customer.balance) {
            return res.status(400).json({ success: false, error: { code: 'INVALID_AMOUNT', message: 'Invalid write-off amount.' } });
        }

        let newBalance = 0;
        db.transaction(() => {
            newBalance = customer.balance - amountPaise;
            db.run('UPDATE customers SET balance = ?, updated_at = datetime("now") WHERE id = ? AND store_id = ?', [newBalance, id, storeId]);

            db.run(
                `INSERT INTO customer_ledger (
                    store_id, customer_id, type, amount_change, balance_after, note, created_by
                ) VALUES (?, ?, 'writeoff', ?, ?, ?, ?)`,
                [storeId, id, -amountPaise, newBalance, reason.trim(), vendorUserId]
            );

            db.run(
                `INSERT INTO activity_logs (store_id, vendor_user_id, action, entity_type, entity_id, details)
                 VALUES (?, ?, 'CUSTOMER_WRITEOFF', 'customer', ?, ?)`,
                [storeId, vendorUserId, id, JSON.stringify({ amountPaise, reason: reason.trim(), newBalance })]
            );
        });

        res.json({ success: true, message: 'Dues written off successfully.' });
    } catch (err) {
        res.status(400).json({ success: false, error: { code: 'WRITEOFF_FAILED', message: err.message } });
    }
});

// POST /api/customers/:id/erase — erase personal details if balance is 0
router.post('/:id/erase', (req, res) => {
    try {
        const storeId = req.storeId;
        const vendorUserId = req.vendorUserId;
        const id = parseInt(req.params.id);

        const customer = db.get('SELECT * FROM customers WHERE id = ? AND store_id = ?', [id, storeId]);
        if (!customer) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Customer not found.' } });
        }

        if (customer.balance !== 0) {
            return res.status(400).json({
                success: false,
                error: { code: 'NON_ZERO_BALANCE', message: 'Personal details can only be erased when balance is zero.' }
            });
        }

        db.run(
            `UPDATE customers SET
                name = 'Erased customer', phone = NULL, is_active = 0, erased_at = datetime('now'), updated_at = datetime('now')
             WHERE id = ? AND store_id = ?`,
            [id, storeId]
        );

        db.run(
            `INSERT INTO activity_logs (store_id, vendor_user_id, action, entity_type, entity_id)
             VALUES (?, ?, 'CUSTOMER_ERASED', 'customer', ?)`,
            [storeId, vendorUserId, id]
        );

        res.json({ success: true, message: 'Customer personal details have been erased.' });
    } catch (err) {
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to erase customer.' } });
    }
});

// POST /api/customers/:id/deactivate
router.post('/:id/deactivate', (req, res) => {
    try {
        const storeId = req.storeId;
        const id = parseInt(req.params.id);

        const customer = db.get('SELECT balance FROM customers WHERE id = ? AND store_id = ?', [id, storeId]);
        if (!customer) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Customer not found.' } });
        }

        if (customer.balance !== 0) {
            return res.status(400).json({
                success: false,
                error: { code: 'NON_ZERO_BALANCE', message: 'A customer with a non-zero balance cannot be deactivated.' }
            });
        }

        db.run('UPDATE customers SET is_active = 0, updated_at = datetime("now") WHERE id = ? AND store_id = ?', [id, storeId]);
        res.json({ success: true, message: 'Customer deactivated successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to deactivate customer.' } });
    }
});

// POST /api/customers/:id/reactivate
router.post('/:id/reactivate', (req, res) => {
    try {
        const storeId = req.storeId;
        const id = parseInt(req.params.id);
        db.run('UPDATE customers SET is_active = 1, updated_at = datetime("now") WHERE id = ? AND store_id = ?', [id, storeId]);
        res.json({ success: true, message: 'Customer reactivated successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to reactivate customer.' } });
    }
});

module.exports = router;
