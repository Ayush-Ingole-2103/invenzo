// ============================================
// Customers & Udhaar Credit Ledger — PRD 12.6
// ============================================

const Customers = {
    page: 1,
    limit: 20,
    search: '',
    withDues: false,
    selectedCustomerId: null,

    async load() {
        this.selectedCustomerId = null;
        App.setTopbarActions(`
            <button class="btn btn-primary" onclick="Customers.showCreateModal()">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/></svg>
                <span data-i18n="customers.addCustomer">Add Customer</span>
            </button>
        `);
        await this.fetchCustomers();
    },

    async fetchCustomers() {
        const params = new URLSearchParams({
            page: this.page,
            limit: this.limit,
            search: this.search,
            withDues: this.withDues ? '1' : '0'
        });

        const isSearchFocused = document.activeElement && document.activeElement.id === 'custSearch';

        const resp = await App.api(`/api/customers?${params}`);
        if (!resp || !resp.success) {
            App.setContent(`
                <div class="empty-state">
                    <h3>Failed to load customers</h3>
                    <p class="text-muted">${resp?.error?.message || 'Please try again.'}</p>
                    <button class="btn btn-primary" onclick="Customers.fetchCustomers()">Retry</button>
                </div>
            `);
            return;
        }

        const customers = resp.data || [];
        const meta = resp.meta || {};

        App.setContent(`
            <!-- Dues Summary Banner -->
            <div class="panel" style="margin-bottom:1.25rem;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;">
                <div style="display:flex;align-items:center;gap:1rem;">
                    <div style="width:48px;height:48px;border-radius:10px;background:var(--surface-sunken);display:flex;align-items:center;justify-content:center;color:var(--accent);">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
                    </div>
                    <div>
                        <div class="text-muted text-sm" data-i18n="customers.totalOutstanding">Total Outstanding Dues (Udhaar)</div>
                        <div style="font-size:1.5rem;font-weight:700;color:var(--danger);">${meta.totalOutstandingDisplay || '₹0.00'}</div>
                    </div>
                </div>
                <div style="display:flex;align-items:center;gap:0.75rem;">
                    <button class="btn ${this.withDues ? 'btn-primary' : 'btn-secondary'}" onclick="Customers.toggleWithDues()">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                        ${this.withDues ? 'Showing Dues Only' : 'Filter Dues Only'}
                    </button>
                </div>
            </div>

            <!-- Search & List Table -->
            <div class="toolbar" style="margin-bottom:1.25rem;">
                <div class="search-box" style="flex:1;max-width:420px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/></svg>
                    <input type="text" id="custSearch" placeholder="Search by customer name or 10-digit mobile..." value="${this.search}" oninput="Customers.onSearch(this.value)">
                </div>
            </div>

            <div class="card">
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Customer</th>
                                <th style="width: 150px;">Mobile Number</th>
                                <th style="width: 140px;" class="text-right">Credit Limit</th>
                                <th style="width: 150px;" class="text-right">Balance Due (₹)</th>
                                <th style="width: 180px;">Last Activity</th>
                                <th style="width: 160px;" class="text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${customers.length === 0 ? `
                                <tr>
                                    <td colspan="6">
                                        <div class="empty-state" style="padding:2.5rem 1rem;text-align:center;">
                                            <h3>No customers found</h3>
                                            <p class="text-muted">${this.search || this.withDues ? 'Try clearing your search or filter.' : 'Add your first customer to track udhaar and credit balances.'}</p>
                                        </div>
                                    </td>
                                </tr>
                            ` : customers.map(c => `
                                <tr>
                                    <td>
                                        <div style="font-weight:600;color:var(--text);">${c.name}</div>
                                        <div class="text-muted text-xs" style="margin-top:0.15rem;">ID: #${c.id}</div>
                                    </td>
                                    <td>
                                        ${c.phone ? `<a href="tel:${c.phone}" style="font-weight:500;color:var(--accent);font-variant-numeric:tabular-nums;">${c.phone}</a>` : '<span class="text-muted">-</span>'}
                                    </td>
                                    <td class="text-right" style="font-variant-numeric:tabular-nums;">
                                        ${c.credit_limit_display ? c.credit_limit_display : '<span class="text-muted text-xs">No limit</span>'}
                                    </td>
                                    <td class="text-right">
                                        <span class="badge ${c.balance > 0 ? 'badge-danger' : (c.balance < 0 ? 'badge-success' : 'badge-neutral')}" style="font-size:0.8125rem;font-variant-numeric:tabular-nums;">
                                            ${c.balance_display}
                                        </span>
                                    </td>
                                    <td class="text-muted text-sm">${App.formatDateTime(c.last_activity)}</td>
                                    <td class="text-right">
                                        <div class="action-btns">
                                            <button class="btn btn-sm btn-secondary" onclick="Customers.viewCustomer(${c.id})" title="View Ledger">
                                                Ledger
                                            </button>
                                            ${c.balance > 0 ? `
                                                <button class="btn btn-sm btn-success" onclick="Customers.showPaymentModal(${c.id}, '${c.name.replace(/'/g, "\\'")}', ${c.balance})" title="Record Payment">
                                                    Pay
                                                </button>
                                                ${c.phone ? `
                                                    <a href="https://wa.me/91${c.phone}?text=${encodeURIComponent(`Namaste ${c.name}, your outstanding dues at ${App.user?.storeName || 'our store'} is ${c.balance_display}. Kindly arrange the payment at your earliest convenience.`)}" target="_blank" class="btn btn-sm btn-secondary" title="WhatsApp Reminder" style="display:inline-flex;align-items:center;padding:0.25rem 0.45rem;">
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/></svg>
                                                    </a>
                                                ` : ''}
                                            ` : ''}
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>

                ${meta.total > meta.limit ? `
                    <div class="pagination" style="padding:1rem;display:flex;justify-content:space-between;align-items:center;">
                        <span class="text-sm text-muted">Page ${meta.page} of ${Math.ceil(meta.total / meta.limit)} (${meta.total} customers)</span>
                        <div class="pagination-controls" style="display:flex;gap:0.5rem;">
                            <button class="btn btn-sm btn-secondary" onclick="Customers.changePage(${meta.page - 1})" ${meta.page <= 1 ? 'disabled' : ''}>Prev</button>
                            <button class="btn btn-sm btn-secondary" onclick="Customers.changePage(${meta.page + 1})" ${meta.page * meta.limit >= meta.total ? 'disabled' : ''}>Next</button>
                        </div>
                    </div>
                ` : ''}
            </div>
        `);

        if (isSearchFocused) {
            const input = document.getElementById('custSearch');
            if (input) {
                input.focus();
                input.setSelectionRange(input.value.length, input.value.length);
            }
        }
    },

    onSearch(val) {
        clearTimeout(this._searchTimer);
        this.search = val;
        this._searchTimer = setTimeout(() => {
            this.page = 1;
            this.fetchCustomers();
        }, 250);
    },

    toggleWithDues() {
        this.withDues = !this.withDues;
        this.page = 1;
        this.fetchCustomers();
    },

    changePage(p) {
        this.page = p;
        this.fetchCustomers();
    },

    // View Single Customer Ledger
    async viewCustomer(id) {
        this.selectedCustomerId = id;
        const resp = await App.api(`/api/customers/${id}`);
        if (!resp || !resp.success) {
            App.toast(resp?.error?.message || 'Failed to load customer details.', 'error');
            return;
        }

        const c = resp.data;
        const ledger = c.ledger || [];

        App.setTopbarActions(`
            <button class="btn btn-secondary" onclick="Customers.load()">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                Back to Customers
            </button>
            ${c.balance > 0 ? `
                <button class="btn btn-success" onclick="Customers.showPaymentModal(${c.id}, '${c.name.replace(/'/g, "\\'")}', ${c.balance})">
                    Record Payment
                </button>
                <button class="btn btn-warning" onclick="Customers.showWriteoffModal(${c.id}, '${c.name.replace(/'/g, "\\'")}', ${c.balance})">
                    Write-off Dues
                </button>
            ` : ''}
            ${c.balance === 0 ? `
                <button class="btn btn-danger" onclick="Customers.eraseCustomer(${c.id}, '${c.name.replace(/'/g, "\\'")}')">
                    Erase Details
                </button>
            ` : ''}
        `);

        App.setContent(`
            <!-- Customer Profile Header Card -->
            <div class="panel" style="margin-bottom:1.5rem;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:1rem;">
                    <div>
                        <h2 style="margin:0 0 0.5rem 0;font-size:1.4rem;">${c.name}</h2>
                        <div style="display:flex;gap:1.5rem;flex-wrap:wrap;" class="text-sm">
                            <div><strong>Phone:</strong> ${c.phone ? `<a href="tel:${c.phone}">${c.phone}</a>` : 'Not provided'}</div>
                            <div><strong>Credit Limit:</strong> ${c.credit_limit_display || 'Unlimited'}</div>
                            <div><strong>Consent Recorded:</strong> ${App.formatDateTime(c.consent_recorded_at)}</div>
                        </div>
                    </div>
                    <div style="text-align:right;">
                        <div class="text-muted text-sm">Current Balance Due</div>
                        <div style="font-size:1.75rem;font-weight:700;color:${c.balance > 0 ? 'var(--danger)' : (c.balance < 0 ? 'var(--success)' : 'var(--text)')};">
                            ${c.balance_display}
                        </div>
                    </div>
                </div>
            </div>

            <!-- Ledger Entries Table -->
            <div class="card">
                <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
                    <h3>Transaction Ledger</h3>
                    <span class="text-sm text-muted">${ledger.length} entries recorded</span>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Date & Time</th>
                                <th>Type</th>
                                <th>Change (₹)</th>
                                <th>Balance After (₹)</th>
                                <th>Mode / Ref</th>
                                <th>Note</th>
                                <th>Recorded By</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${ledger.length === 0 ? `
                                <tr>
                                    <td colspan="7">
                                        <div class="empty-state" style="padding:2rem 1rem;text-align:center;">
                                            <p class="text-muted">No transactions on record for this customer.</p>
                                        </div>
                                    </td>
                                </tr>
                            ` : ledger.map(entry => {
                                const isDebit = entry.amount_change > 0; // increased dues
                                return `
                                    <tr>
                                        <td>${App.formatDateTime(entry.created_at)}</td>
                                        <td>
                                            <span class="badge ${entry.type === 'payment' ? 'badge-success' : (entry.type === 'writeoff' ? 'badge-warning' : 'badge-primary')}">
                                                ${entry.type.toUpperCase()}
                                            </span>
                                        </td>
                                        <td style="font-weight:600;color:${isDebit ? 'var(--danger)' : 'var(--success)'};">
                                            ${isDebit ? '+' : ''}${entry.amount_change_display}
                                        </td>
                                        <td style="font-weight:600;">${entry.balance_after_display}</td>
                                        <td>${entry.payment_mode ? entry.payment_mode.toUpperCase() : '-'} ${entry.sale_id ? `(#${entry.sale_id})` : ''}</td>
                                        <td>${entry.note || '-'}</td>
                                        <td>${entry.created_by_name || '-'}</td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `);
    },

    // Create Customer Modal
    showCreateModal() {
        const modalHtml = `
            <div class="modal-overlay active" id="createCustModal">
                <div class="modal" style="max-width:480px;">
                    <div class="modal-header">
                        <h3>Add New Customer</h3>
                        <button class="modal-close" onclick="document.getElementById('createCustModal').remove()">&times;</button>
                    </div>
                    <form id="createCustForm">
                        <div class="modal-body">
                            <div class="form-group">
                                <label>Customer Name <span class="required">*</span></label>
                                <input type="text" name="name" required minlength="2" maxlength="80" placeholder="e.g. Ramesh Patel" class="form-control">
                            </div>
                            <div class="form-group">
                                <label>Mobile Number (10 Digits)</label>
                                <input type="tel" name="phone" pattern="[6-9][0-9]{9}" maxlength="10" placeholder="e.g. 9876543210" class="form-control">
                                <span class="help-text">Indian 10-digit mobile number</span>
                            </div>
                            <div class="form-group">
                                <label>Credit Limit (₹, Optional)</label>
                                <input type="number" step="0.01" min="0" name="creditLimit" placeholder="e.g. 5000" class="form-control">
                            </div>
                            <div class="form-group" style="margin-top:1.25rem;background:var(--surface-sunken);padding:0.75rem;border-radius:8px;">
                                <label style="display:flex;align-items:flex-start;gap:0.5rem;font-size:0.8125rem;font-weight:normal;cursor:pointer;">
                                    <input type="checkbox" name="consentGiven" required style="margin-top:0.2rem;">
                                    <span><strong>Customer Consent:</strong> Customer has explicitly consented to recording their contact and transaction details for credit ledger management under Indian DPDP privacy norms.</span>
                                </label>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" onclick="document.getElementById('createCustModal').remove()">Cancel</button>
                            <button type="submit" class="btn btn-primary">Create Account</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        document.getElementById('createCustForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const body = {
                name: fd.get('name'),
                phone: fd.get('phone') || null,
                creditLimit: fd.get('creditLimit') ? parseFloat(fd.get('creditLimit')) : null,
                consentGiven: fd.get('consentGiven') === 'on'
            };

            const resp = await App.api('/api/customers', { method: 'POST', body });
            if (resp && resp.success) {
                App.toast('Customer account created successfully.');
                document.getElementById('createCustModal')?.remove();
                Customers.fetchCustomers();
            } else {
                App.toast(resp?.error?.message || 'Failed to create customer.', 'error');
            }
        });
    },

    // Record Payment Modal
    showPaymentModal(customerId, customerName, currentBalancePaise) {
        const balanceRupees = (currentBalancePaise / 100).toFixed(2);
        const upiId = App.settings.upiId || App.store?.upiId || '';

        const modalHtml = `
            <div class="modal-overlay active" id="payCustModal">
                <div class="modal" style="max-width:480px;">
                    <div class="modal-header">
                        <h3>Record Payment — ${customerName}</h3>
                        <button class="modal-close" onclick="document.getElementById('payCustModal').remove()">&times;</button>
                    </div>
                    <form id="payCustForm">
                        <div class="modal-body">
                            <div class="panel" style="margin-bottom:1rem;display:flex;justify-content:space-between;align-items:center;">
                                <span class="text-sm text-muted">Current Outstanding:</span>
                                <span style="font-weight:700;color:var(--danger);font-size:1.15rem;">₹${balanceRupees}</span>
                            </div>

                            <div class="form-group">
                                <label>Amount Received (₹) <span class="required">*</span></label>
                                <input type="number" step="0.01" min="0.01" max="${balanceRupees}" name="amount" value="${balanceRupees}" required class="form-control" id="payAmountInput">
                            </div>

                            <div class="form-group">
                                <label>Payment Mode <span class="required">*</span></label>
                                <select name="paymentMode" class="form-control" id="payModeSelect">
                                    <option value="cash">Cash</option>
                                    <option value="upi">UPI</option>
                                    <option value="card">Card</option>
                                    <option value="other">Other / Bank</option>
                                </select>
                            </div>

                            <div class="form-group">
                                <label>Note / Reference</label>
                                <input type="text" name="note" placeholder="e.g. Google Pay transaction #..." class="form-control">
                            </div>

                            ${upiId ? `
                                <div id="upiQrSection" style="margin-top:1rem;text-align:center;display:none;background:var(--surface-sunken);padding:1rem;border-radius:8px;">
                                    <div class="text-sm font-semibold mb-1">Scan & Pay via UPI</div>
                                    <div id="paymentUpiQr" style="display:flex;justify-content:center;margin:0.5rem 0;"></div>
                                    <div class="text-xs text-muted">UPI ID: <code>${upiId}</code></div>
                                </div>
                            ` : ''}
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" onclick="document.getElementById('payCustModal').remove()">Cancel</button>
                            <button type="submit" class="btn btn-success">Confirm Payment</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        const modeSelect = document.getElementById('payModeSelect');
        const qrSection = document.getElementById('upiQrSection');
        const amountInput = document.getElementById('payAmountInput');

        const updateQr = () => {
            if (!qrSection || !window.QRCode) return;
            if (modeSelect.value === 'upi' && upiId) {
                qrSection.style.display = 'block';
                const amt = parseFloat(amountInput.value) || 0;
                const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(App.user?.storeName || 'Store')}&am=${amt.toFixed(2)}&cu=INR&tn=${encodeURIComponent(`Payment by ${customerName}`)}`;
                const qrContainer = document.getElementById('paymentUpiQr');
                qrContainer.innerHTML = '';
                new QRCode(qrContainer, { text: upiUrl, width: 140, height: 140 });
            } else {
                qrSection.style.display = 'none';
            }
        };

        modeSelect.addEventListener('change', updateQr);
        amountInput.addEventListener('input', updateQr);

        document.getElementById('payCustForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const body = {
                amount: parseFloat(fd.get('amount')),
                paymentMode: fd.get('paymentMode'),
                note: fd.get('note')
            };

            const resp = await App.api(`/api/customers/${customerId}/payments`, { method: 'POST', body });
            if (resp && resp.success) {
                App.toast('Payment recorded successfully.');
                document.getElementById('payCustModal')?.remove();
                if (Customers.selectedCustomerId === customerId) {
                    Customers.viewCustomer(customerId);
                } else {
                    Customers.fetchCustomers();
                }
            } else {
                App.toast(resp?.error?.message || 'Failed to record payment.', 'error');
            }
        });
    },

    // Write-off Modal
    showWriteoffModal(customerId, customerName, currentBalancePaise) {
        const balanceRupees = (currentBalancePaise / 100).toFixed(2);
        const modalHtml = `
            <div class="modal-overlay active" id="writeoffModal">
                <div class="modal" style="max-width:480px;">
                    <div class="modal-header">
                        <h3>Write-off Dues — ${customerName}</h3>
                        <button class="modal-close" onclick="document.getElementById('writeoffModal').remove()">&times;</button>
                    </div>
                    <form id="writeoffForm">
                        <div class="modal-body">
                            <div class="panel" style="margin-bottom:1rem;background:var(--surface-sunken);">
                                <div class="text-sm text-muted">Outstanding: <strong>₹${balanceRupees}</strong></div>
                                <div class="text-xs text-muted" style="margin-top:0.25rem;">Writing off dues will reduce the customer's balance without receiving payment.</div>
                            </div>

                            <div class="form-group">
                                <label>Write-off Amount (₹) <span class="required">*</span></label>
                                <input type="number" step="0.01" min="0.01" max="${balanceRupees}" name="amount" value="${balanceRupees}" required class="form-control">
                            </div>

                            <div class="form-group">
                                <label>Reason for Write-off <span class="required">*</span></label>
                                <textarea name="reason" required minlength="3" rows="3" placeholder="e.g. Customer moved / Uncollectible small balance" class="form-control"></textarea>
                                <span class="help-text">A clear business reason is mandatory for audit logging.</span>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" onclick="document.getElementById('writeoffModal').remove()">Cancel</button>
                            <button type="submit" class="btn btn-warning">Confirm Write-off</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        document.getElementById('writeoffForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const body = {
                amount: parseFloat(fd.get('amount')),
                reason: fd.get('reason')
            };

            const resp = await App.api(`/api/customers/${customerId}/writeoffs`, { method: 'POST', body });
            if (resp && resp.success) {
                App.toast('Dues written off successfully.');
                document.getElementById('writeoffModal')?.remove();
                if (Customers.selectedCustomerId === customerId) {
                    Customers.viewCustomer(customerId);
                } else {
                    Customers.fetchCustomers();
                }
            } else {
                App.toast(resp?.error?.message || 'Failed to write off dues.', 'error');
            }
        });
    },

    // Erase Customer Data (Allowed only when balance is zero)
    async eraseCustomer(customerId, customerName) {
        const confirmed = await App.confirm(
            'Erase Customer Details',
            `Are you sure you want to erase all personal details for "${customerName}"? Under Indian DPDP privacy regulations, this will redact their name and phone number. Ledger transactions will remain anonymized for financial audits.`,
            'Erase Details',
            'btn btn-danger'
        );
        if (!confirmed) return;

        const resp = await App.api(`/api/customers/${customerId}/erase`, { method: 'POST' });
        if (resp && resp.success) {
            App.toast('Customer personal details have been erased.');
            Customers.load();
        } else {
            App.toast(resp?.error?.message || 'Failed to erase customer details.', 'error');
        }
    }
};

window.Customers = Customers;
