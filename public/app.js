/**
 * Main Application Logic
 * Handles Routing, Offline Status, UI Updates
 */

class App {
    constructor() {
        this.currentView = 'auth';
        this.elements = {
            nav: document.getElementById('bottom-nav'),
            navItems: document.querySelectorAll('.nav-item'),
            views: document.querySelectorAll('.view'),
            offlineBanner: document.getElementById('offline-banner'),
            topBanner: document.getElementById('top-banner')
        };
        
        this.init();
    }

    async init() {
        this.setupNavigation();
        this.setupNetworkHandling();
        if (window.Auth && window.Auth.init) {
            await window.Auth.init();
        }
        this.checkAuthStatus();
        console.log("App Initialized");
    }

    setupNavigation() {
        this.elements.navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const target = item.getAttribute('data-target');
                if (target) {
                    this.navigate(target);
                }
            });
        });
        
        // Expose navigate globally
        window.navigate = this.navigate.bind(this);
    }

    setupNetworkHandling() {
        window.addEventListener('online', () => this.updateNetworkStatus(true));
        window.addEventListener('offline', () => this.updateNetworkStatus(false));
        this.updateNetworkStatus(navigator.onLine);
    }
    
    updateNetworkStatus(isOnline) {
        if (!isOnline) {
            this.elements.offlineBanner.classList.remove('hidden');
        } else {
            this.elements.offlineBanner.classList.add('hidden');
            // Try to sync offline data if any
            if (window.DB && DB.syncOfflineData) {
                DB.syncOfflineData();
            }
        }
    }

    checkAuthStatus() {
        // If DB script is loaded, check if logged in
        const adminBtn = document.getElementById('dev-admin-btn');
        if (window.Auth && Auth.getCurrentUser()) {
            this.elements.nav.classList.remove('hidden');
            this.navigate('dashboard');
            
            // Administrative role validation
            const user = Auth.getCurrentUser();
            if (adminBtn) {
                if (user && user.role === 'admin') {
                    adminBtn.classList.remove('hidden');
                } else {
                    adminBtn.classList.add('hidden');
                }
            }
        } else {
            this.elements.nav.classList.add('hidden');
            this.navigate('auth');
            if (window.Auth) window.Auth.render();
            if (adminBtn) adminBtn.classList.add('hidden');
        }
    }

    navigate(viewId) {
        // Cleanup chat listeners and typing states if navigating away from chat
        if (this.currentView === 'chat' && window.ChatController && window.ChatController.cleanup) {
            window.ChatController.cleanup();
        }

        // Hide all views
        this.elements.views.forEach(view => {
            view.classList.remove('active');
            view.classList.add('hidden');
        });
        
        // Show target view
        const targetView = document.getElementById(`view-${viewId}`);
        if (targetView) {
            targetView.classList.remove('hidden');
            // Slight delay for translation animation
            setTimeout(() => targetView.classList.add('active'), 50);
        }

        // Update Nav UI
        this.elements.navItems.forEach(item => {
            item.classList.remove('active');
            if (item.getAttribute('data-target') === viewId) {
                item.classList.add('active');
            }
        });
        
        this.currentView = viewId;
        
        // Call lifecycle methods if they exist globally
        switch(viewId) {
            case 'map':
                if (window.MapController && window.MapController.onMapShown) {
                    window.MapController.onMapShown();
                }
                break;
            case 'dashboard':
                if (window.DashboardController && window.DashboardController.render) {
                    window.DashboardController.render();
                }
                break;
            case 'profile':
                if (window.ProfileController && window.ProfileController.render) {
                    window.ProfileController.render();
                }
                break;
            case 'group':
                if (window.GroupController && window.GroupController.render) {
                    window.GroupController.render();
                }
                break;
            case 'chat':
                if (window.ChatController && window.ChatController.render) {
                    window.ChatController.render();
                }
                break;
        }
    }
    
    showTopBanner(message, type = 'warning', duration = 5000) {
        const banner = this.elements.topBanner;
        banner.textContent = message;
        banner.className = `top-banner ${type}`;
        banner.classList.remove('hidden');
        
        if (duration > 0) {
            setTimeout(() => {
                banner.classList.add('hidden');
            }, duration);
        }
    }
}

// Start App when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
