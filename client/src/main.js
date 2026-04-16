import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

import { Assets } from './engine/Assets.js';
import { Input } from './engine/Input.js';
import { HUD } from './ui/HUD.js';
import { EntityManager } from './game/EntityManager.js';
import { WorldManager } from './game/World.js';
import { Chat } from './ui/Chat.js';

let socket = null;

// = :::::::::::::::::::::::::::::::::::::::::::::::::::
// CONFIG & CONSTANTS
// = :::::::::::::::::::::::::::::::::::::::::::::::::::
const GRID_SIZE = 2;
const LAYER_HEIGHT = 2.5;
const MODELS = {
    GROUND: 'block-grass-large.glb',
    PLAYERS: [
        'character-oobi.glb', 'character-oodi.glb', 'character-ooli.glb',
        'character-oopi.glb', 'character-oozi.glb'
    ],
    ZOMBIE: 'character-zombie.glb',
    TREE: 'pine.glb',
    CHICK: 'animal-chick.glb',
    PIG: 'animal-pig.glb',
    DEER: 'animal-deer.glb',
    OWL: 'animal-parrot.glb',
    STAIRS: 'stairs-wood.glb'
};

const myPlayer = {
    mesh: null,
    mixer: null,
    actions: {},
    currentAction: null,
    x: 15, y: 15, z: 0,
    hp: 100, hunger: 100,
    level: 1, xp: 0,
    lastMoveTime: 0,
    direction: 0, 
    jumpTime: 0
};
let lastFrameTime = performance.now();
let currentData = { players: [], animals: [] };
let gameConfig = { 
    multiplayer: true,
    multiplayerCollision: false,
    showStats: false
};

// Métricas de Desempenho
let frameCount = 0;
let lastFpsUpdate = 0;
let fps = 0;

// = :::::::::::::::::::::::::::::::::::::::::::::::::::
// ENGINE CORE
// = :::::::::::::::::::::::::::::::::::::::::::::::::::
let scene, camera, renderer, composer;
let entityManager, worldManager;
let isPlaying = false;
let currentPlayerName = "Convidado";
const MOVE_COOLDOWN = 180;

function initEngine() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb); // Sky blue
    scene.fog = new THREE.Fog(0x87ceeb, 20, 100);

    const aspect = window.innerWidth / window.innerHeight;
    const d = 12;
    camera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, 1, 1000);
    camera.position.set(40, 40, 40);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('three-container').appendChild(renderer.domElement);

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(20, 50, 10);
    sun.castShadow = true;
    sun.shadow.camera.left = -30;
    sun.shadow.camera.right = 30;
    sun.shadow.camera.top = 30;
    sun.shadow.camera.bottom = -30;
    sun.shadow.mapSize.width = 1024;
    sun.shadow.mapSize.height = 1024;
    scene.add(sun);

    // Post Processing
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.4, 0.4, 0.85);
    composer.addPass(bloom);

    // Sub-Managers
    entityManager = new EntityManager(scene, LAYER_HEIGHT, GRID_SIZE);
    worldManager = new WorldManager(scene, GRID_SIZE, LAYER_HEIGHT);
}

// = :::::::::::::::::::::::::::::::::::::::::::::::::::
// GAME LOGIC
// = :::::::::::::::::::::::::::::::::::::::::::::::::::
async function startEngine() {
    const nameInput = document.getElementById('player-name-input');
    const name = nameInput.value.trim();
    if (!name) { alert("Digite seu nome!"); return; }
    currentPlayerName = name;

    document.getElementById('story-screen').classList.add('hidden');
    HUD.showLoading();
    console.log("[GAME] Iniciando engine...");

    initEngine();
    
    // Preload all models
    const assetsToLoad = [
        MODELS.GROUND, MODELS.TREE, MODELS.ZOMBIE, MODELS.CHICK, MODELS.STAIRS,
        ...MODELS.PLAYERS
    ];
    
    console.log("[GAME] Pré-carregando assets...");
    await Assets.preload(assetsToLoad, (percent) => {
        HUD.updateLoading(percent);
    });

    console.log("[GAME] Conectando ao servidor...");
    initNetwork();
}

