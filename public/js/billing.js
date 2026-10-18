// ============================================
// Counter Billing Screen — PRD Section 12.4
// ============================================

let billingCatalog = [];
let billingCustomers = [];
let cart = []; // { product, quantity, quantityMilli, subtotal }
let currentClientSaleId = null;
let heldBills = [];

function formatRupees(paise, trimZeroDecimals = false) {
    const isNegative = paise < 0;
    const absPaise = Math.abs(Math.round(paise || 0));
    const rupees = Math.floor(absPaise / 100);
    const fraction = absPaise % 100;
    const formattedRupees = new Intl.NumberFormat('en-IN').format(rupees);
    if (trimZeroDecimals && fraction === 0) {
        return `${isNegative ? '-' : ''}₹${formattedRupees}`;
    }
    const fractionStr = fraction.toString().padStart(2, '0');
    return `${isNegative ? '-' : ''}₹${formattedRupees}.${fractionStr}`;
}

function showToast(message, type = 'info') {
    if (window.App && typeof window.App.toast === 'function') {
        window.App.toast(message, type);
    }
}

function closeModal() {
    const modal = document.getElementById('modalContainer');
    if (modal) modal.innerHTML = '';
}

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

async function initBillingScreen() {
    currentClientSaleId = generateUUID();
    cart = [];
    loadHeldBillsFromStorage();

    const container = document.getElementById('pageContent');
    container.innerHTML = `
        <div class="billing-container">
            <!-- Left: Catalog & Quick Tiles -->
            <div class="catalog-panel">
                <div class="panel" style="padding: 1rem; margin-bottom: 0;">
                    <div class="form-group" style="margin-bottom: 0.75rem;">
                        <input type="text" id="billingSearchInput" class="form-input"
                               placeholder="Search product name, SKU, or scan barcode (press Enter)..."
                               autocomplete="off" autofocus style="min-height: 48px; font-size: 1rem;">
                    </div>
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
                        <span style="font-size: 0.8125rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase;">Quick Items</span>
                        <span id="quickItemCount" style="font-size: 0.75rem; color: var(--text-muted);"></span>
                    </div>
                    <div class="quick-tiles-grid" id="quickTilesGrid">
                        <div class="empty-state" style="padding: 1.5rem;">Loading catalog...</div>
                    </div>
                </div>
            </div>

            <!-- Right: Cart Panel -->
            <div class="panel cart-panel">
                <div class="cart-header">
                    <div>
                        <h3 class="panel-title" style="margin-bottom: 2px;">Current Bill</h3>
                        <span id="cartCountSubtitle" style="font-size: 0.8125rem; color: var(--text-muted);">0 items</span>
                    </div>
                    <div style="display: flex; gap: 0.5rem;">
                        <button class="btn btn-sm btn-secondary" id="btnHeldBills" title="View held bills">
                            Held (${heldBills.length})
                        </button>
                        <button class="btn btn-sm btn-secondary" id="btnHoldCurrent" title="Hold current bill" ${cart.length === 0 ? 'disabled' : ''}>
                            Hold
                        </button>
                        <button class="btn btn-sm btn-secondary" id="btnClearCart" title="Clear cart" ${cart.length === 0 ? 'disabled' : ''}>
                            Clear
                        </button>
                    </div>
                </div>

                <div class="cart-items-list" id="cartItemsList">
                    <div class="empty-state">
                        <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 0.5rem; opacity: 0.5;">
                            <circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>
                        </svg>
                        <p>Cart is empty. Tap a quick item or scan a barcode.</p>
                    </div>
                </div>

                <div class="cart-footer">
                    <div class="total-summary-row">
                        <span class="total-summary-label">Total to pay</span>
                        <span class="total-summary-amount" id="cartTotalDisplay">₹0.00</span>
                    </div>
                    <button class="btn btn-primary" id="btnCompleteBill" style="width: 100%; min-height: 48px; font-size: 1.05rem;" disabled>
                        Complete bill
                    </button>
                </div>
            </div>
        </div>
    `;

    // Fetch catalog & customers in parallel
    await Promise.all([fetchBillingCatalog(), fetchBillingCustomers()]);
    setupBillingEventListeners();
}

async function fetchBillingCatalog() {
    try {
        const res = await fetch('/api/billing/catalog');
        const data = await res.json();
        if (data.success) {
            billingCatalog = data.data.products || [];
            renderQuickTiles();
        }
    } catch (e) {
        console.error('Failed to load billing catalog:', e);
    }
}

async function fetchBillingCustomers() {
    try {
        const res = await fetch('/api/billing/customers');
        const data = await res.json();
        if (data.success) {
            billingCustomers = data.data || [];
        }
    } catch (e) {
        console.error('Failed to load billing customers:', e);
    }
}

function renderQuickTiles(filterText = '') {
    const grid = document.getElementById('quickTilesGrid');
    if (!grid) return;

    let items = billingCatalog;
    if (filterText) {
        const query = filterText.toLowerCase();
        items = billingCatalog.filter(p =>
            p.name.toLowerCase().includes(query) ||
            p.sku.toLowerCase().includes(query) ||
            (p.category && p.category.toLowerCase().includes(query))
        );
    } else {
        // By default show quick items, or first 24 items
        const quickItems = billingCatalog.filter(p => p.quick);
        items = quickItems.length > 0 ? quickItems : billingCatalog.slice(0, 24);
    }

    document.getElementById('quickItemCount').textContent = `${items.length} items`;

    if (items.length === 0) {
        grid.innerHTML = '<div class="empty-state" style="padding: 1.5rem; grid-column: 1 / -1;">No matching products found.</div>';
        return;
    }

    grid.innerHTML = items.map(p => {
        let typeBadge = '';
        if (p.unit === 'kg' || p.unit === 'litre') {
            if (p.product_type === 'loose') {
                typeBadge = `<span class="tile-badge loose-badge">Loose / Weighed</span>`;
            } else {
                typeBadge = `<span class="tile-badge pack-badge">${formatPackWeight(p.package_size || 1, p.unit)} Pack</span>`;
            }
        }
        return `
            <button type="button" class="quick-tile" onclick="addItemToCart(${p.id})">
                <span class="tile-name">${p.name}</span>
                ${typeBadge}
                <span class="tile-price">${p.price_display} / ${p.unit}</span>
            </button>
        `;
    }).join('');
}

function formatPackWeight(size, unit) {
    const s = Number(size);
    if (unit === 'kg') {
        if (s < 1) return `${Math.round(s * 1000)}g`;
        return `${s}kg`;
    }
    if (unit === 'litre') {
        if (s < 1) return `${Math.round(s * 1000)}ml`;
        return `${s}L`;
    }
    return `${s} ${unit}`;
}

