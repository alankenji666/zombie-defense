import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { fork } from 'child_process';
import * as db from './server/src/database.js';
import { mapsManager } from './server/src/maps_manager.js';

// Desativar acelera&#231;&#227;o de hardware se houver problemas de renderiza&#231;&#227;o (tela preta)
app.disableHardwareAcceleration();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// For&#231;ar os dados do app (cache, etc) a ficarem na pasta do projeto para evitar erros de permiss&#227;o
const userDataPath = path.join(__dirname, '.electron_data');
app.setPath('userData', userDataPath);

let mainWindow;
let serverProcess = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            sandbox: false,
            webSecurity: false
        },
        backgroundColor: '#0c0c1e',
        autoHideMenuBar: true,
        title: "Survival Island - Admin Hub"
    });

    // Carregar via sistema de arquivos (loadFile) para segurança e evitar tela branca
    mainWindow.loadFile(path.join(__dirname, 'admin_tools/hub/index.html'));
    

    mainWindow.on('closed', () => {

        if (serverProcess) {
            serverProcess.kill();
        }
        mainWindow = null;
    });
}

// Controle do Servidor via IPC
ipcMain.on('server-start', () => {
    if (serverProcess) return;

    // Inicia o server.js usando fork para comunicação fácil
    serverProcess = fork(path.join(__dirname, 'server/server.js'), {
        stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    });

    serverProcess.stdout.on('data', (data) => {
        if (mainWindow) mainWindow.webContents.send('server-log', data.toString());
    });

    serverProcess.stderr.on('data', (data) => {
        if (mainWindow) mainWindow.webContents.send('server-log', `[ALERTA/ERRO] ${data.toString()}`);
    });

    // Recebe mensagens IPC do processo filho (server.js) e repassa ao renderer
    serverProcess.on('message', (msg) => {
        if (!mainWindow) return;
        if (msg.type === 'dashboard_update') {
            mainWindow.webContents.send('admin_dashboard_update', msg.data);
        }
    });

    serverProcess.on('exit', () => {
        serverProcess = null;
        if (mainWindow) mainWindow.webContents.send('server-status', 'offline');
    });

    if (mainWindow) mainWindow.webContents.send('server-status', 'online');
});

ipcMain.on('server-stop', () => {
    if (serverProcess) {
        serverProcess.kill();
        serverProcess = null;
    }
    if (mainWindow) mainWindow.webContents.send('server-status', 'offline');
});

ipcMain.on('server-restart', () => {
    if (serverProcess) {
        serverProcess.kill();
        serverProcess = null;
    }
    setTimeout(() => {
        ipcMain.emit('server-start');
    }, 1000);
});

ipcMain.on('open-game-browser', () => {
    shell.openExternal('http://localhost:3000');
});

// =====================================================
// MAP EDITOR WINDOW & DATA IPC
// =====================================================
let editorWindow = null;

ipcMain.on('open-map-editor', () => {
    if (editorWindow) {
        editorWindow.focus();
        return;
    }

    editorWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            sandbox: false,
            webSecurity: false
        },
        backgroundColor: '#0a0a0f',
        title: "Survival Island - Editor de Mapa"
    });

    editorWindow.loadFile(path.join(__dirname, 'admin_tools/editor/index.html'));
    
    // Abrir ferramentas de desenvolvedor para depuração
    editorWindow.webContents.openDevTools();
    
    editorWindow.on('closed', () => {
        editorWindow = null;
    });
});

ipcMain.handle('map-load', async () => {
    return { 
        data: mapsManager.loadMap(),
        rootPath: __dirname 
    };
});

ipcMain.handle('map-save', async (event, mapData) => {
    const success = mapsManager.saveMap(mapData);
    return { success };
});

ipcMain.handle('list-assets', async () => {
    const modelsDir = path.join(__dirname, 'client/public/assets/models');
    try {
        if (!fs.existsSync(modelsDir)) return [];
        return fs.readdirSync(modelsDir).filter(f => f.endsWith('.glb'));
    } catch(e) { return []; }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        if (serverProcess) serverProcess.kill();
        app.quit();
    }
});

// =====================================================
// GESTÃO DE DADOS (STANDALONE) via IPC
// =====================================================
const mobsPath = path.join(__dirname, 'data/mobs_config.json');
const itemsPath = path.join(__dirname, 'data/items_config.json');

// MOBS
ipcMain.handle('data-load-mobs', async () => {
    try {
        const raw = fs.readFileSync(mobsPath, 'utf8');
        return JSON.parse(raw);
    } catch(e) { return { animals: [] }; }
});

ipcMain.handle('data-save-mobs', async (event, data) => {
    try {
        fs.writeFileSync(mobsPath, JSON.stringify(data, null, 4), 'utf8');
        return { success: true };
    } catch(e) { return { success: false, error: e.message }; }
});

// ITEMS
ipcMain.handle('data-load-items', async () => {
    try {
        const raw = fs.readFileSync(itemsPath, 'utf8');
        return JSON.parse(raw);
    } catch(e) { return { items: [], categories: [] }; }
});

ipcMain.handle('data-save-items', async (event, data) => {
    try {
        fs.writeFileSync(itemsPath, JSON.stringify(data, null, 4), 'utf8');
        return { success: true };
    } catch(e) { return { success: false, error: e.message }; }
});

// PLAYERS & DB
ipcMain.handle('data-load-players', async () => {
    try {
        const players = await db.getAllPlayers();
        return players;
    } catch(e) { return []; }
});

ipcMain.handle('data-ban-player', async (event, { name, reason, days }) => {
    try {
        await db.banPlayer(name, reason, days, 'Admin (Offline)');
        return { success: true };
    } catch(e) { return { success: false, error: e.message }; }
});

ipcMain.handle('data-unban-player', async (event, name) => {
    try {
        await db.unbanPlayer(name);
        return { success: true };
    } catch(e) { return { success: false, error: e.message }; }
});

ipcMain.handle('data-load-history', async (event, name) => {
    try {
        const history = await db.getPlayerHistory(name);
        const activeBan = await db.getActiveBan(name);
        return { history, activeBan };
    } catch(e) { return { history: [], activeBan: null }; }
});

ipcMain.handle('data-reset-players', async () => {
    try {
        await db.resetAllPlayers();
        return { success: true };
    } catch(e) { return { success: false, error: e.message }; }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