function initNetwork() {
    if (typeof io === 'undefined') {
        console.error("[NETWORK] Socket.io não encontrado!");
        return;
    }
    socket = io();

    socket.on('connect', () => {
        console.log("[NETWORK] Conectado ao servidor. Solicitando entrada...");
        socket.emit('request_join', currentPlayerName);
    });

    socket.on('world_init', (data) => {
        console.log("[NETWORK] Mundo iniciado.");
        if (worldManager) {
            worldManager.init(data, MODELS);
            if (data.serverConfig) {
                gameConfig.multiplayerCollision = data.serverConfig.playerCollision;
            }
        }
    });

    socket.on('config_update', (data) => {
        console.log("[NETWORK] Configuração atualizada:", data);
        if (typeof data.playerCollision !== 'undefined') {
            gameConfig.multiplayerCollision = data.playerCollision;
            if (worldManager) worldManager.playerCollisionEnabled = data.playerCollision;
        }
    });

    socket.on('join_confirmed', (data) => {
        console.log("[NETWORK] Entrada confirmada!");
        beginGame(data);
        Chat.setSocket(socket, currentPlayerName, entityManager);
    });

    socket.on('map_update', (data) => {
        if (!isPlaying) return;
        currentData = data;
        
        const me = data.players.find(p => p.id === socket.id || p.name === currentPlayerName);
        if (me) {
            myPlayer.hp = me.hp;
            myPlayer.hunger = me.hunger;
            myPlayer.level = me.level;
            myPlayer.xp = me.xp;
        }
    });

    socket.on('force_reposition', (pos) => {
        myPlayer.x = pos.x;
        myPlayer.y = pos.y;
        myPlayer.z = pos.z || 0;
    });

    socket.on('server_log', (msg) => HUD.addLog(msg));

    // Handle Disconnection / Error
    socket.on('disconnect', (reason) => {
        console.warn("[NETWORK] Desconectado:", reason);
        document.getElementById('connection-error').classList.remove('hidden');
        document.getElementById('error-msg').innerText = "Conexão perdida. Tentando reconectar...";
    });

    socket.on('connect_error', (error) => {
        console.error("[NETWORK] Erro de conexão:", error);
        document.getElementById('connection-error').classList.remove('hidden');
        document.getElementById('error-msg').innerText = "Servidor offline ou instável. Tentando novamente...";
    });

    socket.on('connect', () => {
        // Se a tela de erro estiver visível, esconde
        document.getElementById('connection-error').classList.add('hidden');
        document.getElementById('reconnect-manual').classList.add('hidden');
        
        if (isPlaying) {
            socket.emit('request_join', currentPlayerName);
        }
    });

    socket.on('player_connected', (name) => {
        HUD.addLog(`[GAME] 🟢 ${name} entrou na ilha.`, "#39ff14");
    });

    socket.on('player_disconnected', (name) => {
        HUD.addLog(`[GAME] 🔴 ${name} deixou a ilha.`, "#ff4d4d");
    });

    socket.on('player_kicked', (data) => {
        document.getElementById('kick-screen').classList.remove('hidden');
        document.getElementById('kick-reason').innerText = data.reason || "Violou as regras da ilha.";
        isPlaying = false;
    });

    socket.on('player_action', (data) => {
        if (entityManager) {
            entityManager.triggerAction(data.id, data.type);
        }
    });

    socket.on('player_banned', (data) => {
        document.getElementById('ban-screen').classList.remove('hidden');
        document.getElementById('ban-reason').innerText = data.reason || "Banido permanentemente.";
        document.getElementById('ban-duration').innerText = `${data.duration_days} DIA(S)`;
        document.getElementById('ban-expires').innerText = data.expires_at || "---";
        isPlaying = false;
    });
}

