import fs from 'fs';
import https from 'https';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ASSETS_DIR = path.join(__dirname, 'client', 'public', 'assets', 'models');
if (!fs.existsSync(ASSETS_DIR)) {
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
}

async function scrapeAndDownload(slug) {
    console.log(`Buscando link para ${slug}...`);
    return new Promise((resolve, reject) => {
        https.get(`https://kenney.nl/assets/${slug}`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const regex = /(https:\/\/kenney\.nl\/media\/[\w\-\.\/]+\.zip)/;
                const match = data.match(regex);
                if (match && match[1]) {
                    const downloadUrl = match[1];
                    console.log(`Encontrado: ${downloadUrl}`);
                    downloadFile(downloadUrl, slug).then(resolve).catch(reject);
                } else {
                    reject(new Error(`Link não encontrado para ${slug}`));
                }
            });
        }).on('error', reject);
    });
}

function downloadFile(url, slug) {
    const zipPath = path.join(__dirname, `${slug}.zip`);
    return new Promise((resolve, reject) => {
        console.log(`Baixando ${url}...`);
        const file = fs.createWriteStream(zipPath);
        https.get(url, (response) => {
            if(response.statusCode === 302 || response.statusCode === 301) {
                https.get(response.headers.location, (res2) => {
                    res2.pipe(file);
                    file.on('finish', () => {
                        file.close(() => { extractAndClean(zipPath, slug); resolve(); });
                    });
                }).on('error', reject);
            } else {
                response.pipe(file);
                file.on('finish', () => {
                    file.close(() => {
                        file.end();
                        extractAndClean(zipPath, slug); 
                        resolve(); 
                    });
                });
            }
        }).on('error', (err) => {
            fs.unlink(zipPath, () => {});
            reject(err);
        });
    });
}

function extractAndClean(zipPath, slug) {
    console.log(`Extraindo ${zipPath}...`);
    const tempDir = path.join(__dirname, `temp_${slug}`);
    try {
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
        execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${tempDir}' -Force"`);
        console.log(`Extraído para ${tempDir}`);
        
        // Busca recursiva por arquivos .glb e .gltf
        console.log(`Buscando modelos 3D em ${tempDir}...`);
        
        // Comando powershell para buscar recursivamente e copiar
        const copyCmd = `powershell -Command "Get-ChildItem -Path '${tempDir}' -Filter *.glb -Recurse | Copy-Item -Destination '${ASSETS_DIR}' -Force -ErrorAction SilentlyContinue"`;
        const copyCmdGltf = `powershell -Command "Get-ChildItem -Path '${tempDir}' -Filter *.gltf -Recurse | Copy-Item -Destination '${ASSETS_DIR}' -Force -ErrorAction SilentlyContinue"`;
        const copyCmdTextures = `powershell -Command "Get-ChildItem -Path '${tempDir}' -Directory -Filter Textures -Recurse | Copy-Item -Destination '${ASSETS_DIR}' -Recurse -Force -ErrorAction SilentlyContinue"`;
        
        execSync(copyCmd);
        execSync(copyCmdGltf);
        execSync(copyCmdTextures);

        console.log(`Modelos e Texturas movidos para ${ASSETS_DIR}`);
    } catch(e) {
        console.error(`Erro ao processar ${slug}:`, e.message);
    } finally {
        // Limpeza opcional (comentada para debug se necessário, mas vou reativar para não lotar o disco)
        try { fs.unlinkSync(zipPath); } catch(e){}
        try { execSync(`powershell -Command "Remove-Item -Path '${tempDir}' -Recurse -Force"`); } catch(e){}
    }
}

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

async function main() {
    try {
        await scrapeAndDownload('fantasy-town-kit');
        await scrapeAndDownload('platformer-kit');
        await scrapeAndDownload('cube-pets');
        await scrapeAndDownload('graveyard-kit');
        await scrapeAndDownload('survival-kit');
        console.log("Assets baixados e preparados!");
        validateAssets();
    } catch (err) {
        console.error("Erro no processo principal:", err.message);
    }
}

main();
