// ============================================
// Sales & Counter Billing Routes — PRD Section 12.4 & 12.5
// ============================================
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('../database/db');
const { requireVendor } = require('../middleware/authMiddleware');
const { calculateLineAmount, formatRupees, parseRupeesToPaise } = require('../utils/money');
const { parseQuantityToMilli, formatQuantity } = require('../utils/quantity');

router.use(requireVendor);

/**
 * Determine Financial Year in India (April 1 to March 31).
 * Example: October 2026 -> '2026-27', February 2027 -> '2026-27'
 */
function getFinancialYear(date = new Date()) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // 1-12
    if (month >= 4) {
        const nextYearShort = (year + 1).toString().slice(-2);
        return `${year}-${nextYearShort}`;
    } else {
        const curYearShort = year.toString().slice(-2);
        return `${year - 1}-${curYearShort}`;
    }
}

// GET /api/sales — list sales with filtering and pagination
router.get('/', (req, res) => {
    try {
        const storeId = req.storeId;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
        const offset = (page - 1) * limit;

        const status = req.query.status; // 'completed', 'voided'
        const paymentMode = req.query.paymentMode; // 'cash', 'upi', 'credit'
        const customerId = req.query.customerId ? parseInt(req.query.customerId) : null;
        const startDate = req.query.startDate;
        const endDate = req.query.endDate;
        const needsAttention = req.query.needsAttention === 'true' || req.query.needsAttention === '1';

        let whereClause = 'WHERE s.store_id = ?';
        const params = [storeId];

        if (status) {
            whereClause += ' AND s.status = ?';
            params.push(status);
        }

        if (paymentMode) {
            whereClause += ' AND s.payment_mode = ?';
            params.push(paymentMode);
        }

        if (customerId) {
            whereClause += ' AND s.customer_id = ?';
            params.push(customerId);
        }

        if (needsAttention) {
            whereClause += ' AND s.needs_attention = 1';
        }

        if (startDate) {
            whereClause += ' AND s.created_at >= ?';
            params.push(`${startDate} 00:00:00`);
        }

        if (endDate) {
            whereClause += ' AND s.created_at <= ?';
            params.push(`${endDate} 23:59:59`);
        }

        const countQuery = `SELECT COUNT(*) as total FROM sales s ${whereClause}`;
        const total = db.get(countQuery, params)?.total || 0;

        const dataQuery = `
            SELECT s.*, c.name as customer_name, c.phone as customer_phone,
                   (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id AND si.store_id = s.store_id) as item_count
            FROM sales s
            LEFT JOIN customers c ON s.customer_id = c.id AND s.store_id = c.store_id
            ${whereClause}
            ORDER BY s.created_at DESC, s.id DESC
            LIMIT ? OFFSET ?
        `;
        const sales = db.all(dataQuery, [...params, limit, offset]);

        const prefix = db.get('SELECT value FROM store_settings WHERE store_id = ? AND key = "bill_prefix"', [storeId])?.value || '';

        const mapped = sales.map(s => ({
            ...s,
            formatted_bill_number: s.bill_number ? `${prefix}${s.bill_number}` : (s.offline_ref || `#${s.id}`),
            total_amount_display: formatRupees(s.total_amount),
            amount_paid_display: formatRupees(s.amount_paid),
            due_amount_display: formatRupees(s.due_amount)
        }));

        res.json({
            success: true,
            data: mapped,
            meta: { page, limit, total }
        });
    } catch (err) {
        console.error('List sales error:', err);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch sales.' } });
    }
});

