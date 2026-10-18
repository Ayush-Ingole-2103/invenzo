// ============================================
// Sales History, Voiding & Receipts — PRD 12.4
// ============================================

const Sales = {
    page: 1,
    limit: 20,
    search: '',

    async load() {
        App.setTopbarActions(`
            <button class="btn btn-primary" onclick="App.navigate('billing')">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>
                New Counter Sale
            </button>
        `);
        await this.fetchSales();
    },

    async fetchSales() {
        const resp = await App.api(`/api/sales?page=${this.page}&limit=${this.limit}`);
        if (!resp || !resp.success) {
            App.setContent(`
                <div class="empty-state">
                    <h3>Failed to load sales history</h3>
                    <p class="text-muted">${resp?.error?.message || 'Please try again.'}</p>
                    <button class="btn btn-primary" onclick="Sales.fetchSales()">Retry</button>
                </div>
            `);
            return;
        }

        const sales = resp.data || [];
        const pg = resp.pagination || {};

        App.setContent(`
            <div class="card">
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th style="width: 80px;">Bill #</th>
                                <th style="width: 170px;">Date &amp; Time</th>
                                <th>Customer</th>
                                <th style="width: 120px;" class="text-center">Payment Mode</th>
                                <th style="width: 90px;" class="text-center">Items</th>
                                <th style="width: 130px;" class="text-right">Total Amount (₹)</th>
                                <th style="width: 120px;" class="text-center">Status</th>
                                <th style="width: 140px;" class="text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${sales.length === 0 ? `
                                <tr>
                                    <td colspan="8">
                                        <div class="empty-state" style="padding:2.5rem 1rem;text-align:center;">
                                            <h3>No sales recorded</h3>
                                            <p class="text-muted">Generate a new sale from the Counter Billing screen.</p>
                                        </div>
                                    </td>
                                </tr>
                            ` : sales.map(s => {
                                const isVoided = s.status === 'voided';
                                return `
                                    <tr style="${isVoided ? 'opacity:0.65;background:var(--surface-sunken);' : ''}">
                                        <td>
                                            <span class="badge ${isVoided ? 'badge-danger' : 'badge-primary'}" style="font-family:monospace;font-size:0.8125rem;">
                                                ${s.bill_number || `#${s.id}`}
                                            </span>
                                        </td>
                                        <td class="text-muted text-sm">${App.formatDateTime(s.created_at)}</td>
                                        <td>${s.customer_name ? `<strong style="color:var(--text);">${s.customer_name}</strong>` : '<span class="text-muted">Walk-in</span>'}</td>
                                        <td class="text-center">
                                            <span class="badge ${s.payment_mode === 'cash' ? 'badge-success' : (s.payment_mode === 'upi' ? 'badge-primary' : (s.payment_mode === 'credit' ? 'badge-danger' : 'badge-neutral'))}">
                                                ${(s.payment_mode || 'cash').toUpperCase()}
                                            </span>
                                        </td>
                                        <td class="text-center text-sm">${s.item_count} items</td>
                                        <td class="text-right" style="font-weight:700;font-variant-numeric:tabular-nums;color:${isVoided ? 'var(--text-muted)' : 'var(--text)'};">
                                            ${s.total_amount_display || App.formatCurrency(s.total_amount)}
                                        </td>
                                        <td class="text-center">
                                            <span class="badge ${isVoided ? 'badge-danger' : 'badge-success'}">
                                                ${isVoided ? 'VOIDED' : 'COMPLETED'}
                                            </span>
                                        </td>
                                        <td class="text-right">
                                            <div class="action-btns">
                                                <button class="btn btn-sm btn-secondary" onclick="Sales.viewSale(${s.id})" title="View Details">
                                                    View
                                                </button>
                                                <button class="btn btn-sm btn-secondary" onclick="Sales.printReceipt(${s.id})" title="Print Receipt">
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>
                                                </button>
                                                ${!isVoided ? `
                                                    <button class="btn btn-sm btn-danger" onclick="Sales.promptVoidSale(${s.id}, '${s.bill_number || `#${s.id}`}')" title="Void Sale">
                                                        Void
                                                    </button>
                                                ` : ''}
                                            </div>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>

                ${pg.totalPages > 1 ? `
                    <div class="pagination" style="padding:1rem;display:flex;justify-content:space-between;align-items:center;">
                        <span class="text-sm text-muted">Page ${pg.page} of ${pg.totalPages} (${pg.total} sales)</span>
                        <div class="pagination-controls" style="display:flex;gap:0.5rem;">
                            <button class="btn btn-sm btn-secondary" onclick="Sales.page=${pg.page - 1};Sales.fetchSales();" ${pg.page <= 1 ? 'disabled' : ''}>Prev</button>
                            <button class="btn btn-sm btn-secondary" onclick="Sales.page=${pg.page + 1};Sales.fetchSales();" ${pg.page >= pg.totalPages ? 'disabled' : ''}>Next</button>
                        </div>
                    </div>
                ` : ''}
            </div>
        `);
    },

    async viewSale(id) {
        const resp = await App.api(`/api/sales/${id}`);
        if (!resp || !resp.success) {
            App.toast('Failed to load sale details.', 'error');
            return;
        }

        const sale = resp.data;
        const isVoided = sale.status === 'voided';

        App.setContent(`
            <div class="panel" style="max-width:800px;margin:0 auto 1.5rem auto;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1.25rem;">
                    <div>
                        <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.25rem;">
                            <h2 style="margin:0;font-size:1.4rem;">Bill ${sale.bill_number || `#${sale.id}`}</h2>
                            <span class="badge ${isVoided ? 'badge-danger' : 'badge-success'}">${sale.status.toUpperCase()}</span>
                        </div>
                        <div class="text-sm text-muted">Date: ${App.formatDateTime(sale.created_at)} | Billed By: ${sale.created_by_name || 'Staff'}</div>
                    </div>
                    <div style="display:flex;gap:0.5rem;">
                        <button class="btn btn-secondary" onclick="Sales.load()">Back</button>
                        <button class="btn btn-primary" onclick="Sales.printReceipt(${sale.id})">Print Receipt</button>
                        ${!isVoided ? `
                            <button class="btn btn-danger" onclick="Sales.promptVoidSale(${sale.id}, '${sale.bill_number || `#${sale.id}`}')">Void Sale</button>
                        ` : ''}
                    </div>
                </div>

                ${isVoided ? `
                    <div class="panel" style="background:var(--surface-sunken);border-left:4px solid var(--danger);margin-bottom:1rem;padding:0.75rem 1rem;">
                        <strong style="color:var(--danger);">Void Reason:</strong> ${sale.void_reason || 'No reason specified'}
                        <div class="text-xs text-muted" style="margin-top:0.25rem;">Voided on: ${App.formatDateTime(sale.voided_at)}</div>
                    </div>
                ` : ''}

                <div class="table-container" style="margin-bottom:1.5rem;">
                    <table>
                        <thead>
                            <tr>
                                <th>Item</th>
                                <th>Unit Price (₹)</th>
                                <th>Qty</th>
                                <th>GST</th>
                                <th>Subtotal (₹)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${sale.items.map(item => `
                                <tr>
                                    <td>
                                        <div style="font-weight:600;">${item.product_name}</div>
                                        <div class="text-xs text-muted"><code>${item.sku || '-'}</code></div>
                                    </td>
                                    <td>${item.price_display}</td>
                                    <td>${item.quantity_display} ${item.unit || ''}</td>
                                    <td>${item.gst_rate ? (item.gst_rate / 100) + '%' : '0%'}</td>
                                    <td style="font-weight:600;">${item.subtotal_display}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colspan="4" style="text-align:right;font-weight:600;">Subtotal:</td>
                                <td style="font-weight:600;">${sale.subtotal_display || sale.total_amount_display || '₹0.00'}</td>
                            </tr>
                            ${sale.tax_amount > 0 ? `
                                <tr>
                                    <td colspan="4" style="text-align:right;font-weight:600;">Total Tax (GST):</td>
                                    <td style="font-weight:600;">${sale.tax_amount_display}</td>
                                </tr>
                            ` : ''}
                            ${sale.discount_amount > 0 ? `
                                <tr>
                                    <td colspan="4" style="text-align:right;font-weight:600;color:var(--success);">Discount:</td>
                                    <td style="font-weight:600;color:var(--success);">- ${sale.discount_amount_display}</td>
                                </tr>
                            ` : ''}
                            <tr>
                                <td colspan="4" style="text-align:right;font-weight:700;font-size:1.15rem;">Final Total:</td>
                                <td style="font-weight:700;font-size:1.25rem;color:var(--accent);">${sale.total_amount_display}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                <div style="background:var(--surface-sunken);padding:1rem;border-radius:8px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:1rem;">
                    <div>
                        <div class="text-xs text-muted">Customer Account</div>
                        <div style="font-weight:600;">${sale.customer_name || 'Walk-in Cash Customer'}</div>
                    </div>
                    <div>
                        <div class="text-xs text-muted">Payment Mode</div>
                        <div style="font-weight:600;">${(sale.payment_mode || 'cash').toUpperCase()}</div>
                    </div>
                    <div>
                        <div class="text-xs text-muted">Payment Status</div>
                        <div style="font-weight:600;color:${sale.due_amount > 0 ? 'var(--danger)' : 'var(--success)'};">
                            ${sale.due_amount > 0 ? `Udhaar / Due: ${sale.due_amount_display}` : 'Fully Paid'}
                        </div>
                    </div>
                </div>
            </div>
        `);
    },

    promptVoidSale(id, billNumber) {
        const modalHtml = `
            <div class="modal-overlay active" id="voidSaleModal">
                <div class="modal" style="max-width:440px;">
                    <div class="modal-header">
                        <h3>Void Bill ${billNumber}</h3>
                        <button class="modal-close" onclick="document.getElementById('voidSaleModal').remove()">&times;</button>
                    </div>
                    <form id="voidSaleForm">
                        <div class="modal-body">
                            <div class="panel" style="margin-bottom:1rem;background:var(--surface-sunken);padding:0.75rem;">
                                <div style="font-size:0.8125rem;color:var(--danger);font-weight:600;">
                                    Voiding this sale will automatically restore inventory stock levels and reverse any customer udhaar balance accrued.
                                </div>
                            </div>
                            <div class="form-group">
                                <label>Reason for Voiding <span class="required">*</span></label>
                                <textarea name="reason" required minlength="3" rows="3" placeholder="e.g. Customer returned items / Wrong billing amount entered" class="form-control"></textarea>
                                <span class="help-text">Mandatory audit reason (min 3 characters).</span>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" onclick="document.getElementById('voidSaleModal').remove()">Cancel</button>
                            <button type="submit" class="btn btn-danger">Confirm Void</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        document.getElementById('voidSaleForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const body = { reason: fd.get('reason') };

            const resp = await App.api(`/api/sales/${id}/void`, { method: 'POST', body });
            if (resp && resp.success) {
                App.toast('Sale voided successfully. Stock restored.');
                document.getElementById('voidSaleModal')?.remove();
                Sales.load();
            } else {
                App.toast(resp?.error?.message || 'Failed to void sale.', 'error');
            }
        });
    },

    async printReceipt(id) {
        if (typeof window.printBillReceipt === 'function') {
            return window.printBillReceipt(id);
        }
        const resp = await App.api(`/api/sales/${id}/receipt`);
        if (!resp || !resp.success) {
            App.toast('Failed to generate receipt.', 'error');
            return;
        }

        const r = resp.data || {};
        const storeName = r.storeName || r.store?.name || 'INVENZO Store';
        const storeAddress = r.storeAddress || r.store?.address || '';
        const storeCity = r.storeCity || r.store?.city || '';
        const storePhone = r.storePhone || r.store?.phone || '';
        const billNumber = r.billNumber || r.bill?.billNumber || `#${id}`;
        const dateStr = App.formatDateTime(r.date || r.bill?.date || new Date().toISOString());
        const customerName = r.customerName || r.customer?.name || 'Walk-in Customer';
        const paymentMode = (r.paymentMode || r.bill?.paymentMode || 'cash').toUpperCase();
        const items = r.items || [];
        const subtotal = r.subtotal || r.bill?.totalAmount || '₹0.00';
        const taxAmount = r.taxAmount || '₹0.00';
        const discountAmount = r.discountAmount || '₹0.00';
        const totalAmount = r.totalAmount || r.bill?.totalAmount || '₹0.00';
        const footerText = r.footerText || r.store?.footer || 'Thank you for your visit!';

        const receiptHtml = `
            <div class="modal-overlay active" id="receiptModal" style="z-index:9999;">
                <div class="modal" style="max-width:380px;background:#fff;color:#000;">
                    <div class="modal-header" style="border-bottom:1px solid #ddd;padding:0.75rem 1rem;">
                        <h4 style="margin:0;color:#000;">Print Receipt</h4>
                        <button class="modal-close" onclick="document.getElementById('receiptModal').remove()">&times;</button>
                    </div>
                    <div class="modal-body receipt-print-area" id="receiptContent" style="padding:1rem;font-family:monospace;font-size:12px;line-height:1.4;">
                        <div style="text-align:center;margin-bottom:0.75rem;">
                            <div style="font-size:15px;font-weight:bold;">${storeName}</div>
                            ${storeAddress ? `<div>${storeAddress}</div>` : ''}
                            ${storeCity ? `<div>${storeCity}</div>` : ''}
                            ${storePhone ? `<div>Tel: ${storePhone}</div>` : ''}
                        </div>
                        <div style="border-top:1px dashed #000;border-bottom:1px dashed #000;padding:0.35rem 0;margin-bottom:0.5rem;">
                            <div>Bill No: <strong>${billNumber}</strong></div>
                            <div>Date: ${dateStr}</div>
                            <div>Customer: ${customerName}</div>
                            <div>Payment: ${paymentMode}</div>
                        </div>
                        <table style="width:100%;margin-bottom:0.5rem;border-collapse:collapse;font-size:11px;">
                            <thead>
                                <tr style="border-bottom:1px solid #000;">
                                    <th style="text-align:left;padding:0.25rem 0;">Item</th>
                                    <th style="text-align:center;">Qty</th>
                                    <th style="text-align:right;">Amt</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${items.map(it => `
                                    <tr>
                                        <td style="padding:0.2rem 0;">${it.name || it.product_name}</td>
                                        <td style="text-align:center;">${it.quantity || it.quantity_display}</td>
                                        <td style="text-align:right;">${it.amount || it.subtotal || it.subtotal_display}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                        <div style="border-top:1px dashed #000;padding-top:0.35rem;">
                            <div style="display:flex;justify-content:space-between;"><span>Subtotal:</span><span>${subtotal}</span></div>
                            ${taxAmount !== '₹0.00' ? `<div style="display:flex;justify-content:space-between;"><span>GST:</span><span>${taxAmount}</span></div>` : ''}
                            ${discountAmount !== '₹0.00' ? `<div style="display:flex;justify-content:space-between;"><span>Discount:</span><span>-${discountAmount}</span></div>` : ''}
                            <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:13px;border-top:1px solid #000;margin-top:0.25rem;padding-top:0.25rem;">
                                <span>TOTAL:</span><span>${totalAmount}</span>
                            </div>
                        </div>
                        <div style="text-align:center;margin-top:1rem;font-size:10px;">
                            ${footerText}
                        </div>
                    </div>
                    <div class="modal-footer" style="border-top:1px solid #ddd;padding:0.75rem 1rem;">
                        <button type="button" class="btn btn-secondary" onclick="document.getElementById('receiptModal').remove()">Close</button>
                        <button type="button" class="btn btn-primary" onclick="window.print()">Print</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', receiptHtml);
    }
};

window.Sales = Sales;
