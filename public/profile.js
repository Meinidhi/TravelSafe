/**
 * Profile Module
 */
class ProfileModule {
    constructor() {
        this.viewElement = document.getElementById('view-profile');
    }

    render() {
        const user = window.Auth.getCurrentUser();
        if (!user) return;

        const escapedName = window.escapeHtml(user.name);
        const escapedEmail = window.escapeHtml(user.email);
        const escapedPhone = window.escapeHtml(user.phone);
        const escapedNationality = window.escapeHtml(user.nationality || 'Not Set');
        const escapedEmergencyPhone = window.escapeHtml(user.emergencyPhone || 'Not Set');

        this.viewElement.innerHTML = `
            <h2>Profile Settings</h2>
            
            <div class="card">
                <form id="profile-form">
                    <div class="form-group">
                        <label>Full Name</label>
                        <input type="text" id="prof-name" value="${escapedName}" required>
                    </div>
                    <div class="form-group">
                        <label>Email (Read Only)</label>
                        <input type="email" value="${escapedEmail}" disabled style="opacity: 0.5;">
                    </div>
                    <div class="form-group">
                        <label>Phone Number</label>
                        <input type="tel" id="prof-phone" value="${escapedPhone}" required>
                    </div>
                    <div class="form-group">
                        <label>Nationality</label>
                        <input type="text" id="prof-nationality" value="${escapedNationality}" required>
                    </div>
                    <div class="form-group">
                        <label>Emergency Contact</label>
                        <input type="tel" id="prof-emergency" value="${escapedEmergencyPhone}" required>
                    </div>
                    
                    <button type="submit" class="btn btn-primary" style="margin-bottom: 20px;">Save Changes</button>
                    <div id="prof-msg" class="error-msg hidden" style="color: var(--safe-color); margin-bottom: 20px;">Profile Updated!</div>
                </form>
                
                <hr style="border: 0; border-top: 1px solid var(--bg-tertiary); margin-bottom: 20px;">
                
                <button id="btn-logout" class="btn btn-danger">Logout</button>
            </div>
            
            <div class="card text-center text-secondary" style="font-size: 0.8rem;">
                <p style="margin-bottom: 5px;">Cloud Status: <span class="${navigator.onLine ? 'text-safe' : 'text-warning'}">${navigator.onLine ? 'Online / Synced' : 'Offline Mode Active'}</span></p>
                <p>Version 2.0 (Smart Monitor Build)</p>
            </div>
        `;

        document.getElementById('profile-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveProfile();
        });

        document.getElementById('btn-logout').addEventListener('click', (e) => {
            e.preventDefault();
            window.Auth.logout();
        });
    }

    async saveProfile() {
        const user = window.Auth.getCurrentUser();
        const msg = document.getElementById('prof-msg');
        const submitBtn = this.viewElement.querySelector('button[type="submit"]');
        
        try {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Saving...';
            
            const updates = {
                name: document.getElementById('prof-name').value.trim(),
                phone: document.getElementById('prof-phone').value.trim(),
                nationality: document.getElementById('prof-nationality').value.trim(),
                emergencyPhone: document.getElementById('prof-emergency').value.trim()
            };

            await window.DB.updateUser(user.id, updates);
            
            msg.textContent = "Profile Updated Successfully!";
            msg.style.color = "var(--safe-color)";
            msg.classList.remove('hidden');
            
            // update in mem auth
            window.Auth.currentUser = { ...user, ...updates };
            
            setTimeout(() => msg.classList.add('hidden'), 3000);
        } catch(e) {
            msg.textContent = e.message || "Error updating profile.";
            msg.style.color = "var(--danger-color)";
            msg.classList.remove('hidden');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Save Changes';
        }
    }
}

window.ProfileController = new ProfileModule();