// GET /api/sales/:id — get single sale details
router.get('/:id', (req, res) => {
    try {
        const storeId = req.storeId;
        const id = parseInt(req.params.id);

        const sale = db.get(
            `SELECT s.*, c.name as customer_name, c.phone as customer_phone, c.balance as customer_current_balance
             FROM sales s
             LEFT JOIN customers c ON s.customer_id = c.id AND s.store_id = c.store_id
             WHERE s.id = ? AND s.store_id = ?`,
            [id, storeId]
        );

        if (!sale) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Sale not found.' } });
        }

        const items = db.all(
            `SELECT si.*, p.sku 
             FROM sale_items si 
             LEFT JOIN products p ON si.product_id = p.id AND si.store_id = p.store_id 
             WHERE si.sale_id = ? AND si.store_id = ?`,
            [id, storeId]
        );

        const movements = db.all(
            `SELECT * FROM stock_movements WHERE reference_id = ? AND store_id = ?`,
            [id, storeId]
        );

        const prefix = db.get('SELECT value FROM store_settings WHERE store_id = ? AND key = "bill_prefix"', [storeId])?.value || '';

        res.json({
            success: true,
            data: {
                ...sale,
                formatted_bill_number: sale.bill_number ? `${prefix}${sale.bill_number}` : (sale.offline_ref || `#${sale.id}`),
                subtotal_display: formatRupees(sale.subtotal || sale.total_amount),
                tax_amount_display: formatRupees(sale.tax_amount || 0),
                discount_amount_display: formatRupees(sale.discount_amount || 0),
                total_amount_display: formatRupees(sale.total_amount),
                amount_paid_display: formatRupees(sale.amount_paid),
                due_amount_display: formatRupees(sale.due_amount),
                items: items.map(it => ({
                    ...it,
                    price_display: formatRupees(it.price),
                    subtotal_display: formatRupees(it.subtotal),
                    quantity_display: formatQuantity(it.quantity_milli, it.unit)
                })),
                stock_movements: movements
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch sale.' } });
    }
});

// POST /api/sales — Counter billing (Transaction with idempotency)
router.post('/', (req, res) => {
    try {
        const storeId = req.storeId;
        const vendorUserId = req.vendorUserId;

        const {
            clientSaleId = crypto.randomUUID(),
            items,
            paymentMode = 'cash',
            customerId,
            amountPaid,
            confirmOverLimit = false
        } = req.body;

        // Idempotency check: if clientSaleId was already completed, return existing
        const existing = db.get('SELECT * FROM sales WHERE store_id = ? AND client_sale_id = ?', [storeId, clientSaleId]);
        if (existing) {
            return res.json({
                success: true,
                data: {
                    id: existing.id,
                    billNumber: existing.bill_number,
                    totalAmount: existing.total_amount,
                    isDuplicate: true
                }
            });
        }

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                error: { code: 'EMPTY_CART', message: 'Bill must contain at least one item.' }
            });
        }

        if (!['cash', 'upi', 'credit'].includes(paymentMode)) {
            return res.status(400).json({
                success: false,
                error: { code: 'INVALID_PAYMENT_MODE', message: 'Payment mode must be cash, upi, or credit.' }
            });
        }

        let customer = null;
        if (customerId) {
            customer = db.get('SELECT * FROM customers WHERE id = ? AND store_id = ? AND is_active = 1', [customerId, storeId]);
            if (!customer) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'INVALID_CUSTOMER', message: 'Customer does not exist or is inactive.' }
                });
            }
        }

        if (paymentMode === 'credit' && !customer) {
            return res.status(400).json({
                success: false,
                error: { code: 'CUSTOMER_REQUIRED', message: 'Credit (udhaar) bills require an active customer.' }
            });
        }

        let createdSale;

        // Execute sale in single immediate transaction
        db.transaction(() => {
            let totalAmountPaise = 0;
            let totalTaxablePaise = 0;
            let totalCgstPaise = 0;
            let totalSgstPaise = 0;
            const preparedItems = [];

            // Process each item line
            for (const item of items) {
                const prodId = item.productId || item.id;
                const product = db.get('SELECT * FROM products WHERE id = ? AND store_id = ?', [prodId, storeId]);

                if (!product) {
                    throw new Error(`Product #${prodId} not found.`);
                }
                if (!product.is_active) {
                    throw new Error(`Product "${product.name}" is inactive.`);
                }

                // Parse quantity
                const requestedMilli = parseQuantityToMilli(item.quantity, product.unit);
                if (requestedMilli <= 0) {
                    throw new Error(`Invalid quantity for "${product.name}".`);
                }

                // Check stock inside transaction
                if (requestedMilli > product.quantity_milli) {
                    const err = new Error(`Insufficient stock for "${product.name}". Available: ${formatQuantity(product.quantity_milli, product.unit)}, Requested: ${formatQuantity(requestedMilli, product.unit)}`);
                    err.statusCode = 400;
                    err.code = 'INSUFFICIENT_STOCK';
                    throw err;
                }

                const pricePaise = product.price; // server price
                const lineSubtotal = calculateLineAmount(requestedMilli, pricePaise);
                totalAmountPaise += lineSubtotal;

                // GST Calculation (PRD Section 14.4, tax-inclusive prices)
                const gstRateBps = (product.gst_rate_bps !== null && product.gst_rate_bps !== undefined)
                    ? product.gst_rate_bps
                    : 500; // 5% default
                const r = gstRateBps;
                const taxableValue = Math.floor((lineSubtotal * 10000 + Math.floor((10000 + r) / 2)) / (10000 + r));
                const taxAmount = lineSubtotal - taxableValue;
                const cgstAmount = Math.floor(taxAmount / 2);
                const sgstAmount = taxAmount - cgstAmount;

                totalTaxablePaise += taxableValue;
                totalCgstPaise += cgstAmount;
                totalSgstPaise += sgstAmount;

                preparedItems.push({
                    product,
                    quantityMilli: requestedMilli,
                    pricePaise,
                    costPricePaise: product.cost_price,
                    subtotal: lineSubtotal,
                    hsnCode: product.hsn_code || '1905',
                    gstRateBps,
                    taxableValue,
                    cgstAmount,
                    sgstAmount
                });
            }

            if (totalAmountPaise <= 0) {
                throw new Error('Total bill amount must be greater than zero.');
            }

            let paidPaise = 0;
            let duePaise = 0;

            if (paymentMode === 'cash' || paymentMode === 'upi') {
                paidPaise = totalAmountPaise;
                duePaise = 0;
            } else if (paymentMode === 'credit') {
                let paidNow = 0;
                if (typeof amountPaid === 'number') {
                    // Integer values are in paise (e.g. 10000 paise = ₹100, per PRD and frontend)
                    paidNow = Number.isInteger(amountPaid) ? amountPaid : Math.round(amountPaid * 100);
                } else if (typeof amountPaid === 'string' && amountPaid.trim() !== '') {
                    paidNow = parseRupeesToPaise(amountPaid);
                }

                if (paidNow < 0 || paidNow >= totalAmountPaise) {
                    throw new Error('For credit bills, amount paid now must be less than the total amount.');
                }
                paidPaise = paidNow;
                duePaise = totalAmountPaise - paidPaise;

                // Credit limit check
                if (customer.credit_limit && (customer.balance + duePaise > customer.credit_limit) && !confirmOverLimit) {
                    const err = new Error(`New balance (${formatRupees(customer.balance + duePaise)}) would exceed credit limit of ${formatRupees(customer.credit_limit)}.`);
                    err.statusCode = 409;
                    err.code = 'CREDIT_LIMIT_EXCEEDED';
                    throw err;
                }
            }

            // Assign consecutive bill number per financial year
            const fy = getFinancialYear();
            const lastBill = db.get(
                `SELECT MAX(bill_number) as max_num FROM sales
                 WHERE store_id = ? AND financial_year = ?`,
                [storeId, fy]
            );
            const billNumber = (lastBill?.max_num || 0) + 1;

            // Insert sale record with tax amounts
            db.run(
                `INSERT INTO sales (
                    store_id, client_sale_id, source, financial_year, bill_number,
                    document_type, customer_id, payment_mode, total_amount, amount_paid,
                    due_amount, total_taxable, total_cgst, total_sgst, status, created_by, created_at
                ) VALUES (?, ?, 'online', ?, ?, 'bill', ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, datetime('now'))`,
                [
                    storeId, clientSaleId, fy, billNumber,
                    customer ? customer.id : null, paymentMode,
                    totalAmountPaise, paidPaise, duePaise,
                    totalTaxablePaise, totalCgstPaise, totalSgstPaise, vendorUserId
                ]
            );
            const saleId = db.getLastInsertRowId();

            // Insert sale items and update product stock
            for (const pi of preparedItems) {
                db.run(
                    `INSERT INTO sale_items (
                        store_id, sale_id, product_id, product_name, unit,
                        quantity_milli, price, cost_price, subtotal,
                        hsn_code, gst_rate_bps, taxable_value, cgst_amount, sgst_amount
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        storeId, saleId, pi.product.id, pi.product.name, pi.product.unit,
                        pi.quantityMilli, pi.pricePaise, pi.costPricePaise, pi.subtotal,
                        pi.hsnCode, pi.gstRateBps, pi.taxableValue, pi.cgstAmount, pi.sgstAmount
                    ]
                );

                const newQty = pi.product.quantity_milli - pi.quantityMilli;
                db.run('UPDATE products SET quantity_milli = ? WHERE id = ? AND store_id = ?', [newQty, pi.product.id, storeId]);

                db.run(
                    `INSERT INTO stock_movements (
                        store_id, product_id, type, quantity_change_milli, quantity_after_milli, reference_id, created_by
                    ) VALUES (?, ?, 'sale', ?, ?, ?, ?)`,
                    [storeId, pi.product.id, -pi.quantityMilli, newQty, saleId, vendorUserId]
                );
            }

            // If credit, update customer balance & write ledger
            if (paymentMode === 'credit' && duePaise > 0) {
                const newBalance = customer.balance + duePaise;
                db.run('UPDATE customers SET balance = ?, updated_at = datetime("now") WHERE id = ? AND store_id = ?', [newBalance, customer.id, storeId]);

                db.run(
                    `INSERT INTO customer_ledger (
                        store_id, customer_id, type, amount_change, balance_after, payment_mode, reference_id, note, created_by
                    ) VALUES (?, ?, 'credit_sale', ?, ?, NULL, ?, ?, ?)`,
                    [storeId, customer.id, duePaise, newBalance, saleId, `Bill #${billNumber}`, vendorUserId]
                );
            }

            // Log activity
            db.run(
                `INSERT INTO activity_logs (store_id, vendor_user_id, action, entity_type, entity_id, details)
                 VALUES (?, ?, 'SALE_COMPLETED', 'sale', ?, ?)`,
                [storeId, vendorUserId, saleId, JSON.stringify({ billNumber, totalAmountPaise, paymentMode })]
            );

            const formattedBillNo = `B-${fy}-${String(billNumber).padStart(4, '0')}`;
            createdSale = {
                id: saleId,
                saleId,
                billNumber: formattedBillNo,
                rawBillNumber: billNumber,
                financialYear: fy,
                totalAmount: totalAmountPaise,
                totalAmountDisplay: formatRupees(totalAmountPaise),
                amountPaid: paidPaise,
                dueAmount: duePaise,
                paymentMode
            };
        });

        res.status(201).json({
            success: true,
            data: createdSale
        });
    } catch (err) {
        console.error('Sale error:', err);
        const statusCode = err.statusCode || 400;
        const code = err.code || 'SALE_FAILED';
        res.status(statusCode).json({
            success: false,
            error: { code, message: err.message || 'Failed to complete sale.' }
        });
    }
});

