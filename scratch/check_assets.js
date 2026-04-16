import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ASSETS_DIR = path.join(__dirname, '..', 'public', 'assets', 'models');

function validateAssets() {
    console.log("--- Verificando Integridade dos Assets ---");
    const criticalFiles = [
        'character-oobi.glb',
        'character-oodi.glb',
        'character-ooli.glb',
        'character-oopi.glb',
        'character-oozi.glb',
        'character-zombie.glb',
        'pine.glb',
        'animal-chick.glb',
        'block-grass-large-tall.glb'
    ];
    
    let missing = 0;
    criticalFiles.forEach(file => {
        const fullPath = path.join(ASSETS_DIR, file);
        if (fs.existsSync(fullPath)) {
            const stats = fs.statSync(fullPath);
            console.log(`[OK] ${file} (${Math.round(stats.size/1024)} KB)`);
        } else {
            console.error(`[FALTA] ${file} NÃO ENCONTRADO!`);
            missing++;
        }
    });

    if (missing === 0) {
        console.log("--- Todos os assets críticos estão presentes! ---");
    } else {
        console.warn(`--- AVISO: ${missing} assets críticos estão faltando! ---`);
    }
}

validateAssets();