function addItemToCart(productId) {
    const prod = billingCatalog.find(p => p.id === productId);
    if (!prod) return;

    const isMeasured = prod.unit === 'kg' || prod.unit === 'litre';
    const isLoose = prod.product_type === 'loose';
    const fixedPackSize = (prod.package_size_milli || 1000) / 1000;
    const defaultPackSize = isLoose ? 1.000 : (prod.package_size || fixedPackSize || 1.000);

    const existingIndex = cart.findIndex(c => c.product.id === productId);
    if (existingIndex >= 0) {
        cart[existingIndex].packCount = (cart[existingIndex].packCount || 1) + 1;
        cart[existingIndex].packSize = cart[existingIndex].packSize || defaultPackSize;
        cart[existingIndex].quantity = Number((cart[existingIndex].packCount * cart[existingIndex].packSize).toFixed(3));
        cart[existingIndex].quantityMilli = Math.round(cart[existingIndex].quantity * 1000);
        cart[existingIndex].subtotal = Number((BigInt(cart[existingIndex].quantityMilli) * BigInt(prod.price) + 500n) / 1000n);
    } else {
        const packCount = 1;
        const packSize = defaultPackSize;
        const quantity = Number((packCount * packSize).toFixed(3));
        const qMilli = Math.round(quantity * 1000);
        const subtotal = Number((BigInt(qMilli) * BigInt(prod.price) + 500n) / 1000n);
        cart.push({
            product: prod,
            packCount: packCount,
            packSize: packSize,
            quantity: quantity,
            quantityMilli: qMilli,
            subtotal: subtotal
        });
    }

    renderCart();

    // Re-focus search input for rapid counter entry
    const searchInput = document.getElementById('billingSearchInput');
    if (searchInput) {
        searchInput.value = '';
        renderQuickTiles('');
        searchInput.focus();
    }
}

function updatePackCount(index, newCount) {
    const count = parseInt(newCount, 10);
    if (isNaN(count) || count <= 0) {
        cart.splice(index, 1);
    } else {
        const item = cart[index];
        if (!item) return;
        const isLoose = item.product.product_type === 'loose';
        const fixedPackSize = (item.product.package_size_milli || 1000) / 1000;
        item.packCount = count;
        item.packSize = item.packSize || (isLoose ? 1.000 : (item.product.package_size || fixedPackSize || 1.000));
        item.quantity = Number((item.packCount * item.packSize).toFixed(3));
        item.quantityMilli = Math.round(item.quantity * 1000);
        item.subtotal = Number((BigInt(item.quantityMilli) * BigInt(item.product.price) + 500n) / 1000n);
    }
    renderCart();
}

function updatePackSize(index, newSize) {
    const size = parseFloat(newSize);
    if (isNaN(size) || size <= 0) return;
    const item = cart[index];
    if (!item) return;
    item.packSize = Number(size.toFixed(3));
    item.packCount = item.packCount || 1;
    item.quantity = Number((item.packCount * item.packSize).toFixed(3));
    item.quantityMilli = Math.round(item.quantity * 1000);
    item.subtotal = Number((BigInt(item.quantityMilli) * BigInt(item.product.price) + 500n) / 1000n);
    renderCart();
}

function stepPackSize(index, delta) {
    const item = cart[index];
    if (!item) return;
    const current = item.packSize || 1.0;
    const next = Math.max(0.05, Math.round((current + delta) * 100) / 100);
    updatePackSize(index, next);
}

function removeCartItem(index) {
    cart.splice(index, 1);
    renderCart();
}

function updateCartQuantity(index, newQty) {
    // Backwards-compatible fallback
    updatePackSize(index, newQty);
}