// POST /api/sales/:id/void — Void sale and reverse stock & credit ledger (Section 12.5 & C5)
router.post('/:id/void', (req, res) => {
    try {
        const storeId = req.storeId;
        const vendorUserId = req.vendorUserId;
        const id = parseInt(req.params.id);
        const { reason = 'Customer return / bill cancelled' } = req.body;

        if (!reason || reason.trim().length < 3) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Reason of at least 3 characters is required to void a bill.' }
            });
        }

        const sale = db.get('SELECT * FROM sales WHERE id = ? AND store_id = ?', [id, storeId]);
        if (!sale) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Sale not found.' } });
        }

        if (sale.status === 'voided') {
            return res.status(400).json({ success: false, error: { code: 'ALREADY_VOIDED', message: 'This bill has already been voided.' } });
        }

        const items = db.all('SELECT * FROM sale_items WHERE sale_id = ? AND store_id = ?', [id, storeId]);

        db.transaction(() => {
            // Restore product quantities & write void_reversal stock movements
            for (const item of items) {
                const prod = db.get('SELECT quantity_milli FROM products WHERE id = ? AND store_id = ?', [item.product_id, storeId]);
                if (prod) {
                    const newQty = prod.quantity_milli + item.quantity_milli;
                    db.run('UPDATE products SET quantity_milli = ? WHERE id = ? AND store_id = ?', [newQty, item.product_id, storeId]);

                    db.run(
                        `INSERT INTO stock_movements (
                            store_id, product_id, type, quantity_change_milli, quantity_after_milli, reference_id, note, created_by
                        ) VALUES (?, ?, 'void_reversal', ?, ?, ?, ?, ?)`,
                        [storeId, item.product_id, item.quantity_milli, newQty, id, `Void reversal for bill #${sale.bill_number}`, vendorUserId]
                    );
                }
            }

            // Reverse customer credit if applicable
            if (sale.payment_mode === 'credit' && sale.due_amount > 0 && sale.customer_id) {
                const cust = db.get('SELECT balance FROM customers WHERE id = ? AND store_id = ?', [sale.customer_id, storeId]);
                if (cust) {
                    const newBalance = cust.balance - sale.due_amount;
                    db.run('UPDATE customers SET balance = ?, updated_at = datetime("now") WHERE id = ? AND store_id = ?', [newBalance, sale.customer_id, storeId]);

                    db.run(
                        `INSERT INTO customer_ledger (
                            store_id, customer_id, type, amount_change, balance_after, reference_id, note, created_by
                        ) VALUES (?, ?, 'void_reversal', ?, ?, ?, ?, ?)`,
                        [storeId, sale.customer_id, -sale.due_amount, newBalance, id, `Void reversal for bill #${sale.bill_number}`, vendorUserId]
                    );
                }
            }

            // Update sale status
            db.run(
                `UPDATE sales SET status = 'voided', voided_at = datetime('now'), void_reason = ?
                 WHERE id = ? AND store_id = ?`,
                [reason.trim(), id, storeId]
            );

            // Log activity
            db.run(
                `INSERT INTO activity_logs (store_id, vendor_user_id, action, entity_type, entity_id, details)
                 VALUES (?, ?, 'SALE_VOIDED', 'sale', ?, ?)`,
                [storeId, vendorUserId, id, JSON.stringify({ reason: reason.trim(), billNumber: sale.bill_number })]
            );
        });

        res.json({ success: true, message: 'Bill has been successfully voided and inventory/credit reversed.' });
    } catch (err) {
        console.error('Void sale error:', err);
        res.status(500).json({ success: false, error: { code: 'VOID_FAILED', message: err.message || 'Failed to void bill.' } });
    }
});

