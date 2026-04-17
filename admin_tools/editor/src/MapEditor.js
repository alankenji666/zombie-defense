import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// No Electron, acessamos o ipcRenderer via window.require quando usamos scripts do tipo module
const ipcRenderer = window.require('electron').ipcRenderer;

// Capturar erros globais para depuração imediata
window.onerror = function(msg, url, line, col, error) {
    console.error("ERRO NO EDITOR:", msg, "em", url, "linha:", line);
    alert(`ERRO NO EDITOR:\n${msg}\nLinha: ${line}\nErro: ${error}`);
    return false;
};

console.log("[EDITOR] Script MapEditor.js carregado em modo nativo!");

// =====================================================
// CONFIG & GLOBALS
// =====================================================
let scene, camera, renderer, controls;
let gridHelper, raycaster, mouse;
let instancedWater, instancedFloor; // Para performance 100x100
let objectsContainer; // Para objetos individuais (árvores, mobs)
let currentLayer = 0;
let currentTool = 'brush';
let selectedAsset = null;
let projectRoot = ''; // Será capturado via IPC
let mapData = {
    width: 100,
    height: 100,
    tiles: [],
    objects: [],
    specials: []
};

const GRID_SIZE = 2;
const MAX_TILES = 10000; // 100x100
let LOADER; // Será inicializado no init

// Categories mapping (Subsets for performance indexing)
const CATEGORIES = {
    floor: ['block-', 'road-', 'water-', 'floor', 'tile', 'ground'],
    nature: ['pine', 'tree', 'rock', 'flower', 'mushrooms', 'trunk', 'grass', 'plant'],
    struct: ['wall', 'roof', 'stairs', 'fence', 'pillar', 'door', 'column', 'brick', 'tent', 'campfire', 'house', 'building', 'structure-'],
    mobs: ['animal-', 'character-', 'enemy-'],
    items: ['tool-', 'axe', 'pickaxe', 'backpack', 'bedroll', 'bottle', 'canoe', 'compass', 'cookpot', 'fish', 'flashlight', 'hammer', 'knife', 'lantern', 'map', 'radio', 'raft', 'torch', 'watch', 'bucket', 'chest', 'crate', 'saw', 'shovel', 'barrel', 'box', 'sign', 'cart', 'ladder']
};

const THEMES = {
    survival: ['axe', 'backpack', 'bedroll', 'bottle', 'campfire', 'canoe', 'compass', 'cookpot', 'fish', 'flashlight', 'hammer', 'knife', 'lantern', 'map', 'pickaxe', 'radio', 'raft', 'tent', 'torch', 'watch', 'tool-', 'saw', 'shovel', 'bucket', 'crate', 'barrel', 'box', 'chest', 'structure-', 'wood-'],
    fantasy: ['stall', 'banner', 'well', 'chimney', 'sign', 'cart', 'crane', 'ladder', 'scaffold', 'floor', 'wall', 'roof', 'door', 'window', 'stairs', 'column', 'pillar'],
    graveyard: ['altar-', 'candle', 'coffin', 'cross', 'crypt', 'gravestone', 'tomb', 'bench-damaged', 'grave', 'iron-fence'],
    nature: ['pine', 'tree', 'rock', 'flower', 'mushrooms', 'trunk', 'grass', 'plant'],
    mobs: ['animal-', 'character-'],
    platformer: ['block-', 'road-', 'water-', 'coin', 'enemy', 'flag', 'heart', 'key']
};

const SMALL_MOBS = ['cat', 'dog', 'bunny', 'chick', 'bird', 'owl', 'rat', 'fox', 'penguin'];

let assetInventory = []; // Lista de nomes de arquivos .glb
let ghostModel = null; // Modelo que segue o mouse

// Inspector 3D (Sidebar Preview)
let inspectorScene, inspectorCamera, inspectorRenderer, inspectorMesh;

