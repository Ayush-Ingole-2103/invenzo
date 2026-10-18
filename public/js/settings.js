// ============================================
// Store Profile & Settings Page — PRD Section 12.12
// ============================================

const Settings = {
    async load() {
        const resp = await App.api('/api/settings');
        if (!resp || !resp.success) {
            App.setContent(`
                <div class="empty-state">
                    <h3>Failed to load settings</h3>
                    <p class="text-muted">${resp?.error?.message || 'Please try again.'}</p>
                </div>
            `);
            return;
        }

        const store = resp.data.store || {};
        const s = resp.data.settings || {};

        App.setContent(`
            <div style="max-width:800px;margin:0 auto;display:flex;flex-direction:column;gap:1.5rem;">
                <!-- Store Profile Card -->
                <div class="card" style="padding:1.5rem;">
                    <div class="card-header" style="margin-bottom:1.25rem;">
                        <h3 style="margin:0;">Store Profile</h3>
                        <div class="text-xs text-muted">Store Code: <code>${store.storeCode}</code></div>
                    </div>
                    <form id="storeProfileForm">
                        <div class="grid-2">
                            <div class="form-group">
                                <label>Store Name <span class="required">*</span></label>
                                <input type="text" name="name" required value="${store.name || ''}" class="form-control">
                            </div>
                            <div class="form-group">
                                <label>Owner / Contact Person</label>
                                <input type="text" name="ownerName" value="${store.ownerName || ''}" class="form-control">
                            </div>
                        </div>

                        <div class="grid-2">
                            <div class="form-group">
                                <label>Store Mobile Phone</label>
                                <input type="tel" name="phone" value="${store.phone || ''}" placeholder="10-digit mobile" class="form-control">
                            </div>
                            <div class="form-group">
                                <label>Store Email</label>
                                <input type="email" name="email" value="${store.email || ''}" class="form-control">
                            </div>
                        </div>

                        <div class="grid-2">
                            <div class="form-group">
                                <label>Address</label>
                                <input type="text" name="address" value="${store.address || ''}" placeholder="e.g. Shop 4, Main Bazaar" class="form-control">
                            </div>
                            <div class="form-group">
                                <label>City</label>
                                <input type="text" name="city" value="${store.city || ''}" placeholder="e.g. Pune" class="form-control">
                            </div>
                        </div>

                        <button type="submit" class="btn btn-primary" style="margin-top:0.5rem;">Update Store Profile</button>
                    </form>
                </div>

                <!-- Billing & Receipts Configuration -->
                <div class="card" style="padding:1.5rem;">
                    <div class="card-header" style="margin-bottom:1.25rem;">
                        <h3 style="margin:0;">Billing & Receipts</h3>
                        <div class="text-xs text-muted">UPI QR code and print layout options</div>
                    </div>
                    <form id="billingSettingsForm">
                        <div class="grid-2">
                            <div class="form-group">
                                <label>Store UPI ID (VPA) for Counter QR</label>
                                <input type="text" name="upiId" value="${s.upiId || ''}" placeholder="e.g. ayush@okhdfcbank" class="form-control">
                                <span class="help-text">Dynamic UPI QR codes will be generated on counter checkout.</span>
                            </div>
                            <div class="form-group">
                                <label>Bill Number Prefix</label>
                                <input type="text" name="billPrefix" value="${s.billPrefix || 'B'}" maxlength="6" class="form-control">
                                <span class="help-text">Prefix for consecutive bills (e.g. B-2026-27-0001).</span>
                            </div>
                        </div>

                        <div class="grid-2">
                            <div class="form-group">
                                <label>Thermal Receipt Width</label>
                                <select name="receiptWidth" class="form-control">
                                    <option value="80mm" ${s.receiptWidth === '80mm' ? 'selected' : ''}>80mm (Standard POS Thermal)</option>
                                    <option value="58mm" ${s.receiptWidth === '58mm' ? 'selected' : ''}>58mm (Compact Mobile POS)</option>
                                    <option value="a4" ${s.receiptWidth === 'a4' ? 'selected' : ''}>A4 (Full Page Invoice)</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Receipt Footer Message</label>
                                <input type="text" name="receiptFooter" value="${s.receiptFooter || 'Thank you for your visit!'}" class="form-control">
                            </div>
                        </div>

                        <div class="grid-2">
                            <div class="form-group">
                                <label>Store GSTIN (Printed on Bills)</label>
                                <input type="text" name="gstin" value="${s.gstin || ''}" placeholder="e.g. 27AAPCS1234F1Z5" maxlength="15" class="form-control">
                                <span class="help-text">GST identification number printed on bills & tax invoices.</span>
                            </div>
                            <div class="form-group">
                                <label>Default GST Rate</label>
                                <select name="defaultGstRateBps" class="form-control">
                                    <option value="500" ${s.defaultGstRateBps == '500' || !s.defaultGstRateBps ? 'selected' : ''}>5% (Essential Goods)</option>
                                    <option value="1200" ${s.defaultGstRateBps == '1200' ? 'selected' : ''}>12% (Standard Low)</option>
                                    <option value="1800" ${s.defaultGstRateBps == '1800' ? 'selected' : ''}>18% (Standard High)</option>
                                    <option value="2800" ${s.defaultGstRateBps == '2800' ? 'selected' : ''}>28% (Luxury)</option>
                                    <option value="0" ${s.defaultGstRateBps == '0' ? 'selected' : ''}>0% (Exempt)</option>
                                </select>
                                <span class="help-text">Standard GST rate applied to products.</span>
                            </div>
                        </div>

                        <button type="submit" class="btn btn-primary" style="margin-top:0.5rem;">Save Billing Settings</button>
                    </form>
                </div>

                <!-- Store Preferences -->
                <div class="card" style="padding:1.5rem;">
                    <div class="card-header" style="margin-bottom:1.25rem;">
                        <h3 style="margin:0;">Inventory & Alerts</h3>
                    </div>
                    <form id="prefSettingsForm">
                        <div class="grid-3" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.75rem;">
                            <div class="form-group">
                                <label>Default Min Stock</label>
                                <input type="number" name="defaultMinimumStock" value="${s.defaultMinimumStock || '10'}" min="0" class="form-control">
                            </div>
                            <div class="form-group">
                                <label>Expiry Alert Days</label>
                                <input type="number" name="expiryAlertDays" value="${s.expiryAlertDays || '30'}" min="1" max="180" class="form-control">
                            </div>
                            <div class="form-group">
                                <label>Session Timeout (mins)</label>
                                <input type="number" name="sessionTimeoutMinutes" value="${s.sessionTimeoutMinutes || '30'}" min="5" max="480" class="form-control">
                            </div>
                        </div>

                        <button type="submit" class="btn btn-primary" style="margin-top:0.5rem;">Save Preferences</button>
                    </form>
                </div>

                <!-- Security / Change Password -->
                <div class="card" style="padding:1.5rem;">
                    <div class="card-header" style="margin-bottom:1.25rem;">
                        <h3 style="margin:0;">Change Password</h3>
                        <div class="text-xs text-muted">Update your account sign-in password</div>
                    </div>
                    <form id="changePasswordForm">
                        <div class="grid-3" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.75rem;">
                            <div class="form-group">
                                <label>Current Password <span class="required">*</span></label>
                                <input type="password" name="currentPassword" required class="form-control">
                            </div>
                            <div class="form-group">
                                <label>New Password <span class="required">*</span></label>
                                <input type="password" name="newPassword" required minlength="8" class="form-control">
                            </div>
                            <div class="form-group">
                                <label>Confirm New <span class="required">*</span></label>
                                <input type="password" name="confirmPassword" required minlength="8" class="form-control">
                            </div>
                        </div>

                        <button type="submit" class="btn btn-warning" style="margin-top:0.5rem;">Change Password</button>
                    </form>
                </div>
            </div>
        `);

        // Store Profile submit
        document.getElementById('storeProfileForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const body = {
                store: {
                    name: fd.get('name'),
                    ownerName: fd.get('ownerName'),
                    phone: fd.get('phone'),
                    email: fd.get('email'),
                    address: fd.get('address'),
                    city: fd.get('city')
                }
            };

            const resp = await App.api('/api/settings', { method: 'PUT', body });
            if (resp && resp.success) {
                App.toast('Store profile updated.');
                const storeBadge = document.getElementById('storeNameDisplay');
                if (storeBadge) storeBadge.textContent = body.store.name;
            } else {
                App.toast(resp?.error?.message || 'Failed to update store profile.', 'error');
            }
        });

        // Billing Settings submit
        document.getElementById('billingSettingsForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const body = {
                settings: {
                    upiId: fd.get('upiId'),
                    billPrefix: fd.get('billPrefix'),
                    receiptWidth: fd.get('receiptWidth'),
                    receiptFooter: fd.get('receiptFooter'),
                    gstin: fd.get('gstin'),
                    defaultGstRateBps: fd.get('defaultGstRateBps')
                }
            };

            const resp = await App.api('/api/settings', { method: 'PUT', body });
            if (resp && resp.success) {
                App.toast('Billing & GST settings saved.');
                App.settings.upiId = body.settings.upiId;
                App.settings.gstin = body.settings.gstin;
                App.settings.receiptWidth = body.settings.receiptWidth;
            } else {
                App.toast(resp?.error?.message || 'Failed to save billing settings.', 'error');
            }
        });

        // Preferences submit
        document.getElementById('prefSettingsForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const body = {
                settings: {
                    defaultMinimumStock: fd.get('defaultMinimumStock'),
                    expiryAlertDays: fd.get('expiryAlertDays'),
                    sessionTimeoutMinutes: fd.get('sessionTimeoutMinutes')
                }
            };

            const resp = await App.api('/api/settings', { method: 'PUT', body });
            if (resp && resp.success) {
                App.toast('Preferences saved.');
            } else {
                App.toast(resp?.error?.message || 'Failed to save preferences.', 'error');
            }
        });

        // Change Password submit
        document.getElementById('changePasswordForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const currentPassword = fd.get('currentPassword');
            const newPassword = fd.get('newPassword');
            const confirmPassword = fd.get('confirmPassword');

            if (newPassword !== confirmPassword) {
                App.toast('New password and confirmation do not match.', 'error');
                return;
            }

            const resp = await App.api('/api/auth/change-password', {
                method: 'POST',
                body: { currentPassword, newPassword }
            });

            if (resp && resp.success) {
                App.toast('Password changed successfully.');
                e.target.reset();
            } else {
                App.toast(resp?.error?.message || 'Failed to change password.', 'error');
            }
        });
    }
};

window.Settings = Settings;