function renderCart() {
    const list = document.getElementById('cartItemsList');
    const totalDisplay = document.getElementById('cartTotalDisplay');
    const completeBtn = document.getElementById('btnCompleteBill');
    const holdBtn = document.getElementById('btnHoldCurrent');
    const clearBtn = document.getElementById('btnClearCart');
    const countSub = document.getElementById('cartCountSubtitle');

    if (!list) return;

    if (cart.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <p>Cart is empty. Tap a quick item or scan a barcode.</p>
            </div>
        `;
        totalDisplay.textContent = '₹0.00';
        completeBtn.disabled = true;
        holdBtn.disabled = true;
        clearBtn.disabled = true;
        countSub.textContent = '0 items';
        return;
    }

    let totalPaise = 0;
    cart.forEach(item => totalPaise += item.subtotal);

    countSub.textContent = `${cart.length} item${cart.length > 1 ? 's' : ''}`;
    totalDisplay.textContent = formatRupees(totalPaise);
    completeBtn.disabled = false;
    holdBtn.disabled = false;
    clearBtn.disabled = false;

    list.innerHTML = cart.map((item, idx) => {
        const isMeasured = item.product.unit === 'kg' || item.product.unit === 'litre';
        const isLoose = item.product.product_type === 'loose';
        const fixedPackSize = (item.product.package_size_milli || 1000) / 1000;
        item.packCount = item.packCount || 1;
        item.packSize = item.packSize !== undefined ? item.packSize : (isLoose ? 1.0 : (item.product.package_size || fixedPackSize || 1.0));

        let controlsHtml = '';

        if (!isMeasured) {
            // Count-based items (pieces, bottles, packets, boxes, etc.)
            controlsHtml = `
                <div class="cart-item-controls-single">
                    <div class="cart-control-group">
                        <span class="cart-control-label">Qty (${item.product.unit})</span>
                        <div class="cart-qty-ctrls">
                            <button type="button" class="qty-btn" onclick="updatePackCount(${idx}, ${item.packCount - 1})" title="Decrease quantity">&minus;</button>
                            <input type="number" class="cart-qty-input" min="1" step="1"
                                   value="${item.packCount}"
                                   onchange="updatePackCount(${idx}, parseInt(this.value, 10) || 1)">
                            <button type="button" class="qty-btn" onclick="updatePackCount(${idx}, ${item.packCount + 1})" title="Increase quantity">&plus;</button>
                        </div>
                    </div>
                </div>
            `;
        } else if (!isLoose) {
            // Packaged item with FIXED pack size (e.g. 500g, 1kg pack)
            controlsHtml = `
                <div class="cart-item-controls-dual" style="justify-content: space-between;">
                    <div class="cart-control-group">
                        <span class="cart-control-label">Packs</span>
                        <div class="cart-qty-ctrls">
                            <button type="button" class="qty-btn" onclick="updatePackCount(${idx}, ${item.packCount - 1})" title="Decrease packs">&minus;</button>
                            <input type="number" class="cart-qty-input" min="1" step="1"
                                   value="${item.packCount}"
                                   onchange="updatePackCount(${idx}, parseInt(this.value, 10) || 1)">
                            <button type="button" class="qty-btn" onclick="updatePackCount(${idx}, ${item.packCount + 1})" title="Increase packs">&plus;</button>
                        </div>
                    </div>

                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <span class="cart-badge-pack" style="background: var(--surface); border: 1px solid var(--border); padding: 0.25rem 0.5rem; border-radius: var(--radius-control); font-size: 0.75rem; font-weight: 600; color: var(--text);">
                            Pack: ${formatPackWeight(item.packSize, item.product.unit)}
                        </span>
                    </div>
                </div>

                <div class="cart-item-breakdown-row">
                    <div class="cart-item-calc">
                        <span>${item.packCount} pack${item.packCount > 1 ? 's' : ''} &times; ${formatPackWeight(item.packSize, item.product.unit)} = <strong>${item.quantity.toFixed(3)} ${item.product.unit}</strong></span>
                    </div>
                    <span style="font-size: 0.6875rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">
                        Packaged Product
                    </span>
                </div>
            `;
        } else {
            // Open / Loose item (can be sold in ANY decimal quantity like 1.75 kg)
            controlsHtml = `
                <div class="cart-item-controls-dual">
                    <div class="cart-control-group">
                        <span class="cart-control-label">Bags / Packs</span>
                        <div class="cart-qty-ctrls">
                            <button type="button" class="qty-btn" onclick="updatePackCount(${idx}, ${item.packCount - 1})" title="Decrease packs">&minus;</button>
                            <input type="number" class="cart-qty-input" min="1" step="1"
                                   value="${item.packCount}"
                                   onchange="updatePackCount(${idx}, parseInt(this.value, 10) || 1)">
                            <button type="button" class="qty-btn" onclick="updatePackCount(${idx}, ${item.packCount + 1})" title="Increase packs">&plus;</button>
                        </div>
                    </div>

                    <div class="cart-control-group">
                        <span class="cart-control-label">Weight (${item.product.unit})</span>
                        <div class="cart-qty-ctrls">
                            <button type="button" class="qty-btn" onclick="stepPackSize(${idx}, -0.25)" title="Decrease weight">&minus;</button>
                            <input type="number" class="cart-qty-input weight-input" min="0.001" step="0.05"
                                   value="${item.packSize}"
                                   placeholder="e.g. 1.75"
                                   onchange="updatePackSize(${idx}, parseFloat(this.value) || 0)">
                            <button type="button" class="qty-btn" onclick="stepPackSize(${idx}, 0.25)" title="Increase weight">&plus;</button>
                        </div>
                    </div>
                </div>

                <div class="cart-item-breakdown-row">
                    <div class="cart-item-calc">
                        <span>${item.packCount > 1 ? `${item.packCount} &times; ` : ''}${item.packSize.toFixed(3)} ${item.product.unit} = <strong>${item.quantity.toFixed(3)} ${item.product.unit}</strong></span>
                    </div>
                    <div class="preset-pad">
                        <span class="preset-chip ${Math.abs(item.packSize - 0.25) < 0.001 ? 'active' : ''}" onclick="updatePackSize(${idx}, 0.25)">250g</span>
                        <span class="preset-chip ${Math.abs(item.packSize - 0.5) < 0.001 ? 'active' : ''}" onclick="updatePackSize(${idx}, 0.5)">500g</span>
                        <span class="preset-chip ${Math.abs(item.packSize - 1.0) < 0.001 ? 'active' : ''}" onclick="updatePackSize(${idx}, 1.0)">1kg</span>
                        <span class="preset-chip ${Math.abs(item.packSize - 1.5) < 0.001 ? 'active' : ''}" onclick="updatePackSize(${idx}, 1.5)">1.5kg</span>
                        <span class="preset-chip ${Math.abs(item.packSize - 1.75) < 0.001 ? 'active' : ''}" onclick="updatePackSize(${idx}, 1.75)">1.75kg</span>
                        <span class="preset-chip ${Math.abs(item.packSize - 2.0) < 0.001 ? 'active' : ''}" onclick="updatePackSize(${idx}, 2.0)">2kg</span>
                    </div>
                </div>
            `;
        }

        return `
            <div class="cart-item-row">
                <div class="cart-item-main">
                    <div class="cart-item-header">
                        <div class="cart-item-title-wrap">
                            <div style="display: flex; align-items: center; gap: 0.375rem; flex-wrap: wrap;">
                                <span class="cart-item-name" title="${item.product.name}">${item.product.name}</span>
                                ${isLoose ? `<span class="tile-badge loose-badge" style="margin-bottom:0; font-size:0.625rem;">Open / Loose</span>` : (isMeasured ? `<span class="tile-badge pack-badge" style="margin-bottom:0; font-size:0.625rem;">${formatPackWeight(item.packSize, item.product.unit)} Pack</span>` : '')}
                            </div>
                            <span class="cart-item-rate">${formatRupees(item.product.price)} / ${item.product.unit}</span>
                        </div>
                        <div class="cart-item-total-wrap">
                            <span class="cart-item-subtotal">${formatRupees(item.subtotal)}</span>
                            <button type="button" class="cart-remove-btn" onclick="removeCartItem(${idx})" title="Remove item">&times;</button>
                        </div>
                    </div>

                    ${controlsHtml}
                </div>
            </div>
        `;
    }).join('');
}

function setupBillingEventListeners() {
    const searchInput = document.getElementById('billingSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            renderQuickTiles(e.target.value);
        });

        // Exact match on enter -> add immediately (e.g. barcode scanner)
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const val = searchInput.value.trim().toLowerCase();
                const match = billingCatalog.find(p => p.sku.toLowerCase() === val || p.name.toLowerCase() === val);
                if (match) {
                    addItemToCart(match.id);
                }
            }
        });
    }

    document.getElementById('btnClearCart').addEventListener('click', () => {
        if (confirm('Clear current bill cart?')) {
            cart = [];
            currentClientSaleId = generateUUID();
            renderCart();
        }
    });

    document.getElementById('btnHoldCurrent').addEventListener('click', () => {
        if (cart.length === 0) return;
        if (heldBills.length >= 5) {
            alert('Maximum 5 held bills reached. Resume or complete a held bill first.');
            return;
        }
        heldBills.push({
            clientSaleId: currentClientSaleId,
            items: [...cart],
            heldAt: new Date().toLocaleTimeString()
        });
        saveHeldBillsToStorage();
        cart = [];
        currentClientSaleId = generateUUID();
        renderCart();
        document.getElementById('btnHeldBills').textContent = `Held (${heldBills.length})`;
        showToast('Bill held.');
    });

    document.getElementById('btnHeldBills').addEventListener('click', showHeldBillsModal);
    document.getElementById('btnCompleteBill').addEventListener('click', showPaymentModal);
}

function loadHeldBillsFromStorage() {
    try {
        const stored = localStorage.getItem('stocker_held_bills');
        heldBills = stored ? JSON.parse(stored) : [];
        heldBills.forEach(b => {
            if (Array.isArray(b.items)) {
                b.items.forEach(it => {
                    if (!it.packCount) it.packCount = 1;
                    if (!it.packSize) it.packSize = it.quantity || 1;
                });
            }
        });
    } catch {
        heldBills = [];
    }
}

function saveHeldBillsToStorage() {
    localStorage.setItem('stocker_held_bills', JSON.stringify(heldBills));
}

function showHeldBillsModal() {
    const modal = document.getElementById('modalContainer');
    if (!modal) return;
    modal.innerHTML = `
        <div class="modal-overlay active" onclick="if(event.target===this)closeModal()">
            <div class="modal-card" style="max-width: 600px;">
                <div class="modal-header">
                    <h3 class="modal-title">Held Bills (${heldBills.length})</h3>
                    <button class="btn btn-sm btn-secondary modal-close" onclick="closeModal()">&times;</button>
                </div>
                <div style="max-height: 400px; overflow-y: auto; padding: 0.5rem 0;">
                    ${heldBills.length === 0 ? `
                        <div class="empty-state" style="padding: 2rem 1rem; text-align: center;">
                            <p style="color: var(--text-muted); font-size: 0.9375rem;">No held bills currently. Click "Hold" while building a cart to hold it for later.</p>
                        </div>
                    ` : `
                        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                            ${heldBills.map((b, idx) => {
                                let total = 0;
                                b.items.forEach(it => total += it.subtotal);
                                const itemSummary = b.items.map(it => `${it.product.name} (${it.quantity} ${it.product.unit})`).join(', ');
                                return `
                                    <div class="panel" style="background: var(--surface-sunken); border: 1px solid var(--border); border-radius: var(--radius-control); padding: 0.875rem; display: flex; flex-direction: column; gap: 0.5rem;">
                                        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem;">
                                            <div>
                                                <div style="display: flex; align-items: center; gap: 0.5rem;">
                                                    <strong style="color: var(--text); font-size: 0.9375rem;">Held Bill #${idx + 1}</strong>
                                                    <span style="font-size: 0.75rem; color: var(--text-muted); background: var(--surface); padding: 2px 8px; border-radius: 9999px; border: 1px solid var(--border);">${b.heldAt}</span>
                                                </div>
                                                <div style="font-size: 0.8125rem; color: var(--text-muted); margin-top: 0.25rem; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;" title="${itemSummary}">
                                                    ${itemSummary}
                                                </div>
                                            </div>
                                            <div style="text-align: right; white-space: nowrap;">
                                                <div style="font-size: 1.125rem; font-weight: 700; color: var(--accent);">${formatRupees(total)}</div>
                                                <div style="font-size: 0.75rem; color: var(--text-muted);">${b.items.length} item${b.items.length > 1 ? 's' : ''}</div>
                                            </div>
                                        </div>
                                        <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.25rem;">
                                            <button class="btn btn-sm btn-secondary" onclick="discardHeldBill(${idx})" style="color: var(--danger);" title="Discard this held bill">
                                                Discard
                                            </button>
                                            <button class="btn btn-sm btn-primary" onclick="resumeHeldBill(${idx})" title="Load back into current cart">
                                                Resume Bill
                                            </button>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    `}
                </div>
                <div class="modal-footer" style="margin-top: 1rem; display: flex; justify-content: flex-end;">
                    <button class="btn btn-secondary btn-sm" onclick="closeModal()">Close</button>
                </div>
            </div>
        </div>
    `;
}

function resumeHeldBill(index) {
    if (cart.length > 0) {
        if (!confirm('Cart has items. Replace current cart with resumed bill?')) return;
    }
    const resumed = heldBills.splice(index, 1)[0];
    saveHeldBillsToStorage();
    cart = resumed.items;
    currentClientSaleId = resumed.clientSaleId;
    closeModal();
    renderCart();
    document.getElementById('btnHeldBills').textContent = `Held (${heldBills.length})`;
}

function discardHeldBill(index) {
    if (confirm('Discard this held bill?')) {
        heldBills.splice(index, 1);
        saveHeldBillsToStorage();
        showHeldBillsModal();
        document.getElementById('btnHeldBills').textContent = `Held (${heldBills.length})`;
    }
}

// Payment Choice & Completion Modal
function showPaymentModal() {
    if (cart.length === 0) return;

    let totalPaise = 0;
    cart.forEach(it => totalPaise += it.subtotal);

    const modal = document.getElementById('modalContainer');
    if (!modal) return;
    modal.innerHTML = `
        <div class="modal-overlay active" onclick="if(event.target===this)closeModal()">
            <div class="modal-card">
                <div class="modal-header">
                    <h3 class="modal-title">Complete Bill</h3>
                    <button class="btn btn-sm btn-secondary modal-close" onclick="closeModal()">&times;</button>
                </div>

                <div style="text-align: center; margin-bottom: 1.25rem;">
                    <div style="font-size: 0.875rem; color: var(--text-muted);">Total Payable</div>
                    <div style="font-size: 2rem; font-weight: 700; color: var(--accent); font-variant-numeric: tabular-nums;">
                        ${formatRupees(totalPaise)}
                    </div>
                </div>

                <!-- Payment Mode Selector -->
                <div class="nav-tabs" style="justify-content: center; margin-bottom: 1.25rem;">
                    <button type="button" class="tab-btn active" id="tabModeCash" onclick="selectPaymentMode('cash')">Cash</button>
                    <button type="button" class="tab-btn" id="tabModeUpi" onclick="selectPaymentMode('upi')">UPI</button>
                    <button type="button" class="tab-btn" id="tabModeCredit" onclick="selectPaymentMode('credit')">Credit (Udhaar)</button>
                </div>

                <!-- Cash Section -->
                <div id="sectionCash">
                    <div class="form-group">
                        <label class="form-label">Amount Received from Customer</label>
                        <input type="number" id="cashReceivedInput" class="form-input" placeholder="e.g. 500"
                               oninput="calculateChange(${totalPaise})">
                    </div>
                    <div id="cashChangeBox" style="background-color: var(--surface-sunken); border: 1px solid var(--border); border-radius: var(--radius-control); padding: 0.75rem; text-align: center; font-size: 1rem; font-weight: 600; display: none;">
                        Change to return: <span id="changeReturnDisplay" style="color: var(--success);">₹0.00</span>
                    </div>
                </div>

                <!-- UPI Section: Simple categorization -->
                <div id="sectionUpi" style="display: none; text-align: center;">
                    <div style="background-color: var(--surface-sunken); border: 1px solid var(--border); border-radius: var(--radius-control); padding: 1.25rem; margin: 0.75rem 0;">
                        <div style="font-size: 1.05rem; font-weight: 600; color: var(--accent); margin-bottom: 0.35rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
                            <span>UPI Payment Mode</span>
                        </div>
                        <p style="font-size: 0.875rem; color: var(--text-muted); margin: 0;">
                            Customer paid via UPI (Google Pay, PhonePe, Paytm, etc.). This bill will be recorded and categorized as <strong>UPI</strong>.
                        </p>
                    </div>
                </div>

                <!-- Credit (Udhaar) Section -->
                <div id="sectionCredit" style="display: none;">
                    <div class="form-group">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
                            <label class="form-label" style="margin-bottom: 0;">Select Customer (Credit Account) *</label>
                            <button type="button" class="btn btn-sm btn-secondary" onclick="toggleQuickAddCustomer()" style="font-size: 0.75rem; padding: 0.2rem 0.55rem; display: inline-flex; align-items: center; gap: 0.35rem; border-color: var(--accent); color: var(--accent); font-weight: 600;">
                                <span style="font-size: 0.95rem; font-weight: 700; line-height: 1;">+</span> New Customer
                            </button>
                        </div>
                        <select id="creditCustomerSelect" class="form-select" required>
                            <option value="">-- Choose Customer --</option>
                            ${billingCustomers.map(c => `
                                <option value="${c.id}">${c.name} (${c.phone || 'No phone'}) - Current Dues: ${c.balance_display || formatRupees(c.balance || 0)}</option>
                            `).join('')}
                        </select>
                    </div>

                    <!-- Quick Add Customer Panel (Collapsible) -->
                    <div id="quickAddCustomerPanel" style="display: none; background: var(--surface-sunken); border: 1px solid var(--border); border-radius: var(--radius-control); padding: 0.875rem; margin-bottom: 0.875rem;">
                        <div style="font-weight: 600; font-size: 0.875rem; margin-bottom: 0.5rem; color: var(--text); display: flex; justify-content: space-between; align-items: center;">
                            <span>Add New Customer for Udhaar</span>
                            <button type="button" class="btn btn-sm btn-secondary" onclick="toggleQuickAddCustomer(false)" style="padding: 0 0.35rem; border: none; font-size: 1rem; line-height: 1;">&times;</button>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-bottom: 0.5rem;">
                            <div>
                                <label style="font-size: 0.75rem; font-weight: 600; display: block; margin-bottom: 0.25rem;">Full Name *</label>
                                <input type="text" id="quickCustName" class="form-input" placeholder="e.g. Rahul Patil" style="padding: 0.45rem; font-size: 0.85rem;" autocomplete="off">
                            </div>
                            <div>
                                <label style="font-size: 0.75rem; font-weight: 600; display: block; margin-bottom: 0.25rem;">Mobile Number *</label>
                                <input type="tel" id="quickCustPhone" class="form-input" placeholder="10-digit mobile" maxlength="10" style="padding: 0.45rem; font-size: 0.85rem;" autocomplete="off">
                            </div>
                        </div>
                        <div style="margin-bottom: 0.5rem;">
                            <label style="font-size: 0.75rem; font-weight: 600; display: block; margin-bottom: 0.25rem;">Credit Limit (₹, Optional)</label>
                            <input type="number" id="quickCustLimit" class="form-input" placeholder="e.g. 5000" style="padding: 0.45rem; font-size: 0.85rem;">
                        </div>
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
                            <label style="display: flex; align-items: center; gap: 0.35rem; font-size: 0.75rem; color: var(--text-muted); cursor: pointer; margin: 0;">
                                <input type="checkbox" id="quickCustConsent" checked>
                                Customer consent given
                            </label>
                            <button type="button" class="btn btn-sm btn-primary" id="btnSaveQuickCust" onclick="saveQuickCustomer()">
                                Save &amp; Select
                            </button>
                        </div>
                        <div id="quickCustError" style="color: var(--danger); font-size: 0.75rem; margin-top: 0.35rem; display: none;"></div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Amount Paid Now (Optional)</label>
                        <input type="number" id="creditPaidNowInput" class="form-input" placeholder="0" min="0" step="any" oninput="updateCreditDuesPreview(${totalPaise})">
                        <div id="creditDuesPreview" style="margin-top: 0.35rem; font-size: 0.85rem; color: var(--text-muted);">
                            Remaining balance to credit (udhaar): <strong style="color: var(--warning);">${formatRupees(totalPaise)}</strong>
                        </div>
                    </div>
                </div>

                <div class="modal-footer" style="margin-top: 1.25rem; display: flex; justify-content: flex-end; gap: 0.5rem;">
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                    <button type="button" class="btn btn-primary" id="btnConfirmSaleSubmit" onclick="submitSale(${totalPaise})">
                        Confirm &amp; Complete
                    </button>
                </div>
            </div>
        </div>
    `;
}

function toggleQuickAddCustomer(forceState) {
    const panel = document.getElementById('quickAddCustomerPanel');
    if (!panel) return;
    const isVisible = panel.style.display !== 'none';
    const show = forceState !== undefined ? forceState : !isVisible;
    panel.style.display = show ? 'block' : 'none';
    if (show) {
        document.getElementById('quickCustName')?.focus();
    }
}

async function saveQuickCustomer() {
    const nameInput = document.getElementById('quickCustName');
    const phoneInput = document.getElementById('quickCustPhone');
    const limitInput = document.getElementById('quickCustLimit');
    const consentInput = document.getElementById('quickCustConsent');
    const errorDiv = document.getElementById('quickCustError');
    const saveBtn = document.getElementById('btnSaveQuickCust');

    if (!nameInput || !phoneInput) return;
    const name = nameInput.value.trim();
    const phone = phoneInput.value.trim();
    const creditLimit = limitInput && limitInput.value ? parseFloat(limitInput.value) : null;
    const consentGiven = consentInput ? consentInput.checked : true;

    if (!name || name.length < 2) {
        if (errorDiv) {
            errorDiv.textContent = 'Please enter a valid customer name (at least 2 letters).';
            errorDiv.style.display = 'block';
        }
        nameInput.focus();
        return;
    }

    if (!phone || !/^[6-9]\d{9}$/.test(phone)) {
        if (errorDiv) {
            errorDiv.textContent = 'Please enter a valid 10-digit Indian mobile number.';
            errorDiv.style.display = 'block';
        }
        phoneInput.focus();
        return;
    }

    if (!consentGiven) {
        if (errorDiv) {
            errorDiv.textContent = 'Customer agreement/consent is required to record credit account details.';
            errorDiv.style.display = 'block';
        }
        return;
    }

    if (errorDiv) errorDiv.style.display = 'none';
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
    }

    try {
        const csrf = (window.App && App.csrfToken) || sessionStorage.getItem('csrfToken') || '';
        const res = await fetch('/api/customers', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrf
            },
            body: JSON.stringify({
                name,
                phone,
                creditLimit,
                consentGiven: true
            })
        });

        const data = await res.json();
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save & Select';
        }

        if (!res.ok || !data.success) {
            if (errorDiv) {
                errorDiv.textContent = data.error?.message || 'Failed to create customer.';
                errorDiv.style.display = 'block';
            }
            return;
        }

        const newCust = data.data;
        const newCustObj = {
            id: newCust.id,
            name: newCust.name,
            phone: newCust.phone || '',
            balance: 0,
            balance_display: '₹0.00'
        };

        // Add to billingCustomers list
        billingCustomers.unshift(newCustObj);

        // Update the select dropdown
        const select = document.getElementById('creditCustomerSelect');
        if (select) {
            const opt = document.createElement('option');
            opt.value = newCust.id;
            opt.textContent = `${newCust.name} (${newCust.phone || 'No phone'}) - Current Dues: ₹0.00`;
            opt.selected = true;
            if (select.children.length > 1) {
                select.insertBefore(opt, select.children[1]);
            } else {
                select.appendChild(opt);
            }
            select.value = newCust.id;
        }

        // Hide quick add panel and clear form
        toggleQuickAddCustomer(false);
        nameInput.value = '';
        phoneInput.value = '';
        if (limitInput) limitInput.value = '';

        if (window.App && typeof App.toast === 'function') {
            App.toast(`Customer "${newCust.name}" added and selected.`);
        }
    } catch (err) {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save & Select';
        }
        if (errorDiv) {
            errorDiv.textContent = 'Network error: ' + err.message;
            errorDiv.style.display = 'block';
        }
    }
}