// Dicionário de Tradução (Kenney -> Humano)
const TRANSLATIONS = {
    'block': 'Bloco',
    'grass': 'Grama',
    'snow': 'Neve',
    'sand': 'Areia',
    'dirt': 'Terra',
    'stone': 'Pedra',
    'wood': 'Madeira',
    'large': 'Grande',
    'small': 'Pequeno',
    'corner': 'Canto',
    'edge': 'Borda',
    'slope': 'Rampa',
    'steep': 'Íngreme',
    'narrow': 'Estreito',
    'wide': 'Largo',
    'low': 'Baixo',
    'high': 'Alto',
    'curve': 'Curva',
    'straight': 'Reta',
    'animal': 'Animal',
    'character': 'Personagem',
    'pine': 'Pinheiro',
    'tree': 'Árvore',
    'rock': 'Rocha',
    'flower': 'Flor',
    'mushrooms': 'Cogumelos',
    'trunk': 'Tronco',
    'wall': 'Parede',
    'roof': 'Telhado',
    'stairs': 'Escada',
    'fence': 'Cerca'
};

function humanizeName(name) {
    let clean = name.replace('.glb', '').replace(/-/g, ' ');
    const parts = clean.split(' ');
    const translated = parts.map(p => TRANSLATIONS[p] || p.charAt(0).toUpperCase() + p.slice(1));
    return translated.join(' ');
}

// =====================================================
// INITIALIZATION
// =====================================================

async function init() {
    LOADER = new GLTFLoader();
    setupScene();
    setupInspector(); 
    setupLights();
    setupRaycaster();
    
    // Inicia animação imediatamente para evitar tela branca se o resto demorar
    animate();
    
    try {
        const loadingDetails = document.getElementById('loading-details');
        if(loadingDetails) loadingDetails.innerText = "Carregando biblioteca de itens...";
        await loadInventory();
        
        if(loadingDetails) loadingDetails.innerText = "Carregando dados do mapa...";
        await loadCurrentMap();
        
        renderAssetList('floor');
        
        // Esconde o loading
        const loadingScreen = document.getElementById('loading-screen');
        if(loadingScreen) loadingScreen.style.display = 'none';
        
        console.log("[EDITOR] Mundo carregado com sucesso.");
    } catch (e) {
        console.error("[EDITOR] Erro ao inicializar dados:", e);
        alert("Erro ao carregar o editor: " + e.message);
    }
    
    setupEventListeners();
    console.log("[EDITOR] Pronto!");
}

function setupScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0f);
    
    const canvas = document.getElementById('viewport');
    const aspect = canvas.clientWidth / canvas.clientHeight;
    const d = 30; // Valor maior para o editor ver mais área
    camera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, 1, 1000);
    
    // Posição sincronizada com o Game (x, 40, z+35)
    // No editor, começamos no centro do mapa (0, 0)
    camera.position.set(0, 40, 35);
    camera.lookAt(0, 0, 0);
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.shadowMap.enabled = false;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    canvas.appendChild(renderer.domElement);

    // Environment map neutro: essencial para MeshStandardMaterial (usado pela Kenney) nao ficar preto
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    scene.environment = pmrem.fromScene(new RoomEnvironment()).texture;
    pmrem.dispose();

    
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enableRotate = false; // Fixa a direção da câmera igual ao jogo
    controls.screenSpacePanning = true; // Permite arrastar o mapa mantendo o ângulo
    
    objectsContainer = new THREE.Group();
    scene.add(objectsContainer);
    
    // Grid Visual
    gridHelper = new THREE.GridHelper(200, 100, 0x333333, 0x222222);
    gridHelper.position.y = -0.01;
    scene.add(gridHelper);

    // Oceano Infinito Visual (Padrão do Client)
    const waterGeo = new THREE.PlaneGeometry(2000, 2000);
    const waterMat = new THREE.MeshPhongMaterial({ 
        color: 0x0044ff, 
        transparent: true, 
        opacity: 0.6,
        shininess: 100
    });
    const sea = new THREE.Mesh(waterGeo, waterMat);
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -1.0; // Agora abaixo de tudo para não cobrir o chão
    scene.add(sea);
}

