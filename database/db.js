// ============================================
// Database Connection & Initialization (sql.js)
// Version 5.0 | Multi-Store & Exact Math
// ============================================
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const config = require('../config.json');

const DB_PATH = process.env.DB_PATH 
    ? path.resolve(process.env.DB_PATH) 
    : path.resolve(__dirname, '..', config.database.path.replace('./', ''));
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

let db = null;
let inTransaction = false;

/**
 * Initialize the database: load existing file or create new one with schema + seed.
 */
async function initDatabase() {
    const SQL = await initSqlJs();

    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }

    // Auto-copy bundled database into persistent volume if destination does not exist yet
    const BUNDLED_DB = path.resolve(__dirname, 'database.sqlite');
    if (!fs.existsSync(DB_PATH) && fs.existsSync(BUNDLED_DB)) {
        try {
            fs.copyFileSync(BUNDLED_DB, DB_PATH);
            console.log('[DB] Copied initial database with products to persistent storage:', DB_PATH);
        } catch (e) {
            console.warn('[DB] Could not copy initial database:', e.message);
        }
    }

    let isNew = false;
    if (fs.existsSync(DB_PATH)) {
        try {
            const fileBuffer = fs.readFileSync(DB_PATH);
            db = new SQL.Database(fileBuffer);
            console.log('[DB] Loaded database from', DB_PATH);

            // Check if existing database is v5.0 compatible (has stores table & categories.store_id)
            let isV5 = false;
            try {
                const res = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='stores'");
                if (res.length > 0 && res[0].values.length > 0) {
                    const catInfo = db.exec("PRAGMA table_info(categories)");
                    if (catInfo.length > 0 && catInfo[0].values.some(col => col[1] === 'store_id')) {
                        isV5 = true;
                    }
                }
            } catch (checkErr) {
                isV5 = false;
            }

            if (!isV5) {
                console.warn('[DB] Legacy schema detected. Backing up and upgrading to clean PRD v5.0 schema...');
                fs.copyFileSync(DB_PATH, DB_PATH + '.legacy.bak');
                db.close();
                db = new SQL.Database();
                isNew = true;
            }
        } catch (e) {
            console.warn('[DB] Could not read existing DB, creating fresh:', e.message);
            db = new SQL.Database();
            isNew = true;
        }
    } else {
        db = new SQL.Database();
        isNew = true;
        console.log('[DB] Created new database');
    }

    // Enable foreign keys
    db.run('PRAGMA foreign_keys = ON;');

    // Apply schema
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
    // Run schema statements
    db.run(schema);
    console.log('[DB] Schema v5.0 verified');

    // Schema migration check for existing tables
    try {
        const prodCols = db.exec("PRAGMA table_info(products)");
        if (prodCols.length > 0) {
            const colNames = prodCols[0].values.map(c => c[1]);
            if (!colNames.includes('product_type')) {
                db.run("ALTER TABLE products ADD COLUMN product_type TEXT NOT NULL DEFAULT 'packaged'");
            }
            if (!colNames.includes('package_size_milli')) {
                db.run("ALTER TABLE products ADD COLUMN package_size_milli INTEGER DEFAULT 1000");
            }
            db.run("UPDATE products SET product_type = 'loose' WHERE name LIKE '%loose%' OR name LIKE '%open%'");
        }
    } catch (migErr) {
        console.warn('[DB] Product column migration notice:', migErr.message);
    }

    // Run Migration / Seeding
    await setupDefaultData();

    saveDatabase();
    return db;
}

/**
 * Ensures at least one developer, one store, and vendor account exist.
 */
