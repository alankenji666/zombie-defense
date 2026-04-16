import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, '../../data/game_data.db');

let db;

export async function initDB() {
    db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS players (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE,
            x INTEGER,
            y INTEGER,
            z INTEGER DEFAULT 0,
            hp INTEGER DEFAULT 100,
            hunger INTEGER DEFAULT 100,
            level INTEGER DEFAULT 1,
            xp INTEGER DEFAULT 0,
            inventory TEXT DEFAULT '[]',
            last_login DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS bans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_name TEXT NOT NULL,
            reason TEXT NOT NULL,
            duration_days INTEGER NOT NULL,
            banned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME NOT NULL,
            banned_by TEXT DEFAULT 'Admin',
            active INTEGER DEFAULT 1
        )
    `);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS action_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_name TEXT NOT NULL,
            action_type TEXT NOT NULL,
            reason TEXT,
            extra TEXT,
            performed_by TEXT DEFAULT 'Admin',
            performed_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Migrações de segurança para bancos existentes
    try { await db.exec('ALTER TABLE players ADD COLUMN level INTEGER DEFAULT 1'); } catch(e) {}
    try { await db.exec('ALTER TABLE players ADD COLUMN xp INTEGER DEFAULT 0'); } catch(e) {}
    try { await db.exec('ALTER TABLE players ADD COLUMN inventory TEXT DEFAULT "[]"'); } catch(e) {}
    try { await db.exec('ALTER TABLE players ADD COLUMN z INTEGER DEFAULT 0'); } catch(e) {}

    console.log('[DB] SQLite Inicializado e Pronto.');
    return db;
}

export async function getPlayer(name) {
    if (!db) await initDB();
    const player = await db.get('SELECT * FROM players WHERE name = ?', name);
    if (player && player.inventory) {
        player.inventory = JSON.parse(player.inventory);
    }
    return player;
}

export async function createPlayer(name, defaultData) {
    if (!db) await initDB();
    const sql = `INSERT INTO players (name, x, y, z, hp, hunger, level, xp, inventory) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    await db.run(sql, [
        name,
        defaultData.x,
        defaultData.y,
        defaultData.z || 0,
        defaultData.hp,
        defaultData.hunger,
        defaultData.level || 1,
        defaultData.xp || 0,
        JSON.stringify(defaultData.inventory || [])
    ]);
    return await getPlayer(name);
}

export async function savePlayer(name, data) {
    if (!db) await initDB();
    const sql = `UPDATE players SET x = ?, y = ?, z = ?, hp = ?, hunger = ?, level = ?, xp = ?, inventory = ?, last_login = CURRENT_TIMESTAMP WHERE name = ?`;
    await db.run(sql, [
        data.x,
        data.y,
        data.z || 0,
        data.hp,
        data.hunger,
        data.level,
        data.xp,
        JSON.stringify(data.inventory || []),
        name
    ]);
}

export async function resetAllPlayers() {
    if (!db) await initDB();
    await db.run('DELETE FROM players');
    console.log('[DB] Todos os dados foram resetados conforme solicitado pelo admin.');
}

export async function getAllPlayers() {
    if (!db) await initDB();
    const rows = await db.all('SELECT * FROM players ORDER BY level DESC, xp DESC');
    return rows.map(r => ({
        ...r,
        inventory: r.inventory ? JSON.parse(r.inventory) : []
    }));
}

// ==================== BAN SYSTEM ====================

export async function banPlayer(playerName, reason, durationDays, bannedBy = 'Admin') {
    if (!db) await initDB();
    const now = new Date();
    const expires = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

    // Desativa bans anteriores ativos
    await db.run(`UPDATE bans SET active = 0 WHERE player_name = ? AND active = 1`, playerName);

    await db.run(
        `INSERT INTO bans (player_name, reason, duration_days, expires_at, banned_by) VALUES (?, ?, ?, ?, ?)`,
        [playerName, reason, durationDays, expires.toISOString(), bannedBy]
    );

    // Registra no histórico
    await logAction(playerName, 'BAN', reason, `${durationDays} dias`, bannedBy);
}

export async function isPlayerBanned(playerName) {
    if (!db) await initDB();
    const now = new Date().toISOString();
    const ban = await db.get(
        `SELECT * FROM bans WHERE player_name = ? AND active = 1 AND expires_at > ? ORDER BY banned_at DESC LIMIT 1`,
        [playerName, now]
    );
    return ban || null;
}

export async function unbanPlayer(playerName) {
    if (!db) await initDB();
    await db.run(`UPDATE bans SET active = 0 WHERE player_name = ? AND active = 1`, playerName);
    await logAction(playerName, 'UNBAN', 'Desbanido manualmente', null, 'Admin');
}

export async function getActiveBan(playerName) {
    if (!db) await initDB();
    const now = new Date().toISOString();
    return await db.get(
        `SELECT * FROM bans WHERE player_name = ? AND active = 1 AND expires_at > ? ORDER BY banned_at DESC LIMIT 1`,
        [playerName, now]
    );
}

// ==================== ACTION HISTORY ====================

export async function logAction(playerName, actionType, reason = null, extra = null, performedBy = 'Admin') {
    if (!db) await initDB();
    await db.run(
        `INSERT INTO action_history (player_name, action_type, reason, extra, performed_by) VALUES (?, ?, ?, ?, ?)`,
        [playerName, actionType, reason, extra, performedBy]
    );
}

export async function getPlayerHistory(playerName) {
    if (!db) await initDB();
    return await db.all(
        `SELECT * FROM action_history WHERE player_name = ? ORDER BY performed_at DESC LIMIT 50`,
        playerName
    );
}

export async function getAllBans() {
    if (!db) await initDB();
    const now = new Date().toISOString();
    return await db.all(
        `SELECT * FROM bans ORDER BY banned_at DESC`
    );
}