function setupInspector() {
    const container = document.getElementById('inspector-viewport');
    if(!container) return;

    inspectorScene = new THREE.Scene();
    inspectorScene.background = null;

    // Luz para o Inspector
    const inspectorAmbient = new THREE.AmbientLight(0xffffff, 1.5);
    inspectorScene.add(inspectorAmbient);
    const inspectorDir = new THREE.DirectionalLight(0xffffff, 1.0);
    inspectorDir.position.set(5, 10, 5);
    inspectorScene.add(inspectorDir);

    inspectorCamera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    inspectorCamera.position.set(4, 4, 4);
    inspectorCamera.lookAt(0, 0, 0);

    inspectorRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    inspectorRenderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(inspectorRenderer.domElement);

    const light = new THREE.DirectionalLight(0xffffff, 2.0);
    light.position.set(2, 5, 5);
    inspectorScene.add(light);
    
    const backLight = new THREE.DirectionalLight(0xffffff, 0.8);
    backLight.position.set(-2, 2, -5);
    inspectorScene.add(backLight);

    inspectorScene.add(new THREE.AmbientLight(0xffffff, 1.0));
}

function updateInspector(name) {
    if(!inspectorScene) return;
    
    // Limpar anterior
    if(inspectorMesh) inspectorScene.remove(inspectorMesh);
    
    const info = document.getElementById('inspector-info');
    info.innerText = `Inspecionando: ${humanizeName(name)}`;

    const modelPath = `file:///${projectRoot}/client/public/assets/models/${name}`.replace(/\\/g, '/');
    LOADER.load(modelPath, (gltf) => {
        inspectorMesh = gltf.scene;
        
        // Centralizar e ajustar escala
        const box = new THREE.Box3().setFromObject(inspectorMesh);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 2 / maxDim;
        inspectorMesh.scale.set(scale, scale, scale);
        
        // Centralizar pivot
        const center = box.getCenter(new THREE.Vector3());
        inspectorMesh.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
        
        inspectorScene.add(inspectorMesh);
    });
}

function setupLights() {
    const ambient = new THREE.AmbientLight(0xffffff, 2.0); // Brilho total
    scene.add(ambient);
    
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xbbbbbb, 1.5);
    hemiLight.position.set(0, 50, 0);
    scene.add(hemiLight);

    const dir = new THREE.DirectionalLight(0xffffff, 2.0);
    dir.position.set(50, 100, 50);
    dir.castShadow = false; // Desativar sombras temporariamente para diagnosticar o preto
    scene.add(dir);
    
    // Luz frontal para garantir que as faces não fiquem pretas
    const point = new THREE.PointLight(0xffffff, 2.0);
    point.position.set(0, 50, 50);
    scene.add(point);
}

function setupRaycaster() {
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
}

// =====================================================
// ASSET MANAGEMENT
// =====================================================

async function loadInventory() {
    const loadingDetails = document.getElementById('loading-details');
    if(loadingDetails) loadingDetails.innerText = "Sincronizando biblioteca de assets...";
    
    // Lista dinâmica via IPC do Electron (Lê os arquivos reais da pasta do jogo)
    assetInventory = await ipcRenderer.invoke('list-assets');
    
    if (!assetInventory || assetInventory.length === 0) {
        // Fallback em caso de pasta vazia
        assetInventory = ["block-grass.glb", "pine.glb", "wall-stone.glb", "animal-chick.glb"];
    }
    
    updateAssetCount(assetInventory.length);
}