// DELETE /api/sales/:id — backward compatibility (delegates to void)
router.delete('/:id', (req, res) => {
    try {
        const storeId = req.storeId;
        const vendorUserId = req.vendorUserId;
        const id = parseInt(req.params.id);

        const sale = db.get('SELECT * FROM sales WHERE id = ? AND store_id = ?', [id, storeId]);
        if (!sale) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Sale not found.' } });
        }

        const items = db.all('SELECT * FROM sale_items WHERE sale_id = ? AND store_id = ?', [id, storeId]);

        db.transaction(() => {
            for (const item of items) {
                const prod = db.get('SELECT quantity_milli FROM products WHERE id = ? AND store_id = ?', [item.product_id, storeId]);
                if (prod) {
                    const newQty = prod.quantity_milli + item.quantity_milli;
                    db.run('UPDATE products SET quantity_milli = ? WHERE id = ? AND store_id = ?', [newQty, item.product_id, storeId]);

                    db.run(
                        `INSERT INTO stock_movements (
                            store_id, product_id, type, quantity_change_milli, quantity_after_milli, reference_id, note, created_by
                        ) VALUES (?, ?, 'void_reversal', ?, ?, ?, 'Deleted sale reversal', ?)`,
                        [storeId, item.product_id, item.quantity_milli, newQty, id, vendorUserId]
                    );
                }
            }

            db.run("UPDATE sales SET status = 'voided', voided_at = datetime('now'), void_reason = 'Deleted' WHERE id = ? AND store_id = ?", [id, storeId]);
        });

        res.json({ success: true, message: 'Sale deleted and stock restored.' });
    } catch (err) {
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete sale.' } });
    }
});

