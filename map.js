/**
 * Map Module
 * Uses Leaflet and OpenStreetMap
 */

class MapModule {
    constructor() {
        this.map = null;
        this.userMarker = null;
        this.groupMarkers = {};
        this.watchId = null;
        this.servicesAdded = false;
        this.isMapInitialized = false;
        this.currentCoords = null; 
        this.rawCoords = null; // Caches raw GPS data for signal diagnostics
        this.isSelfSOSActive = false;
        this.userAccuracyCircle = null;
        this.groupAccuracyCircles = {};

        // Calibration & Snapping states
        this.groupMembersData = [];
        this.calibratedCoords = null;
        this.isCalibrationMode = false;
        this.calibrationMarker = null;
        this.mapOnCLickHandler = null;
        this.gpsFailureCount = 0;
        this.gpsFallbacked = false;
        this.gpsRetryInterval = null;
        this.openedSOSPopups = {};

        // Restore cached calibration if exists
        const cachedCalib = localStorage.getItem('calibrated_coords');
        if (cachedCalib) {
            try {
                this.calibratedCoords = JSON.parse(cachedCalib);
            } catch(e) {
                console.error("Failed to parse cached calibration coordinates:", e);
            }
        }

        // Risk detection constants
        this.RISK_ZONES = [
            { lat: 13.0827, lng: 80.2707, radius: 1000, name: "Central Station - High Flow Area" }, 
            { lat: 13.0604, lng: 80.2496, radius: 800, name: "Shopping District N" }
        ];
    }

    onMapShown() {
        if (!this.isMapInitialized) {
            setTimeout(() => {
                this.initMap();
            }, 150);
        } else if (this.map) {
            setTimeout(() => {
                this.map.invalidateSize();
                if (this.currentCoords) {
                    this.map.setView([this.currentCoords.latitude, this.currentCoords.longitude]);
                }
            }, 100);
        }
    }

