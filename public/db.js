/**
 * Database client connecting to Firebase Firestore.
 * Retains offline queuing for resilience/compatibility with UI.
 */
class DatabaseClient {
    constructor() {
        // Only keep offlineQueue in local storage for legacy UI support
        if (!localStorage.getItem('db_offline_queue')) {
            localStorage.setItem('db_offline_queue', JSON.stringify([]));
        }
    }

    getOfflineQueue() {
        return JSON.parse(localStorage.getItem('db_offline_queue') || '[]');
    }

    saveOfflineQueue(queue) {
        localStorage.setItem('db_offline_queue', JSON.stringify(queue));
    }

    queueOperation(operation, data) {
        const queue = this.getOfflineQueue();
        queue.push({
            id: Date.now(),
            operation,
            data,
            timestamp: new Date().toISOString()
        });
        this.saveOfflineQueue(queue);
    }

    async syncOfflineData() {
        const queue = this.getOfflineQueue();
        if (queue.length === 0) return;
        
        console.log(`Syncing ${queue.length} offline operations to Firestore...`);
        const remainingQueue = [];
        
        for (let task of queue) {
            try {
                if (task.operation === 'saveIncident') {
                    await window.db.collection('incidents').doc(task.data.id).set(task.data);
                }
            } catch(e) {
                console.error("Failed to sync task", task, e);
                remainingQueue.push(task);
            }
        }
        
        this.saveOfflineQueue(remainingQueue);
        
        if (queue.length > remainingQueue.length && window.app && window.app.showTopBanner) {
            window.app.showTopBanner('Data synchronized with Firebase', 'safe', 3000);
        }
    }

    // --- Users ---
    async createUserProfile(userData) {
        // Create user profile in 'users' collection
        await window.db.collection('users').doc(userData.id).set(userData);
        return userData;
    }

    async updateUser(id, updates) {
        try {
            await window.db.collection('users').doc(id).set(updates, { merge: true });
            return true;
        } catch(e) {
            console.error("Error updating user:", e);
            throw e;
        }
    }

    async findUserById(id) {
        try {
            const doc = await window.db.collection('users').doc(id).get();
            if (doc.exists) {
                return { id: doc.id, ...doc.data() };
            }
            return null;
        } catch(e) {
            console.error("Error finding user:", e);
            return null;
        }
    }

    // --- Incidents / SOS ---
    async saveIncident(incidentData, isOffline) {
        incidentData.id = 'inc_' + Date.now().toString();
        incidentData.timestamp = new Date().toISOString();
        
        if (isOffline) {
            this.queueOperation('saveIncident', incidentData);
            return [incidentData, true]; // delayed
        } else {
            try {
                await window.db.collection('incidents').doc(incidentData.id).set(incidentData);
                return [incidentData, false]; // immediate
            } catch(e) {
                // If it fails due to network mid-save, queue it
                this.queueOperation('saveIncident', incidentData);
                return [incidentData, true];
            }
        }
    }
    
    async getIncidents() {
        try {
            const snapshot = await window.db.collection('incidents').get();
            const incidents = [];
            snapshot.forEach(doc => {
                incidents.push(doc.data());
            });
            // Sort by timestamp descending
            return incidents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        } catch(e) {
            console.error("Error getting incidents:", e);
            return [];
        }
    }

    // --- Groups ---
    async createGroup(name, creatorId) {
        try {
            const groupData = {
                name,
                creatorId,
                members: [creatorId], // Creator is automatically a member
                createdAt: new Date().toISOString()
            };
            
            const docRef = await window.db.collection('groups').add(groupData);
            return { id: docRef.id, ...groupData };
        } catch(e) {
            console.error("Error creating group:", e);
            throw new Error("Failed to create group");
        }
    }

    async joinGroup(groupId, userId) {
        try {
            const groupRef = window.db.collection('groups').doc(groupId);
            const doc = await groupRef.get();
            
            if (!doc.exists) {
                throw new Error("Group not found");
            }
            
            const groupData = doc.data();
            if (!groupData.members.includes(userId)) {
                groupData.members.push(userId);
                await groupRef.update({ members: groupData.members });
            }
            
            return { id: doc.id, ...groupData };
        } catch(e) {
            console.error("Error joining group:", e);
            throw new Error(e.message || "Failed to join group");
        }
    }

    async getUserGroups(userId) {
        try {
            const snapshot = await window.db.collection('groups')
                .where('members', 'array-contains', userId)
                .get();
                
            const groups = [];
            snapshot.forEach(doc => {
                groups.push({ id: doc.id, ...doc.data() });
            });
            return groups;
        } catch(e) {
            console.error("Error getting user groups:", e);
            return [];
        }
    }

    // --- Real-time Location ---
    async updateLocation(userId, lat, lng) {
        if (!userId) return;
        try {
            await window.db.collection('users').doc(userId).set({
                location: { lat, lng, timestamp: new Date().toISOString() }
            }, { merge: true });
        } catch(e) {
            console.error("Error updating location:", e);
        }
    }

    listenToGroupMembers(memberIds, callback) {
        if (!memberIds || memberIds.length === 0) return () => {};
        
        // Firestore 'in' query supports up to 30 elements
        const chunks = [];
        for (let i = 0; i < memberIds.length; i += 30) {
            chunks.push(memberIds.slice(i, i + 30));
        }
        
        // We only listen to the first chunk for simplicity in this demo (up to 30 members)
        const targetIds = chunks[0];
        
        return window.db.collection('users')
            .where(firebase.firestore.FieldPath.documentId(), 'in', targetIds)
            .onSnapshot((snapshot) => {
                const membersData = [];
                snapshot.forEach(doc => {
                    membersData.push({ id: doc.id, ...doc.data() });
                });
                callback(membersData);
            }, error => {
                console.error("Error listening to group members:", error);
            });
    }
}

// Global DB instance
window.DB = new DatabaseClient();
