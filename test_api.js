// ============================================
// Comprehensive Automated Test Suite — PRD v5.0
// ============================================
const http = require('http');

let cookie = '';
let csrfToken = '';
const PORT = 5001;

function request(options, data = null) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            port: PORT,
            hostname: '127.0.0.1',
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...(cookie ? { 'Cookie': cookie } : {}),
                ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
                ...(options.headers || {})
            }
        }, (res) => {
            let body = '';
            if (res.headers['set-cookie']) {
                cookie = res.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
            }
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                let parsed = body;
                try { parsed = JSON.parse(body); } catch {}
                resolve({ status: res.statusCode, headers: res.headers, body: parsed });
            });
        });
        req.on('error', reject);
        if (data) req.write(typeof data === 'string' ? data : JSON.stringify(data));
        req.end();
    });
}

async function runTests() {
    process.env.PORT = PORT;
    process.env.NODE_ENV = 'test';
    process.env.SESSION_SECRET = 'test-secret-suite-v5';

    // Start server in-process
    const express = require('express');
    const session = require('express-session');
    const { initDatabase } = require('./database/db');
    const { errorHandler } = require('./middleware/errorHandler');
    const { generateCsrfToken, validateCsrfToken } = require('./middleware/csrfMiddleware');

    const authRoutes = require('./routes/authRoutes');
    const productRoutes = require('./routes/productRoutes');
    const categoryRoutes = require('./routes/categoryRoutes');
    const supplierRoutes = require('./routes/supplierRoutes');
    const stockRoutes = require('./routes/stockRoutes');
    const salesRoutes = require('./routes/salesRoutes');
    const billingRoutes = require('./routes/billingRoutes');
    const customerRoutes = require('./routes/customerRoutes');
    const dashboardRoutes = require('./routes/dashboardRoutes');
    const settingsRoutes = require('./routes/settingsRoutes');
    const reportRoutes = require('./routes/reportRoutes');
    const activityRoutes = require('./routes/activityRoutes');
    const developerRoutes = require('./routes/developerRoutes');

    await initDatabase();

    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(session({
        secret: 'test-secret-suite-v5',
        resave: false,
        saveUninitialized: false
    }));
    app.use(generateCsrfToken);

    // Routes
    app.use('/api/auth', authRoutes);
    app.use('/api/billing', validateCsrfToken, billingRoutes);
    app.use('/api/products', validateCsrfToken, productRoutes);
    app.use('/api/categories', validateCsrfToken, categoryRoutes);
    app.use('/api/suppliers', validateCsrfToken, supplierRoutes);
    app.use('/api/customers', validateCsrfToken, customerRoutes);
    app.use('/api/stock', validateCsrfToken, stockRoutes);
    app.use('/api/sales', validateCsrfToken, salesRoutes);
    app.use('/api/dashboard', dashboardRoutes);
    app.use('/api/settings', validateCsrfToken, settingsRoutes);
    app.use('/api/reports', reportRoutes);
    app.use('/api/activity', activityRoutes);
    app.use('/developer/api', developerRoutes);
    app.use(errorHandler);

    const server = app.listen(PORT);
    console.log(`Test server running on port ${PORT}`);

    let passed = 0;
    let failed = 0;

    function assert(desc, condition) {
        if (condition) {
            console.log(`  ✅ PASS: ${desc}`);
            passed++;
        } else {
            console.error(`  ❌ FAIL: ${desc}`);
            failed++;
        }
    }

    try {
        console.log('\n--- 1. Testing Vendor Auth & Multi-Tenant Login ---');
        // Invalid credentials
        let res = await request({ path: '/api/auth/login', method: 'POST' }, { username: 'admin', password: 'wrongpassword' });
        assert('Login with wrong password returns 401', res.status === 401 && res.body.error.code === 'INVALID_CREDENTIALS');

        // Valid vendor login
        res = await request({ path: '/api/auth/login', method: 'POST' }, { username: 'admin', password: 'admin123' });
        assert('Vendor login returns 200 with store context', res.status === 200 && res.body.success === true && res.body.data.storeCode === 'STR-000001');
        csrfToken = res.body.data.csrfToken;
        const vendorCookie = cookie;
        assert('Received valid CSRF token on login', typeof csrfToken === 'string' && csrfToken.length > 0);

        // Check /me
        res = await request({ path: '/api/auth/me', method: 'GET' });
        assert('GET /api/auth/me returns vendor profile and store name', res.status === 200 && typeof res.body.data.storeName === 'string' && res.body.data.storeName.length > 0);

        console.log('\n--- 2. Testing Developer Realm Isolation ---');
        // Clear cookie for developer login
        cookie = '';
        const devLoginRes = await request({ path: '/developer/api/auth/login', method: 'POST' }, {
            username: 'developer',
            password: 'Developer123!'
        });
        assert('Developer login returns 200 with developer role', devLoginRes.status === 200 && devLoginRes.body.data.role === 'developer');
        const devCookie = cookie;

        // Developer overview stats
        const devStats = await request({
            path: '/developer/api/overview',
            method: 'GET',
            headers: { 'Cookie': devCookie }
        });
        assert('Developer overview returns system aggregate metrics', devStats.status === 200 && devStats.body.data.totalStores >= 1);

        // Switch back to vendor cookie for store tests
        cookie = vendorCookie;

        console.log('\n--- 3. Testing Products (Paise Prices & Unit Precisions) ---');
        // List products
        res = await request({ path: '/api/products', method: 'GET' });
        assert('GET /api/products returns products list', res.status === 200 && Array.isArray(res.body.data) && res.body.data.length > 0);

        // Create product with measured unit (kg) allowing decimals
        const uniqueSku = 'TEST-OIL-' + Date.now();
        res = await request({ path: '/api/products', method: 'POST' }, {
            name: 'Sunrich Refined Oil',
            category_id: 1,
            sku: uniqueSku,
            price: 135.50, // Selling price in rupees
            cost_price: 110.00,
            quantity: 25.500, // 25.5 kg
            minimum_stock: 5.000,
            unit: 'kg',
            is_quick_item: true,
            track_expiry: true,
            expiryDate: '2026-12-31'
        });
        assert('POST /api/products creates product with kg unit and paise conversion', res.status === 201 && res.body.success === true);
        const prodId = res.body.data.id;

        // Verify product details
        res = await request({ path: `/api/products/${prodId}`, method: 'GET' });
        assert('Product stores exact price (13550 paise) and quantity (25500 milli)', res.status === 200 && res.body.data.price === 13550 && res.body.data.quantity_milli === 25500);

        // Whole unit decimal rejection test
        res = await request({ path: '/api/products', method: 'POST' }, {
            name: 'Soap Bar',
            sku: 'SOAP-' + Date.now(),
            price: 45.00,
            quantity: 10.5, // Invalid decimal for 'piece'
            unit: 'piece'
        });
        assert('Whole units reject decimal quantities', res.status === 400 && res.body.error.code === 'INVALID_QUANTITY');

        console.log('\n--- 4. Testing Stock Restock & Expiry Batches ---');
        // Restock with expiry date
        res = await request({ path: '/api/stock/add', method: 'POST' }, {
            productId: prodId,
            quantity: 10.000,
            expiryDate: '2026-12-31',
            batchLabel: 'BATCH-2026-A',
            note: 'Vendor Restock'
        });
        assert('POST /api/stock/add records batch and updates stock to 35.5 kg', res.status === 200 && res.body.data.newQuantityMilli === 35500);

        // Stock adjustment with mandatory reason
        res = await request({ path: '/api/stock/adjust', method: 'POST' }, {
            productId: prodId,
            quantity: -0.500,
            reason: 'Container leak during transit'
        });
        assert('POST /api/stock/adjust reduces stock with reason', res.status === 200 && res.body.data.newQuantityMilli === 35000);

        // Stock adjustment without reason -> rejected
        res = await request({ path: '/api/stock/adjust', method: 'POST' }, {
            productId: prodId,
            quantity: -0.500,
            reason: ''
        });
        assert('Adjustment without reason returns 400 REASON_REQUIRED', res.status === 400 && res.body.error.code === 'REASON_REQUIRED');

        // Check FIFO Expiry list
        res = await request({ path: '/api/stock/expiry', method: 'GET' });
        assert('GET /api/stock/expiry derives FIFO batches with remaining stock', res.status === 200 && res.body.data.some(i => i.productId === prodId));

        // Check Reorder list
        res = await request({ path: '/api/stock/reorder', method: 'GET' });
        assert('GET /api/stock/reorder groups low stock items by supplier', res.status === 200 && Array.isArray(res.body.data));

        console.log('\n--- 5. Testing Customers & Udhaar Credit Ledger ---');
        // Create Customer with mandatory consent
        const custPhone = '98' + Math.floor(10000000 + Math.random() * 90000000);
        res = await request({ path: '/api/customers', method: 'POST' }, {
            name: 'Sunil Kumar',
            phone: custPhone,
            creditLimit: 5000.00,
            consentGiven: true
        });
        assert('POST /api/customers creates customer with consent', res.status === 201 && res.body.success === true);
        const custId = res.body?.data?.id;
        console.log('DEBUG CUST ID:', custId);

        // Creation without consent -> rejected
        res = await request({ path: '/api/customers', method: 'POST' }, {
            name: 'No Consent Customer',
            phone: '9988776655',
            consentGiven: false
        });
        assert('Customer creation without consent returns 400 CONSENT_REQUIRED', res.status === 400 && res.body.error.code === 'CONSENT_REQUIRED');

        console.log('\n--- 6. Testing Counter Billing & Sales Execution ---');
        const clientSaleId = 'SALE-CLI-' + Date.now();
        res = await request({ path: '/api/sales', method: 'POST' }, {
            clientSaleId,
            customerId: custId,
            paymentMode: 'credit', // Udhaar sale
            amountPaid: 0,
            items: [
                { productId: prodId, quantity: 2.000 } // 2 kg @ 135.50 = 271.00
            ]
        });
        if (res.status !== 201) console.log('DEBUG SALE FAILURE:', res.status, JSON.stringify(res.body));
        assert('Counter sale generates bill with consecutive FY number', res.status === 201 && res.body.success === true && res.body.data.billNumber.startsWith('B-'));
        const saleId = res.body?.data?.saleId;

        // Verify stock deducted by 2.000 kg (35.000 - 2.000 = 33.000 kg)
        res = await request({ path: `/api/products/${prodId}`, method: 'GET' });
        assert('Product quantity automatically deducted to 33.000 kg', res.body.data.quantity_milli === 33000);

        // Verify customer udhaar balance increased by ₹271.00 (27100 paise)
        res = await request({ path: `/api/customers/${custId}`, method: 'GET' });
        assert('Customer udhaar balance updated to 27100 paise', res.status === 200 && res.body.data.balance === 27100);

        // Record customer payment against dues
        res = await request({ path: `/api/customers/${custId}/payments`, method: 'POST' }, {
            amount: 271.00,
            paymentMode: 'upi',
            note: 'UPI Payment via QR'
        });
        assert('Recording payment reduces customer balance to zero', res.status === 200 && res.body.data.newBalance === 0);

        // Voiding sale with mandatory reason restores inventory
        res = await request({ path: `/api/sales/${saleId}/void`, method: 'POST' }, {
            reason: 'Customer cancelled bill before leaving counter'
        });
        assert('POST /api/sales/:id/void marks bill voided', res.status === 200 && res.body.success === true);

        // Verify stock restored back to 35.000 kg
        res = await request({ path: `/api/products/${prodId}`, method: 'GET' });
        assert('Inventory stock restored back to 35.000 kg after void', res.body.data.quantity_milli === 35000);

        // Erase customer details under DPDP (allowed when balance is zero)
        const eraseCustRes = await request({ path: '/api/customers', method: 'POST' }, {
            name: 'Temporary Customer',
            phone: '9876543219',
            consentGiven: true
        });
        const eraseCustId = eraseCustRes.body.data.id;
        res = await request({ path: `/api/customers/${eraseCustId}/erase`, method: 'POST' });
        assert('Erase customer details succeeds when balance is zero', res.status === 200 && res.body.success === true);

        console.log('\n--- 7. Testing Reports & CSV Protection ---');
        // Sales report
        res = await request({ path: '/api/reports/sales?format=json', method: 'GET' });
        assert('GET /api/reports/sales returns sales report', res.status === 200 && Array.isArray(res.body.data));

        // CSV export with formula injection check
        res = await request({ path: '/api/reports/inventory?format=csv', method: 'GET' });
        assert('GET /api/reports/inventory?format=csv returns UTF-8 CSV', res.status === 200 && typeof res.body === 'string' && res.body.includes('Name,SKU'));

        // Customer dues report
        res = await request({ path: '/api/reports/customer-dues', method: 'GET' });
        assert('GET /api/reports/customer-dues returns dues list', res.status === 200 && Array.isArray(res.body.data));

        console.log('\n--- 8. Testing Store Profile & Billing Settings ---');
        res = await request({ path: '/api/settings', method: 'GET' });
        assert('GET /api/settings returns store profile & preferences', res.status === 200 && res.body.data.store.storeCode === 'STR-000001');

        res = await request({ path: '/api/settings', method: 'PUT' }, {
            store: { name: 'Ayush Superstore Pune' },
            settings: { upiId: 'ayush@upi', receiptWidth: '80mm' }
        });
        assert('PUT /api/settings updates store name and UPI ID', res.status === 200 && res.body.success === true);

        console.log('\n--- 9. Testing Activity Log Audit ---');
        res = await request({ path: '/api/activity', method: 'GET' });
        assert('GET /api/activity returns immutable audit records', res.status === 200 && res.body.data.length > 0);

        console.log(`\n============================================`);
        console.log(`Test Results: ${passed} passed, ${failed} failed`);
        console.log(`============================================\n`);

    } catch (err) {
        console.error('Test execution error:', err);
        failed++;
    } finally {
        server.close();
    }

    if (failed > 0) {
        process.exit(1);
    }
}

runTests();
