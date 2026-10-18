// ============================================
// Suppliers Page
// ============================================
const Suppliers = {
    async load() {
        App.setTopbarActions(`
            <button class="btn btn-primary" onclick="Suppliers.showForm()">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>
                Add Supplier
            </button>
        `);
        await this.fetchSuppliers();
    },

    async fetchSuppliers() {
        const data = await App.api('/api/suppliers');
        if (!data || !data.success) {
            App.setContent(`<div class="empty-state" style="padding:3rem 1rem; text-align:center;"><h3>Failed to load suppliers</h3><p class="text-muted">${data?.error?.message || 'Please try again.'}</p><button class="btn btn-primary" onclick="Suppliers.fetchSuppliers()" style="margin-top:1rem;">Retry</button></div>`);
            return;
        }

        App.setContent(`
            <div class="card">
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Supplier</th>
                                <th style="width: 160px;">Phone</th>
                                <th style="width: 220px;">Email</th>
                                <th style="width: 120px;" class="text-center">Products</th>
                                <th style="width: 150px;" class="text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.data.length === 0 ? `<tr><td colspan="5"><div class="empty-state"><h3>No suppliers yet</h3><p>Add your first supplier.</p></div></td></tr>` :
                            data.data.map(s => `
                                <tr>
                                    <td>
                                        <div style="font-weight:600;color:var(--text);">${s.name}</div>
                                        ${s.address ? `<div class="text-muted text-xs" style="margin-top:0.2rem;">${s.address}</div>` : ''}
                                    </td>
                                    <td>${s.phone ? `<a href="tel:${s.phone}" style="color:var(--accent);font-weight:500;">${s.phone}</a>` : '<span class="text-muted">-</span>'}</td>
                                    <td class="text-sm">${s.email ? `<a href="mailto:${s.email}" style="color:var(--text-muted);">${s.email}</a>` : '<span class="text-muted">-</span>'}</td>
                                    <td class="text-center"><span class="badge badge-neutral" style="font-variant-numeric:tabular-nums;font-weight:600;">${s.product_count || 0}</span></td>
                                    <td class="text-right">
                                        <div class="action-btns">
                                            <button class="btn btn-sm btn-secondary" onclick="Suppliers.showForm(${s.id})" title="Edit">
                                                Edit
                                            </button>
                                            <button class="btn btn-sm btn-danger" onclick="Suppliers.deleteSupplier(${s.id}, '${s.name.replace(/'/g, "\\'")}')" title="Delete">
                                                Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `);
    },

    async showForm(id = null) {
        let supplier = null;
        if (id) {
            const resp = await App.api(`/api/suppliers/${id}`);
            if (resp.success) supplier = resp.data;
        }

        App.setContent(`
            <div class="panel" style="max-width:600px;margin:0 auto;">
                <div class="panel-header">
                    <h3 class="panel-title">${supplier ? 'Edit Supplier' : 'Add New Supplier'}</h3>
                </div>
                <div style="padding-top:1rem;">
                    <form id="supplierForm">
                        <div class="form-group">
                            <label>Supplier Name <span class="required">*</span></label>
                            <input type="text" name="name" class="form-control" value="${supplier?.name || ''}" required minlength="2" placeholder="e.g. Metro Cash & Carry">
                        </div>
                        <div class="form-group">
                            <label>Phone</label>
                            <input type="tel" name="phone" class="form-control" value="${supplier?.phone || ''}" placeholder="10-digit phone number">
                        </div>
                        <div class="form-group">
                            <label>Email</label>
                            <input type="email" name="email" class="form-control" value="${supplier?.email || ''}" placeholder="supplier@example.com">
                        </div>
                        <div class="form-group">
                            <label>Address</label>
                            <input type="text" name="address" class="form-control" value="${supplier?.address || ''}" placeholder="City, State">
                        </div>
                        <div style="display:flex;justify-content:flex-end;gap:0.75rem;margin-top:1.5rem;">
                            <button type="button" class="btn btn-secondary" onclick="Suppliers.load()">Cancel</button>
                            <button type="submit" class="btn btn-primary">${supplier ? 'Update Supplier' : 'Add Supplier'}</button>
                        </div>
                    </form>
                </div>
            </div>
        `);

        document.getElementById('supplierForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = new FormData(e.target);
            const body = Object.fromEntries(form);
            const url = supplier ? `/api/suppliers/${supplier.id}` : '/api/suppliers';
            const method = supplier ? 'PUT' : 'POST';

            const resp = await App.api(url, { method, body });
            if (resp.success) { App.toast(resp.message); Suppliers.load(); }
            else { App.toast(resp.error.message, 'error'); }
        });
    },

    async deleteSupplier(id, name) {
        const confirmed = await App.confirm(
            'Delete Supplier',
            `Are you sure you want to delete supplier "${name}"? This action cannot be undone.`,
            'Delete',
            'btn btn-danger'
        );
        if (!confirmed) return;

        const resp = await App.api(`/api/suppliers/${id}`, { method: 'DELETE' });
        if (resp.success) { App.toast(resp.message); this.fetchSuppliers(); }
        else { App.toast(resp.error.message, 'error'); }
    }
};

window.Suppliers = Suppliers;