// GET /api/sales/:id/receipt — formatted receipt data for printing
router.get('/:id/receipt', (req, res) => {
    try {
        const storeId = req.storeId;
        const id = parseInt(req.params.id);

        const sale = db.get('SELECT * FROM sales WHERE id = ? AND store_id = ?', [id, storeId]);
        if (!sale) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Sale not found.' } });
        }

        const store = db.get('SELECT name, owner_name, phone, address, city FROM stores WHERE id = ?', [storeId]);
        const settings = db.all('SELECT key, value FROM store_settings WHERE store_id = ?', [storeId]);
        const cfg = {};
        settings.forEach(s => cfg[s.key] = s.value);

        const customer = sale.customer_id
            ? db.get('SELECT name, phone, balance FROM customers WHERE id = ? AND store_id = ?', [sale.customer_id, storeId])
            : null;

        const items = db.all('SELECT * FROM sale_items WHERE sale_id = ? AND store_id = ?', [id, storeId]);

        const prefix = cfg.bill_prefix || '';

        // Derive or fetch GST amounts
        let taxablePaise = sale.total_taxable;
        let cgstPaise = sale.total_cgst;
        let sgstPaise = sale.total_sgst;

        if ((!cgstPaise && !sgstPaise) && sale.total_amount > 0) {
            // If historical bill without explicit GST snapshot, derive standard 5% GST
            const r = 500; // 5%
            taxablePaise = Math.floor((sale.total_amount * 10000 + Math.floor((10000 + r) / 2)) / (10000 + r));
            const tax = sale.total_amount - taxablePaise;
            cgstPaise = Math.floor(tax / 2);
            sgstPaise = tax - cgstPaise;
        }

        const totalGstPaise = (cgstPaise || 0) + (sgstPaise || 0);
        const storeGstin = cfg.gstin || '27AAPCS1234F1Z5';

        const receiptData = {
            store: {
                name: store?.name || 'INVENZO Store',
                address: store?.address || '',
                city: store?.city || '',
                phone: store?.phone || '',
                gstin: storeGstin,
                footer: cfg.receipt_footer || 'Thank you for your visit!'
            },
            gst: {
                gstin: storeGstin,
                taxableAmount: formatRupees(taxablePaise),
                taxablePaise,
                cgstAmount: formatRupees(cgstPaise),
                cgstPaise,
                sgstAmount: formatRupees(sgstPaise),
                sgstPaise,
                totalGst: formatRupees(totalGstPaise),
                totalGstPaise,
                cgstRateDisplay: '2.5%',
                sgstRateDisplay: '2.5%',
                gstRateDisplay: '5%'
            },
            bill: {
                id: sale.id,
                billNumber: sale.bill_number ? `${prefix}${sale.bill_number}` : (sale.offline_ref || `#${sale.id}`),
                date: sale.created_at,
                status: sale.status,
                paymentMode: sale.payment_mode,
                totalAmount: formatRupees(sale.total_amount),
                amountPaid: formatRupees(sale.amount_paid),
                dueAmount: formatRupees(sale.due_amount),
                isVoided: sale.status === 'voided'
            },
            customer: customer ? {
                name: customer.name,
                phone: customer.phone,
                balanceAfter: formatRupees(customer.balance)
            } : null,
            items: items.map(it => ({
                name: it.product_name,
                unit: it.unit,
                quantity: formatQuantity(it.quantity_milli, it.unit),
                rate: formatRupees(it.price),
                amount: formatRupees(it.subtotal),
                subtotal: formatRupees(it.subtotal),
                hsn: it.hsn_code || '1905',
                taxable: formatRupees(it.taxable_value || it.subtotal),
                gstRate: it.gst_rate_bps ? `${(it.gst_rate_bps / 100).toFixed(1)}%` : '5%'
            })),
            storeName: store?.name || 'INVENZO Store',
            storeAddress: store?.address || '',
            storeCity: store?.city || '',
            storePhone: store?.phone || '',
            footerText: cfg.receipt_footer || 'Thank you for your visit!',
            billNumber: sale.bill_number ? `${prefix}${sale.bill_number}` : (sale.offline_ref || `#${sale.id}`),
            date: sale.created_at,
            customerName: customer ? customer.name : 'Walk-in Customer',
            paymentMode: sale.payment_mode,
            subtotal: formatRupees(taxablePaise || sale.total_amount),
            taxAmount: formatRupees(totalGstPaise),
            discountAmount: formatRupees(sale.discount_amount || 0),
            totalAmount: formatRupees(sale.total_amount)
        };

        res.json({ success: true, data: receiptData });
    } catch (err) {
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to generate receipt.' } });
    }
});

module.exports = router;