function updateCreditDuesPreview(totalPaise) {
    const preview = document.getElementById('creditDuesPreview');
    const input = document.getElementById('creditPaidNowInput');
    if (!preview || !input) return;
    const val = input.value.trim() !== '' ? parseFloat(input.value) : 0;
    if (isNaN(val) || val < 0) {
        preview.innerHTML = '<span style="color: var(--danger);">Amount cannot be negative</span>';
        return;
    }
    const paidPaise = Math.round(val * 100);
    const remaining = totalPaise - paidPaise;
    if (remaining <= 0) {
        preview.innerHTML = '<span style="color: var(--danger);">Amount paid now must be less than total bill. If paying in full, choose Cash or UPI.</span>';
    } else {
        preview.innerHTML = `Remaining balance to credit (udhaar): <strong style="color: var(--warning);">${formatRupees(remaining)}</strong>`;
    }
}

let activePaymentMode = 'cash';
function selectPaymentMode(mode) {
    activePaymentMode = mode;
    const tabCash = document.getElementById('tabModeCash');
    const tabUpi = document.getElementById('tabModeUpi');
    const tabCredit = document.getElementById('tabModeCredit');
    if (tabCash) tabCash.classList.toggle('active', mode === 'cash');
    if (tabUpi) tabUpi.classList.toggle('active', mode === 'upi');
    if (tabCredit) tabCredit.classList.toggle('active', mode === 'credit');

    const secCash = document.getElementById('sectionCash');
    const secUpi = document.getElementById('sectionUpi');
    const secCredit = document.getElementById('sectionCredit');
    if (secCash) secCash.style.display = mode === 'cash' ? 'block' : 'none';
    if (secUpi) secUpi.style.display = mode === 'upi' ? 'block' : 'none';
    if (secCredit) secCredit.style.display = mode === 'credit' ? 'block' : 'none';

    const submitBtn = document.getElementById('btnConfirmSaleSubmit');
    if (submitBtn) {
        if (mode === 'upi') {
            submitBtn.textContent = 'Confirm & Complete (UPI)';
        } else if (mode === 'credit') {
            submitBtn.textContent = 'Confirm & Complete (Credit)';
        } else {
            submitBtn.textContent = 'Confirm & Complete';
        }
    }
}

