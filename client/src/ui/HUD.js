class HUDManager {
    constructor() {
        this.healthBar = document.getElementById('health-bar');
        this.hungerBar = document.getElementById('hunger-bar');
        this.xpBar = document.getElementById('xp-bar');
        this.levelTxt = document.getElementById('level-txt');
        this.logContent = document.getElementById('log-content');
        this.loadingOverlay = null;
        this.createLoadingScreen();
    }

    createLoadingScreen() {
        this.loadingOverlay = document.createElement('div');
        this.loadingOverlay.id = 'loading-overlay';
        this.loadingOverlay.innerHTML = `
            <div class="loading-box">
                <h2 style="color: #fff; font-family: 'Press Start 2P', cursive; font-size: 14px;">CARREGANDO ASSETS</h2>
                <div class="bar-bg" style="width: 300px; height: 20px; border: 2px solid #555;">
                    <div id="loading-bar-fill" style="width: 0%; height: 100%; background: #a855f7; transition: width 0.2s;"></div>
                </div>
                <p id="loading-text" style="color: #666; font-size: 10px; margin-top: 10px;">INICIANDO...</p>
            </div>
        `;
        Object.assign(this.loadingOverlay.style, {
            position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
            background: '#000', display: 'none', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, flexDirection: 'column'
        });
        document.body.appendChild(this.loadingOverlay);
    }

    showLoading() {
        if (this.loadingOverlay) this.loadingOverlay.style.display = 'flex';
    }

    updateLoading(percent) {
        const fill = document.getElementById('loading-bar-fill');
        const text = document.getElementById('loading-text');
        if (fill) fill.style.width = `${percent}%`;
        if (text) text.innerText = `${percent}% CONCLUÍDO`;
        
        if (percent >= 100) {
            setTimeout(() => {
                this.loadingOverlay.style.opacity = '0';
                this.loadingOverlay.style.transition = 'opacity 0.5s';
                setTimeout(() => this.loadingOverlay.remove(), 500);
            }, 500);
        }
    }

    updateStats(player) {
        if (this.healthBar) this.healthBar.style.width = `${(player.hp / 100) * 100}%`;
        if (this.hungerBar) this.hungerBar.style.width = `${(player.hunger / 100) * 100}%`;
        
        const xpThreshold = player.level * 150;
        if (this.xpBar) this.xpBar.style.width = `${Math.min(100, (player.xp / xpThreshold) * 100)}%`;
        if (this.levelTxt) this.levelTxt.innerText = `LVL ${player.level}`;
    }

    addLog(msg, color = null) {
        if (!this.logContent) return;
        const entry = document.createElement('span');
        entry.innerText = msg;
        if (color) entry.style.color = color;
        if (color === "#ff4d4d") entry.style.borderLeftColor = "#ff4d4d";
        
        this.logContent.appendChild(entry);
        this.logContent.scrollTop = this.logContent.scrollHeight;
        
        setTimeout(() => {
            entry.style.opacity = '0';
            entry.style.transition = 'opacity 1s';
            setTimeout(() => entry.remove(), 1000);
        }, 8000);
    }
}

export const HUD = new HUDManager();