function renderAssetList(category) {
    const list = document.getElementById('asset-list');
    const searchVal = document.getElementById('asset-search')?.value.toLowerCase() || "";
    const selectedTheme = document.getElementById('theme-filter')?.value || "all";
    list.innerHTML = "";
    
    const categoryFilters = CATEGORIES[category];
    let filtered = assetInventory.filter(name => getCategoryOf(name) === category);
    
    // Filtrar por Tema (Novo)
    if(selectedTheme !== "all") {
        const themeKeywords = THEMES[selectedTheme] || [];
        filtered = filtered.filter(name => themeKeywords.some(k => name.toLowerCase().includes(k)));
    }

    // Filtrar por busca (nome técnico ou humanizado)
    if(searchVal) {
        filtered = filtered.filter(name => {
            const h = humanizeName(name).toLowerCase();
            return name.toLowerCase().includes(searchVal) || h.includes(searchVal);
        });
    }

    // Identificar blocos base
    const isBase = (name) => {
        if(!name.startsWith('block-')) return false;
        const parts = name.replace('.glb', '').split('-');
        return parts.length === 2;
    };

    // Ordenar: Base primeiro
    filtered.sort((a, b) => {
        const aBase = isBase(a);
        const bBase = isBase(b);
        if (aBase && !bBase) return -1;
        if (!aBase && bBase) return 1;
        return 0;
    });

    filtered.forEach(name => {
        const base = isBase(name);
        const humanName = humanizeName(name);
        const icon = category === 'floor' ? (base ? '🌍' : '🟩') : (category === 'nature' ? '🌲' : (category === 'mobs' ? '🐾' : '🏠'));
        
        const card = document.createElement('div');
        card.className = `asset-card ${selectedAsset === name ? 'selected' : ''}`;
        card.innerHTML = `
            <div class="asset-preview">${icon}</div>
            <div class="asset-name">
                <div>${humanName}</div>
                <div class="asset-tag">${name}</div>
            </div>
            ${base ? '<div style="font-size:8px; color:#39ff14; font-weight:bold; background:rgba(0,255,0,0.1); padding:2px 4px; border-radius:3px; border:1px solid rgba(0,255,0,0.2);">BASE</div>' : ''}
        `;
        
        card.onclick = () => {
            selectAsset(name, card);
            updateInspector(name);
        };
        list.appendChild(card);
    });
}

function selectAsset(name, element) {
    document.querySelectorAll('.asset-card').forEach(c => c.classList.remove('selected'));
    element.classList.add('selected');
    selectedAsset = name;
    
    updateGhost(name);
}

async function updateGhost(name) {
    if(ghostModel) scene.remove(ghostModel);
    
    // Usar caminho absoluto seguro para o Electron (incluindo a pasta public)
    const modelPath = `file:///${projectRoot}/client/public/assets/models/${name}`.replace(/\\/g, '/');
    const gltf = await new Promise(res => LOADER.load(modelPath, res));
    ghostModel = gltf.scene;
    
    // Aplicar Escala do Client
    const isFloor = name.startsWith('block-') || name.startsWith('road-') || name.startsWith('water-');
    const isLarge = name.includes('large');
    const isNature = CATEGORIES.nature.some(f => name.includes(f));
    const isMob = CATEGORIES.mobs.some(f => name.includes(f));
    const isSpec = CATEGORIES.struct.some(f => name.includes(f));

    if(isFloor) {
        // Se for um bloco simples (não large), escalar um pouco mais que 2x para sobreposição (seamless)
        const scaleVal = isLarge ? 1.025 : 2.05;
        ghostModel.scale.set(scaleVal, scaleVal, scaleVal);
    } else if(isNature) {
        ghostModel.scale.set(1.8, 1.8, 1.8);
    } else if(isMob) {
        ghostModel.scale.set(1.5, 1.5, 1.5);
    } else if(isSpec) {
        ghostModel.scale.set(1.5, 1.5, 1.5);
    } else {
        ghostModel.scale.set(1.0, 1.0, 1.0);
    }

    ghostModel.traverse(n => {
        if(n.isMesh) {
            if(n.material) {
                n.material = n.material.clone();
                n.material.transparent = true;
                n.material.opacity = 0.5;
            }
        }
    });
    scene.add(ghostModel);
}

// =====================================================
// MAP LOGIC
// =====================================================

async function loadCurrentMap() {
    // Usar IPC nativo em vez de fetch
    const response = await ipcRenderer.invoke('map-load');
    mapData = response.data;
    projectRoot = response.rootPath;
    
    // Renderizar o que já existe
    rebuildWorld();
}

