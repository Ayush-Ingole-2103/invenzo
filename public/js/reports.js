// ============================================
// Reports & CSV Export — PRD Section 12.10
// ============================================

const Reports = {
    currentReport: 'inventory', // 'inventory', 'sales', 'payment-summary', 'customer-dues'
    startDate: '',
    endDate: '',

    async load() {
        App.setContent(`
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.25rem;flex-wrap:wrap;gap:1rem;">
                <div class="toolbar" style="margin:0;">
                    <button class="btn ${this.currentReport === 'inventory' ? 'btn-primary' : 'btn-secondary'}" onclick="Reports.switchReport('inventory')">Inventory Report</button>
                    <button class="btn ${this.currentReport === 'sales' ? 'btn-primary' : 'btn-secondary'}" onclick="Reports.switchReport('sales')">Sales Report</button>
                    <button class="btn ${this.currentReport === 'payment-summary' ? 'btn-primary' : 'btn-secondary'}" onclick="Reports.switchReport('payment-summary')">Payment Summary</button>
                    <button class="btn ${this.currentReport === 'customer-dues' ? 'btn-primary' : 'btn-secondary'}" onclick="Reports.switchReport('customer-dues')">Customer Dues (Udhaar)</button>
                </div>
                <button class="btn btn-secondary" onclick="Reports.exportCSV()">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                    Export CSV
                </button>
            </div>
            <div id="reportContent">
                <div class="loading-spinner"><div class="spinner"></div><p>Loading report...</p></div>
            </div>
        `);

        this.loadReport();
    },

    switchReport(type) {
        this.currentReport = type;
        this.load();
    },

    async loadReport() {
        const container = document.getElementById('reportContent');
        if (!container) return;

        switch (this.currentReport) {
            case 'inventory': return this.loadInventoryReport(container);
            case 'sales': return this.loadSalesReport(container);
            case 'payment-summary': return this.loadPaymentSummaryReport(container);
            case 'customer-dues': return this.loadCustomerDuesReport(container);
        }
    },

    async loadInventoryReport(container) {
        const resp = await App.api('/api/reports/inventory');
        if (!resp || !resp.success) {
            container.innerHTML = '<div class="empty-state" style="padding:2rem;"><p>Failed to load inventory report.</p></div>';
            return;
        }

        const items = resp.data || [];
        container.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h3>Inventory Report (${items.length} products)</h3>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Product</th>
                                <th>SKU</th>
                                <th>Category</th>
                                <th>Current Stock</th>
                                <th>Min Threshold</th>
                                <th>Selling Price</th>
                                <th>Cost Price</th>
                                <th>Stock Value (at Cost)</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${items.map(r => `
                                <tr>
                                    <td style="font-weight:600;">${r.name}</td>
                                    <td><code>${r.sku}</code></td>
                                    <td>${r.category}</td>
                                    <td style="font-weight:600;">${r.stock}</td>
                                    <td>${r.minimum_stock}</td>
                                    <td>${r.price}</td>
                                    <td>${r.cost_price}</td>
                                    <td style="font-weight:600;color:var(--accent);">${r.stock_value_at_cost}</td>
                                    <td>
                                        <span class="badge ${r.status === 'Out of stock' ? 'badge-danger' : (r.status === 'Low stock' ? 'badge-warning' : 'badge-success')}">
                                            ${r.status}
                                        </span>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    async loadSalesReport(container) {
        const resp = await App.api('/api/reports/sales');
        if (!resp || !resp.success) {
            container.innerHTML = '<div class="empty-state" style="padding:2rem;"><p>Failed to load sales report.</p></div>';
            return;
        }

        const items = resp.data || [];
        container.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h3>Sales Report (${items.length} records)</h3>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Bill #</th>
                                <th>Date & Time</th>
                                <th>Customer</th>
                                <th>Total (₹)</th>
                                <th>Mode</th>
                                <th>Paid</th>
                                <th>Due</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${items.map(r => `
                                <tr>
                                    <td><code>${r.bill_number}</code></td>
                                    <td>${App.formatDateTime(r.date)}</td>
                                    <td>${r.customer}</td>
                                    <td style="font-weight:700;">${r.total}</td>
                                    <td><span class="badge badge-neutral">${(r.payment_mode || 'cash').toUpperCase()}</span></td>
                                    <td style="color:var(--success);font-weight:600;">${r.paid}</td>
                                    <td style="color:${r.due !== '₹0.00' ? 'var(--danger)' : 'var(--text)'};font-weight:600;">${r.due}</td>
                                    <td><span class="badge ${r.status === 'voided' ? 'badge-danger' : 'badge-success'}">${r.status.toUpperCase()}</span></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    async loadPaymentSummaryReport(container) {
        const resp = await App.api('/api/reports/payment-summary');
        if (!resp || !resp.success) {
            container.innerHTML = '<div class="empty-state" style="padding:2rem;"><p>Failed to load payment summary.</p></div>';
            return;
        }

        const s = resp.data || {};
        container.innerHTML = `
            <div class="card" style="padding:1.5rem;max-width:700px;margin:0 auto;">
                <div class="card-header" style="margin-bottom:1.5rem;">
                    <h3>Cash, UPI & Udhaar Reconciliation Summary</h3>
                </div>
                <div style="display:flex;flex-direction:column;gap:1.25rem;">
                    <div class="panel" style="background:var(--surface-sunken);">
                        <div class="text-xs text-muted font-semibold uppercase">Total Counter Sales Billed</div>
                        <div style="font-size:1.75rem;font-weight:700;color:var(--text);margin-top:0.25rem;">${s.grandTotal}</div>
                    </div>

                    <div class="grid-2">
                        <div class="panel">
                            <div class="text-xs text-muted">Cash Billed at Counter</div>
                            <div style="font-size:1.25rem;font-weight:700;color:var(--success);">${s.cashBilled}</div>
                        </div>
                        <div class="panel">
                            <div class="text-xs text-muted">UPI Billed at Counter</div>
                            <div style="font-size:1.25rem;font-weight:700;color:var(--accent);">${s.upiBilled}</div>
                        </div>
                    </div>

                    <div class="grid-2">
                        <div class="panel">
                            <div class="text-xs text-muted">Udhaar / Credit Issued</div>
                            <div style="font-size:1.25rem;font-weight:700;color:var(--danger);">${s.creditDue}</div>
                        </div>
                        <div class="panel">
                            <div class="text-xs text-muted">Customer Dues Collected Later</div>
                            <div style="font-size:1.25rem;font-weight:700;color:var(--success);">${s.duesCollectedTotal}</div>
                            <div class="text-xs text-muted" style="margin-top:0.25rem;">Cash: ${s.duesCollectedCash} · UPI: ${s.duesCollectedUpi}</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    async loadCustomerDuesReport(container) {
        const resp = await App.api('/api/reports/customer-dues');
        if (!resp || !resp.success) {
            container.innerHTML = '<div class="empty-state" style="padding:2rem;"><p>Failed to load customer dues report.</p></div>';
            return;
        }

        const items = resp.data || [];
        container.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h3>Customer Outstanding Dues Report (${items.length} accounts with balance)</h3>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Customer Name</th>
                                <th>Mobile Phone</th>
                                <th>Outstanding Dues</th>
                                <th>Credit Limit</th>
                                <th>Last Payment Recorded</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${items.length === 0 ? `
                                <tr><td colspan="5"><div class="empty-state" style="padding:2rem 1rem;text-align:center;"><p class="text-muted">No customers currently have outstanding dues.</p></div></td></tr>
                            ` : items.map(r => `
                                <tr>
                                    <td style="font-weight:600;">${r.name}</td>
                                    <td>${r.phone}</td>
                                    <td style="font-weight:700;color:var(--danger);font-size:1rem;">${r.balance}</td>
                                    <td>${r.credit_limit}</td>
                                    <td>${App.formatDateTime(r.last_payment)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    exportCSV() {
        const endpoint = `/api/reports/${this.currentReport}?format=csv`;
        window.open(endpoint, '_blank');
    }
};

window.Reports = Reports;
