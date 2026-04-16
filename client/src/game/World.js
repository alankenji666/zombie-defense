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

        const MAP_SIZE = data.MAP_WIDTH || 30;
        this.MAP_WIDTH = MAP_SIZE;
        this.MAP_HEIGHT = MAP_SIZE;
        
        if (data.serverConfig) {
            this.playerCollisionEnabled = data.serverConfig.playerCollision;
        }

        // Ground
        const groundModel = await Assets.load(models.GROUND);
        for (let x = 0; x < data.MAP_WIDTH; x++) {
            for (let y = 0; y < data.MAP_HEIGHT; y++) {
                const tile = groundModel.clone();
                tile.position.set(x * this.gridSize, 0, y * this.gridSize);
                // Escala 1.0 para alinhamento perfeito
                tile.scale.set(1.0, 1.0, 1.0); 
                this.groundGroup.add(tile);
            }
        }

        // Criar GridHelper único para representar o mapa
        const totalSize = MAP_SIZE * this.gridSize;
        this.gridHelper = new THREE.GridHelper(totalSize, MAP_SIZE, 0x00ff00, 0x00ff00);
        // O GridHelper é centralizado no (0,0), então movemos para o centro das tiles
        // Tiles vão de 0 a (size-1)*gridSize. O centro é ((size-1)*gridSize)/2
        const offset = ((MAP_SIZE - 1) * this.gridSize) / 2;
        this.gridHelper.position.set(offset, 1.1, offset);
        this.gridHelper.visible = false;
        this.helpersGroup.add(this.gridHelper);

        // Trees
        const treeModel = await Assets.load(models.TREE);
        for (const t of data.trees) {
            const tree = treeModel.clone();
            const zCoord = t.z || 0;
            tree.position.set(t.x * this.gridSize, zCoord * this.layerHeight, t.y * this.gridSize);
            tree.scale.set(1.8, 1.8, 1.8);
            tree.rotation.y = Math.random() * Math.PI;
            this.treesGroup.add(tree);
            // Registrar obstáculo (x,y,z)
            this.obstacles.add(`${t.x},${t.y},${t.z || 0}`);
        }

        // Specials (Stairs, etc.)
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