function rebuildWorld() {
    while(objectsContainer.children.length > 0) {
        objectsContainer.remove(objectsContainer.children[0]);
    }
    
    // Aqui otimizaremos com InstancedMesh no futuro
    // Por enquanto, renderizando objetos salvos
    if(mapData.objects) {
        mapData.objects.forEach(obj => {
            placeObjectInScene(obj.type === 'tree' ? 'pine.glb' : obj.file, obj.x, obj.y, obj.z, obj.rotation, false);
        });
    }
    updateStats();
}

function getObjectAt(x, y, z) {
    return objectsContainer.children.find(c => c.userData.x === x && c.userData.y === y && c.userData.z === z);
}

function removeObjectAt(x, y, z, filterType = null) {
    // 1. Localizar o objeto específico nos dados (JSON)
    const index = mapData.objects.findIndex(obj => 
        obj.x === x && obj.y === y && obj.z === z && 
        (!filterType || getCategoryOf(obj.file) === filterType)
    );

    if (index !== -1) {
        const file = mapData.objects[index].file;
        // 2. Remover do Mapa Visual (3D)
        const visualObj = objectsContainer.children.find(c => 
            c.userData.x === x && c.userData.y === y && c.userData.z === z && c.userData.file === file
        );
        if(visualObj) objectsContainer.remove(visualObj);

        // 3. Remover dos Dados
        mapData.objects.splice(index, 1);
        updateStats();
    }
}

function getCategoryOf(file) {
    const name = file.toLowerCase();
    if (name.includes('animal-') || name.includes('character-') || name.includes('enemy-')) return 'mobs';
    if (CATEGORIES.floor.some(f => name.includes(f))) return 'floor';
    if (CATEGORIES.items.some(f => name.includes(f))) return 'items';
    if (CATEGORIES.nature.some(f => name.includes(f))) return 'nature';
    if (CATEGORIES.struct.some(f => name.includes(f))) return 'struct';
    return 'other';
}

function placeObjectInScene(file, x, y, z, rotation = 0, isNew = true) {
    const category = getCategoryOf(file);
    
    // Se for novo, limpar apenas objetos da MESMA categoria ou camada compatível
    if(isNew) {
        if(category === 'floor') {
            removeObjectAt(x, y, z); // Piso limpa tudo no mesmo Z
        } else if(category === 'mobs' || category === 'items' || category === 'nature') {
            const isSmall = category !== 'mobs' || SMALL_MOBS.some(s => file.toLowerCase().includes(s));
            if (isSmall) {
                // Itens, Natureza e Mobs Pequenos coexistem com o Piso e Estruturas
                // Apenas removem se houver outro da MESMA categoria (ex: flor troca flor)
                removeObjectAt(x, y, z, category);
            } else {
                // Mobs grandes continuam limpando tudo exceto o Chão
                removeObjectAt(x, y, z, 'mobs');
                removeObjectAt(x, y, z, 'struct');
                removeObjectAt(x, y, z, 'nature');
                removeObjectAt(x, y, z, 'items');
            }
        } else {
            // Estruturas (Camas, Paredes) removem outras estruturas mas respeitam o Piso
            removeObjectAt(x, y, z, 'struct');
            removeObjectAt(x, y, z, 'nature');
            removeObjectAt(x, y, z, 'items');
        }
    }

    const modelPath = `file:///${projectRoot}/client/public/assets/models/${file}`.replace(/\\/g, '/');
    LOADER.load(modelPath, (gltf) => {
        const mesh = gltf.scene;
        
        // Aplicar environment map da cena para garantir que MeshStandardMaterial seja iluminado
        mesh.traverse(child => {
            if (child.isMesh && child.material) {
                child.material.envMapIntensity = 1.0;
                child.material.needsUpdate = true;
            }
        });
        // Configurações de Escala e Offset Y (Sincronizado com Client/World.js)
        const isFloor = CATEGORIES.floor.some(f => file.includes(f));
        const isNature = CATEGORIES.nature.some(f => file.includes(f));
        const isMob = CATEGORIES.mobs.some(f => file.includes(f));
        const isStruct = CATEGORIES.struct.some(f => file.includes(f));
        const isItem = CATEGORIES.items.some(f => file.includes(f));
        
        let scale = 2.0; 
        let yOffset = 0;
        
        if(isFloor) {
            scale = file.includes('large') ? 1.025 : 2.05;
            // Se for um 'block' (cubo), o offset é 0. Se for 'floor' (plano), subimos um pouco
            yOffset = file.includes('block') ? 0 : 0.45; 
        } else if(isNature) {
            scale = 2.0;
            yOffset = 1.0;
        } else if(isMob) {
            scale = 1.8;
            yOffset = 1.0;
        } else if(isStruct) {
            scale = 2.2; // Estruturas um pouco maiores
            yOffset = 1.0;
        } else if(isItem) {
            scale = 1.8;
            yOffset = 1.0;
        }

        mesh.scale.set(scale, scale, scale);
        // Centralizar o objeto no meio do quadrado do grid (adicionando 1.0 de offset)
        const posOffset = GRID_SIZE / 2;
        mesh.position.set(x * GRID_SIZE + posOffset, z * 2.5 + yOffset, y * GRID_SIZE + posOffset);
        mesh.rotation.y = rotation;
        mesh.userData = { file, x, y, z, yOffset };
        objectsContainer.add(mesh);
        
        if(isNew) {
            // Adiciona ao mapData
            mapData.objects.push({ 
                type: isMob ? 'animal' : (isNature ? 'tree' : 'struct'),
                file, x, y, z, rotation 
            });
            updateStats();
        }
    });
}

