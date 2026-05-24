/**
 * Group Chat Module
 * Manages real-time group chat communication, dynamic typing indicators,
 * and interactive member location mapping.
 */
class GroupChatModule {
    constructor() {
        this.viewElement = document.getElementById('view-chat');
        this.activeGroup = null;
        this.unsubscribeMessages = null;
        this.unsubscribeTyping = null;
        this.typingTimeout = null;
        this.isTypingState = false;
        this.lastMessageTime = 0; // Rate throttling tracker

        // Auto-cleanup typing state when browser tab closes or unloads
        window.addEventListener('beforeunload', () => this.stopTyping());
        window.addEventListener('unload', () => this.stopTyping());
    }

    async render() {
        const user = window.Auth.getCurrentUser();
        if (!user) {
            this.viewElement.innerHTML = `
                <div class="card glass" style="text-align: center; padding: 30px;">
                    <h3>Please login to start chatting</h3>
                </div>
            `;
            return;
        }

        // Get the active group from GroupController if available
        let activeGroup = window.GroupController ? window.GroupController.activeGroup : null;
        
        // Fallback to fetch groups from DB if not loaded in GroupController
        if (!activeGroup) {
            try {
                const groups = await window.DB.getUserGroups(user.id);
                if (groups && groups.length > 0) {
                    activeGroup = groups[0];
                    if (window.GroupController) {
                        window.GroupController.activeGroup = activeGroup;
                    }
                }
            } catch (e) {
                console.error("Error retrieving user groups for chat:", e);
            }
        }

        this.activeGroup = activeGroup;

        if (!this.activeGroup) {
            this.viewElement.innerHTML = `
                <h2>Group Chat</h2>
                <div class="card glass" style="text-align: center; padding: 40px; display: flex; flex-direction: column; align-items: center; gap: 15px;">
                    <div style="background: rgba(255, 255, 255, 0.05); width: 60px; height: 60px; border-radius: 50%; display: flex; justify-content: center; align-items: center; font-size: 1.8rem; color: var(--text-secondary);">
                        <i class="fas fa-comments"></i>
                    </div>
                    <h3>No Active Group Chat</h3>
                    <p style="color: var(--text-secondary); max-width: 300px; margin: 0 auto 10px; font-size: 0.95rem;">
                        Please create or join a travel group in the **Group** tab to enable real-time messaging with your group members.
                    </p>
                    <button class="btn btn-primary" onclick="window.app.navigate('group')">
                        <i class="fas fa-users"></i> Go to Travel Groups
                    </button>
                </div>
            `;
            return;
        }

        // Active Group found - render interface
        const escapedGroupName = window.escapeHtml(this.activeGroup.name);
        this.viewElement.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <h2 style="margin: 0;">Group Chat</h2>
                <span style="background: var(--bg-tertiary); padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; font-family: monospace;">Group: ${escapedGroupName}</span>
            </div>
            
            <div id="chat-window" class="card" style="height: 60vh; display: flex; flex-direction: column; padding: 15px; background: rgba(30, 30, 40, 0.4); border: 1px solid var(--border-color); backdrop-filter: blur(10px);">
                <div id="chat-messages" style="flex-grow: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; padding-bottom: 10px; scroll-behavior: smooth;">
                    <div style="text-align: center; color: var(--text-secondary); font-size: 0.9rem; padding: 20px 0;">
                        <i class="fas fa-spinner fa-spin"></i> Loading group messages...
                    </div>
                </div>
                
                <div id="chat-typing-indicator" style="height: 20px; font-size: 0.85rem; color: var(--accent-color); font-style: italic; padding-left: 5px; margin-bottom: 5px; opacity: 0; transition: opacity 0.3s ease;">
                    <!-- Typing state display banner -->
                </div>
                
                <div style="display: flex; gap: 10px; align-items: center;">
                    <input type="text" id="chat-input" placeholder="Type a message..." style="flex-grow: 1; background: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-primary); padding: 12px 15px; border-radius: 20px; font-size: 0.95rem; outline: none; transition: border-color 0.2s;" autocomplete="off">
                    <button id="btn-send-message" class="btn btn-primary" style="border-radius: 50%; width: 44px; height: 44px; display: flex; justify-content: center; align-items: center; padding: 0;">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                </div>
            </div>
            
            <!-- Member Action Glassmorphism Popover Modal -->
            <div id="member-action-modal" class="modal-overlay" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); backdrop-filter: blur(8px); z-index: 2000; justify-content: center; align-items: center;">
                <div class="card glass" style="width: 90%; max-width: 320px; padding: 25px; text-align: center; border: 1px solid var(--border-color); border-radius: 16px; background: rgba(20, 20, 30, 0.85); box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);">
                    <div id="modal-member-avatar" style="background: var(--accent-color); color: var(--bg-primary); width: 60px; height: 60px; border-radius: 50%; display: flex; justify-content: center; align-items: center; font-size: 1.5rem; font-weight: bold; margin: 0 auto 15px;"></div>
                    <h3 id="modal-member-name" style="margin-bottom: 20px; color: var(--text-primary);">Member Name</h3>
                    <button id="modal-btn-view-map" class="btn btn-primary" style="width: 100%; margin-bottom: 12px; display: flex; align-items: center; justify-content: center; gap: 8px;">
                        <i class="fas fa-map-marked-alt"></i> View Location on Map
                    </button>
                    <button id="modal-btn-close" class="btn btn-secondary" style="width: 100%; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--border-color); color: var(--text-secondary);">Close</button>
                </div>
            </div>
        `;

        this.setupChatActions();
        this.listenToMessages(this.activeGroup.id);
        this.listenToTyping(this.activeGroup.id);
    }

    setupChatActions() {
        const inputEl = document.getElementById('chat-input');
        const sendBtn = document.getElementById('btn-send-message');
        const modalEl = document.getElementById('member-action-modal');
        const modalCloseBtn = document.getElementById('modal-btn-close');
        
        if (sendBtn && inputEl) {
            const sendMessage = async () => {
                const now = Date.now();
                if (now - this.lastMessageTime < 800) {
                    window.app.showTopBanner('Spam prevention: sending too fast!', 'warning', 2000);
                    return;
                }

                const text = inputEl.value.trim();
                if (!text) return;
                
                this.lastMessageTime = now;
                sendBtn.disabled = true;
                inputEl.value = '';
                
                try {
                    const user = window.Auth.getCurrentUser();
                    this.stopTyping();
                    await window.DB.sendGroupMessage(this.activeGroup.id, user.id, user.name || 'User', text);
                } catch(e) {
                    console.error("Failed to send group message:", e);
                    window.app.showTopBanner('Failed to send message. Check connection.', 'danger');
                } finally {
                    sendBtn.disabled = false;
                    inputEl.focus();
                }
            };
            
            sendBtn.addEventListener('click', sendMessage);
            inputEl.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    sendMessage();
                }
            });
        }

        // Keystroke monitor for typing indicators
        this.handleTypingIndicator();

        // Popover Modal Close Listeners
        if (modalCloseBtn && modalEl) {
            modalCloseBtn.addEventListener('click', () => {
                modalEl.style.display = 'none';
            });
            modalEl.addEventListener('click', (e) => {
                if (e.target === modalEl) {
                    modalEl.style.display = 'none';
                }
            });
        }
    }

    handleTypingIndicator() {
        const inputEl = document.getElementById('chat-input');
        if (!inputEl) return;

        inputEl.addEventListener('input', () => {
            const user = window.Auth.getCurrentUser();
            if (!user || !this.activeGroup) return;

            if (!this.isTypingState) {
                this.isTypingState = true;
                window.DB.setUserTypingStatus(this.activeGroup.id, user.id, user.name || 'User', true);
            }

            clearTimeout(this.typingTimeout);
            this.typingTimeout = setTimeout(() => {
                this.stopTyping();
            }, 2500);
        });
    }

    stopTyping() {
        const user = window.Auth.getCurrentUser();
        if (user && this.activeGroup && this.isTypingState) {
            this.isTypingState = false;
            window.DB.setUserTypingStatus(this.activeGroup.id, user.id, user.name || 'User', false);
        }
        clearTimeout(this.typingTimeout);
        this.typingTimeout = null;
    }

    listenToMessages(groupId) {
        if (this.unsubscribeMessages) {
            this.unsubscribeMessages();
        }

        const msgList = document.getElementById('chat-messages');
        const currentUser = window.Auth.getCurrentUser();

        // Wire container event delegation for member name clicks
        if (msgList) {
            msgList.addEventListener('click', (e) => {
                const target = e.target.closest('.chat-sender-name');
                if (target) {
                    const senderId = target.getAttribute('data-sender-id');
                    const senderName = target.textContent.trim();
                    this.openMemberActionModal(senderId, senderName);
                }
            });
        }

        this.unsubscribeMessages = window.DB.listenToGroupMessages(groupId, (messages) => {
            if (!msgList) return;
            
            if (messages.length === 0) {
                msgList.innerHTML = `
                    <div style="text-align: center; color: var(--text-secondary); font-size: 0.95rem; padding: 40px 10px;">
                        <i class="far fa-comments" style="font-size: 1.5rem; margin-bottom: 8px; display: block; color: var(--text-secondary);"></i>
                        No messages yet. Send a message to start the conversation!
                    </div>
                `;
                return;
            }

            msgList.innerHTML = '';
            messages.forEach(msg => {
                const isMe = msg.senderId === currentUser.id;
                const msgDiv = document.createElement('div');
                const displayName = isMe ? "You" : (msg.senderName || "User");
                const escapedName = window.escapeHtml(displayName);
                const escapedText = window.escapeHtml(msg.text);

                msgDiv.style = "display: flex; flex-direction: column; max-width: 80%; width: max-content; margin-bottom: 2px;";
                
                if (isMe) {
                    msgDiv.style.alignSelf = "flex-end";
                    msgDiv.style.alignItems = "flex-end";
                    msgDiv.innerHTML = `
                        <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 4px; padding-right: 5px;">${escapedName}</div>
                        <div style="background: var(--accent-color); color: var(--bg-primary); padding: 10px 15px; border-radius: 15px 15px 0 15px; font-size: 0.95rem; word-break: break-word;">
                            ${escapedText}
                        </div>
                    `;
                } else {
                    msgDiv.style.alignSelf = "flex-start";
                    msgDiv.style.alignItems = "flex-start";
                    msgDiv.innerHTML = `
                        <div class="chat-sender-name" data-sender-id="${msg.senderId}" style="font-size: 0.75rem; color: var(--accent-color); margin-bottom: 4px; padding-left: 5px; cursor: pointer; font-weight: bold; transition: filter 0.2s;" onmouseover="this.style.filter='brightness(1.2)'" onmouseout="this.style.filter='none'">
                            ${escapedName}
                        </div>
                        <div style="background: var(--bg-tertiary); color: var(--text-primary); padding: 10px 15px; border-radius: 15px 15px 15px 0; border: 1px solid var(--border-color); font-size: 0.95rem; word-break: break-word;">
                            ${escapedText}
                        </div>
                    `;
                }
                msgList.appendChild(msgDiv);
            });
            
            // Auto scroll to bottom
            msgList.scrollTop = msgList.scrollHeight;
        });
    }

    listenToTyping(groupId) {
        if (this.unsubscribeTyping) {
            this.unsubscribeTyping();
        }

        const typingIndicatorEl = document.getElementById('chat-typing-indicator');

        this.unsubscribeTyping = window.DB.listenToTypingStatus(groupId, (typingUsers) => {
            if (!typingIndicatorEl) return;

            if (typingUsers.length === 0) {
                typingIndicatorEl.style.opacity = '0';
                typingIndicatorEl.textContent = '';
                return;
            }

            let text = '';
            if (typingUsers.length === 1) {
                text = `${window.escapeHtml(typingUsers[0].name)} is typing...`;
            } else if (typingUsers.length === 2) {
                text = `${window.escapeHtml(typingUsers[0].name)} & ${window.escapeHtml(typingUsers[1].name)} are typing...`;
            } else {
                text = 'Several members are typing...';
            }

            typingIndicatorEl.textContent = text;
            typingIndicatorEl.style.opacity = '1';
        });
    }

    async openMemberActionModal(memberId, memberName) {
        const modalEl = document.getElementById('member-action-modal');
        const avatarEl = document.getElementById('modal-member-avatar');
        const nameEl = document.getElementById('modal-member-name');
        const viewMapBtn = document.getElementById('modal-btn-view-map');
        
        if (!modalEl || !avatarEl || !nameEl || !viewMapBtn) return;
        
        avatarEl.textContent = (memberName && memberName.length > 0 ? memberName[0] : 'U').toUpperCase();
        nameEl.textContent = memberName;
        modalEl.style.display = 'flex';
        
        // Load member status asynchronously
        viewMapBtn.disabled = true;
        viewMapBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Fetching live location...`;
        
