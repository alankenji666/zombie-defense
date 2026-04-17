import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import * as db from './src/database.js';
import { mapsManager } from './src/maps_manager.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

db.initDB().catch(console.error);

app.use((req, res, next) => {
    // CSP mais permissiva para suportar o Map Editor e CDN do Three.js
    res.setHeader("Content-Security-Policy", "default-src 'self' https:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://unpkg.com; connect-src 'self' https: ws: wss:;");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    next();
});

app.use(express.static(path.join(__dirname, '../client/public')));
app.use(express.static(path.join(__dirname, '../client')));
app.use('/public', express.static(path.join(__dirname, '../client/public')));
app.use(express.json());

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.resolve(__dirname, '../client/index.html'));
});

// =====================================================
// API DE STATUS
// =====================================================
app.get('/api/status', (req, res) => {
    res.json({
        playersCount: Object.keys(onlinePlayers).length,
        animalsCount: animals.length,
        ramUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        onlinePlayers: onlinePlayers
    });
});

app.post('/api/command', async (req, res) => {
    const cmd = req.body.cmd;
    io.emit('server_log', `[API ADMIN] Command: ${cmd}`);
    
    if(cmd === 'restart_all') {
        io.emit('force_restart');
    } else if (cmd === 'kill_player') {
        io.emit('force_kill');
    } else if (cmd === 'spawn_animals') {
        spawnAnimals(5);
    } else if (cmd === 'kill_animals') {
        animals = [];
    } else if (cmd === 'reset_db') {
        try { 
            await db.resetAllPlayers(); 
            io.emit('force_restart'); 
        } catch(e){}
    }
    res.json({ success: true });
});