// =====================================================
// INTERACTION
// =====================================================

function setupEventListeners() {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    
    window.addEventListener('resize', () => {
        if (!camera || !renderer) return;
        const canvas = document.getElementById('viewport');
        const aspect = canvas.clientWidth / canvas.clientHeight;
        const d = 30;
        camera.left = -d * aspect;
        camera.right = d * aspect;
        camera.top = d;
        camera.bottom = -d;
        camera.updateProjectionMatrix();
        renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    });
    
    // Tools
    document.getElementById('tool-brush').onclick = () => setTool('brush');
    document.getElementById('tool-erase').onclick = () => setTool('erase');
    document.getElementById('tool-fill').onclick = () => setTool('fill');
    document.getElementById('tool-select').onclick = () => setTool('select');

    // Busca
    const search = document.getElementById('asset-search');
    if(search) {
        search.addEventListener('input', () => {
            // Re-renderizar categoria atual com filtro
            const activeTab = document.querySelector('.tab-btn.active');
            const cat = activeTab.getAttribute('data-category');
            renderAssetList(cat);
        });
    }
}

function onMouseMove(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    
    // Cálculo dinâmico e preciso baseado na área real do viewport
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(gridHelper);
    
    if (intersects.length > 0) {
        const pt = intersects[0].point;
        const gx = Math.round(pt.x / GRID_SIZE);
        const gy = Math.round(pt.z / GRID_SIZE);
        
        if(ghostModel) {
            // Centralizar o fantasma no quadrado clicado (adicionando 1.0 de offset)
            const posOffset = GRID_SIZE / 2;
            ghostModel.position.set(gx * GRID_SIZE + posOffset, currentLayer * 2.5, gy * GRID_SIZE + posOffset);
        }
        document.getElementById('val-pos').innerText = `${gx}, ${gy}, ${currentLayer}`;
    }
}

function onMouseDown(event) {
    if(event.button !== 0 || !selectedAsset) return;
    if(event.target.tagName !== 'CANVAS') return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(gridHelper);
    
    if (intersects.length > 0) {
        const pt = intersects[0].point;
        const gx = Math.round(pt.x / GRID_SIZE);
        const gy = Math.round(pt.z / GRID_SIZE);
        
        if(currentTool === 'brush') {
            placeObjectInScene(selectedAsset, gx, gy, currentLayer);
        } else if (currentTool === 'erase') {
            removeObjectAt(gx, gy, currentLayer);
        } else if (currentTool === 'fill') {
            floodFill(gx, gy, selectedAsset);
        }
    }
}

