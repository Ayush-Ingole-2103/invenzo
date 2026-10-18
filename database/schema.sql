-- =======================================================
-- Stocker: Inventory and Billing Platform Database Schema
-- Version 5.0 | Multi-Store & Exact Integer Math
-- =======================================================

PRAGMA foreign_keys = ON;

-- =======================================================
-- PLATFORM TABLES (Developer Realm)
-- =======================================================

CREATE TABLE IF NOT EXISTS developers (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    username        TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash   TEXT NOT NULL,
    is_active       INTEGER NOT NULL DEFAULT 1,
    last_login_at   TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stores (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    store_code          TEXT NOT NULL UNIQUE,
    name                TEXT NOT NULL,
    owner_name          TEXT NOT NULL,
    phone               TEXT,
    email               TEXT,
    address             TEXT,
    city                TEXT,
    timezone            TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    status              TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'suspended')),
    suspended_reason    TEXT,
    created_by          INTEGER NOT NULL,
    created_at          TEXT DEFAULT (datetime('now')),
    updated_at          TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (created_by) REFERENCES developers(id)
);

CREATE TABLE IF NOT EXISTS vendor_users (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id            INTEGER NOT NULL UNIQUE,
    name                TEXT NOT NULL,
    username            TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash       TEXT NOT NULL,
    must_change_password INTEGER NOT NULL DEFAULT 1,
    is_active           INTEGER NOT NULL DEFAULT 1,
    last_login_at       TEXT,
    created_at          TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (store_id) REFERENCES stores(id)
);

CREATE TABLE IF NOT EXISTS developer_audit_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    developer_id    INTEGER,
    action          TEXT NOT NULL,
    store_id        INTEGER,
    details         TEXT,
    ip_address      TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (developer_id) REFERENCES developers(id),
    FOREIGN KEY (store_id) REFERENCES stores(id)
);

-- =======================================================
-- TENANT TABLES (Vendor Realm - Scoped by store_id)
-- =======================================================

CREATE TABLE IF NOT EXISTS categories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id    INTEGER NOT NULL,
    name        TEXT NOT NULL,
    is_active   INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (store_id) REFERENCES stores(id),
    UNIQUE (store_id, id),
    UNIQUE (store_id, name COLLATE NOCASE)
);

CREATE TABLE IF NOT EXISTS suppliers (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id    INTEGER NOT NULL,
    name        TEXT NOT NULL,
    phone       TEXT,
    email       TEXT,
    address     TEXT,
    is_active   INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (store_id) REFERENCES stores(id),
    UNIQUE (store_id, id)
);

CREATE TABLE IF NOT EXISTS products (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id                INTEGER NOT NULL,
    name                    TEXT NOT NULL,
    category_id             INTEGER NOT NULL,
    supplier_id             INTEGER,
    sku                     TEXT NOT NULL,
    price                   INTEGER NOT NULL CHECK(price >= 0),            -- paise per unit
    cost_price              INTEGER CHECK(cost_price >= 0),                 -- paise per unit
    quantity_milli          INTEGER NOT NULL DEFAULT 0 CHECK(quantity_milli >= 0), -- thousandths
    minimum_stock_milli     INTEGER NOT NULL DEFAULT 10000 CHECK(minimum_stock_milli >= 0),
    reorder_quantity_milli  INTEGER CHECK(reorder_quantity_milli > 0),
    unit                    TEXT NOT NULL DEFAULT 'piece' CHECK(unit IN ('piece','pack','box','dozen','kg','litre')),
    track_expiry            INTEGER NOT NULL DEFAULT 0,
    is_quick_item           INTEGER NOT NULL DEFAULT 0,
    product_type            TEXT NOT NULL DEFAULT 'packaged' CHECK(product_type IN ('packaged','loose')),
    package_size_milli      INTEGER DEFAULT 1000,
    hsn_code                TEXT,
    gst_rate_bps            INTEGER CHECK(gst_rate_bps >= 0),
    image                   TEXT,
    is_active               INTEGER NOT NULL DEFAULT 1,
    created_at              TEXT DEFAULT (datetime('now')),
    updated_at              TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (store_id) REFERENCES stores(id),
    FOREIGN KEY (store_id, category_id) REFERENCES categories(store_id, id),
    FOREIGN KEY (store_id, supplier_id) REFERENCES suppliers(store_id, id),
    UNIQUE (store_id, id),
    UNIQUE (store_id, sku COLLATE NOCASE)
);

