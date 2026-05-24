/**
 * Database client connecting to Firebase Firestore.
 * Retains offline queuing for resilience/compatibility with UI.
 */

// Global XSS Sanitization Helper
window.escapeHtml = function(string) {
    if (string === null || string === undefined) return '';
    return String(string)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
};

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
                    const docRef = window.db.collection('incidents').doc(task.data.id);
                    const docSnap = await docRef.get();
                    if (!docSnap.exists) {
                        await docRef.set(task.data);
                    }
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
            const snapshot = await window.db.collection('incidents')
                .orderBy('timestamp', 'desc')
                .limit(50)
                .get();
            const incidents = [];
            snapshot.forEach(doc => {
                incidents.push(doc.data());
            });
            return incidents;
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
            
            await groupRef.update({
                members: firebase.firestore.FieldValue.arrayUnion(userId)
            });
            
            const updatedDoc = await groupRef.get();
            return { id: updatedDoc.id, ...updatedDoc.data() };
        } catch(e) {
            console.error("Error joining group:", e);
            throw new Error(e.message || "Failed to join group");
        }
    }

    async leaveGroup(groupId, userId) {
        try {
            const groupRef = window.db.collection('groups').doc(groupId);
            await groupRef.update({
                members: firebase.firestore.FieldValue.arrayRemove(userId)
            });
            return true;
        } catch(e) {
            console.error("Error leaving group:", e);
            throw new Error(e.message || "Failed to leave group");
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
    async updateLocation(userId, lat, lng, accuracy = null, isCalibrated = false) {
        if (!userId) return;
        try {
            await window.db.collection('users').doc(userId).set({
                location: { lat, lng, accuracy, isCalibrated, timestamp: new Date().toISOString() }
            }, { merge: true });
        } catch(e) {
            console.error("Error updating location:", e);
        }
    }

    async setSOSStatus(userId, isActive) {
        if (!userId) return;
        try {
            await window.db.collection('users').doc(userId).set({
                isSOSActive: isActive,
                sosTimestamp: isActive ? new Date().toISOString() : null
            }, { merge: true });
        } catch(e) {
            console.error("Error updating SOS status:", e);
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

    async sendGroupMessage(groupId, senderId, senderName, text) {
        if (!groupId) return;
        try {
            await window.db.collection('groups').doc(groupId).collection('messages').add({
                senderId,
                senderName,
                text,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch(e) {
            console.error("Error sending group message:", e);
            throw e;
        }
    }

    listenToGroupMessages(groupId, callback) {
        if (!groupId) return () => {};
        return window.db.collection('groups').doc(groupId).collection('messages')
            .orderBy('timestamp', 'asc')
            .onSnapshot((snapshot) => {
                const messages = [];
                snapshot.forEach(doc => {
                    messages.push({ id: doc.id, ...doc.data() });
                });
                callback(messages);
            }, error => {
                console.error("Error listening to group messages:", error);
            });
    }

    async setUserTypingStatus(groupId, userId, userName, isTyping) {
        if (!groupId || !userId) return;
        try {
            const typingRef = window.db.collection('groups').doc(groupId).collection('typing').doc(userId);
            if (isTyping) {
                await typingRef.set({
                    name: userName,
                    isTyping: true,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                });
            } else {
                await typingRef.delete();
            }
        } catch(e) {
            console.error("Error setting typing status:", e);
        }
    }

    listenToTypingStatus(groupId, callback) {
        if (!groupId) return () => {};
        return window.db.collection('groups').doc(groupId).collection('typing')
            .onSnapshot((snapshot) => {
                const typingUsers = [];
                const currentUserId = (window.Auth && window.Auth.getCurrentUser()) ? window.Auth.getCurrentUser().id : '';
                const nowMs = Date.now();
                snapshot.forEach(doc => {
                    const data = doc.data();
                    if (data && data.isTyping && doc.id !== currentUserId) {
                        // Check if typing indicator has expired (older than 10 seconds)
                        let isFresh = true;
                        if (data.timestamp) {
                            const tsMs = (data.timestamp.toMillis ? data.timestamp.toMillis() : new Date(data.timestamp).getTime());
                            if (nowMs - tsMs > 10000) {
                                isFresh = false;
                            }
                        }
                        if (isFresh) {
                            typingUsers.push({ id: doc.id, name: data.name });
                        }
                    }
                });
                callback(typingUsers);
            }, error => {
                console.error("Error listening to typing status:", error);
            });
    }
}

// Global DB instance
window.DB = new DatabaseClient();
