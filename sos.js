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
        const user = window.Auth.getCurrentUser();
        if (user && user.isSOSActive) {
            const loc = window.MapController ? window.MapController.getCurrentLocation() : null;
            this.renderActiveSOS(user, loc);
            return;
        }

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

    renderActiveSOS(user, loc) {
        const latText = loc ? `Lat: ${loc.latitude.toFixed(5)}` : 'Location acquired';
        const lngText = loc ? `Lng: ${loc.longitude.toFixed(5)}` : 'Broadcasting live coordinates...';

        this.viewElement.innerHTML = `
            <div class="card text-center" style="margin-top: 20px; border: 2px solid var(--danger-color); box-shadow: var(--neon-shadow-danger);">
                <h2 class="text-danger"><i class="fas fa-broadcast-tower"></i> SOS ACTIVE</h2>
                <p>Alert broadcasted. Stay calm, help is on the way.</p>
                <div style="margin: 20px 0; padding: 15px; background: rgba(255,0,0,0.1); border-radius: 8px;">
                    <p style="font-size: 0.9rem; margin:0;" class="text-danger">${latText}</p>
                    <p style="font-size: 0.9rem; margin:0;" class="text-danger">${lngText}</p>
                </div>
                <button class="btn btn-secondary" onclick="window.app.navigate('dashboard')" style="margin-top: 20px;">Return to Dashboard</button>
                <button id="btn-cancel-active-sos" class="btn" style="background: transparent; color: var(--text-secondary); margin-top: 10px; font-size: 0.8rem;">Cancel SOS Operation</button>
            </div>
        `;

        document.getElementById('btn-cancel-active-sos').addEventListener('click', async () => {
            if (user) {
                user.isSOSActive = false;
                await window.DB.setSOSStatus(user.id, false);
            }
            if (window.MapController) {
                window.MapController.setSelfSOS(false);
            }
            window.app.showTopBanner('SOS Operation Cancelled', 'safe', 5000);
            this.render(); // Restore default view
            if (window.DashboardController) {
                window.DashboardController.setSafetyStatus('SAFE');
            }
        });
    }

    async executeSOS() {
        document.getElementById('sos-confirm-overlay').classList.add('hidden');
        
        let loc = window.MapController ? window.MapController.getCurrentLocation() : null;
        if (!loc) {
            if (!this.sosRetryCount) this.sosRetryCount = 0;
            this.sosRetryCount++;
            
            if (this.sosRetryCount < 3) {
                window.app.showTopBanner('Acquiring location signals. Retrying...', 'warning', 2000);
                setTimeout(() => this.executeSOS(), 2000);
                return;
            }
            
            // Fallback location - check local storage first, then rawCoords, then prompt manual pinpoint
            let lastLat = 0;
            let lastLng = 0;
            let accuracy = 99999;
            
            const cachedCoordsStr = localStorage.getItem('last_known_coords');
            if (cachedCoordsStr) {
                try {
                    const cached = JSON.parse(cachedCoordsStr);
                    if (cached && cached.latitude && cached.longitude) {
                        lastLat = cached.latitude;
                        lastLng = cached.longitude;
                        accuracy = cached.accuracy || 500;
                    }
                } catch(e) {
                    console.error("Error parsing cached coordinates:", e);
                }
            }
            
            if (lastLat === 0 && lastLng === 0 && window.MapController && window.MapController.rawCoords) {
                lastLat = window.MapController.rawCoords.latitude;
                lastLng = window.MapController.rawCoords.longitude;
                accuracy = window.MapController.rawCoords.accuracy || 99999;
            }
            
            if (lastLat === 0 && lastLng === 0) {
                this.sosRetryCount = 0;
                window.app.showTopBanner('GPS signal lost. Please enable location services or select your coordinates manually.', 'danger', 8000);
                const pinpoint = confirm("GPS signal not detected. Would you like to switch to the map to manually select your coordinates?");
                if (pinpoint) {
                    window.app.navigate('map');
                }
                return;
            }
            
            loc = {
                latitude: lastLat,
                longitude: lastLng,
                accuracy: accuracy,
                isFallback: true
            };
            this.sosRetryCount = 0;
            window.app.showTopBanner('SOS broadcasted using last known location (signals weak)', 'danger', 8000);
        } else {
            this.sosRetryCount = 0;
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
            const [savedIncident, queued] = await window.DB.saveIncident(incidentData, isOffline);
            
            if (queued) {
                window.app.showTopBanner('Offline: SOS saved. Will broadcast upon connection!', 'warning', 10000);
            } else {
                window.app.showTopBanner('SOS Sent Successfully to emergency contacts & group!', 'danger', 10000);
            }



            // Broadcast SOS status to group members via Firebase
            if (user) {
                user.isSOSActive = true;
                await window.DB.setSOSStatus(user.id, true);
            }
            
            if (window.MapController) {
                window.MapController.setSelfSOS(true);
            }
            
            // Re-render to show active state
            this.renderActiveSOS(user, loc);
            
            if (window.GroupController) {
                window.GroupController.notifySOSActive();
            }
            
            if (window.DashboardController) {
                window.DashboardController.setSafetyStatus('DANGER', 'EMERGENCY SOS ACTIVE');
            }

        } catch (e) {
            console.error(e);
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
