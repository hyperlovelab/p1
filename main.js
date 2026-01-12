import * as THREE from 'three';
import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.150.1/examples/jsm/loaders/GLTFLoader.js';

const scene = new THREE.Scene();
scene.background = null; 

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const baseCameraY = 0; 
camera.position.set(0, baseCameraY, 10);

const canvas = document.querySelector('#three-canvas');
const video = document.getElementById("webcam");

// [핵심 수정] 웹캠 화면을 화면상에서 완전히 숨김
if (video) {
    video.style.display = "none";
}

const renderer = new THREE.WebGLRenderer({ 
    canvas, 
    antialias: true, 
    alpha: true 
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

// --- 애니메이션 및 효과 변수 ---
let isBlinking = false;
let mouseX = 0, mouseY = 0;
let faceLandmarker;

let riceModel = null;    
let anotherModel = null; 
let gridBox = null;      
let targetGlow = 0;
let currentGlow = 0;
const baseScale = 3.8;

const riceRotation = { x: 0, y: 0, z: 0 };
const anotherRotation = { x: 0, y: -0.5, z: 0 };

let backgroundStep = 0;
let particleSystem;
const particleCount = 150; 
const glowColor = new THREE.Color(0xF09A69); 

// --- 조명 세팅 ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);

const movingLight = new THREE.PointLight(0xffffff, 2.0, 50);
movingLight.position.set(0, 0, 10);
scene.add(movingLight);

const backLight = new THREE.DirectionalLight(0xffffff, 0.8); 
backLight.position.set(0, 0, -10);
scene.add(backLight);

function updateBackgroundColors() {
    backgroundStep++; 
    const newPosY = backgroundStep * 50; 
    document.body.style.backgroundPositionY = `${newPosY}%`;
}

function createGridBox(width, height, depth) {
    const group = new THREE.Group();
    const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
    const thickness = 0.02;
    const createGridPlane = (w, h) => {
        const planeGroup = new THREE.Group();
        const segments = 5;
        for (let i = 0; i <= segments; i++) {
            const row = new THREE.Mesh(new THREE.BoxGeometry(w, thickness, thickness), lineMaterial);
            row.position.y = (i / segments - 0.5) * h;
            planeGroup.add(row);
            const col = new THREE.Mesh(new THREE.BoxGeometry(thickness, h, thickness), lineMaterial);
            col.position.x = (i / segments - 0.5) * w;
            planeGroup.add(col);
        }
        return planeGroup;
    };
    const floor = createGridPlane(width, depth); floor.rotation.x = -Math.PI / 2; floor.position.y = -height / 2; group.add(floor);
    const ceiling = createGridPlane(width, depth); ceiling.rotation.x = Math.PI / 2; ceiling.position.y = height / 2; group.add(ceiling);
    const backWall = createGridPlane(width, height); backWall.position.z = -depth / 2; group.add(backWall);
    const leftWall = createGridPlane(depth, height); leftWall.rotation.y = Math.PI / 2; leftWall.position.x = -width / 2; group.add(leftWall);
    const rightWall = createGridPlane(depth, height); rightWall.rotation.y = -Math.PI / 2; rightWall.position.x = width / 2; group.add(rightWall);
    return group;
}
gridBox = createGridBox(30, 15, 30);
scene.add(gridBox);

function createCircleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');      
    gradient.addColorStop(0.2, 'rgba(255, 230, 150, 0.8)'); 
    gradient.addColorStop(0.5, 'rgba(240, 154, 105, 0.2)'); 
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');      
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(canvas);
}

function createMagicParticles() {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const customData = []; 
    for (let i = 0; i < particleCount; i++) {
        const baseSize = Math.random() * 0.5 + 0.1;
        customData.push({
            radius: Math.random() * 6 + 3,
            speed: Math.random() * 0.4 + 0.1,
            yStep: Math.random() * 5 - 2,
            phase: Math.random() * Math.PI * 2,
            noise: Math.random() * 0.8,
            baseSize: baseSize
        });
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
        color: 0xffffff, size: 0.4, transparent: true, opacity: 0.8,
        map: createCircleTexture(), blending: THREE.AdditiveBlending, depthWrite: false 
    });
    particleSystem = new THREE.Points(geometry, material);
    particleSystem.userData = customData;
    scene.add(particleSystem);
}

const gltfLoader = new GLTFLoader();

