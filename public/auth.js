/**
 * Authentication Module
 * Handles login, registration, and session management using Firebase Auth
 */
class Authentication {
    constructor() {
        this.currentUser = null;
        this.viewElement = document.getElementById('view-auth');
        this.initialized = false;
    }

    async init() {
        return new Promise((resolve) => {
            window.auth.onAuthStateChanged(async (firebaseUser) => {
                if (firebaseUser) {
                    try {
                        // Fetch extended profile data from Firestore
                        const profile = await window.DB.findUserById(firebaseUser.uid);
                        if (profile) {
                            this.currentUser = profile;
                        } else if (!this.currentUser || this.currentUser.id !== firebaseUser.uid) {
                            // If profile isn't found (e.g., interrupted registration), use basic data
                            // Only set fallback if we don't already have a valid currentUser set by registration
                            this.currentUser = { id: firebaseUser.uid, email: firebaseUser.email, name: "User" };
                        }
                    } catch(e) {
                        console.error("Session restore failed", e);
                        this.currentUser = null;
                    }
                } else {
                    this.currentUser = null;
                }
                
                this.initialized = true;
                
                if (window.app) {
                    window.app.checkAuthStatus();
                } else {
                    // If we are app startup and we failed to get user, show auth
                    if (!this.currentUser && window.app && window.app.currentView !== 'auth') {
                        this.render();
                    } else if (this.currentUser && window.app && window.app.currentView === 'auth') {
                        this.setSession(this.currentUser);
                    }
                }
                
                resolve();
            });
        });
    }

    getCurrentUser() {
        return this.currentUser;
    }

    render() {
        this.renderLogin();
    }

    renderLogin() {
        this.viewElement.innerHTML = `
            <div class="auth-box">
                <div class="auth-logo"><i class="fas fa-shield-alt"></i></div>
                <h2 class="text-center">TravelSafe</h2>
                <p class="text-center">Smart Tourist Safety Monitoring</p>
                
                <form id="login-form">
                    <div class="form-group">
                        <label>Email</label>
                        <input type="email" id="login-email" required>
                    </div>
                    <div class="form-group">
                        <label>Password</label>
                        <input type="password" id="login-password" required>
                    </div>
                    <button type="submit" id="login-submit" class="btn btn-primary">Login</button>
                    <div id="login-error" class="error-msg hidden"></div>
                </form>
                
                <p class="text-center" style="margin-top: 1.5rem">
                    Don't have an account? <a href="#" id="show-register" class="text-accent">Register</a>
                </p>
            </div>
        `;

        document.getElementById('login-form').addEventListener('submit', (e) => this.handleLogin(e));
        document.getElementById('show-register').addEventListener('click', (e) => {
            e.preventDefault();
            this.renderRegister();
        });
    }

    async handleLogin(e) {
        e.preventDefault();
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        const errorEl = document.getElementById('login-error');
        const submitBtn = document.getElementById('login-submit');

        errorEl.classList.add('hidden');

        if (!email || !password) {
            errorEl.textContent = "Please fill in all fields.";
            errorEl.classList.remove('hidden');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Logging in...';

        try {
            await window.auth.signInWithEmailAndPassword(email, password);
        } catch(err) {
            errorEl.textContent = err.message || "Invalid email or password.";
            errorEl.classList.remove('hidden');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Login';
        }
    }

    renderRegister() {
        this.viewElement.innerHTML = `
            <div class="auth-box">
                <h2 class="text-center">Create Account</h2>
                
                <form id="register-form">
                    <div class="form-group">
                        <label>Full Name</label>
                        <input type="text" id="reg-name" required>
                    </div>
                    <div class="form-group">
                        <label>Email</label>
                        <input type="email" id="reg-email" required>
                    </div>
                    <div class="form-group">
                        <label>Phone Number</label>
                        <input type="tel" id="reg-phone" required>
                    </div>
                    <div class="form-group">
                        <label>Nationality</label>
                        <input type="text" id="reg-nationality" required>
                    </div>
                    <div class="form-group">
                        <label>Emergency Contact (Phone)</label>
                        <input type="tel" id="reg-emergency" required>
                    </div>
                    <div class="form-group">
                        <label>Password (Min 6 chars)</label>
                        <input type="password" id="reg-password" minlength="6" required>
                    </div>
                    <button type="submit" id="reg-submit" class="btn btn-primary">Register</button>
                    <div id="reg-error" class="error-msg hidden"></div>
                </form>
                
                <p class="text-center" style="margin-top: 1.5rem">
                    Already have an account? <a href="#" id="show-login" class="text-accent">Login</a>
                </p>
            </div>
        `;

        document.getElementById('register-form').addEventListener('submit', (e) => this.handleRegister(e));
        document.getElementById('show-login').addEventListener('click', (e) => {
            e.preventDefault();
            this.renderLogin();
        });
    }



    async handleRegister(e) {
        e.preventDefault();
        const name = document.getElementById('reg-name').value.trim();
        const email = document.getElementById('reg-email').value.trim();
        const phone = document.getElementById('reg-phone').value.trim();
        const nationality = document.getElementById('reg-nationality').value.trim();
        const emergency = document.getElementById('reg-emergency').value.trim();
        const password = document.getElementById('reg-password').value;
        const errorEl = document.getElementById('reg-error');
        const submitBtn = document.getElementById('reg-submit');

        errorEl.classList.add('hidden');

        // Validation
        if (!name || !email || !phone || !nationality || !emergency || !password) {
            errorEl.textContent = "All fields are required.";
            errorEl.classList.remove('hidden');
            return;
        }
        
        if (password.length < 6) {
            errorEl.textContent = "Password must be at least 6 characters.";
            errorEl.classList.remove('hidden');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Registering...';

        try {
            const userCredential = await window.auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;
            
            // Save profile to Firestore via DB client
            const newUserProfile = await window.DB.createUserProfile({
                id: user.uid,
                name, 
                email, 
                phone, 
                nationality, 
                emergencyPhone: emergency
            });
            
            this.setSession(newUserProfile);
        } catch (err) {
            errorEl.textContent = err.message;
            errorEl.classList.remove('hidden');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Register';
        }
    }

    setSession(user) {
        this.currentUser = user;
        if (window.app) {
            window.app.checkAuthStatus();
        }
    }
    
    async logout() {
        try {
            // 1. Shut down Geolocation watch loops, intervals, and wipe map layers
            if (window.MapController && window.MapController.stopGPSTracking) {
                window.MapController.stopGPSTracking();
            }
            
            // 2. Unsubscribe from real-time database snapshot streams and reset group context
            if (window.GroupController && window.GroupController.cleanup) {
                window.GroupController.cleanup();
            }

            // 3. Unsubscribe from real-time group chat and clean up typing status
            if (window.ChatController && window.ChatController.cleanup) {
                window.ChatController.cleanup();
            }

            await window.auth.signOut();
            this.currentUser = null;
            if (window.app) {
                window.app.checkAuthStatus();
            }
        } catch(e) {
            console.error("Logout failed", e);
        }
    }
}

// Global Auth Instance
window.Auth = new Authentication();

// Initialization flow is handled by app.js awaiting Auth.init()