    initMap() {
        const container = document.getElementById('map-container');
        if (!container) return;

        // Default location to center of India
        this.map = L.map('map-container').setView([20.5937, 78.9629], 5);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap contributors'
        }).addTo(this.map);

        this.isMapInitialized = true;

        this.startGPSTracking();
        this.loadRiskZones();
        this.setupCalibrationUI();

        // Render pre-loaded group members if available
        if (this.groupMembersData && this.groupMembersData.length > 0) {
            this.updateGroupMarkers(this.groupMembersData);
        }

        document.getElementById('btn-recenter').addEventListener('click', () => {
            if (this.currentCoords) {
                this.map.setView([this.currentCoords.latitude, this.currentCoords.longitude], 16);
            }
        });
    }

    async loadRiskZones() {
        try {
            if (window.db) {
                const snapshot = await window.db.collection('risk_zones').get();
                if (snapshot && !snapshot.empty) {
                    const zones = [];
                    snapshot.forEach(doc => {
                        zones.push(doc.data());
                    });
                    this.RISK_ZONES = zones;
                    console.log("Loaded dynamic risk zones from Firestore:", zones);
                }
            }
        } catch(e) {
            console.error("Failed to load dynamic risk zones, falling back to static config:", e);
        }
    }

    setupCalibrationUI() {
        // Floating diagnostics button opens sheet
        const healthBtn = document.getElementById('btn-location-health');
        if (healthBtn) {
            healthBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openDrawer();
            });
        }

        // Drawer Close Button
        const closeBtn = document.getElementById('btn-close-drawer');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeDrawer());
        }

        // Prevent click propagation on sheet body
        const drawer = document.getElementById('location-health-drawer');
        if (drawer) {
            drawer.addEventListener('click', (e) => e.stopPropagation());
        }

        // Calibration action banner handlers
        const lockBtn = document.getElementById('btn-calibration-lock');
        if (lockBtn) {
            lockBtn.addEventListener('click', () => this.lockCalibration());
        }

        const cancelBtn = document.getElementById('btn-calibration-cancel');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.cancelCalibration());
        }

        // Mobile drawer sheet handle bar tap to minimize
        const handleBar = document.getElementById('drawer-handle-bar');
        if (handleBar) {
            handleBar.addEventListener('click', () => this.closeDrawer());
        }
    }

    openDrawer() {
        const drawer = document.getElementById('location-health-drawer');
        if (drawer) {
            this.renderDrawerContent();
            drawer.classList.remove('hidden');
        }
    }

    closeDrawer() {
        const drawer = document.getElementById('location-health-drawer');
        if (drawer) {
            drawer.classList.add('hidden');
        }
    }

    startGPSTracking() {
        const statusEl = document.getElementById('map-status-indicator');
        
        if (!navigator.geolocation) {
            statusEl.textContent = "Geolocation not supported";
            return;
        }

        statusEl.innerHTML = '<div class="spinner"></div> Tracking GPS...';

        const gpsOptions = {
            enableHighAccuracy: !this.gpsFallbacked,
            maximumAge: 5000,
            timeout: 15000
        };

        if (this.watchId) {
            navigator.geolocation.clearWatch(this.watchId);
        }

        this.watchId = navigator.geolocation.watchPosition(
            (position) => {
                this.gpsFailureCount = 0;
                this.handleLocationUpdate(position);
            },
            (error) => {
                console.warn("GPS Tracking Watch Error:", error);
                this.gpsFailureCount++;

                // If high precision times out or is blocked indoors, trigger automatic low-accuracy recovery fallback
                if (!this.gpsFallbacked && (error.code === error.TIMEOUT || error.code === error.POSITION_UNAVAILABLE)) {
                    console.log("GPS signal weak. Toggling coarse tracking mode...");
                    this.gpsFallbacked = true;
                    this.startGPSTracking();

                    // Periodically attempt to upscale back to High-Accuracy GPS every 30 seconds
                    if (!this.gpsRetryInterval) {
                        this.gpsRetryInterval = setInterval(() => {
                            console.log("Checking if high-accuracy GPS satellite signal is re-established...");
                            this.gpsFallbacked = false;
                            this.startGPSTracking();
                        }, 30000);
                    }
                }

                this.handleLocationError(error);
            },
            gpsOptions
        );
    }

    handleLocationUpdate(position) {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const accuracy = position.coords.accuracy;
        
        // Cache raw coordinates for diagnostic meters display
        this.rawCoords = { latitude: lat, longitude: lng, accuracy: accuracy };

        // Save to local storage for emergency offline SOS fallback
        localStorage.setItem('last_known_coords', JSON.stringify({
            latitude: lat,
            longitude: lng,
            accuracy: accuracy,
            timestamp: new Date().toISOString()
        }));

        // Determine current operational tracking profile
        if (this.calibratedCoords) {
            this.currentCoords = { 
                latitude: this.calibratedCoords.lat, 
                longitude: this.calibratedCoords.lng, 
                accuracy: 1, 
                isCalibrated: true 
            };
        } else {
            this.currentCoords = { 
                latitude: lat, 
                longitude: lng, 
                accuracy: accuracy,
                isCalibrated: false 
            };
        }

        const activeLat = this.currentCoords.latitude;
        const activeLng = this.currentCoords.longitude;

        // Update Dashboard coordinates
        if (window.DashboardController) {
            window.DashboardController.updateCoordinates(activeLat, activeLng);
        }
        
        // Sync position directly to Firebase
        this.broadcastLocation();

        // Update Location Health UI Indicators
        this.updateDiagnosticsUI(accuracy);

        // Draw or update User Accuracy Halo Circle
        if (accuracy && !this.calibratedCoords) {
            if (!this.userAccuracyCircle) {
                this.userAccuracyCircle = L.circle([activeLat, activeLng], {
                    radius: accuracy,
                    color: 'var(--accent-color)',
                    fillColor: 'var(--accent-color)',
                    fillOpacity: 0.1,
                    weight: 1
                }).addTo(this.map);
            } else {
                this.userAccuracyCircle.setLatLng([activeLat, activeLng]);
                this.userAccuracyCircle.setRadius(accuracy);
            }
        } else if (this.userAccuracyCircle) {
            this.map.removeLayer(this.userAccuracyCircle);
            this.userAccuracyCircle = null;
        }

        // Update Map Marker
        if (!this.userMarker) {
            const userIcon = this.createUserIcon(this.isSelfSOSActive, this.calibratedCoords !== null);
            this.userMarker = L.marker([activeLat, activeLng], { icon: userIcon }).addTo(this.map)
                .bindPopup(this.calibratedCoords ? "<b>You (Calibrated Position)</b>" : "<b>You are here</b>").openPopup();
                
            this.map.setView([activeLat, activeLng], 16);
        } else {
            this.userMarker.setLatLng([activeLat, activeLng]);
            this.userMarker.setIcon(this.createUserIcon(this.isSelfSOSActive, this.calibratedCoords !== null));
            this.userMarker.setPopupContent(this.calibratedCoords ? "<b>You (Calibrated Position)</b>" : "<b>You are here</b>");
        }

        this.checkRiskZones(activeLat, activeLng);

        if (!this.servicesAdded) {
            this.addNearbyServices(activeLat, activeLng);
            this.servicesAdded = true;
        }
    }

    broadcastLocation() {
        if (window.Auth && window.Auth.getCurrentUser()) {
            const user = window.Auth.getCurrentUser();
            this.isSelfSOSActive = !!user.isSOSActive;
            
            const activeLat = this.currentCoords.latitude;
            const activeLng = this.currentCoords.longitude;
            const accuracy = this.currentCoords.isCalibrated ? null : this.currentCoords.accuracy;
            const isCalibrated = !!this.currentCoords.isCalibrated;

            window.DB.updateLocation(user.id, activeLat, activeLng, accuracy, isCalibrated);
        }
    }

    updateDiagnosticsUI(accuracy) {
        const dot = document.getElementById('health-dot');
        const statusEl = document.getElementById('map-status-indicator');
        
        if (!dot) return;
        
        dot.className = "health-dot";
        
        if (this.calibratedCoords) {
            dot.classList.add('status-green');
            statusEl.innerHTML = `<i class="fas fa-check-circle text-safe"></i> Calibrated Locked`;
            return;
        }

        if (this.gpsFallbacked) {
            dot.classList.add('status-orange');
            statusEl.innerHTML = `<i class="fas fa-wifi text-warning" style="animation: pulse 1.5s infinite;"></i> Triangulated (${Math.round(accuracy)}m)`;
        } else if (accuracy) {
            if (accuracy > 150) {
                dot.classList.add('status-red');
                statusEl.innerHTML = `<i class="fas fa-exclamation-triangle text-danger"></i> Low Precision (${Math.round(accuracy)}m)`;
            } else if (accuracy > 50) {
                dot.classList.add('status-orange');
                statusEl.innerHTML = `<i class="fas fa-wifi text-warning" style="animation: pulse 1.5s infinite;"></i> Moderate GPS (${Math.round(accuracy)}m)`;
            } else {
                dot.classList.add('status-green');
                statusEl.innerHTML = `<i class="fas fa-location-arrow text-safe"></i> GPS Active (${Math.round(accuracy)}m)`;
            }
        } else {
            dot.classList.add('status-unknown');
            statusEl.textContent = "GPS Active";
        }
    }

    handleLocationError(error) {
        let msg = "Location error";
        switch(error.code) {
            case error.PERMISSION_DENIED:
                msg = "Permission required";
                break;
            case error.POSITION_UNAVAILABLE:
                msg = "Signal unavailable";
                break;
            case error.TIMEOUT:
                msg = "Request timeout";
                break;
        }
        document.getElementById('map-status-indicator').innerHTML = `<i class="fas fa-exclamation-triangle text-danger"></i> ${msg}`;
        const dot = document.getElementById('health-dot');
        if (dot) {
            dot.className = "health-dot status-red";
        }
    }

    renderDrawerContent() {
        const contentEl = document.getElementById('drawer-dynamic-content');
        if (!contentEl) return;

        let sourceText = "Awaiting lock...";
        let accuracyVal = "N/A";
        let fillWidth = "0%";
        let fillColor = "var(--text-secondary)";
        let descText = "";

        if (this.calibratedCoords) {
            sourceText = "Manual Coordinates Override";
            accuracyVal = "Locked (Exact)";
            fillWidth = "100%";
            fillColor = "var(--safe-color)";
            descText = "Your location is locked to your manually selected coordinates. Standard automatic GPS tracking is paused.";
        } else if (this.rawCoords) {
            const acc = this.rawCoords.accuracy;
            if (this.gpsFallbacked) {
                sourceText = "Coarse (Wi-Fi / Cell Triangulation)";
                fillWidth = "40%";
                fillColor = "var(--warning-color)";
                descText = "Indoor satellite signal block detected. Tracking is active using local Wi-Fi networks.";
            } else if (acc <= 30) {
                sourceText = "Hardware GPS (Satellite Signal)";
                fillWidth = "95%";
                fillColor = "var(--safe-color)";
                descText = "Connected to high-precision GPS satellites. Live positions are accurate to sub-meter levels.";
            } else if (acc <= 150) {
                sourceText = "Mixed Mode (GPS & Wi-Fi)";
                fillWidth = "70%";
                fillColor = "var(--warning-color)";
                descText = "Location locked using a combination of satellites and local Wi-Fi networks.";
            } else {
                sourceText = "Wide Triangulation (Low Accuracy)";
                fillWidth = "20%";
                fillColor = "var(--danger-color)";
                descText = "Coarse coordinates returned. We highly recommend using a smartphone or manual calibration override!";
            }
            accuracyVal = `± ${Math.round(acc)} meters`;
        } else {
            descText = "Establishing connection. Make sure location services are enabled on your device.";
        }

        // Determine if snapping button is applicable (group active and other members have coords)
        const user = window.Auth.getCurrentUser();
        const activeGroup = window.GroupController ? window.GroupController.activeGroup : null;
        let snapBtnHtml = '';

        if (activeGroup && activeGroup.members.length > 1) {
            const leaderId = activeGroup.creatorId;
            let targetMember = this.groupMembersData.find(m => m.id === leaderId && m.id !== user.id && m.location && m.location.lat);
            
            if (!targetMember) {
                // Snapping target fallback to any group member with active signal
                targetMember = this.groupMembersData.find(m => m.id !== user.id && m.location && m.location.lat);
            }

            if (targetMember) {
                const targetName = targetMember.name || "Leader";
                snapBtnHtml = `
                    <button class="calib-btn" id="btn-action-snap">
                        <i class="fas fa-magnet text-accent"></i> Snap to Room Leader (${window.escapeHtml(targetName)})
                    </button>
                `;
            }
        }

        let resetBtnHtml = '';
        if (this.calibratedCoords) {
            resetBtnHtml = `
                <button class="calib-btn btn-reset-gps" id="btn-action-reset">
                    <i class="fas fa-sync-alt"></i> Resume Live Auto-GPS Tracking
                </button>
            `;
        }

        contentEl.innerHTML = `
            <div class="diag-gauge-box">
                <div class="gauge-header">
                    <span class="gauge-label">Tracking Signal</span>
                    <span class="gauge-value text-accent">${sourceText}</span>
                </div>
                <div class="gauge-progress-bar">
                    <div class="gauge-fill" style="width: ${fillWidth}; background-color: ${fillColor};"></div>
                </div>
                <p style="margin: 0; font-size: 0.8rem; color: var(--text-secondary); line-height: 1.45;">
                    <b>Reported Accuracy:</b> <span class="text-accent">${accuracyVal}</span><br>
                    ${descText}
                </p>
            </div>

            <div class="calib-actions-grid">
                <button class="calib-btn" id="btn-action-calibrate">
                    <i class="fas fa-map-marker-alt text-accent"></i> Pinpoint Location on Map
                </button>
                ${snapBtnHtml}
                ${resetBtnHtml}
            </div>

            <!-- Troubleshooting Accordion -->
            <div class="ts-accordion">
                <div class="ts-accordion-title" id="ts-toggle">
                    <span><i class="fas fa-question-circle"></i> Why does my live map look incorrect?</span>
                    <i class="fas fa-chevron-down" id="ts-chevron"></i>
                </div>
                <div class="ts-accordion-content hidden" id="ts-content">
                    <div class="ts-card">
                        <h4><i class="fab fa-apple text-accent"></i> iOS iPhone (Safari / Chrome)</h4>
                        <p>Tap the <b>aA</b> or <b>lock icon</b> on the left of the URL bar ➜ select <b>Website Settings</b> ➜ set <b>Location</b> to <b>Allow</b>, and ensure <b>"Precise Location"</b> is toggled <b>ON</b>. Restart browser.</p>
                    </div>
                    <div class="ts-card">
                        <h4><i class="fab fa-android text-accent"></i> Android (Chrome)</h4>
                        <p>Tap the <b>lock icon</b> left of the URL address ➜ tap <b>Permissions</b> ➜ clear/reset permissions and select the <b>"Precise"</b> location accuracy toggle when prompted.</p>
                    </div>
                    <div class="ts-card">
                        <h4><i class="fas fa-laptop text-accent"></i> Laptops & PCs</h4>
                        <p>Desktops do not possess satellite GPS chips. They estimate your location via your ISP internet provider, which is often miles off. Open the application on your smartphone, or tap <b>Pinpoint</b> above to correct your coordinates!</p>
                    </div>
                </div>
            </div>
        `;

        // Bind Accordion expander
        document.getElementById('ts-toggle').addEventListener('click', () => {
            const content = document.getElementById('ts-content');
            const chevron = document.getElementById('ts-chevron');
            if (content.classList.contains('hidden')) {
                content.classList.remove('hidden');
                chevron.classList.replace('fa-chevron-down', 'fa-chevron-up');
            } else {
                content.classList.add('hidden');
                chevron.classList.replace('fa-chevron-up', 'fa-chevron-down');
            }
        });

        // Pinpoint Click Handler
        document.getElementById('btn-action-calibrate').addEventListener('click', () => {
            this.closeDrawer();
            this.enterCalibrationMode();
        });

        // Snap Click Handler
        const snapBtn = document.getElementById('btn-action-snap');
        if (snapBtn) {
            snapBtn.addEventListener('click', () => {
                this.closeDrawer();
                this.snapToLeader();
            });
        }

        // Reset GPS Click Handler
        const resetBtn = document.getElementById('btn-action-reset');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                this.closeDrawer();
                this.resetToGPS();
            });
        }
    }

    enterCalibrationMode() {
        if (this.isCalibrationMode) return;
        this.isCalibrationMode = true;

        // Animate in the top Lock banner
        const banner = document.getElementById('calibration-banner');
        if (banner) banner.classList.remove('hidden');

        // Zoom into calibration start coords
        const startLat = this.currentCoords ? this.currentCoords.latitude : 20.5937;
        const startLng = this.currentCoords ? this.currentCoords.longitude : 78.9629;
        this.map.setView([startLat, startLng], 17);

        // Spawn interactive crosshair calibration target
        const crosshairIcon = L.divIcon({
            className: 'calibration-pin',
            html: '<div style="display:flex; justify-content:center; align-items:center; width:44px; height:44px; border:2.5px dashed var(--accent-color); border-radius:50%; background:rgba(100,255,218,0.15); animation: spin 4s linear infinite;"><i class="fas fa-crosshairs" style="color:var(--accent-color); font-size:16px;"></i></div>',
            iconSize: [44, 44],
            iconAnchor: [22, 22]
        });

        this.calibrationMarker = L.marker([startLat, startLng], {
            draggable: true,
            icon: crosshairIcon
        }).addTo(this.map);

        // Instant pinpoint tap click handler
        this.mapOnCLickHandler = (e) => {
            if (this.calibrationMarker) {
                this.calibrationMarker.setLatLng(e.latlng);
            }
        };
        this.map.on('click', this.mapOnCLickHandler);
    }

    lockCalibration() {
        if (!this.calibrationMarker) return;
        
        const pos = this.calibrationMarker.getLatLng();
        this.calibratedCoords = { lat: pos.lat, lng: pos.lng };
        
        // Cache calibration state
        localStorage.setItem('calibrated_coords', JSON.stringify(this.calibratedCoords));
        
        this.isCalibrationMode = false;
        
        // Remove pin overlays and listeners
        this.map.removeLayer(this.calibrationMarker);
        this.calibrationMarker = null;
        if (this.mapOnCLickHandler) {
            this.map.off('click', this.mapOnCLickHandler);
            this.mapOnCLickHandler = null;
        }

        // Hide calibration banner
        const banner = document.getElementById('calibration-banner');
        if (banner) banner.classList.add('hidden');

        // Re-inject updated coordinated block
        if (this.rawCoords) {
            this.handleLocationUpdate({
                coords: {
                    latitude: this.rawCoords.latitude,
                    longitude: this.rawCoords.longitude,
                    accuracy: this.rawCoords.accuracy
                }
            });
        } else {
            this.currentCoords = { 
                latitude: pos.lat, 
                longitude: pos.lng, 
                accuracy: 1, 
                isCalibrated: true 
            };
            this.broadcastLocation();
            this.updateDiagnosticsUI(1);
            
            if (!this.userMarker) {
                const userIcon = this.createUserIcon(this.isSelfSOSActive, true);
                this.userMarker = L.marker([pos.lat, pos.lng], { icon: userIcon }).addTo(this.map);
            } else {
                this.userMarker.setLatLng([pos.lat, pos.lng]);
                this.userMarker.setIcon(this.createUserIcon(this.isSelfSOSActive, true));
            }
        }

        if (window.app) {
            window.app.showTopBanner("Location Calibrated Successfully!", "safe", 3000);
        }
    }

    cancelCalibration() {
        this.isCalibrationMode = false;
        
        // Clean up pinpoint states
        if (this.calibrationMarker) {
            this.map.removeLayer(this.calibrationMarker);
            this.calibrationMarker = null;
        }
        if (this.mapOnCLickHandler) {
            this.map.off('click', this.mapOnCLickHandler);
            this.mapOnCLickHandler = null;
        }

        // Hide Banner
        const banner = document.getElementById('calibration-banner');
        if (banner) banner.classList.add('hidden');

        if (window.app) {
            window.app.showTopBanner("Calibration Cancelled", "warning", 2000);
        }
    }

    snapToLeader() {
        const user = window.Auth.getCurrentUser();
        const activeGroup = window.GroupController ? window.GroupController.activeGroup : null;
        if (!activeGroup) return;

        const leaderId = activeGroup.creatorId;
        let snapTarget = this.groupMembersData.find(m => m.id === leaderId && m.id !== user.id && m.location && m.location.lat);
        
        if (!snapTarget) {
            // Find any valid group member coordinates if leader's coordinates are missing
            snapTarget = this.groupMembersData.find(m => m.id !== user.id && m.location && m.location.lat);
        }

        if (snapTarget && snapTarget.location) {
            const targetLat = snapTarget.location.lat;
            const targetLng = snapTarget.location.lng;
            
            this.calibratedCoords = { lat: targetLat, lng: targetLng };
            localStorage.setItem('calibrated_coords', JSON.stringify(this.calibratedCoords));

            this.map.setView([targetLat, targetLng], 17);

            if (this.rawCoords) {
                this.handleLocationUpdate({
                    coords: {
                        latitude: this.rawCoords.latitude,
                        longitude: this.rawCoords.longitude,
                        accuracy: this.rawCoords.accuracy
                    }
                });
            } else {
                this.currentCoords = { 
                    latitude: targetLat, 
                    longitude: targetLng, 
                    accuracy: 1, 
                    isCalibrated: true 
                };
                this.broadcastLocation();
                this.updateDiagnosticsUI(1);

                if (!this.userMarker) {
                    const userIcon = this.createUserIcon(this.isSelfSOSActive, true);
                    this.userMarker = L.marker([targetLat, targetLng], { icon: userIcon }).addTo(this.map)
                        .bindPopup("<b>You (Calibrated Position)</b>").openPopup();
                } else {
                    this.userMarker.setLatLng([targetLat, targetLng]);
                    this.userMarker.setIcon(this.createUserIcon(this.isSelfSOSActive, true));
                    this.userMarker.setPopupContent("<b>You (Calibrated Position)</b>");
                }
            }

            if (window.app) {
                window.app.showTopBanner(`Snapped to ${window.escapeHtml(snapTarget.name || "Leader")}'s Coordinates!`, "safe", 3000);
            }
        } else {
            if (window.app) {
                window.app.showTopBanner("No group member location signals found to snap to.", "danger", 3000);
            }
        }
    }

    resetToGPS() {
        this.calibratedCoords = null;
        localStorage.removeItem('calibrated_coords');

        if (window.app) {
            window.app.showTopBanner("Automatic GPS tracking resumed", "safe", 3000);
        }

        this.gpsFallbacked = false;
        this.startGPSTracking();

        if (this.rawCoords) {
            this.handleLocationUpdate({
                coords: {
                    latitude: this.rawCoords.latitude,
                    longitude: this.rawCoords.longitude,
                    accuracy: this.rawCoords.accuracy
                }
            });
        }
    }

    // Distance calculation Helper (Haversine)
    getDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3; // metres
        const φ1 = lat1 * Math.PI/180;
        const φ2 = lat2 * Math.PI/180;
        const Δφ = (lat2-lat1) * Math.PI/180;
        const Δλ = (lon2-lon1) * Math.PI/180;

        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

        return R * c;
    }

    checkRiskZones(lat, lng) {
        let inDanger = false;
        let riskMessage = null;

        for (let zone of this.RISK_ZONES) {
            const distance = this.getDistance(lat, lng, zone.lat, zone.lng);
            if (distance < zone.radius) {
                inDanger = true;
                riskMessage = `High-risk area detected: ${zone.name}`;
                break;
            }
        }

        if (window.DashboardController) {
            if (this.isSelfSOSActive) {
                window.DashboardController.setSafetyStatus('DANGER', 'EMERGENCY SOS ACTIVE');
            } else if (inDanger) {
                window.DashboardController.setSafetyStatus('DANGER', riskMessage);
            } else {
                window.DashboardController.setSafetyStatus('SAFE');
            }
        }
    }

    addNearbyServices(lat, lng) {
        const generateOffset = () => (Math.random() - 0.5) * 0.02;

        const localServices = [
            { lat: lat + generateOffset(), lng: lng + generateOffset(), type: "police", name: "Local Police Station" },
            { lat: lat + generateOffset(), lng: lng + generateOffset(), type: "police", name: "Highway Patrol Office" },
            { lat: lat + generateOffset(), lng: lng + generateOffset(), type: "hospital", name: "Main General Hospital" },
            { lat: lat + generateOffset(), lng: lng + generateOffset(), type: "hospital", name: "Emergency Clinic" }
        ];

        localServices.forEach(s => {
            let color = s.type === 'police' ? '#6495ED' : '#FF4C4C';
            let iconClass = s.type === 'police' ? 'fa-shield-alt' : 'fa-hospital';
            
            const customIcon = L.divIcon({
                className: 'custom-service-marker',
                html: `<div style="background-color: var(--bg-secondary); border: 2px solid ${color}; width: 30px; height: 30px; border-radius: 50%; display: flex; justify-content: center; align-items: center; color: ${color}; font-size: 14px; box-shadow: var(--card-shadow);"><i class="fas ${iconClass}"></i></div>`,
                iconSize: [30, 30],
                iconAnchor: [15, 15]
            });

            L.marker([s.lat, s.lng], { icon: customIcon }).addTo(this.map)
                .bindPopup(`<b>${s.name}</b><br>${s.type === 'police' ? 'Police Station' : 'Hospital'}`);
        });
    }

    getCurrentLocation() {
        return this.currentCoords;
    }

    createUserIcon(isActive, isCalibrated = false) {
        if (isActive) {
            return L.divIcon({
                className: 'custom-user-marker-sos',
                html: '<div style="background-color: var(--danger-color); width: 28px; height: 28px; border-radius: 50%; border: 2px solid white; display: flex; justify-content: center; align-items: center; color: white; font-size: 12px; font-weight: bold; box-shadow: 0 0 15px var(--danger-color); animation: pulse 1.5s infinite;"><i class="fas fa-exclamation-triangle"></i></div>',
                iconSize: [28, 28],
                iconAnchor: [14, 14]
            });
        } else if (isCalibrated) {
            return L.divIcon({
                className: 'custom-user-marker-calibrated',
                html: '<div style="background-color: var(--safe-color); width: 22px; height: 22px; border-radius: 50%; border: 2.5px solid white; display: flex; justify-content: center; align-items: center; box-shadow: 0 0 10px rgba(0,230,118,0.8);"><i class="fas fa-check" style="font-size:8px; color:white;"></i></div>',
                iconSize: [22, 22],
                iconAnchor: [11, 11]
            });
        } else {
            return L.divIcon({
                className: 'custom-user-marker',
                html: '<div style="background-color: var(--accent-color); width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px rgba(100,255,218,0.8);"></div>',
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            });
        }
    }

    setSelfSOS(isActive) {
        this.isSelfSOSActive = isActive;
        if (this.userMarker && this.currentCoords) {
            const userIcon = this.createUserIcon(isActive, this.calibratedCoords !== null);
            this.userMarker.setIcon(userIcon);
        }
    }

    updateGroupMarkers(membersData) {
        // Cache group members locally for coordinates snapping
        this.groupMembersData = membersData;

        if (!this.map) return;
        
        const currentUser = window.Auth ? window.Auth.getCurrentUser() : null;
        
        membersData.forEach(member => {
            // Skip current user
            if (currentUser && member.id === currentUser.id) return;
            
            if (member.location && member.location.lat && member.location.lng) {
                const lat = member.location.lat;
                const lng = member.location.lng;
                const rawName = member.name || "Member";
                const name = window.escapeHtml(rawName);
                const accuracy = member.location.accuracy;
                const isCalibrated = !!(member.location && member.location.isCalibrated);
                
                const bgColor = member.isSOSActive ? 'var(--danger-color)' : (isCalibrated ? 'var(--safe-color)' : '#9b59b6');
                const shadow = member.isSOSActive ? '0 0 15px var(--danger-color)' : (isCalibrated ? '0 0 10px rgba(0,230,118,0.8)' : 'var(--card-shadow)');
                const animation = member.isSOSActive ? 'animation: pulse 1.5s infinite;' : '';
                
                let innerHtml = window.escapeHtml(rawName && rawName.length > 0 ? rawName[0] : 'M').toUpperCase();
                if (member.isSOSActive) {
                    innerHtml = '<i class="fas fa-exclamation-triangle" style="font-size: 11px;"></i>';
                } else if (isCalibrated) {
                    innerHtml = '<i class="fas fa-check" style="font-size: 10px;"></i>';
                }
                
                const customIcon = L.divIcon({
                    className: 'custom-group-marker',
                    html: `<div style="background-color: ${bgColor}; width: 28px; height: 28px; border-radius: 50%; border: 2px solid white; display: flex; justify-content: center; align-items: center; color: white; font-size: 12px; font-weight: bold; box-shadow: ${shadow}; ${animation}">${innerHtml}</div>`,
                    iconSize: [28, 28],
                    iconAnchor: [14, 14]
                });

                // Update or Draw Accuracy Halo Circle for Member
                const circleColor = member.isSOSActive ? 'var(--danger-color)' : (isCalibrated ? 'var(--safe-color)' : '#9b59b6');
                if (accuracy && !isCalibrated) {
                    if (this.groupAccuracyCircles[member.id]) {
                        this.groupAccuracyCircles[member.id].setLatLng([lat, lng]);
                        this.groupAccuracyCircles[member.id].setRadius(accuracy);
                        this.groupAccuracyCircles[member.id].setStyle({ color: circleColor, fillColor: circleColor });
                    } else {
                        this.groupAccuracyCircles[member.id] = L.circle([lat, lng], {
                            radius: accuracy,
                            color: circleColor,
                            fillColor: circleColor,
                            fillOpacity: 0.08,
                            weight: 1
                        }).addTo(this.map);
                    }
                } else if (this.groupAccuracyCircles[member.id]) {
                    this.map.removeLayer(this.groupAccuracyCircles[member.id]);
                    delete this.groupAccuracyCircles[member.id];
                }

                // If marker exists, move it and update icon. Else create it.
                const calibrationBadge = isCalibrated 
                    ? `<br><span class="calibrated-badge"><i class="fas fa-check-circle"></i> Calibrated Location</span>` 
                    : '';
                const accuracyText = (accuracy && !isCalibrated)
                    ? `<br><span style="font-size:0.75rem; color:var(--text-secondary);"><i class="fas fa-crosshairs"></i> Accuracy: ${Math.round(accuracy)}m ${accuracy > 100 ? '(Triangulated)' : ''}</span>`
                    : '';
                const popupContent = `<b>${name}</b><br>Group Member${member.isSOSActive ? ' - <span style="color:red;font-weight:bold;">SOS ACTIVE</span>' : ''}${calibrationBadge}${accuracyText}`;

                if (this.groupMarkers[member.id]) {
                    this.groupMarkers[member.id].setLatLng([lat, lng]);
                    this.groupMarkers[member.id].setIcon(customIcon);
                    this.groupMarkers[member.id].setPopupContent(popupContent);
                } else {
                    const marker = L.marker([lat, lng], { icon: customIcon }).addTo(this.map)
                        .bindPopup(popupContent);
                        
                    this.groupMarkers[member.id] = marker;
                }

                // Auto-pan and open popup only once when SOS is newly triggered
                if (member.isSOSActive && !this.openedSOSPopups[member.id]) {
                    this.groupMarkers[member.id].openPopup();
                    this.map.setView([lat, lng], 16);
                    this.openedSOSPopups[member.id] = true;
                } else if (!member.isSOSActive) {
                    delete this.openedSOSPopups[member.id];
                }
            }
        });
        
        // Remove markers for members who left the group or are no longer in membersData
        const currentMemberIds = membersData.map(m => m.id);
        Object.keys(this.groupMarkers).forEach(id => {
            if (!currentMemberIds.includes(id)) {
                this.map.removeLayer(this.groupMarkers[id]);
                delete this.groupMarkers[id];
                if (this.groupAccuracyCircles[id]) {
                    this.map.removeLayer(this.groupAccuracyCircles[id]);
                    delete this.groupAccuracyCircles[id];
                }
            }
        });
    }

    stopGPSTracking() {
        console.log("Shutting down GPS tracking and cleaning up map resources...");
        
        // 1. Clear Watch Position
        if (this.watchId) {
            navigator.geolocation.clearWatch(this.watchId);
            this.watchId = null;
        }

        // 2. Clear background upscaler loop
        if (this.gpsRetryInterval) {
            clearInterval(this.gpsRetryInterval);
            this.gpsRetryInterval = null;
        }

        // 3. Clear Map Markers and Halo Circles
        if (this.map) {
            // Remove user accuracy circle
            if (this.userAccuracyCircle) {
                this.map.removeLayer(this.userAccuracyCircle);
                this.userAccuracyCircle = null;
            }
            
            // Remove user marker
            if (this.userMarker) {
                this.map.removeLayer(this.userMarker);
                this.userMarker = null;
            }

            // Remove group markers
            Object.keys(this.groupMarkers).forEach(id => {
                this.map.removeLayer(this.groupMarkers[id]);
            });
            this.groupMarkers = {};

            // Remove group accuracy circles
            Object.keys(this.groupAccuracyCircles).forEach(id => {
                this.map.removeLayer(this.groupAccuracyCircles[id]);
            });
            this.groupAccuracyCircles = {};
        }

        // 4. Reset internal coordinates and fallback states
        this.currentCoords = null;
        this.rawCoords = null;
        this.calibratedCoords = null;
        this.gpsFailureCount = 0;
        this.gpsFallbacked = false;
        this.isSelfSOSActive = false;
        this.groupMembersData = [];
        this.openedSOSPopups = {};
        
        // 5. Clean up calibration modes if active
        if (this.isCalibrationMode) {
            this.isCalibrationMode = false;
        }
        if (this.calibrationMarker) {
            if (this.map) {
                this.map.removeLayer(this.calibrationMarker);
            }
            this.calibrationMarker = null;
        }
        if (this.mapOnCLickHandler && this.map) {
            this.map.off('click', this.mapOnCLickHandler);
            this.mapOnCLickHandler = null;
        }
        const banner = document.getElementById('calibration-banner');
        if (banner) {
            banner.classList.add('hidden');
        }
        
        // Remove locally stored manual calibration
        localStorage.removeItem('calibrated_coords');

        // Reset UI Status
        const statusEl = document.getElementById('map-status-indicator');
        if (statusEl) {
            statusEl.textContent = "Tracking Stopped";
        }
        const dot = document.getElementById('health-dot');
        if (dot) {
            dot.className = "health-dot status-unknown";
        }
    }
}

window.MapController = new MapModule();
