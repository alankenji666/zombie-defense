import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

class AssetsManager {
    constructor() {
        this.loader = new GLTFLoader();
        this.cache = {};
        this.totalAssets = 0;
        this.loadedAssets = 0;
        this.onProgressCallback = null;
    }

    async load(file) {
        if (this.cache[file]) {
            const clone = SkeletonUtils.clone(this.cache[file].scene);
            clone.animations = this.cache[file].animations;
            return clone;
        }

        return new Promise((resolve, reject) => {
            this.loader.load(
                `/assets/models/${file}`,
                (gltf) => {
                    console.log(`[Assets] Carregado: ${file}`);
                    const model = gltf.scene;
                    model.traverse(n => {
                        if (n.isMesh) {
                            n.castShadow = true;
                            n.receiveShadow = true;
                        }
                    });
                    this.cache[file] = gltf;
                    this.loadedAssets++;
                    this.updateProgress();
                    
                    const clone = SkeletonUtils.clone(model);
                    clone.animations = gltf.animations;
                    resolve(clone);
                },
                (xhr) => {
                    // console.log((xhr.loaded / xhr.total * 100) + '% loaded');
                },
                (error) => {
                    console.error(`[Assets] Error loading ${file}:`, error);
                    reject(error);
                }
            );
        });
    }

    updateProgress() {
        if (this.onProgressCallback && this.totalAssets > 0) {
            const percent = Math.round((this.loadedAssets / this.totalAssets) * 100);
            this.onProgressCallback(percent);
        }
    }
    async preload(fileList, onProgress) {
        const uniqueFiles = [...new Set(fileList)];
        this.totalAssets = uniqueFiles.length;
        this.loadedAssets = 0;
        this.onProgressCallback = onProgress;
        
        const promises = uniqueFiles.map(f => this.load(f).catch(e => {
            console.error(`[Assets] Falha crítica ao carregar ${f}:`, e);
            this.loadedAssets++; // Conta como "carregado" (mesmo que erro) para não travar a barra
            this.updateProgress();
            return this.createFallback();
        }));
        
        return Promise.all(promises);
    }

    createFallback() {
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshPhongMaterial({ color: 0xff00ff });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        return mesh;
    }
}

export const Assets = new AssetsManager();
