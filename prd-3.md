# Product Requirements Document (PRD)
## Stocker: Inventory and Billing Platform for Small Stores
**Version:** 5.0
**Date:** 18 October 2026
**Status:** Ready for implementation
**Audience:** The implementing agent (Antigravity) and the project owner

---

## 0. How to Read This Document

This document replaces PRD v4.0. Stocker is a multi-store platform with two completely separate parts:

1. **Vendor application.** Each store (vendor) signs in and runs its own inventory, billing, customer credit, and reports. There is one role only: **vendor**, with full access to their own store and nothing else.
2. **Developer module.** The developers (the owners of the platform) sign in separately to create and manage store profiles and to see a small set of aggregate statistics per store. Developers never see products, prices, customers, or individual sales.

What changed from v4.0. The product now targets small grocery (kirana) stores that cannot afford a POS system:
- **Fast billing** with printable bills, payment modes, and a UPI QR code (Sections 12.4, 12.5, 13).
- **Udhaar (customer credit) ledger** with payments and WhatsApp reminders (Section 12.6).
- **Decimal quantities** for loose goods sold by weight or volume (Section 11).
- **Expiry tracking and reorder lists** (Sections 12.8, 12.9).
- **Offline-capable installable app** for billing without a connection (Section 15).
- **Hindi and Marathi** interface alongside English (Section 16).
- **Optional GST layer**, off by default and behind a feature flag until reviewed by an accountant (Section 14).
- Delivery in phases (Section 26).

Design system, launch gate, tenant isolation, and the developer module carry over from v4.0.

Rules of interpretation:
- "Must" means mandatory. "Should" means expected unless there is a documented reason not to.
- If an instruction here conflicts with a default of a library, framework, or template, this document wins.
- Do not add features, sections, copy, or decoration that this document does not ask for.
- Correctness comes first. Where something is ambiguous, choose the safer behavior, record the decision in `README.md`, and continue. Do not guess silently.
- Tax and legal rules in this document are product requirements, not legal or tax advice. They must be verified by a qualified accountant or lawyer before the related feature is enabled in production.

---

## 1. Product Overview

Stocker is a web-based inventory and billing system for small businesses, offered to many independent stores. It replaces paper stock registers and credit notebooks with one place to manage products, stock, bills, customer credit, and reports, and it works on a phone.

Core principles:
- **Every change to a stock quantity is recorded in a ledger.** The current quantity of a product is always explainable from history.
- **Every change to a customer's credit balance is recorded in a ledger.** A balance is always explainable from history.
- **Money and quantities are exact.** No floating point anywhere in calculations.

**A vendor** (store owner) can:
- Sign in securely to their own store only.
- Manage products, categories, and suppliers, including items sold by weight or volume.
- Create bills quickly, take cash, UPI, or credit payment, print or share the bill, and show a UPI QR code.
- Keep a credit (udhaar) account for regular customers, record payments, and send reminders.
- Record incoming stock and stock adjustments, track expiry dates, and see a reorder list.
- Bill without a connection and sync later.
- Use the app in English, Hindi, or Marathi.
- Optionally issue GST-formatted documents and export GST summaries for their accountant (when the feature is enabled).
- View dashboards and reports, export to CSV, and review the stock movement history and activity log.
- Edit their store profile and preferences, and change their own password.

**A developer** (platform owner) can:
- Sign in through a separate developer login.
- Create, edit, suspend, and reactivate store profiles, and provision the vendor login for each store.
- See, per store: product count, total revenue, and number of sales per week, month, and year.
- Reset a vendor's password.

The system does not process payments, does not file taxes, and contains no public storefront, no advertising, and no monetization.

---

## 2. Goals and Non-Goals

### Goals
- A reliable, auditable inventory, billing, and credit record for each store.
- Billing that is fast enough for a busy counter on a low-cost phone and a weak network.
- Strict separation between stores, and between the developer realm and the vendor realm.
- A calm, readable interface that looks like finished professional software.
- Data integrity enforced by the database schema, not only by application code.
- Easy local setup and deployment, with secrets kept out of source control.

### Non-Goals (out of scope for this version)
Multiple users per store, custom or additional roles, vendor self-registration, developer access to product-level or customer-level data, developer impersonation of vendors, billing and subscriptions for the platform itself, payment processing or payment verification, automatic WhatsApp or SMS sending, marketing messages to customers, customer loyalty programs, bill-level discounts and price overrides, tax-exclusive pricing, IGST and inter-state invoices, B2B invoices with customer GSTIN, e-invoicing and e-way bills, GST return filing or portal upload, purchase orders and supplier payments, input tax credit tracking, payroll, barcode scanning by camera, forecasting, multi-warehouse support, per-store currencies, native mobile apps, sale returns and credit notes (a sale can be voided only), dark theme.

---

## 3. Corrections Required to the Current Build

The current build is single-store with whole-number quantities. A review against earlier PRDs found the gaps below. Each is mandatory and appears in the acceptance checklist (Section 27).

| # | Current behavior | Required behavior |
|---|---|---|
| C1 | Public "Create User Account" tab on the login screen. | Remove public registration entirely. Vendor accounts are created only by a developer (Section 17). |
| C2 | Settings page is missing from navigation. | Add Settings, backed by the database and scoped to the store. |
| C3 | Delete buttons are red trash icons, with no confirmation, and appear to hard-delete. | Use soft-delete (`is_active = 0`) and the label "Deactivate". Every deactivate and void action requires a confirmation dialog. |
| C4 | The Inventory Report shows 4 products while Products, Dashboard, and Categories show 3. | All views use the same rules for active records. Reports show active products by default, with an explicit "Include inactive" filter. Add an automated test asserting that Products, Dashboard, Categories, and Reports agree on counts. |
| C5 | Deleting a sale may leave stock unchanged or lose history. | Sales are never deleted. They are voided. Voiding reverses stock (and credit, if any) through new ledger rows (12.5). |
| C6 | List screens have no pagination, sorting, or date filters. | Add server-side pagination, sorting, and filtering on every list (19.2). |
| C7 | The dashboard lacks average sale value, recent stock movements, and sales by month. | Add them (12.1). The "Total stock" unit count is replaced by stock value at cost, because kilograms and pieces cannot be added meaningfully. |
| C8 | Header shows "Active User" under the user's name. | Show the store name and the vendor's name. |
| C9 | Supplier phone numbers are partly masked with asterisks. | Show the full number. Masking is not a requirement. |
| C10 | Product, supplier, and category deletes are not protected consistently. | Apply the delete-protection rules in 12.3 to all three. |
| C11 | The current database is single-store, has no store concept, and stores decimal money. | A migration creates one store from the existing data, converts the existing account to that store's vendor, converts money to integer paise and quantities to integer thousandths (Section 25). |
| C12 | Quantities are whole numbers only, so loose goods (0.5 kg, 250 g) cannot be sold. | Support decimal quantities for measured units (Section 11). |
| C13 | The "New Sale" screen is a form, not a counter billing screen. | Replace it with the billing screen in 12.4. |

---

## 4. Design Principles (Professional, Not Generated)

The interface must read as software built by an experienced team for a real business. It must be calm, dense enough to be useful, and free of marketing decoration. These rules apply to the vendor application, the developer module, and printed documents.

### 4.1 Prohibited (hard rules, no exceptions)

**Visual**
- No gradients of any kind, and in particular no purple or violet gradients. No purple or violet as a brand color.
- No pill-shaped or fully rounded buttons or tags. Maximum corner radius is 10px for controls and 14px for panels.
- No emoji anywhere in the interface, in code comments, in seeded data, in empty states, in messages, or in documentation. This includes emoji used as icons or status markers. Icons come only from Lucide.
- No decorative blobs, glassmorphism, glow effects, or particle backgrounds.
- No AI-generated or stock "AI-slop" imagery. Product images are uploaded by the user. If a product has no image, show a neutral placeholder icon from Lucide.

**Motion**
- No cursor animations, cursor followers, or custom cursors.
- No scroll-triggered animations, parallax, or reveal-on-scroll effects.
- Transitions are limited to short state changes (hover, focus, press, dialog open) of 150ms or less, on `box-shadow`, `background-color`, `color`, and `opacity` only.
- Respect `prefers-reduced-motion: reduce` by disabling all transitions.

**Content**
- No fake reviews, testimonials, or endorsements.
- No fake metrics, fake customer counters, "trusted by" strips, or invented statistics. Every number shown in the UI must be computed from real data in the database.
- No vague hero text or marketing slogans. This is a work tool. The login pages have the product name, a one-line plain description, and the form. Nothing else.
- No em dashes (the long dash character) anywhere: UI copy, error messages, documentation, comments, legal pages, translations, receipts. Use a comma, colon, period, or a plain hyphen.
- No filler or inflated copy. Words like "seamless", "powerful", "revolutionary", "supercharge", "unlock", "effortless", "next-generation", and "smart" are forbidden in every language. The login subtitle is "Inventory management" (or its reviewed translation).
- **No unverifiable claims.** The UI, legal pages, and documents must never say or imply "GST compliant", "government approved", "certified", "bank approved", or similar. Tax features are described as aids ("GST summary for your accountant").
- No "Made with AI", "Built with AI", "Generated by" or similar badge, footer text, meta tag, or comment visible to users or in served files. See Section 6.
- No platform branding or advertising on bills, invoices, or receipts.

### 4.2 Required qualities
- Plain, specific, human copy. Buttons say what they do: "Add product", "Record adjustment", "Complete bill", "Record payment", "Create store".
- Consistent terminology. One term per concept across the whole application and all languages (always "Deactivate", never a mix of "Delete" and "Remove"; always "Store" for a vendor's business; always "Vendor" for the store's user; always "Bill" for a sale document; "Credit (udhaar)" for customer credit).
- Sentence case for labels, buttons, and headings in English. Table column headers may be uppercase small text, applied consistently.
- Empty states are factual and offer the next action in text, for example: "No products yet. Add your first product." No illustrations needed.
- Error messages say what happened and what to do next.
- Translations are written by or reviewed by a native speaker (Section 16). Machine-translated strings must not ship unreviewed.

---

## 5. Visual System: Neumorphism, Done Carefully

Neumorphism (soft UI) gives the interface a calm, tactile, low-glare look. Its known weakness is low contrast and unclear affordance. This section defines the style and the mitigations that are mandatory so the result is both pleasant and accessible. The vendor application and the developer module share this one design system.

### 5.1 Concept
All surfaces share one base color. Depth is created only by paired soft shadows: a light shadow from the top-left and a dark shadow to the bottom-right. Raised elements (panels, buttons, cards) look extruded. Inset elements (inputs, selected states, pressed buttons, search fields) look pressed in.

### 5.2 Design tokens
Define these as CSS custom properties on `:root`. Do not hard-code colors elsewhere.

```css
:root {
  /* Surfaces */
  --surface:        #E4E9F0;   /* page and panel base */
  --surface-sunken: #DCE2EA;   /* table headers, inset wells */
  --shadow-light:   #FFFFFF;
  --shadow-dark:    #BAC3CF;

  /* Text (all verified for contrast on --surface) */
  --text:           #1B2430;   /* primary, contrast about 13:1 */
  --text-muted:     #465263;   /* secondary, contrast about 6.5:1 */

  /* Accent: a single muted blue. No purple. */
  --accent:         #1F5F8B;   /* contrast on --surface about 5.3:1 */
  --accent-text:    #FFFFFF;   /* text on accent fill */

  /* Status (always paired with an icon and a text label) */
  --success:        #1E6B3C;
  --warning:        #8A5A00;
  --danger:         #A12727;

  /* Borders (used for accessibility, see 5.4) */
  --border:         #C3CBD6;

  /* Elevation */
  --raised:    6px 6px 12px var(--shadow-dark), -6px -6px 12px var(--shadow-light);
  --raised-sm: 3px 3px 6px var(--shadow-dark), -3px -3px 6px var(--shadow-light);
  --inset:     inset 3px 3px 6px var(--shadow-dark), inset -3px -3px 6px var(--shadow-light);

  /* Shape */
  --radius-control: 8px;
  --radius-panel:   14px;
}
```

The implementer must verify the final contrast ratios with a checker before launch and adjust the values if any pair falls below the minimums in 5.4.

### 5.3 Component rules

| Component | Style |
|---|---|
| Page background | `--surface`. No pattern, no gradient. |
| Panels and cards | Raised (`--raised`), radius 14px, 24px padding (16px on screens narrower than 600px). |
| Primary button | Solid `--accent` fill, white text, radius 8px, small raised shadow. Pressed state uses the inset shadow. Not pill-shaped. |
| Secondary button | `--surface` fill, `--text` label, `--raised-sm`, 1px `--border`. Pressed state uses inset. |
| Destructive button | Solid `--danger` fill, white text, radius 8px. Only inside confirmation dialogs and void, deactivate, suspend, or write-off actions. |
| Text inputs, selects, search | Inset (`--inset`) plus 1px `--border`, radius 8px, min height 44px (48px on the billing screen). |
| Tables | Sit inside a panel. Header row uses `--surface-sunken`. Rows are flat with 1px `--border` dividers. **Do not give individual rows or cells raised or inset shadows**, because dense data must stay readable. Row hover uses `--surface-sunken`. |
| Navigation (sidebar) | Same `--surface` as the page. Inactive items are flat. The active item is inset and uses `--accent` text and icon. |
| Status badges | Flat with 1px border, radius 6px, icon plus text label. Not raised, not pill-shaped. |
| Dialogs | Raised panel over a dimmed overlay (solid color at reduced opacity, no blur). |
| Toasts | Raised panel, top-right, auto-dismiss after 5 seconds, dismissible, with icon plus text. |
| Charts | Chart.js in a panel. Use `--accent` and tints of the surface palette. No gradients under lines or bars. |
| Billing tiles and cart | Raised tiles with 1px `--border`, minimum 48px high, quantity controls minimum 44 by 44 px. |
| Printed documents | Flat: white background, black text, no shadows, no accent color, no decorative borders (see Section 13). |

### 5.4 Accessibility requirements (mandatory)
- Text contrast of at least 4.5:1 against its background (3:1 for large text and for UI icons and borders needed to identify a control).
- Every interactive control has a visible 1px `--border` or a clear shape. A control must never be identified only by a shadow.
- Visible keyboard focus: a 2px solid `--accent` outline with 2px offset on every focusable element. Do not remove outlines.
- Status is never conveyed by color alone. Each status has an icon and a text label.
- Touch targets are at least 44 by 44 px.
- All form fields have visible, associated `<label>` elements. Placeholders are examples, not labels.
- Full keyboard operability, including dialogs (focus trap, Escape to close, focus returns to the trigger).
- Semantic HTML (`nav`, `main`, `table` with `th scope`, `button` for actions, `a` for navigation).
- The correct `lang` attribute (`en`, `hi`, `mr`) is set on `<html>` and updated when the language changes.

