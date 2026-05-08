/**
 * Authentication Module
 * Handles login, registration, and session management
 */
class Authentication {
    constructor() {
        this.currentUser = null;
        this.viewElement = document.getElementById('view-auth');
        
        // Check session
        const session = localStorage.getItem('session_user_id');
        if (session) {
            this.currentUser = window.DB.findUserById(session);
        }
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
                    <button type="submit" class="btn btn-primary">Login</button>
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
                    <button type="submit" class="btn btn-primary">Register</button>
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

    handleLogin(e) {
        e.preventDefault();
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        const errorEl = document.getElementById('login-error');

        errorEl.classList.add('hidden');

        if (!email || !password) {
            errorEl.textContent = "Please fill in all fields.";
            errorEl.classList.remove('hidden');
            return;
        }

        const user = window.DB.findUserByEmail(email);
        if (user && user.password === password) {
            this.setSession(user);
        } else {
            errorEl.textContent = "Invalid email or password.";
            errorEl.classList.remove('hidden');
        }
    }

    handleRegister(e) {
        e.preventDefault();
        const name = document.getElementById('reg-name').value.trim();
        const email = document.getElementById('reg-email').value.trim();
        const phone = document.getElementById('reg-phone').value.trim();
        const nationality = document.getElementById('reg-nationality').value.trim();
        const emergency = document.getElementById('reg-emergency').value.trim();
        const password = document.getElementById('reg-password').value;
        const errorEl = document.getElementById('reg-error');

        errorEl.classList.add('hidden');

        // Validation - ensuring no empty inputs
        if (!name || !email || !phone || !nationality || !emergency || !password) {
            errorEl.textContent = "All fields are required.";
            errorEl.classList.remove('hidden');
            return;
        }
        
        // Strict Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            errorEl.textContent = "Invalid email format.";
            errorEl.classList.remove('hidden');
            return;
        }

        // Strict Password length
        if (password.length < 6) {
            errorEl.textContent = "Password must be at least 6 characters.";
            errorEl.classList.remove('hidden');
            return;
        }

        try {
            const newUser = window.DB.createUser({
                name, email, phone, nationality, emergencyPhone: emergency, password
            });
            this.setSession(newUser);
        } catch (err) {
            errorEl.textContent = err.message;
            errorEl.classList.remove('hidden');
        }
    }

    setSession(user) {
        this.currentUser = user;
        localStorage.setItem('session_user_id', user.id);
        if (window.app) {
            window.app.elements.nav.classList.remove('hidden');
            window.app.navigate('dashboard');
        }
    }
    
    logout() {
        this.currentUser = null;
        localStorage.removeItem('session_user_id');
        if (window.app) {
            window.app.elements.nav.classList.add('hidden');
            window.app.navigate('auth');
            this.renderLogin();
        }
    }
}

// Ensure Auth is ready early
window.Auth = new Authentication();
document.addEventListener('DOMContentLoaded', () => {
    if (!window.Auth.getCurrentUser()) {
        window.Auth.render();
    }
});
