import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAP_PATH = path.resolve(__dirname, '../../data/map_initial.json');
const BACKUP_DIR = path.resolve(__dirname, '../../data/backups');

class MapsManager {
    constructor() {
        if (!fs.existsSync(BACKUP_DIR)) {
            fs.mkdirSync(BACKUP_DIR, { recursive: true });
        }
    }

    loadMap() {
        if (!fs.existsSync(MAP_PATH)) {
            // Mapa padrão 100x100 vazio (água)
            return {
                width: 100,
                height: 100,
                tiles: [],
                objects: [],
                specials: [
                    { type: 'stair', x: 18, y: 15, z: 0, targetZ: 1 },
                    { type: 'stair', x: 19, y: 15, z: 1, targetZ: 0 }
                ]
            };
        }
        try {
            const data = fs.readFileSync(MAP_PATH, 'utf8');
            return JSON.parse(data);
        } catch (e) {
            console.error("[MAPS] Erro ao ler mapa:", e);
            return null;
        }
    }

    saveMap(mapData) {
        try {
            // 1. Manter Backups (Rotação de 5)
            this.rotateBackups();

            // 2. Salvar mapa principal
            fs.writeFileSync(MAP_PATH, JSON.stringify(mapData, null, 2), 'utf8');
            console.log("[MAPS] Mapa salvo com sucesso!");
            return true;
        } catch (e) {
            console.error("[MAPS] Erro ao salvar mapa:", e);
            return false;
        }
    }

    rotateBackups() {
        if (!fs.existsSync(MAP_PATH)) return;

        // map.json -> backup_1.json -> backup_2.json ... -> backup_5.json
        for (let i = 5; i > 1; i--) {
            const oldPath = path.join(BACKUP_DIR, `map_v${i - 1}.json`);
            const newPath = path.join(BACKUP_DIR, `map_v${i}.json`);
            if (fs.existsSync(oldPath)) {
                fs.renameSync(oldPath, newPath);
            }
        }
        const firstBackup = path.join(BACKUP_DIR, `map_v1.json`);
        fs.copyFileSync(MAP_PATH, firstBackup);
    }
}

export const mapsManager = new MapsManager();