### 5.5 Theme scope
Light theme only in v1.

### 5.6 Typography
- Fonts, self-hosted (no third-party CDN): **Inter** for Latin text and **Noto Sans Devanagari** for Hindi and Marathi. Font stack: `Inter, "Noto Sans Devanagari", system-ui, -apple-system, "Segoe UI", sans-serif`.
- Scale: 12, 14, 16, 20, 24, 32 px. Body text 14 or 16 px. Line height 1.5 for Latin and 1.65 for Devanagari (prevents clipped matras). Headings 1.25 (1.4 for Devanagari).
- Weights: 400 for body, 500 for labels, 600 for headings. No decorative fonts.
- Numbers use Western digits (0 to 9) in all languages. Numbers in tables and cards use tabular figures (`font-variant-numeric: tabular-nums`) and are right-aligned in columns.
- Money is shown in Indian grouping with the rupee sign, for example `₹1,23,456.50` (use `Intl.NumberFormat('en-IN')`). Whole-rupee amounts show without decimals only on summary cards and the dashboard; bills and tables always show two decimals.

### 5.7 Layout
- Desktop: fixed left sidebar (240 px) and a main area with a page header and content. Content max width 1280 px.
- Tablet: sidebar collapses to an icon rail with accessible labels (tooltips and `aria-label`).
- Mobile: top bar with a menu button that opens the navigation. Summary cards stack. Tables scroll horizontally inside their panel, or become stacked rows where a table has fewer than 5 columns. The billing screen has its own mobile layout (12.4).
- Spacing uses a 4 px base grid (4, 8, 12, 16, 24, 32).
- Layouts must not break when Hindi or Marathi labels are up to 40 percent longer than English. Test at 375 px width in all three languages.

### 5.8 Icons
Lucide only, via inline SVG or the official package. Consistent 20 px size and 1.75 stroke width. Mapping:

```text
Dashboard   LayoutDashboard      Billing    Receipt
Sales       ShoppingCart         Products   Package
Categories  Tags                 Suppliers  Truck
Customers   Contact              Stock      Boxes
Reports     BarChart3            Settings   Settings
Activity    History              Search     Search
Add         Plus                 Edit       Pencil
Deactivate  Ban                  Void       Undo2
Export      Download             Logout     LogOut
Print       Printer              Share      Share2
In stock    CheckCircle2         Low stock  AlertTriangle
Out of stock XCircle             No image   ImageOff
Expiry      CalendarClock        Reorder    ClipboardList
Credit      BookUser             Payment    Banknote
UPI QR      QrCode               Offline    WifiOff
Sync        RefreshCw            Hold bill  Pause
Stores      Store                Suspend    PauseCircle
Reactivate  PlayCircle           Reset key  KeyRound
Audit log   ScrollText           Language   Languages
```

---

## 6. Launch Gate (Release Blockers)

The first public release must not happen until **every** item below is complete and verified. The implementer must create a `LAUNCH_CHECKLIST.md` file listing these items with a status for each. Items marked (when enabled) apply only if that feature is switched on in production.

1. **Favicon.** A favicon set exists and is referenced on every page, including the developer pages: `favicon.ico` (32 px), `favicon.svg`, `apple-touch-icon.png` (180 px), and `site.webmanifest` with 192 and 512 px icons (including a maskable icon). The icon is a simple, original geometric mark in `--accent` on the surface color. It is not AI-generated artwork and not a stock glyph from another brand.
2. **No "Made with AI" tag.** Search every served file (HTML, CSS, JS, SVG, JSON locale files, manifest), the response headers, meta tags, and print templates for "made with", "built with", "generated by", "GPT", "Claude", "Gemini", "Antigravity", "Lovable", "v0", and "bolt". No user-visible or served attribution may remain. Documentation files in the repository are not served and are excluded from this search.
3. **Privacy Policy page** at `/privacy`, linked from both login pages and the application footer.
4. **Terms and Conditions page** at `/terms`, linked from the same places.
5. **Page titles and metadata.** Every page has a unique `<title>` in the format "Page name - Stocker", a meta description, and a correct `lang`. Developer pages additionally send `X-Robots-Tag: noindex, nofollow` and a `noindex` meta tag.
6. **No placeholder content.** No "Lorem ipsum", "TODO", bracketed template fields, sample emails, or default credentials in any served page.
7. **No fake data.** No hard-coded numbers in the UI. Demo seed data is loaded only in development and is clearly named (SKU prefix `DEMO-`, store names beginning `Demo Store`). Production starts with no stores and one developer account created by the command in 9.4.
8. **No default credentials in production.**
9. **Translations reviewed.** Hindi and Marathi strings have been reviewed by a native speaker for each language, the glossary in 16.4 is approved, and the locale parity test passes.
10. **UPI QR verified.** QR codes generated for payments have been scanned with at least three different real UPI apps on real phones, and each shows the correct payee, amount, and note. (The app never verifies that payment was made.)
11. **Receipts verified.** Bills have been printed (or print-previewed at actual size) at 58 mm, 80 mm, and A4 widths, in English, Hindi, and Marathi, with long product names and measured quantities.
12. **Installable app verified** on a current Android phone and a desktop browser: installs, opens offline, bills offline, and syncs (Section 15). Limitations on iOS are documented in the README.
13. **GST features (when enabled).** `FEATURE_GST` stays `false` in production until a chartered accountant has reviewed the invoice layout, tax calculations, rate list, and summary exports, and the reviewer's name and date are recorded in `LAUNCH_CHECKLIST.md`.
14. **Customer data (credit feature).** The Privacy Policy and the consent text for customers have been reviewed by a qualified professional with Indian data protection law in mind.
15. **All checklist items in Section 27 pass**, and the test suite in Section 24 passes.

### 6.1 Legal pages: content rules
These pages are required at launch. The implementer must write them so they describe what the application actually does. The owner must supply business details and have the final text reviewed by a qualified professional. This PRD does not provide legal advice.

Rules:
- Plain language, structured with headings, a "Last updated" date, and a contact section. English only in v1.
- Use bracketed fields only for facts the implementer cannot know, written as `[BUSINESS LEGAL NAME]`, `[CONTACT EMAIL]`, `[BUSINESS ADDRESS]`, `[JURISDICTION]`. **Any remaining bracketed field blocks launch** (item 6).
- No invented claims (certifications, compliance badges, uptime guarantees, security guarantees the system does not provide).

**Privacy Policy must cover, accurately for this app:**
- What data is collected: vendor name, username, hashed password, store profile details, activity logs, the inventory and billing data the vendor enters, the UPI ID the vendor enters (used only to draw QR codes), tax registration number if entered, and **customer names and phone numbers the vendor records for credit accounts**. Session and CSRF cookies are strictly necessary. No advertising or tracking cookies.
- **Roles for customer data:** the store is responsible for having the customer's agreement to be recorded (the app asks the vendor to confirm this for each customer). Stocker stores it on the store's behalf. Customer details can be erased on request (12.6).
- **What the platform operators (developers) can see:** for each store, the store profile, the number of products, total revenue (billed amount), the number of sales per week, month, and year, and the date of last sign-in. Developers cannot see product names, prices, SKUs, individual bills, customers, credit balances, UPI IDs, tax registration numbers, or stock movements, and developers cannot sign in as a vendor.
- That developer actions on stores (create, edit, suspend, reactivate, password reset) are recorded in an audit log.
- **Data on the vendor's device:** the offline feature stores a working copy of the product list, customer list, and unsynced bills in the browser on the vendor's device, and clears it on sign-out.
- **Messages:** WhatsApp reminders and bill sharing open WhatsApp with a prefilled message on the vendor's own device. Stocker does not send messages and does not share data with WhatsApp or any third party.
- **Payments:** Stocker does not process, receive, or verify payments.
- Why data is collected, retention, general security measures, how stores are isolated from each other, user rights, how to request access, correction, or deletion, and a contact point.
- The implementer must confirm what the app really does before stating it (for example, that fonts and libraries are self-hosted and no third-party requests are made).

**Terms and Conditions must cover:** acceptable use, store account responsibility, the vendor's responsibility for the accuracy of data entered, **the vendor's responsibility for tax correctness and customer credit records (the tax features are aids and not tax advice)**, that accounts are provisioned by the platform operator, the operator's right to suspend a store and the conditions for it, availability and maintenance, limitation of liability, intellectual property, termination, changes to the terms, governing law (`[JURISDICTION]`), and contact.

Both pages use the same layout, neumorphic panel, and typography as the app, are readable without signing in, and are linked from a footer that contains only: product name, Privacy Policy, Terms and Conditions. No social icons.

---

## 7. Multi-Store Architecture, Roles, and Isolation

### 7.1 Two separate realms

| | Vendor realm | Developer realm |
|---|---|---|
| Who | Store owner | Platform developers |
| Accounts live in | `vendor_users` table | `developers` table |
| Login page | `/login` | `/developer/login` |
| App pages | `/app/...` | `/developer/...` |
| API prefix | `/api/...` | `/developer/api/...` |
| Session cookie | `stocker_vendor_sid` | `stocker_developer_sid` |
| Session store | table `vendor_sessions` | table `developer_sessions` |
| Session secret | `VENDOR_SESSION_SECRET` | `DEVELOPER_SESSION_SECRET` |
| CSRF token | its own token | its own token |
| Middleware | `requireVendor` | `requireDeveloper` |
| Login rate limiter | its own counters | its own, stricter counters |
| Service worker | Yes, scope `/app/` (Section 15) | None. The developer realm is never cached or served offline. |
| Can see | Only their own store's data | Store profiles and the aggregate statistics in 17.2 only |

The two realms share no accounts, no sessions, no cookies, no secrets, no tokens, and no rate-limit counters. A developer session sent to a vendor API is rejected with 401, and the reverse. A developer username entered on the vendor login page fails with the generic message, and the reverse is also true. The vendor login page and vendor pages contain no link, text, or hint about the developer login.

### 7.2 Roles
There is exactly **one role in the vendor realm: vendor.** A vendor has full access to every function of their own store (products, stock including adjustments, billing and voiding, customers and credit, reports, settings, activity log, own password). There is no Admin, no Staff, no permission matrix, and no role column. A vendor user belongs to exactly one store. **Each store has exactly one vendor login in v1** (unique constraint on `vendor_users.store_id`).

The developer realm has one role: developer. Every developer has the same access. Developers cannot create or edit other developers through the web interface (see 9.4).

### 7.3 Tenant isolation rules (mandatory)
1. **One shared SQLite database.** Every tenant table has a `store_id INTEGER NOT NULL` column referencing `stores(id)`.
2. **`store_id` comes only from the server-side session** of the signed-in vendor. It is never accepted from the request body, query string, URL, or headers on vendor routes. If a client sends a `store_id`, it is ignored.
3. **Every data-access function for tenant tables takes `storeId` as a required first argument** and includes `store_id = ?` in every `SELECT`, `UPDATE`, and `DELETE`, and sets it on every `INSERT`. Lookups by ID use both the ID and the store (`WHERE id = ? AND store_id = ?`). A record that belongs to another store is reported as 404, not 403.
4. **The database enforces isolation too.** Foreign keys between tenant tables are composite and include `store_id`. A row can never reference another store's row. See Section 10.
5. **Uniqueness is per store.** SKU, category name, customer phone, and bill number are unique within a store, not globally.
6. **Files are per store.** Product images live under `storage/stores/<store_id>/product-images/` and are served only to the owning store's session after an ownership check.
7. **Settings, activity logs, customers, ledgers, batches, and sessions are per store.**
8. **Suspended stores.** If `stores.status = 'suspended'`, vendor sign-in is refused and any existing vendor session is ended on its next request. Offline queued bills remain on the device and sync after reactivation. Data is retained.
9. **Developer access is read-limited by construction.** The developer statistics service may read only from: `stores`, `vendor_users` (only `last_login_at`), the view `dev_product_counts`, and the view `dev_sales_facts`. It must not query any other table and must not import any vendor data-access module. See 17.4.

---

## 8. Technology Stack

| Layer | Choice |
|---|---|
| Frontend | HTML5, CSS3 (hand-written CSS with custom properties), vanilla JavaScript (ES modules) |
| Icons | Lucide |
| Charts | Chart.js |
| QR codes | `qrcode-generator` (MIT), self-hosted, runs in the browser |
| Offline | Service worker (hand-written), IndexedDB (small wrapper such as `idb`), Web App Manifest |
| i18n | Hand-written loader over JSON locale files, `Intl` for numbers and dates |
| Backend | Node.js (current LTS), Express.js |
| Database | SQLite via better-sqlite3 (foreign keys ON, WAL mode ON) |
| Auth | express-session with SQLite-backed stores (one per realm), bcrypt (cost 12) |
| Security | helmet, express-rate-limit, CSRF protection (double-submit token or equivalent) |
| Uploads | Multer, plus an image library for resizing (for example `sharp`) |
| Config | dotenv, plus `config/gstRates.json` |
| Tests | Node test runner or Vitest, supertest for API tests, Playwright for offline, print, and PWA tests |
| Fonts | Inter and Noto Sans Devanagari (SIL Open Font License), self-hosted |

All fonts, icons, chart, and QR libraries are served from the application's own origin. No third-party CDN requests at runtime, which also keeps the Content Security Policy strict.

---

## 9. Authentication and Account Management

### 9.1 Vendor login
- Page: `/login`. Fields: username, password, with a show/hide password control. A language selector (English, Hindi, Marathi) is available on the page.
- Generic failure message: "Invalid username or password." No user enumeration. The same message is used for unknown users, wrong passwords, and inactive users.
- If the password is correct but the store is suspended, show: "This store account is suspended. Contact the application provider."
- Rate limit: 5 failed attempts per 15 minutes per IP and username combination, then: "Too many attempts. Try again in a few minutes."
- Session cookie: `stocker_vendor_sid`, `httpOnly`, `sameSite=strict`, `secure` in production. Idle timeout comes from the store's `session_timeout_minutes` setting (default 30). The offline billing rules in 15.7 apply when there is no connection.
- A new session ID is generated on login (prevents session fixation).
- Updates `vendor_users.last_login_at` on success.
- All attempts are written to the store's `activity_logs` (success and failure for known usernames).
- If `must_change_password = 1`, the vendor is forced to a "Set a new password" screen after login and cannot use any other page or API until the password is changed.

### 9.2 Vendor login page content
Product name, the line "Inventory management", the form, the language selector, and a footer with the Privacy Policy and Terms links. No tabs, no registration link, no illustrations, no taglines, and no mention of the developer login.

