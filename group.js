/**
 * Group Module
 */
class GroupModule {
    constructor() {
        this.viewElement = document.getElementById('view-group');
        this.activeGroup = null;
        this.groupMarkers = {};
    }

    render() {
        const user = window.Auth.getCurrentUser();
        if (!user) return;

        const groups = window.DB.getUserGroups(user.id);
        
        if (groups.length > 0) {
            this.activeGroup = groups[0]; // just load the first one for demo
            this.renderActiveGroup();
        } else {
            this.renderNoGroup();
        }
    }

    renderNoGroup() {
        this.viewElement.innerHTML = `
            <h2>Travel Groups</h2>
            <p>Join or create a group to share live locations and alerts.</p>
            
            <div class="card">
                <h3>Create Group</h3>
                <div class="form-group">
                    <input type="text" id="create-group-name" placeholder="E.g. Euro Trip 2026">
                </div>
                <button id="btn-create-group" class="btn btn-primary">Create</button>
            </div>
            
            <div class="card">
                <h3>Join Group</h3>
                <div class="form-group">
                    <input type="text" id="join-group-id" placeholder="Enter Invite Code (e.g. A4X9P)">
                </div>
                <button id="btn-join-group" class="btn btn-secondary">Join</button>
            </div>
        `;

        document.getElementById('btn-create-group').addEventListener('click', () => {
            const name = document.getElementById('create-group-name').value.trim();
            if (name) {
                const user = window.Auth.getCurrentUser();
                const group = window.DB.createGroup(name, user.id);
                this.activeGroup = group;
                this.renderActiveGroup();
            }
        });

        document.getElementById('btn-join-group').addEventListener('click', () => {
            const groupId = document.getElementById('join-group-id').value.trim().toUpperCase();
            if (groupId) {
                try {
                    const user = window.Auth.getCurrentUser();
                    const group = window.DB.joinGroup(groupId, user.id);
                    this.activeGroup = group;
                    this.renderActiveGroup();
                } catch(e) {
                    window.app.showTopBanner(e.message, 'danger');
                }
            }
        });
    }

    renderActiveGroup() {
        const user = window.Auth.getCurrentUser();
        
        let membersHtml = '';
        // Mock members if only one user is in group to show visual UI
        let displayMembers = [...this.activeGroup.members];
        if (displayMembers.length === 1) {
            displayMembers.push({userId: 'mock1', joinedAt: new Date().toISOString(), name: "Elena (Mock)", isMock: true});
            displayMembers.push({userId: 'mock2', joinedAt: new Date().toISOString(), name: "James (Mock)", isMock: true});
        }

        displayMembers.forEach(m => {
            const isMe = m.userId === user.id;
            const name = isMe ? "You" : (m.name || `User ${m.userId.substring(0,4)}`);
            membersHtml += `
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid var(--bg-tertiary);">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="background: var(--accent-color); color: var(--bg-primary); width: 32px; height: 32px; border-radius: 50%; display: flex; justify-content: center; align-items: center; font-weight: bold;">
                            ${name[0]}
                        </div>
                        <span style="${isMe ? 'font-weight:bold' : ''}">${name}</span>
                    </div>
                    <div style="color: var(--safe-color); font-size: 0.8rem;"><i class="fas fa-signal"></i> Active</div>
                </div>
            `;
        });

        this.viewElement.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <h2 style="margin: 0;">${this.activeGroup.name}</h2>
                <span style="background: var(--bg-tertiary); padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; font-family: monospace;">CODE: ${this.activeGroup.id}</span>
            </div>
            
            <div class="card">
                <h3 style="margin-bottom: 15px; display: flex; justify-content: space-between;">
                    Members
                    <span style="font-size: 0.8rem; color: var(--text-secondary); font-weight: normal;">${displayMembers.length} Total</span>
                </h3>
                ${membersHtml}
            </div>
            
            <button id="btn-show-group-map" class="btn btn-primary">
                <i class="fas fa-map-marked-alt"></i> Locate Members on Map
            </button>
            <button id="btn-leave-group" class="btn btn-secondary" style="margin-top: 10px; border-color: var(--danger-color); color: var(--danger-color);">
                Leave Group
            </button>
        `;

        document.getElementById('btn-show-group-map').addEventListener('click', () => {
            this.plotMockMembersOnMap();
            window.app.navigate('map');
        });

        document.getElementById('btn-leave-group').addEventListener('click', () => {
            // Simplified leave mechanism
            this.activeGroup = null;
            this.renderNoGroup();
        });
    }

    plotMockMembersOnMap() {
        if (!window.MapController || !window.MapController.map) return;
        
        const loc = window.MapController.getCurrentLocation();
        if (!loc) {
            window.app.showTopBanner('Wait for GPS lock to locate members relative to you.', 'warning');
            return;
        }

        // Clean old
        Object.values(this.groupMarkers).forEach(m => window.MapController.map.removeLayer(m));
        this.groupMarkers = {};

        const generateOffset = () => (Math.random() - 0.5) * 0.003; // Close grouping

        const mocks = [
            { id: 'mock1', name: "Elena", lat: loc.latitude + generateOffset(), lng: loc.longitude + generateOffset() },
            { id: 'mock2', name: "James", lat: loc.latitude + generateOffset(), lng: loc.longitude + generateOffset() }
        ];

        mocks.forEach(m => {
            const customIcon = L.divIcon({
                className: 'custom-group-marker',
                html: `<div style="background-color: #9b59b6; width: 28px; height: 28px; border-radius: 50%; border: 2px solid white; display: flex; justify-content: center; align-items: center; color: white; font-size: 12px; font-weight: bold; box-shadow: var(--card-shadow);">${m.name[0]}</div>`,
                iconSize: [28, 28],
                iconAnchor: [14, 14]
            });

            const marker = L.marker([m.lat, m.lng], { icon: customIcon }).addTo(window.MapController.map)
                .bindPopup(`<b>${m.name}</b><br>Group Member`);
                
            this.groupMarkers[m.id] = marker;
        });
        
        // Setup Map View so markers fit (crude method)
        window.MapController.map.setView([loc.latitude, loc.longitude], 15);
        window.app.showTopBanner('Group members located!', 'safe', 3000);
    }
    
    notifySOSActive() {
        if (this.activeGroup) {
            // In a real app this issues a push notification to members
            console.log(`SOS Alert sent to Group ${this.activeGroup.id}`);
        }
    }
}

window.GroupController = new GroupModule();