app.post('/api/reset_db', async (req, res) => {
    try {
        await db.resetAllPlayers();
        io.emit('force_restart');
        io.emit('server_log', '[ADMIN] 🗑️ Banco de dados resetado!');
        res.json({ success: true });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// =====================================================
// API DE KICK / BAN
// =====================================================

// Kickar jogador
app.post('/api/players/:name/kick', async (req, res) => {
    try {
        const name = req.params.name;
        const { reason } = req.body;
        const kickReason = reason || 'Expulso pelo administrador';

        // Registra no histórico
        await db.logAction(name, 'KICK', kickReason, null, 'Admin');

        // Encontra o socket do player online
        let kicked = false;
        for (let sid in onlinePlayers) {
            if (onlinePlayers[sid].name === name) {
                io.to(sid).emit('player_kicked', { reason: kickReason });
                setTimeout(() => {
                    const socket = io.sockets.sockets.get(sid);
                    if (socket) socket.disconnect(true);
                }, 3000); // Dá 3s para o client mostrar a mensagem
                kicked = true;
                break;
            }
        }

        io.emit('server_log', `[ADMIN] ⚡ ${name} foi kickado: ${kickReason}`);
        res.json({ success: true, wasOnline: kicked });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// Banir jogador
app.post('/api/players/:name/ban', async (req, res) => {
    try {
        const name = req.params.name;
        const { reason, duration_days } = req.body;
        const banReason = reason || 'Banido pelo administrador';
        const days = parseInt(duration_days) || 1;

        await db.banPlayer(name, banReason, days, 'Admin');

        // Se estiver online, kicka com mensagem de ban
        let banned = false;
        for (let sid in onlinePlayers) {
            if (onlinePlayers[sid].name === name) {
                const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
                io.to(sid).emit('player_banned', { 
                    reason: banReason, 
                    duration_days: days,
                    expires_at: expiresAt.toLocaleDateString('pt-BR')
                });
                setTimeout(() => {
                    const socket = io.sockets.sockets.get(sid);
                    if (socket) socket.disconnect(true);
                }, 4000);
                banned = true;
                break;
            }
        }

        io.emit('server_log', `[ADMIN] 🔨 ${name} foi banido por ${days} dia(s): ${banReason}`);
        res.json({ success: true, wasOnline: banned });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// Desbanir jogador
app.post('/api/players/:name/unban', async (req, res) => {
    try {
        const name = req.params.name;
        await db.unbanPlayer(name);
        io.emit('server_log', `[ADMIN] ✅ ${name} foi desbanido.`);
        res.json({ success: true });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// Histórico de ações de um jogador
app.get('/api/players/:name/history', async (req, res) => {
    try {
        const name = req.params.name;
        const history = await db.getPlayerHistory(name);
        const ban = await db.getActiveBan(name);
        res.json({ history, activeBan: ban || null });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// Lista todos os bans
app.get('/api/bans', async (req, res) => {
    try {
        const bans = await db.getAllBans();
        res.json(bans);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// =====================================================
// GERENCIAMENTO DE MOBS via JSON
// =====================================================
const mobsConfigPath = path.resolve(__dirname, '../data/mobs_config.json');
let mobsData = { animals: [] };

function loadMobsConfig() {
    try {
        const raw = fs.readFileSync(mobsConfigPath, 'utf8');
        mobsData = JSON.parse(raw);
    } catch(e) { console.log("[SERVER] Erro ao carregar mobs_config.json, usando padrao."); }
}

function saveMobsConfig() {
    try {
        fs.writeFileSync(mobsConfigPath, JSON.stringify(mobsData, null, 4), 'utf8');
    } catch(e) { console.error("[SERVER] Erro ao salvar mobs_config.json"); }
}

loadMobsConfig();

app.get('/api/mobs', (req, res) => { res.json(mobsData); });

// Apenas GET para o jogo carregar o cenário inicial
app.get('/api/map', (req, res) => {
    const map = mapsManager.loadMap();
    res.json(map);
});

// =====================================================
// GERENCIAMENTO DE ITENS via JSON
// =====================================================
const itemsConfigPath = path.resolve(__dirname, '../data/items_config.json');
let itemsData = { items: [] };

function loadItemsConfig() {
    try {
        const raw = fs.readFileSync(itemsConfigPath, 'utf8');
        itemsData = JSON.parse(raw);
    } catch(e) { console.log("[SERVER] Erro ao carregar items_config.json"); }
}

function saveItemsConfig() {
    try {
        fs.writeFileSync(itemsConfigPath, JSON.stringify(itemsData, null, 4), 'utf8');
    } catch(e) { console.error("[SERVER] Erro ao salvar items_config.json"); }
}

loadItemsConfig();

app.get('/api/items', (req, res) => { res.json(itemsData); });

app.post('/api/items', (req, res) => {
    // Preserva as categorias ao salvar (o client só envia a lista de itens)
    if (req.body.items) itemsData.items = req.body.items;
    else itemsData = req.body;
    saveItemsConfig();
    io.emit('server_log', `[ADMIN] Catálogo de Itens atualizado.`);
    res.json({ success: true });
});

// =====================================================
// PLAYERS API
// =====================================================
app.get('/api/players/all', async (req, res) => {
    try {
        const allPlayers = await db.getAllPlayers();
        const result = await Promise.all(allPlayers.map(async p => {
            const ban = await db.getActiveBan(p.name);
            return {
                ...p,
                online: !!Object.values(onlinePlayers).find(op => op.name === p.name),
                banned: !!ban,
                ban_info: ban || null
            };
        }));
        res.json(result);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/players/:name/reset_pos', async (req, res) => {
    try {
        const name = req.params.name;
        const player = await db.getPlayer(name);
        if(!player) return res.status(404).json({ error: "Player não encontrado" });
        
        player.x = 15;
        player.y = 15;
        player.z = 0;
        
        await db.savePlayer(name, player);
        
        for(let sid in onlinePlayers) {
            if(onlinePlayers[sid].name === name) {
                onlinePlayers[sid].x = 15;
                onlinePlayers[sid].y = 15;
                onlinePlayers[sid].z = 0;
                io.to(sid).emit('server_log', "Para Evitar Bugs sua localização foi resetada!");
                io.to(sid).emit('force_reposition', { x: 15, y: 15, z: 0 });
                break;
            }
        }

        await db.logAction(name, 'RESET_POS', 'Posição resetada pelo admin', null, 'Admin');
        io.emit('server_log', `[ADMIN] Posição de ${name} resetada para (15,15).`);
        res.json({ success: true });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// =====================================================
// SERVER CONFIG API
// =====================================================
app.get('/api/config', (req, res) => {
    res.json(serverConfig);
});

app.post('/api/config', (req, res) => {
    serverConfig = { ...serverConfig, ...req.body };
    io.emit('config_update', serverConfig);
    io.emit('server_log', `[ADMIN] Configuração atualizada: Colisão Player = ${serverConfig.playerCollision}`);
    res.json({ success: true });
});


// =====================================================
// WORLD
// =====================================================
const onlinePlayers = {};
let MAP_WIDTH = 30;
let MAP_HEIGHT = 30;
let biome = 'floresta';
let objects = [];
let trees = [];
let animals = [];
let specials = [];
let survivalTickCounter = 0;
let serverConfig = {
    playerCollision: false
};


function initWorld() {
    const map = mapsManager.loadMap();
    if (!map) {
        // Fallback para geração aleatória se o mapa estiver corrompido
        generateRandomWorld();
        return;
    }

    MAP_WIDTH = map.width || 30;
    MAP_HEIGHT = map.height || 30;
    biome = map.biome || 'floresta';
    specials = map.specials || [];
    
    // Carregar todos os Objetos (Árvores, Pedras, etc)
    objects = map.objects || [];
    
    // Filtro legado para compatibilidade (trees)
    trees = objects.filter(o => o.type === 'tree');
    
    // Carregar Animais Fixos do Mapa (opcional, se salvos como spawn points)
    animals = [];
    if (map.objects) {
        map.objects.filter(o => o.type === 'animal').forEach(a => {
            const type = mobsData.animals.find(m => m.id === a.mobId);
            if (type) {
                animals.push({
                    id: Math.random().toString(36).substr(2, 9),
                    name: type.name,
                    x: a.x,
                    y: a.y,
                    z: a.z || 0,
                    emoji: type.emoji,
                    foodValue: type.food,
                    xpReward: type.xp,
                    hp: type.hp,
                    maxHp: type.hp,
                    mobId: type.id
                });
            }
        });
    }

    // Se o mapa estiver muito vazio, spawnar alguns animais aleatórios para manter a vida
    if (animals.length < 5) {
        spawnAnimals(15 - animals.length);
    }
    
    console.log(`[WORLD] Mapa carregado: ${MAP_WIDTH}x${MAP_HEIGHT}. Árvores: ${trees.length}, Mobs: ${animals.length}`);
}

function generateRandomWorld() {
    MAP_WIDTH = 30;
    MAP_HEIGHT = 30;
    trees = [];
    for (let i = 0; i < 40; i++) {
        trees.push({
            x: Math.floor(Math.random() * (MAP_WIDTH - 2)) + 1,
            y: Math.floor(Math.random() * (MAP_HEIGHT - 2)) + 1,
            z: 0,
            emoji: '🌴',
            type: 'tree'
        });
    }
    specials = [
        { type: 'stair', x: 18, y: 15, z: 0, targetZ: 1 },
        { type: 'stair', x: 19, y: 15, z: 1, targetZ: 0 }
    ];
    animals = [];
    spawnAnimals(15);
}

function spawnAnimals(count) {
    if (!mobsData.animals || mobsData.animals.length === 0) return;
    
    for (let i = 0; i < count; i++) {
        const type = mobsData.animals[Math.floor(Math.random() * mobsData.animals.length)];
        
        // Buscar posição livre
        let rx, ry;
        let attempts = 0;
        let found = false;
        
        while(attempts < 50) {
            rx = Math.floor(Math.random() * (MAP_WIDTH - 2)) + 1;
            ry = Math.floor(Math.random() * (MAP_HEIGHT - 2)) + 1;
            if (isWalkable(rx, ry, 0, null, type.hasCollision ?? true)) {
                found = true;
                break;
            }
            attempts++;
        }
        
        if (!found) continue;

        animals.push({
            id: Math.random().toString(36).substr(2, 9),
            name: type.name,
            x: rx,
            y: ry,
            z: 0,
            emoji: type.emoji,
            foodValue: type.food,
            xpReward: type.xp,
            hp: type.hp,
            maxHp: type.hp,
            mobId: type.id
        });
    }
}

function isWalkable(x, y, z, socketId, hasCollision = true) {
    // 1. Limites do Mapa (Sempre bloqueia)
    if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return false;

    // Se o mob NÃO tem colisão física (Ex: voadores), ele ignora árvores e outros mobs
    if (hasCollision) {
        // 2. Árvores
        const hasTree = trees.some(t => t.x === x && t.y === y && t.z === z);
        if (hasTree) return false;

        // 3. Outros Monstros (Ignora se o mob não tem colisão física, ex: coruja)
        const hasMonster = animals.some(a => {
            if (a.x !== x || a.y !== y || a.z !== z) return false;
            const type = mobsData.animals.find(m => m.id === a.mobId);
            return type ? (type.hasCollision !== false) : true;
        });
        if (hasMonster) return false;

        // 4. Outros Jogadores (Se habilitado)
        if (serverConfig.playerCollision) {
            for (let sid in onlinePlayers) {
                if (sid === socketId) continue;
                const op = onlinePlayers[sid];
                if (op.x === x && op.y === y && op.z === z) return false;
            }
        }
    }

    return true;
}

function gainXP(socketId, amount) {
    const p = onlinePlayers[socketId];
    if (!p) return;

    p.xp = (p.xp || 0) + amount;
    const threshold = p.level * 150;

    if (p.xp >= threshold) {
        p.xp -= threshold;
        p.level++;
        io.to(socketId).emit('server_log', `[UP] SUBIU DE NÍVEL! Você agora é Nível ${p.level}!`);
        p.hp = 100;
        p.hunger = 100;
    }
}

initWorld();

// =====================================================
// SERVER TICK (Lenta: 1 Segundo) - DB, Survival, Dashboard
// =====================================================
setInterval(async () => {
    // 1. Mover Animais
    animals.forEach(a => {
        if (Math.random() > 0.8) {
            let nx = a.x + (Math.floor(Math.random() * 3) - 1);
            let ny = a.y + (Math.floor(Math.random() * 3) - 1);
            const type = mobsData.animals.find(m => m.id === a.mobId);
            const hasCollision = type ? (type.hasCollision ?? true) : true;

            if (isWalkable(nx, ny, a.z, null, hasCollision)) {
                a.x = nx;
                a.y = ny;
            }
        }
    });

    // 2. Fome e Salvar Jogadores Online
    survivalTickCounter++;
    for (let id in onlinePlayers) {
        let p = onlinePlayers[id];
        p.hunger = Math.max(0, p.hunger - 2);
        if (p.hunger === 0) p.hp = Math.max(0, p.hp - 10);
        if (p.hp <= 0) {
            io.to(id).emit('force_kill');
            p.hp = 100; p.hunger = 100; p.xp = 0;
        }
        if (survivalTickCounter >= 30) gainXP(id, 5);
        try { await db.savePlayer(p.name, p); } catch(e) {}
    }
    if (survivalTickCounter >= 30) survivalTickCounter = 0;

    // 3. Status para Admin
    const ramUsage = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    const dashboardData = {
        playersCount: Object.keys(onlinePlayers).length,
        animalsCount: animals.length,
        ramUsage: ramUsage,
        onlinePlayers: onlinePlayers
    };
    io.emit('admin_dashboard_update', dashboardData);
    if (process.send) process.send({ type: 'dashboard_update', data: dashboardData });

}, 1000);

// =====================================================
// SERVER BROADCAST (Rápida: 50ms / 20Hz) - Movimento Fluido
// =====================================================
setInterval(() => {
    const playersList = Object.keys(onlinePlayers).map(socketId => ({
        ...onlinePlayers[socketId],
        id: socketId
    }));

    io.emit('map_update', {
        animals: animals,
        players: playersList
    });
}, 50);


// =====================================================
// SOCKET CONNECTION
// =====================================================
io.on('connection', (socket) => {
    
    socket.emit('world_init', { trees, specials, objects, biome, MAP_WIDTH, MAP_HEIGHT, serverConfig });
    
    socket.on('player_action', (data) => {
        // Propaga a ação para todos os outros players (menos quem enviou)
        socket.broadcast.emit('player_action', {
            id: socket.id,
            type: data.type
        });
    });

    socket.on('send_chat', (data) => {
        if (!data.text) return;
        const p = onlinePlayers[socket.id];
        if (!p) return;
        
        io.emit('chat_message', {
            senderId: socket.id, // ID para identificar o balão 3D
            name: p.name,
            text: data.text,
            color: "#64ffda"
        });
    });

    socket.on('request_join', async (name) => {
        try {

            // Verifica se está banido
            const ban = await db.isPlayerBanned(name);
            if (ban) {
                const expiresAt = new Date(ban.expires_at).toLocaleDateString('pt-BR');
                socket.emit('player_banned', {
                    reason: ban.reason,
                    duration_days: ban.duration_days,
                    expires_at: expiresAt
                });
                setTimeout(() => socket.disconnect(true), 4000);
                console.log(`[BAN] ${name} tentou entrar mas está banido até ${expiresAt}.`);
                return;
            }

            // ── Sessão Única: se o nome já está logado, kicka a sessão antiga ──
            for (let existingSid in onlinePlayers) {
                if (onlinePlayers[existingSid].name === name) {
                    // Avisa o cliente antigo antes de desconectar
                    io.to(existingSid).emit('player_kicked', {
                        reason: 'Outra sessão foi iniciada com o seu nome. Você foi desconectado.'
                    });
                    // Pequeno delay para o cliente receber a mensagem
                    setTimeout(() => {
                        const oldSocket = io.sockets.sockets.get(existingSid);
                        if (oldSocket) oldSocket.disconnect(true);
                    }, 2000);
                    delete onlinePlayers[existingSid];
                    io.emit('server_log', `[SESSION] ⚠️ ${name} logou em outro local. Sessão anterior encerrada.`);
                    break;
                }
            }

            let playerData = await db.getPlayer(name);
            if (!playerData) {
                const defaults = { x: 15, y: 15, z: 0, hp: 100, hunger: 100 };
                playerData = await db.createPlayer(name, defaults);
            }

            onlinePlayers[socket.id] = { 
                ...playerData, 
                name,
                level: playerData.level || 1,
                xp: playerData.xp || 0,
                inventory: playerData.inventory || []
            };

            io.emit('server_log', `[GAME] 🟢 Jogador ${name} conectou (Lvl ${onlinePlayers[socket.id].level})`);
            io.emit('player_connected', name);

            socket.emit('join_confirmed', onlinePlayers[socket.id]);
        } catch (err) {
            console.error(err);
        }
    });

    socket.on('player_move', (pos) => {
        let p = onlinePlayers[socket.id];
        if (p) {
            // Validação de Colisão Autoritativa
            if (!isWalkable(pos.x, pos.y, pos.z || 0, socket.id)) {
                socket.emit('force_reposition', { x: p.x, y: p.y, z: p.z });
                return;
            }

            p.x = pos.x;
            p.y = pos.y;
            p.z = pos.z || 0;
            p.direction = pos.direction;

            // Verificar interação com escadas
            specials.forEach(s => {
                if (s.type === 'stair' && s.x === p.x && s.y === p.y && s.z === p.z) {
                    p.z = s.targetZ;
                    socket.emit('server_log', `[MOVIMENTO] Você ${s.targetZ > s.z ? 'subiu' : 'desceu'} para a Camada ${p.z}`);
                    socket.emit('force_reposition', { x: p.x, y: p.y, z: p.z });
                }
            });
        }
    });

    socket.on('request_hunt', () => {
        let p = onlinePlayers[socket.id];
        if (!p) return;

        for (let i = animals.length - 1; i >= 0; i--) {
            let a = animals[i];
            let dx = Math.abs(a.x - p.x);
            let dy = Math.abs(a.y - p.y);
            if (dx <= 1 && dy <= 1) { 
                p.hunger = Math.min(100, p.hunger + a.foodValue);
                gainXP(socket.id, a.xpReward);

                let dropsGained = [];
                const mobType = mobsData.animals.find(m => m.id === a.mobId);
                if (mobType && mobType.drops) {
                    mobType.drops.forEach(d => {
                        const roll = Math.random() * 100;
                        if (roll <= d.chance) {
                            const itemDef = itemsData.items.find(it => it.id === d.itemId);
                            if (itemDef) {
                                const existing = p.inventory.find(i => i.id === d.itemId);
                                if (existing) {
                                    existing.qty += d.qty;
                                } else {
                                    p.inventory.push({ id: d.itemId, name: itemDef.name, emoji: itemDef.emoji, qty: d.qty });
                                }
                                dropsGained.push(`${d.qty}x ${itemDef.emoji}`);
                            }
                        }
                    });
                }

                animals.splice(i, 1);
                
                let logMsg = `[GAME] ${p.name} abateu um ${a.emoji} (+${a.xpReward} XP)`;
                if (dropsGained.length > 0) logMsg += ` e coletou: ${dropsGained.join(', ')}`;
                io.emit('server_log', logMsg);
                
                if (dropsGained.length > 0) {
                    socket.emit('loot_received', { drops: dropsGained });
                }

                spawnAnimals(1); 
                break;
            }
        }
    });

    socket.on('admin_command', async (cmd) => {
        io.emit('server_log', `[ADMIN] Command: ${cmd}`);
        if(cmd === 'restart_all') {
            io.emit('force_restart');
        } else if (cmd === 'kill_player') {
            io.emit('force_kill');
        } else if (cmd === 'reset_db') {
            await db.resetAllPlayers();
            io.emit('force_restart');
        } else if (cmd === 'spawn_animals') {
            spawnAnimals(5);
        } else if (cmd === 'kill_animals') {
            animals = [];
        }
    });

    // Detecta desconexão (janela fechada, queda de conexão, etc)
    socket.on('disconnect', (reason) => {
        if (onlinePlayers[socket.id]) {
            const playerName = onlinePlayers[socket.id].name;
            io.emit('server_log', `[GAME] 🔴 Jogador ${playerName} desconectou (${reason})`);
            io.emit('player_disconnected', playerName);
            delete onlinePlayers[socket.id];
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[SERVER] Servidor rodando na porta ${PORT}`);
    console.log(`[SERVER] Modo: ${process.env.NODE_ENV || 'development'}`);
});