### 9.3 Vendor account provisioning
- There is no self-registration and no first-run setup screen for vendors.
- A developer creates a store and its vendor login together (17.1). The system generates a random temporary password (at least 14 characters), shows it to the developer **once**, and stores only the hash. The vendor account is created with `must_change_password = 1`.
- A developer can reset a vendor's password the same way (new temporary password, shown once, forced change at next login).
- Password policy (set by vendors on change): minimum 10 characters, must differ from the username and from the previous password.
- A vendor can change their own password from the profile menu.
- A vendor cannot be deleted. A store is suspended instead.

### 9.4 Developer login and accounts
- Page: `/developer/login`. Plain text "Developer sign in" and the form. Not linked from any vendor page, not in any sitemap, `noindex`. English only.
- Fields: username, password. Same generic failure message as the vendor login.
- Rate limit: 5 failed attempts per 15 minutes per IP and username, with a stricter lockout (30 minutes) after 10 failures. Counters are separate from the vendor limiter.
- Session cookie: `stocker_developer_sid`, `httpOnly`, `sameSite=strict`, `secure` in production, scoped with `Path=/developer`. Idle timeout 20 minutes by default (`DEVELOPER_SESSION_TIMEOUT_MINUTES`).
- Developer password policy: minimum 12 characters.
- **There is no web interface to create developers and no sign-up.** Developers are created from the command line by someone with server access: `npm run create-developer -- --name "Name" --username "username"`. The command prompts for the password without echoing it, or generates one. `npm run reset-developer-password` and `npm run deactivate-developer` exist for the same reason.
- A developer can change their own password from the profile menu.
- Optional hardening, controlled by environment variable: `DEVELOPER_ALLOWED_IPS` (comma-separated). When set, developer routes return 404 for other addresses. In production, serving the developer module on a separate hostname is recommended and must work without code changes (all developer paths are under `/developer`).
- All developer sign-ins and all developer actions are written to `developer_audit_logs` (17.3).

### 9.5 Logout
Destroys the server-side session of that realm only and clears that realm's cookie. For vendors, sign-out is blocked while unsynced bills exist (15.6). Sign-out also clears the offline caches and local data of that vendor on the device.

---

## 10. Database Design

One SQLite file. Foreign keys enforced (`PRAGMA foreign_keys = ON`). All timestamps are stored in UTC as ISO 8601 text and displayed in the store's time zone in the format `18 Oct 2026, 12:35` (localized month names for Hindi and Marathi). Dates without time (expiry dates) are stored as `YYYY-MM-DD` text.

**Money** is stored as **integer paise**. **Quantities** are stored as **integer thousandths of a unit** ("milli-units"), in columns whose names end in `_milli`. Floating point is never used for either. See Section 11.

The complete schema for every phase (including GST and offline columns) is created in the first migration, so later phases do not need structural changes. Features stay switched off in the UI until their phase.

### 10.1 Platform tables (not tenant data)

**developers**
`id` PK; `name` TEXT NOT NULL; `username` TEXT NOT NULL UNIQUE COLLATE NOCASE; `password_hash` TEXT NOT NULL; `is_active` INTEGER NOT NULL DEFAULT 1; `last_login_at` TEXT; `created_at`.

**stores**
`id` PK; `store_code` TEXT NOT NULL UNIQUE (generated, format `STR-000001`); `name` TEXT NOT NULL; `owner_name` TEXT NOT NULL; `phone` TEXT; `email` TEXT; `address` TEXT; `city` TEXT; `timezone` TEXT NOT NULL DEFAULT 'Asia/Kolkata'; `status` TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')); `suspended_reason` TEXT; `created_by` INTEGER NOT NULL FK developers; `created_at`; `updated_at`.

**vendor_users** (the single vendor login of a store)
`id` PK; `store_id` INTEGER NOT NULL UNIQUE FK stores; `name` TEXT NOT NULL; `username` TEXT NOT NULL UNIQUE COLLATE NOCASE; `password_hash` TEXT NOT NULL; `must_change_password` INTEGER NOT NULL DEFAULT 1; `is_active` INTEGER NOT NULL DEFAULT 1; `last_login_at` TEXT; `created_at`.

**developer_audit_logs** (append-only)
`id` PK; `developer_id` INTEGER NULL FK developers; `action` TEXT NOT NULL (for example `LOGIN_SUCCESS`, `LOGIN_FAILURE`, `STORE_CREATE`, `STORE_UPDATE`, `STORE_SUSPEND`, `STORE_REACTIVATE`, `VENDOR_PASSWORD_RESET`); `store_id` INTEGER NULL FK stores; `details` TEXT (JSON, never contains passwords); `ip_address` TEXT; `created_at`.

**Session tables:** `vendor_sessions` and `developer_sessions`, managed by the session stores.

### 10.2 Tenant tables (every one has `store_id INTEGER NOT NULL FK stores`)

Every tenant table also gets `UNIQUE (store_id, id)` so that composite foreign keys can reference it.

**categories**
`id` PK; `store_id`; `name` TEXT NOT NULL; `is_active` INTEGER NOT NULL DEFAULT 1; `created_at`. `UNIQUE (store_id, name COLLATE NOCASE)`.

**suppliers**
`id` PK; `store_id`; `name` TEXT NOT NULL; `phone`; `email`; `address`; `is_active` INTEGER NOT NULL DEFAULT 1; `created_at`.

**products**
`id` PK; `store_id`; `name` TEXT NOT NULL; `category_id` INTEGER NOT NULL; `supplier_id` INTEGER NULL; `sku` TEXT NOT NULL (may hold a barcode); `price` INTEGER NOT NULL CHECK(price >= 0) (paise per unit; tax-inclusive when GST is on); `cost_price` INTEGER CHECK(cost_price >= 0); `quantity_milli` INTEGER NOT NULL DEFAULT 0 CHECK(quantity_milli >= 0); `minimum_stock_milli` INTEGER NOT NULL DEFAULT 10000 CHECK(minimum_stock_milli >= 0); `reorder_quantity_milli` INTEGER NULL CHECK(reorder_quantity_milli > 0); `unit` TEXT NOT NULL DEFAULT 'piece' CHECK(unit IN ('piece','pack','box','dozen','kg','litre')); `track_expiry` INTEGER NOT NULL DEFAULT 0; `is_quick_item` INTEGER NOT NULL DEFAULT 0; `hsn_code` TEXT NULL; `gst_rate_bps` INTEGER NULL CHECK(gst_rate_bps >= 0) (hundredths of a percent, so 5 percent is 500); `image` TEXT; `is_active` INTEGER NOT NULL DEFAULT 1; `created_at`; `updated_at`.
`UNIQUE (store_id, sku COLLATE NOCASE)`.
`FOREIGN KEY (store_id, category_id) REFERENCES categories (store_id, id)`.
`FOREIGN KEY (store_id, supplier_id) REFERENCES suppliers (store_id, id)`.

**customers**
`id` PK; `store_id`; `name` TEXT NOT NULL; `phone` TEXT NULL (normalized, digits only, 10-digit Indian mobile); `credit_limit` INTEGER NULL CHECK(credit_limit >= 0) (paise); `balance` INTEGER NOT NULL DEFAULT 0 (paise owed by the customer; negative means the customer is in advance); `consent_recorded_at` TEXT NOT NULL; `is_active` INTEGER NOT NULL DEFAULT 1; `erased_at` TEXT NULL; `created_at`; `updated_at`.
Partial unique index: `UNIQUE (store_id, phone) WHERE phone IS NOT NULL`.

**customer_ledger** (append-only)
`id` PK; `store_id`; `customer_id` INTEGER NOT NULL; `type` TEXT NOT NULL CHECK(type IN ('credit_sale','payment','writeoff','void_reversal')); `amount_change` INTEGER NOT NULL CHECK(amount_change <> 0) (positive increases what the customer owes); `balance_after` INTEGER NOT NULL; `payment_mode` TEXT NULL CHECK(payment_mode IN ('cash','upi')); `reference_id` INTEGER NULL (sale id when relevant); `note` TEXT; `created_by` INTEGER NOT NULL FK vendor_users; `created_at`.
`FOREIGN KEY (store_id, customer_id) REFERENCES customers (store_id, id)`.
Triggers raise an error on UPDATE or DELETE.