async function beginGame(serverData) {
    isPlaying = true;
    myPlayer.x = serverData.x;
    myPlayer.y = serverData.y;
    myPlayer.z = serverData.z || 0;
    
    const avatarIndex = Math.abs(socket.id.split('').reduce((a, b) => a + b.charCodeAt(0), 0)) % MODELS.PLAYERS.length;
    myPlayer.mesh = await Assets.load(MODELS.PLAYERS[avatarIndex]);
    myPlayer.mesh.scale.set(1.8, 1.8, 1.8);
    scene.add(myPlayer.mesh);

    // Setup Animations
    if (myPlayer.mesh.animations && myPlayer.mesh.animations.length > 0) {
        myPlayer.mixer = new THREE.AnimationMixer(myPlayer.mesh);
        myPlayer.mesh.animations.forEach(clip => {
            const name = clip.name.toLowerCase();
            myPlayer.actions[name] = myPlayer.mixer.clipAction(clip);
        });
        
        // Play idle by default
        const idleAction = myPlayer.actions['idle'] || Object.values(myPlayer.actions)[0];
        if (idleAction) {
            idleAction.play();
            myPlayer.currentAction = idleAction;
        }
    }

    entityManager.createNameTag('me', currentPlayerName, true);
    
    document.getElementById('story-screen').classList.add('hidden');
    document.getElementById('ui-layer').classList.remove('hidden');
    
    requestAnimationFrame(gameLoop);
}

function gameLoop(time) {
    if (!isPlaying) return;

    const delta = (time - lastFrameTime) * 0.001;
    lastFrameTime = time;

    handlePlayerMovement(time);
    
    const lerpSpeed = 0.15;

    // My Player Animation & Lerp
    if (myPlayer.mesh) {
        const targetX = myPlayer.x * GRID_SIZE;
        const targetZ = myPlayer.y * GRID_SIZE;
        const targetY = myPlayer.z * LAYER_HEIGHT + 1.5;

        myPlayer.mesh.position.x += (targetX - myPlayer.mesh.position.x) * lerpSpeed;
        myPlayer.mesh.position.z += (targetZ - myPlayer.mesh.position.z) * lerpSpeed;
        
        const isMoving = Math.sqrt(Math.pow(targetX - myPlayer.mesh.position.x, 2) + Math.pow(targetZ - myPlayer.mesh.position.z, 2)) > 0.1;
        
        // Jumping Logic
        const jumpFactor = Math.max(0, 1 - (time - myPlayer.jumpTime) / 300);
        const jump = Math.sin(jumpFactor * Math.PI) * 0.8;
        myPlayer.mesh.position.y += (targetY + jump - myPlayer.mesh.position.y) * lerpSpeed;

        // Rotation Lerp
        let diff = myPlayer.direction - myPlayer.mesh.rotation.y;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        myPlayer.mesh.rotation.y += diff * 0.2;

        // Animations
        if (myPlayer.mixer) {
            myPlayer.mixer.update(delta);
            
            const nextActionName = isMoving ? 'walk' : 'idle';
            const nextAction = myPlayer.actions[nextActionName] || myPlayer.actions['idle'] || Object.values(myPlayer.actions)[0];
            
            if (nextAction && myPlayer.currentAction !== nextAction) {
                if (myPlayer.currentAction) myPlayer.currentAction.fadeOut(0.2);
                nextAction.reset().fadeIn(0.2).play();
                myPlayer.currentAction = nextAction;
            }
        }
        
        // Camera follow - Alinhado com o eixo Z (reto na tela)
        camera.position.x = myPlayer.mesh.position.x;
        camera.position.z = myPlayer.mesh.position.z + 35;
        camera.lookAt(myPlayer.mesh.position.x, myPlayer.mesh.position.y, myPlayer.mesh.position.z);
    }

    entityManager.updateUI(camera, myPlayer.mesh);
    
    if (gameConfig.multiplayer) {
        entityManager.updateOthers(currentData?.players || [], currentPlayerName, MODELS.PLAYERS, delta, socket.id);
    } else {
        entityManager.updateOthers([], currentPlayerName, MODELS.PLAYERS, delta, socket.id);
    }
    
    entityManager.updateAnimals(currentData?.animals || [], MODELS, delta);
    
    HUD.updateStats(myPlayer);
    
    // Atualizar Métricas de Desempenho
    if (gameConfig.showStats) {
        frameCount++;
        if (time - lastFpsUpdate > 1000) {
            fps = Math.round((frameCount * 1000) / (time - lastFpsUpdate));
            frameCount = 0;
            lastFpsUpdate = time;
            
            document.getElementById('stat-fps').innerText = fps;
            if (window.performance && window.performance.memory) {
                const mem = Math.round(window.performance.memory.usedJSHeapSize / 1048576);
                document.getElementById('stat-mem').innerText = mem;
            }
            if (renderer) {
                document.getElementById('stat-draws').innerText = renderer.info.render.calls;
                document.getElementById('stat-tris').innerText = renderer.info.render.triangles;
            }
        }
    }
    
    composer.render();
    requestAnimationFrame(gameLoop);
}

