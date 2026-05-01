import * as THREE from 'three';
import { Assets } from '../engine/Assets.js';

class WorldManager {
    constructor(scene, gridSize, layerHeight) {
        this.scene = scene;
        this.gridSize = gridSize; // 2.0
        this.layerHeight = layerHeight;
        
        // Em vez de grupos globais únicos, teremos um mapa de grupos por chunk
        // "cx,cy" -> THREE.Group
        this.loadedChunks = new Map();
        
        this.helpersGroup = new THREE.Group();
        this.scene.add(this.helpersGroup);
        
        // "x,y,z" -> true
        this.obstacles = new Set();
        this.playerCollisionEnabled = false;
        
        this.models = null;
        this.CHUNK_SIZE = 30;
    }

    async init(data, models) {
        this.models = models;
        if (data.serverConfig) {
            this.playerCollisionEnabled = data.serverConfig.playerCollision;
        }

        // --- 1. CONFIGURAÇÃO DE AMBIENTE (BIOMA) ---
        const biome = data.biome || 'floresta';
        const biomeConfigs = {
            floresta: { sky: 0x87ceeb, fog: 0x87ceeb },
            neve:     { sky: 0xe0f0ff, fog: 0xe0f0ff },
            savana:   { sky: 0xffe0a0, fog: 0xffe0a0 },
            prado:    { sky: 0xa0ffda, fog: 0xa0ffda },
            pantano:  { sky: 0x608060, fog: 0x406040 }
        };
        const config = biomeConfigs[biome] || biomeConfigs.floresta;

        // Atualizar cor do céu e neblina de forma robusta
        if (this.scene) {
            const skyColor = new THREE.Color(config.sky);
            this.scene.background = skyColor;
            if (this.scene.fog) {
                this.scene.fog.color.copy(skyColor);
                this.scene.fog.near = 50;
                this.scene.fog.far = 250;
            }
        }
    }

    async loadChunk(chunkData) {
        const { cx, cy, objects, specials, biome } = chunkData;
        const key = `${cx},${cy}`;
        
        if (this.loadedChunks.has(key)) return; // Já está carregado

        const chunkGroup = new THREE.Group();
        this.scene.add(chunkGroup);
        this.loadedChunks.set(key, chunkGroup);

        // --- RENDERIZAR CHÃO ---
        const biomeColors = { floresta: 0x4a7a3a, neve: 0xd8e8f0, savana: 0xc8a040, prado: 0x6abf50, pantano: 0x3d5e35 };
        const groundColor = biomeColors[biome || 'floresta'];
        const chunkW = this.CHUNK_SIZE * this.gridSize;
        const chunkH = this.CHUNK_SIZE * this.gridSize;
        
        const offsetX = cx * this.CHUNK_SIZE;
        const offsetY = cy * this.CHUNK_SIZE;

        const groundGeo = new THREE.PlaneGeometry(chunkW, chunkH);
        const groundMat = new THREE.MeshPhongMaterial({ color: groundColor, shininess: 10, flatShading: true });
        const groundPlane = new THREE.Mesh(groundGeo, groundMat);
        groundPlane.rotation.x = -Math.PI / 2;
        
        // Centro do chunk em coordenadas de mundo
        const centerX = (offsetX * this.gridSize) + (chunkW / 2) - (this.gridSize / 2);
        const centerZ = (offsetY * this.gridSize) + (chunkH / 2) - (this.gridSize / 2);
        groundPlane.position.set(centerX, 0, centerZ);
        groundPlane.receiveShadow = true;
        chunkGroup.add(groundPlane);

        // --- RENDERIZAR OBJETOS ---
        for (const obj of (objects || [])) {
            const file = obj.file || 'pine.glb';
            const model = await Assets.load(file);
            if (model) {
                const mesh = model.clone();
                const zCoord = obj.z || 0;
                mesh.position.set(obj.x * this.gridSize, zCoord * this.layerHeight, obj.y * this.gridSize);
                
                if (file.includes('tree') || file.includes('pine') || file.includes('cactus')) {
                    mesh.scale.set(2.0, 2.0, 2.0);
                } else {
                    mesh.scale.set(1.5, 1.5, 1.5);
                }

                mesh.rotation.y = obj.rotation || 0;
                
                mesh.traverse(child => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                        if (child.material) child.material.needsUpdate = true;
                    }
                });
                
                chunkGroup.add(mesh);
                this.obstacles.add(`${obj.x},${obj.y},${zCoord}`);
            }
        }

        // --- RENDERIZAR ESPECIAIS ---
        if (specials && this.models) {
            const stairModel = await Assets.load(this.models.STAIRS);
            for (const s of specials) {
                if (s.type === 'stair') {
                    const stair = stairModel.clone();
                    stair.position.set(s.x * this.gridSize, s.z * this.layerHeight, s.y * this.gridSize);
                    stair.scale.set(1.5, 1.5, 1.5);
                    chunkGroup.add(stair);
                }
            }
        }
    }

    unloadChunk(cx, cy) {
        const key = `${cx},${cy}`;
        const chunkGroup = this.loadedChunks.get(key);
        if (chunkGroup) {
            this.scene.remove(chunkGroup);
            chunkGroup.traverse(child => {
                if (child.isMesh) {
                    child.geometry.dispose();
                    if(child.material.dispose) child.material.dispose();
                }
            });
            this.loadedChunks.delete(key);
            
            // Recalcular obstáculos pode ser caro, mas a predição de movimento é leve.
            // Para maior robustez em MMOs, mantemos server-authoritative.
        }
    }

    updateChunks(activeChunksData) {
        const newKeys = new Set(activeChunksData.map(c => `${c.cx},${c.cy}`));
        
        // Descarrega chunks que saíram do alcance
        for (const [key, group] of this.loadedChunks.entries()) {
            if (!newKeys.has(key)) {
                const [cx, cy] = key.split(',');
                this.unloadChunk(Number(cx), Number(cy));
            }
        }

        // Carrega novos chunks que entraram no alcance
        for (const chunkData of activeChunksData) {
            this.loadChunk(chunkData);
        }
    }

    showBorders(visible) {
        // Desabilitado temporariamente no modo chunks infinito
    }

    isWalkable(x, y, z) {
        // Colisão client-side para predição rápida
        if (this.obstacles.has(`${x},${y},${z}`)) return false;
        return true;
    }
}

export { WorldManager };
