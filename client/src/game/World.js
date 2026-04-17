import * as THREE from 'three';
import { Assets } from '../engine/Assets.js';

class WorldManager {
    constructor(scene, gridSize, layerHeight) {
        this.scene = scene;
        this.gridSize = gridSize; // 2.0
        this.layerHeight = layerHeight;
        this.groundGroup = new THREE.Group();
        this.treesGroup = new THREE.Group();
        this.specialsGroup = new THREE.Group();
        
        this.scene.add(this.groundGroup);
        this.scene.add(this.treesGroup);
        this.scene.add(this.specialsGroup);

        this.helpersGroup = new THREE.Group();
        this.scene.add(this.helpersGroup);
        this.gridHelper = null;
        this.obstacles = new Set();
        this.playerCollisionEnabled = false;
    }

    async init(data, models) {
        // Clear existing
        this.groundGroup.clear();
        this.treesGroup.clear();
        this.specialsGroup.clear();
        this.helpersGroup.clear();
        this.gridHelper = null;
        this.obstacles.clear();

        const MAP_SIZE_W = data.MAP_WIDTH || 30;
        const MAP_SIZE_H = data.MAP_HEIGHT || 30;
        this.MAP_WIDTH = MAP_SIZE_W;
        this.MAP_HEIGHT = MAP_SIZE_H;
        
        // --- 1. CONFIGURAÇÃO DE AMBIENTE (BIOMA) ---
        const biome = data.biome || 'floresta';
        const biomeConfigs = {
            floresta: { ground: 'block-grass-large.glb', sky: 0x87ceeb, fog: 0x87ceeb },
            neve:     { ground: 'block-snow-large.glb',  sky: 0xe0f0ff, fog: 0xe0f0ff },
            savana:   { ground: 'block-sand-large.glb',  sky: 0xffe0a0, fog: 0xffe0a0 },
            prado:    { ground: 'block-grass-large.glb', sky: 0xa0ffda, fog: 0xa0ffda },
            pantano:  { ground: 'block-dirt-large.glb',  sky: 0x608060, fog: 0x406040 }
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

        if (data.serverConfig) {
            this.playerCollisionEnabled = data.serverConfig.playerCollision;
        }

        // --- 2. RENDERIZAR CHÃO (ESTILO EDITOR) ---
        const biomeColors = {
            floresta: 0x4a7a3a,
            neve:     0xd8e8f0,
            savana:   0xc8a040,
            prado:    0x6abf50,
            pantano:  0x3d5e35
        };
        const groundColor = biomeColors[biome] || 0x4a7a3a;
        const mapW = MAP_SIZE_W * this.gridSize;
        const mapH = MAP_SIZE_H * this.gridSize;
        
        // Centro exato das tiles (para alinhar com o GridHelper)
        const centerX = ((MAP_SIZE_W - 1) * this.gridSize) / 2;
        const centerZ = ((MAP_SIZE_H - 1) * this.gridSize) / 2;

        const groundGeo = new THREE.PlaneGeometry(mapW, mapH);
        const groundMat = new THREE.MeshPhongMaterial({ 
            color: groundColor, 
            shininess: 10,
            flatShading: true
        });
        const groundPlane = new THREE.Mesh(groundGeo, groundMat);
        groundPlane.rotation.x = -Math.PI / 2;
        groundPlane.position.set(centerX, 0, centerZ); // Centralizado nas tiles
        groundPlane.receiveShadow = true;
        this.groundGroup.add(groundPlane);

        // Grid Helper (visual para debug se ativado)
        // Usamos o maior lado para garantir que cubra tudo se não for quadrado
        const maxDim = Math.max(MAP_SIZE_W, MAP_SIZE_H);
        const totalSize = maxDim * this.gridSize;
        this.gridHelper = new THREE.GridHelper(totalSize, maxDim, 0x00ff00, 0x004400);
        this.gridHelper.position.set(centerX, 0.05, centerZ); // Exatamente no mesmo centro do chão
        this.gridHelper.visible = false;
        this.helpersGroup.add(this.gridHelper);

        // --- 3. RENDERIZAR OBJETOS (Árvores, Pedras, Mobs estáticos) ---
        const worldObjects = data.objects || [];
        for (const obj of worldObjects) {
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
                
                // Garantir sombras e iluminação nos objetos
                mesh.traverse(child => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                        if (child.material) {
                            child.material.needsUpdate = true;
                        }
                    }
                });
                
                this.treesGroup.add(mesh);
                this.obstacles.add(`${obj.x},${obj.y},${obj.z || 0}`);
            }
        }

        // --- 4. RENDERIZAR ESPECIAIS (Escadas, etc.) ---
        if (data.specials) {
            const stairModel = await Assets.load(models.STAIRS);
            for (const s of data.specials) {
                if (s.type === 'stair') {
                    const stair = stairModel.clone();
                    stair.position.set(s.x * this.gridSize, s.z * this.layerHeight, s.y * this.gridSize);
                    stair.scale.set(1.5, 1.5, 1.5);
                    this.specialsGroup.add(stair);
                }
            }
        }
    }

    showBorders(visible) {
        if (this.gridHelper) {
            this.gridHelper.visible = visible;
        }
    }

    isWalkable(x, y, z) {
        // 1. Limites do Mapa
        if (x < 0 || x >= this.MAP_WIDTH || y < 0 || y >= this.MAP_HEIGHT) return false;

        // 2. Árvores (Obstáculos Estáticos)
        if (this.obstacles.has(`${x},${y},${z}`)) return false;

        return true;
    }
}

export { WorldManager };
