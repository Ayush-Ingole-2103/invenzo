// ============================================
// Rate Limiting Middleware
// ============================================
const rateLimit = require('express-rate-limit');

/**
 * Login-specific rate limiter — slows brute-force attempts.
 */
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // max 10 login attempts per window
    skip: () => process.env.NODE_ENV === 'test',
    message: {
        success: false,
        error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many login attempts. Please try again in a few minutes.'
        }
    },
    standardHeaders: true,
    legacyHeaders: false
});

/**
 * General API rate limiter.
 */
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    skip: () => process.env.NODE_ENV === 'test',
    message: {
        success: false,
        error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests. Please slow down.'
        }
    },
    standardHeaders: true,
    legacyHeaders: false
});

module.exports = { loginLimiter, apiLimiter };
