// ============================================
// Developer Statistics Service — PRD Section 17.4
// Reads only from: stores, vendor_users (last_login_at), dev_product_counts, dev_sales_facts
// ============================================
const db = require('../../database/db');

/**
 * Get platform overview metrics
 */
function getPlatformOverview() {
    const storesSummary = db.get(`
        SELECT
            COUNT(id) as total_stores,
            COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) as active_stores,
            COALESCE(SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END), 0) as suspended_stores
        FROM stores
    `);

    const productCounts = db.get(`
        SELECT COALESCE(SUM(product_count), 0) as total_products
        FROM dev_product_counts
    `);

    const salesFacts = db.get(`
        SELECT
            COALESCE(SUM(CASE WHEN status = 'completed' THEN total_amount ELSE 0 END), 0) as total_billed,
            COUNT(CASE WHEN status = 'completed' THEN 1 ELSE NULL END) as total_sales
        FROM dev_sales_facts
    `);

    // Sales this week, month, year
    const now = new Date();
    // Monday of current week
    const day = now.getDay();
    const diffToMonday = (day === 0 ? -6 : 1) - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);
    const mondayStr = monday.toISOString().split('T')[0] + ' 00:00:00';

    const monthStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-01 00:00:00`;
    const yearStr = `${now.getFullYear()}-01-01 00:00:00`;

    const salesPeriod = db.get(`
        SELECT
            COUNT(CASE WHEN status = 'completed' AND created_at >= ? THEN 1 ELSE NULL END) as sales_this_week,
            COUNT(CASE WHEN status = 'completed' AND created_at >= ? THEN 1 ELSE NULL END) as sales_this_month,
            COUNT(CASE WHEN status = 'completed' AND created_at >= ? THEN 1 ELSE NULL END) as sales_this_year
        FROM dev_sales_facts
    `, [mondayStr, monthStr, yearStr]);

    return {
        totalStores: storesSummary?.total_stores || 0,
        activeStores: storesSummary?.active_stores || 0,
        suspendedStores: storesSummary?.suspended_stores || 0,
        totalProducts: productCounts?.total_products || 0,
        totalBilled: salesFacts?.total_billed || 0,
        totalSales: salesFacts?.total_sales || 0,
        salesThisWeek: salesPeriod?.sales_this_week || 0,
        salesThisMonth: salesPeriod?.sales_this_month || 0,
        salesThisYear: salesPeriod?.sales_this_year || 0
    };
}

/**
 * Get statistics for a specific store
 */
function getStoreStats(storeId) {
    const prodRow = db.get('SELECT product_count FROM dev_product_counts WHERE store_id = ?', [storeId]);
    const productCount = prodRow?.product_count || 0;

    const salesFacts = db.get(`
        SELECT COALESCE(SUM(CASE WHEN status = 'completed' THEN total_amount ELSE 0 END), 0) as total_billed
        FROM dev_sales_facts
        WHERE store_id = ?
    `, [storeId]);

    const now = new Date();
    const day = now.getDay();
    const diffToMonday = (day === 0 ? -6 : 1) - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);
    const mondayStr = monday.toISOString().split('T')[0] + ' 00:00:00';

    const monthStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-01 00:00:00`;
    const yearStr = `${now.getFullYear()}-01-01 00:00:00`;

    const salesPeriod = db.get(`
        SELECT
            COUNT(CASE WHEN status = 'completed' AND created_at >= ? THEN 1 ELSE NULL END) as sales_this_week,
            COUNT(CASE WHEN status = 'completed' AND created_at >= ? THEN 1 ELSE NULL END) as sales_this_month,
            COUNT(CASE WHEN status = 'completed' AND created_at >= ? THEN 1 ELSE NULL END) as sales_this_year
        FROM dev_sales_facts
        WHERE store_id = ?
    `, [mondayStr, monthStr, yearStr, storeId]);

    // Monthly series (last 12 months)
    const series = db.all(`
        SELECT strftime('%Y-%m', created_at) as label, COUNT(*) as salesCount
        FROM dev_sales_facts
        WHERE store_id = ? AND status = 'completed'
        GROUP BY label
        ORDER BY label DESC
        LIMIT 12
    `, [storeId]);

    return {
        storeId,
        productCount,
        totalBilled: salesFacts?.total_billed || 0,
        salesThisWeek: salesPeriod?.sales_this_week || 0,
        salesThisMonth: salesPeriod?.sales_this_month || 0,
        salesThisYear: salesPeriod?.sales_this_year || 0,
        series: series.reverse()
    };
}

module.exports = {
    getPlatformOverview,
    getStoreStats
};
