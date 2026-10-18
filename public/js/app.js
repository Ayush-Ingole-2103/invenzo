// ============================================
// App Shell — Navigation, Auth, I18n, Utilities
// PRD v5.0 Multi-Tenant Vendor Portal Shell
// ============================================

const App = {
    currentPage: 'dashboard',
    user: null,
    csrfToken: '',
    currency: '₹',
    settings: {},

    async init() {
        // Initialize i18n first
        if (window.I18n) {
            await window.I18n.init();
        }

        // Check auth
        try {
            const resp = await this.api('/api/auth/me');
            if (!resp.success) throw new Error('Not authenticated');
            this.user = resp.data;
            this.csrfToken = resp.data.csrfToken;
            sessionStorage.setItem('csrfToken', this.csrfToken);
        } catch {
            window.location.href = '/login';
            return;
        }

        // Load store settings
        try {
            const settingsResp = await this.api('/api/settings');
            if (settingsResp.success && settingsResp.data) {
                this.settings = settingsResp.data.settings || {};
                this.store = settingsResp.data.store || {};
            }
        } catch {}

        // Setup UI
        this.setupUser();
        this.setupI18nPicker();
        this.setupNavigation();
        this.setupSidebar();
        this.setupLogout();
        this.setupConfirmModal();

        // Check hash routing or default to dashboard
        const initialPage = window.location.hash ? window.location.hash.substring(1) : 'dashboard';
        this.navigate(initialPage);
    },

    setupUser() {
        const nameEl = document.getElementById('userName');
        const roleEl = document.getElementById('userRole');
        const avatarEl = document.getElementById('userAvatar');
        const storeNameEl = document.getElementById('storeNameDisplay');

        if (nameEl) nameEl.textContent = this.user.name || 'User';
        if (roleEl) roleEl.textContent = this.user.role === 'admin' ? 'Store Admin' : 'Staff';
        if (avatarEl && this.user.name) avatarEl.textContent = this.user.name.charAt(0).toUpperCase();
        if (storeNameEl) storeNameEl.textContent = this.user.storeName || (this.store && this.store.name) || 'Store';
    },

    setupI18nPicker() {
        const picker = document.getElementById('langSelect');
        if (!picker || !window.I18n) return;

        picker.value = window.I18n.currentLocale || 'en';
        picker.addEventListener('change', async (e) => {
            const lang = e.target.value;
            await window.I18n.setLocale(lang);
            // Re-render current page to update static headers/toolbars
            this.navigate(this.currentPage);
        });
    },

    setupNavigation() {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const page = item.dataset.page;
                if (page) {
                    window.location.hash = page;
                    this.navigate(page);
                }
            });
        });

        window.addEventListener('hashchange', () => {
            const page = window.location.hash.substring(1);
            if (page && page !== this.currentPage) {
                this.navigate(page);
            }
        });
    },

    setupSidebar() {
        const hamburger = document.getElementById('hamburgerBtn');
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        const closeBtn = document.getElementById('sidebarClose');

        const toggle = () => {
            sidebar?.classList.toggle('open');
            overlay?.classList.toggle('active');
        };

        const close = () => {
            sidebar?.classList.remove('open');
            overlay?.classList.remove('active');
        };

        if (hamburger) hamburger.addEventListener('click', toggle);
        if (overlay) overlay.addEventListener('click', close);
        if (closeBtn) closeBtn.addEventListener('click', close);
    },

    setupLogout() {
        document.getElementById('logoutBtn')?.addEventListener('click', async () => {
            try {
                await this.api('/api/auth/logout', { method: 'POST' });
            } catch {}
            sessionStorage.clear();
            window.location.href = '/login';
        });
    },

    setupConfirmModal() {
        const modal = document.getElementById('confirmModal');
        const cancelBtn = document.getElementById('confirmCancel');
        const closeBtn = document.getElementById('confirmClose');

        const hide = () => modal?.classList.remove('active');
        cancelBtn?.addEventListener('click', hide);
        closeBtn?.addEventListener('click', hide);
    },

    navigate(page) {
        this.currentPage = page;

        // Update active nav
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.page === page);
        });

        // Close mobile sidebar
        document.getElementById('sidebar')?.classList.remove('open');
        document.getElementById('sidebarOverlay')?.classList.remove('active');

        // Update page title
        const titles = {
            dashboard: 'Dashboard',
            billing: 'Counter Billing',
            sales: 'Sales History',
            products: 'Products',
            categories: 'Categories',
            suppliers: 'Suppliers',
            customers: 'Customers & Udhaar',
            stock: 'Stock & Expiry',
            reports: 'Reports',
            activity: 'Activity Log',
            settings: 'Settings'
        };
        const titleEl = document.getElementById('pageTitle');
        if (titleEl) {
            titleEl.textContent = titles[page] || 'Dashboard';
        }

        // Clear topbar actions
        const topbarActions = document.getElementById('topbarActions');
        if (topbarActions) topbarActions.innerHTML = '';

        // Load page content
        const loaders = {
            dashboard: () => window.Dashboard && window.Dashboard.load(),
            billing: () => window.Billing && window.Billing.load(),
            sales: () => window.Sales && window.Sales.load(),
            products: () => window.Products && window.Products.load(),
            categories: () => window.Categories && window.Categories.load(),
            suppliers: () => window.Suppliers && window.Suppliers.load(),
            customers: () => window.Customers && window.Customers.load(),
            stock: () => window.Stock && window.Stock.load(),
            reports: () => window.Reports && window.Reports.load(),
            activity: () => window.Activity && window.Activity.load(),
            settings: () => window.Settings && window.Settings.load()
        };

        const content = document.getElementById('pageContent');
        if (content) {
            content.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Loading...</p></div>';
        }

        if (loaders[page]) {
            loaders[page]();
        } else {
            this.navigate('dashboard');
        }
    },

    // ---- API Helper ----
    async api(url, options = {}) {
        const config = {
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': this.csrfToken || sessionStorage.getItem('csrfToken') || ''
            },
            credentials: 'same-origin',
            ...options
        };

        if (options.body instanceof FormData) {
            delete config.headers['Content-Type'];
            config.body = options.body;
        } else if (options.body && typeof options.body === 'object') {
            config.body = JSON.stringify(options.body);
        }

        const resp = await fetch(url, config);
        if (resp.headers.get('content-type')?.includes('text/csv')) {
            return resp;
        }
        return resp.json();
    },

    // ---- Toast Notification ----
    toast(message, type = 'success') {
        const container = document.getElementById('toastContainer');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        const icons = {
            success: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
            error: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" x2="9" y1="9" y2="15"/><line x1="9" x2="15" y1="9" y2="15"/></svg>',
            warning: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>',
            info: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="16" y2="12"/><line x1="12" x2="12.01" y1="8" y2="8"/></svg>'
        };

        toast.innerHTML = `${icons[type] || ''}<span>${message}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease forwards';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    },

    // ---- Confirm Dialog ----
    confirm(title, message, okText = 'Confirm', okClass = 'btn btn-danger') {
        return new Promise((resolve) => {
            const modal = document.getElementById('confirmModal');
            if (!modal) return resolve(false);

            document.getElementById('confirmTitle').textContent = title;
            document.getElementById('confirmMessage').textContent = message;
            const okBtn = document.getElementById('confirmOk');
            okBtn.textContent = okText;
            okBtn.className = okClass;
            modal.classList.add('active');

            const handler = () => {
                modal.classList.remove('active');
                okBtn.removeEventListener('click', handler);
                resolve(true);
            };
            okBtn.addEventListener('click', handler);

            const cancelHandler = () => {
                okBtn.removeEventListener('click', handler);
                modal.classList.remove('active');
                resolve(false);
            };
            document.getElementById('confirmCancel')?.addEventListener('click', cancelHandler, { once: true });
            document.getElementById('confirmClose')?.addEventListener('click', cancelHandler, { once: true });
        });
    },

    // ---- Format Currency ----
    formatCurrency(amountPaiseOrRupees) {
        if (amountPaiseOrRupees === null || amountPaiseOrRupees === undefined) return '₹0.00';
        let val = Number(amountPaiseOrRupees);
        // If it's formatted as string with ₹ already, return it
        if (typeof amountPaiseOrRupees === 'string' && amountPaiseOrRupees.includes('₹')) {
            return amountPaiseOrRupees;
        }
        return `₹${val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    },

    // ---- Parse Date (handles SQLite UTC strings) ----
    parseDate(dateStr) {
        if (!dateStr) return null;
        let str = String(dateStr).trim();
        if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(str)) {
            str = str.replace(' ', 'T') + 'Z';
        } else if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
            const [y, m, d] = str.split('-').map(Number);
            return new Date(Date.UTC(y, m - 1, d));
        }
        return new Date(str);
    },

    // ---- Format Date (IST) ----
    formatDate(dateStr) {
        if (!dateStr || dateStr === '-') return '-';
        const d = this.parseDate(dateStr);
        if (!d || isNaN(d.getTime())) return '-';
        return d.toLocaleDateString('en-IN', {
            timeZone: 'Asia/Kolkata',
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    },

    // ---- Format Date & Time (IST) ----
    formatDateTime(dateStr) {
        if (!dateStr || dateStr === '-') return '-';
        const d = this.parseDate(dateStr);
        if (!d || isNaN(d.getTime())) return '-';
        return d.toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    },

    // ---- Stock Status Badge ----
    stockBadge(quantityMilliOrUnits, minimumMilliOrUnits) {
        const q = Number(quantityMilliOrUnits || 0);
        const m = Number(minimumMilliOrUnits || 0);
        if (q <= 0) {
            return '<span class="badge badge-danger"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" x2="9" y1="9" y2="15"/><line x1="9" x2="15" y1="9" y2="15"/></svg>Out of Stock</span>';
        }
        if (q <= m) {
            return '<span class="badge badge-warning"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>Low Stock</span>';
        }
        return '<span class="badge badge-success"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>In Stock</span>';
    },

    // ---- Set page content ----
    setContent(html) {
        const content = document.getElementById('pageContent');
        if (content) content.innerHTML = html;
        if (window.I18n) window.I18n.translatePage();
    },

    // ---- Set topbar action buttons ----
    setTopbarActions(html) {
        const container = document.getElementById('topbarActions');
        if (container) container.innerHTML = html;
        if (window.I18n) window.I18n.translatePage();
    }
};

// Initialize on load
window.formatRupees = function(paise, trimZeroDecimals = false) {
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
};

document.addEventListener('DOMContentLoaded', () => App.init());

