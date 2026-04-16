class ChatManager {
    constructor() {
        this.container = document.getElementById('chat-container');
        this.messages = document.getElementById('chat-messages');
        this.input = document.getElementById('chat-input');
        this.toggleBtn = document.getElementById('chat-toggle');
        this.isVisible = false;
        this.socket = null;
        this.playerName = "";
        this.entityManager = null;
        this.lastMessages = []; // Timestamps das últimas mensagens

        this.initListeners();
    }

    setSocket(socket, name, entityManager) {
        this.socket = socket;
        this.playerName = name;
        this.entityManager = entityManager;
        
        this.socket.on('chat_message', (data) => {
            this.addMessage(data.name, data.text, data.color);
            
            // Mostrar balão 3D
            if (this.entityManager) {
                // Se for a minha mensagem, o ID é 'me'
                const senderId = (data.senderId === this.socket.id) ? 'me' : data.senderId;
                this.entityManager.showBubble(senderId, data.text);
            }
        });
    }

    initListeners() {
        if (this.toggleBtn) {
            this.toggleBtn.addEventListener('click', () => this.toggle());
        }

        if (this.input) {
            this.input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    this.send();
                    this.blur();
                }
                e.stopPropagation();
            });
        }
    }

    toggle() {
        if (this.isVisible) this.blur();
        else this.focus();
    }

    focus() {
        if (!this.container) return;
        this.container.classList.add('active');
        this.input.focus();
        this.isVisible = true;
    }

    blur() {
        if (!this.container) return;
        this.container.classList.remove('active');
        this.input.blur();
        this.input.value = "";
        this.isVisible = false;
    }

    send() {
        const now = Date.now();
        const text = this.input.value.trim();
        
        // 1. Limpeza de timestamps antigos (> 2s)
        this.lastMessages = this.lastMessages.filter(t => now - t < 2000);

        // 2. Anti-Spam (Máx 3 em 2s)
        if (this.lastMessages.length >= 3) {
            this.addMessage("SISTEMA", "Muitas mensagens! Aguarde um momento.", "#ff4d4d");
            return;
        }

        if (text && this.socket) {
            this.socket.emit('send_chat', {
                text: text
            });
            this.lastMessages.push(now);
        }
    }

    addMessage(name, text, color = "#fff") {
        if (!this.messages) return;
        const msgDiv = document.createElement('div');
        msgDiv.className = 'chat-msg';
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'chat-name';
        nameSpan.innerText = `${name}: `;
        nameSpan.style.color = color;

        const textSpan = document.createElement('span');
        textSpan.innerText = text;

        msgDiv.appendChild(nameSpan);
        msgDiv.appendChild(textSpan);
        this.messages.appendChild(msgDiv);

        this.messages.scrollTop = this.messages.scrollHeight;

        if (this.messages.children.length > 50) {
            this.messages.removeChild(this.messages.firstChild);
        }
    }
}

export const Chat = new ChatManager();
