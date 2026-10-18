// ============================================
// INVENZO: Inventory and Billing Platform — Server
// PRD Version 5.0
// ============================================
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const config = require('./config.json');
const { initDatabase } = require('./database/db');
const { errorHandler } = require('./middleware/errorHandler');
const { generateCsrfToken, validateCsrfToken } = require('./middleware/csrfMiddleware');
const { apiLimiter } = require('./middleware/rateLimitMiddleware');

// Route imports
const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const supplierRoutes = require('./routes/supplierRoutes');
const billingRoutes = require('./routes/billingRoutes');
const salesRoutes = require('./routes/salesRoutes');
const customerRoutes = require('./routes/customerRoutes');
const stockRoutes = require('./routes/stockRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const reportRoutes = require('./routes/reportRoutes');
const activityRoutes = require('./routes/activityRoutes');
const developerRoutes = require('./routes/developerRoutes');

const app = express();
const PORT = process.env.PORT || config.app.port || 5000;

// ---- Security Middleware ----
app.use(helmet({
    contentSecurityPolicy: false // Allows self-hosted scripts and SVGs
}));
app.use(cors({
    origin: true,
    credentials: true
}));
app.use(apiLimiter);

// ---- Body Parsing ----
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---- Reverse Proxy Trust ----
app.set('trust proxy', 1);

// ---- Sessions ----
app.use(session({
    name: 'stocker_vendor_sid',
    secret: process.env.VENDOR_SESSION_SECRET || process.env.SESSION_SECRET || 'stocker_vendor_secure_key_18274',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 60 * 1000 // 30 minutes
    }
}));

// ---- CSRF ----
app.use(generateCsrfToken);

// ---- Static Files ----
app.use(express.static(path.join(__dirname, 'public'), { index: false }));
app.use('/storage', express.static(path.join(__dirname, 'storage')));
app.use('/locales', express.static(path.join(__dirname, 'locales')));

// ---- Config API ----
app.get('/api/config/gst-rates', (req, res) => {
    try {
        const rates = JSON.parse(fs.readFileSync(path.join(__dirname, 'config', 'gstRates.json'), 'utf-8'));
        res.json({ success: true, data: rates });
    } catch {
        res.json({ success: true, data: [0, 25, 300, 500, 1200, 1800, 2800] });
    }
});

// ---- Vendor API Routes (/api) ----
app.use('/api/auth', authRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/products', validateCsrfToken, productRoutes);
app.use('/api/categories', validateCsrfToken, categoryRoutes);
app.use('/api/suppliers', validateCsrfToken, supplierRoutes);
app.use('/api/sales', validateCsrfToken, salesRoutes);
app.use('/api/customers', validateCsrfToken, customerRoutes);
app.use('/api/stock', validateCsrfToken, stockRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/settings', validateCsrfToken, settingsRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/activity', activityRoutes);

// ---- Developer API Routes (/developer/api) ----
app.use('/developer/api', developerRoutes);

// ---- Public & SPA Pages ----
app.get('/login', (req, res) => {
    if (req.session && req.session.vendorUser) {
        return res.redirect('/app');
    }
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/privacy', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'privacy.html'));
});

app.get('/terms', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'terms.html'));
});

// Developer Portal Pages
app.get('/developer/login', (req, res) => {
    if (req.session && req.session.developer) {
        return res.redirect('/developer');
    }
    res.sendFile(path.join(__dirname, 'public', 'developer', 'login.html'));
});

app.get('/developer', (req, res) => {
    if (!req.session || !req.session.developer) {
        return res.redirect('/developer/login');
    }
    res.sendFile(path.join(__dirname, 'public', 'developer', 'index.html'));
});

// Root route
app.get('/', (req, res) => {
    if (req.session && req.session.vendorUser) {
        return res.redirect('/app');
    }
    res.redirect('/login');
});

// Vendor App Shell
app.get('/app', (req, res) => {
    if (!req.session || !req.session.vendorUser) {
        return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---- Health Check (for Fly.io) ----
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', uptime: Math.floor(process.uptime()) });
});

// ---- Error Handler ----
app.use(errorHandler);


// ---- Start Server ----
async function start() {
    try {
        await initDatabase();
        app.listen(PORT, () => {
            console.log(`\n======================================================`);
            console.log(` INVENZO v5.0 running at http://localhost:${PORT}`);
            console.log(` User Portal:      http://localhost:${PORT}/login (admin / admin123)`);
            console.log(` Developer Portal: http://localhost:${PORT}/developer/login (developer / Developer123!)`);
            console.log(`======================================================\n`);
        });
    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
}

if (require.main === module) {
    start();
}

module.exports = app;