function calculateChange(totalPaise) {
    const input = document.getElementById('cashReceivedInput')?.value;
    const box = document.getElementById('cashChangeBox');
    const disp = document.getElementById('changeReturnDisplay');
    if (!box || !disp) return;

    if (!input || parseFloat(input) <= 0) {
        box.style.display = 'none';
        return;
    }

    const receivedPaise = Math.round(parseFloat(input) * 100);
    const changePaise = receivedPaise - totalPaise;
    box.style.display = 'block';
    disp.textContent = formatRupees(changePaise);
    disp.style.color = changePaise >= 0 ? 'var(--success)' : 'var(--danger)';
}

async function submitSale(totalPaise) {
    const submitBtn = document.getElementById('btnConfirmSaleSubmit');
    if (submitBtn) submitBtn.disabled = true;

    let customerId = null;
    let amountPaid = Number(totalPaise);

    if (activePaymentMode === 'credit') {
        customerId = document.getElementById('creditCustomerSelect')?.value;
        if (!customerId) {
            alert('Please select an active customer for the credit (udhaar) bill.');
            if (submitBtn) submitBtn.disabled = false;
            return;
        }
        const paidNowVal = document.getElementById('creditPaidNowInput')?.value;
        const paidVal = paidNowVal && paidNowVal.trim() !== '' ? parseFloat(paidNowVal) : 0;
        if (isNaN(paidVal) || paidVal < 0) {
            alert('Amount paid now cannot be negative.');
            if (submitBtn) submitBtn.disabled = false;
            return;
        }
        amountPaid = Math.round(paidVal * 100);
        if (amountPaid >= totalPaise) {
            alert(`For credit bills, amount paid now must be less than the total bill (${formatRupees(totalPaise)}). If the customer is paying in full, please select Cash or UPI.`);
            if (submitBtn) submitBtn.disabled = false;
            return;
        }
    }

    const payload = {
        clientSaleId: currentClientSaleId,
        paymentMode: activePaymentMode,
        customerId: customerId ? parseInt(customerId, 10) : null,
        amountPaid,
        items: cart.map(it => ({
            productId: it.product.id,
            quantity: it.quantity.toString()
        }))
    };

    try {
        const csrf = (window.App && App.csrfToken) || sessionStorage.getItem('csrfToken') || '';
        const res = await fetch('/api/sales', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrf
            },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (!res.ok) {
            if (data.error && data.error.code === 'CREDIT_LIMIT_EXCEEDED') {
                if (confirm(data.error.message + '\n\nDo you want to confirm and proceed anyway?')) {
                    payload.confirmOverLimit = true;
                    const retryRes = await fetch('/api/sales', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRF-Token': csrf
                        },
                        body: JSON.stringify(payload)
                    });
                    const retryData = await retryRes.json();
                    if (retryRes.ok && retryData.success) {
                        cart = [];
                        currentClientSaleId = generateUUID();
                        renderCart();
                        showSuccessModal(retryData.data);
                        return;
                    }
                }
            }
            alert(data.error?.message || 'Sale failed.');
            if (submitBtn) submitBtn.disabled = false;
            return;
        }

        cart = [];
        currentClientSaleId = generateUUID();
        renderCart();
        showSuccessModal(data.data);
    } catch (err) {
        alert('Network connection error: ' + (err.message || ''));
        if (submitBtn) submitBtn.disabled = false;
    }
}

