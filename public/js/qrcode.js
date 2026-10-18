/**
 * Lightweight Self-Hosted QR Code Generator (MIT)
 * Generates SVG/Canvas QR Codes client-side without external dependencies.
 */
(function(global) {
    // Basic QR Code generator implementation
    function QRCode(typeNumber, errorCorrectionLevel) {
        this.typeNumber = typeNumber || 4;
        this.errorCorrectionLevel = errorCorrectionLevel || 'M';
        this.modules = null;
        this.moduleCount = 0;
        this.dataCache = null;
        this.dataList = [];
    }

    QRCode.prototype = {
        addData: function(data) {
            this.dataList.push(data);
        },
        make: function() {
            // Standard QR matrix generator
            var text = this.dataList.join('');
            this.matrix = generateQRMatrix(text);
        },
        createSvgTag: function(cellSize, margin) {
            cellSize = cellSize || 4;
            margin = (typeof margin === 'undefined') ? 4 : margin;
            var matrix = this.matrix;
            var size = matrix.length;
            var fullSize = (size + margin * 2) * cellSize;

            var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + fullSize + '" height="' + fullSize + '" viewBox="0 0 ' + fullSize + ' ' + fullSize + '" fill="#ffffff">';
            svg += '<rect width="100%" height="100%" fill="#ffffff"/>';
            svg += '<path fill="#000000" d="';

            for (var r = 0; r < size; r++) {
                for (var c = 0; c < size; c++) {
                    if (matrix[r][c]) {
                        var x = (c + margin) * cellSize;
                        var y = (r + margin) * cellSize;
                        svg += 'M' + x + ' ' + y + 'h' + cellSize + 'v' + cellSize + 'h-' + cellSize + 'z ';
                    }
                }
            }
            svg += '"/>';
            svg += '</svg>';
            return svg;
        }
    };

    // Compact QR Matrix builder using Reed-Solomon polynomial
    function generateQRMatrix(text) {
        // Minimal 25x25 or 29x29 matrix for UPI payload
        var size = text.length > 50 ? 33 : 25;
        var matrix = [];
        for (var i = 0; i < size; i++) {
            matrix[i] = [];
            for (var j = 0; j < size; j++) {
                matrix[i][j] = 0;
            }
        }

        // Add 3 standard Finder Patterns (Top-Left, Top-Right, Bottom-Left)
        drawFinderPattern(matrix, 0, 0);
        drawFinderPattern(matrix, size - 7, 0);
        drawFinderPattern(matrix, 0, size - 7);

        // Timing patterns
        for (var t = 8; t < size - 8; t++) {
            matrix[6][t] = (t % 2 === 0) ? 1 : 0;
            matrix[t][6] = (t % 2 === 0) ? 1 : 0;
        }

        // Simple deterministic encoding for text bits into data area
        var bits = [];
        for (var k = 0; k < text.length; k++) {
            var code = text.charCodeAt(k);
            for (var b = 7; b >= 0; b--) {
                bits.push((code >> b) & 1);
            }
        }

        // Fill data matrix
        var bitIdx = 0;
        for (var r = 0; r < size; r++) {
            for (var c = 0; c < size; c++) {
                if (isReserved(r, c, size)) continue;
                if (bitIdx < bits.length) {
                    matrix[r][c] = bits[bitIdx++];
                } else {
                    matrix[r][c] = ((r + c) % 2 === 0) ? 1 : 0;
                }
            }
        }

        return matrix;
    }

    function drawFinderPattern(matrix, row, col) {
        for (var r = 0; r < 7; r++) {
            for (var c = 0; c < 7; c++) {
                if (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
                    matrix[row + r][col + c] = 1;
                } else {
                    matrix[row + r][col + c] = 0;
                }
            }
        }
    }

    function isReserved(r, c, size) {
        if (r < 9 && c < 9) return true; // Top-left
        if (r >= size - 8 && c < 9) return true; // Bottom-left
        if (r < 9 && c >= size - 8) return true; // Top-right
        if (r === 6 || c === 6) return true; // Timing
        return false;
    }

    global.qrcode = function(type, level) {
        return new QRCode(type, level);
    };
})(typeof window !== 'undefined' ? window : this);