        try {
            const memberProfile = await window.DB.findUserById(memberId);
            if (memberProfile && memberProfile.location && typeof memberProfile.location.lat === 'number') {
                const { lat, lng } = memberProfile.location;
                viewMapBtn.disabled = false;
                viewMapBtn.innerHTML = `<i class="fas fa-map-marked-alt"></i> View Location on Map`;
                
                // Unbind previous listeners via cloning
                const newBtn = viewMapBtn.cloneNode(true);
                viewMapBtn.parentNode.replaceChild(newBtn, viewMapBtn);
                
                newBtn.addEventListener('click', () => {
                    modalEl.style.display = 'none';
                    this.viewMemberLocation(memberId, lat, lng);
                });
            } else {
                viewMapBtn.disabled = true;
                viewMapBtn.innerHTML = `<i class="fas fa-map-marker-alt"></i> Location Not Shared`;
                window.app.showTopBanner(`${memberName} has not shared their location yet.`, 'warning', 4000);
            }
        } catch(e) {
            console.error("Error opening member action modal:", e);
            viewMapBtn.disabled = true;
            viewMapBtn.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Fetch Failed`;
        }
    }

    viewMemberLocation(memberId, lat, lng) {
        window.app.navigate('map');
        setTimeout(() => {
            if (window.MapController && window.MapController.map) {
                // Force Leaflet context boundaries update
                window.MapController.map.invalidateSize();
                
                // Smooth transition viewport update
                window.MapController.map.setView([lat, lng], 17);
                
                // Toggle popover marker details
                const marker = window.MapController.groupMarkers[memberId];
                if (marker) {
                    marker.openPopup();
                }
            }
        }, 300);
    }

    cleanup() {
        console.log("Cleaning up Group Chat module snapshot listeners and typing indicators...");
        
        // 1. Wipe active typing state in database
        this.stopTyping();

        // 2. Unsubscribe from real-time database snapshot listeners
        if (this.unsubscribeMessages) {
            this.unsubscribeMessages();
            this.unsubscribeMessages = null;
        }

        if (this.unsubscribeTyping) {
            this.unsubscribeTyping();
            this.unsubscribeTyping = null;
        }

        // 3. Clear active reference pointers
        this.activeGroup = null;
    }
}

// Global active controller instance
window.ChatController = new GroupChatModule();