async function setupDefaultData() {
    const devCheck = get('SELECT id FROM developers LIMIT 1');
    let devId = devCheck ? devCheck.id : null;

    if (!devId) {
        const hash = bcrypt.hashSync('Developer123!', 10);
        run(`INSERT INTO developers (name, username, password_hash, is_active)
             VALUES (?, ?, ?, 1)`, ['Platform Developer', 'developer', hash]);
        devId = getLastInsertRowId();
        console.log('[DB] Seeded platform developer: developer / Developer123!');
    }

    const storeCheck = get('SELECT id FROM stores WHERE id = 1');
    let storeId = storeCheck ? storeCheck.id : null;

    if (!storeId) {
        run(`INSERT INTO stores (id, store_code, name, owner_name, phone, email, address, city, timezone, status, created_by)
             VALUES (1, 'STR-000001', 'Ayush Provision Store', 'Ayush', '9876543210', 'ayush@store.local', 'Main Market, City Center', 'Amravati', 'Asia/Kolkata', 'active', ?)`,
            [devId]);
        storeId = 1;
        console.log('[DB] Seeded store STR-000001');
    }

    // Default vendor user
    const vendorCheck = get('SELECT id FROM vendor_users WHERE store_id = 1');
    let vendorId = vendorCheck ? vendorCheck.id : null;
    if (!vendorId) {
        // Hash for 'admin123'
        const hash = bcrypt.hashSync('admin123', 10);
        run(`INSERT INTO vendor_users (store_id, name, username, password_hash, must_change_password, is_active)
             VALUES (1, 'Ayush (User)', 'admin', ?, 0, 1)`, [hash]);
        vendorId = getLastInsertRowId();
        console.log('[DB] Seeded user login: admin / admin123');
    }

    // Default store settings
    const defaultSettings = [
        ['default_minimum_stock', '10'],
        ['items_per_page', '20'],
        ['session_timeout_minutes', '30'],
        ['language', 'en'],
        ['upi_id', 'ayushstore@upi'],
        ['bill_prefix', 'B'],
        ['receipt_width', '80mm'],
        ['receipt_footer', 'Thank you for your visit!'],
        ['expiry_alert_days', '30'],
        ['gst_mode', 'none'],
        ['gstin', ''],
        ['default_gst_rate_bps', '']
    ];

    for (const [key, val] of defaultSettings) {
        const exist = get('SELECT key FROM store_settings WHERE store_id = 1 AND key = ?', [key]);
        if (!exist) {
            run('INSERT INTO store_settings (store_id, key, value) VALUES (1, ?, ?)', [key, val]);
        }
    }

    // Seed Categories for Store 1 if none
    const catCount = get('SELECT COUNT(*) as count FROM categories WHERE store_id = 1');
    if (!catCount || catCount.count === 0) {
        const defaultCats = [
            'Pulses & Grains', 'Dairy & Fats', 'Beverages', 'Snacks & Biscuits',
            'Chocolates & Confectionery', 'Spices & Masala', 'Household', 'Personal Care'
        ];
        for (const name of defaultCats) {
            run('INSERT INTO categories (store_id, name, is_active) VALUES (1, ?, 1)', [name]);
        }
    }

    // Seed Suppliers for Store 1 if none
    const supCount = get('SELECT COUNT(*) as count FROM suppliers WHERE store_id = 1');
    if (!supCount || supCount.count === 0) {
        const defaultSups = [
            ['Maharashtra Wholesale', '9876543210', 'sales@mhwholesale.com', 'Pune, Maharashtra'],
            ['City Distributors', '9876543211', 'city@distrib.com', 'Amravati, Maharashtra'],
            ['Agrawal Traders', '9876543212', 'agrawal@traders.com', 'Nagpur, Maharashtra']
        ];
        for (const [name, phone, email, addr] of defaultSups) {
            run('INSERT INTO suppliers (store_id, name, phone, email, address, is_active) VALUES (1, ?, ?, ?, ?, 1)',
                [name, phone, email, addr]);
        }
    }

    // Seed Products for Store 1 if none
    const prodCount = get('SELECT COUNT(*) as count FROM products WHERE store_id = 1');
    if (!prodCount || prodCount.count === 0) {
        // Category IDs
        const cPulses   = get('SELECT id FROM categories WHERE store_id = 1 AND name = ?', ['Pulses & Grains'])?.id;
        const cDairy    = get('SELECT id FROM categories WHERE store_id = 1 AND name = ?', ['Dairy & Fats'])?.id;
        const cBev      = get('SELECT id FROM categories WHERE store_id = 1 AND name = ?', ['Beverages'])?.id;
        const cSnacks   = get('SELECT id FROM categories WHERE store_id = 1 AND name = ?', ['Snacks & Biscuits'])?.id;
        const cChoc     = get('SELECT id FROM categories WHERE store_id = 1 AND name = ?', ['Chocolates & Confectionery'])?.id;
        const cSpices   = get('SELECT id FROM categories WHERE store_id = 1 AND name = ?', ['Spices & Masala'])?.id;
        const cHouse    = get('SELECT id FROM categories WHERE store_id = 1 AND name = ?', ['Household'])?.id;
        const cCare     = get('SELECT id FROM categories WHERE store_id = 1 AND name = ?', ['Personal Care'])?.id;
        const sup1 = get('SELECT id FROM suppliers WHERE store_id = 1 LIMIT 1')?.id || 1;

        // Products from actual invoice data
        // [name, catId, sku, price(paise), cost(paise), qty_milli, min_milli, unit, quick, expiry]
        const defaultProducts = [
            // --- Pulses & Grains ---
            ['L Dal Chana',               cPulses, 'PG001', 8850,  8000,  2176000, 500000, 'kg',    0, 0],
            ['L Urad Dal',                cPulses, 'PG002', 13300, 11000, 1690000, 500000, 'kg',    0, 0],
            ['L Matki',                   cPulses, 'PG003', 11450, 9800,  2218000, 500000, 'kg',    0, 0],
            ['L Ajma',                    cPulses, 'PG004', 4750,  3900,  1764000, 200000, 'kg',    0, 0],
            ['L SL Rava',                 cPulses, 'PG005', 4750,  3800,  1100000, 500000, 'kg',    0, 0],
            ['L SL Sugar',                cPulses, 'PG006', 5200,  4500,  6100000, 500000, 'kg',    0, 0],

            // --- Dairy & Fats ---
            ['Amul Cheese 100g',          cDairy,  'DA001', 5800,  5000,  1000000, 100000, 'pack',  1, 1],
            ['Prov Select IN 500g',       cDairy,  'DA002', 24900, 22000, 1000000, 200000, 'pack',  0, 0],
            ['24 Carat Refined Oil 800g', cDairy,  'DA003', 14700, 12000, 5000000, 500000, 'piece', 0, 0],

            // --- Beverages ---
            ['Nescafe Coffee (200g)',      cBev,    'BV001', 71000, 65000, 1000000,  50000, 'piece', 0, 0],

            // --- Snacks & Biscuits ---
            ['Charoli 50g',               cSnacks, 'SN001', 12450, 11000, 1000000,  50000, 'pack',  1, 0],
            ['Premia Makhana 100g',        cSnacks, 'SN002', 14500, 12800, 1000000,  50000, 'pack',  0, 0],
            ['Brooke Bond Tea 500g',       cSnacks, 'SN003', 33800, 30000, 1000000,  50000, 'pack',  1, 0],
            ['Britannia Bourbon 150g',     cSnacks, 'SN004', 2700,  2300,  1000000, 100000, 'pack',  1, 0],
            ['Sunfeast Bourbon 99g',       cSnacks, 'SN005', 1500,  1200,  1000000, 100000, 'pack',  1, 0],
            ['Britannia Good Day 200g',    cSnacks, 'SN006', 3600,  3100,  1000000, 100000, 'pack',  1, 0],
            ['Poha Jada (Ujala) 1kg',      cSnacks, 'SN007', 7950,  7000,  2000000, 200000, 'pack',  0, 0],
            ['Rajam Chips YF 100g',        cSnacks, 'SN008', 11000, 9500,  1000000, 100000, 'pack',  0, 0],
            ['KBS Murmura PU 130g',        cSnacks, 'SN009', 1290,  1000,  1000000, 200000, 'pack',  1, 0],

            // --- Chocolates & Confectionery ---
            ['Elaichi Green E 10g',        cChoc,   'CC001', 4800,  4100,  1000000, 100000, 'pack',  0, 0],
            ['Jaiphal 20g',               cChoc,   'CC002', 3850,  3200,  1000000, 100000, 'pack',  0, 0],
            ['Jeera 500g',                cChoc,   'CC003', 15350, 13800, 1000000, 100000, 'pack',  0, 0],
            ['Tejpatta 50g',              cChoc,   'CC004', 2800,  2300,  1000000, 100000, 'pack',  0, 0],
            ['Nestle Kitkat 36.5g',        cChoc,   'CC005', 2800,  2400,  1000000, 100000, 'piece', 1, 0],
            ['Gits Gulab Jamun 200g',      cChoc,   'CC006', 11700, 10000, 1000000, 100000, 'pack',  0, 0],
            ['Mysore Sandali 450g',        cChoc,   'CC007', 19600, 17500, 1000000,  50000, 'piece', 0, 0],

            // --- Spices & Masala ---
            ['Everest Shahi B 50g',        cSpices, 'SP001', 7900,  6800,  1000000, 100000, 'pack',  0, 0],
            ['Suruchi Goda Masala 100g',   cSpices, 'SP002', 14500, 12500, 1000000, 100000, 'pack',  0, 0],
            ['Ajma 200g',                 cSpices, 'SP003', 8100,  7000,  1000000, 100000, 'pack',  0, 0],
            ['Premia Bhagar 500g',         cSpices, 'SP004', 14400, 12800, 1000000, 100000, 'pack',  0, 0],
            ['L Groundnut',               cSpices, 'SP005', 16400, 14500, 1016000, 200000, 'kg',    0, 0],
            ['Alsi 200g',                 cSpices, 'SP006', 3850,  3200,  1000000, 100000, 'pack',  0, 0],
            ['Rai Small 200g',            cSpices, 'SP007', 3550,  3000,  1000000, 100000, 'pack',  0, 0],
            ['Prov Select Combo S',        cSpices, 'SP008', 14900, 13000, 1000000, 100000, 'piece', 0, 0],
            ['Haldiram Bhujia 400g',       cSpices, 'SP009', 9500,  8200,  1000000, 100000, 'pack',  0, 0],
            ['Haldi Phalhari 200g',        cSpices, 'SP010', 4300,  3600,  1000000, 100000, 'pack',  0, 0],
            ['Patanjali Doodh 800g',       cSpices, 'SP011', 9500,  8200,  1000000, 100000, 'pack',  0, 0],
            ['Jaggery Big 900g',           cSpices, 'SP012', 7700,  6500,  1000000, 100000, 'pack',  0, 0],

            // --- Household ---
            ['Unibisc Cashew BA 485g',    cHouse,  'HH001', 7100,  6000,  1000000, 100000, 'pack',  0, 0],
            ['Colgate Dental 100g',       cHouse,  'HH002', 6700,  5800,  1000000, 100000, 'piece', 1, 0],
            ['Grace Quality TO L 9g',     cHouse,  'HH003', 1600,  1300,  2000000, 200000, 'piece', 0, 0],
            ['Tide Liquid P-3.2 kg',       cHouse,  'HH004', 31700, 28000, 1000000, 100000, 'litre', 0, 0],
            ['Expert Stainless S',         cHouse,  'HH005', 4800,  4000,  4000000, 500000, 'piece', 0, 0],
            ['Force 10 Toilet Cleaner 1L', cHouse,  'HH006', 7900,  6800,  1000000, 100000, 'litre', 0, 0],
            ['Expert Dishwashing L 1kg',   cHouse,  'HH007', 3700,  3000,  3000000, 300000, 'piece', 0, 0],
            ['Godrej PR Mag NE 9g',        cHouse,  'HH008', 940,   700,   2000000, 200000, 'piece', 0, 0],
            ['Sunfeel EA 1.5 kg',          cHouse,  'HH009', 20700, 18500, 1500000, 200000, 'pack',  0, 0],

            // --- Personal Care ---
            ['Patanjali Reg 100g',         cCare,   'PC001', 5600,  4800,  1000000, 100000, 'pack',  0, 0],
        ];

        for (const p of defaultProducts) {
            const [name, catId, sku, price, cost, qtyMilli, minMilli, unit, quick, expiry] = p;
            run(`INSERT INTO products (store_id, name, category_id, supplier_id, sku, price, cost_price, quantity_milli, minimum_stock_milli, unit, is_quick_item, track_expiry, is_active)
                 VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
                [name, catId, sup1, sku, price, cost, qtyMilli, minMilli, unit, quick, expiry]);
            const pId = getLastInsertRowId();
            run(`INSERT INTO stock_movements (store_id, product_id, type, quantity_change_milli, quantity_after_milli, note, created_by)
                 VALUES (1, ?, 'restock', ?, ?, 'Initial inventory seed', ?)`,
                [pId, qtyMilli, qtyMilli, vendorId]);

            if (expiry) {
                const expDate = new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0];
                const movId = getLastInsertRowId();
                run(`INSERT INTO stock_batches (store_id, product_id, batch_label, expiry_date, quantity_received_milli, movement_id, created_by)
                     VALUES (1, ?, 'BATCH-01', ?, ?, ?, ?)`,
                    [pId, expDate, qtyMilli, movId, vendorId]);
            }
        }
    }

    // Seed Sample Customers for Store 1 if none
    const custCount = get('SELECT COUNT(*) as count FROM customers WHERE store_id = 1');
    if (!custCount || custCount.count === 0) {
        const sampleCusts = [
            ['Ramesh Sharma', '9822011223', 500000, 125000], // owes ₹1250
            ['Pooja Kulkarni', '9890123456', 300000, 0]
        ];
        for (const [name, phone, limit, balance] of sampleCusts) {
            run(`INSERT INTO customers (store_id, name, phone, credit_limit, balance, consent_recorded_at, is_active)
                 VALUES (1, ?, ?, ?, ?, datetime('now'), 1)`, [name, phone, limit, balance]);
            const cId = getLastInsertRowId();
            if (balance > 0) {
                run(`INSERT INTO customer_ledger (store_id, customer_id, type, amount_change, balance_after, note, created_by)
                     VALUES (1, ?, 'credit_sale', ?, ?, 'Initial balance', ?)`,
                    [cId, balance, balance, vendorId]);
            }
        }
    }
}

/**
 * Persist the in-memory database to disk.
 */
function saveDatabase() {
    if (!db || inTransaction) return;
    try {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(DB_PATH, buffer);
    } catch (err) {
        console.error('[DB] Error saving database:', err.message);
    }
}

/**
 * Get the database instance.
 */
function getDb() {
    if (!db) {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }
    return db;
}

let lastInsertedRowId = 0;

/**
 * Run a SQL statement (INSERT/UPDATE/DELETE).
 * Auto-saves to disk after write operations.
 */
function run(sql, params = []) {
    const stmt = db.prepare(sql);
    if (params.length > 0) stmt.bind(params);
    stmt.step();
    stmt.free();

    try {
        const result = db.exec('SELECT last_insert_rowid() as id');
        if (result.length > 0 && result[0].values.length > 0) {
            lastInsertedRowId = result[0].values[0][0];
        }
    } catch {}

    if (!inTransaction) {
        saveDatabase();
    }
    return { changes: db.getRowsModified(), lastInsertRowid: lastInsertedRowId };
}

/**
 * Get last insert row id
 */
function getLastInsertRowId() {
    return lastInsertedRowId;
}

/**
 * Query and return all matching rows as objects.
 */
function all(sql, params = []) {
    const stmt = db.prepare(sql);
    if (params.length > 0) stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
        rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
}

/**
 * Query and return the first matching row as an object.
 */
function get(sql, params = []) {
    const rows = all(sql, params);
    return rows.length > 0 ? rows[0] : null;
}

/**
 * Execute raw SQL (for transactions and multi-statement blocks).
 */
function exec(sql) {
    db.run(sql);
    if (!inTransaction) {
        saveDatabase();
    }
}

/**
 * Run a function within a transaction.
 * Rolls back on error.
 */
function transaction(fn) {
    inTransaction = true;
    db.run('BEGIN TRANSACTION;');
    try {
        const result = fn();
        db.run('COMMIT;');
        inTransaction = false;
        saveDatabase();
        return result;
    } catch (err) {
        try {
            db.run('ROLLBACK;');
        } catch (rollbackErr) {
            // Already rolled back
        }
        inTransaction = false;
        throw err;
    }
}

module.exports = {
    initDatabase,
    getDb,
    run,
    all,
    get,
    exec,
    transaction,
    getLastInsertRowId,
    saveDatabase
};