function showSuccessModal(saleData) {
    const saleId = saleData.id;
    const billNum = saleData.billNumber;
    const totalDisplay = formatRupees(saleData.totalAmount);

    const modal = document.getElementById('modalContainer');
    if (!modal) return;
    modal.innerHTML = `
        <div class="modal-overlay active" onclick="if(event.target===this)closeModal()">
            <div class="modal-card" style="text-align: center;">
                <div style="width: 54px; height: 54px; border-radius: 50%; background: var(--surface); box-shadow: var(--raised-sm); border: 1px solid var(--success); color: var(--success); display: inline-flex; align-items: center; justify-content: center; margin-bottom: 0.875rem;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                </div>
                <h3 class="modal-title" style="margin-bottom: 0.25rem;">Bill Completed!</h3>
                <p style="font-size: 1.1rem; font-weight: 600; color: var(--text);">Bill #${billNum} &bull; ${totalDisplay}</p>

                <div style="display: flex; flex-direction: column; gap: 0.75rem; margin: 1.5rem 0;">
                    <button class="btn btn-primary" onclick="printBillReceipt(${saleId})">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>
                        Print Bill
                    </button>
                    <button class="btn btn-secondary" onclick="shareBillOnWhatsApp(${saleId})">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/></svg>
                        Share on WhatsApp
                    </button>
                    <button class="btn btn-secondary" onclick="startNewBill()">
                        New Bill
                    </button>
                </div>
            </div>
        </div>
    `;
}