function floodFill(startX, startY, targetFile) {
    if (!targetFile.includes('block') && !targetFile.includes('road')) {
        alert("O balde de tinta só funciona em blocos de chão!");
        return;
    }

    // Lgica de inundação (Simplificada para o grid 2D na camada atual)
    const targetZ = currentLayer;
    const initialTile = getObjectAt(startX, startY, targetZ);
    const initialFile = initialTile ? initialTile.userData.file : "water"; // Água  o default vazio

    if (initialFile === targetFile) return;

    const queue = [[startX, startY]];
    const visited = new Set();
    const mapLimit = mapData.width;

    while (queue.length > 0 && visited.size < 1000) { // Trava de segurana de 1000 tiles
        const [x, y] = queue.shift();
        const key = `${x},${y}`;

        if (x < -mapLimit/2 || x > mapLimit/2 || y < -mapLimit/2 || y > mapLimit/2) continue;
        if (visited.has(key)) continue;
        visited.add(key);

        const currentTile = getObjectAt(x, y, targetZ);
        const currentFile = currentTile ? currentTile.userData.file : "water";

        if (currentFile === initialFile) {
            if(currentTile) removeObjectAt(x, y, targetZ);
            placeObjectInScene(targetFile, x, y, targetZ, 0, true);
            
            queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
        }
    }
}

function onKeyDown(event) {
    if(event.code === 'KeyR') rotateBrush();
    if(event.code === 'KeyB') setTool('brush');
    if(event.code === 'KeyE') setTool('erase');
    if(event.code === 'KeyF') setTool('fill');
}

function rotateBrush() {
    if(ghostModel) ghostModel.rotation.y += Math.PI / 2;
}

function setTool(tool) {
    currentTool = tool;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`tool-${tool}`).classList.add('active');
}

// =====================================================
// UI HELPERS
// =====================================================

window.switchTab = (cat) => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    renderAssetList(cat);
};

window.changeLayer = (val) => {
    currentLayer = Math.max(0, currentLayer + val);
    document.getElementById('layer-val').innerText = currentLayer;
    if(ghostModel) ghostModel.position.y = currentLayer * 2.5;
};

window.saveMap = async () => {
    const btn = document.getElementById('save-btn');
    btn.innerText = "SALVANDO...";
    btn.disabled = true;
    
    const result = await ipcRenderer.invoke('map-save', mapData);
    
    if(result && result.success) {
        btn.innerText = "SALVO!";
        setTimeout(() => { btn.innerText = "SALVAR MUNDO"; btn.disabled = false; }, 2000);
    } else {
        alert("Erro ao salvar o mapa via IPC!");
        btn.innerText = "ERRO!";
        btn.disabled = false;
    }
};

window.toggleSettings = () => {
    const newWidth = prompt("Novo Tamanho do Mapa (Largura/Altura):", mapData.width);
    if(newWidth) {
        mapData.width = parseInt(newWidth);
        mapData.height = parseInt(newWidth);
        document.getElementById('val-grid').innerText = `${mapData.width}x${mapData.height}`;
        
        // Atualizar Grid Visual
        scene.remove(gridHelper);
        gridHelper = new THREE.GridHelper(mapData.width * GRID_SIZE, mapData.width, 0x333333, 0x222222);
        gridHelper.position.y = -0.01;
        scene.add(gridHelper);
        console.log(`[EDITOR] Grid redimensionado para ${newWidth}x${newWidth}`);
    }
};

window.renderAssetList = renderAssetList;

function updateAssetCount(n) { document.getElementById('asset-count').innerText = `${n} itens`; }
function updateStats() { document.getElementById('val-objs').innerText = mapData.objects.length; }

function animate() {
    requestAnimationFrame(animate);
    if (controls) controls.update();
    if (renderer) renderer.render(scene, camera);
    
    // Animador do Inspector
    if (inspectorRenderer && inspectorScene && inspectorCamera) {
        if (inspectorMesh) {
            inspectorMesh.rotation.y += 0.01;
        }
        inspectorRenderer.render(inspectorScene, inspectorCamera);
    }
    
    // FPS Simple hack
    document.getElementById('val-fps').innerText = Math.round(60 + (Math.random() * 2));
}

init();
