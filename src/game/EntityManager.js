import * as THREE from 'three';
import { Assets } from '../engine/Assets.js';

class EntityManager {
    constructor(scene, layerHeight, gridSize) {
        this.scene = scene;
        this.layerHeight = layerHeight;
        this.gridSize = gridSize;
        this.others = {};
        this.animals = {};
        this.nameTags = {};
        this.nameTagsLayer = document.getElementById('name-tags-layer');
        this.loadingIds = new Set();
    }

    async updateOthers(players, currentPlayerName, modelsList, delta) {
        const lerpSpeed = 0.15;
        const currentIds = {};

        for (const p of players) {
            if (p.name === currentPlayerName) continue;
            currentIds[p.id] = true;

            if (!this.others[p.id] && !this.loadingIds.has(p.id)) {
                this.loadingIds.add(p.id);
                try {
                    const avatarIndex = Math.abs(p.id.split('').reduce((a, b) => a + b.charCodeAt(0), 0)) % modelsList.length;
                    const mesh = await Assets.load(modelsList[avatarIndex]);
                    mesh.scale.set(1.8, 1.8, 1.8);
                    this.scene.add(mesh);
                    
                    // Init Mixer
                    const mixer = new THREE.AnimationMixer(mesh);
                    const actions = {};
                    if (mesh.animations) {
                        mesh.animations.forEach(clip => {
                            actions[clip.name.toLowerCase()] = mixer.clipAction(clip);
                        });
                    }

                    this.others[p.id] = { mesh, mixer, actions, currentAction: null };
                    this.createNameTag(p.id, p.name);
                } finally {
                    this.loadingIds.delete(p.id);
                }
            }

            const entity = this.others[p.id];
            if (!entity) continue;
            const mesh = entity.mesh;
            const targetX = p.x * this.gridSize;
            const targetZ = p.y * this.gridSize;
            const targetY = (p.z || 0) * this.layerHeight + 1.5;

            mesh.position.x += (targetX - mesh.position.x) * lerpSpeed;
            mesh.position.z += (targetZ - mesh.position.z) * lerpSpeed;
            mesh.position.y += (targetY - mesh.position.y) * lerpSpeed;

            // Smooth Rotation
            const targetRot = p.direction; // Enviado pelo server como radianos
            let diff = targetRot - mesh.rotation.y;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            mesh.rotation.y += diff * 0.2;

            // Animations
            const isMoving = Math.sqrt(Math.pow(targetX - mesh.position.x, 2) + Math.pow(targetZ - mesh.position.z, 2)) > 0.1;
            if (entity.mixer) {
                entity.mixer.update(delta);
                const nextActionName = isMoving ? 'walk' : 'idle';
                const nextAction = entity.actions[nextActionName] || entity.actions['idle'] || Object.values(entity.actions)[0];
                
                if (nextAction && entity.currentAction !== nextAction) {
                    if (entity.currentAction) entity.currentAction.fadeOut(0.2);
                    nextAction.reset().fadeIn(0.2).play();
                    entity.currentAction = nextAction;
                }
            }

            currentIds[p.id] = true;
        }

        // Cleanup disconnected
        for (const id in this.others) {
            if (!currentIds[id]) {
                this.scene.remove(this.others[id].mesh);
                if (this.nameTags[id]) this.nameTags[id].remove();
                delete this.others[id];
                delete this.nameTags[id];
            }
        }
    }

