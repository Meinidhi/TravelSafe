/**
 * Chatbot Module
 */
class ChatbotModule {
    constructor() {
        this.viewElement = document.getElementById('view-chat');
    }

    render() {
        this.viewElement.innerHTML = `
            <h2>Safety Assistant</h2>
            <div id="chat-window" class="card" style="height: 60vh; display: flex; flex-direction: column; padding: 10px;">
                <div id="chat-messages" style="flex-grow: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; padding-bottom: 20px;">
                    <div class="chat-msg bot-msg" style="align-self: flex-start; background: var(--bg-tertiary); padding: 10px 15px; border-radius: 15px 15px 15px 0; max-width: 80%;">
                        Hi! I'm your virtual safety assistant. What do you need help with? Select an option below.
                    </div>
                </div>
                
                <div id="chat-quick-replies" style="display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px;">
                    <button class="btn btn-secondary chip-btn" style="flex: 1 1 45%; padding: 10px;" data-reply="hospital">Find Hospital</button>
                    <button class="btn btn-secondary chip-btn" style="flex: 1 1 45%; padding: 10px;" data-reply="police">Call Police</button>
                    <button class="btn btn-secondary chip-btn" style="flex: 1 1 45%; padding: 10px;" data-reply="tips">Safety Tips</button>
                    <button class="btn btn-secondary chip-btn" style="flex: 1 1 45%; padding: 10px;" data-reply="lost">Lost Item</button>
                </div>
            </div>
        `;

        document.querySelectorAll('.chip-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const topic = e.target.getAttribute('data-reply');
                this.addMessage(e.target.innerText, 'user');
                
                // Disable chips briefly
                const chips = document.querySelectorAll('.chip-btn');
                chips.forEach(c => c.disabled = true);
                
                setTimeout(() => {
                    this.processReply(topic);
                    chips.forEach(c => c.disabled = false);
                }, 600);
            });
        });
    }

    addMessage(text, sender) {
        const msgList = document.getElementById('chat-messages');
        const msgDiv = document.createElement('div');
        
        if (sender === 'user') {
            msgDiv.style = "align-self: flex-end; background: var(--accent-color); color: var(--bg-primary); padding: 10px 15px; border-radius: 15px 15px 0 15px; max-width: 80%;";
        } else {
            msgDiv.style = "align-self: flex-start; background: var(--bg-tertiary); color: var(--text-primary); padding: 10px 15px; border-radius: 15px 15px 15px 0; max-width: 80%;";
        }
        
        msgDiv.textContent = text;
        msgList.appendChild(msgDiv);
        msgList.scrollTop = msgList.scrollHeight;
    }

    processReply(topic) {
        const responses = {
            'hospital': 'There are hospitals nearby tracked on the map. The closest is City General Hospital. Please access the map and click on the red cross marker to navigate.',
            'police': 'The nearest station is Central Police Station. Do you want me to escalate and deploy a dispatch team or are you safe?',
            'tips': 'Stay in well-lit areas at night, keep your belongings secure against your body, and avoid isolated alleys. Need more localized tips?',
            'lost': 'Check around you first. If you firmly lost your passport, contact your embassy immediately. For baggage, check with local tourist police.'
        };

        const response = responses[topic] || "I don't have information on that. Please select a predefined quick reply.";
        this.addMessage(response, 'bot');
    }
}

window.ChatController = new ChatbotModule();