CREATE TABLE IF NOT EXISTS customers (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id            INTEGER NOT NULL,
    name                TEXT NOT NULL,
    phone               TEXT,                                       -- Indian 10 digits
    credit_limit        INTEGER CHECK(credit_limit >= 0),          -- paise
    balance             INTEGER NOT NULL DEFAULT 0,                 -- paise owed by customer
    consent_recorded_at TEXT NOT NULL,
    is_active           INTEGER NOT NULL DEFAULT 1,
    erased_at           TEXT,
    created_at          TEXT DEFAULT (datetime('now')),
    updated_at          TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (store_id) REFERENCES stores(id),
    UNIQUE (store_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_phone_unique 
    ON customers(store_id, phone) WHERE phone IS NOT NULL;

CREATE TABLE IF NOT EXISTS customer_ledger (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id        INTEGER NOT NULL,
    customer_id     INTEGER NOT NULL,
    type            TEXT NOT NULL CHECK(type IN ('credit_sale','payment','writeoff','void_reversal')),
    amount_change   INTEGER NOT NULL CHECK(amount_change <> 0),     -- positive increases debt
    balance_after   INTEGER NOT NULL,
    payment_mode    TEXT CHECK(payment_mode IN ('cash','upi')),
    reference_id    INTEGER,
    note            TEXT,
    created_by      INTEGER NOT NULL,
    created_at      TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (store_id) REFERENCES stores(id),
    FOREIGN KEY (store_id, customer_id) REFERENCES customers(store_id, id),
    FOREIGN KEY (created_by) REFERENCES vendor_users(id),
    UNIQUE (store_id, id)
);

CREATE TABLE IF NOT EXISTS sales (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id            INTEGER NOT NULL,
    client_sale_id      TEXT NOT NULL,
    source              TEXT NOT NULL DEFAULT 'online' CHECK(source IN ('online','offline_sync')),
    financial_year      TEXT NOT NULL,
    bill_number         INTEGER,
    offline_ref         TEXT,
    document_type       TEXT NOT NULL DEFAULT 'bill' CHECK(document_type IN ('bill','bill_of_supply','tax_invoice')),
    customer_id         INTEGER,
    payment_mode        TEXT NOT NULL CHECK(payment_mode IN ('cash','upi','credit')),
    total_amount        INTEGER NOT NULL CHECK(total_amount > 0),   -- paise
    amount_paid         INTEGER NOT NULL CHECK(amount_paid >= 0 AND amount_paid <= total_amount),
    due_amount          INTEGER NOT NULL CHECK(due_amount = total_amount - amount_paid),
    total_taxable       INTEGER NOT NULL DEFAULT 0,
    total_cgst          INTEGER NOT NULL DEFAULT 0,
    total_sgst          INTEGER NOT NULL DEFAULT 0,
    status              TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('completed','voided')),
    voided_at           TEXT,
    void_reason         TEXT,
    needs_attention     INTEGER NOT NULL DEFAULT 0,
    attention_reason    TEXT,
    created_by          INTEGER NOT NULL,
    created_at          TEXT DEFAULT (datetime('now')),
    synced_at           TEXT,
    FOREIGN KEY (store_id) REFERENCES stores(id),
    FOREIGN KEY (store_id, customer_id) REFERENCES customers(store_id, id),
    FOREIGN KEY (created_by) REFERENCES vendor_users(id),
    UNIQUE (store_id, id),
    UNIQUE (store_id, client_sale_id),
    CHECK (bill_number IS NOT NULL OR offline_ref IS NOT NULL),
    CHECK (payment_mode = 'credit' OR due_amount = 0),
    CHECK (payment_mode <> 'credit' OR (due_amount > 0 AND customer_id IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_bill_number 
    ON sales(store_id, financial_year, bill_number) WHERE bill_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS sale_items (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id        INTEGER NOT NULL,
    sale_id         INTEGER NOT NULL,
    product_id      INTEGER NOT NULL,
    product_name    TEXT NOT NULL,
    unit            TEXT NOT NULL,
    quantity_milli  INTEGER NOT NULL CHECK(quantity_milli > 0),
    price           INTEGER NOT NULL CHECK(price >= 0),
    cost_price      INTEGER,
    subtotal        INTEGER NOT NULL CHECK(subtotal >= 0),
    hsn_code        TEXT,
    gst_rate_bps    INTEGER,
    taxable_value   INTEGER NOT NULL DEFAULT 0,
    cgst_amount     INTEGER NOT NULL DEFAULT 0,
    sgst_amount     INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (store_id) REFERENCES stores(id),
    FOREIGN KEY (store_id, sale_id) REFERENCES sales(store_id, id),
    FOREIGN KEY (store_id, product_id) REFERENCES products(store_id, id),
    UNIQUE (store_id, id)
);

CREATE TABLE IF NOT EXISTS stock_movements (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id                INTEGER NOT NULL,
    product_id              INTEGER NOT NULL,
    type                    TEXT NOT NULL CHECK(type IN ('restock','sale','adjustment','void_reversal')),
    quantity_change_milli   INTEGER NOT NULL CHECK(quantity_change_milli <> 0),
    quantity_after_milli    INTEGER NOT NULL CHECK(quantity_after_milli >= 0),
    reference_id            INTEGER,
    is_system               INTEGER NOT NULL DEFAULT 0,
    note                    TEXT,
    created_by              INTEGER NOT NULL,
    created_at              TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (store_id) REFERENCES stores(id),
    FOREIGN KEY (store_id, product_id) REFERENCES products(store_id, id),
    FOREIGN KEY (created_by) REFERENCES vendor_users(id),
    UNIQUE (store_id, id)
);

CREATE TABLE IF NOT EXISTS stock_batches (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id                INTEGER NOT NULL,
    product_id              INTEGER NOT NULL,
    batch_label             TEXT,
    expiry_date             TEXT NOT NULL,                           -- YYYY-MM-DD
    quantity_received_milli INTEGER NOT NULL CHECK(quantity_received_milli > 0),
    movement_id             INTEGER NOT NULL,
    created_by              INTEGER NOT NULL,
    created_at              TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (store_id) REFERENCES stores(id),
    FOREIGN KEY (store_id, product_id) REFERENCES products(store_id, id),
    FOREIGN KEY (store_id, movement_id) REFERENCES stock_movements(store_id, id),
    FOREIGN KEY (created_by) REFERENCES vendor_users(id),
    UNIQUE (store_id, id)
);

CREATE TABLE IF NOT EXISTS activity_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id        INTEGER NOT NULL,
    vendor_user_id  INTEGER,
    action          TEXT NOT NULL,
    entity_type     TEXT,
    entity_id       INTEGER,
    details         TEXT,
    ip_address      TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (store_id) REFERENCES stores(id),
    FOREIGN KEY (vendor_user_id) REFERENCES vendor_users(id),
    UNIQUE (store_id, id)
);

CREATE TABLE IF NOT EXISTS store_settings (
    store_id    INTEGER NOT NULL,
    key         TEXT NOT NULL,
    value       TEXT NOT NULL,
    updated_at  TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (store_id, key),
    FOREIGN KEY (store_id) REFERENCES stores(id)
);

-- =======================================================
-- DEVELOPER STATS VIEWS (Section 10.3)
-- =======================================================

CREATE VIEW IF NOT EXISTS dev_product_counts AS
    SELECT store_id, COUNT(*) AS product_count
    FROM products
    WHERE is_active = 1
    GROUP BY store_id;

CREATE VIEW IF NOT EXISTS dev_sales_facts AS
    SELECT store_id, created_at, status, total_amount
    FROM sales;

-- =======================================================
-- PERFORMANCE INDEXES (Section 10.4)
-- =======================================================

CREATE INDEX IF NOT EXISTS idx_prod_store_sku ON products(store_id, sku);
CREATE INDEX IF NOT EXISTS idx_prod_store_cat ON products(store_id, category_id);
CREATE INDEX IF NOT EXISTS idx_prod_store_sup ON products(store_id, supplier_id);
CREATE INDEX IF NOT EXISTS idx_prod_store_act ON products(store_id, is_active);
CREATE INDEX IF NOT EXISTS idx_prod_store_qk ON products(store_id, is_quick_item);
CREATE INDEX IF NOT EXISTS idx_cust_store_name ON customers(store_id, name);
CREATE INDEX IF NOT EXISTS idx_cust_ldg_store ON customer_ledger(store_id, customer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sales_store_date ON sales(store_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sales_store_stat ON sales(store_id, status);
CREATE INDEX IF NOT EXISTS idx_sales_store_cust ON sales(store_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_store_attn ON sales(store_id, needs_attention);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(store_id, sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_prod ON sale_items(store_id, product_id);
CREATE INDEX IF NOT EXISTS idx_stock_mov_store ON stock_movements(store_id, product_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_batches_exp ON stock_batches(store_id, product_id, expiry_date);
CREATE INDEX IF NOT EXISTS idx_act_logs_store ON activity_logs(store_id, created_at);
CREATE INDEX IF NOT EXISTS idx_dev_audit_date ON developer_audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_stores_status ON stores(status);

-- =======================================================
-- APPEND-ONLY TRIGGERS
-- =======================================================

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