function setupModelMaterial(model, useGlow = true) {
    model.traverse((child) => {
        if (child.isMesh && child.material) {
            child.material.metalness = 0.2; 
            child.material.roughness = 0.5;
            if (useGlow) {
                child.material.emissive = glowColor; 
                child.material.emissiveIntensity = 0;
            }
        }
    });
}

function loadModels() {
    gltfLoader.load('./assets/dream2.glb', (gltf) => {
        riceModel = gltf.scene;
        setupModelMaterial(riceModel, false); 
        riceModel.scale.set(baseScale, baseScale, baseScale); 
        riceModel.position.set(0.4, -1.6, -1.6); 
        scene.add(riceModel);
    });

    gltfLoader.load('./assets/moon3.glb', (gltf) => {
         anotherModel = gltf.scene;
         setupModelMaterial(anotherModel, true); 
         anotherModel.scale.set(8, 8, 8); 
         anotherModel.position.set(-2, -5.5, -3); 
         scene.add(anotherModel);
     });
}

async function setupFaceLandmarker() {
    const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm");
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`, delegate: "GPU" },
        outputFaceBlendshapes: true, runningMode: "VIDEO", numFaces: 1
    });
    startCamera();
}

function startCamera() {
    navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } })
        .then((stream) => { 
            video.srcObject = stream; 
            video.addEventListener("loadeddata", predictWebcam); 
        });
}

async function predictWebcam() {
    let startTimeMs = performance.now();
    const results = faceLandmarker.detectForVideo(video, startTimeMs);
    if (results.faceLandmarks && results.faceLandmarks.length > 0) {
        const landmarks = results.faceLandmarks[0];
        mouseX = (landmarks[4].x - 0.5) * -15; 
        mouseY = (0.5 - landmarks[4].y) * 8;
        
        if (results.faceBlendshapes && results.faceBlendshapes.length > 0) {
            const shapes = results.faceBlendshapes[0].categories;
            const blinkL = shapes.find(s => s.categoryName === "eyeBlinkLeft").score;
            const blinkR = shapes.find(s => s.categoryName === "eyeBlinkRight").score;
            if (blinkL > 0.4 && blinkR > 0.4) {
                if (!isBlinking) { targetGlow = 0.5; isBlinking = true; updateBackgroundColors(); }
            } else { isBlinking = false; targetGlow = 0; }
        }
    }
    requestAnimationFrame(predictWebcam);
}

function animate() {
    requestAnimationFrame(animate);
    const time = performance.now() * 0.001;

    const modelGlowSpeed = isBlinking ? 0.2 : 0.03; 
    currentGlow += (targetGlow - currentGlow) * modelGlowSpeed;

    const targetCamX = mouseX * 0.6; 
    const targetCamY = (baseCameraY + mouseY) * 0.6;
    camera.position.x += (targetCamX - camera.position.x) * 0.08;
    camera.position.y += (targetCamY - camera.position.y) * 0.08;
    camera.lookAt(mouseX * -0.3, mouseY * -0.2, 0);

    movingLight.position.x = mouseX * 1.2;
    movingLight.position.y = mouseY * 1.2;

    if (gridBox) {
        gridBox.position.x = mouseX * 0.3;
        gridBox.position.y = mouseY * 0.15;
    }

    if (riceModel) riceModel.rotation.set(riceRotation.x, riceRotation.y, riceRotation.z);
    if (anotherModel) {
        anotherModel.traverse((child) => {
            if (child.isMesh) child.material.emissiveIntensity = currentGlow;
        });
        anotherModel.rotation.set(anotherRotation.x, anotherRotation.y, anotherRotation.z);
    }

    if (particleSystem) {
        // 파티클 기본 점멸 효과 유지
        particleSystem.material.size = 0.2 + (currentGlow * 1.2); 
        particleSystem.material.opacity = 0.6 + currentGlow;

        const positions = particleSystem.geometry.attributes.position.array;
        const data = particleSystem.userData;
        for (let i = 0; i < particleCount; i++) {
            const p = data[i];
            const angle = time * p.speed + p.phase;
            positions[i * 3] = Math.cos(angle) * p.radius + Math.sin(time * 0.5) * p.noise;
            positions[i * 3 + 1] = p.yStep + Math.sin(angle * 0.5) * 3;
            positions[i * 3 + 2] = Math.sin(angle) * p.radius - 3;
        }
        particleSystem.geometry.attributes.position.needsUpdate = true;
    }

    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

setupFaceLandmarker();
loadModels(); 
createMagicParticles();
animate();