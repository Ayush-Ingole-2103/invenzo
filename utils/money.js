// ============================================
// Exact Money Arithmetic (Paise) — PRD Section 11.1
// ============================================

/**
 * Calculate line amount from quantity (in thousandths) and unit price (in paise).
 * Uses integer rounding half-up: floor((quantity_milli * price_paise + 500) / 1000)
 * @param {number|string|bigint} quantityMilli 
 * @param {number|string|bigint} pricePaise 
 * @returns {number} line amount in paise
 */
function calculateLineAmount(quantityMilli, pricePaise) {
    const q = BigInt(Math.round(Number(quantityMilli)));
    const p = BigInt(Math.round(Number(pricePaise)));
    const product = q * p;
    const rounded = (product + 500n) / 1000n;
    return Number(rounded);
}

/**
 * Format paise into Indian Rupees with symbol and Indian grouping.
 * Example: 12345650 -> "₹1,23,456.50"
 * @param {number} paise 
 * @param {boolean} trimZeroDecimals 
 * @returns {string}
 */
function formatRupees(paise, trimZeroDecimals = false) {
    const isNegative = paise < 0;
    const absPaise = Math.abs(Math.round(paise || 0));
    const rupees = Math.floor(absPaise / 100);
    const fraction = absPaise % 100;
    
    // Indian number format
    const formattedRupees = new Intl.NumberFormat('en-IN').format(rupees);
    
    if (trimZeroDecimals && fraction === 0) {
        return `${isNegative ? '-' : ''}₹${formattedRupees}`;
    }
    
    const fractionStr = fraction.toString().padStart(2, '0');
    return `${isNegative ? '-' : ''}₹${formattedRupees}.${fractionStr}`;
}

/**
 * Parse rupees string to integer paise.
 * Example: "125.50" -> 12550
 * @param {string|number} input 
 * @returns {number} paise
 */
function parseRupeesToPaise(input) {
    if (typeof input === 'number') {
        return Math.round(input * 100);
    }
    if (!input || typeof input !== 'string') return 0;
    const clean = input.replace(/[^\d.-]/g, '');
    const parts = clean.split('.');
    const whole = parseInt(parts[0] || '0', 10);
    let fraction = 0;
    if (parts.length > 1) {
        const dec = (parts[1] + '00').slice(0, 2);
        fraction = parseInt(dec, 10);
    }
    return (whole * 100) + (whole < 0 ? -fraction : fraction);
}

module.exports = {
    calculateLineAmount,
    formatRupees,
    parseRupeesToPaise
};
