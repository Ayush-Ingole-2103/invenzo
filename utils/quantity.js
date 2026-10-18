// ============================================
// Exact Quantity Handling — PRD Section 11.2
// ============================================

const WHOLE_UNITS = ['piece', 'pack', 'box', 'dozen'];
const MEASURED_UNITS = ['kg', 'litre'];

/**
 * Check if a unit is whole or measured
 * @param {string} unit 
 * @returns {boolean}
 */
function isWholeUnit(unit) {
    return WHOLE_UNITS.includes((unit || '').toLowerCase());
}

/**
 * Check if a unit is measured (supports decimal fractions)
 * @param {string} unit 
 * @returns {boolean}
 */
function isMeasuredUnit(unit) {
    return MEASURED_UNITS.includes((unit || '').toLowerCase());
}

/**
 * Parse a quantity string into integer thousandths (milli-units).
 * Example: "0.250" kg -> 250 milli
 *          "2" pieces -> 2000 milli
 * @param {string|number} input 
 * @param {string} unit 
 * @returns {number} milli-units
 */
function parseQuantityToMilli(input, unit = 'piece') {
    if (typeof input === 'number') {
        input = input.toString();
    }
    if (!input || typeof input !== 'string') return 0;
    
    let str = input.trim();
    const isNegative = str.startsWith('-');
    if (isNegative) {
        str = str.slice(1);
    }
    if (!/^\d+(\.\d{1,3})?$/.test(str)) {
        throw new Error(`Invalid quantity format: "${input}"`);
    }

    const parts = str.split('.');
    const whole = parseInt(parts[0] || '0', 10);
    let milli = 0;
    if (parts.length > 1) {
        if (isWholeUnit(unit) && parseInt(parts[1], 10) > 0) {
            throw new Error(`Fractional quantities are not allowed for unit "${unit}".`);
        }
        const dec = (parts[1] + '000').slice(0, 3);
        milli = parseInt(dec, 10);
    }
    
    const total = (whole * 1000) + milli;
    return isNegative ? -total : total;
}

/**
 * Format milli-units into a user-friendly decimal string.
 * Measured units omit trailing zeros (e.g. 2, 0.25, 1.5).
 * Whole units show as integer.
 * @param {number} milli 
 * @param {string} unit 
 * @param {boolean} includeUnit 
 * @returns {string}
 */
function formatQuantity(milli, unit = 'piece', includeUnit = false) {
    const val = Number(milli || 0) / 1000;
    let formatted;
    if (isWholeUnit(unit)) {
        formatted = Math.round(val).toString();
    } else {
        // Drop trailing zeroes
        formatted = parseFloat(val.toFixed(3)).toString();
    }
    return includeUnit ? `${formatted} ${unit}` : formatted;
}

module.exports = {
    WHOLE_UNITS,
    MEASURED_UNITS,
    isWholeUnit,
    isMeasuredUnit,
    parseQuantityToMilli,
    formatQuantity
};
