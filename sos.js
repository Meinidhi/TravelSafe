/**
 * SOS Module
 */
class SOSModule {
    constructor() {
        this.viewElement = document.getElementById('view-sos');
        this.navButton = document.querySelector('.sos-nav-btn');
        this.isConfirming = false;
        
        if (this.navButton) {
            this.navButton.addEventListener('click', (e) => {
                e.preventDefault();
                window.app.navigate('sos');
                this.render();
            });
        }
    }

    render() {
        this.viewElement.innerHTML = `
            <div class="card text-center" style="margin-top: 20px;">
                <h2 class="text-danger">EMERGENCY SOS</h2>
                <p>Press the button below to alert authorities, emergency contacts, and your group.</p>
                
                <div class="sos-trigger-container" style="margin: 60px 0; display: flex; justify-content: center;">
                    <button id="btn-trigger-sos" style="
                        width: 200px; height: 200px; 
                        border-radius: 50%; 
                        background-color: var(--danger-color);
                        color: white;
                        border: 10px solid var(--bg-tertiary);
                        font-size: 3rem;
                        font-weight: bold;
                        cursor: pointer;
                        box-shadow: var(--neon-shadow-danger);
                        animation: pulse 2s infinite;
                        outline: none;
                        -webkit-tap-highlight-color: transparent;
                    ">SOS</button>
                </div>
                <p class="text-secondary" style="font-size: 0.8rem;">Requires confirmation to prevent accidental pressing.</p>
            </div>
            
            <!-- Confirmation Overlay -->
            <div id="sos-confirm-overlay" class="hidden" style="
                position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                background: rgba(10, 25, 47, 0.95); z-index: 2000;
                display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 20px;
            ">
                <div class="card text-center" style="width: 100%; max-width: 400px; border: 2px solid var(--danger-color); box-shadow: var(--neon-shadow-danger);">
                    <h2 class="text-danger" style="font-size: 2rem; margin-bottom: 20px;">CONFIRM SOS</h2>
                    <p>This will send your location to emergency services and your group immediately.</p>
                    <div style="display: flex; flex-direction: column; gap: 15px; margin-top: 30px;">
                        <button id="btn-confirm-sos" class="btn btn-danger" style="font-size: 1.2rem; padding: 15px;">YES, SEND SOS</button>
                        <button id="btn-cancel-sos" class="btn btn-secondary" style="font-size: 1rem;">Cancel</button>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('btn-trigger-sos').addEventListener('click', () => {
            document.getElementById('sos-confirm-overlay').classList.remove('hidden');
        });
        
        document.getElementById('btn-cancel-sos').addEventListener('click', () => {
            document.getElementById('sos-confirm-overlay').classList.add('hidden');
        });
        
        document.getElementById('btn-confirm-sos').addEventListener('click', () => {
            this.executeSOS();
        });
    }

    executeSOS() {
        document.getElementById('sos-confirm-overlay').classList.add('hidden');
        
        const loc = window.MapController ? window.MapController.getCurrentLocation() : null;
        if (!loc) {
            window.app.showTopBanner('Failed to get location. Gathering data...', 'danger');
            // Try again implicitly or rely on backend to process IP block 
            // Mock retry
            setTimeout(() => this.executeSOS(), 2000);
            return;
        }

        const user = window.Auth.getCurrentUser();
        const isOffline = !navigator.onLine;

        const incidentData = {
            userId: user ? user.id : 'unknown',
            name: user ? user.name : 'Unknown User',
            location: loc,
            type: 'SOS'
        };

        try {
            const [savedIncident, queued] = window.DB.saveIncident(incidentData, isOffline);
            
            if (queued) {
                window.app.showTopBanner('Offline: SOS saved. Will broadcast upon connection!', 'warning', 10000);
            } else {
                window.app.showTopBanner('SOS Sent Successfully to emergency contacts & group!', 'danger', 10000);
            }
            
            // Re-render to show active state
            this.viewElement.innerHTML = `
                <div class="card text-center" style="margin-top: 20px; border: 2px solid var(--danger-color); box-shadow: var(--neon-shadow-danger);">
                    <h2 class="text-danger"><i class="fas fa-broadcast-tower"></i> SOS ACTIVE</h2>
                    <p>Alert broadcasted. Stay calm, help is on the way.</p>
                    <div style="margin: 20px 0; padding: 15px; background: rgba(255,0,0,0.1); border-radius: 8px;">
                        <p style="font-size: 0.9rem; margin:0;" class="text-danger">Lat: ${loc.latitude.toFixed(5)}</p>
                        <p style="font-size: 0.9rem; margin:0;" class="text-danger">Lng: ${loc.longitude.toFixed(5)}</p>
                    </div>
                    <button class="btn btn-secondary" onclick="window.app.navigate('dashboard')" style="margin-top: 20px;">Return to Dashboard</button>
                    <button class="btn" style="background: transparent; color: var(--text-secondary); margin-top: 10px; font-size: 0.8rem;">Cancel SOS Operation</button>
                </div>
            `;
            
            if (window.GroupController) {
                window.GroupController.notifySOSActive();
            }
            
            if (window.DashboardController) {
                window.DashboardController.setSafetyStatus('DANGER', 'EMERGENCY SOS ACTIVE');
            }

        } catch (e) {
            window.app.showTopBanner('System Error Dispatching SOS.', 'danger');
        }
    }
}

// Global Animation
const style = document.createElement('style');
style.innerHTML = `
@keyframes pulse {
    0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255, 76, 76, 0.7); }
    70% { transform: scale(1.05); box-shadow: 0 0 0 20px rgba(255, 76, 76, 0); }
    100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255, 76, 76, 0); }
}`;
document.head.appendChild(style);

window.SOSController = new SOSModule();
