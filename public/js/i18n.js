// ============================================
// Stocker i18n Translation Engine — PRD Section 16
// ============================================

const i18n = {
    locale: localStorage.getItem('stocker_lang') || 'en',
    messages: {},

    async init() {
        const lang = localStorage.getItem('stocker_lang') || 'en';
        await this.setLocale(lang);
    },

    async setLocale(locale) {
        this.locale = locale;
        localStorage.setItem('stocker_lang', locale);
        document.documentElement.lang = locale;

        try {
            const res = await fetch(`/locales/${locale}.json`);
            if (res.ok) {
                this.messages = await res.json();
            } else {
                const fallback = await fetch('/locales/en.json');
                this.messages = await fallback.json();
            }
        } catch {
            console.warn('[i18n] Failed to load locale, using defaults');
        }

        this.translatePage();
    },

    t(key, params = {}) {
        let text = this.messages[key] || key;
        for (const [k, v] of Object.entries(params)) {
            text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
        }
        return text;
    },

    translatePage() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            el.textContent = this.t(key);
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            el.placeholder = this.t(key);
        });
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            el.title = this.t(key);
        });
    }
};

window.i18n = i18n;
