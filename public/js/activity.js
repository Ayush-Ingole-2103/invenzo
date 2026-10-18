// ============================================
// Activity Log Page — PRD Section 12.11
// ============================================

const Activity = {
    page: 1,
    limit: 25,
    action: '',

    async load() {
        App.setTopbarActions(`
            <button class="btn btn-secondary" onclick="Activity.load()">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>
                Refresh
            </button>
        `);
        await this.fetchLogs();
    },

    async fetchLogs() {
        const params = new URLSearchParams({
            page: this.page,
            limit: this.limit,
            action: this.action
        });

        const resp = await App.api(`/api/activity?${params}`);
        if (!resp || !resp.success) {
            App.setContent(`
                <div class="empty-state">
                    <h3>Failed to load activity logs</h3>
                    <p class="text-muted">${resp?.error?.message || 'Please try again.'}</p>
                </div>
            `);
            return;
        }

        const logs = resp.data || [];
        const meta = resp.meta || {};

        App.setContent(`
            <div class="card">
                <div class="toolbar" style="margin-bottom:1rem;display:flex;gap:1rem;align-items:center;flex-wrap:wrap;">
                    <div style="font-weight:600;font-size:1rem;">Store Audit Log</div>
                    <select class="filter-select" onchange="Activity.onActionFilter(this.value)">
                        <option value="" ${!this.action ? 'selected' : ''}>All Actions</option>
                        <option value="SALE_COMPLETED" ${this.action === 'SALE_COMPLETED' ? 'selected' : ''}>Sales Completed</option>
                        <option value="SALE_VOIDED" ${this.action === 'SALE_VOIDED' ? 'selected' : ''}>Sales Voided</option>
                        <option value="STOCK_ADDED" ${this.action === 'STOCK_ADDED' ? 'selected' : ''}>Stock Added</option>
                        <option value="STOCK_ADJUSTED" ${this.action === 'STOCK_ADJUSTED' ? 'selected' : ''}>Stock Adjusted</option>
                        <option value="CUSTOMER_CREATED" ${this.action === 'CUSTOMER_CREATED' ? 'selected' : ''}>Customer Created</option>
                        <option value="CUSTOMER_PAYMENT" ${this.action === 'CUSTOMER_PAYMENT' ? 'selected' : ''}>Customer Payment</option>
                        <option value="CUSTOMER_WRITEOFF" ${this.action === 'CUSTOMER_WRITEOFF' ? 'selected' : ''}>Customer Write-off</option>
                    </select>
                </div>

                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Timestamp</th>
                                <th>User</th>
                                <th>Action</th>
                                <th>Entity</th>
                                <th>Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${logs.length === 0 ? `
                                <tr>
                                    <td colspan="5">
                                        <div class="empty-state" style="padding:2.5rem 1rem;text-align:center;">
                                            <p class="text-muted">No activity records found.</p>
                                        </div>
                                    </td>
                                </tr>
                            ` : logs.map(l => {
                                let detailsFormatted = '-';
                                if (l.details) {
                                    try {
                                        const parsed = JSON.parse(l.details);
                                        detailsFormatted = Object.entries(parsed)
                                            .map(([k, v]) => `<span style="display:inline-block;margin-right:0.75rem;"><strong style="font-size:0.75rem;color:var(--text-secondary);">${k}:</strong> <code style="font-size:0.8125rem;">${v}</code></span>`)
                                            .join('');
                                    } catch {
                                        detailsFormatted = l.details;
                                    }
                                }

                                return `
                                    <tr>
                                        <td style="white-space:nowrap;">${App.formatDateTime(l.created_at)}</td>
                                        <td><strong>${l.user_name || 'System'}</strong></td>
                                        <td>
                                            <span class="badge ${l.action.includes('VOID') || l.action.includes('WRITEOFF') ? 'badge-warning' : (l.action.includes('SALE') ? 'badge-success' : 'badge-primary')}">
                                                ${l.action}
                                            </span>
                                        </td>
                                        <td><span class="text-sm font-semibold">${l.entity_type} #${l.entity_id || '-'}</span></td>
                                        <td style="max-width:340px;overflow:hidden;text-overflow:ellipsis;">
                                            ${detailsFormatted}
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>

                ${meta.total > meta.limit ? `
                    <div class="pagination" style="padding:1rem;display:flex;justify-content:space-between;align-items:center;">
                        <span class="text-sm text-muted">Page ${meta.page} of ${Math.ceil(meta.total / meta.limit)} (${meta.total} records)</span>
                        <div class="pagination-controls" style="display:flex;gap:0.5rem;">
                            <button class="btn btn-sm btn-secondary" onclick="Activity.changePage(${meta.page - 1})" ${meta.page <= 1 ? 'disabled' : ''}>Prev</button>
                            <button class="btn btn-sm btn-secondary" onclick="Activity.changePage(${meta.page + 1})" ${meta.page * meta.limit >= meta.total ? 'disabled' : ''}>Next</button>
                        </div>
                    </div>
                ` : ''}
            </div>
        `);
    },

    onActionFilter(act) {
        this.action = act;
        this.page = 1;
        this.fetchLogs();
    },

    changePage(p) {
        this.page = p;
        this.fetchLogs();
    }
};

window.Activity = Activity;