    async updateAnimals(animals, models, delta) {
        const currentIds = {};

        for (const a of animals) {
            currentIds[a.id] = true;

            if (!this.animals[a.id] && !this.loadingIds.has(a.id)) {
                this.loadingIds.add(a.id);
                try {
                    const isZombie = a.emoji === '🧟';
                    let modelFile = isZombie ? models.ZOMBIE : models.CHICK;
                    
                    // Mapeamento dinâmico baseado no mobId
                    if (a.mobId === 'pig') modelFile = models.PIG;
                    else if (a.mobId === 'deer') modelFile = models.DEER;
                    else if (a.mobId === 'owl') modelFile = models.OWL;
                    else if (a.mobId === 'zombie') modelFile = models.ZOMBIE;

                    const mesh = await Assets.load(modelFile);
                    mesh.scale.set(1.5, 1.5, 1.5);
                    this.scene.add(mesh);
                    
                    const mixer = new THREE.AnimationMixer(mesh);
                    const actions = {};
                    if (mesh.animations) {
                        mesh.animations.forEach(clip => {
                            actions[clip.name.toLowerCase()] = mixer.clipAction(clip);
                        });
                    }
                    
                    this.animals[a.id] = { mesh, mixer, actions, currentAction: null, mobId: a.mobId };
                } finally {
                    this.loadingIds.delete(a.id);
                }
            }

            const entity = this.animals[a.id];
            if (!entity) continue;
            const mesh = entity.mesh;
            const targetX = a.x * this.gridSize;
            const targetZ = a.y * this.gridSize;
            
            // Altura: Corujas voam mais alto
            let targetY = (a.z || 0) * this.layerHeight + 1.3;
            if (entity.mobId === 'owl') targetY += 1.5;

            mesh.position.x += (targetX - mesh.position.x) * 0.1;
            mesh.position.z += (targetZ - mesh.position.z) * 0.1;
            mesh.position.y += (targetY - mesh.position.y) * 0.1;

            const isMoving = Math.sqrt(Math.pow(targetX - mesh.position.x, 2) + Math.pow(targetZ - mesh.position.z, 2)) > 0.1;
            
            if (entity.mixer) {
                entity.mixer.update(delta);
                const nextActionName = isMoving ? 'walk' : 'idle';
                const nextAction = entity.actions[nextActionName] || entity.actions['idle'] || Object.values(entity.actions)[0];
                
                if (nextAction && entity.currentAction !== nextAction) {
                    if (entity.currentAction) entity.currentAction.fadeOut(0.2);
                    nextAction.reset().fadeIn(0.2).play();
                    entity.currentAction = nextAction;
                }
            }

            currentIds[a.id] = true;
        }

        for (const id in this.animals) {
            if (!currentIds[id]) {
                this.scene.remove(this.animals[id].mesh);
                delete this.animals[id];
            }
        }
    }

    createNameTag(id, name, isMe = false) {
        if (this.nameTags[id]) return;
        const el = document.createElement('div');
        el.className = `name-tag ${isMe ? 'me' : ''}`;
        el.innerText = name;
        this.nameTagsLayer.appendChild(el);
        this.nameTags[id] = el;
    }

    updateUI(camera, myPlayerMesh) {
        const tempVec = new THREE.Vector3();
        const widthHalf = window.innerWidth / 2;
        const heightHalf = window.innerHeight / 2;

        const list = [
            { id: 'me', mesh: myPlayerMesh },
            ...Object.keys(this.others).map(id => ({ id, mesh: this.others[id].mesh }))
        ];

        list.forEach(item => {
            if (!item.mesh || !this.nameTags[item.id]) return;
            
            tempVec.setFromMatrixPosition(item.mesh.matrixWorld);
            tempVec.y += 1.8;
            tempVec.project(camera);

            const x = (tempVec.x * widthHalf) + widthHalf;
            const y = -(tempVec.y * heightHalf) + heightHalf;

            if (tempVec.z > 1) {
                this.nameTags[item.id].style.display = 'none';
            } else {
                this.nameTags[item.id].style.display = 'block';
                this.nameTags[item.id].style.left = `${x}px`;
                this.nameTags[item.id].style.top = `${y}px`;
            }
        });
    }

    isOccupied(x, y, z, excludeId, includePlayers) {
        // 1. Verificia monstros (Sempre bloqueiam)
        for (const id in this.animals) {
            const a = this.animals[id];
            if (!a.mesh) continue;
            // Usamos coordenadas aproximadas do grid para colisão
            const ax = Math.round(a.mesh.position.x / this.gridSize);
            const az = Math.round(a.mesh.position.z / this.gridSize);
            // Consideramos z como camada
            const az_layer = Math.round((a.mesh.position.y - 1.3) / this.layerHeight);
            
            if (ax === x && az === y && az_layer === z) return true;
        }

        // 2. Verifica outros jogadores (Se a config permitir colisão)
        if (includePlayers) {
            for (const id in this.others) {
                if (id === excludeId) continue;
                const p = this.others[id];
                if (!p.mesh) continue;
                const px = Math.round(p.mesh.position.x / this.gridSize);
                const pz = Math.round(p.mesh.position.z / this.gridSize);
                const pz_layer = Math.round((p.mesh.position.y - 1.5) / this.layerHeight);
                
                if (px === x && pz === y && pz_layer === z) return true;
            }
        }

        return false;
    }
}

export { EntityManager };
