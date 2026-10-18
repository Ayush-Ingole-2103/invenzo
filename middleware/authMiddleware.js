// ============================================
// Authentication & Realm Middleware — PRD 7.1 & 7.3
// ============================================
const { get } = require('../database/db');

/**
 * Middleware ensuring request is from an authenticated vendor user.
 * Enforces tenant isolation: sets req.storeId and req.vendorUserId.
 * Rejects suspended stores.
 */
function requireVendor(req, res, next) {
    if (!req.session || !req.session.vendorUser) {
        return res.status(401).json({
            success: false,
            error: {
                code: 'UNAUTHORIZED',
                message: 'Vendor authentication required.'
            }
        });
    }

    const storeId = req.session.vendorUser.store_id;
    const store = get('SELECT status, suspended_reason FROM stores WHERE id = ?', [storeId]);

    if (!store || store.status === 'suspended') {
        req.session.destroy();
        return res.status(403).json({
            success: false,
            error: {
                code: 'STORE_SUSPENDED',
                message: 'This store account is suspended. Contact the application provider.'
            }
        });
    }

    req.storeId = storeId;
    req.vendorUserId = req.session.vendorUser.id;
    next();
}

/**
 * Middleware ensuring request is from an authenticated platform developer.
 */
function requireDeveloper(req, res, next) {
    if (!req.session || !req.session.developer) {
        return res.status(401).json({
            success: false,
            error: {
                code: 'UNAUTHORIZED',
                message: 'Developer authentication required.'
            }
        });
    }

    req.developerId = req.session.developer.id;
    next();
}

module.exports = {
    requireVendor,
    requireDeveloper,
    // Legacy alias
    requireAuth: requireVendor
};
