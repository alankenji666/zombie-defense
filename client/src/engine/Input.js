class InputManager {
    constructor() {
        this.keys = {};
        this.activeMobileDir = null;
        this.setupListeners();
    }

    setupListeners() {
        // Mobile D-Pad Mapping (Manteve os de mobile aqui)
        const dirMapping = {
            'btn-up': { dx: 0, dy: -1 },
            'btn-down': { dx: 0, dy: 1 },
            'btn-left': { dx: -1, dy: 0 },
            'btn-right': { dx: 1, dy: 0 },
            'btn-ul': { dx: -1, dy: -1 },
            'btn-ur': { dx: 1, dy: -1 },
            'btn-dl': { dx: -1, dy: 1 },
            'btn-dr': { dx: 1, dy: 1 }
        };

        Object.keys(dirMapping).forEach(id => {
            const btn = document.getElementById(id);
            if (!btn) return;
            
            const startHandler = (e) => {
                e.preventDefault();
                this.activeMobileDir = dirMapping[id];
            };
            const endHandler = (e) => {
                e.preventDefault();
                this.activeMobileDir = null;
            };

            btn.addEventListener('touchstart', startHandler);
            btn.addEventListener('touchend', endHandler);
            btn.addEventListener('mousedown', () => this.activeMobileDir = dirMapping[id]);
            btn.addEventListener('mouseup', () => this.activeMobileDir = null);
            btn.addEventListener('mouseleave', () => this.activeMobileDir = null);
        });
    }

    getMovement() {
        let dx = 0;
        let dy = 0;

        if (this.keys['w'] || this.keys['arrowup']) dy -= 1;
        if (this.keys['s'] || this.keys['arrowdown']) dy += 1;
        if (this.keys['a'] || this.keys['arrowleft']) dx -= 1;
        if (this.keys['d'] || this.keys['arrowright']) dx += 1;

        if (this.activeMobileDir) {
            dx = this.activeMobileDir.dx;
            dy = this.activeMobileDir.dy;
        }

        if (dx !== 0 || dy !== 0) {
            return { dx: Math.sign(dx), dy: Math.sign(dy) };
        }
        return null;
    }
    
    isPressed(key) {
        return !!this.keys[key.toLowerCase()];
    }
}

export const Input = new InputManager();
