/**
 * Mock Database module utilizing localStorage to simulate backend operations
 */
class DatabaseMock {
    constructor() {
        this.tables = {
            users: 'db_users',
            incidents: 'db_incidents',
            groups: 'db_groups',
            offlineQueue: 'db_offline_queue'
        };
        this.init();
    }

    init() {
        for (const [key, value] of Object.entries(this.tables)) {
            if (!localStorage.getItem(value)) {
                localStorage.setItem(value, JSON.stringify([]));
            }
        }
    }

    getTable(tableName) {
        return JSON.parse(localStorage.getItem(this.tables[tableName]) || '[]');
    }

    saveTable(tableName, data) {
        localStorage.setItem(this.tables[tableName], JSON.stringify(data));
    }

    // --- Users ---
    createUser(userData) {
        const users = this.getTable('users');
        if (users.find(u => u.email === userData.email)) {
            throw new Error("Email already registered");
        }
        userData.id = 'usr_' + Date.now().toString(36) + Math.random().toString(36).substr(2);
        userData.createdAt = new Date().toISOString();
        users.push(userData);
        this.saveTable('users', users);
        return userData;
    }

    findUserByEmail(email) {
        return this.getTable('users').find(u => u.email === email);
    }
    
    findUserById(id) {
        return this.getTable('users').find(u => u.id === id);
    }

    updateUser(id, updates) {
        const users = this.getTable('users');
        const idx = users.findIndex(u => u.id === id);
        if (idx !== -1) {
            users[idx] = { ...users[idx], ...updates };
            this.saveTable('users', users);
            return users[idx];
        }
        throw new Error("User not found");
    }

    // --- Offline Queuing System ---
    queueOperation(operation, data) {
        const queue = this.getTable('offlineQueue');
        queue.push({
            id: Date.now(),
            operation,
            data,
            timestamp: new Date().toISOString()
        });
        this.saveTable('offlineQueue', queue);
    }

    syncOfflineData() {
        const queue = this.getTable('offlineQueue');
        if (queue.length === 0) return;
        
        console.log(`Syncing ${queue.length} offline operations...`);
        // Process sequentially
        for (let task of queue) {
            try {
                if (task.operation === 'saveLocation') {
                    // Ignore, simulate location sent to backend
                } else if (task.operation === 'saveIncident') {
                    this.saveIncidentLive(task.data);
                }
            } catch(e) {
                console.error("Failed to sync task", task, e);
            }
        }
        
        // Clear queue
        this.saveTable('offlineQueue', []);
        
        if (window.app && window.app.showTopBanner) {
            window.app.showTopBanner('Data synchronized with server', 'safe', 3000);
        }
    }

    saveIncidentLive(incidentData) {
        const incidents = this.getTable('incidents');
        incidents.push(incidentData);
        this.saveTable('incidents', incidents);
    }

    // --- Incidents / SOS ---
    saveIncident(incidentData, isOffline) {
        incidentData.id = 'inc_' + Date.now().toString();
        incidentData.timestamp = new Date().toISOString();
        
        if (isOffline) {
            this.queueOperation('saveIncident', incidentData);
            return [incidentData, true]; // delayed
        } else {
            this.saveIncidentLive(incidentData);
            return [incidentData, false]; // immediate
        }
    }
    
    getIncidents() {
        return this.getTable('incidents');
    }

    // --- Groups ---
    createGroup(name, creatorId) {
        const groups = this.getTable('groups');
        const groupId = Math.random().toString(36).substring(2, 8).toUpperCase(); 
        const group = {
            id: groupId,
            name: name,
            members: [{ userId: creatorId, joinedAt: new Date().toISOString() }],
            createdAt: new Date().toISOString()
        };
        groups.push(group);
        this.saveTable('groups', groups);
        return group;
    }

    joinGroup(groupId, userId) {
        const groups = this.getTable('groups');
        const group = groups.find(g => g.id === groupId);
        if (!group) throw new Error("Group not found");
        
        if (!group.members.find(m => m.userId === userId)) {
            group.members.push({ userId, joinedAt: new Date().toISOString() });
            this.saveTable('groups', groups);
        }
        return group;
    }

    getUserGroups(userId) {
        return this.getTable('groups').filter(g => g.members.some(m => m.userId === userId));
    }
}

// Global DB instance
window.DB = new DatabaseMock();