function handlePlayerMovement(currentTime) {
    if (currentTime - myPlayer.lastMoveTime < MOVE_COOLDOWN) return;

    const move = Input.getMovement();
    if (move) {
        // Atualiza a rotação IMEDIATAMENTE (mesmo se colidir)
        const targetDir = Math.atan2(move.dx, move.dy);
        if (myPlayer.direction !== targetDir) {
            myPlayer.direction = targetDir;
            // Avisar servidor que virei (mesmo sem sair do lugar)
            if (socket) socket.emit('player_move', { x: myPlayer.x, y: myPlayer.y, z: myPlayer.z, direction: myPlayer.direction });
        }

        const newX = myPlayer.x + move.dx;
        const newY = myPlayer.y + move.dy;
        
        // 1. Verificação de Colisão com o Mundo
        if (!worldManager.isWalkable(newX, newY, myPlayer.z)) return;

        // 2. Verificação de Colisão com Entidades
        const isOccupied = entityManager.isOccupied(newX, newY, myPlayer.z, socket.id, gameConfig.multiplayerCollision);
        if (isOccupied) return;

        // Se passar por todas as colisões, move de fato
        myPlayer.x = newX;
        myPlayer.y = newY;
        myPlayer.lastMoveTime = currentTime;
        
        if (socket) socket.emit('player_move', { x: newX, y: newY, z: myPlayer.z, direction: myPlayer.direction });
    }
}

// UI Actions
document.getElementById('btn-start').addEventListener('click', startEngine);
document.getElementById('btn-action').addEventListener('click', () => {
    myPlayer.jumpTime = performance.now();
    if (socket) {
        socket.emit('request_hunt');
        socket.emit('player_action', { type: 'attack' });
    }
});

// Settings Handlers
document.getElementById('btn-settings').addEventListener('click', () => {
    document.getElementById('settings-modal').classList.remove('hidden');
});
document.getElementById('btn-close-settings').addEventListener('click', () => {
    document.getElementById('settings-modal').classList.add('hidden');
});
document.getElementById('check-borders').addEventListener('change', (e) => {
    if (worldManager) worldManager.showBorders(e.target.checked);
});
document.getElementById('check-multiplayer').addEventListener('change', (e) => {
    gameConfig.multiplayer = e.target.checked;
});

document.getElementById('check-stats').addEventListener('change', (e) => {
    gameConfig.showStats = e.target.checked;
    const panel = document.getElementById('debug-stats');
    if (gameConfig.showStats) panel.classList.remove('hidden');
    else panel.classList.add('hidden');
});

document.getElementById('btn-reconnect').addEventListener('click', () => {
    window.location.reload();
});

window.addEventListener('resize', () => {
    if (!camera || !renderer) return;
    const aspect = window.innerWidth / window.innerHeight;
    const d = 12;
    camera.left = -d * aspect;
    camera.right = d * aspect;
    camera.top = d;
    camera.bottom = -d;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});

// Centralized Keyboard Listener
window.addEventListener('keydown', (e) => {
    if (isPlaying && !myPlayer.isDead) {
        // Toggle Chat
        if (e.key === 'Enter') {
            if (Chat.isVisible) {
                Chat.send();
                Chat.blur();
            } else {
                Chat.focus();
            }
            return;
        }

            // Tecla Space p/ Pulo
            if (e.code === 'Space') {
                myPlayer.jumpTime = performance.now();
                if (socket) socket.emit('player_action', { type: 'jump' });
                return;
            }

            // Tecla F ou E p/ Ação/Ataque
            if (e.code === 'KeyF' || e.code === 'KeyE') {
                myPlayer.jumpTime = performance.now(); // Feedback visual de pulinho
                if (socket) {
                    socket.emit('request_hunt');
                    socket.emit('player_action', { type: 'attack' });
                }
                return;
            }

            // Encaminha outras teclas (WASD) para o Input manager
            Input.keys[e.key.toLowerCase()] = true;
    }
});
window.addEventListener('keyup', (e) => {
    if (!isPlaying) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key) Input.keys[e.key.toLowerCase()] = false;
});

