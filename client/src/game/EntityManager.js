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
        this.bubbles = {}; // Armazena balões de fala
    }

    showBubble(id, text) {
        const pId = String(id);
        
        // Remover balão antigo se existir
        if (this.bubbles[pId]) {
            this.nameTagsLayer.removeChild(this.bubbles[pId]);
            clearTimeout(this.bubbles[pId].timer);
        }

        const bubble = document.createElement('div');
        bubble.className = 'speech-bubble';
        bubble.innerText = text;
        this.nameTagsLayer.appendChild(bubble);

        this.bubbles[pId] = bubble;
        
        // Auto-remover após 5 segundos
        bubble.timer = setTimeout(() => {
            if (this.bubbles[pId] === bubble) {
                bubble.style.opacity = '0';
                bubble.style.transform = 'translate(-50%, -100%) scale(0.8)';
                setTimeout(() => {
                    if (this.nameTagsLayer.contains(bubble)) {
                        this.nameTagsLayer.removeChild(bubble);
                    }
                    delete this.bubbles[pId];
                }, 300);
            }
        }, 5000);
    }

    updateOthers(players, currentPlayerName, modelsList, delta, myId) {
        const lerpSpeed = 0.15;
        const currentIds = {};

        // Normalizar IDs para string para evitar erros de comparação
        const myIdStr = myId ? String(myId) : "";

        for (const p of players) {
            const pId = String(p.id);
            if (pId === myIdStr || p.name === currentPlayerName) continue;
            
            currentIds[pId] = true;

            // Se o player é novo, criar representação IMEDIATA
            if (!this.others[pId] && !this.loadingIds.has(pId)) {
                this.loadingIds.add(pId);
                
                console.log(`[ENTITY] Criando novo player proxy: ${p.name} (${pId})`);

                // 1. Criar Proxy (Síncrono) - Invisível ou Pequena Esfera
                // Vamos usar uma pequena esfera de luz como proxy para termos certeza que aparece
                const proxyGeo = new THREE.SphereGeometry(0.3, 8, 8);
                const proxyMat = new THREE.MeshBasicMaterial({ color: 0x39ff14, wireframe: true, transparent: true, opacity: 0.5 });
                const proxyMesh = new THREE.Mesh(proxyGeo, proxyMat);
                proxyMesh.position.set(p.x * this.gridSize, (p.z || 0) * this.layerHeight, p.y * this.gridSize);
                this.scene.add(proxyMesh);

                this.others[pId] = { 
                    mesh: proxyMesh, 
                    mixer: null, 
                    actions: {}, 
                    currentAction: null,
                    isProxy: true,
                    name: p.name
                };
                
                this.createNameTag(pId, p.name);

                // 2. Carregar modelo real em background
                const avatarIndex = Math.abs(pId.split('').reduce((a, b) => a + b.charCodeAt(0), 0)) % modelsList.length;
                const modelFile = modelsList[avatarIndex];

                Assets.load(modelFile).then(realMesh => {
                    // Verificar se o jogador ainda está online antes de substituir
                    if (!this.others[pId]) {
                        this.scene.remove(realMesh);
                        return;
                    }

                    console.log(`[ENTITY] Modelo real carregado para ${p.name}. Substituindo proxy.`);

                    // Remover o proxy da cena
                    this.scene.remove(this.others[pId].mesh);
                    
                    realMesh.scale.set(1.8, 1.8, 1.8);
                    realMesh.position.copy(this.others[pId].mesh.position);
                    this.scene.add(realMesh);
                    
                    const mixer = new THREE.AnimationMixer(realMesh);
                    const actions = {};
                    if (realMesh.animations) {
                        realMesh.animations.forEach(clip => {
                            actions[clip.name.toLowerCase()] = mixer.clipAction(clip);
                        });
                    }

                    // Atualizar o objeto na lista
                    this.others[pId].mesh = realMesh;
                    this.others[pId].mixer = mixer;
                    this.others[pId].actions = actions;
                    this.others[pId].isProxy = false;
                    this.loadingIds.delete(pId);
                }).catch(err => {
                    console.error(`[ENTITY] Falha ao carregar corpo para ${p.name}:`, err);
                    this.loadingIds.delete(pId);
                    // Mantém o proxy para o nome não sumir
                });
            }

            const entity = this.others[pId];
            if (!entity) continue;
            
            const mesh = entity.mesh;
            const targetX = (p.x || 0) * this.gridSize;
            const targetZ = (p.y || 0) * this.gridSize;
            const targetY = (p.z || 0) * this.layerHeight;

            mesh.position.x += (targetX - mesh.position.x) * lerpSpeed;
            mesh.position.z += (targetZ - mesh.position.z) * lerpSpeed;

            // Pulo sincronizado para outros
            if (entity.jumpTime) {
                const jumpFactor = Math.max(0, 1 - (performance.now() - entity.jumpTime) / 300);
                const jump = Math.sin(jumpFactor * Math.PI) * 0.8;
                mesh.position.y += (targetY + jump - mesh.position.y) * lerpSpeed;
            } else {
                mesh.position.y += (targetY - mesh.position.y) * lerpSpeed;
            }

            // Prevenção de NaN
            if (isNaN(mesh.position.x)) mesh.position.x = targetX;
            if (isNaN(mesh.position.z)) mesh.position.z = targetZ;

            // Smooth Rotation
            const targetRot = p.direction || 0; 
            let diff = targetRot - mesh.rotation.y;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            mesh.rotation.y += diff * 0.1;
            
            if (isNaN(mesh.rotation.y)) mesh.rotation.y = targetRot;

            // Animations
            const isMoving = Math.sqrt(Math.pow(targetX - mesh.position.x, 2) + Math.pow(targetZ - mesh.position.z, 2)) > 0.1;
            if (entity.mixer) {
                entity.mixer.update(delta);
                
                // Prioridade para animação de ataque se estiver ativa
                let nextActionName = isMoving ? 'walk' : 'idle';
                if (entity.isAttacking) nextActionName = 'attack'; // Supondo que exista 'attack' no GLB

                const nextAction = entity.actions[nextActionName] || entity.actions['idle'] || Object.values(entity.actions)[0];
                
                if (nextAction && entity.currentAction !== nextAction) {
                    if (entity.currentAction) entity.currentAction.fadeOut(0.2);
                    nextAction.reset().fadeIn(0.2).play();
                    entity.currentAction = nextAction;
                }
            }

            currentIds[pId] = true;
        }

        // Cleanup disconnected
        for (const id in this.others) {
            if (!currentIds[id]) {
                const entity = this.others[id];
                if (entity.mesh) this.scene.remove(entity.mesh);
                if (this.nameTags[id]) this.nameTags[id].remove();
                delete this.others[id];
                delete this.nameTags[id];
            }
        }
    }

    triggerAction(id, type) {
        const entity = this.others[String(id)];
        if (!entity) return;

        if (type === 'jump') {
            entity.jumpTime = performance.now();
        } else if (type === 'attack') {
            entity.isAttacking = true;
            // Se tiver animação de ataque, volta para idle/walk depois de 500ms
            setTimeout(() => {
                entity.isAttacking = false;
            }, 500);
        }
    }

    updateAnimals(animals, models, delta) {
        const currentIds = {};

        for (const a of animals) {
            currentIds[a.id] = true;

            if (!this.animals[a.id] && !this.loadingIds.has(a.id)) {
                this.loadingIds.add(a.id);
                
                const isZombie = a.emoji === '🧟';
                let modelFile = isZombie ? models.ZOMBIE : models.CHICK;
                if (a.mobId === 'pig') modelFile = models.PIG;
                else if (a.mobId === 'deer') modelFile = models.DEER;
                else if (a.mobId === 'owl') modelFile = models.OWL;
                else if (a.mobId === 'zombie') modelFile = models.ZOMBIE;

                Assets.load(modelFile).then(mesh => {
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
                    this.loadingIds.delete(a.id);
                }).catch(err => {
                    console.error("Erro ao carregar animal:", err);
                    this.loadingIds.delete(a.id);
                });
            }

            const entity = this.animals[a.id];
            if (!entity) continue;
            const mesh = entity.mesh;
            const targetX = a.x * this.gridSize;
            const targetZ = a.y * this.gridSize;
            
            // Altura: Corujas voam mais alto
            let targetY = (a.z || 0) * this.layerHeight;
            if (entity.mobId === 'owl') targetY += 1.5;

            mesh.position.x += (targetX - mesh.position.x) * 0.1;
            mesh.position.z += (targetZ - mesh.position.z) * 0.1;
            mesh.position.y += (targetY - mesh.position.y) * 0.1;

            // --- Rotação Suave para Mobs ---
            const dx = targetX - mesh.position.x;
            const dz = targetZ - mesh.position.z;
            if (Math.abs(dx) > 0.05 || Math.abs(dz) > 0.05) {
                const targetRot = Math.atan2(dx, dz);
                let diff = targetRot - mesh.rotation.y;
                while (diff < -Math.PI) diff += Math.PI * 2;
                while (diff > Math.PI) diff -= Math.PI * 2;
                mesh.rotation.y += diff * 0.1;
            }

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

            // --- Gerenciar Name Tag do Animal ---
            if (!this.nameTags[a.id]) {
                const isZombie = a.mobId === 'zombie' || a.emoji === '🧟';
                this.createNameTag(a.id, a.name, false, isZombie);
            }

            // Atualizar Barra de HP do Animal
            const tag = this.nameTags[a.id];
            if (tag) {
                const hpBar = tag.querySelector('.hp-fill');
                if (hpBar) {
                    const pct = Math.max(0, Math.min(100, (a.hp / a.maxHp) * 100));
                    hpBar.style.width = `${pct}%`;
                    hpBar.style.background = pct < 30 ? '#ff3333' : pct < 60 ? '#ffcc00' : '#33ff33';
                }
            }

            currentIds[a.id] = true;
        }

        for (const id in this.animals) {
            if (!currentIds[id]) {
                this.scene.remove(this.animals[id].mesh);
                if (this.nameTags[id]) this.nameTags[id].remove();
                delete this.animals[id];
                delete this.nameTags[id];
            }
        }
    }

    createNameTag(id, name, isMe = false, isZombie = false) {
        if (this.nameTags[id]) return;
        const container = document.createElement('div');
        container.className = `name-tag ${isMe ? 'me' : ''} ${isZombie ? 'zombie' : ''}`;
        
        const label = document.createElement('div');
        label.className = 'name-label';
        // Fallback para nome não vir undefined do server
        label.innerText = name || (isZombie ? 'Zumbi' : 'Animal');
        container.appendChild(label);

        // Barra de HP
        const hpContainer = document.createElement('div');
        hpContainer.className = 'hp-container';
        const hpFill = document.createElement('div');
        hpFill.className = 'hp-fill';
        hpFill.style.width = '100%';
        hpContainer.appendChild(hpFill);
        container.appendChild(hpContainer);

        this.nameTagsLayer.appendChild(container);
        this.nameTags[id] = container;
    }

    updateUI(camera, myPlayerMesh) {
        const tempVec = new THREE.Vector3();
        const widthHalf = window.innerWidth / 2;
        const heightHalf = window.innerHeight / 2;

        const list = [
            { id: 'me', mesh: myPlayerMesh },
            ...Object.keys(this.others).map(id => ({ id, mesh: this.others[id].mesh })),
            ...Object.keys(this.animals).map(id => ({ id, mesh: this.animals[id].mesh, type: 'animal' }))
        ];

        list.forEach(item => {
            const mesh = item.mesh;
            if (!mesh) return;

            // 1. Atualizar NameTags
            if (this.nameTags[item.id]) {
                tempVec.setFromMatrixPosition(mesh.matrixWorld);
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
            }

            // 2. Atualizar Speech Bubbles
            if (this.bubbles[item.id]) {
                tempVec.setFromMatrixPosition(mesh.matrixWorld);
                tempVec.y += 2.8; // Balão fica mais alto que o nome
                tempVec.project(camera);

                const x = (tempVec.x * widthHalf) + widthHalf;
                const y = -(tempVec.y * heightHalf) + heightHalf;

                if (tempVec.z > 1) {
                    this.bubbles[item.id].style.display = 'none';
                } else {
                    this.bubbles[item.id].style.display = 'block';
                    this.bubbles[item.id].style.left = `${x}px`;
                    this.bubbles[item.id].style.top = `${y}px`;
                }
            }
        });
    }

    isOccupied(x, y, z, excludeId, includePlayers) {
        // 1. Verificia monstros
        for (const id in this.animals) {
            const a = this.animals[id];
            if (!a.mesh) continue;

            // Mobs voadores (Coruja) não bloqueiam a não ser que estejam no chão
            if (a.mobId === 'owl') {
                const groundY = Math.round((a.mesh.position.y - 1.3) / this.layerHeight) * this.layerHeight + 1.3;
                if (a.mesh.position.y > groundY + 0.5) continue; // Está voando alto
            }

            // Usamos coordenadas aproximadas do grid para colisão
            const ax = Math.round(a.mesh.position.x / this.gridSize);
            const az = Math.round(a.mesh.position.z / this.gridSize);
            const az_layer = Math.round(a.mesh.position.y / this.layerHeight);
            
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
                const pz_layer = Math.round(p.mesh.position.y / this.layerHeight);
                
                if (px === x && pz === y && pz_layer === z) return true;
            }
        }

        return false;
    }
}

export { EntityManager };
