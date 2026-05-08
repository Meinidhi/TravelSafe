/**
 * Dashboard Module
 */
class Dashboard {
    constructor() {
        this.viewElement = document.getElementById('view-dashboard');
        this.safetyStatus = 'SAFE'; // SAFE, WARNING, DANGER
        this.lastCoordinates = null;
    }

    render() {
        const user = window.Auth.getCurrentUser();
        if (!user) return; // safety check

        const statusColor = this.getStatusColor();
        const statusIcon = this.getStatusIcon();
        
        const coordsText = this.lastCoordinates 
            ? `${this.lastCoordinates.latitude.toFixed(5)}, ${this.lastCoordinates.longitude.toFixed(5)}`
            : 'Fetching...';

        this.viewElement.innerHTML = `
            <h2>Welcome, <span class="text-accent">${user.name.split(' ')[0]}</span>!</h2>
            <p>Your current safety status is monitored.</p>
            
            <div class="card" style="border-top: 4px solid ${statusColor}">
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <div>
                        <h3 style="color: ${statusColor};">${this.safetyStatus} ZONE</h3>
                        <p style="margin-bottom: 0; font-size: 0.9rem;">Current GPS: <span id="dash-coords">${coordsText}</span></p>
                    </div>
                    <div style="font-size: 2.5rem; color: ${statusColor};">
                        <i class="${statusIcon}"></i>
                    </div>
                </div>
            </div>
            
            <h3>Recent Alerts</h3>
            <div class="card" id="alert-list">
                <!-- Alerts will be injected here -->
                <p class="text-center" style="margin: 20px 0;"><i class="fas fa-check-circle" style="color: var(--safe-color);"></i> No active alerts nearby.</p>
            </div>
            
            <button class="btn btn-primary" onclick="if(window.app) window.app.navigate('map')">
                <i class="fas fa-map"></i> View Real-Time Map
            </button>
        `;
    }

    getStatusColor() {
        switch(this.safetyStatus) {
            case 'SAFE': return 'var(--safe-color)';
            case 'WARNING': return 'var(--warning-color)';
            case 'DANGER': return 'var(--danger-color)';
            default: return 'var(--text-secondary)';
        }
    }
    
    getStatusIcon() {
        switch(this.safetyStatus) {
            case 'SAFE': return 'fas fa-shield-alt';
            case 'WARNING': return 'fas fa-exclamation-triangle';
            case 'DANGER': return 'fas fa-skull-crossbones';
            default: return 'fas fa-info-circle';
        }
    }

    updateCoordinates(lat, lng) {
        this.lastCoordinates = { latitude: lat, longitude: lng };
        const coordsEl = document.getElementById('dash-coords');
        if (coordsEl) {
            coordsEl.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        }
    }
    
    setSafetyStatus(status, message = null) {
        if (this.safetyStatus !== status) {
            this.safetyStatus = status;
            // Re-render if dashboard is currently active
            if (window.app && window.app.currentView === 'dashboard') {
                this.render();
            }
            
            if (message && window.app) {
                window.app.showTopBanner(message, status === 'DANGER' ? 'danger' : 'warning');
            }
        }
    }
}

window.DashboardController = new Dashboard();
