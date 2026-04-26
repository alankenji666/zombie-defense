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

        // Virtual Joystick (Bolinha)
        const joystickZone = document.getElementById('joystick-zone');
        const joystickKnob = document.getElementById('joystick-knob');
        
        if (joystickZone && joystickKnob) {
            let isDragging = false;
            let centerX, centerY, maxRadius;

            const updateJoystick = (clientX, clientY) => {
                let dx = clientX - centerX;
                let dy = clientY - centerY;
                let distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance > maxRadius) {
                    dx = (dx / distance) * maxRadius;
                    dy = (dy / distance) * maxRadius;
                }
                
                joystickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
                
                // Convert to 8-way movement like D-Pad
                if (distance > 10) { // Deadzone
                    const angle = Math.atan2(dy, dx);
                    // Simplify angle to 8 directions
                    const PI = Math.PI;
                    const slice = PI / 4;
                    const octant = Math.round(angle / slice);
                    
                    let moveDx = 0;
                    let moveDy = 0;
                    
                    switch(octant) {
                        case 0: case 8: case -8: moveDx = 1; break; // Right
                        case 1: moveDx = 1; moveDy = 1; break; // Down-Right
                        case 2: moveDy = 1; break; // Down
                        case 3: moveDx = -1; moveDy = 1; break; // Down-Left
                        case 4: case -4: moveDx = -1; break; // Left
                        case -3: moveDx = -1; moveDy = -1; break; // Up-Left
                        case -2: moveDy = -1; break; // Up
                        case -1: moveDx = 1; moveDy = -1; break; // Up-Right
                    }
                    this.activeMobileDir = { dx: moveDx, dy: moveDy };
                } else {
                    this.activeMobileDir = null;
                }
            };

            const startDrag = (e) => {
                e.preventDefault();
                isDragging = true;
                const rect = joystickZone.getBoundingClientRect();
                centerX = rect.left + rect.width / 2;
                centerY = rect.top + rect.height / 2;
                maxRadius = rect.width / 2;
                
                const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                const clientY = e.touches ? e.touches[0].clientY : e.clientY;
                updateJoystick(clientX, clientY);
            };

            const drag = (e) => {
                if (!isDragging) return;
                e.preventDefault();
                const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                const clientY = e.touches ? e.touches[0].clientY : e.clientY;
                updateJoystick(clientX, clientY);
            };

            const stopDrag = (e) => {
                e.preventDefault();
                isDragging = false;
                joystickKnob.style.transform = `translate(-50%, -50%)`;
                this.activeMobileDir = null;
            };

            joystickZone.addEventListener('touchstart', startDrag, {passive: false});
            joystickZone.addEventListener('touchmove', drag, {passive: false});
            joystickZone.addEventListener('touchend', stopDrag, {passive: false});
            joystickZone.addEventListener('mousedown', startDrag);
            document.addEventListener('mousemove', drag);
            document.addEventListener('mouseup', () => { if(isDragging) stopDrag({preventDefault:()=>{}}); });
        }
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
