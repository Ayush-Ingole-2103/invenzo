// ============================================
// Dashboard Page — PRD Section 12.1
// Real-time Analytics & Sales Trend
// ============================================

const Dashboard = {
    chart: null,
    currentRange: '7d',
    pollInterval: null,
    isInitialized: false,

    async load() {
        App.setTopbarActions(`
            <button class="btn btn-primary" onclick="App.navigate('billing')">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="20" x="4" y="2" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/><line x1="16" x2="16" y1="14" y2="18"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/></svg>
                Open Counter Billing
            </button>
        `);

        const resp = await App.api('/api/dashboard');
        if (!resp || !resp.success) {
            App.setContent(`
                <div class="empty-state">
                    <h3>Failed to load dashboard</h3>
                    <p class="text-muted">${resp?.error?.message || 'Please try again.'}</p>
                    <button class="btn btn-primary" onclick="Dashboard.load()">Retry</button>
                </div>
            `);
            return;
        }

        const d = resp.data;
        const today = d.today || {};
        const store = d.store || {};
        const credit = d.credit || {};
        const topProducts = d.topProducts || [];
        const lowStockItems = d.lowStockItems || [];

        // Max revenue for relative bar widths
        const maxRev = topProducts.length > 0 ? Math.max(...topProducts.map(p => p.revenuePaise || 0)) : 1;

        App.setContent(`
            <!-- PRD 12.1: Three Top-Level Panels -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:1.25rem;margin-bottom:1.5rem;">
                <!-- 1. Today Panel -->
                <div class="panel" style="display:flex;flex-direction:column;justify-content:space-between;">
                    <div>
                        <div class="text-xs text-muted font-semibold" style="text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.5rem;">
                            Today's Counter Sales
                        </div>
                        <div id="kpiTodayBilled" style="font-size:2rem;font-weight:700;color:var(--text);">${today.billed || '₹0.00'}</div>
                        <div class="text-sm text-muted" style="margin-top:0.25rem;">
                            <strong id="kpiTodayBillCount">${today.billCount || 0}</strong> bills completed today
                        </div>
                    </div>
                    <div style="border-top:1px solid var(--border);margin-top:1rem;padding-top:0.75rem;display:flex;justify-content:space-between;font-size:0.8125rem;">
                        <div>Cash: <strong id="kpiCashSales">${today.cashSales || '₹0.00'}</strong></div>
                        <div>UPI: <strong id="kpiUpiSales">${today.upiSales || '₹0.00'}</strong></div>
                        <div>Udhaar: <strong id="kpiCreditGiven">${today.creditGiven || '₹0.00'}</strong></div>
                    </div>
                </div>

                <!-- 2. Store Panel -->
                <div class="panel" style="display:flex;flex-direction:column;justify-content:space-between;">
                    <div>
                        <div class="text-xs text-muted font-semibold" style="text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.5rem;">
                            Store Inventory
                        </div>
                        <div id="kpiActiveProducts" style="font-size:2rem;font-weight:700;color:var(--accent);">${store.activeProducts || 0}</div>
                        <div class="text-sm text-muted" style="margin-top:0.25rem;">
                            Active Products in Catalog
                        </div>
                    </div>
                    <div style="border-top:1px solid var(--border);margin-top:1rem;padding-top:0.75rem;display:flex;justify-content:space-between;font-size:0.8125rem;">
                        <div>Low Stock: <span id="kpiLowStock" class="badge badge-warning">${store.lowStockCount || 0}</span></div>
                        <div>Out: <span id="kpiOutOfStock" class="badge badge-danger">${store.outOfStockCount || 0}</span></div>
                        <div>Stock Value: <strong id="kpiStockValue">${store.stockValueAtCost || '₹0.00'}</strong></div>
                    </div>
                </div>

                <!-- 3. Customer Credit (Udhaar) Panel -->
                <div class="panel" style="display:flex;flex-direction:column;justify-content:space-between;">
                    <div>
                        <div class="text-xs text-muted font-semibold" style="text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.5rem;">
                            Customer Udhaar Ledger
                        </div>
                        <div id="kpiTotalOutstanding" style="font-size:2rem;font-weight:700;color:var(--danger);">${credit.totalOutstanding || '₹0.00'}</div>
                        <div class="text-sm text-muted" style="margin-top:0.25rem;">
                            Total Outstanding Dues
                        </div>
                    </div>
                    <div style="border-top:1px solid var(--border);margin-top:1rem;padding-top:0.75rem;display:flex;justify-content:space-between;align-items:center;font-size:0.8125rem;">
                        <div>Customers with Dues: <strong id="kpiCustomersWithDues">${credit.customersWithDues || 0}</strong></div>
                        <button class="btn btn-sm btn-secondary" onclick="App.navigate('customers')">View Ledger</button>
                    </div>
                </div>
            </div>

            <!-- Charts & Top Products Grid -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(340px, 1fr));gap:1.5rem;margin-bottom:1.5rem;">
                <!-- Sales Trend Graph -->
                <div class="card" style="padding:1.25rem;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
                        <h3 style="margin:0;font-size:1.1rem;">Sales Trend</h3>
                        <div style="display:flex;gap:0;border-radius:6px;overflow:hidden;border:1px solid var(--border);">
                            <button id="btnRange7d" class="btn btn-sm ${this.currentRange === '7d' ? 'btn-primary' : 'btn-secondary'}" onclick="Dashboard.switchRange('7d')" style="border-radius:0;border:none;padding:0.3rem 0.7rem;">7D</button>
                            <button id="btnRange30d" class="btn btn-sm ${this.currentRange === '30d' ? 'btn-primary' : 'btn-secondary'}" onclick="Dashboard.switchRange('30d')" style="border-radius:0;border:none;border-left:1px solid var(--border);padding:0.3rem 0.7rem;">30D</button>
                            <button id="btnRange12m" class="btn btn-sm ${this.currentRange === '12m' ? 'btn-primary' : 'btn-secondary'}" onclick="Dashboard.switchRange('12m')" style="border-radius:0;border:none;border-left:1px solid var(--border);padding:0.3rem 0.7rem;">12M</button>
                        </div>
                    </div>
                    <div style="height:260px;position:relative;">
                        <canvas id="salesTrendChart"></canvas>
                    </div>
                </div>

                <!-- Top 5 Products by Revenue -->
                <div class="card" style="padding:1.25rem;">
                    <h3 style="margin:0 0 1rem 0;font-size:1.1rem;">Top Products by Revenue</h3>
                    ${topProducts.length === 0 ? `
                        <div class="empty-state" style="padding:2rem 1rem;text-align:center;">
                            <p class="text-muted">No sales completed yet.</p>
                        </div>
                    ` : `
                        <div style="display:flex;flex-direction:column;gap:0.85rem;">
                            ${topProducts.map((tp, idx) => {
                                const pct = maxRev > 0 ? Math.round(((tp.revenuePaise || 0) / maxRev) * 100) : 0;
                                return `
                                    <div>
                                        <div style="display:flex;justify-content:space-between;font-size:0.875rem;margin-bottom:0.25rem;">
                                            <span style="font-weight:600;">${idx + 1}. ${tp.name}</span>
                                            <span style="font-weight:700;color:var(--text);">${tp.revenue}</span>
                                        </div>
                                        <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:0.35rem;">
                                            Sold: ${tp.quantity}
                                        </div>
                                        <div style="height:6px;background:var(--surface-sunken);border-radius:3px;overflow:hidden;">
                                            <div style="height:100%;width:${pct}%;background:var(--accent);border-radius:3px;"></div>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    `}
                </div>
            </div>

            <!-- Low Stock Alert List -->
            ${lowStockItems.length > 0 ? `
                <div class="card" style="padding:1.25rem;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
                        <div style="display:flex;align-items:center;gap:0.5rem;">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--warning);"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                            <h3 style="margin:0;font-size:1.1rem;">Low Stock Alerts</h3>
                        </div>
                        <button class="btn btn-sm btn-secondary" onclick="App.navigate('stock')">Go to Reorder List</button>
                    </div>
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Product</th>
                                    <th style="width: 140px;">SKU</th>
                                    <th style="width: 140px;" class="text-right">Current Stock</th>
                                    <th style="width: 160px;" class="text-right">Min Stock Threshold</th>
                                    <th style="width: 120px;" class="text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${lowStockItems.map(item => `
                                    <tr>
                                        <td><div style="font-weight:600;color:var(--text);">${item.name}</div></td>
                                        <td><code style="font-size:0.8rem;background:var(--surface-sunken);padding:0.15rem 0.35rem;border-radius:4px;border:1px solid var(--border);">${item.sku}</code></td>
                                        <td class="text-right" style="font-weight:600;color:var(--danger);font-variant-numeric:tabular-nums;">${item.stock_display}</td>
                                        <td class="text-right" style="font-variant-numeric:tabular-nums;">${item.min_display}</td>
                                        <td class="text-right">
                                            <button class="btn btn-sm btn-primary" onclick="App.navigate('stock')">Restock</button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            ` : ''}
        `);

        // Load Chart
        await this.loadChart(this.currentRange);

        // Start live auto-polling while viewing dashboard
        this.startPolling();

        // Listen for new sales dispatched from Counter Billing
        if (!this.isInitialized) {
            window.addEventListener('ims:sale-completed', () => {
                if (App.currentPage === 'dashboard') {
                    this.refreshAll();
                }
            });
            this.isInitialized = true;
        }
    },

    startPolling() {
        this.stopPolling();
        this.pollInterval = setInterval(() => {
            if (App.currentPage !== 'dashboard') {
                this.stopPolling();
                return;
            }
            this.refreshDataSilent();
        }, 8000);
    },

    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    },

    async switchRange(range) {
        this.currentRange = range;
        ['7d', '30d', '12m'].forEach(r => {
            const btn = document.getElementById(`btnRange${r}`);
            if (btn) {
                btn.className = `btn btn-sm ${r === range ? 'btn-primary' : 'btn-secondary'}`;
            }
        });
        await this.loadChart(range);
    },

    async refreshAll() {
        await this.loadChart(this.currentRange);
        const resp = await App.api('/api/dashboard');
        if (resp && resp.success) this.updateKpis(resp.data);
    },

    async refreshDataSilent() {
        try {
            await this.loadChart(this.currentRange, true);
            const resp = await App.api('/api/dashboard');
            if (resp && resp.success) this.updateKpis(resp.data);
        } catch {}
    },

    updateKpis(data) {
        if (!data) return;
        const today = data.today || {};
        const store = data.store || {};
        const credit = data.credit || {};

        const elTodayBilled = document.getElementById('kpiTodayBilled');
        if (elTodayBilled && today.billed) elTodayBilled.textContent = today.billed;

        const elTodayBillCount = document.getElementById('kpiTodayBillCount');
        if (elTodayBillCount && today.billCount !== undefined) elTodayBillCount.textContent = today.billCount;

        const elCash = document.getElementById('kpiCashSales');
        if (elCash && today.cashSales) elCash.textContent = today.cashSales;

        const elUpi = document.getElementById('kpiUpiSales');
        if (elUpi && today.upiSales) elUpi.textContent = today.upiSales;

        const elCredit = document.getElementById('kpiCreditGiven');
        if (elCredit && today.creditGiven) elCredit.textContent = today.creditGiven;

        const elActive = document.getElementById('kpiActiveProducts');
        if (elActive && store.activeProducts !== undefined) elActive.textContent = store.activeProducts;

        const elLow = document.getElementById('kpiLowStock');
        if (elLow && store.lowStockCount !== undefined) elLow.textContent = store.lowStockCount;

        const elOut = document.getElementById('kpiOutOfStock');
        if (elOut && store.outOfStockCount !== undefined) elOut.textContent = store.outOfStockCount;

        const elStockVal = document.getElementById('kpiStockValue');
        if (elStockVal && store.stockValueAtCost) elStockVal.textContent = store.stockValueAtCost;

        const elOutstanding = document.getElementById('kpiTotalOutstanding');
        if (elOutstanding && credit.totalOutstanding) elOutstanding.textContent = credit.totalOutstanding;

        const elCustDues = document.getElementById('kpiCustomersWithDues');
        if (elCustDues && credit.customersWithDues !== undefined) elCustDues.textContent = credit.customersWithDues;
    },

    async loadChart(range, silent = false) {
        const resp = await App.api(`/api/dashboard/sales?range=${range}`);
        if (!resp || !resp.success) return;

        const dataPoints = resp.data || [];
        const canvas = document.getElementById('salesTrendChart');
        if (!canvas) return;

        const labels = dataPoints.map(d => d.label);
        const dataValues = dataPoints.map(d => d.total);

        // Silent in-place real-time update
        if (silent && this.chart) {
            this.chart.data.labels = labels;
            this.chart.data.datasets[0].data = dataValues;
            this.chart.update('none');
            return;
        }

        if (this.chart) {
            this.chart.destroy();
        }

        const ctx = canvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, 240);
        gradient.addColorStop(0, 'rgba(31, 95, 139, 0.28)');
        gradient.addColorStop(1, 'rgba(31, 95, 139, 0.01)');

        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Sales (₹)',
                    data: dataValues,
                    borderColor: '#1F5F8B',
                    backgroundColor: gradient,
                    borderWidth: 2.5,
                    tension: 0.3,
                    fill: true,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#1F5F8B',
                    pointBorderColor: '#FFFFFF',
                    pointBorderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: silent ? 0 : 500
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        titleFont: { size: 12, weight: '600' },
                        bodyFont: { size: 13, weight: '700' },
                        padding: 10,
                        cornerRadius: 6,
                        callbacks: {
                            title: (items) => {
                                const idx = items[0].dataIndex;
                                return dataPoints[idx]?.label || items[0].label;
                            },
                            label: (ctx) => {
                                const idx = ctx.dataIndex;
                                const item = dataPoints[idx];
                                const bills = item?.count || 0;
                                const billsText = bills === 1 ? '1 bill' : `${bills} bills`;
                                return `₹${ctx.parsed.y.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${billsText})`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: {
                            font: { size: 11 },
                            maxRotation: 0,
                            autoSkip: true,
                            maxTicksLimit: range === '30d' ? 10 : 7
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(0, 0, 0, 0.05)' },
                        ticks: {
                            font: { size: 11 },
                            callback: (v) => `₹${v.toLocaleString('en-IN')}`
                        }
                    }
                }
            }
        });
    }
};

window.Dashboard = Dashboard;
