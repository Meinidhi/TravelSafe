/**
 * Group Module
 */
class GroupModule {
    constructor() {
        this.viewElement = document.getElementById('view-group');
        this.activeGroup = null;
        this.groupMarkers = {};
        this.knownSOSStates = {};
    }

    async render() {
        const user = window.Auth.getCurrentUser();
        if (!user) return;

        try {
            const groups = await window.DB.getUserGroups(user.id);
            
            if (groups.length > 0) {
                this.activeGroup = groups[0]; // just load the first one for demo
                this.renderActiveGroup();
            } else {
                this.renderNoGroup();
            }
        } catch(e) {
            console.error("Failed to fetch groups", e);
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

        document.getElementById('btn-create-group').addEventListener('click', async () => {
            const name = document.getElementById('create-group-name').value.trim();
            const btn = document.getElementById('btn-create-group');
            if (name) {
                btn.disabled = true;
                btn.textContent = 'Creating...';
                try {
                    const user = window.Auth.getCurrentUser();
                    const group = await window.DB.createGroup(name, user.id);
                    this.activeGroup = group;
                    this.renderActiveGroup();
                } catch(e) {
                    window.app.showTopBanner(e.message, 'danger');
                    btn.disabled = false;
                    btn.textContent = 'Create';
                }
            }
        });

        document.getElementById('btn-join-group').addEventListener('click', async () => {
            const groupId = document.getElementById('join-group-id').value.trim();
            const btn = document.getElementById('btn-join-group');
            if (groupId) {
                btn.disabled = true;
                btn.textContent = 'Joining...';
                try {
                    const user = window.Auth.getCurrentUser();
                    const group = await window.DB.joinGroup(groupId, user.id);
                    this.activeGroup = group;
                    this.renderActiveGroup();
                } catch(e) {
                    window.app.showTopBanner(e.message, 'danger');
                    btn.disabled = false;
                    btn.textContent = 'Join';
                }
            }
        });
    }

    renderActiveGroup() {
        const user = window.Auth.getCurrentUser();
        
        // Clean up previous listener if exists
        if (this.unsubscribeMembers) {
            this.unsubscribeMembers();
        }

        // Set up real-time listener for group members' profiles and locations
        this.unsubscribeMembers = window.DB.listenToGroupMembers(this.activeGroup.members, (membersData) => {
            let membersHtml = '';
            
            membersData.forEach(m => {
                const isMe = m.id === user.id;
                const displayName = isMe ? "You" : (m.name || `User ${m.id.substring(0,4)}`);
                const escapedName = window.escapeHtml(displayName);
                
                // Check SOS state
                if (m.isSOSActive) {
                    if (!this.knownSOSStates[m.id] && !isMe) {
                        window.app.showTopBanner(`${displayName} triggered an SOS!`, 'danger', 15000);
                    }
                    this.knownSOSStates[m.id] = true;
                } else {
                    if (this.knownSOSStates[m.id]) {
                        if (!isMe) window.app.showTopBanner(`${displayName} is safe now.`, 'safe', 5000);
                    }
                    this.knownSOSStates[m.id] = false;
                }

                // Determine online/active status based on last location update
                let statusHtml = '<span style="color: var(--text-secondary); font-size: 0.8rem;">Unknown</span>';
                if (m.isSOSActive) {
                    statusHtml = '<div style="color: var(--danger-color); font-size: 0.8rem; font-weight: bold; animation: pulse 1.5s infinite;"><i class="fas fa-exclamation-triangle"></i> SOS ACTIVE</div>';
                } else if (m.location && m.location.timestamp) {
                    const diffMins = (new Date() - new Date(m.location.timestamp)) / 60000;
                    if (diffMins < 5) {
                        statusHtml = '<div style="color: var(--safe-color); font-size: 0.8rem;"><i class="fas fa-signal"></i> Active</div>';
                    } else {
                        statusHtml = `<div style="color: var(--warning-color); font-size: 0.8rem;"><i class="far fa-clock"></i> ${Math.floor(diffMins)}m ago</div>`;
                    }
                }
                
                membersHtml += `
                    <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid var(--bg-tertiary);">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div style="background: var(--accent-color); color: var(--bg-primary); width: 32px; height: 32px; border-radius: 50%; display: flex; justify-content: center; align-items: center; font-weight: bold;">
                                ${escapedName[0].toUpperCase()}
                            </div>
                            <span style="${isMe ? 'font-weight:bold' : ''}">${escapedName}</span>
                        </div>
                        ${statusHtml}
                    </div>
                `;
            });

            const escapedGroupName = window.escapeHtml(this.activeGroup.name);
            const escapedGroupId = window.escapeHtml(this.activeGroup.id);

            this.viewElement.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <h2 style="margin: 0;">${escapedGroupName}</h2>
                    <span style="background: var(--bg-tertiary); padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; font-family: monospace;">CODE: ${escapedGroupId}</span>
                </div>
                
                <div class="card">
                    <h3 style="margin-bottom: 15px; display: flex; justify-content: space-between;">
                        Members
                        <span style="font-size: 0.8rem; color: var(--text-secondary); font-weight: normal;">${membersData.length} Total</span>
                    </h3>
                    ${membersHtml}
                </div>
                
                <button id="btn-show-group-map" class="btn btn-primary">
                    <i class="fas fa-map-marked-alt"></i> View Members on Map
                </button>
                <button id="btn-leave-group" class="btn btn-secondary" style="margin-top: 10px; border-color: var(--danger-color); color: var(--danger-color);">
                    Leave Group
                </button>
            `;

            document.getElementById('btn-show-group-map').addEventListener('click', () => {
                window.app.navigate('map');
            });

            document.getElementById('btn-leave-group').addEventListener('click', async () => {
                const btn = document.getElementById('btn-leave-group');
                btn.disabled = true;
                btn.textContent = 'Leaving...';
                
                try {
                    const user = window.Auth.getCurrentUser();
                    if (user && this.activeGroup) {
                        await window.DB.leaveGroup(this.activeGroup.id, user.id);
                    }
                    
                    if (this.unsubscribeMembers) this.unsubscribeMembers();
                    this.activeGroup = null;
                    // Also clean up map markers
                    if (window.MapController) window.MapController.updateGroupMarkers([]);
                    this.renderNoGroup();
                    
                    if (window.app) {
                        window.app.showTopBanner('Successfully left the group', 'safe', 3000);
                    }
                } catch(e) {
                    console.error("Failed to leave group:", e);
                    if (window.app) {
                        window.app.showTopBanner(e.message || 'Failed to leave group. Check connection.', 'danger');
                    }
                    btn.disabled = false;
                    btn.textContent = 'Leave Group';
                }
            });

            // Push member data to the map controller to update live locations
            if (window.MapController) {
                window.MapController.updateGroupMarkers(membersData);
            }
        });
    }

    // plotMockMembersOnMap removed as we now use real-time Firebase tracking
    
    notifySOSActive() {
        if (this.activeGroup) {
            // In a real app this issues a push notification to members
            console.log(`SOS Alert sent to Group ${this.activeGroup.id}`);
        }
    }
}

window.GroupController = new GroupModule();
