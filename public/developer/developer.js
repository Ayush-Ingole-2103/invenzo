// ============================================
// Developer Portal Frontend Logic — PRD Section 17
// ============================================

let currentDev = null;
let currentTab = 'overview';
const storesCache = {};

async function init() {
    try {
        const res = await fetch('/developer/api/auth/me');
        if (!res.ok) {
            window.location.href = '/developer/login';
            return;
        }
        const data = await res.json();
        currentDev = data.data;
        document.getElementById('devName').textContent = currentDev.name;
        document.getElementById('devAvatar').textContent = currentDev.name.charAt(0).toUpperCase();

        setupNav();
        setupEvents();
        loadTab('overview');
    } catch {
        window.location.href = '/developer/login';
    }
}

function setupNav() {
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.getAttribute('data-page');
            document.querySelectorAll('.sidebar-nav .nav-item').forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            loadTab(page);
        });
    });

    document.getElementById('devLogoutBtn').addEventListener('click', async () => {
        await fetch('/developer/api/auth/logout', { method: 'POST' });
        window.location.href = '/developer/login';
    });

    document.getElementById('btnCreateStoreModal').addEventListener('click', () => {
        showCreateStoreModal();
    });
}

function setupEvents() {}

function showToast(msg) {
    const container = document.getElementById('devToastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

async function loadTab(tab) {
    currentTab = tab;
    const content = document.getElementById('devContent');
    const title = document.getElementById('devTitle');

    if (tab === 'overview') {
        title.textContent = 'Platform Overview';
        content.innerHTML = '<p class="empty-state">Loading overview...</p>';
        const res = await fetch('/developer/api/overview');
        const data = await res.json();
        if (data.success) renderOverview(data.data);
    } else if (tab === 'stores') {
        title.textContent = 'Stores';
        content.innerHTML = '<p class="empty-state">Loading stores...</p>';
        loadStores();
    } else if (tab === 'audit') {
        title.textContent = 'Developer Audit Log';
        content.innerHTML = '<p class="empty-state">Loading audit logs...</p>';
        const res = await fetch('/developer/api/audit');
        const data = await res.json();
        if (data.success) renderAudit(data.data);
    }
}

function renderOverview(d) {
    const content = document.getElementById('devContent');
    content.innerHTML = `
        <div class="section-grid">
            <div class="stat-card">
                <div class="stat-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/></svg>
                </div>
                <div class="stat-info">
                    <div class="stat-label">Total Stores</div>
                    <div class="stat-value">${d.totalStores}</div>
                    <div class="stat-sub">${d.activeStores} active, ${d.suspendedStores} suspended</div>
                </div>
            </div>

            <div class="stat-card">
                <div class="stat-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z"/><path d="m7 16.5-4.74-2.85"/><path d="m7 16.5 5-3"/><path d="M7 16.5v5.17"/></svg>
                </div>
                <div class="stat-info">
                    <div class="stat-label">Active Products</div>
                    <div class="stat-value">${d.totalProducts}</div>
                    <div class="stat-sub">Across all stores</div>
                </div>
            </div>

            <div class="stat-card">
                <div class="stat-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>
                </div>
                <div class="stat-info">
                    <div class="stat-label">Total Platform Revenue</div>
                    <div class="stat-value">${d.totalBilledDisplay}</div>
                    <div class="stat-sub">${d.totalSales} total completed sales</div>
                </div>
            </div>

            <div class="stat-card">
                <div class="stat-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
                </div>
                <div class="stat-info">
                    <div class="stat-label">Sales This Week / Month</div>
                    <div class="stat-value">${d.salesThisWeek} / ${d.salesThisMonth}</div>
                    <div class="stat-sub">${d.salesThisYear} sales this year</div>
                </div>
            </div>
        </div>

        <div class="panel">
            <div class="panel-header">
                <h3 class="panel-title">Recently Created Stores</h3>
            </div>
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Store Code</th>
                            <th>Store Name</th>
                            <th>Owner</th>
                            <th>City</th>
                            <th>Status</th>
                            <th>User Login</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${d.recentStores.map(s => {
                            storesCache[s.id] = s;
                            return `
                            <tr>
                                <td><strong>${s.store_code}</strong></td>
                                <td>${s.name}</td>
                                <td>${s.owner_name}</td>
                                <td>${s.city || '-'}</td>
                                <td><span class="badge ${s.status === 'active' ? 'badge-success' : 'badge-danger'}">${s.status}</span></td>
                                <td><code>${s.vendor_username || '-'}</code></td>
                                <td>
                                    <button class="btn btn-sm btn-secondary" onclick="viewStoreDetail(${s.id})">View stats</button>
                                </td>
                            </tr>
                        `}).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

async function loadStores() {
    const res = await fetch('/developer/api/stores');
    const data = await res.json();
    const content = document.getElementById('devContent');

    content.innerHTML = `
        <div class="panel">
            <div class="panel-header">
                <h3 class="panel-title">All Stores</h3>
            </div>
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Code</th>
                            <th>Store Name</th>
                            <th>Owner</th>
                            <th>City</th>
                            <th>Status</th>
                            <th class="num-col">Products</th>
                            <th class="num-col">Total Billed</th>
                            <th class="num-col">This Week</th>
                            <th class="num-col">This Month</th>
                            <th>Last Login</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.data.map(s => {
                            storesCache[s.id] = s;
                            return `
                            <tr>
                                <td><strong>${s.store_code}</strong></td>
                                <td>${s.name}</td>
                                <td>${s.owner_name}</td>
                                <td>${s.city || '-'}</td>
                                <td><span class="badge ${s.status === 'active' ? 'badge-success' : 'badge-danger'}">${s.status}</span></td>
                                <td class="num-col">${s.product_count}</td>
                                <td class="num-col"><strong>${s.totalBilledDisplay}</strong></td>
                                <td class="num-col">${s.salesThisWeek}</td>
                                <td class="num-col">${s.salesThisMonth}</td>
                                <td>${s.last_login_at ? s.last_login_at.slice(0, 16) : 'Never'}</td>
                                <td style="white-space: nowrap;">
                                    <button class="btn btn-sm btn-secondary" onclick="viewStoreDetail(${s.id})">Manage</button>
                                    <button class="btn btn-sm btn-danger" onclick="startDeleteStore(${s.id})" style="margin-left: 4px;" title="Permanently delete store and all data">Delete</button>
                                </td>
                            </tr>
                        `}).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

async function viewStoreDetail(id) {
    id = parseInt(id);
    const res = await fetch(`/developer/api/stores/${id}`);
    const data = await res.json();
    if (!data.success) return;

    const s = data.data.store;
    storesCache[s.id] = s;
    const st = data.data.stats;

    const modal = document.getElementById('devModalContainer');
    modal.innerHTML = `
        <div class="modal-overlay active">
            <div class="modal-card modal-lg">
                <div class="modal-header">
                    <h3 class="modal-title">${s.name} (${s.store_code})</h3>
                    <button class="btn btn-sm btn-secondary" onclick="closeDevModal()">&times;</button>
                </div>

                <div class="section-grid" style="margin-bottom: 1.25rem;">
                    <div class="stat-card">
                        <div class="stat-info">
                            <div class="stat-label">Active Products</div>
                            <div class="stat-value">${st.productCount}</div>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-info">
                            <div class="stat-label">Total Billed</div>
                            <div class="stat-value">${st.totalBilledDisplay}</div>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-info">
                            <div class="stat-label">Sales (Wk / Mo / Yr)</div>
                            <div class="stat-value">${st.salesThisWeek} / ${st.salesThisMonth} / ${st.salesThisYear}</div>
                        </div>
                    </div>
                </div>

                <div class="panel" style="margin-bottom: 1.25rem;">
                    <div class="panel-header">
                        <h4 class="panel-title">Store Profile</h4>
                    </div>
                    <p><strong>Owner:</strong> ${s.owner_name} | <strong>Phone:</strong> ${s.phone || '-'} | <strong>Email:</strong> ${s.email || '-'}</p>
                    <p><strong>Address:</strong> ${s.address || '-'}, ${s.city || '-'} | <strong>Timezone:</strong> ${s.timezone}</p>
                    <p><strong>Status:</strong> <span class="badge ${s.status === 'active' ? 'badge-success' : 'badge-danger'}">${s.status}</span> ${s.suspended_reason ? `(Reason: ${s.suspended_reason})` : ''}</p>
                    <p><strong>User Username:</strong> <code>${s.vendor_username || '-'}</code> | <strong>Last Login:</strong> ${s.last_login_at || 'Never'}</p>
                </div>

                <div class="modal-footer" style="justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
                    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                        ${s.status === 'active' ? `
                            <button class="btn btn-danger btn-sm" onclick="suspendStore(${s.id})">Suspend store</button>
                        ` : `
                            <button class="btn btn-primary btn-sm" onclick="reactivateStore(${s.id})">Reactivate store</button>
                        `}
                        <button class="btn btn-secondary btn-sm" onclick="resetVendorPassword(${s.id})">Reset user password</button>
                        <button class="btn btn-danger btn-sm" onclick="startDeleteStore(${s.id})" style="background: #dc2626; border-color: #dc2626;" title="Permanently delete store and all data">
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 3px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            Delete store
                        </button>
                    </div>
                    <button class="btn btn-secondary btn-sm" onclick="closeDevModal()">Close</button>
                </div>
            </div>
        </div>
    `;
}

function showCreateStoreModal() {
    const modal = document.getElementById('devModalContainer');
    modal.innerHTML = `
        <div class="modal-overlay active">
            <div class="modal-card">
                <div class="modal-header">
                    <h3 class="modal-title">Create New Store Profile</h3>
                    <button class="btn btn-sm btn-secondary" onclick="closeDevModal()">&times;</button>
                </div>

                <form id="createStoreForm">
                    <div class="form-group">
                        <label class="form-label">Store Name *</label>
                        <input class="form-input" type="text" id="csName" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Owner Full Name *</label>
                        <input class="form-input" type="text" id="csOwner" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Phone</label>
                        <input class="form-input" type="text" id="csPhone">
                    </div>
                    <div class="form-group">
                        <label class="form-label">City</label>
                        <input class="form-input" type="text" id="csCity">
                    </div>
                    <div class="form-group">
                        <label class="form-label">User Login Username *</label>
                        <input class="form-input" type="text" id="csVendorUser" required placeholder="e.g. store_owner">
                    </div>
                    <div class="form-group">
                        <label class="form-checkbox-label">
                            <input type="checkbox" id="csStarters">
                            <span>Add starter grocery categories (Beverages, Dairy, Grains, Snacks, Spices...)</span>
                        </label>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" onclick="closeDevModal()">Cancel</button>
                        <button type="submit" class="btn btn-primary">Create Store &amp; Credentials</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    document.getElementById('createStoreForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            name: document.getElementById('csName').value.trim(),
            ownerName: document.getElementById('csOwner').value.trim(),
            phone: document.getElementById('csPhone').value.trim(),
            city: document.getElementById('csCity').value.trim(),
            vendorUsername: document.getElementById('csVendorUser').value.trim(),
            starterCategories: document.getElementById('csStarters').checked
        };

        const res = await fetch('/developer/api/stores', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok) {
            alert(data.error?.message || 'Failed to create store.');
            return;
        }

        // Show one-time credentials card (PRD Section 17.1)
        const d = data.data;
        modal.innerHTML = `
            <div class="modal-overlay active">
                <div class="modal-card">
                    <div class="modal-header">
                        <h3 class="modal-title">Store Created Successfully</h3>
                    </div>
                    <div style="background-color: var(--surface-sunken); padding: 1.25rem; border-radius: var(--radius-control); margin: 1rem 0; border: 1px solid var(--border);">
                        <p style="font-weight: 600; color: var(--danger); margin-bottom: 0.5rem;">Important: This password is shown once. Provide it securely to the store owner.</p>
                        <p><strong>Store Code:</strong> ${d.storeCode}</p>
                        <p><strong>User Username:</strong> ${d.vendorUsername}</p>
                        <p><strong>Temporary Password:</strong> <code style="font-size: 1.1rem; font-weight: bold; color: var(--accent);">${d.temporaryPassword}</code></p>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-primary" onclick="closeDevModal(); loadTab('stores');">Done</button>
                    </div>
                </div>
            </div>
        `;
    });
}

async function suspendStore(id) {
    const reason = prompt('Reason for suspension:');
    if (!reason) return;
    const res = await fetch(`/developer/api/stores/${id}/suspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
    });
    if (res.ok) {
        showToast('Store suspended.');
        closeDevModal();
        loadTab('stores');
    }
}

async function reactivateStore(id) {
    if (!confirm('Reactivate this store?')) return;
    const res = await fetch(`/developer/api/stores/${id}/reactivate`, { method: 'POST' });
    if (res.ok) {
        showToast('Store reactivated.');
        closeDevModal();
        loadTab('stores');
    }
}

async function resetVendorPassword(id) {
    if (!confirm('Reset the user password for this store? This will generate a new temporary password.')) return;
    const res = await fetch(`/developer/api/stores/${id}/reset-vendor-password`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
        const d = data.data;
        alert(`New temporary password for ${d.vendorUsername}:\n\n${d.temporaryPassword}\n\nThis password is shown once.`);
        closeDevModal();
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Step 1: Initial warning modal outlining the consequences of complete store deletion.
 */
async function startDeleteStore(id) {
    id = parseInt(id);
    let store = storesCache[id];
    if (!store) {
        try {
            const res = await fetch(`/developer/api/stores/${id}`);
            const data = await res.json();
            if (data.success && data.data?.store) {
                store = data.data.store;
                storesCache[id] = store;
            }
        } catch (err) {
            console.error('Failed to load store details:', err);
        }
    }

    if (!store) {
        alert('Could not find store details to delete.');
        return;
    }

    const storeName = store.name;
    const storeCode = store.store_code;

    const modal = document.getElementById('devModalContainer');
    modal.innerHTML = `
        <div class="modal-overlay active">
            <div class="modal-card" style="max-width: 580px; border-top: 4px solid #ef4444;">
                <div class="modal-header">
                    <h3 class="modal-title" style="color: #dc2626; display: flex; align-items: center; gap: 8px;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                        Delete Entire Store — Confirmation 1 of 2
                    </h3>
                    <button class="btn btn-sm btn-secondary" onclick="closeDevModal()">&times;</button>
                </div>

                <div style="margin: 1rem 0;">
                    <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: var(--radius-control); padding: 1rem; margin-bottom: 1.25rem;">
                        <div style="font-weight: 700; color: #991b1b; font-size: 1rem; margin-bottom: 0.35rem;">
                            DANGER ZONE: Permanent Store Data Wipe
                        </div>
                        <div style="color: #7f1d1d; font-size: 0.9rem; line-height: 1.5;">
                            You are requesting to permanently delete store <strong>${escapeHtml(storeName)}</strong> (<code>${escapeHtml(storeCode)}</code>).
                        </div>
                    </div>

                    <div style="font-size: 0.875rem; color: var(--text); line-height: 1.6; margin-bottom: 1rem;">
                        <p style="font-weight: 600; margin-bottom: 0.5rem;">The following records will be permanently erased:</p>
                        <ul style="padding-left: 1.25rem; margin: 0; color: var(--text-muted);">
                            <li><strong style="color: var(--text);">All Products &amp; Batches:</strong> Inventory catalog, quantities, barcodes &amp; expiry records</li>
                            <li><strong style="color: var(--text);">All Sales &amp; Invoices:</strong> Complete billing transactions, tax reports &amp; payments</li>
                            <li><strong style="color: var(--text);">All Customers &amp; Udhaar:</strong> Khata ledger records, balances &amp; phone contacts</li>
                            <li><strong style="color: var(--text);">Categories &amp; Suppliers:</strong> All linked distributor profiles and catalogs</li>
                            <li><strong style="color: var(--text);">Audit History &amp; Settings:</strong> Stock movement logs, UPI settings &amp; vendor user login</li>
                        </ul>
                    </div>

                    <p style="font-size: 0.875rem; font-weight: 600; color: #dc2626; margin: 0;">
                        This action is IRREVERSIBLE. Once deleted, this store's data cannot be recovered.
                    </p>
                </div>

                <div class="modal-footer" style="justify-content: flex-end; gap: 0.75rem;">
                    <button class="btn btn-secondary" onclick="closeDevModal()">Cancel</button>
                    <button class="btn btn-danger" onclick="proceedToStep2DeleteStore(${id})" style="background: #dc2626; border-color: #dc2626;">
                        I Understand, Proceed to Confirmation 2 &rarr;
                    </button>
                </div>
            </div>
        </div>
    `;
}

/**
 * Step 2: Final typed double-confirmation modal to prevent accidental deletion.
 */
function proceedToStep2DeleteStore(id) {
    id = parseInt(id);
    const store = storesCache[id];
    if (!store) {
        alert('Could not find store details.');
        return;
    }

    const storeName = store.name;
    const storeCode = store.store_code;

    const modal = document.getElementById('devModalContainer');
    modal.innerHTML = `
        <div class="modal-overlay active">
            <div class="modal-card" style="max-width: 580px; border-top: 4px solid #b91c1c;">
                <div class="modal-header">
                    <h3 class="modal-title" style="color: #b91c1c; display: flex; align-items: center; gap: 8px;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#b91c1c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
                        Final Double Confirmation — Confirmation 2 of 2
                    </h3>
                    <button class="btn btn-sm btn-secondary" onclick="closeDevModal()">&times;</button>
                </div>

                <div style="margin: 1rem 0;">
                    <p style="font-size: 0.925rem; line-height: 1.5; color: var(--text); margin-bottom: 1rem;">
                        To avoid accidental deletion of <strong>${escapeHtml(storeName)}</strong>, please type the store code <code style="font-weight: 700; color: #b91c1c; font-size: 1rem; padding: 2px 6px; background: rgba(185, 28, 28, 0.1); border-radius: 4px;">${escapeHtml(storeCode)}</code> or the word <code style="font-weight: 700; color: #b91c1c; font-size: 1rem; padding: 2px 6px; background: rgba(185, 28, 28, 0.1); border-radius: 4px;">DELETE</code> into the box below:
                    </p>

                    <div class="form-group" style="margin-bottom: 0.5rem;">
                        <input type="text" id="devDeleteConfirmInput" class="form-input" placeholder="Enter ${escapeHtml(storeCode)} or DELETE" autocomplete="off" style="font-family: monospace; font-size: 1.05rem; letter-spacing: 0.05em; padding: 0.65rem 0.85rem; border: 2px solid var(--border);" />
                    </div>

                    <div id="devDeleteFeedback" style="font-size: 0.825rem; color: var(--text-muted); min-height: 1.25rem;">
                        Type exact store code or DELETE to activate the delete button.
                    </div>
                </div>

                <div class="modal-footer" style="justify-content: flex-end; gap: 0.75rem;">
                    <button class="btn btn-secondary" onclick="closeDevModal()">Cancel</button>
                    <button id="devBtnFinalDelete" class="btn btn-danger" disabled style="opacity: 0.45; cursor: not-allowed; background: #b91c1c; border-color: #b91c1c;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 4px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        Permanently Delete Store &amp; All Data
                    </button>
                </div>
            </div>
        </div>
    `;

    const input = document.getElementById('devDeleteConfirmInput');
    const btn = document.getElementById('devBtnFinalDelete');
    const feedback = document.getElementById('devDeleteFeedback');

    setTimeout(() => input?.focus(), 50);

    input.addEventListener('input', () => {
        const val = input.value.trim();
        const matches = (
            val.toUpperCase() === 'DELETE' || 
            val.toUpperCase() === storeCode.toUpperCase() ||
            val.toLowerCase() === storeName.trim().toLowerCase()
        );

        if (matches) {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
            feedback.style.color = '#16a34a';
            feedback.textContent = 'Confirmation matched. Click below to permanently delete.';
        } else {
            btn.disabled = true;
            btn.style.opacity = '0.45';
            btn.style.cursor = 'not-allowed';
            feedback.style.color = 'var(--text-muted)';
            feedback.textContent = `Type '${storeCode}' or 'DELETE' to activate button.`;
        }
    });

    btn.addEventListener('click', async () => {
        const val = input.value.trim();
        btn.disabled = true;
        btn.innerHTML = 'Purging entire store data...';

        try {
            const res = await fetch(`/developer/api/stores/${id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ confirmation: val })
            });

            const data = await res.json();
            if (!res.ok || !data.success) {
                alert(data.error?.message || 'Failed to delete store.');
                btn.disabled = false;
                btn.innerHTML = 'Permanently Delete Store & All Data';
                return;
            }

            showToast(data.message || `Store ${storeName} deleted successfully.`);
            delete storesCache[id];
            closeDevModal();
            if (currentTab === 'overview') {
                loadTab('overview');
            } else {
                loadStores();
            }
        } catch (err) {
            alert('Network or server error while deleting store: ' + err.message);
            btn.disabled = false;
            btn.innerHTML = 'Permanently Delete Store & All Data';
        }
    });
}

async function renderAudit(logs) {
    const content = document.getElementById('devContent');
    content.innerHTML = `
        <div class="panel">
            <div class="panel-header">
                <h3 class="panel-title">Developer Audit Logs</h3>
            </div>
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Time</th>
                            <th>Action</th>
                            <th>Developer</th>
                            <th>Target Store</th>
                            <th>Details</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${logs.map(l => `
                            <tr>
                                <td>${l.created_at.slice(0, 16)}</td>
                                <td><span class="badge badge-neutral">${l.action}</span></td>
                                <td>${l.developer_name || 'System'}</td>
                                <td>${l.store_name || '-'}</td>
                                <td><code>${l.details || '-'}</code></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function closeDevModal() {
    document.getElementById('devModalContainer').innerHTML = '';
}

// Explicit window bindings for inline HTML onclick handlers
window.viewStoreDetail = viewStoreDetail;
window.suspendStore = suspendStore;
window.reactivateStore = reactivateStore;
window.resetVendorPassword = resetVendorPassword;
window.startDeleteStore = startDeleteStore;
window.proceedToStep2DeleteStore = proceedToStep2DeleteStore;
window.closeDevModal = closeDevModal;
window.showCreateStoreModal = showCreateStoreModal;

document.addEventListener('DOMContentLoaded', init);