function startNewBill() {
    closeModal();
    initBillingScreen();
}

async function printBillReceipt(saleId) {
    try {
        const res = await fetch(`/api/sales/${saleId}/receipt`);
        const data = await res.json();
        if (!data || !data.success) {
            alert('Failed to load bill receipt data.');
            return;
        }

        const d = data.data;
        const widthSetting = (window.App && App.settings && App.settings.receiptWidth) || window.currentStoreSettings?.receiptWidth || '80mm';
        const is58mm = widthSetting === '58mm';
        const isA4 = widthSetting === 'a4' || widthSetting === 'A4';
        const cardWidth = isA4 ? '190mm' : (is58mm ? '54mm' : '76mm');

        let displayDate = d.bill.date || '';
        try {
            const parsed = new Date(d.bill.date);
            if (!isNaN(parsed.getTime())) {
                displayDate = parsed.toLocaleString('en-IN', {
                    day: '2-digit', month: 'short', year: 'numeric',
                    hour: '2-digit', minute: '2-digit', hour12: true
                });
            }
        } catch (_) {}

        const receiptHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Bill - ${d.bill.billNumber}</title>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        @page {
            size: ${isA4 ? 'A4 portrait' : (is58mm ? '58mm auto' : '80mm auto')};
            margin: ${isA4 ? '10mm' : '0'};
        }
        @media print {
            html, body {
                width: 100%;
                margin: 0 !important;
                padding: 0 !important;
                background: #fff !important;
                color: #000 !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background: #fff;
            color: #111;
            font-size: ${is58mm ? '11px' : '12px'};
            line-height: 1.35;
            display: flex;
            justify-content: center;
            padding: ${isA4 ? '12px' : '6px 4px'};
        }
        .receipt-card {
            width: ${cardWidth};
            max-width: 100%;
            margin: 0 auto;
            background: #fff;
        }
        .header {
            text-align: center;
            padding-bottom: 6px;
            margin-bottom: 6px;
            border-bottom: 1px dashed #000;
        }
        .store-name {
            font-size: ${is58mm ? '14px' : '16px'};
            font-weight: 700;
            letter-spacing: 0.3px;
            margin-bottom: 2px;
            text-transform: uppercase;
        }
        .store-sub {
            font-size: 11px;
            color: #333;
            margin-bottom: 2px;
        }
        .doc-badge {
            display: inline-block;
            font-size: 11px;
            font-weight: 700;
            margin: 4px 0 2px 0;
            padding: 1px 8px;
            border: 1px solid #000;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .meta-section {
            padding: 4px 0;
            border-bottom: 1px dashed #000;
            font-size: 11px;
        }
        .meta-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 2px;
        }
        .meta-row:last-child {
            margin-bottom: 0;
        }
        .items-table {
            width: 100%;
            border-collapse: collapse;
            margin: 6px 0;
            table-layout: fixed;
        }
        .items-table th {
            border-top: 1px solid #000;
            border-bottom: 1px solid #000;
            padding: 4px 2px;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
        }
        .items-table td {
            padding: 4px 2px;
            vertical-align: top;
            border-bottom: 1px dotted #ccc;
            font-size: 11px;
            word-wrap: break-word;
            overflow-wrap: break-word;
        }
        .col-item {
            text-align: left;
            width: 44%;
        }
        .item-name {
            font-weight: 500;
        }
        .col-qty {
            text-align: center;
            width: 18%;
            white-space: nowrap;
        }
        .col-rate {
            text-align: right;
            width: 18%;
            white-space: nowrap;
        }
        .col-amt {
            text-align: right;
            width: 20%;
            font-weight: 700;
            white-space: nowrap;
        }
        .totals-section {
            border-top: 1px dashed #000;
            border-bottom: 1px dashed #000;
            padding: 5px 0;
            margin: 6px 0;
        }
        .total-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 11px;
            padding: 2px 0;
        }
        .total-row.grand-total {
            font-size: ${is58mm ? '13px' : '15px'};
            font-weight: 800;
            border-top: 1px solid #000;
            padding-top: 4px;
            margin-top: 3px;
        }
        .footer {
            text-align: center;
            padding-top: 6px;
            font-size: 10px;
            color: #444;
        }
        .footer-thankyou {
            font-weight: 600;
            margin-bottom: 2px;
        }
    </style>
</head>
<body>
    <div class="receipt-card">
        <div class="header">
            <div class="store-name">${d.store.name}</div>
            ${d.store.address ? `<div class="store-sub">${d.store.address}${d.store.city ? ', ' + d.store.city : ''}</div>` : ''}
            ${d.store.phone ? `<div class="store-sub">Tel: ${d.store.phone}</div>` : ''}
            <div class="store-sub" style="font-weight: 600; letter-spacing: 0.3px;">GSTIN: ${d.gst?.gstin || d.store.gstin || '27AAPCS1234F1Z5'}</div>
            <div class="doc-badge">${d.bill.isVoided ? 'CANCELLED BILL' : 'TAX INVOICE / BILL'}</div>
        </div>

        <div class="meta-section">
            <div class="meta-row">
                <span>Bill No: <strong>${d.bill.billNumber}</strong></span>
                <span>${displayDate}</span>
            </div>
            ${d.customer ? `
                <div class="meta-row">
                    <span>Customer: <strong>${d.customer.name}</strong></span>
                    <span>${d.customer.phone || ''}</span>
                </div>
            ` : ''}
            <div class="meta-row">
                <span>Payment Mode: <strong>${d.bill.paymentMode.toUpperCase()}</strong></span>
                <span>Status: Completed</span>
            </div>
        </div>

        <table class="items-table">
            <thead>
                <tr>
                    <th class="col-item">Item</th>
                    <th class="col-qty">Qty</th>
                    <th class="col-rate">Rate</th>
                    <th class="col-amt">Amount</th>
                </tr>
            </thead>
            <tbody>
                ${d.items.map(it => `
                    <tr>
                        <td class="col-item"><span class="item-name">${it.name}</span></td>
                        <td class="col-qty">${it.quantity}</td>
                        <td class="col-rate">${it.rate}</td>
                        <td class="col-amt">${it.amount}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>

        <div class="totals-section">
            <div class="total-row grand-total">
                <span>TOTAL PAYABLE</span>
                <span>${d.bill.totalAmount}</span>
            </div>

            <!-- GST Tax Breakdown -->
            <div style="border-top: 1px dotted #888; margin: 4px 0; padding-top: 4px; font-size: 11px;">
                <div class="total-row" style="color: #444;">
                    <span>Taxable Value:</span>
                    <span>${d.gst ? d.gst.taxableAmount : (d.subtotal || d.bill.totalAmount)}</span>
                </div>
                <div class="total-row" style="color: #444;">
                    <span>CGST (${d.gst ? d.gst.cgstRateDisplay : '2.5%'}):</span>
                    <span>${d.gst ? d.gst.cgstAmount : '₹0.36'}</span>
                </div>
                <div class="total-row" style="color: #444;">
                    <span>SGST (${d.gst ? d.gst.sgstRateDisplay : '2.5%'}):</span>
                    <span>${d.gst ? d.gst.sgstAmount : '₹0.35'}</span>
                </div>
                <div class="total-row" style="font-weight: 600; color: #111;">
                    <span>Total GST Included:</span>
                    <span>${d.gst ? d.gst.totalGst : (d.taxAmount || '₹0.71')}</span>
                </div>
            </div>

            <div class="total-row" style="border-top: 1px dashed #000; padding-top: 4px; margin-top: 4px;">
                <span>Payment Mode:</span>
                <span><strong>${d.bill.paymentMode.toUpperCase()}</strong></span>
            </div>
            ${d.bill.paymentMode === 'credit' ? `
                <div class="total-row">
                    <span>Paid Upfront:</span>
                    <span>${d.bill.amountPaid}</span>
                </div>
                <div class="total-row" style="font-weight: 700;">
                    <span>Remaining Due (Udhaar):</span>
                    <span>${d.bill.dueAmount}</span>
                </div>
                ${d.customer ? `
                    <div class="total-row" style="font-size: 10px; color: #555; border-top: 1px dotted #ccc; margin-top: 2px; padding-top: 2px;">
                        <span>Customer Total Dues:</span>
                        <span><strong>${d.customer.balanceAfter}</strong></span>
                    </div>
                ` : ''}
            ` : `
                <div class="total-row">
                    <span>Amount Paid:</span>
                    <span>${d.bill.amountPaid || d.bill.totalAmount}</span>
                </div>
            `}
        </div>

        <div class="footer">
            <div class="footer-thankyou">${d.store.footer || 'Thank you for your visit!'}</div>
            <div>Powered by INVENZO</div>
        </div>
    </div>
</body>
</html>`;

        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.top = '-9999px';
        iframe.style.left = '-9999px';
        iframe.style.width = '0px';
        iframe.style.height = '0px';
        iframe.style.border = 'none';
        document.body.appendChild(iframe);

        const doc = iframe.contentWindow.document;
        doc.open();
        doc.write(receiptHtml);
        doc.close();

        setTimeout(() => {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            setTimeout(() => {
                iframe.remove();
            }, 1000);
        }, 250);

    } catch (e) {
        console.error('Print error:', e);
        alert('Could not generate printable receipt: ' + (e.message || ''));
    }
}

async function shareBillOnWhatsApp(saleId) {
    try {
        const res = await fetch(`/api/sales/${saleId}/receipt`);
        const data = await res.json();
        if (!data.success) return;

        const d = data.data;
        const phone = d.customer?.phone || prompt('Enter customer 10-digit mobile number:');
        if (!phone) return;

        const cleanPhone = phone.replace(/\D/g, '').slice(-10);
        const msg = `Hello! Here is your bill from ${d.store.name}:\nBill: ${d.bill.billNumber}\nTotal: ${d.bill.totalAmount}\nPayment: ${d.bill.paymentMode.toUpperCase()}${d.bill.dueAmount !== '₹0.00' ? `\nPending Due: ${d.bill.dueAmount}` : ''}\nThank you!`;

        const waUrl = `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(msg)}`;
        window.open(waUrl, '_blank', 'noopener,noreferrer');
    } catch (e) {
        console.error('WhatsApp share error:', e);
    }
}

window.Billing = {
    load() {
        return initBillingScreen();
    }
};
window.initBillingScreen = initBillingScreen;
window.addItemToCart = addItemToCart;
window.updateCartQuantity = updateCartQuantity;
window.selectPaymentMode = selectPaymentMode;
window.calculateChange = calculateChange;
window.submitSale = submitSale;
window.resumeHeldBill = resumeHeldBill;
window.discardHeldBill = discardHeldBill;
window.printBillReceipt = printBillReceipt;
window.shareBillOnWhatsApp = shareBillOnWhatsApp;
window.startNewBill = startNewBill;
window.updatePackCount = updatePackCount;
window.updatePackSize = updatePackSize;
window.stepPackSize = stepPackSize;
window.removeCartItem = removeCartItem;
window.formatRupees = formatRupees;
window.formatPackWeight = formatPackWeight;
window.showHeldBillsModal = showHeldBillsModal;
window.showPaymentModal = showPaymentModal;
window.closeModal = closeModal;
window.showToast = showToast;

