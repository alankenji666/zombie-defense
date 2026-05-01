import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CHUNKS_DIR = path.resolve(__dirname, '../../data/chunks');
const CHUNK_SIZE = 30;

class MapsManager {
    constructor() {
        if (!fs.existsSync(CHUNKS_DIR)) {
            fs.mkdirSync(CHUNKS_DIR, { recursive: true });
        }
        this.migrateOldMap();
    }

    getChunkPath(cx, cy) {
        return path.join(CHUNKS_DIR, `chunk_${cx}_${cy}.json`);
    }

    migrateOldMap() {
        const oldMapPath = path.resolve(__dirname, '../../data/map_initial.json');
        const defaultChunkPath = this.getChunkPath(0, 0);
        
        if (fs.existsSync(oldMapPath) && !fs.existsSync(defaultChunkPath)) {
            console.log("[MAPS] Migrando mapa antigo para chunk_0_0.json...");
            try {
                const data = fs.readFileSync(oldMapPath, 'utf8');
                const parsed = JSON.parse(data);
                parsed.cx = 0;
                parsed.cy = 0;
                fs.writeFileSync(defaultChunkPath, JSON.stringify(parsed, null, 2), 'utf8');
            } catch(e) {
                console.error("[MAPS] Erro na migração:", e);
            }
        }
    }

    loadChunk(cx, cy) {
        const chunkPath = this.getChunkPath(cx, cy);
        if (!fs.existsSync(chunkPath)) {
            return {
                cx: cx,
                cy: cy,
                width: CHUNK_SIZE,
                height: CHUNK_SIZE,
                tiles: [],
                objects: [],
                specials: []
            };
        }
        try {
            const data = fs.readFileSync(chunkPath, 'utf8');
            return JSON.parse(data);
        } catch (e) {
            console.error(`[MAPS] Erro ao ler chunk ${cx},${cy}:`, e);
            return null;
        }
    }

    saveChunk(cx, cy, chunkData) {
        try {
            const chunkPath = this.getChunkPath(cx, cy);
            fs.writeFileSync(chunkPath, JSON.stringify(chunkData, null, 2), 'utf8');
            console.log(`[MAPS] Chunk ${cx},${cy} salvo com sucesso!`);
            return true;
        } catch (e) {
            console.error(`[MAPS] Erro ao salvar chunk ${cx},${cy}:`, e);
            return false;
        }
    }
}

export const mapsManager = new MapsManager();
