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
        this.isSelfSOSActive = false;

        // Risk detection constants
        this.RISK_ZONES = [
            { lat: 13.0827, lng: 80.2707, radius: 1000, name: "Central Station - High Flow Area" }, 
            { lat: 13.0604, lng: 80.2496, radius: 800, name: "Shopping District N" }
        ];
    }

    onMapShown() {
        if (!this.isMapInitialized) {
            this.initMap();
        } else if (this.map) {
            // Leaflet needs invalidateSize when container changes size (e.g., display: none -> block)
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

        document.getElementById('btn-recenter').addEventListener('click', () => {
            if (this.currentCoords) {
                this.map.setView([this.currentCoords.latitude, this.currentCoords.longitude], 16);
            }
        });
    }

    startGPSTracking() {
        const statusEl = document.getElementById('map-status-indicator');
        
        if (!navigator.geolocation) {
            statusEl.textContent = "Geolocation not supported";
            return;
        }

        statusEl.innerHTML = '<div class="spinner"></div> Tracking GPS...';

        this.watchId = navigator.geolocation.watchPosition(
            (position) => this.handleLocationUpdate(position),
            (error) => this.handleLocationError(error),
            {
                enableHighAccuracy: true,
                maximumAge: 0,
                timeout: 5000
            }
        );
    }

    handleLocationUpdate(position) {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        this.currentCoords = { latitude: lat, longitude: lng };

        // Update Dashboard
        if (window.DashboardController) {
            window.DashboardController.updateCoordinates(lat, lng);
        }
        
        // Broadcast location to Firebase
        if (window.Auth && window.Auth.getCurrentUser()) {
            const user = window.Auth.getCurrentUser();
            window.DB.updateLocation(user.id, lat, lng);
            this.isSelfSOSActive = !!user.isSOSActive;
        }

        const statusEl = document.getElementById('map-status-indicator');
        statusEl.textContent = "GPS Active";

        // Update Map Marker
        if (!this.userMarker) {
            const userIcon = this.createUserIcon(this.isSelfSOSActive);
            this.userMarker = L.marker([lat, lng], { icon: userIcon }).addTo(this.map)
                .bindPopup("<b>You are here</b>").openPopup();
                
            this.map.setView([lat, lng], 16);
        } else {
            this.userMarker.setLatLng([lat, lng]);
            this.userMarker.setIcon(this.createUserIcon(this.isSelfSOSActive));
        }

        this.checkRiskZones(lat, lng);

        if (!this.servicesAdded) {
            this.addNearbyServices(lat, lng);
            this.servicesAdded = true;
        }
    }

    handleLocationError(error) {
        let msg = "Location error";
        switch(error.code) {
            case error.PERMISSION_DENIED:
                msg = "Location permission required";
                break;
            case error.POSITION_UNAVAILABLE:
                msg = "Location unavailable";
                break;
            case error.TIMEOUT:
                msg = "Location request timeout";
                break;
        }
        document.getElementById('map-status-indicator').innerHTML = `<i class="fas fa-exclamation-triangle text-danger"></i> ${msg}`;
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

        // To test risk features even if user is not in Chennai, let's add a fake risk zone 50 meters away
        if (!inDanger) {
            const testDistance = this.getDistance(lat, lng, lat + 0.0005, lng + 0.0005);
            // We just trigger if user is exactly on the danger threshold
            // Actually, omit to keep it clean.
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
        // Generating markers close to current location dynamically to ensure they show up wherever the demo is run
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

    createUserIcon(isActive) {
        if (isActive) {
            return L.divIcon({
                className: 'custom-user-marker-sos',
                html: '<div style="background-color: var(--danger-color); width: 28px; height: 28px; border-radius: 50%; border: 2px solid white; display: flex; justify-content: center; align-items: center; color: white; font-size: 12px; font-weight: bold; box-shadow: 0 0 15px var(--danger-color); animation: pulse 1.5s infinite;"><i class="fas fa-exclamation-triangle"></i></div>',
                iconSize: [28, 28],
                iconAnchor: [14, 14]
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
            const userIcon = this.createUserIcon(isActive);
            this.userMarker.setIcon(userIcon);
        }
    }

    updateGroupMarkers(membersData) {
        if (!this.map) return;
        
        const currentUser = window.Auth ? window.Auth.getCurrentUser() : null;
        
        membersData.forEach(member => {
            // Skip current user (we already have a blue marker for 'You')
            if (currentUser && member.id === currentUser.id) return;
            
            if (member.location && member.location.lat && member.location.lng) {
                const lat = member.location.lat;
                const lng = member.location.lng;
                const name = member.name || "Member";
                
                const bgColor = member.isSOSActive ? 'var(--danger-color)' : '#9b59b6';
                const shadow = member.isSOSActive ? '0 0 15px var(--danger-color)' : 'var(--card-shadow)';
                const animation = member.isSOSActive ? 'animation: pulse 1.5s infinite;' : '';
                const innerHtml = member.isSOSActive 
                    ? '<i class="fas fa-exclamation-triangle" style="font-size: 11px;"></i>' 
                    : name[0].toUpperCase();
                
                const customIcon = L.divIcon({
                    className: 'custom-group-marker',
                    html: `<div style="background-color: ${bgColor}; width: 28px; height: 28px; border-radius: 50%; border: 2px solid white; display: flex; justify-content: center; align-items: center; color: white; font-size: 12px; font-weight: bold; box-shadow: ${shadow}; ${animation}">${innerHtml}</div>`,
                    iconSize: [28, 28],
                    iconAnchor: [14, 14]
                });

                // If marker exists, move it and update icon. Else create it.
                if (this.groupMarkers[member.id]) {
                    this.groupMarkers[member.id].setLatLng([lat, lng]);
                    this.groupMarkers[member.id].setIcon(customIcon);
                } else {
                    const marker = L.marker([lat, lng], { icon: customIcon }).addTo(this.map)
                        .bindPopup(`<b>${name}</b><br>Group Member${member.isSOSActive ? ' - <span style="color:red;">SOS ACTIVE</span>' : ''}`);
                        
                    this.groupMarkers[member.id] = marker;
                }
            }
        });
        
        // Optionally, remove markers for members who left the group or are no longer in membersData
        const currentMemberIds = membersData.map(m => m.id);
        Object.keys(this.groupMarkers).forEach(id => {
            if (!currentMemberIds.includes(id)) {
                this.map.removeLayer(this.groupMarkers[id]);
                delete this.groupMarkers[id];
            }
        });
    }
}

window.MapController = new MapModule();
