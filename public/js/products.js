// ============================================
// Products Page — PRD Section 12.2
// ============================================

const Products = {
    page: 1,
    limit: 100,
    search: '',
    category: '',
    status: '',
    sortBy: 'name',
    sortDir: 'ASC',

    async load() {
        App.setTopbarActions(`
            <button class="btn btn-primary" onclick="Products.showForm()">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>
                Add Product
            </button>
        `);
        await this.fetchProducts();
    },

    async fetchProducts() {
        const params = new URLSearchParams({
            page: this.page,
            limit: this.limit,
            search: this.search,
            categoryId: this.category,
            category: this.category,
            stockStatus: this.status,
            status: this.status,
            sortBy: this.sortBy,
            sortDir: this.sortDir
        });

        const isSearchFocused = document.activeElement && document.activeElement.id === 'prodSearch';

        const [prodResp, catResp] = await Promise.all([
            App.api(`/api/products?${params}`),
            App.api('/api/categories')
        ]);

        if (!prodResp || !prodResp.success) {
            App.setContent(`
                <div class="empty-state">
                    <h3>Failed to load products</h3>
                    <p class="text-muted">${prodResp?.error?.message || 'Please try again.'}</p>
                    <button class="btn btn-primary" onclick="Products.fetchProducts()">Retry</button>
                </div>
            `);
            return;
        }

        const products = prodResp.data || [];
        const pg = prodResp.pagination || prodResp.meta || {};
        const totalItems = pg.total !== undefined ? pg.total : products.length;
        const totalPages = pg.totalPages || Math.ceil(totalItems / (this.limit || 1)) || 1;
        const currentPage = pg.page || this.page || 1;
        const categories = catResp.success ? catResp.data : [];

        App.setContent(`
            <div class="toolbar" style="margin-bottom:1.25rem;display:flex;gap:0.75rem;flex-wrap:wrap;align-items:center;">
                <div class="search-box" style="flex:1;min-width:240px;max-width:380px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/></svg>
                    <input type="text" id="prodSearch" placeholder="Search by name, SKU or barcode..." value="${this.search}" oninput="Products.onSearch(this.value)">
                </div>
                <select class="filter-select" onchange="Products.onCategoryFilter(this.value)">
                    <option value="">All Categories</option>
                    ${categories.map(c => `<option value="${c.id}" ${this.category == c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
                </select>
                <select class="filter-select" onchange="Products.onStatusFilter(this.value)">
                    <option value="" ${!this.status ? 'selected' : ''}>All Stock Status</option>
                    <option value="in_stock" ${this.status === 'in_stock' ? 'selected' : ''}>In Stock</option>
                    <option value="low_stock" ${this.status === 'low_stock' ? 'selected' : ''}>Low Stock</option>
                    <option value="out_of_stock" ${this.status === 'out_of_stock' ? 'selected' : ''}>Out of Stock</option>
                </select>
                <select class="filter-select" onchange="Products.onSortChange(this.value)">
                    <option value="name_asc" ${this.sortBy === 'name' && this.sortDir === 'ASC' ? 'selected' : ''}>Sort: Name (A-Z)</option>
                    <option value="name_desc" ${this.sortBy === 'name' && this.sortDir === 'DESC' ? 'selected' : ''}>Sort: Name (Z-A)</option>
                    <option value="price_asc" ${this.sortBy === 'price' && this.sortDir === 'ASC' ? 'selected' : ''}>Sort: Price (Low to High)</option>
                    <option value="price_desc" ${this.sortBy === 'price' && this.sortDir === 'DESC' ? 'selected' : ''}>Sort: Price (High to Low)</option>
                    <option value="stock_asc" ${this.sortBy === 'quantity_milli' && this.sortDir === 'ASC' ? 'selected' : ''}>Sort: Stock (Low to High)</option>
                    <option value="stock_desc" ${this.sortBy === 'quantity_milli' && this.sortDir === 'DESC' ? 'selected' : ''}>Sort: Stock (High to Low)</option>
                    <option value="recent_desc" ${this.sortBy === 'created_at' && this.sortDir === 'DESC' ? 'selected' : ''}>Sort: Recently Added</option>
                </select>
                <select class="filter-select" onchange="Products.onLimitChange(this.value)" title="Items per page">
                    <option value="100" ${this.limit === 100 ? 'selected' : ''}>Show: 100 items</option>
                    <option value="25" ${this.limit === 25 ? 'selected' : ''}>Show: 25 items</option>
                    <option value="50" ${this.limit === 50 ? 'selected' : ''}>Show: 50 items</option>
                    <option value="500" ${this.limit === 500 ? 'selected' : ''}>Show: All (500)</option>
                </select>
            </div>

            <div class="card">
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th style="min-width: 180px;">Product Name</th>
                                <th style="width: 130px;">SKU &amp; Barcode</th>
                                <th style="width: 140px;">Category</th>
                                <th style="width: 110px;" class="text-right">Price (₹)</th>
                                <th style="width: 110px;" class="text-right">Stock</th>
                                <th style="width: 150px;">Features</th>
                                <th style="width: 120px;" class="text-center">Status</th>
                                <th style="width: 150px;" class="text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${products.length === 0 ? `
                                <tr>
                                    <td colspan="8">
                                        <div class="empty-state" style="padding:2.5rem 1rem;text-align:center;">
                                            <h3>No products found</h3>
                                            <p class="text-muted">Add your first product or adjust search filters.</p>
                                        </div>
                                    </td>
                                </tr>
                            ` : products.map(p => `
                                <tr>
                                    <td>
                                        <div style="font-weight:600;color:var(--text);line-height:1.35;">${p.name}</div>
                                        <div class="text-xs text-muted" style="margin-top:0.2rem;">Unit: ${p.unit || 'piece'}</div>
                                    </td>
                                    <td>
                                        <div><code style="font-size:0.8rem;background:var(--surface-sunken);padding:0.15rem 0.35rem;border-radius:4px;border:1px solid var(--border);">${p.sku}</code></div>
                                        ${p.barcode ? `<div class="text-xs text-muted" style="margin-top:0.25rem;">Bar: ${p.barcode}</div>` : ''}
                                    </td>
                                    <td><span class="badge badge-neutral">${p.category_name || '-'}</span></td>
                                    <td class="text-right" style="font-weight:600;font-variant-numeric:tabular-nums;">
                                        ${p.price_display || App.formatCurrency(p.price)}
                                        <div class="text-xs text-muted">(${((p.gst_rate !== undefined ? p.gst_rate : (p.gst_rate_bps || 0)) / 100)}% GST)</div>
                                    </td>
                                    <td class="text-right" style="font-weight:600;font-variant-numeric:tabular-nums;">
                                        ${p.quantity_display || p.quantity || '0'} <span class="text-xs text-muted" style="font-weight:normal;">${p.unit || ''}</span>
                                    </td>
                                    <td>
                                        <div style="display:flex;gap:0.3rem;flex-wrap:wrap;">
                                            ${p.product_type === 'loose'
                                                ? '<span class="badge badge-warning" title="Sold by custom weight">Open / Loose</span>'
                                                : `<span class="badge badge-info" title="Fixed package size">Pack (${(p.package_size || 1) < 1 ? Math.round((p.package_size || 1)*1000)+'g' : (p.package_size || 1)+''+(p.unit === 'litre'?'L':(p.unit==='kg'?'kg':''))})</span>`}
                                            ${p.is_quick_item ? '<span class="badge badge-primary" title="Quick Item on Counter">Quick</span>' : ''}
                                            ${p.track_expiry ? '<span class="badge badge-neutral" title="Expiry Tracking Active">Expiry</span>' : ''}
                                        </div>
                                    </td>
                                    <td class="text-center">
                                        ${App.stockBadge(p.quantity_milli, p.minimum_stock_milli)}
                                    </td>
                                    <td class="text-right">
                                        <div class="action-btns">
                                            <button class="btn btn-sm btn-secondary" onclick="Products.showForm(${p.id})" title="Edit Product">
                                                Edit
                                            </button>
                                            <button class="btn btn-sm btn-danger" onclick="Products.deactivateProduct(${p.id}, '${p.name.replace(/'/g, "\\'")}')" title="Deactivate">
                                                Deactivate
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>

                <div class="pagination" style="padding:0.75rem 1rem;display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--border);background:var(--surface);">
                    <span class="text-sm text-muted">Showing <strong>${products.length}</strong> of <strong>${totalItems}</strong> products</span>
                    ${totalPages > 1 ? `
                    <div class="pagination-controls" style="display:flex;gap:0.5rem;align-items:center;">
                        <span class="text-xs text-muted" style="margin-right:0.5rem;">Page ${currentPage} of ${totalPages}</span>
                        <button class="btn btn-sm btn-secondary" onclick="Products.page=${currentPage - 1};Products.fetchProducts();" ${currentPage <= 1 ? 'disabled' : ''}>Prev</button>
                        <button class="btn btn-sm btn-secondary" onclick="Products.page=${currentPage + 1};Products.fetchProducts();" ${currentPage >= totalPages ? 'disabled' : ''}>Next</button>
                    </div>
                    ` : ''}
                </div>
            </div>
        `);

        if (isSearchFocused) {
            const input = document.getElementById('prodSearch');
            if (input) {
                input.focus();
                input.setSelectionRange(input.value.length, input.value.length);
            }
        }
    },

    onLimitChange(val) {
        this.limit = parseInt(val) || 100;
        this.page = 1;
        this.fetchProducts();
    },

    onSearch(val) {
        clearTimeout(this._searchTimer);
        this._searchTimer = setTimeout(() => {
            this.search = val.trim();
            this.page = 1;
            this.fetchProducts();
        }, 250);
    },

    onCategoryFilter(cat) {
        this.category = cat;
        this.page = 1;
        this.fetchProducts();
    },

    onStatusFilter(st) {
        this.status = st;
        this.page = 1;
        this.fetchProducts();
    },

    onSortChange(val) {
        if (val === 'name_asc') { this.sortBy = 'name'; this.sortDir = 'ASC'; }
        else if (val === 'name_desc') { this.sortBy = 'name'; this.sortDir = 'DESC'; }
        else if (val === 'price_asc') { this.sortBy = 'price'; this.sortDir = 'ASC'; }
        else if (val === 'price_desc') { this.sortBy = 'price'; this.sortDir = 'DESC'; }
        else if (val === 'stock_asc') { this.sortBy = 'quantity_milli'; this.sortDir = 'ASC'; }
        else if (val === 'stock_desc') { this.sortBy = 'quantity_milli'; this.sortDir = 'DESC'; }
        else if (val === 'recent_desc') { this.sortBy = 'created_at'; this.sortDir = 'DESC'; }
        this.page = 1;
        this.fetchProducts();
    },

    // Show Create or Edit Modal
    async showForm(productId = null) {
        const [catResp, supResp, prodResp] = await Promise.all([
            App.api('/api/categories'),
            App.api('/api/suppliers'),
            productId ? App.api(`/api/products/${productId}`) : Promise.resolve(null)
        ]);

        const categories = catResp.success ? catResp.data : [];
        const suppliers = supResp.success ? supResp.data : [];
        const p = prodResp?.success ? prodResp.data : null;

        const isEdit = !!p;
        const existingBatch = (p?.batches && p.batches.length > 0) ? p.batches[0] : null;
        const existingExpiry = existingBatch && existingBatch.expiry_date ? existingBatch.expiry_date.split('T')[0] : '';
        const existingBatchLabel = existingBatch && existingBatch.batch_label ? existingBatch.batch_label : '';
        const standardGstRates = [
            { rate: 0, label: '0% (Exempt)' },
            { rate: 25, label: '0.25% (Gold/Precious)' },
            { rate: 300, label: '3% (Precious Items)' },
            { rate: 500, label: '5% (Essential Goods)' },
            { rate: 1200, label: '12% (Standard Low)' },
            { rate: 1800, label: '18% (Standard High)' },
            { rate: 2800, label: '28% (Luxury/Demerit)' }
        ];

        const modalHtml = `
            <div class="modal-overlay active" id="prodModal">
                <div class="modal" style="max-width:680px;">
                    <div class="modal-header">
                        <h3>${isEdit ? 'Edit Product' : 'Add New Product'}</h3>
                        <button class="modal-close" onclick="document.getElementById('prodModal').remove()">&times;</button>
                    </div>
                    <form id="prodForm">
                        <div class="modal-body" style="max-height:75vh;overflow-y:auto;">
                            <div class="form-group">
                                <label>Product Name <span class="required">*</span></label>
                                <input type="text" name="name" required minlength="2" maxlength="120" value="${p?.name || ''}" placeholder="e.g. Fortune Sunflower Oil 1L" class="form-control">
                            </div>

                            <!-- Packaging & Selling Type Option -->
                            <div class="form-group" style="margin-bottom: 1rem;">
                                <label style="font-weight: 600; display: block; margin-bottom: 0.5rem;">Packaging & Selling Option <span class="required">*</span></label>
                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
                                    <label class="prod-type-card ${(!p || p.product_type !== 'loose') ? 'selected' : ''}" id="cardPackaged" style="border: 2px solid ${(!p || p.product_type !== 'loose') ? 'var(--accent)' : 'var(--border)'}; border-radius: var(--radius-control); padding: 0.75rem; cursor: pointer; display: flex; align-items: flex-start; gap: 0.65rem; background: var(--surface);">
                                        <input type="radio" name="productType" value="packaged" ${(!p || p.product_type !== 'loose') ? 'checked' : ''} onchange="Products.onTypeChange('packaged')" style="margin-top: 0.2rem;">
                                        <div>
                                            <strong style="display: block; font-size: 0.875rem; color: var(--text);">Packaged / Fixed Pack</strong>
                                            <span style="font-size: 0.75rem; color: var(--text-muted); line-height: 1.3; display: block; margin-top: 2px;">Fixed quantity per pack (e.g. 0.5kg, 1kg, 5kg). Sold by whole packs.</span>
                                        </div>
                                    </label>
                                    <label class="prod-type-card ${(p && p.product_type === 'loose') ? 'selected' : ''}" id="cardLoose" style="border: 2px solid ${(p && p.product_type === 'loose') ? 'var(--accent)' : 'var(--border)'}; border-radius: var(--radius-control); padding: 0.75rem; cursor: pointer; display: flex; align-items: flex-start; gap: 0.65rem; background: var(--surface);">
                                        <input type="radio" name="productType" value="loose" ${(p && p.product_type === 'loose') ? 'checked' : ''} onchange="Products.onTypeChange('loose')" style="margin-top: 0.2rem;">
                                        <div>
                                            <strong style="display: block; font-size: 0.875rem; color: var(--text);">Open / Loose Item</strong>
                                            <span style="font-size: 0.75rem; color: var(--text-muted); line-height: 1.3; display: block; margin-top: 2px;">Sold by custom weight (e.g. 1.75 kg, 0.45 kg). Sold in any custom quantity.</span>
                                        </div>
                                    </label>
                                </div>
                            </div>

                            <div id="packageSizeGroup" class="form-group" style="${(p && p.product_type === 'loose') ? 'display:none;' : ''}">
                                <div class="panel" style="background:var(--surface-sunken);padding:0.75rem;border:1px solid var(--border);border-radius:var(--radius-control);margin-bottom:0.75rem;">
                                    <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;">
                                        <div>
                                            <label style="font-weight:600;font-size:0.875rem;margin-bottom:0.25rem;display:block;">Package Size / Net Quantity per Pack</label>
                                            <span style="font-size:0.75rem;color:var(--text-muted);">Enter the fixed net weight in this packet (e.g. 0.5 for 500g, 1 for 1kg, 5 for 5kg)</span>
                                        </div>
                                        <div style="display:flex;align-items:center;gap:0.5rem;">
                                            <input type="number" step="0.001" min="0.001" name="packageSize" id="packageSizeInput" class="form-control" style="width:110px;font-weight:600;text-align:center;"
                                                   value="${p?.package_size || (p?.package_size_milli ? p.package_size_milli / 1000 : '1')}" placeholder="1.0">
                                            <span id="packUnitLabel" style="font-weight:600;font-size:0.875rem;color:var(--text);">${p?.unit || 'piece'}</span>
                                        </div>
                                    </div>
                                    <div style="display:flex;gap:0.375rem;margin-top:0.5rem;align-items:center;flex-wrap:wrap;">
                                        <span style="font-size:0.6875rem;color:var(--text-muted);text-transform:uppercase;font-weight:700;">Quick presets:</span>
                                        <button type="button" class="btn btn-sm btn-secondary" style="padding:0.15rem 0.45rem;font-size:0.75rem;" onclick="document.getElementById('packageSizeInput').value = '0.5'">500g / 0.5</button>
                                        <button type="button" class="btn btn-sm btn-secondary" style="padding:0.15rem 0.45rem;font-size:0.75rem;" onclick="document.getElementById('packageSizeInput').value = '1.0'">1 kg / 1.0</button>
                                        <button type="button" class="btn btn-sm btn-secondary" style="padding:0.15rem 0.45rem;font-size:0.75rem;" onclick="document.getElementById('packageSizeInput').value = '2.0'">2 kg / 2.0</button>
                                        <button type="button" class="btn btn-sm btn-secondary" style="padding:0.15rem 0.45rem;font-size:0.75rem;" onclick="document.getElementById('packageSizeInput').value = '5.0'">5 kg / 5.0</button>
                                        <button type="button" class="btn btn-sm btn-secondary" style="padding:0.15rem 0.45rem;font-size:0.75rem;" onclick="document.getElementById('packageSizeInput').value = '10.0'">10 kg / 10.0</button>
                                    </div>
                                </div>
                            </div>

                            <div class="grid-2">
                                <div class="form-group">
                                    <label>SKU (Stock Keeping Unit)</label>
                                    <input type="text" name="sku" value="${p?.sku || ''}" placeholder="Auto-generated if empty" class="form-control">
                                </div>
                                <div class="form-group">
                                    <label>Barcode / EAN</label>
                                    <input type="text" name="barcode" value="${p?.barcode || p?.hsn_code || ''}" placeholder="4-32 characters" class="form-control">
                                </div>
                            </div>

                            <div class="grid-2">
                                <div class="form-group">
                                    <label>Category <span class="required">*</span></label>
                                    <select name="categoryId" required class="form-control">
                                        <option value="" ${!p?.category_id ? 'selected' : ''} disabled>-- Select Category --</option>
                                        ${categories.map(c => `<option value="${c.id}" ${p?.category_id == c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>Supplier</label>
                                    <select name="supplierId" class="form-control">
                                        <option value="">No supplier</option>
                                        ${suppliers.map(s => `<option value="${s.id}" ${p?.supplier_id == s.id ? 'selected' : ''}>${s.name}</option>`).join('')}
                                    </select>
                                </div>
                            </div>

                            <div class="grid-3" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.75rem;">
                                <div class="form-group">
                                    <label>Unit of Measure <span class="required">*</span></label>
                                    <select name="unit" required class="form-control" id="prodUnitSelect" onchange="const l = document.getElementById('packUnitLabel'); if (l) l.textContent = this.value;">
                                        <option value="piece" ${(!p || p?.unit === 'piece') ? 'selected' : ''}>piece (Single Unit)</option>
                                        <option value="pack" ${(p?.unit === 'pack' || p?.unit === 'packet') ? 'selected' : ''}>pack / packet</option>
                                        <option value="box" ${p?.unit === 'box' ? 'selected' : ''}>box / carton</option>
                                        <option value="dozen" ${p?.unit === 'dozen' ? 'selected' : ''}>dozen (12 pcs)</option>
                                        <option value="kg" ${p?.unit === 'kg' ? 'selected' : ''}>kg (Weight)</option>
                                        <option value="litre" ${p?.unit === 'litre' ? 'selected' : ''}>litre (Volume)</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>Selling Price (₹) <span class="required">*</span></label>
                                    <input type="number" step="0.01" min="0.01" name="price" required value="${p ? (p.price / 100).toFixed(2) : ''}" placeholder="0.00" class="form-control">
                                </div>
                                <div class="form-group">
                                    <label>Cost Price (₹)</label>
                                    <input type="number" step="0.01" min="0" name="costPrice" value="${p && p.cost_price ? (p.cost_price / 100).toFixed(2) : ''}" placeholder="0.00" class="form-control">
                                </div>
                            </div>

                            <div class="grid-3" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.75rem;">
                                <div class="form-group">
                                    <label>GST Rate</label>
                                    <select name="gstRate" class="form-control">
                                        ${standardGstRates.map(g => {
                                            const curGst = p ? (p.gst_rate !== undefined ? p.gst_rate : (p.gst_rate_bps !== undefined ? p.gst_rate_bps : 0)) : 0;
                                            return `<option value="${g.rate}" ${curGst === g.rate ? 'selected' : ''}>${g.label}</option>`;
                                        }).join('')}
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>${isEdit ? 'Current Stock' : 'Initial Stock'}</label>
                                    <input type="number" step="0.001" min="0" name="quantity" id="prodQuantityInput" value="${p ? (p.quantity !== undefined ? p.quantity : (p.quantity_milli !== undefined ? p.quantity_milli / 1000 : '0')) : '0'}" class="form-control">
                                </div>
                                <div class="form-group">
                                    <label>Min Stock (Alert)</label>
                                    <input type="number" step="0.001" min="0" name="minimumStock" value="${p ? (p.minimum_stock !== undefined ? p.minimum_stock : (p.minimum_stock_milli !== undefined ? p.minimum_stock_milli / 1000 : '10')) : '10'}" class="form-control">
                                </div>
                            </div>

                            <div class="panel" style="background:var(--surface-sunken);padding:0.75rem;margin-top:0.75rem;border-radius:var(--radius-control);">
                                <div style="display:flex;gap:1.5rem;flex-wrap:wrap;">
                                    <label style="display:flex;align-items:center;gap:0.5rem;font-size:0.875rem;cursor:pointer;">
                                        <input type="checkbox" name="isQuickItem" ${p?.is_quick_item ? 'checked' : ''}>
                                        <span>Show on Quick Billing Grid</span>
                                    </label>
                                    <label style="display:flex;align-items:center;gap:0.5rem;font-size:0.875rem;cursor:pointer;">
                                        <input type="checkbox" name="trackExpiry" id="trackExpiryCheckbox" ${p?.track_expiry ? 'checked' : ''} onchange="Products.toggleExpiryFields(this.checked)">
                                        <span>Track Expiry Batches</span>
                                    </label>
                                </div>
                            </div>

                            <!-- Expiry Date & Batch Information -->
                            <div id="expiryBatchGroup" class="panel" style="background:var(--surface-sunken);padding:0.85rem;margin-top:0.75rem;border:1px dashed var(--accent);border-radius:var(--radius-control);${p?.track_expiry ? 'display:block;' : 'display:none;'}">
                                <div style="display:flex;align-items:center;justify-content:space-between;gap:0.5rem;margin-bottom:0.75rem;">
                                    <strong style="font-size:0.875rem;color:var(--text);">Batch &amp; Expiry Information</strong>
                                    <span style="font-size:0.75rem;color:var(--text-muted);">(Required if stock &gt; 0)</span>
                                </div>
                                <div class="grid-2">
                                    <div class="form-group" style="margin-bottom:0;">
                                        <label>Expiry Date <span class="required">*</span></label>
                                        <input type="date" name="expiryDate" id="prodExpiryDateInput" value="${existingExpiry}" class="form-control">
                                    </div>
                                    <div class="form-group" style="margin-bottom:0;">
                                        <label>Batch / Lot Number</label>
                                        <input type="text" name="batchLabel" id="prodBatchLabelInput" value="${existingBatchLabel}" placeholder="e.g. BATCH-01" class="form-control">
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" onclick="document.getElementById('prodModal').remove()">Cancel</button>
                            <button type="submit" class="btn btn-primary">${isEdit ? 'Update Product' : 'Create Product'}</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        document.getElementById('prodForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const pType = fd.get('productType') || 'packaged';
            const trackExpiry = fd.get('trackExpiry') === 'on';
            const qty = parseFloat(fd.get('quantity') || 0);
            const expiryDate = fd.get('expiryDate') ? fd.get('expiryDate').trim() : null;
            const batchLabel = fd.get('batchLabel') ? fd.get('batchLabel').trim() : null;

            if (trackExpiry && qty > 0 && !expiryDate) {
                App.toast('Please select an Expiry Date for this product batch.', 'error');
                const expInput = document.getElementById('prodExpiryDateInput');
                if (expInput) {
                    expInput.focus();
                }
                return;
            }

            const body = {
                name: fd.get('name'),
                productType: pType,
                packageSize: pType === 'packaged' ? (parseFloat(fd.get('packageSize')) || 1.0) : 1.0,
                sku: fd.get('sku') || null,
                barcode: fd.get('barcode') || null,
                categoryId: fd.get('categoryId') ? parseInt(fd.get('categoryId')) : null,
                supplierId: fd.get('supplierId') ? parseInt(fd.get('supplierId')) : null,
                unit: fd.get('unit'),
                price: parseFloat(fd.get('price')),
                costPrice: fd.get('costPrice') ? parseFloat(fd.get('costPrice')) : null,
                gstRate: parseInt(fd.get('gstRate')),
                quantity: qty,
                minimumStock: parseFloat(fd.get('minimumStock') || 0),
                isQuickItem: fd.get('isQuickItem') === 'on',
                trackExpiry: trackExpiry,
                expiryDate: expiryDate,
                batchLabel: batchLabel
            };

            const url = isEdit ? `/api/products/${productId}` : '/api/products';
            const method = isEdit ? 'PUT' : 'POST';

            const resp = await App.api(url, { method, body });
            if (resp && resp.success) {
                App.toast(isEdit ? 'Product updated.' : 'Product created.');
                document.getElementById('prodModal')?.remove();
                Products.fetchProducts();
            } else {
                App.toast(resp?.error?.message || 'Failed to save product.', 'error');
            }
        });
    },

    toggleExpiryFields(checked) {
        const group = document.getElementById('expiryBatchGroup');
        if (group) {
            group.style.display = checked ? 'block' : 'none';
        }
    },

    onTypeChange(type) {
        const isLoose = type === 'loose';
        const sizeGroup = document.getElementById('packageSizeGroup');
        if (sizeGroup) {
            sizeGroup.style.display = isLoose ? 'none' : 'block';
        }
        const cardPackaged = document.getElementById('cardPackaged');
        const cardLoose = document.getElementById('cardLoose');
        if (cardPackaged) {
            cardPackaged.style.borderColor = isLoose ? 'var(--border)' : 'var(--accent)';
        }
        if (cardLoose) {
            cardLoose.style.borderColor = isLoose ? 'var(--accent)' : 'var(--border)';
        }
    },

    // Deactivate Product (Soft delete per PRD v5.0)
    async deactivateProduct(id, name) {
        const confirmed = await App.confirm(
            'Deactivate Product',
            `Are you sure you want to deactivate "${name}"? It will no longer appear on counter billing screens. Historic sales and stock logs will remain intact.`,
            'Deactivate',
            'btn btn-danger'
        );
        if (!confirmed) return;

        const resp = await App.api(`/api/products/${id}`, { method: 'DELETE' });
        if (resp && resp.success) {
            App.toast('Product deactivated.');
            Products.fetchProducts();
        } else {
            App.toast(resp?.error?.message || 'Failed to deactivate product.', 'error');
        }
    }
};

window.Products = Products;