**sales** (one row per bill)
`id` PK; `store_id`; `client_sale_id` TEXT NOT NULL (UUID generated by the client; idempotency key); `source` TEXT NOT NULL CHECK(source IN ('online','offline_sync')); `financial_year` TEXT NOT NULL (for example `2026-27`, April to March in the store's time zone); `bill_number` INTEGER NULL; `offline_ref` TEXT NULL; `document_type` TEXT NOT NULL DEFAULT 'bill' CHECK(document_type IN ('bill','bill_of_supply','tax_invoice')); `customer_id` INTEGER NULL; `payment_mode` TEXT NOT NULL CHECK(payment_mode IN ('cash','upi','credit')); `total_amount` INTEGER NOT NULL CHECK(total_amount > 0); `amount_paid` INTEGER NOT NULL CHECK(amount_paid >= 0 AND amount_paid <= total_amount); `due_amount` INTEGER NOT NULL CHECK(due_amount = total_amount - amount_paid); `total_taxable` INTEGER NOT NULL DEFAULT 0; `total_cgst` INTEGER NOT NULL DEFAULT 0; `total_sgst` INTEGER NOT NULL DEFAULT 0; `status` TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('completed','voided')); `voided_at` TEXT; `void_reason` TEXT; `needs_attention` INTEGER NOT NULL DEFAULT 0; `attention_reason` TEXT; `created_by` INTEGER NOT NULL FK vendor_users; `created_at` TEXT NOT NULL (billing time); `synced_at` TEXT NULL.
Constraints: `CHECK (bill_number IS NOT NULL OR offline_ref IS NOT NULL)`; `CHECK (payment_mode = 'credit' OR due_amount = 0)`; `CHECK (payment_mode <> 'credit' OR (due_amount > 0 AND customer_id IS NOT NULL))`; `UNIQUE (store_id, client_sale_id)`; partial unique `UNIQUE (store_id, financial_year, bill_number) WHERE bill_number IS NOT NULL`; `FOREIGN KEY (store_id, customer_id) REFERENCES customers (store_id, id)`.

**sale_items**
`id` PK; `store_id`; `sale_id` INTEGER NOT NULL; `product_id` INTEGER NOT NULL; `product_name` TEXT NOT NULL (snapshot); `unit` TEXT NOT NULL (snapshot); `quantity_milli` INTEGER NOT NULL CHECK(quantity_milli > 0); `price` INTEGER NOT NULL CHECK(price >= 0) (paise per unit at time of billing); `cost_price` INTEGER NULL (snapshot, for future profit reports); `subtotal` INTEGER NOT NULL CHECK(subtotal >= 0); `hsn_code` TEXT NULL; `gst_rate_bps` INTEGER NULL; `taxable_value` INTEGER NOT NULL DEFAULT 0; `cgst_amount` INTEGER NOT NULL DEFAULT 0; `sgst_amount` INTEGER NOT NULL DEFAULT 0.
`FOREIGN KEY (store_id, sale_id) REFERENCES sales (store_id, id)`.
`FOREIGN KEY (store_id, product_id) REFERENCES products (store_id, id)`.

**stock_movements** (append-only)
`id` PK; `store_id`; `product_id` INTEGER NOT NULL; `type` TEXT NOT NULL CHECK(type IN ('restock','sale','adjustment','void_reversal')); `quantity_change_milli` INTEGER NOT NULL CHECK(quantity_change_milli <> 0); `quantity_after_milli` INTEGER NOT NULL CHECK(quantity_after_milli >= 0); `reference_id` INTEGER NULL (sale id when relevant); `is_system` INTEGER NOT NULL DEFAULT 0 (1 for automatic corrections, see 15.5); `note` TEXT; `created_by` INTEGER NOT NULL FK vendor_users; `created_at` (server time).
`FOREIGN KEY (store_id, product_id) REFERENCES products (store_id, id)`.
Triggers raise an error on UPDATE or DELETE.

**stock_batches** (expiry tracking, 12.8)
`id` PK; `store_id`; `product_id` INTEGER NOT NULL; `batch_label` TEXT NULL; `expiry_date` TEXT NOT NULL; `quantity_received_milli` INTEGER NOT NULL CHECK(quantity_received_milli > 0); `movement_id` INTEGER NOT NULL; `created_by` INTEGER NOT NULL FK vendor_users; `created_at`.
`FOREIGN KEY (store_id, product_id) REFERENCES products (store_id, id)`.
`FOREIGN KEY (store_id, movement_id) REFERENCES stock_movements (store_id, id)`.
Rows are never deleted. Only `batch_label` and `expiry_date` may be corrected (logged in the activity log).

**activity_logs** (append-only, vendor-visible, per store)
`id` PK; `store_id`; `vendor_user_id` INTEGER NULL FK vendor_users; `action` TEXT NOT NULL; `entity_type` TEXT; `entity_id` INTEGER; `details` TEXT (JSON); `ip_address` TEXT; `created_at`. Same triggers as above. Details never contain passwords, and never contain customer phone numbers.

**store_settings**
`store_id` INTEGER NOT NULL FK stores; `key` TEXT NOT NULL; `value` TEXT NOT NULL; `updated_at`. `PRIMARY KEY (store_id, key)`.
Keys and defaults: `default_minimum_stock` ("10"), `items_per_page` ("20"), `session_timeout_minutes` ("30"), `language` ("en"), `upi_id` (""), `bill_prefix` (""), `receipt_width` ("80mm"), `receipt_footer` ("Thank you"), `expiry_alert_days` ("30"), `gst_mode` ("none"), `gstin` (""), `default_gst_rate_bps` (""). Created with defaults when a store is created.

### 10.3 Developer-facing views (the only tenant data developers may read)

```sql
-- Count of active products per store. No product fields exposed.
CREATE VIEW dev_product_counts AS
  SELECT store_id, COUNT(*) AS product_count
  FROM products
  WHERE is_active = 1
  GROUP BY store_id;

-- Minimal sales facts: no items, no product, no user, no customer.
CREATE VIEW dev_sales_facts AS
  SELECT store_id, created_at, status, total_amount
  FROM sales;
```

### 10.4 Indexes
`products(store_id, sku)`, `products(store_id, category_id)`, `products(store_id, supplier_id)`, `products(store_id, is_active)`, `products(store_id, is_quick_item)`, `customers(store_id, name)`, `customer_ledger(store_id, customer_id, created_at)`, `sales(store_id, created_at)`, `sales(store_id, status)`, `sales(store_id, customer_id)`, `sales(store_id, needs_attention)`, `sale_items(store_id, sale_id)`, `sale_items(store_id, product_id)`, `stock_movements(store_id, product_id, created_at)`, `stock_batches(store_id, product_id, expiry_date)`, `activity_logs(store_id, created_at)`, `developer_audit_logs(created_at)`, `stores(status)`.

### 10.5 Relationships
Developer 1 to many Stores (created by). Store 1 to 1 Vendor user, and 1 to many each of Categories, Suppliers, Products, Customers, Sales, Stock movements, Stock batches, Activity logs, Settings. Category 1 to many Products. Supplier 1 to many Products. Customer 1 to many Sales and Ledger entries. Sale 1 to many Sale items. Product 1 to many Sale items, Stock movements, and Stock batches. All tenant relationships are within the same store.

---

## 11. Quantity, Money, and Stock Rules

### 11.1 Money
- Stored and calculated as integer paise. Displayed as rupees with Indian grouping (5.6).
- Limits: unit price at most ₹1,00,000 (10,000,000 paise); line amount at most ₹1,00,00,000; bill total at most ₹1,00,00,000.
- Intermediate products (quantity times price) must use `BigInt` or an equivalent exact method, even though the limits keep them inside safe integer range.
- The API sends and receives money as integer paise.

### 11.2 Quantities and units
- Stored as integer thousandths (`_milli`). Exchanged with the API and entered in the UI as **decimal strings** with at most 3 decimal places (for example `"0.250"`). Parse them with string and integer arithmetic. Never convert through floating point.
- Units:

| Unit | Kind | Allowed quantity |
|---|---|---|
| piece, pack, box, dozen | Whole | Whole numbers only |
| kg, litre | Measured | Up to 3 decimals (so 250 g is `0.250` kg) |

- Whole-unit products reject fractional quantities everywhere (sales, restock, adjustment, initial quantity, minimum stock). Measured products accept up to 3 decimals. The database also enforces this with triggers on `products`, `sale_items`, and `stock_movements`.
- Quantity limits: a bill line at most 100,000 units; stock at most 10,000,000 units.
- Display: measured quantities show without trailing zeros (`2`, `0.25`, `1.5`), followed by the unit. Quantity pads for measured units offer presets 0.25, 0.5, 1, 2 and show the gram equivalent for kg (for example "0.250 kg (250 g)").
- A product's unit can be changed only between units of the same kind, or while the product has no stock movements and no sales.

### 11.3 Line amount
`line_amount = floor((quantity_milli * price_paise + 500) / 1000)`, which rounds half up to the nearest paisa. Bill total is the sum of line amounts. There is no extra rounding of the bill total.

### 11.4 Stock rules (inside each store)
1. Quantity can never be negative. Enforced by the `CHECK` constraint and by transaction-time validation.
2. A sale cannot exceed available stock. The check happens **inside the transaction**, not only when an item is added to the cart. (Offline-synced bills follow 15.5 instead.)
3. Every quantity change writes a `stock_movements` row in the **same transaction**. There is no code path that updates `products.quantity_milli` without writing a movement row.
4. Adjustments require a reason of at least 3 characters.
5. Creating a product with a non-zero initial quantity writes an initial `restock` movement with the note "Initial stock".
6. Products with any sales or movement history are never hard-deleted. Products are deactivated.
7. Product edits cannot change quantity. Quantity changes go only through the stock endpoints and the billing endpoints.
8. Status is derived, never stored:
   - In stock: `quantity_milli > minimum_stock_milli`
   - Low stock: `quantity_milli > 0 AND quantity_milli <= minimum_stock_milli`
   - Out of stock: `quantity_milli = 0`

### 11.5 Customer balance rules
1. Every change to a balance writes a `customer_ledger` row in the same transaction, and `customers.balance` always equals the sum of that customer's `amount_change` values (tested).
2. A payment must be greater than zero and at most the current balance. Payments are not accepted when the balance is zero or negative.
3. A write-off must be greater than zero, at most the current balance, and needs a reason of at least 3 characters.
4. A balance may become negative only through a void reversal (a customer paid for a bill that was later voided). A negative balance is shown as "Advance" and no refund workflow exists in v1.
5. A customer with a non-zero balance cannot be deactivated or erased.

---

## 12. Vendor Application: Functional Requirements

Everything in this section operates only on the signed-in vendor's store (7.3). The vendor has access to all of it.

### 12.1 Dashboard
All figures are computed from the database for this store. Voided sales are excluded everywhere.

- **Today** panel: billed amount and bill count, cash sales, UPI sales, credit given (sum of due on credit bills), dues collected (customer payments recorded today).
- **Store** panel: total products (active), stock value at cost price (sum of quantity times cost price, with a small note "N products have no cost price" when relevant), low stock count, out of stock count.
- **Credit (udhaar)** panel: total outstanding (sum of positive balances), number of customers with dues.
- **Expiry** panel: items expiring within the alert window, items already expired (12.8).
- **Bills needing review** count (15.6), shown only when above zero, linking to the filtered Sales list.
- Also: total sales (billed amount), total transactions, average bill value.
- Sales chart with a 7-day and a 30-day toggle, plus a monthly view (last 12 months).
- Top selling products (top 5) **ranked by revenue**, showing revenue and quantity sold with unit. Bars scale relative to the top item and use a single flat color.
- Recent stock movements (last 10).
- Low stock list (names and quantities, linking to the product).

Empty data displays real zeros and empty states, never sample values.

### 12.2 Products
- Table columns: image (or placeholder icon), name, SKU, category, supplier, price per unit, stock with unit, status, actions. Search (name, SKU, category), filter by category, stock status, and quick items, sort by name, stock, price, updated date. Server-side pagination.
- Search and sorting must work for names in English, Hindi, and Marathi.
- Add and edit in a form page or dialog. Fields and validation:
  - Name: required, 2 to 120 characters, any script.
  - Category: required, must be an active category of this store.
  - Supplier: optional, must be an active supplier of this store if given.
  - SKU: required, unique within the store (case-insensitive), 2 to 40 characters, letters, digits, hyphen, underscore. A barcode number can be stored here, and a keyboard-type barcode scanner then works in the billing search (12.4).
  - Unit: piece, pack, box, dozen, kg, litre.
  - Selling price per unit: required, 0 to ₹1,00,000, at most 2 decimals. Labelled "Selling price (including GST)" when GST is in regular mode.
  - Cost price per unit: optional, same rules.
  - Initial quantity (create only): required, valid for the unit (11.2). If the product tracks expiry, an expiry date is also required.
  - Minimum stock: required, valid for the unit. Defaults to the store setting `default_minimum_stock`.
  - Reorder quantity: optional, valid for the unit.
  - Track expiry: checkbox. When turned on for a product that already has stock, the existing stock counts as "no expiry recorded" (12.8).
  - Show as quick item: checkbox. At most 24 quick items per store.
  - HSN code and GST rate: shown only when the GST feature is on and the store is in regular mode (Section 14).
  - Image: optional (Section 20).
- Actions: Edit, Deactivate, Reactivate. Deactivation needs confirmation.
- Product detail view: all fields, total quantity sold, total sales value, last 10 stock movements, supplier, and batches with expiry (if tracked).

### 12.3 Categories and Suppliers
- Add, edit, search, deactivate, reactivate.
- **Delete protection:** a category or supplier with active products cannot be deactivated. Message: "This category has active products. Reassign or deactivate those products first." (Use "supplier" for suppliers.) The response includes the count of blocking products.
- Name uniqueness within the store is case-insensitive.
- Suppliers: name required (2 to 120 characters); phone optional (Indian mobile or landline, digits, spaces, plus, hyphen, 7 to 20 characters); email optional and validated; address optional (at most 300 characters). Show full phone numbers, no masking.
- Lists show the count of active products linked to each row.
- Reactivating a product whose category or supplier is inactive is blocked with a clear message.

### 12.4 Billing screen
The billing screen is the main working screen. It must be fast on a low-cost phone and usable with one hand.

**Layout**
- Desktop and tablet: product search and quick-item tiles on the left, the cart on the right, with a sticky total bar.
- Mobile (below 768 px): two views, "Items" and "Bill", switched by a bottom bar that always shows item count, total, and a "Complete bill" button.

**Adding items**
- A search field is focused when the screen opens. It matches name, SKU, and category, in any supported script. Pressing Enter with an exact SKU match adds that product immediately. A USB or Bluetooth barcode scanner that types the code and presses Enter therefore works with no extra code.
- Quick-item tiles (products marked as quick items) show name and price. One tap adds 1 unit (whole units) or opens the quantity pad (measured units).
- Adding a product already in the cart increases its quantity.
- Whole units: plus and minus buttons and direct numeric entry. Measured units: quantity pad with presets (0.25, 0.5, 1, 2) and direct entry up to 3 decimals. **Should:** an "Enter by amount" option for measured units, where the vendor types a rupee amount and the quantity is computed as `round(amount_paise * 1000 / price_paise)` thousandths. The screen shows the resulting quantity and the exact line amount (which may differ from the typed amount by a few paise because the amount is always computed from quantity, 11.3).
- Only active products can be added. Stock shown next to each product is informational. The server checks stock when the bill is completed.
- Each line shows name, quantity with unit, rate, and amount, and can be removed. Lines can be edited before completing. There are **no price overrides and no discounts** in v1.
- In regular GST mode, a product without a GST rate cannot be added and shows "Set the GST rate for this product".

**Holding bills.** The vendor can hold the current bill and start another. Up to 5 held bills are kept on the device (in IndexedDB) and are listed in a "Held bills" menu with item count and total. Held bills do not change stock. They are removed on sign-out only after confirmation if any exist.

**Completing a bill.** "Complete bill" opens a confirmation panel with the total and a payment mode choice:
- **Cash:** optional "Amount received" field that displays the change to return. This is for display only and is not stored.
- **UPI:** shows the UPI QR code for the exact total (13.4 describes the QR). The vendor taps "Payment received" to complete the bill. The app does not verify payment.
- **Credit (udhaar):** requires choosing a customer (search by name or phone, or create a new customer inline with the consent checkbox). An optional "Paid now" amount from 0 up to less than the total. The remainder becomes the due amount. If the customer has a credit limit and the new balance would exceed it, a warning dialog requires explicit confirmation (`confirmOverLimit`).
- An optional customer can also be attached to cash and UPI bills, for name on the bill and for purchase history.
- Completing the bill requires at least one line and a total above zero.

**After completion.** A success panel shows the bill number and total, with buttons "Print bill", "Share on WhatsApp" (13.5), and "New bill". "New bill" clears the cart and returns focus to the search field. Printing uses the browser print dialog with the receipt layout (Section 13).

**Speed targets.** Adding a quick item takes one tap. A cash bill of three items can be completed in at most seven taps after opening the screen. Typing in the search field shows results in under 150 ms on the local catalog.

**Idempotent submission.** Each bill gets a `clientSaleId` (UUID) when the cart is first created. The same ID is reused for every retry of that bill. The server returns the existing bill if it has already seen that ID (so a flaky network cannot create a duplicate bill).

**Sale transaction (single DB transaction):**
```text
BEGIN IMMEDIATE
  if a sale with (store_id, client_sale_id) exists: return it (no changes)
  validate payment mode, customer (active, same store), credit rules
  for each line:
    read product WHERE id = ? AND store_id = ? (must exist and be active)
    check unit rules for the quantity
    if requested quantity > product.quantity_milli: ROLLBACK, return INSUFFICIENT_STOCK
    price = product.price (server value), compute line amount (11.3) and GST split (14.4)
  assign financial_year from the billing time in the store's time zone
  assign bill_number = MAX(bill_number in this store and financial year) + 1
  insert sale (document_type from the store's GST mode)
  for each line:
    insert sale_item with snapshots (name, unit, price, cost, HSN, rate, tax split)
    update product quantity_milli
    insert stock_movement (type 'sale', reference_id = sale id)
  if payment_mode = 'credit':
    check credit limit (409 CREDIT_LIMIT_EXCEEDED unless confirmed)
    update customers.balance
    insert customer_ledger row (type 'credit_sale', reference_id = sale id)
  update sale totals
COMMIT
```
Any error rolls back everything. Bill numbers within a financial year are consecutive for online bills; a voided bill keeps its number.

### 12.5 Sales history, bill view, and void
- Table columns: bill number (prefix plus number, or offline reference), date and time, customer, items, total, payment mode, due, status, a review flag, actions (View, Print, Void). Filters: date range, status, payment mode, customer, "needs review". Server-side pagination.
- Bill view: full bill (items, payment, tax split if any), the stock movements and ledger entry it created, and buttons Print (marked "Copy" on reprints), Share on WhatsApp, Void.
- **Void (replaces delete)** requires a reason and a confirmation dialog. In one transaction: set status to `voided`, record when and why, write a `void_reversal` stock movement for each line restoring the quantity, and, for credit bills, write a `void_reversal` ledger entry of minus the due amount. A bill can be voided only once. A bill cannot be deleted. Voided bills keep their number, are shown as cancelled when printed, and are excluded from revenue, counts, top products, GST summaries, and developer statistics.
- When GST mode is not `none` and the bill is from an earlier calendar month than today, the confirmation dialog adds: "This bill is from an earlier month. Voiding it may affect tax filings that include it. Ask your accountant before continuing."
- Bills created by offline sync that need review (15.6) carry a flag and a "Mark as reviewed" action that logs who reviewed it.

### 12.6 Customers and credit (udhaar)
**Scope.** Customers exist only to keep credit accounts and attach names to bills. There is no marketing, no loyalty program, and no automatic messaging.

**Customer fields and validation**
- Name: required, 2 to 80 characters, any script.
- Phone: optional but needed for reminders. Indian 10-digit mobile starting with 6 to 9, entered with or without `+91` or `0`, spaces, or hyphens, and stored as 10 digits. Unique within the store.
- Credit limit: optional, ₹0 to ₹10,00,000.
- **Consent checkbox (required to save):** "The customer has agreed to their name and phone number being recorded for their credit account." The time is stored in `consent_recorded_at`.

**Customers list.** Columns: name, phone, balance (shown as "Advance" with the amount when negative), credit limit, last activity, status. Filters: "With dues", active or inactive. Search by name or phone. Sort by name, balance, last activity. A footer shows the total outstanding of the filtered list. Server-side pagination.

**Customer detail.** Profile, current balance, and the ledger table (date, type, amount, balance after, mode, reference, note). Actions:
- **Record payment:** amount (default is the full balance), mode (cash or UPI, with a UPI QR for the amount), optional note. Writes a `payment` ledger entry and offers a small payment receipt to print (Section 13).
- **Write off:** amount, required reason, confirmation dialog, destructive style. Writes a `writeoff` entry.
- **Send reminder:** available when the balance is above zero and a phone number exists. Opens WhatsApp with a prefilled message (13.5). Also offers "Copy message".
- **Print statement:** the ledger for a date range in print layout.
- **Edit, Deactivate, Reactivate:** deactivation is blocked while the balance is not zero.
- **Erase personal details:** allowed only when the balance is zero. Replaces the name with "Erased customer" and removes the phone, sets `erased_at`, and deactivates the customer. Past bills and ledger entries remain for the store's records. Notes must not contain personal details, and the note field shows this hint. The action is logged and needs confirmation.

**Rules.** Section 11.5 applies. Credit bills are created from the billing screen (12.4). Customer data never leaves the store: it is not visible to developers and not included in any developer statistic.

### 12.7 Stock
A page with three tabs: "Stock", "Expiry" (12.8), and "Reorder" (12.9).

- **Add stock:** product, quantity (valid for the unit, above zero), optional note. If the product tracks expiry: expiry date (required, today or later) and optional batch label (up to 30 characters). Writes a `restock` movement and, for tracked products, a `stock_batches` row in the same transaction.
- **Adjust stock:** product, signed quantity (not zero), required reason. The resulting quantity must be zero or more. Large adjustments (more than 50 units or more than 25 percent of current stock) need an extra confirmation. Writes an `adjustment` movement. Adjustments apply to the product total and do not target a batch.
- Low stock and out of stock panels show real data with factual empty text: "No products are below their minimum stock."
- Recent movements table (paginated): product, type, change, resulting quantity, note, date. Filter by product, type, and date range. System corrections (15.5) are labelled as such.

### 12.8 Expiry tracking
Expiry is tracked only for products with "Track expiry" switched on.

**Estimating what is left per batch.** The system does not record which batch each sale came from. It assumes the oldest-expiring stock is sold first and derives the remaining quantity per batch from the product's current quantity. Derivation (a pure function, never stored):
1. Take the product's current `quantity_milli` as `remaining`.
2. Sort its batches by expiry date, latest first (ties by received time, latest first).
3. For each batch in that order: `batch_remaining = min(batch.quantity_received_milli, remaining)`, then `remaining = remaining - batch_remaining`.
4. Whatever `remaining` is left after all batches is "no expiry recorded" stock (stock that existed before tracking was turned on).
Because the function uses the current quantity, sales, voids, and adjustments are all reflected without extra bookkeeping. The screen states: "Estimated remaining. Oldest expiry is assumed to be sold first."

**Statuses (icon plus text):** Expired (expiry date earlier than today in the store's time zone), Expiring soon (today up to `expiry_alert_days` days ahead), OK. Batches with zero estimated remaining are hidden by default.

**Expiry tab.** Table: product, batch label, expiry date, days left (or days overdue), estimated remaining with unit, status. Filters: expired, expiring soon, all. Search. A vendor removes expired stock with a normal stock adjustment using the reason "Expired". The vendor can correct a batch's label or expiry date (logged).

**Dashboard and reports** use the same derivation (12.1, 12.10). Selling expired stock is not blocked by the system.

### 12.9 Reorder list
- Lists active products where `quantity_milli <= minimum_stock_milli`, grouped by supplier ("No supplier" last).
- Columns: product, current stock, minimum, suggested order quantity, unit. Suggested quantity is the product's reorder quantity if set, otherwise `2 * minimum_stock - quantity` when that is above zero, otherwise blank. The suggested quantity is editable on screen for this list only and is not saved.
- Per supplier: **Share on WhatsApp** (opens WhatsApp to the supplier's mobile number with a prefilled list, 13.5), **Copy text**, and **Print**. Without a valid supplier mobile number, only Copy and Print are offered.
- The message text is localized (Section 16). Nothing is sent by the app.

### 12.10 Reports
Each report has filters, a table, pagination, and **Export CSV**:
- **Inventory:** product, SKU, category, stock with unit, minimum, price, cost, stock value at cost, status. Active products by default, with an "Include inactive" option.
- **Sales:** bill number, date, customer, items, total, payment mode, paid, due, status. Date range filter. Option to include voided.
- **Payment summary:** for a date range, totals of cash bills, UPI bills, credit bills (billed and due), paid-at-billing on credit bills, and customer payments received by mode.
- **Top products:** rank, product, quantity with unit, revenue. Ranked by revenue. Date range filter.
- **Stock movements:** product, type, change, resulting quantity, note, date.
- **Customer dues:** customer, phone, balance, credit limit, last payment date, last activity. Default shows balances above zero.
- **Expiry:** as in 12.8.
- **Reorder list:** as in 12.9.
- **GST reports** (regular mode with the feature on): GST summary, HSN summary, invoice register (14.7).

CSV rules: UTF-8 with BOM (so spreadsheet software reads the rupee symbol and Devanagari), header row, values escaped, quantities as plain decimals, money in rupees with two decimals, and **cells starting with `=`, `+`, `-`, `@` are prefixed with a single quote to prevent CSV formula injection.** Exports use the same filters and the same query as the on-screen table and are not limited by pagination. CSV headers are in English.

### 12.11 Activity log
Read-only table for the store: time, action, entity, details. Filters by action and date range. Paginated. Includes setting changes, voids, reviews, erasures, batch corrections, and GST mode changes.

### 12.12 Settings
- **Store profile:** store name, owner name, phone, email, address, city. Editable by the vendor. `store_code`, status, and time zone are shown read-only.
- **Language:** English, Hindi, Marathi. Sets the store default. Each device can override it from the language menu (stored on the device only).
- **Billing and receipts:** bill prefix (up to 6 characters, letters, digits, hyphen), receipt width (58 mm, 80 mm, A4), receipt footer line (up to 80 characters), UPI ID (validated, 14.4 of the UPI rules in 13.4), a live preview of the receipt.
- **Preferences:** default minimum stock, items per page, session timeout in minutes (5 to 240), expiry alert days (1 to 180).
- **GST** (only if `FEATURE_GST` is on): GST mode, GSTIN, default GST rate, and a list of products missing GST details (Section 14).
- **Install app** button (15.1) and an offline status line showing the number of unsynced bills.
- **Password:** change own password.
- Validation on every field. Saved in the database, effective without restart. Confirmation toast on save. Changes to store profile, GST settings, and UPI ID are written to the activity log.

### 12.13 Navigation
Dashboard, Billing, Sales, Products, Categories, Suppliers, Customers, Stock, Reports, Activity log, Settings. There is no Users page. The header shows the store name and a sync status chip (Online, Offline with the unsynced bill count). The profile menu shows the vendor's name with "Vendor" as the role label, plus Language, Change password, and Sign out. On mobile, Billing is the first item and the app opens on it when launched as an installed app.

---

## 13. Receipts and Printing

### 13.1 Documents
| Document | Used for |
|---|---|
| Bill | Normal bill (GST mode none). Title "Bill". |
| Bill of supply | Composition-scheme stores (14.5). |
| Tax invoice | Regular GST stores (14.6). |
| Payment receipt | A customer payment against credit. |
| Customer statement | Ledger for a date range. |
| Reorder list | Per supplier, from 12.9. |

### 13.2 Layout rules
- Print styles are separate (`@media print`) and flat: white background, black text, no shadows, no accent color, no navigation, no buttons.
- Receipt width follows the store setting: 58 mm (about 32 characters per line), 80 mm (about 48 characters), or A4. Thermal widths use one column with item name on its own line when long, then quantity, rate, and amount on the next line. A4 uses a table.
- Fonts: the app font stack at 11 to 12 pt for thermal and 10 pt for A4, tabular figures, long names wrap and never overflow. Devanagari receipts use the Noto Sans Devanagari font.
- The page size is set with `@page` to the chosen width and automatic height for thermal receipts, so no blank page is produced.
- Reprints carry the line "Copy". Voided bills carry the line "Cancelled" below the bill number.

### 13.3 Bill content
Store name, address, phone; GSTIN where relevant (14); document title; bill number (prefix plus number, or the offline reference); date and time in the store's time zone; customer name if any; lines (name, quantity with unit, rate, amount); total; payment mode; for credit bills, amount paid, amount due, and customer's balance after this bill; GST block where relevant (14.6); the footer line from settings. No platform branding or advertising.

### 13.4 UPI QR code
- Generated in the browser with the self-hosted QR library, so no payment data leaves the device.
- UPI ID validation: `^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$`.
- Payload: `upi://pay?pa=<UPI ID>&pn=<store name>&am=<amount in rupees with two decimals>&cu=INR&tn=<note>` with each value URL-encoded. The note is the bill number with only letters and digits kept (for example `B1042`) or `Payment` for a customer payment. Amounts are produced from integer paise by string formatting.
- The QR is shown in the billing confirmation panel, and the payment dialog for customer dues, large enough to scan (at least 220 px), with the amount in text beside it.
- If no UPI ID is set, the UPI option still works (the vendor receives the payment on their own phone) and the panel says "Add your UPI ID in Settings to show a QR code."
- The app never claims that a payment was received. The vendor confirms it by tapping "Payment received".

### 13.5 WhatsApp sharing
- Links use `https://wa.me/91<10-digit mobile>?text=<URL-encoded message>` and open in a new tab with `rel="noopener noreferrer"`. For a bill with no stored customer phone, the vendor may type a number in the dialog, and it is used for the link only and is not stored.
- Phone numbers are valid only if they match `^(?:\+?91|0)?[6-9]\d{9}$` after removing spaces and hyphens, and are normalized to 10 digits.
- Message templates live in the locale files and are used for: bill summary, credit reminder, and supplier reorder list. Example reminder (English): "Hello {name}, your pending balance at {store} is {amount}. Please pay when convenient. Thank you." The text must be neutral, polite, and contain no threats or public shaming language.
- The app only opens WhatsApp with the prefilled text. It sends nothing itself.

---

## 14. GST Module (Optional)

This section is a product specification, not tax advice. **The whole module is behind the environment flag `FEATURE_GST` (default `false`).** When the flag is off, GST fields and settings are hidden, the API rejects GST settings, and every store behaves as `gst_mode = none`. The flag may be switched on in production only after the accountant review in Section 6 (item 13).

### 14.1 Store modes
Set by the vendor in Settings (with a confirmation dialog, logged), per store. A change applies only to bills created afterwards. Existing bills keep the document type and tax values they were created with.

| `gst_mode` | Meaning | Document | Tax lines |
|---|---|---|---|
| `none` | Not registered, or does not use GST features | Bill | None |
| `composition` | Composition scheme | Bill of supply | None. Shows GSTIN and the legend in 14.5 |
| `regular` | Regular registration | Tax invoice | CGST and SGST per line |

Modes `composition` and `regular` require a valid GSTIN in Settings.

### 14.2 Validation
- **GSTIN:** 15 characters, matching the standard pattern (2-digit state code from 01 to 38 or 97 or 99, a 10-character PAN-format part, an entity number, the letter Z, and a check character), **and** the check character must pass the standard GSTIN check-character algorithm (base-36 weighted checksum). The implementer must include unit tests with valid and invalid GSTINs supplied by the owner or taken from official examples.
- **HSN code:** digits only, 4 to 8 digits.
- **GST rate:** must be in the allowed rate list `config/gstRates.json` (basis points of a percent, for example `[0, 25, 300, 500, 1200, 1800, 2800]`). The implementer must populate this file from the **current** official rate schedule at the time of build, and the accountant must confirm it. The file is the single source of truth, can be updated without code changes, and is served read-only to the UI (`GET /api/config/gst-rates`).
- The state of supply is taken from the first two digits of the store's GSTIN and shown by name on invoices. v1 supports **intra-state supply only** (CGST and SGST).

### 14.3 Product data
In regular mode each product needs an HSN code and a GST rate. A product without a rate cannot be billed (12.4). Settings lists products missing GST details with a link to fix each. The store setting `default_gst_rate_bps` pre-fills the rate on new products.

### 14.4 Calculation (exact integer arithmetic)
Selling prices are **tax-inclusive** (like MRP). For each line, with `line_amount` computed as in 11.3 and rate `r` in basis points:

```text
taxable_value = floor((line_amount * 10000 + (10000 + r) / 2) / (10000 + r))   (rounds half up)
tax           = line_amount - taxable_value
cgst_amount   = floor(tax / 2)
sgst_amount   = tax - cgst_amount
```
The bill total is the sum of line amounts, so the customer always pays the displayed prices. `total_taxable`, `total_cgst`, and `total_sgst` on the sale are the sums of the line values. For a zero-rate line, tax is zero. All values are stored as snapshots on `sale_items` and `sales`. If the odd paisa matters for a reconciliation, the SGST side carries it, and this rule is documented in the README.

### 14.5 Composition mode
Bills are titled "Bill of supply", show the store's GSTIN, carry no tax lines, and show the legend: "Composition taxable person, not eligible to collect tax on supplies". Products do not need HSN codes or rates. The accountant must confirm the legend wording.

### 14.6 Tax invoice (regular mode)
Contains: store name, address, GSTIN, state name and code; the title "Tax invoice"; invoice number and date; customer name if any; per line: name, HSN, quantity with unit, rate, taxable value, CGST rate and amount, SGST rate and amount, line total; totals (taxable value, total CGST, total SGST, invoice total); the invoice total in words (English, Indian numbering, for example "Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six and Seventy Eight Paise Only"); payment information; the footer line. A4 and thermal layouts are both supported. Invoice numbers use the bill prefix and the consecutive per-financial-year number from 12.4.

### 14.7 GST reports (for the accountant, not for filing)
Each can be exported to CSV for a date range (default: previous full calendar month), excludes voided bills, and covers regular-mode invoices only:
- **GST summary:** for each GST rate: invoice line count, taxable value, CGST, SGST, total tax, total value; and grand totals.
- **HSN summary:** for each HSN and rate: total quantity with unit, taxable value, CGST, SGST, total value.
- **Invoice register:** invoice number, date, customer name, taxable value, CGST, SGST, total, status (completed or cancelled).
The totals of the GST summary, the HSN summary, and the invoice register must be equal for the same range (tested). The UI states "Prepared for your accountant. This is not a GST return."

### 14.8 Out of scope
IGST, inter-state supply, customer GSTIN and B2B invoices, credit notes, e-invoicing, e-way bills, return filing, input tax credit, cess, reverse charge, tax-exclusive pricing, discounts.

---

## 15. Offline and Installable App

### 15.1 Installable app (PWA)
- The vendor app is a Progressive Web App: web app manifest (name "Stocker", `start_url` of the billing screen, `display: standalone`, theme and background colors from the design tokens, 192 and 512 px icons plus a maskable icon), and a service worker.
- Install is offered by an "Install app" button in Settings only. There are no install pop-ups or banners.
- The service worker file is served from `/app/service-worker.js` with scope `/app/`. It never controls `/developer`, the login pages, or the legal pages.

### 15.2 What the service worker caches
- **App shell:** HTML, CSS, JS modules, fonts, icons, and locale files for the vendor app, precached with versioned cache names. Old caches are removed on activation.
- **Allowed API caching:** only `GET /api/billing/catalog` and `GET /api/billing/customers`, stored in IndexedDB by the app (not in the HTTP cache).
- **Never cached:** authentication endpoints, any `POST`, `PUT`, or `DELETE`, reports, ledger details, and everything else under `/api`. All API responses send `Cache-Control: no-store`.
- **Updates:** a new service worker waits. The app shows "An update is ready. Reload after you finish the current bill." A reload never happens automatically, and never while a cart has items.

### 15.3 What works offline
| Works offline | Needs a connection |
|---|---|
| Opening the app (from cache) | Sign-in |
| Billing from the cached catalog: cash, UPI, and credit bills for customers already in the cached list | Creating or editing products, categories, suppliers, customers |
| Holding bills | Stock changes, adjustments, expiry batches |
| Printing and reprinting bills (including unsynced ones) | Voiding bills, recording customer payments |
| Showing the UPI QR | Reports, dashboard, reorder and expiry lists |
| Viewing the unsynced bill queue | GST tax invoices (see 15.8) |

Screens that need a connection show: "This needs an internet connection." and a retry button.

### 15.4 Local data on the device
IndexedDB database `stocker-<store_id>` with these stores: `catalog` (id, name, SKU, unit, price, quantity snapshot, quick-item flag, active flag), `customers` (id, name, phone, balance snapshot, credit limit), `queue` (unsynced bills), `held` (held carts), `meta` (last successful sync time, last online authentication time, device code, local bill counter).
- The catalog and customers are refreshed on app start, every 5 minutes while online, and after each completed bill.
- After each offline bill, the local quantity snapshot is reduced so the screen can warn about low local stock. This is a warning only.
- All local data is removed on sign-out, and on sign-in as a different store.

### 15.5 Offline bills and sync
- An offline bill is built exactly like an online bill, using cached prices, and gets a `clientSaleId` (UUID). Its number is an **offline reference**: `L` plus the device code (4 random characters generated once per device) plus a dash and a 4-digit local counter, for example `LK7Q2-0007`. This reference is printed on the bill, shown in the app, and kept permanently. Offline bills do not receive a sequential bill number.
- Offline bills are always `document_type = 'bill'` with no tax values.
- **Sync** runs automatically when the connection returns, at app start, and from a "Sync now" button. Bills are sent in the order created, in batches of up to 20, to `POST /api/sales/sync`. The server handles each bill in its own transaction and reports, per bill, `created`, `duplicate` (already received, treated as success), or `rejected` with a reason.
- **Rules the server applies to an offline bill:**
  1. The bill is accepted as billed. The server records the client's unit price and quantities, because the customer already received a bill with them. Prices are checked only for sane bounds (11.1). If a price differs from the product's current price, the bill is flagged `price_differs`.
  2. If the product is now inactive, the bill is accepted and flagged `product_inactive`.
  3. **Stock shortfall:** if the product's recorded quantity is lower than the quantity sold, the server first writes a system `adjustment` movement (`is_system = 1`) adding exactly the shortfall with the note "Automatic correction: offline bill <reference> sold more than recorded stock", then writes the sale movement. Stock never goes below zero, the ledger stays consistent, and the bill is flagged `stock_corrected`.
  4. **Billing time:** the client's billing time is used as `created_at` if it is no more than 7 days in the past and no more than 5 minutes in the future. Otherwise the server time is used and the bill is flagged `clock_adjusted`. `synced_at` records when the server received it. Stock movements always use server time.
  5. Credit bills use the same customer and ledger rules as online bills. The credit limit warning does not block an offline bill that was already given to the customer, and the bill is flagged `over_credit_limit` if the limit is exceeded.
  6. Bills with an invalid structure (unknown product, malformed quantity, unknown customer) are `rejected`.
- **Nothing is ever silently discarded.** A rejected bill stays in the local queue with its reason, is shown in a "Needs attention" list on the billing screen, and can be downloaded as a text file ("Download unsynced bills") so the vendor can re-enter it.
- A bill is removed from the queue only after the server confirms `created` or `duplicate`.

### 15.6 Status and review
- A persistent chip in the header shows the connection state and the number of unsynced bills, with icon and text ("Offline, 3 bills waiting").
- Sign-out is blocked while unsynced bills exist: online, the app syncs first and then signs out, and if sync fails or the device is offline, sign-out explains why.
- Flagged server-side bills appear in Sales with "needs review" and in the dashboard count (12.1). The vendor can mark each as reviewed.

### 15.7 Authentication while offline
- Offline billing is allowed for up to `OFFLINE_GRACE_HOURS` (default 72) after the last successful online authentication check. After that, billing locks and shows "Connect to the internet to continue billing." Unsynced bills are kept and synced after reconnection and sign-in.
- If the session expired while offline, the vendor signs in again when the connection returns, and sync continues after sign-in.
- If the store was suspended in the meantime, sync is refused until reactivation. Bills stay on the device.

### 15.8 Restrictions
- Offline billing is available only when the store's GST mode is `none`. For `composition` and `regular` stores, billing needs a connection, because bills of supply and tax invoices must have consecutive numbers that only the server can assign. The billing screen explains this. (If the GST mode changes while offline bills are waiting, those bills still sync as plain bills.)
- iOS Safari has limits on service workers and storage. The README documents what was tested and what is not guaranteed.

---

## 16. Languages

### 16.1 Supported languages
English (`en`), Hindi (`hi`), and Marathi (`mr`) for the vendor application and printed documents. The developer module and the legal pages are English only in v1.

### 16.2 Mechanism
- All user-facing text is in flat JSON files `locales/en.json`, `locales/hi.json`, `locales/mr.json`, accessed through one translation function with named placeholders (`{name}`). No user-facing string is written directly in HTML or JavaScript. This applies from Phase 1.
- Sentences must not depend on plural forms. Use wording that works for any number ("Items: {count}").
- The store's `language` setting is the default. Each device can override it with the language menu (stored in the browser). The login page uses the device choice, or English.
- API errors return a stable `code`. The client shows the localized message for that code and falls back to the English message from the API.
- Dates and numbers use `Intl` with locales `en-IN`, `hi-IN`, `mr-IN` and Western digits. Month names are localized.
- Product, category, supplier, and customer names are user data and are shown exactly as entered.
- Printed documents use the store's language, with product names as entered. The GST invoice words-amount stays in English (14.6).
- CSV headers and the developer module stay in English.

### 16.3 Quality rules
- Locale parity test: every key exists in all three files, with the same placeholders. A missing key fails the build.
- A test fails if a user-facing string literal is found in HTML or JS outside the locale files (a simple scan is acceptable).
- Hindi and Marathi translations are written or reviewed by a native speaker (Section 6, item 9), use plain everyday retail wording, and avoid literal machine translation.
- Layouts are tested at 375 px width in all three languages (5.7).

### 16.4 Glossary
`locales/GLOSSARY.md` lists the approved Hindi and Marathi term for each core concept (store, vendor, bill, credit/udhaar, payment, balance, stock, product, category, supplier, reorder, expiry, void, deactivate, quantity, unit, total, paid, due). All translations use these terms consistently. The glossary is approved by the native reviewers before launch.

---

## 17. Developer Module

A separate area at `/developer`, using the same design system (Section 5), for the platform developers only. English only.

### 17.1 Store management
Developers can:
- **Create a store.** Form fields: store name (required, 2 to 120), owner name (required), phone, email, address, city, time zone (default Asia/Kolkata, chosen from a list), vendor login username (required, unique across vendor users, 4 to 30 characters, letters, digits, dot, underscore, hyphen), and an optional "Add starter categories" tick (Beverages, Dairy, Dry fruits, Grains, Household, Pulses, Snacks, Spices; default off). On submit, the system creates the store, its default settings, and the vendor login with a temporary password, then shows a one-time panel with the store code, the username, and the temporary password, with a copy button and the note "This password is shown once." After the panel is closed it cannot be shown again.
- **Edit a store profile** (the fields above except the vendor username and the starter categories).
- **Suspend a store** (reason required, confirmation dialog). The vendor can no longer sign in, and any current vendor session ends at its next request. Data is retained.
- **Reactivate a store** (confirmation dialog).
- **Reset the vendor's password** (confirmation dialog, new one-time temporary password, forced change on next login).

Developers cannot delete a store, cannot view or edit any inventory, billing, or customer data, and cannot sign in as a vendor.

### 17.2 What developers can see
Only the following, per store and in total:

**Store profile:** store code, name, owner name, phone, email, address, city, time zone, status, suspended reason, created date, created by, date of last vendor sign-in.

**Statistics per store (all computed from real data):**
- **Products:** number of active products.
- **Revenue:** total billed amount of the store, which is the sum of `total_amount` of completed bills for all time. It includes amounts still due on credit and excludes voided bills. The UI labels it "Total billed".
- **Sales count, this week:** number of completed bills from Monday 00:00 of the current week up to now, in the store's time zone.
- **Sales count, this month:** from the first day of the current month 00:00.
- **Sales count, this year:** from 1 January 00:00 of the current year.
- **Sales count series** (for the store detail page): weekly counts for the last 12 weeks, monthly counts for the last 12 months, and yearly counts for every year that has sales (at most the last 10 years). Weeks start on Monday. Periods with no sales show 0.

Period boundaries are calculated in application code using the store's time zone, then converted to UTC ranges for the query. Do not rely on SQLite date functions for time zone handling. Offline bills count in the period of their `created_at` (billing time) once synced.

**Platform overview (totals across all stores):** number of stores, active stores, suspended stores, total active products, total billed amount, and total sales this week, this month, and this year. Stores in different time zones are each counted by their own period boundaries.

### 17.3 What developers must never see
Product names, SKUs, prices, costs, categories, suppliers, product images, stock quantities, stock movements, expiry data, individual bills or bill items, payment modes, customers, customer phone numbers, credit balances, ledgers, UPI IDs, GSTINs or any GST data, store settings, vendor activity logs, or any other vendor business data beyond 17.2. No developer API may return these fields, even if requested.

Developer actions are recorded in `developer_audit_logs`: sign-in, store creation, store edit, suspend, reactivate, and vendor password reset. Details never contain passwords.

### 17.4 Implementation constraints for developer statistics
- All developer statistics live in one module: `services/developer/developerStatsService.js`.
- It may read only from `stores`, `vendor_users` (only `last_login_at`), `dev_product_counts`, and `dev_sales_facts`. It must not reference `products`, `categories`, `suppliers`, `customers`, `customer_ledger`, `sale_items`, `stock_movements`, `stock_batches`, `store_settings`, or `activity_logs`, and must not import any module from `services/vendor`.
- Developer API responses are built from explicit allow-lists of fields. They are never built by returning whole database rows.
- Automated tests enforce these rules (Section 24).

### 17.5 Developer screens
| Screen | Content |
|---|---|
| Overview | The platform totals in 17.2 as summary cards. Below, a table of the 5 most recently created stores. |
| Stores | Table with search (store name, owner, store code, city), filter by status, sort by name, created date, total billed, products, last sign-in. Columns: store code, store name, owner, city, status, products, total billed, sales this week, sales this month, sales this year, last sign-in, actions (View). Server-side pagination. Button "Create store". |
| Store detail | Profile panel with Edit, Suspend or Reactivate, and Reset vendor password. Statistics cards (products, total billed, sales this week, month, year). A chart and table for the sales count series with a Weekly, Monthly, Yearly toggle. |
| Create and edit store | Forms as in 17.1, plus the one-time credentials panel after creation and after password reset. |
| Audit log | Read-only table: time, developer, action, store, details. Filters by developer, action, and date range. Paginated. |
| Sign-in and Change password | As in 9.4. |

Developer navigation: Overview, Stores, Audit log. The profile menu has Change password and Sign out. The footer follows 6.1.

---

## 18. Screens and Content Standards

| Realm | Screens |
|---|---|
| Public | Privacy Policy, Terms and Conditions, 404 page |
| Vendor | Login, Set new password (forced), Dashboard, Billing (with held bills and needs-attention list), Sales, Bill view, Products, Product form, Categories, Suppliers, Customers, Customer detail, Stock (tabs: Stock, Expiry, Reorder), Reports, Activity log, Settings, 403 page, offline notice |
| Developer | Developer login, Overview, Stores, Store detail, Create and edit store, Audit log, Change password |

Every screen has: a single H1, a clear primary action (at most one primary button per view), a loading state (text "Loading", no spinners that run forever), an empty state, and an error state with a retry action. The 404 and 403 pages are plain text: what happened, and a link back to the relevant home page.

---

## 19. API Design

### 19.1 Conventions
- JSON over HTTPS in production. Vendor APIs are under `/api`. Developer APIs are under `/developer/api`.
- CSRF token required on POST, PUT, PATCH, DELETE, with a separate token per realm.
- Money is integer paise. Quantities are decimal strings with at most 3 decimals.
- Standard success shape: `{ "success": true, "data": ... }`, and for lists `{ "success": true, "data": [...], "meta": { "page": 1, "limit": 20, "total": 84 } }`.
- Standard error shape:
```json
{ "success": false, "error": { "code": "INSUFFICIENT_STOCK", "message": "Insufficient stock available for this product.", "details": {} } }
```
- HTTP codes: 200, 201, 400 (validation), 401 (not signed in, or wrong realm), 403 (password change required, or store suspended), 404, 409 (conflict, for example duplicate SKU, blocked deactivation, credit limit), 422, 429, 500.
- Unexpected errors return a generic message in production and are logged on the server with a request ID. Stack traces are never sent to the client.

### 19.2 List parameters (all list endpoints)
`page` (default 1), `limit` (default from the store setting for vendors, 20 for developers, max 100), `sortBy` (allow-listed per endpoint), `sortDir` (asc or desc), `search`, plus endpoint-specific filters. Reject unknown sort fields (do not interpolate them into SQL).

### 19.3 Vendor endpoints (`/api`)
```text
Auth        POST /api/auth/login | POST /api/auth/logout | GET /api/auth/me | POST /api/auth/change-password
Products    GET, POST /api/products | GET, PUT /api/products/:id | POST /api/products/:id/deactivate | POST .../reactivate | POST .../image
Categories  GET, POST /api/categories | PUT /api/categories/:id | POST .../deactivate | POST .../reactivate
Suppliers   GET, POST /api/suppliers | GET, PUT /api/suppliers/:id | POST .../deactivate | POST .../reactivate
Billing     GET /api/billing/catalog | GET /api/billing/customers
Sales       GET /api/sales | POST /api/sales (idempotent by clientSaleId) | POST /api/sales/sync (batch of offline bills)
            GET /api/sales/:id | GET /api/sales/:id/receipt | POST /api/sales/:id/void | POST /api/sales/:id/review
Customers   GET, POST /api/customers | GET, PUT /api/customers/:id | GET /api/customers/:id/ledger
            POST /api/customers/:id/payments | POST .../writeoffs | POST .../deactivate | POST .../reactivate | POST .../erase
Stock       POST /api/stock/add | POST /api/stock/adjust | GET /api/stock/movements | GET /api/stock/low | GET /api/stock/out
            GET /api/stock/expiry | PUT /api/stock/batches/:id | GET /api/stock/reorder
Dashboard   GET /api/dashboard | GET /api/dashboard/sales?range=7d|30d|12m | GET /api/dashboard/top-products?limit=5 | GET /api/dashboard/recent-movements?limit=10
Reports     GET /api/reports/inventory | /sales | /payment-summary | /top-products | /stock-movements | /customer-dues | /expiry | /reorder
            GET /api/reports/gst-summary | /gst-hsn | /invoice-register   (only when GST is enabled)
Store       GET, PUT /api/store (profile and preferences of the signed-in store)
Config      GET /api/config/gst-rates
Activity    GET /api/activity
```
There is no hard-delete endpoint for products, categories, suppliers, sales, customers, ledgers, batches, or stock movements. No vendor endpoint accepts a store identifier. Reports accept `format=json|csv`.

Example sale request:
```json
{
  "clientSaleId": "8b1e6c52-0d3a-4f6e-9c1b-5a2f7d9e4c10",
  "items": [
    { "productId": 12, "quantity": "0.500" },
    { "productId": 7,  "quantity": "2" }
  ],
  "paymentMode": "credit",
  "customerId": 5,
  "amountPaid": 5000,
  "confirmOverLimit": false
}
```
For offline sync, each bill also carries `createdAt`, `offlineRef`, and for each line the `price` and `productName` as billed.

Example catalog response (compact, only fields billing needs):
```json
{ "success": true, "data": { "generatedAt": "2026-10-18T07:05:00Z", "products": [
  { "id": 12, "name": "Sugar", "sku": "SUG-1", "unit": "kg", "price": 4800, "quantity": "36.500", "quick": true, "active": true }
] } }
```

### 19.4 Developer endpoints (`/developer/api`)
```text
Auth        POST /developer/api/auth/login | POST .../logout | GET .../me | POST .../change-password
Overview    GET /developer/api/overview
Stores      GET, POST /developer/api/stores | GET, PUT /developer/api/stores/:id
            POST /developer/api/stores/:id/suspend | POST .../reactivate | POST .../reset-vendor-password
Store stats GET /developer/api/stores/:id/stats?period=weekly|monthly|yearly
Audit       GET /developer/api/audit
```
Example response of `GET /developer/api/stores/:id/stats?period=monthly` (these fields only):
```json
{
  "success": true,
  "data": {
    "storeId": 3,
    "productCount": 42,
    "totalBilled": 1830050,
    "salesThisWeek": 18,
    "salesThisMonth": 74,
    "salesThisYear": 612,
    "series": [ { "label": "2026-09", "salesCount": 70 }, { "label": "2026-10", "salesCount": 74 } ]
  }
}
```
(`totalBilled` is in paise, the client formats it as rupees.) No other fields are returned.

### 19.5 Validation
All input is validated on the server with a schema (types, ranges, lengths, allow-lists). Trim strings. Reject unexpected fields. Never trust client-calculated values, except where 15.5 explicitly accepts billed prices for offline bills.

---

## 20. File Uploads
- Optional product image, stored under `storage/stores/<store_id>/product-images/`.
- Allowed: JPEG, PNG, WebP. Maximum 2 MB.
- Validate the real file type by reading the file signature (magic bytes), not only the extension or client MIME type.
- Rename to a random UUID filename server-side. Never use the client filename in a path.
- No SVG uploads.
- Images are served only through an authenticated route that checks the file belongs to the requesting store's session. Serve with `X-Content-Type-Options: nosniff`. The developer realm has no route to product images.
- Delete the old image file when it is replaced.
- Resize to a maximum of 1200 px on the longest side (use 300 px thumbnails in lists and the billing catalog).

---

## 21. Security Requirements
- Parameterized queries only. No SQL built by string concatenation, including `ORDER BY` (use allow-lists).
- bcrypt cost 12. Passwords never logged. Temporary passwords are shown once and never stored in plain text, logs, or audit details.
- helmet with a strict Content Security Policy: `default-src 'self'`, no inline scripts, no third-party origins. The service worker, QR library, fonts, and locale files are all same-origin.
- CSRF protection on all mutating requests, separate per realm. The offline sync request uses the same protection (the CSRF token is refreshed on sign-in and on reconnection).
- Rate limiting on both login endpoints (separate counters) and a general limit on each API.
- Session cookies as in Section 9, separate names, separate secrets, separate stores.
- Tenant isolation as in 7.3, including composite foreign keys and a required `storeId` argument on every tenant data-access function.
- Customer personal data (names, phones) is excluded from logs, from activity log details, from error messages, and from developer views.
- Offline data on the device is limited to what billing needs (15.4), is removed on sign-out, and is never written to any cache the browser shares across origins.
- Secrets only in `.env`. `.env` is in `.gitignore`. `.env.example` has placeholders and lists `VENDOR_SESSION_SECRET`, `DEVELOPER_SESSION_SECRET`, `DEVELOPER_SESSION_TIMEOUT_MINUTES`, `DEVELOPER_ALLOWED_IPS`, `FEATURE_GST`, and `OFFLINE_GRACE_HOURS`. The two session secrets must be different values, and the app must refuse to start in production if they are equal or unset.
- Output encoding: escape all user-supplied text when rendering. Use `textContent`, never `innerHTML`, for user data. Receipts and WhatsApp messages are built with the same care (URL-encode message text).
- CSV formula injection prevention (12.10).
- HTTPS required in production (required for service workers), with `secure` cookies and HSTS.
- Seeding never stores a plain-text password.
- Regular `npm audit` with no unresolved high or critical issues at launch.

---

## 22. Performance
- Indexed queries and server-side pagination everywhere.
- Usable with 500 stores, 10,000 products per store, and 100,000 sale and movement records per store without noticeable delay (target: list endpoints respond in under 300 ms locally, developer store list included).
- The billing catalog endpoint returns a compact payload (target: under 300 KB uncompressed for 5,000 products) and supports `If-None-Match` so repeat refreshes are cheap.
- Billing search runs locally against the in-memory catalog (results in under 150 ms on a low-cost Android phone).
- Developer statistics use aggregate queries with `GROUP BY store_id` and range filters. Do not load rows into application memory to count them.
- Load JavaScript per page. No frontend framework. Initial billing screen JavaScript under 150 KB gzipped (excluding fonts and the chart library, which is not loaded on the billing screen).
- Compress responses. Cache static assets with long-lived headers and content hashes.

---

## 23. Project Structure
```text
stocker/
  server.js
  package.json
  .env.example
  .gitignore
  config.json
  config/gstRates.json
  README.md
  LAUNCH_CHECKLIST.md
  database/        schema.sql, seed.dev.sql, db.js, migrations/
  locales/         en.json, hi.json, mr.json, GLOSSARY.md
  public/
    login.html, privacy.html, terms.html, 403.html, 404.html, site.webmanifest
    app/           dashboard, billing, sales, sale-view, products, product-form, categories,
                   suppliers, customers, customer-detail, stock, reports, activity, settings,
                   set-password, service-worker.js
    developer/     login, overview, stores, store-detail, store-form, audit, change-password
    css/           tokens.css, base.css, components.css, layout.css, pages.css, print.css
    js/            vendor/ and developer/ page modules, shared api.js, ui.js, i18n.js,
                   money.js, quantity.js, offline/ (db.js, queue.js, sync.js), receipt.js, upi.js
    assets/        favicon files, self-hosted fonts, icons
  routes/
    vendor/        auth, product, category, supplier, billing, sales, customer, stock,
                   dashboard, report, store, activity, config
    developer/     auth, overview, store, audit
  services/
    vendor/        business logic for tenant data (every function takes storeId first):
                   salesService, ledgerService, stockService, expiryService, gstService, ...
    developer/     developerStatsService.js, storeAdminService.js
  middleware/      requireVendor, requireDeveloper, requireActiveStore,
                   forcePasswordChange, csrf, rateLimit, errorHandler
  scripts/         create-developer, reset-developer-password, deactivate-developer, backup
  validators/
  tests/
  storage/stores/<store_id>/product-images/
```
Business logic lives in `services/`, not in route handlers, so it can be tested directly. Money, quantity, GST, and expiry calculations are pure functions in their own modules with exhaustive tests. Vendor and developer code must not import each other's modules, except shared utilities (time zone helpers and the database connection). The browser and the server share the same `money.js` and `quantity.js` logic so the offline bill matches the server calculation exactly.

---

## 24. Testing Requirements
Automated tests must exist and pass for:

**Realm separation**
- A developer session cookie sent to any `/api` route returns 401. A vendor session cookie sent to any `/developer/api` route returns 401.
- Developer credentials fail on the vendor login, and the reverse. Both show the generic message.
- Rate limit counters of the two realms are independent.
- The two session secrets are different, and the app refuses to start in production otherwise.
- No web route can create a developer account.
- The service worker scope excludes `/developer`.

**Tenant isolation**
- Store A's vendor cannot read, update, deactivate, or void any record of store B by guessing IDs. Every such request returns 404 (products, categories, suppliers, customers, ledgers, sales, movements, batches, images, reports).
- A `store_id` sent in a body, query string, or header on a vendor route is ignored.
- Direct database tests: inserting a product that references another store's category or supplier fails; a sale item that references another store's sale or product fails; a sale that references another store's customer fails; a ledger row that references another store's customer fails.
- The same SKU, category name, customer phone, and bill number can exist in two different stores, and cannot be duplicated within one store.
- Reports, dashboard, and exports for store A never include rows of store B.
- Store B's image URL is not served to store A's session.

**Roles**
- There is no role column on vendor users and no Users route. The vendor can perform every action in Section 12.
- Creating a second vendor login for the same store fails.

**Developer module**
- Create store: creates the store, default settings, and vendor login with `must_change_password = 1`. The temporary password is returned once and the hash only is stored. It is not present in audit details or logs.
- The vendor with a temporary password can only reach the change-password screen until the password is changed.
- Suspend: the vendor cannot sign in, an existing session is rejected on its next request, data remains. Reactivate restores access.
- Reset vendor password: old password stops working, a new temporary password works once and forces a change.
- Every developer action writes a `developer_audit_logs` row, and that table rejects UPDATE and DELETE.
- **Statistics correctness:** with a prepared dataset, product count counts active products only; total billed counts completed bills only (credit bills included at full total) and excludes voided; weekly, monthly, and yearly counts are correct, including the Monday week start, month and year boundaries, a bill at 23:59 and 00:00 in the store's time zone, a store in a different time zone than the server, and an offline bill counted by its billing time.
- **Data minimization:** a snapshot test asserts that each developer API response contains exactly the allowed keys and none of: product `name`, `sku`, `price`, `cost_price`, `quantity`, `category`, `supplier`, `items`, `movements`, `customer`, `balance`, `upi`, `gstin`.
- A static test fails if `developerStatsService.js` or any developer route file references the tables forbidden in 17.4 or imports from `services/vendor`.

**Money and quantity math**
- Table-driven tests for the line amount formula (11.3), including half-paisa cases, 0.001 quantities, the maximum limits, and values that overflow 32 bits.
- Unit alignment: fractional quantities rejected for piece, pack, box, dozen, accepted up to 3 decimals for kg and litre, rejected beyond 3 decimals, rejected as floats in the API, and rejected by the database triggers.
- Unit change rules (same kind only, or no history).
- Browser and server calculations produce identical results for the same cart (shared module, tested in both).
- "Enter by amount" computes the expected quantity and the exact line amount.
- 0.10 plus 0.20 style tests: totals use integer arithmetic only.

**Billing and sales**
- Multi-item bill, server-side prices, merged duplicate lines, insufficient stock rejected with no partial writes, concurrent bills cannot oversell.
- Idempotency: the same `clientSaleId` sent twice (and sent concurrently) creates exactly one bill and one set of stock movements and ledger rows.
- Bill numbering: consecutive within a store and financial year, restarts at the financial year change (31 March 23:59 and 1 April 00:00 in Asia/Kolkata), independent across stores, voided bills keep their numbers.
- Payment modes: cash and UPI require full payment; credit requires a customer and a due amount above zero; paid-now bounds; database CHECK constraints reject inconsistent rows.
- Void: stock restored through `void_reversal` rows, credit reversed through the ledger, cannot void twice, excluded from totals, no delete endpoint exists, earlier-month warning appears when GST mode is not none.

**Customers and credit**
- `customers.balance` equals the sum of ledger `amount_change` after every operation, including concurrent payments.
- Payment above balance rejected; payment at zero balance rejected; write-off rules; negative balance only through void reversal and shown as Advance.
- Credit limit: warning and `confirmOverLimit` flow; offline over-limit flag.
- Deactivation and erasure blocked with a non-zero balance; erasure removes name and phone and keeps the ledger.
- Phone normalization and validation table (with and without +91, 0, spaces, hyphens; invalid starts; wrong length); uniqueness per store.
- Consent is required to create a customer, and the timestamp is stored.
- Ledger table rejects UPDATE and DELETE.
- WhatsApp link construction: correct number format, correct URL encoding of Hindi and Marathi text, `rel` attributes present.

**Stock, expiry, and reorder**
- Restock, adjust with reason, adjust below zero rejected, movement rows written, movements table rejects UPDATE and DELETE.
- Expiry derivation unit tests: single batch; several batches with partial consumption; stock larger than all batches (no expiry recorded part); stock zero; two batches with the same expiry; adjustment reducing stock; void restoring stock; tracking turned on for a product that already has stock.
- Expiry status boundaries (today, last day of the alert window, one day after) in the store's time zone.
- Restock for a tracked product requires an expiry date and rejects past dates.
- Reorder list contents and suggested quantity rules (reorder quantity set, not set, result at or below zero, minimum zero).

**Offline and PWA (Playwright)**
- App opens offline after one online visit, bills offline (cash, UPI, credit to a cached customer), prints, and holds bills.
- Offline bills survive page reload and browser restart, get unique offline references, and sync in order after reconnection.
- Duplicate sync (resending the same bills) creates no duplicates and reports `duplicate`.
- Stock shortfall creates the system correction movement, keeps stock at or above zero, and flags the bill.
- Price differs, inactive product, over-credit-limit, and clock-adjusted flags (billing time in the future, and older than 7 days).
- Rejected bills stay in the queue, are listed, and can be downloaded.
- Sign-out is blocked with unsynced bills. After a successful sign-out, IndexedDB and caches are empty.
- Offline grace period locks billing after the limit and unlocks after sign-in.
- Suspended store: sync refused, bills retained, sync succeeds after reactivation.
- GST stores cannot bill offline.
- The service worker never caches non-allowed API responses or any POST.
- Update flow does not reload during an active cart.

**Languages**
- Locale parity test (keys and placeholders) for `en`, `hi`, `mr`.
- Scan test for hard-coded user-facing strings.
- Language switching updates `lang`, numbers, dates, receipts, error messages, and WhatsApp templates.
- Devanagari text renders without clipping in the billing screen, receipts, and tables (Playwright screenshots reviewed manually).

**Receipts and UPI**
- Print snapshot tests for 58 mm, 80 mm, and A4, in all three languages, with long names, measured quantities, credit bills, voided bills, and copies.
- UPI payload tests: correct parameters, URL encoding, amount formatting from paise, note sanitizing, invalid UPI ID rejected, missing UPI ID handled.
- The QR image decodes (with a QR reader library in the test) to the expected payload.

**GST (with `FEATURE_GST` on)**
- Calculation table: 0, 0.25, 3, 5, 12, 18, and 28 percent, odd-paisa splits, large and tiny amounts, and the property that the bill total equals the sum of line amounts and that taxable plus CGST plus SGST equals each line total.
- GSTIN validation with valid, invalid format, and invalid checksum values.
- Rates outside the list are rejected, and updating the config file changes the allowed set.
- Regular mode blocks products without a rate; composition mode shows the legend and no tax lines; mode `none` shows neither.
- Mode changes affect only new bills.
- GST summary, HSN summary, and invoice register totals agree for the same range, exclude voided bills, and match the sum of stored invoice values.
- Amount in words tests, including lakhs, crores, zero paise, and paise only.
- With the flag off, GST fields are absent from the UI and the API rejects GST settings.

**Vendor modules (carried over)**
- **Auth:** valid and invalid login, rate limit lockout, inactive user blocked, session expiry, no public registration route.
- **Products:** create, edit, duplicate SKU (case-insensitive, per store), validation limits, deactivate, reactivate, quantity cannot be changed through PUT, quick item limit of 24.
- **Categories and suppliers:** deactivation blocked when active products exist, and allowed after reassignment.
- **Consistency (C4):** product counts agree across Products, Dashboard, Categories, and Reports for the same data.
- **Reports:** correct filters, CSV escaping and formula-injection prefixing, UTF-8 BOM, CSV matches on-screen data, payment summary adds up to bill totals.
- **Uploads:** wrong type, spoofed extension, oversize, and SVG all rejected.
- **Security:** CSRF token required (per realm), SQL injection strings treated as data, security headers present.

**Manual checks:** keyboard-only walkthrough of every screen in both realms, screen reader spot check of forms and tables, 375 px mobile layout in all three languages, tablet layout, a contrast check of all token pairs, a real-device billing test on a low-cost Android phone on a throttled network, real thermal printer or print preview at 58 and 80 mm, UPI QR scans with three apps (Section 6).

---

## 25. Seed Data, First Run, and Migration

- **Production:** empty database except the schema. No stores, no vendors, no sample data. The first developer is created with `npm run create-developer`. That developer then creates stores.
- **Development only** (`seed.dev.sql`, loaded by an explicit command, never automatically): one developer (password supplied at seed time from an environment variable, not committed), and two stores named `Demo Store A` and `Demo Store B`, each with a vendor login and a few records with SKU prefix `DEMO-`: whole and measured products, a product with expiry batches, a customer with a credit balance, billed sales including a credit sale and a voided sale. Seed rows must create matching ledger and movement rows. The two demo stores must share a SKU, a category name, and a customer phone to exercise isolation. Seed data must be removable with one command.
- **Starter categories** are optional at store creation (17.1).
- **Migration from the current build (C11, C12):** a one-time migration script that:
  1. Backs up the existing database file before changing anything.
  2. Creates the platform tables and one store using details supplied on the command line (store name, owner name).
  3. Adds `store_id` to every existing tenant row, set to that store.
  4. Converts the first existing user to that store's vendor login with `must_change_password = 1`. Any other existing users are set inactive and listed in the script's output, because v1 allows one vendor login per store.
  5. Converts prices and totals from decimal rupees to integer paise, and quantities to integer thousandths (whole numbers times 1000).
  6. Maps units: `piece`, `box`, `pack`, `dozen`, `kg`, `litre` stay. `g` becomes `kg` and `ml` becomes `litre` with the stored quantity unchanged as thousandths and the price and cost multiplied by 1000 (so 250 g becomes 0.250 kg and line subtotals are unchanged). Any other unit becomes `piece` and is listed in the output for the owner to review.
  7. Adds the new sales columns to every existing sale: a generated `client_sale_id`, `source = 'online'`, `payment_mode = 'cash'`, `amount_paid = total_amount`, `due_amount = 0`, `document_type = 'bill'`, the financial year computed from the sale time, and sequential bill numbers per financial year ordered by sale time. Sale items get name, unit, and price snapshots from the current product record.
  8. Rebuilds the tables with the composite foreign keys, creates the new tables and triggers, and checks that no row violates them.
  9. Verifies that the sum of all sale totals before and after matches exactly, and that every product's quantity equals the last `quantity_after_milli` in its movements (or reports the mismatches without changing data).
  10. Prints a verification summary (row counts before and after per table). The migration aborts and leaves the backup untouched if any check fails.

---

## 26. Delivery Phases

All phases share the same schema (created in Phase 1), the same design system, and the same quality bar. Each phase ends only when its tests and its checklist items pass. The first public release requires the launch gate (Section 6) and is recommended after Phase 3.

| Phase | Scope | Notes |
|---|---|---|
| 1. Foundation | Multi-store architecture, both realms and logins, developer module, design system, legal pages, favicon, i18n mechanism (English strings only, no hard-coded text), products with units and decimal quantities, categories, suppliers, stock add and adjust, base dashboard, base reports, settings, migration of the current data, full schema | Fixes C1 to C12 |
| 2. Billing | Billing screen, payment modes (cash, UPI with QR, credit shown but disabled until Phase 3), bill numbering, idempotent submission, receipts for 58 mm, 80 mm, A4, held bills, WhatsApp bill sharing, void | Fixes C13 |
| 3. Credit | Customers, ledger, credit bills, payments, write-offs, reminders, statements, erasure, dues report, dashboard credit panel | Customer data privacy review (Section 6, item 14) |
| 4. Languages, expiry, reorder | Hindi and Marathi locale files and review, glossary, Devanagari print and layout checks, expiry batches and derivation, expiry tab and dashboard panel, reorder list with WhatsApp share | Native speaker review (Section 6, item 9) |
| 5. Offline | PWA, service worker, IndexedDB catalog and queue, offline billing, sync, review flags, offline grace period, install flow | Section 15 tests, real-device checks |
| 6. GST | `FEATURE_GST`, GST settings, product HSN and rates, composition and regular documents, GST reports, rate config | Accountant review before enabling in production (Section 6, item 13) |

---

## 27. Acceptance Checklist
The work is complete only when every item that applies to the delivered phases is true. The implementer must verify each one and record the result in `LAUNCH_CHECKLIST.md`.

**Design**
- [ ] No gradients anywhere (search CSS for `gradient`).
- [ ] No purple or violet colors anywhere.
- [ ] No pill-shaped controls (no `border-radius` above 14px, none of `9999px` or `50%` on buttons).
- [ ] No emoji in any file, including locale files (search the repository).
- [ ] No em dashes in any file, including locale files (search for the character).
- [ ] No cursor effects, no scroll animations, transitions at most 150ms, reduced motion respected.
- [ ] Neumorphic raised and inset styles applied per 5.3, tables flat and readable, printed documents flat.
- [ ] All text and control contrast meets 5.4, verified with a checker.
- [ ] Visible focus on every focusable element.
- [ ] Only Lucide icons are used.
- [ ] Fonts and libraries self-hosted, no third-party requests at runtime (check the network panel).
- [ ] The developer module uses the same design system as the vendor application.

**Content**
- [ ] No fake reviews, counters, or metrics. Every displayed number traces to the database.
- [ ] No marketing slogans, banned words, or unverifiable claims (4.1) in any language.
- [ ] No "Made with AI" or similar text in any served file, print template, or header (Section 6, item 2).
- [ ] No platform branding on bills, invoices, or receipts.
- [ ] Consistent terminology in all three languages, matching the approved glossary.

**Launch gate**
- [ ] Favicon set present and linked on every page, including developer pages.
- [ ] Privacy Policy live and linked, and it covers customer data, UPI ID, offline data, WhatsApp links, and what developers can and cannot see (6.1).
- [ ] Terms and Conditions live and linked.
- [ ] No remaining bracketed placeholders in legal pages.
- [ ] Unique page titles and meta descriptions. Developer pages are `noindex`.
- [ ] No default credentials.
- [ ] Hindi and Marathi reviewed by native speakers.
- [ ] UPI QR scanned successfully with three real UPI apps.
- [ ] Bills verified at 58 mm, 80 mm, and A4 in all three languages.
- [ ] Installed app and offline billing verified on a real Android phone.
- [ ] GST features reviewed by an accountant (reviewer and date recorded), or `FEATURE_GST` remains `false`.
- [ ] Customer consent text and credit data handling reviewed.

**Multi-store and roles**
- [ ] Only one vendor role exists. No Admin or Staff roles, no Users page, no role column.
- [ ] Each store has exactly one vendor login (database constraint).
- [ ] Vendor and developer realms use separate tables, cookies, session stores, secrets, CSRF tokens, and rate limiters.
- [ ] No vendor page links to or mentions the developer login.
- [ ] Every tenant table has `store_id`, composite foreign keys, and per-store uniqueness.
- [ ] No vendor route accepts `store_id` from the client.
- [ ] The developer statistics service reads only the allowed sources (17.4), enforced by a passing static test.
- [ ] Developers cannot see product, price, stock, customer, credit, GST, UPI, or individual bill data through any endpoint.
- [ ] Developers cannot sign in as a vendor, and there is no impersonation feature.
- [ ] Developer accounts can only be created from the command line.

**Developer module**
- [ ] Create, edit, suspend, reactivate, and password reset work as in 17.1, with one-time temporary passwords.
- [ ] Per store: product count, total billed, and weekly, monthly, and yearly sales counts are correct and match prepared test data.
- [ ] Voided bills are excluded from totals and counts.
- [ ] Every developer action is in the audit log.

**Billing, credit, stock**
- [ ] All quantities and money use integers. No floating point in any calculation.
- [ ] Whole-unit products reject fractions. Measured products accept up to 3 decimals.
- [ ] Bills are idempotent by `clientSaleId`. Bill numbers are consecutive per store and financial year.
- [ ] Credit balances always equal the sum of ledger entries. Ledger and movement tables are append-only.
- [ ] Voiding restores stock and credit through new rows and never deletes anything.
- [ ] Expiry estimates follow 12.8 and state their assumption on screen.
- [ ] Reorder lists and WhatsApp links work, and the app sends nothing itself.

**Offline**
- [ ] Offline bills are never lost, never duplicated, and every rejected bill is visible and downloadable.
- [ ] Sign-out is blocked while bills are unsynced and local data is cleared after sign-out.
- [ ] No sensitive API response is cached by the service worker.

**Corrections (C1 to C13)**
- [ ] Each of C1 to C13 in Section 3 is fixed and covered by a test or a manual check.

**Function and quality**
- [ ] All automated tests in Section 24 pass.
- [ ] `npm audit` shows no high or critical issues.
- [ ] README documents setup, environment variables, creating the first developer, the offline design and iOS limits, backups, the migration, GST feature flag usage, and decisions made where this PRD was ambiguous.

---

## 28. Backups
SQLite file at `database/database.sqlite`. Provide an `npm run backup` script that uses the SQLite online backup API (not a raw file copy of a live database) and writes `backup/database_YYYY_MM_DD_HHMM.sqlite`. Document how to schedule it. Backups contain all stores' data, including customer details, so they are stored outside the web root, excluded from source control, and have restricted file permissions. Per-store export and restore are out of scope for v1. Unsynced offline bills exist only on the vendor's device until synced, which the vendor guide in the README explains.

---

## 29. Deployment
```bash
npm install
cp .env.example .env     # set VENDOR_SESSION_SECRET and DEVELOPER_SESSION_SECRET to different long random values
npm run migrate
npm run create-developer -- --name "Your Name" --username "your.username"
npm start
```
Production runs behind HTTPS (required for the installable app and offline support). `NODE_ENV=production` enables secure cookies and HSTS. `.env.example` lists every variable with a placeholder value and a one-line description. `FEATURE_GST` is `false` by default.

---

## 30. Open Decisions (recorded defaults)
- **One vendor login per store** in v1. Extra logins are a future migration.
- **Developer access** is limited to the statistics in 17.2. Per-period revenue and any product, customer, or credit insight are not provided.
- **Developers are equal.** Two-factor sign-in for developers is recommended for a later version.
- **Single database** with `store_id` isolation was chosen over one database file per store, for simpler backups, migrations, and aggregate statistics.
- **Currency:** INR for all stores in v1.
- **Time zone:** stored in UTC, displayed and bucketed in the store's time zone (default Asia/Kolkata). Weeks start on Monday. Financial year runs from April to March.
- **Quantities** are stored in thousandths, with kg and litre as the only measured units. Grams and millilitres are entered as decimals of kg and litre.
- **No discounts or price overrides** in v1. They interact with tax and audit rules and are deferred. A bill-level discount with proportional tax allocation is the likely next step.
- **Prices are tax-inclusive** when GST is on.
- **Credit bills' upfront payment** has no recorded mode. Reports show it as "paid at billing".
- **Negative customer balance** is allowed only as "Advance" produced by voiding a bill that was paid for. No refund workflow in v1.
- **Offline billing** is limited to non-GST stores, because tax documents need server-assigned consecutive numbers. A future option is reserving number blocks per device.
- **Offline bills keep their offline reference** as their number and do not receive sequential numbers.
- **Expiry remaining quantities are estimated** (oldest expiry sold first) instead of allocated per sale, to keep stock rules simple and robust.
- **Sale cost price is snapshotted** on each bill line for a future profit report. No profit report is included in v1.
- **Translations:** native speaker review is a release blocker. Legal pages, the developer module, and GST invoice words remain English.
- **GST module** stays behind `FEATURE_GST` until reviewed by an accountant. The rate list lives in `config/gstRates.json`.
- **Legal text** is drafted by the implementer from actual app behavior, reviewed by the owner and qualified professionals before launch.

---

## 31. Change Log

| Version | Date | Summary |
|---|---|---|
| 1.0 | n/a | Original draft |
| 2.0 | 26 Sep 2026 | Stock ledger, activity log, soft delete, DB-backed settings, security hardening |
| 3.0 | 18 Oct 2026 | Neumorphic professional design system, prohibited-pattern rules, launch gate, void instead of delete, integer money, corrections C1 to C10, acceptance checklist |
| 4.0 | 18 Oct 2026 | Multi-store architecture with strict isolation, separate developer module and login, single vendor role, one vendor login per store, per-store settings, migration plan |
| 5.0 | 18 Oct 2026 | Counter billing with receipts and UPI QR, udhaar credit ledger with reminders, decimal quantities, expiry tracking and reorder lists, offline installable app, Hindi and Marathi, optional GST layer behind a feature flag, delivery phases, expanded tests, launch gate and checklist |
