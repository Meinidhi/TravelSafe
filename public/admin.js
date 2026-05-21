/**
 * Admin Panel Module
 */
class AdminModule {
    constructor() {
        this.btn = document.getElementById('dev-admin-btn');
        this.modal = document.getElementById('admin-modal');
        this.closeBtn = document.getElementById('close-admin');
        this.content = document.getElementById('admin-content');
        
        if (this.btn) {
            this.btn.classList.add('hidden');
            
            this.btn.addEventListener('click', async () => {
                const user = window.Auth ? window.Auth.getCurrentUser() : null;
                if (!user || user.role !== 'admin') {
                    alert("Access Denied: You do not possess administrator rights to open this dashboard.");
                    return;
                }
                
                this.modal.classList.remove('hidden');
                this.content.innerHTML = `
                    <div style="text-align: center; padding: 30px;">
                        <div class="spinner"></div>
                        <p style="margin-top: 15px; color: var(--text-secondary);">Loading system data...</p>
                    </div>
                `;
                await this.render();
            });
            
            this.closeBtn.addEventListener('click', () => {
                this.modal.classList.add('hidden');
            });
        }
    }

    async render() {
        let users = [];
        let incidents = [];
        
        try {
            const usersSnapshot = await window.db.collection('users').limit(50).get();
            usersSnapshot.forEach(doc => {
                users.push({ id: doc.id, ...doc.data() });
            });
        } catch (e) {
            console.error("Error loading users:", e);
        }
        
        try {
            const incidentsSnapshot = await window.db.collection('incidents')
                .orderBy('timestamp', 'desc')
                .limit(50)
                .get();
            incidentsSnapshot.forEach(doc => {
                incidents.push({ id: doc.id, ...doc.data() });
            });
        } catch (e) {
            console.error("Error loading incidents:", e);
        }
        
        let usersHtml = '<table style="width:100%; text-align:left; border-collapse: collapse; font-size: 0.9rem;"><tr><th style="padding-bottom:5px">Name</th><th style="padding-bottom:5px">Status</th></tr>';
        if (users.length === 0) {
            usersHtml += '<tr><td colspan="2" style="padding: 10px 0; color: var(--text-secondary); text-align: center;">No users registered yet.</td></tr>';
        } else {
            users.forEach(u => {
                const name = u.name || `User (${u.id ? u.id.substring(0, 6) : 'Unknown'})`;
                const escapedName = window.escapeHtml(name);
                const sosStatus = u.isSOSActive ? '<span class="text-danger" style="font-weight: bold; animation: pulse 1.5s infinite;"><i class="fas fa-exclamation-triangle"></i> SOS</span>' : '<span class="text-safe">Monitored</span>';
                usersHtml += `<tr>
                    <td style="padding: 8px 0; border-bottom: 1px solid var(--bg-tertiary);">${escapedName}</td>
                    <td style="padding: 8px 0; border-bottom: 1px solid var(--bg-tertiary);">${sosStatus}</td>
                </tr>`;
            });
        }
        usersHtml += '</table>';

        let incidentsHtml = '';
        if (incidents.length === 0) {
            incidentsHtml = '<p class="text-secondary" style="font-size: 0.9rem;">No emergencies reported.</p>';
        } else {
            // Sort by timestamp desc to make sure latest is first
            const sortedIncidents = incidents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            sortedIncidents.forEach(i => {
                const userName = i.name || 'Unknown User';
                const escapedUserName = window.escapeHtml(userName);
                const timestampText = i.timestamp ? new Date(i.timestamp).toLocaleString() : 'Unknown Time';
                const latText = i.location && typeof i.location.latitude === 'number' ? i.location.latitude.toFixed(4) : (typeof i.lat === 'number' ? i.lat.toFixed(4) : 'Unknown');
                const lngText = i.location && typeof i.location.longitude === 'number' ? i.location.longitude.toFixed(4) : (typeof i.lng === 'number' ? i.lng.toFixed(4) : 'Unknown');
                
                incidentsHtml += `
                    <div style="background: rgba(255,76,76,0.1); border-left: 4px solid var(--danger-color); padding: 10px; margin-bottom: 10px; font-size: 0.85rem;">
                        <strong class="text-danger">SOS ALERT</strong> - ${timestampText}<br>
                        User: ${escapedUserName}<br>
                        Loc: ${latText}, ${lngText}
                    </div>
                `;
            });
        }

        this.content.innerHTML = `
            <div style="margin-top: 15px;">
                <h3 style="font-size: 1rem; border-bottom: 1px solid var(--bg-tertiary); padding-bottom: 5px;">System Users (${users.length})</h3>
                <div style="max-height: 150px; overflow-y: auto; margin-bottom: 20px;">
                    ${usersHtml}
                </div>

                <h3 class="text-danger" style="font-size: 1rem; border-bottom: 1px solid var(--danger-color); padding-bottom: 5px;">Emergency Alerts <span style="background:var(--danger-color); color:white; padding: 2px 6px; border-radius: 10px; font-size: 0.7rem;">${incidents.length}</span></h3>
                <div style="max-height: 200px; overflow-y: auto;">
                    ${incidentsHtml}
                </div>
            </div>
            
            <div style="margin-top: 20px; text-align: center;">
                <button class="btn btn-secondary" onclick="document.getElementById('admin-modal').classList.add('hidden'); if(window.app){ window.app.navigate('map'); }">Close & View Map</button>
            </div>
        `;
    }
}

// Add admin modal CSS dynamically because CSS injection is cleaner for ad-hoc scoped features.
const adminStyle = document.createElement('style');
adminStyle.innerHTML = `
.dev-admin-btn {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 3000;
    background: var(--text-primary);
    color: var(--bg-primary);
    border: none;
    border-radius: 50%;
    width: 44px;
    height: 44px;
    box-shadow: 0 4px 10px rgba(0,0,0,0.5);
    cursor: pointer;
    font-size: 1.2rem;
    transition: transform var(--transition-fast);
}
.dev-admin-btn:hover {
    transform: scale(1.1);
}
.modal {
    position: fixed;
    top: 0; left: 0;
    width: 100vw; height: 100vh;
    background: rgba(10, 25, 47, 0.9);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 4000;
    backdrop-filter: blur(5px);
}
.modal-content {
    background: var(--bg-secondary);
    padding: 20px;
    border-radius: var(--border-radius-lg);
    width: 90%;
    max-width: 450px;
    max-height: 90vh;
    overflow-y: auto;
    position: relative;
    box-shadow: var(--card-shadow);
    border: 1px solid var(--bg-tertiary);
}
.close-btn {
    position: absolute;
    top: 15px;
    right: 20px;
    font-size: 1.5rem;
    cursor: pointer;
    color: var(--text-secondary);
}
.close-btn:hover {
    color: var(--text-primary);
}
`;
document.head.appendChild(adminStyle);

window.AdminController = new AdminModule();
