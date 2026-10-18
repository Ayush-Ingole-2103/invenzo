// ============================================
// Stock Management, Expiry & Reorder — PRD 12.7, 12.8, 12.9
// ============================================

const Stock = {
    activeTab: 'movements', // 'movements', 'expiry', 'reorder'
    movementsPage: 1,

    async load() {
        App.setTopbarActions(`
            <div style="display:flex;gap:0.5rem;">
                <button class="btn ${this.activeTab === 'movements' ? 'btn-primary' : 'btn-secondary'}" onclick="Stock.switchTab('movements')">
                    Stock & Movements
                </button>
                <button class="btn ${this.activeTab === 'expiry' ? 'btn-primary' : 'btn-secondary'}" onclick="Stock.switchTab('expiry')">
                    Expiry Tracking
                </button>
                <button class="btn ${this.activeTab === 'reorder' ? 'btn-primary' : 'btn-secondary'}" onclick="Stock.switchTab('reorder')">
                    Reorder List
                </button>
            </div>
        `);

        if (this.activeTab === 'movements') {
            await this.renderMovementsTab();
        } else if (this.activeTab === 'expiry') {
            await this.renderExpiryTab();
        } else if (this.activeTab === 'reorder') {
            await this.renderReorderTab();
        }
    },

    switchTab(tab) {
        this.activeTab = tab;
        this.load();
    },

    // ----------------------------------------------------
    // Tab 1: Stock & Movements
    // ----------------------------------------------------
    async renderMovementsTab() {
        const [prodData, movementsData] = await Promise.all([
            App.api('/api/products?limit=300'),
            App.api(`/api/stock/movements?page=${this.movementsPage}&limit=20`)
        ]);

        const products = prodData.success ? prodData.data : [];
        const movements = movementsData.success ? movementsData.data : [];
        const meta = movementsData.success ? movementsData.meta : {};

        App.setContent(`
            <div class="grid-2" style="margin-bottom:1.5rem;">
                <!-- Restock (Add Stock) -->
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Add Stock (Restock)</h3>
                    </div>
                    <form id="addStockForm" style="padding-top:0.75rem;">
                        <div class="form-group">
                            <label>Select Product <span class="required">*</span></label>
                            <select name="productId" id="restockProductSelect" required class="form-control">
                                <option value="">Choose product...</option>
                                ${products.map(p => `
                                    <option value="${p.id}" data-tracked="${p.track_expiry ? '1' : '0'}" data-unit="${p.unit || 'piece'}">
                                        ${p.name} (Current: ${p.quantity_display || p.quantity || '0'} ${p.unit || 'piece'})
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Quantity to Add <span class="required">*</span></label>
                            <input type="number" step="0.001" min="0.001" name="quantity" required placeholder="e.g. 50 or 2.500" class="form-control">
                        </div>

                        <!-- Dynamic Expiry Batch fields for tracked products -->
                        <div id="restockExpiryFields" style="display:none;background:var(--surface-sunken);padding:0.75rem;border-radius:8px;margin-bottom:1rem;border:1px solid var(--border);">
                            <div class="text-xs font-semibold mb-1" style="color:var(--accent);">Expiry Tracked Item</div>
                            <div class="form-group" style="margin-bottom:0.5rem;">
                                <label>Expiry Date <span class="required">*</span></label>
                                <input type="date" name="expiryDate" class="form-control" id="restockExpiryInput">
                            </div>
                            <div class="form-group" style="margin-bottom:0;">
                                <label>Batch / Lot Number (Optional)</label>
                                <input type="text" name="batchLabel" placeholder="e.g. BATCH-2026A" class="form-control">
                            </div>
                        </div>

                        <div class="form-group">
                            <label>Note / Supplier Bill #</label>
                            <input type="text" name="note" placeholder="e.g. Bill #8821 from Wholesale Ltd" class="form-control">
                        </div>
                        <button type="submit" class="btn btn-success" style="width:100%;margin-top:0.5rem;">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
                            Add Stock
                        </button>
                    </form>
                </div>

                <!-- Adjust Stock (Correction) -->
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Adjust Stock (Correction)</h3>
                    </div>
                    <form id="adjustStockForm" style="padding-top:0.75rem;">
                        <div class="form-group">
                            <label>Select Product <span class="required">*</span></label>
                            <select name="productId" required class="form-control">
                                <option value="">Choose product...</option>
                                ${products.map(p => `
                                    <option value="${p.id}">
                                        ${p.name} (Current: ${p.quantity_display || p.quantity || '0'} ${p.unit || 'piece'})
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Adjustment (+/-) <span class="required">*</span></label>
                            <input type="number" step="0.001" name="quantity" required placeholder="e.g. -2 for damage, or 5 for recount" class="form-control">
                            <span class="help-text">Use negative numbers to reduce, positive to increase</span>
                        </div>
                        <div class="form-group">
                            <label>Mandatory Reason <span class="required">*</span></label>
                            <textarea name="reason" required minlength="3" rows="3" placeholder="e.g. Damaged during unboxing / Inventory count discrepancy" class="form-control"></textarea>
                            <span class="help-text">Audit logging requires reason of at least 3 characters.</span>
                        </div>
                        <button type="submit" class="btn btn-warning" style="width:100%;margin-top:0.5rem;">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
                            Record Adjustment
                        </button>
                    </form>
                </div>
            </div>

            <!-- Movements History -->
            <div class="card">
                <div class="card-header">
                    <h3>Stock Movements History</h3>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Timestamp</th>
                                <th>Product</th>
                                <th>Type</th>
                                <th>Change</th>
                                <th>Stock After</th>
                                <th>Reason / Note</th>
                                <th>User</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${movements.length === 0 ? `
                                <tr><td colspan="7"><div class="empty-state" style="padding:2rem 1rem;text-align:center;"><p class="text-muted">No stock movements recorded yet.</p></div></td></tr>
                            ` : movements.map(m => {
                                const isAdd = m.quantity_change_milli > 0;
                                return `
                                    <tr>
                                        <td style="white-space:nowrap;">${App.formatDateTime(m.created_at)}</td>
                                        <td>
                                            <div style="font-weight:600;">${m.product_name}</div>
                                            <div class="text-xs text-muted"><code>${m.sku}</code></div>
                                        </td>
                                        <td>
                                            <span class="badge ${m.type === 'restock' ? 'badge-success' : (m.type === 'adjustment' ? 'badge-warning' : (m.type === 'void_reversal' ? 'badge-primary' : 'badge-neutral'))}">
                                                ${m.type.toUpperCase()}
                                            </span>
                                        </td>
                                        <td style="font-weight:600;color:${isAdd ? 'var(--success)' : 'var(--danger)'};">
                                            ${isAdd ? '+' : ''}${m.quantity_change_display} ${m.unit || ''}
                                        </td>
                                        <td style="font-weight:600;">${m.quantity_after_display} ${m.unit || ''}</td>
                                        <td>${m.note || '-'}</td>
                                        <td>${m.created_by_name || '-'}</td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>

                ${meta.total > meta.limit ? `
                    <div class="pagination" style="padding:1rem;display:flex;justify-content:space-between;align-items:center;">
                        <span class="text-sm text-muted">Page ${meta.page} of ${Math.ceil(meta.total / meta.limit)} (${meta.total} movements)</span>
                        <div class="pagination-controls" style="display:flex;gap:0.5rem;">
                            <button class="btn btn-sm btn-secondary" onclick="Stock.movementsPage=${meta.page - 1};Stock.renderMovementsTab();" ${meta.page <= 1 ? 'disabled' : ''}>Prev</button>
                            <button class="btn btn-sm btn-secondary" onclick="Stock.movementsPage=${meta.page + 1};Stock.renderMovementsTab();" ${meta.page * meta.limit >= meta.total ? 'disabled' : ''}>Next</button>
                        </div>
                    </div>
                ` : ''}
            </div>
        `);

        // Check if selected product tracks expiry
        const selectEl = document.getElementById('restockProductSelect');
        const expiryFields = document.getElementById('restockExpiryFields');
        const expiryInput = document.getElementById('restockExpiryInput');

        selectEl?.addEventListener('change', () => {
            const opt = selectEl.options[selectEl.selectedIndex];
            const isTracked = opt.dataset.tracked === '1';
            if (expiryFields) {
                expiryFields.style.display = isTracked ? 'block' : 'none';
            }
            if (expiryInput) {
                expiryInput.required = isTracked;
            }
        });

        // Add Stock submit
        document.getElementById('addStockForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const body = {
                productId: parseInt(fd.get('productId')),
                quantity: parseFloat(fd.get('quantity')),
                expiryDate: fd.get('expiryDate') || null,
                batchLabel: fd.get('batchLabel') || null,
                note: fd.get('note') || ''
            };

            const resp = await App.api('/api/stock/add', { method: 'POST', body });
            if (resp && resp.success) {
                App.toast('Stock added successfully.');
                Stock.renderMovementsTab();
            } else {
                App.toast(resp?.error?.message || 'Failed to add stock.', 'error');
            }
        });

        // Adjust Stock submit
        document.getElementById('adjustStockForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const body = {
                productId: parseInt(fd.get('productId')),
                quantity: parseFloat(fd.get('quantity')),
                reason: fd.get('reason')
            };

            const resp = await App.api('/api/stock/adjust', { method: 'POST', body });
            if (resp && resp.success) {
                App.toast('Stock adjusted successfully.');
                Stock.renderMovementsTab();
            } else {
                App.toast(resp?.error?.message || 'Failed to adjust stock.', 'error');
            }
        });
    },

    // ----------------------------------------------------
    // Tab 2: Expiry Tracking (PRD Section 12.8)
    // ----------------------------------------------------
    async renderExpiryTab() {
        const resp = await App.api('/api/stock/expiry');
        if (!resp || !resp.success) {
            App.setContent(`
                <div class="empty-state">
                    <h3>Failed to load expiry data</h3>
                    <p class="text-muted">${resp?.error?.message || 'Please try again.'}</p>
                </div>
            `);
            return;
        }

        const items = resp.data || [];
        const expiredCount = items.filter(i => i.status === 'expired').length;
        const expiringSoonCount = items.filter(i => i.status === 'expiring_soon').length;

        App.setContent(`
            ${expiredCount > 0 ? `
                <div class="panel" style="margin-bottom:1.25rem;border-left:4px solid var(--danger);background:var(--surface);">
                    <div style="display:flex;align-items:center;gap:0.75rem;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--danger);"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
                        <div>
                            <div style="font-weight:700;color:var(--danger);">${expiredCount} batch(es) have expired!</div>
                            <div class="text-xs text-muted">Remove expired items from shelves and record an adjustment immediately.</div>
                        </div>
                    </div>
                </div>
            ` : ''}

            <div class="card">
                <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;">
                    <div>
                        <h3>FIFO Expiry Tracking</h3>
                        <div class="text-xs text-muted">Batches derived using First-In-First-Out consumption against active stock</div>
                    </div>
                    <div style="display:flex;gap:0.75rem;">
                        <span class="badge badge-danger">${expiredCount} Expired</span>
                        <span class="badge badge-warning">${expiringSoonCount} Expiring Soon</span>
                    </div>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Product</th>
                                <th>Batch / Lot</th>
                                <th>Expiry Date</th>
                                <th>Remaining Stock</th>
                                <th>Days Left</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${items.length === 0 ? `
                                <tr><td colspan="6"><div class="empty-state" style="padding:2.5rem 1rem;text-align:center;"><p class="text-muted">No expiry tracked products currently have active stock batches.</p></div></td></tr>
                            ` : items.map(i => {
                                let badgeClass = 'badge-neutral';
                                let statusLabel = 'OK';
                                if (i.status === 'expired') {
                                    badgeClass = 'badge-danger';
                                    statusLabel = 'EXPIRED';
                                } else if (i.status === 'expiring_soon') {
                                    badgeClass = 'badge-warning';
                                    statusLabel = 'EXPIRING SOON';
                                }

                                return `
                                    <tr>
                                        <td>
                                            <div style="font-weight:600;">${i.productName}</div>
                                            <div class="text-xs text-muted"><code>${i.sku}</code></div>
                                        </td>
                                        <td><code>${i.batchLabel}</code></td>
                                        <td><strong>${i.expiryDate}</strong></td>
                                        <td style="font-weight:600;">${i.estimatedRemainingDisplay} ${i.unit}</td>
                                        <td>
                                            ${i.daysDiff !== null ? `
                                                <span style="font-weight:600;color:${i.daysDiff < 0 ? 'var(--danger)' : (i.daysDiff <= 30 ? 'var(--warning)' : 'var(--text)')};">
                                                    ${i.daysDiff < 0 ? `${Math.abs(i.daysDiff)} days ago` : `${i.daysDiff} days`}
                                                </span>
                                            ` : '-'}
                                        </td>
                                        <td>
                                            <span class="badge ${badgeClass}">${statusLabel}</span>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `);
    },

    // ----------------------------------------------------
    // Tab 3: Reorder List (PRD Section 12.9)
    // ----------------------------------------------------
    async renderReorderTab() {
        const resp = await App.api('/api/stock/reorder');
        if (!resp || !resp.success) {
            App.setContent(`
                <div class="empty-state">
                    <h3>Failed to load reorder list</h3>
                    <p class="text-muted">${resp?.error?.message || 'Please try again.'}</p>
                </div>
            `);
            return;
        }

        const groups = resp.data || [];

        App.setContent(`
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.25rem;flex-wrap:wrap;gap:1rem;">
                <div>
                    <h2 style="margin:0;font-size:1.35rem;">Supplier Reorder Lists</h2>
                    <div class="text-xs text-muted">Products currently at or below minimum stock threshold</div>
                </div>
                <button class="btn btn-secondary" onclick="window.print()">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>
                    Print All Lists
                </button>
            </div>

            ${groups.length === 0 ? `
                <div class="card" style="padding:3rem 1rem;text-align:center;">
                    <div class="empty-state">
                        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--success);margin-bottom:1rem;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                        <h3>Stock is healthy!</h3>
                        <p class="text-muted">No products have reached their reorder thresholds.</p>
                    </div>
                </div>
            ` : groups.map((g, idx) => {
                const poText = `*Purchase Order from ${App.user?.storeName || 'Store'}*\nSupplier: ${g.supplierName}\nDate: ${new Date().toLocaleDateString('en-IN')}\n\nRequired Items:\n` +
                    g.items.map((it, i) => `${i + 1}. ${it.name} - Order Qty: ${it.suggestedQuantity} ${it.unit} (Current: ${it.currentStock} ${it.unit})`).join('\n') +
                    `\n\nPlease confirm availability and delivery schedule.`;

                return `
                    <div class="card" style="margin-bottom:1.5rem;">
                        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.75rem;">
                            <div>
                                <h3 style="margin:0;">${g.supplierName}</h3>
                                ${g.supplierPhone ? `<div class="text-sm text-muted">Phone: <a href="tel:${g.supplierPhone}">${g.supplierPhone}</a></div>` : ''}
                            </div>
                            <div style="display:flex;gap:0.5rem;align-items:center;">
                                <button class="btn btn-sm btn-secondary" onclick="Stock.copyPO('${encodeURIComponent(poText)}')">
                                    Copy Order Text
                                </button>
                                ${g.supplierPhone ? `
                                    <a href="https://wa.me/91${g.supplierPhone}?text=${encodeURIComponent(poText)}" target="_blank" class="btn btn-sm btn-success" style="display:inline-flex;align-items:center;gap:0.35rem;">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/></svg>
                                        Send WhatsApp Order
                                    </a>
                                ` : ''}
                            </div>
                        </div>
                        <div class="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Product</th>
                                        <th>SKU</th>
                                        <th>Current Stock</th>
                                        <th>Min Threshold</th>
                                        <th>Suggested Order Qty</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${g.items.map(it => `
                                        <tr>
                                            <td style="font-weight:600;">${it.name}</td>
                                            <td><code>${it.sku}</code></td>
                                            <td style="color:var(--danger);font-weight:600;">${it.currentStock} ${it.unit}</td>
                                            <td>${it.minimumStock} ${it.unit}</td>
                                            <td style="font-weight:700;color:var(--accent);font-size:1.05rem;">
                                                ${it.suggestedQuantity} ${it.unit}
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
            }).join('')}
        `);
    },

    copyPO(encodedText) {
        const text = decodeURIComponent(encodedText);
        navigator.clipboard.writeText(text).then(() => {
            App.toast('Order text copied to clipboard!');
        }).catch(() => {
            App.toast('Failed to copy to clipboard.', 'error');
        });
    }
};

window.Stock = Stock;
