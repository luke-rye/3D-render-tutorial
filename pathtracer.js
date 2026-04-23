/**
 * ====================================================================
 * PATH TRACER - 3D VISUALIZATION & PATH TRACING ENGINE
 * ====================================================================
 * 
 * TABLE OF CONTENTS - Search for these labels with Ctrl+F:
 * ─────────────────────────────────────────────────────────────────
 * 1.  IMPORTS & DEPENDENCIES
 * 2.  SCENE & VIEWPORT SETUP
 * 3.  CAMERA SETUP (3D interactive + static render camera)
 * 4.  RENDERER & CONTROLS (WebGL + OrbitControls + TransformControls)
 * 5.  DEBUG VISUALIZATION SETUP (3D path visualization)
 * 6.  SHAPE MANAGEMENT (Shape class + addShape function)
 * 7.  LIGHTING SYSTEM (PointLight creation + calculation)
 * 8.  SCENE OBJECTS (Initial shapes and lights)
 * 9.  OBJECT SELECTION & UI SYNC (Click-to-select + property binding)
 * 10. UI EVENT LISTENERS (Buttons, sliders, color picker)
 * 11. PATH TRACING ENGINE (tracePath + lighting calculations)
 * 12. ANIMATION LOOP (requestAnimationFrame + viewport updates)
 * 13. 2D CANVAS RENDERING (renderSinglePath + renderFullScene)
 * ─────────────────────────────────────────────────────────────────
 */

/* ====================================================================
   1. IMPORTS & DEPENDENCIES
   ==================================================================== */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

import { 
    nearestHit, 
    reflect, 
    getCosineWeightedSample,
    refract,
    Shape,
    calculateLighting
} from './geometry.js';

/* ====================================================================
   2. SCENE & VIEWPORT SETUP
   ==================================================================== */
const viewport = document.getElementById('viewport-3d');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x333333);

const raycaster = new THREE.Raycaster();

/* ====================================================================
   3. CAMERA SETUP (3D viewport camera + static render camera)
   ==================================================================== */
// Main viewport camera (interactive)
const camera = new THREE.PerspectiveCamera(75, viewport.clientWidth / viewport.clientHeight, 0.1, 1000);
camera.position.set(10, 5, 10);
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld();
scene.add(camera);

// Static camera for rendering (locked position)
const staticCamera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
staticCamera.position.set(5, 5, 10);
staticCamera.lookAt(0, 0, 0);
staticCamera.updateMatrixWorld();
scene.add(staticCamera);

// Camera marker (shows rendering camera position)
const cameraMarkerGeometry = new THREE.ConeGeometry(0.5, 1, 4);
const cameraMarkerMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
const cameraMarker = new THREE.Mesh(cameraMarkerGeometry, cameraMarkerMaterial);
cameraMarker.rotation.x = Math.PI / 2;
cameraMarker.visible = false;
scene.add(cameraMarker);

let isLocked = false;

/**
 * Lock camera for rendering and sync it with the static camera
 */
function lockCameraForRender() {
    isLocked = true;
    staticCamera.position.copy(camera.position);
    staticCamera.quaternion.copy(camera.quaternion);
    staticCamera.updateMatrixWorld();

    cameraMarker.position.copy(camera.position);
    cameraMarker.quaternion.copy(camera.quaternion);
    cameraMarker.visible = true;

    renderFullScene();
    console.log("Camera locked at:", staticCamera.position);
}

/* ====================================================================
   4. RENDERER & CONTROLS (WebGL + OrbitControls + TransformControls)
   ==================================================================== */
// WebGL Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(viewport.clientWidth, viewport.clientHeight);
viewport.appendChild(renderer.domElement);

// Interactive camera controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.01;

// Transform controls for moving/rotating/scaling selected objects
const transformControls = new TransformControls(camera, renderer.domElement);
scene.add(transformControls);

transformControls.addEventListener('dragging-changed', (event) => {
    controls.enabled = !event.value; // Disable orbit while dragging object
});

/* ====================================================================
   5. DEBUG VISUALIZATION SETUP (3D path visualization)
   ==================================================================== */
let pathLines = [];

/**
 * Clear all debug path lines from the 3D scene
 */
function clearPathVisuals() {
    pathLines.forEach(line => scene.remove(line));
    pathLines = [];
}

/**
 * Draw a path line in the 3D scene for visualization
 */
function drawPathIn3D(points, color = 0x00ff00) {
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.8
    });
    const line = new THREE.Line(geometry, material);
    scene.add(line);
    pathLines.push(line);
}

/* ====================================================================
   6. SHAPE MANAGEMENT (Shape class + addShape function)
   ==================================================================== */
/* ====================================================================
   6. SHAPE MANAGEMENT (Shape class + addShape function)
   ==================================================================== */

const sceneObjects = [];

/**
 * Add a shape to the scene
 */
function addShape(type, color = 0x00ff00, position = {x: 0, y: 1, z: 0}, opacity = 1.0) {
    let geometry;

    if (type === 'sphere') {
        geometry = new THREE.SphereGeometry(1, 32, 32);
    } else if (type === 'box') {
        geometry = new THREE.BoxGeometry(2, 2, 2);
    } else if (type === 'plane') {
        geometry = new THREE.PlaneGeometry(20, 20);
    }
    const newShape = new Shape(type, geometry, color);
    newShape.mesh.material.opacity = opacity;

    if (type === 'plane') {
        newShape.mesh.material.side = THREE.DoubleSide;
    } else {
        newShape.mesh.material.side = THREE.FrontSide;
    }

    newShape.mesh.position.set(position.x, position.y, position.z);
    if (type === 'plane') newShape.mesh.rotation.x = -Math.PI / 2;

    scene.add(newShape.mesh);
    sceneObjects.push(newShape.mesh);
    return newShape.mesh;
}

/* ====================================================================
   7. LIGHTING SYSTEM (PointLight creation + shadow calculation)
   ==================================================================== */
const lights = [];

/**
 * Add a point light to the scene with visual bulb
 */
function addPointLight(color = 0xffffff, intensity = 100, position = {x: 5, y: 10, z: 5}) {
    const light = new THREE.PointLight(color, intensity);
    light.position.set(position.x, position.y, position.z);

    // Create a visual bulb so the light is clickable/visible
    const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.5),
        new THREE.MeshBasicMaterial({ color: color })
    );

    light.userData.bulb = bulb;
    light.add(bulb);
    scene.add(light);
    sceneObjects.push(light);
    lights.push(light);

    return light;
}

// Add ambient light for base illumination
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

// Add default point light
const pointLight = addPointLight();

/* ====================================================================
   8. SCENE OBJECTS (Initial shapes)
   ==================================================================== */
// Initialize default scene objects
addShape('plane', 0xCE5555, {x: 0, y: 0, z: 0});
addShape('sphere', 0xeeeeee, {x: -3, y: 1.5, z: 0});
addShape('box', 0x00ff00, {x: 3, y: 3, z: 5}, 0.5); // Cube is 50% transparent

/* ====================================================================
   9. OBJECT SELECTION & UI SYNC (Click-to-select + property binding)
   ==================================================================== */
let selectedObject = null;

// Create a yellow wireframe box for highlighting selected objects
const selectionHighlight = new THREE.BoxHelper(new THREE.Mesh(), 0xffff00);
selectionHighlight.visible = false;
scene.add(selectionHighlight);

/**
 * Sync UI sliders with currently selected object's properties
 */
function syncUISliders() {
    if (!selectedObject) return;

    if (selectedObject.isPointLight) {
        const intensity = selectedObject.intensity;
        document.getElementById('light-intensity-slider').value = intensity;
    } else {
        const colorHex = "#" + selectedObject.material.color.getHexString();
        const size = selectedObject.scale.x;
        const opacity = selectedObject.material.opacity;
        const reflectivity = selectedObject.userData.reflectivity || 0;

        document.getElementById('color-picker').value = colorHex;
        document.getElementById('size-slider').value = size;
        document.getElementById('Opacity-slider').value = opacity;
        document.getElementById('reflectivity-slider').value = reflectivity;
    }
}

/**
 * Select an object and attach transform controls
 */
function selectObject(obj) {
    selectedObject = obj;
    transformControls.attach(obj);
    selectionHighlight.setFromObject(obj);
    selectionHighlight.visible = true;

    if (obj.isPointLight) {
        document.getElementById('inspector-ui').classList.add('inspector-hidden');
    } else {
        document.getElementById('inspector-ui').classList.remove('inspector-hidden');
        syncUISliders();
    }
}

/**
 * Deselect current object and hide controls
 */
function deselectObject() {
    selectedObject = null;
    transformControls.detach();
    selectionHighlight.visible = false;
}

// Click to select objects
renderer.domElement.addEventListener('mousedown', (event) => {
    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    const picker = new THREE.Raycaster();
    picker.setFromCamera(mouse, camera);
    const intersects = picker.intersectObjects(sceneObjects);

    if (intersects.length > 0) {
        let clickedObj = intersects[0].object;
        if (clickedObj.parent && clickedObj.parent.isPointLight) {
            clickedObj = clickedObj.parent;
        }
        selectObject(clickedObj);
    } else {
        deselectObject();
    }
});

/* ====================================================================
   10. UI EVENT LISTENERS (Buttons, sliders, color picker)
   ==================================================================== */
let isEditMode = true;


/**
 * Add Shape button
 */
document.getElementById('add-shape-btn').addEventListener('click', () => {
    const selectedType = document.getElementById('shape-selector').value;
    addShape(selectedType);
});

/**
 * Delete button
 */
document.getElementById('delete-btn').onclick = () => {
    if (selectedObject) {
        scene.remove(selectedObject);
        const index = sceneObjects.indexOf(selectedObject);
        if (index > -1) sceneObjects.splice(index, 1);
        deselectObject();
    }
};

/**
 * Update a property of the selected object
 */
function updateObjectProperty(prop, value) {
    if (!selectedObject) return;

    if (prop === 'color') {
        if (selectedObject.material) {
            selectedObject.material.color.set(value);
        } else if (selectedObject.isPointLight) {
            selectedObject.color.set(value);
            if (selectedObject.userData.bulb) {
                selectedObject.userData.bulb.material.color.set(value);
            }
        }
    }
    if (prop === 'size') {
        selectedObject.scale.set(value, value, value);
        selectedObject.updateMatrixWorld();
    }
    if (prop === 'opacity') selectedObject.material.opacity = value;
    if (prop === 'reflectivity'){selectedObject.userData.reflectivity = value;
    if (selectedObject.material) {
            selectedObject.material.roughness = 1.0 - value; // Higher reflectivity = lower roughness
            selectedObject.material.metalness = value;       // Higher reflectivity = more metallic
        }}
    if (prop === 'intensity') selectedObject.intensity = value;
}

/**
 * Color picker
 */
const colorPicker = document.getElementById('color-picker');
colorPicker.addEventListener('input', (event) => {
    if (selectedObject) {
        const newColor = event.target.value;
        selectedObject.material.color.set(newColor);
        updateObjectProperty('color', newColor);
    }
});

/**
 * Slider listeners
 */
document.getElementById('size-slider').oninput = (e) => updateObjectProperty('size', parseFloat(e.target.value));
document.getElementById('Opacity-slider').oninput = (e) => updateObjectProperty('opacity', parseFloat(e.target.value));
document.getElementById('reflectivity-slider').oninput = (e) => updateObjectProperty('reflectivity', parseFloat(e.target.value));
document.getElementById('light-intensity-slider').oninput = (e) => updateObjectProperty('intensity', parseFloat(e.target.value));

/**
 * Samples slider - Controls quality of path tracing render
 */
document.getElementById('samples-slider').oninput = (e) => {
    MAX_SAMPLE_COUNT = parseInt(e.target.value);
    document.getElementById('samples-value').innerText = MAX_SAMPLE_COUNT;
};

const addLightBtn = document.getElementById('add-light-btn');
addLightBtn.addEventListener('click', () => {
    const newLight = addPointLight(0xffffff, 100, { x: 0, y: 5, z: 0 });
    selectObject(newLight);
    console.log("New light added to scene.");
});


const canvas2D = document.getElementById('render-2d-canvas');
const ctx = canvas2D.getContext('2d');

const width = canvas2D.width;
const height = canvas2D.height;


/* ====================================================================
   11. PATH TRACING ENGINE (tracePath + lighting calculations)
   ==================================================================== */
/**
 * Calculate lighting contribution from all lights

/**
 * Trace a path using stochastic path tracing algorithm
 * Supports reflections, refractions, and diffuse bouncing
 */
function tracePath(origin, dir) {
    let throughput = new THREE.Color(1, 1, 1);
    let accumulatedColor = new THREE.Color(0, 0, 0);
    let currentOrigin = origin;
    let currentDir = dir;

    for (let bounce = 0; bounce < 10; bounce++) {
        const hit = nearestHit(currentOrigin, currentDir, sceneObjects);
        
        if (!hit) {
            // Hit the sky
            accumulatedColor.add(throughput.clone().multiplyScalar(0.02)); 
            break;
        }

        // If we hit an object that emits light
        if (hit.obj.isLight) {
            accumulatedColor.add(throughput.clone().multiply(hit.obj.color));
            break;
        }

        // Add direct lighting from light sources
        const directLighting = calculateLighting(hit, lights, sceneObjects);
        const directColor = hit.obj.material.color.clone().multiplyScalar(directLighting * 0.5);
        accumulatedColor.add(throughput.clone().multiply(directColor));
        const opacity = hit.obj.material.opacity;

    

        // Handle refraction for transparent objects (randomly let the ray pass through based on opacity)
        // 1. STOCHASTIC CHOICE: Pass through or Hit surface?
        if (Math.random() > opacity) {
            // --- REFRACTION (PASS THROUGH) ---
            const ior = 1.5;
            const isEntering = currentDir.dot(hit.normal) < 0;
            const eta = isEntering ? (1.0 / ior) : (ior / 1.0);
            const normal = isEntering ? hit.normal.clone() : hit.normal.clone().multiplyScalar(-1);

            const refractDir = refract(currentDir.clone().normalize(), normal, eta);

            if (refractDir) {
                // Slightly nudge origin to avoid self-intersection
                currentOrigin = hit.point.clone().add(refractDir.clone().multiplyScalar(0.001));
                currentDir = refractDir;
                
                // If opacity is 0, we skip adding any accumulatedColor here
                continue; 
            }
        }

        const reflectivity = hit.obj.userData.reflectivity || 0;

        if (Math.random() < reflectivity) {
            // --- MIRROR BOUNCE ---
            // Use the perfect reflection math from geometry.js
            currentDir = reflect(currentDir, hit.normal);
            
            // Nudge the origin to prevent the ray from hitting the same spot twice
            currentOrigin = hit.point.clone().add(hit.normal.clone().multiplyScalar(0.001));
            
            // Most mirrors don't "tint" the light with their own color as much as diffuse surfaces do,
            continue; 
        } else {
            // --- DIFFUSE BOUNCE ---
            const nextDir = getCosineWeightedSample(hit.normal);
            const nextOrigin = hit.point.clone().add(hit.normal.clone().multiplyScalar(0.001));

            throughput.multiply(hit.obj.material.color);
            currentOrigin = nextOrigin;
            currentDir = nextDir;
        }


        // 2. --- SURFACE HIT (ONLY REACHED IF RAY DID NOT REFRACT) ---
     
        accumulatedColor.add(throughput.clone().multiply(directColor));

        // Standard Diffuse Bounce
        const nextDir = getCosineWeightedSample(hit.normal);
        const nextOrigin = hit.point.clone().add(hit.normal.clone().multiplyScalar(0.001));

        throughput.multiply(hit.obj.material.color);
        currentOrigin = nextOrigin;
        currentDir = nextDir;
    }
    return accumulatedColor;
}

function PathtraceVisualize(origin, dir) {
    let pathPoints = [origin.clone()];
    let curOrigin = origin;
    let curDir = dir;

    for (let i = 0; i < 5; i++) {
        const hit = nearestHit(curOrigin, curDir, sceneObjects);
        if (!hit) {
        pathPoints.push(curOrigin.clone().add(curDir.clone().multiplyScalar(5)));     
        break;
        }
        pathPoints.push(hit.point.clone());
        const opacity = hit.obj.material.opacity;

        if (Math.random() > opacity) {
            const ior = 1.5;
            const isEntering = curDir.dot(hit.normal) < 0;
            const eta = isEntering ? (1.0 / ior) : (ior / 1.0);
            const normal = isEntering ? hit.normal.clone() : hit.normal.clone().multiplyScalar(-1);

            const refractDir = refract(curDir.clone().normalize(), normal, eta);
            if (refractDir) {
                curOrigin = hit.point.clone().add(refractDir.clone().multiplyScalar(0.001));
                curDir = refractDir;
                continue; 
                }}
        const reflectivity = hit.obj.userData.reflectivity || 0;
        if (Math.random() < reflectivity) {
            curDir = reflect(curDir, hit.normal);
        } else {
            // Random Diffuse Scattering
            curDir = getCosineWeightedSample(hit.normal);
        }
            
            
        // Bounce logic (reflection/refraction)
        curDir = getCosineWeightedSample(hit.normal);
        curOrigin = hit.point.clone().add(hit.normal.clone().multiplyScalar(0.001));
    }
    return pathPoints; // This returns Vectors for the 3D lines
}

/**
 * Helper function: Determine if a hit point is visible from camera
 */
function visibleToCamera(point) {
  const toCam = camera.position.clone().sub(point);
  const dist = toCam.length();
  const dirToCam = toCam.clone().normalize();

  // check FOV cone
  const camForward = new THREE.Vector3();
  camera.getWorldDirection(camForward);
  const insideFov = dirToCam.dot(camForward) > Math.cos(THREE.MathUtils.degToRad(camera.fov / 2));
  if (!insideFov) return false;

  // check occlusion: raycast from point+eps towards camera, see if any object lies closer than camera
  const occluded = nearestHit(point.clone().add(dirToCam.clone().multiplyScalar(EPS)), dirToCam, dist - EPS);
  return !occluded;
}

/**
 * Helper function: Trace path from light source for visualization
 */
//trace path returning an array of Vector3 points
function tracePathFromLight(initialDir, maxBounces = 6) {
  const path = [pointLight.position.clone()];
  let origin = pointLight.position.clone();
  let dir = initialDir.clone().normalize();

  for (let i = 0; i < maxBounces; i++) {
    const hit = nearestHit(origin.clone().add(dir.clone().multiplyScalar(EPS)), dir);
    if (!hit) break;
    const hitPoint = origin.clone().add(dir.clone().multiplyScalar(hit.t));
    path.push(hitPoint);

    if (visibleToCamera(hitPoint)) {
      path.push(camera.position.clone());
      return { path, hitCamera: true };
    }

    // simple reflection 
    dir = reflect(dir, hit.normal);
    origin = hitPoint.clone().add(dir.clone().multiplyScalar(EPS));
  }
  return { path, hitCamera: false };
}

/* ====================================================================
   12. ANIMATION LOOP (requestAnimationFrame + viewport updates)
   ==================================================================== */
function animate() {
    requestAnimationFrame(animate);

    if (selectionHighlight.visible) {
        selectionHighlight.update();
    }
    
    controls.update();

    renderer.setSize(viewport.clientWidth, viewport.clientHeight);
    camera.aspect = viewport.clientWidth / viewport.clientHeight;
    camera.updateProjectionMatrix();

    renderer.render(scene, camera);
}

/* ====================================================================
   13. 2D CANVAS RENDERING (renderSinglePath + renderFullScene)
   ==================================================================== */

const GRID_SIZE = 1;

function initCanvas() {
    ctx.fillStyle = '#000000'; // Dark background
    ctx.fillRect(0, 0, width, height);
    
    ctx.strokeStyle = '#ffffff'; // Subtle grid lines
    ctx.lineWidth = 0.15;
    for (let i = 0; i < width; i += 32) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, height); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(width, i); ctx.stroke();
    }
}
initCanvas();

/**
 * Fire a ray from a specific canvas coordinate and return color
 */
// Function to fire a ray from a specific canvas coordinate
function renderSinglePath(x, y) {
    // Add a tiny jitter (anti-aliasing) to the x and y coordinates
    const mouse = new THREE.Vector2(
        ((x + Math.random()) / canvas2D.width) * 2 - 1,
        -((y + Math.random()) / canvas2D.height) * 2 + 1
    );
    
    // Use the global raycaster to create the ray
    raycaster.setFromCamera(mouse, staticCamera);
    const ray = raycaster.ray;
    
    // Return the color from your stochastic path function
    return tracePath(ray.origin, ray.direction);
}

let hoveredPixel = {x: -1, y: -1};
// Event listener for user interaction
canvas2D.addEventListener('mousemove', (e) => {
   if (isRendering) return;

    const rect = canvas2D.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas2D.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas2D.height / rect.height);

    clearPathVisuals();

    const SAMPLES_TO_SHOW = 6;

    for (let i = 0; i < SAMPLES_TO_SHOW; i++) {
        const mouse = new THREE.Vector2(
            ((x + Math.random()) / canvas2D.width) * 2 - 1,
            -((y + Math.random()) / canvas2D.height) * 2 + 1
        );

        raycaster.setFromCamera(mouse, staticCamera);
        
        // Trace the points and draw
        const points = PathtraceVisualize(raycaster.ray.origin, raycaster.ray.direction);
        drawPathIn3D(points, 0x00ff00, 0.4); 
    }
  });


let isRendering = false;
let sampleCount = 0;
let MAX_SAMPLE_COUNT = 200;

// This buffer stores the high-precision color of every pixel
const accumulationBuffer = new Float32Array(canvas2D.width * canvas2D.height * 3);
// This tracks how many times each specific pixel has been sampled
const pixelSampleCounts = new Int32Array(canvas2D.width * canvas2D.height);

function renderLoop() {
    if (!isRendering) return;

     // stops loop running forever.
    if (sampleCount >= MAX_SAMPLE_COUNT) {
        isRendering = false;
        document.getElementById('render-all-btn').innerText = "Render Complete (Clean)";
        console.log("Convergence reached.");
        return; 
    }

    const BATCH_SIZE = 15000; // Increase this for faster convergence
    
    renderAllBtn.innerText = `Refining... (Samples: ${sampleCount})`;

    for (let i = 0; i < BATCH_SIZE; i++) {
        const x = Math.floor(Math.random() * canvas2D.width);
        const y = Math.floor(Math.random() * canvas2D.height);
        
        const pixelColor = renderSinglePath(x, y);

        const idx = (y * canvas2D.width + x);
        accumulationBuffer[idx * 3 + 0] += pixelColor.r;
        accumulationBuffer[idx * 3 + 1] += pixelColor.g;
        accumulationBuffer[idx * 3 + 2] += pixelColor.b;
        pixelSampleCounts[idx]++;

        const exposure = 1.5; // Multiplier for brightness
        const gamma = 2.2;    // Standard monitor gamma

        const count = pixelSampleCounts[idx];
        let r = (accumulationBuffer[idx * 3 + 0] / count) * exposure;
        let g = (accumulationBuffer[idx * 3 + 1] / count) * exposure;
        let b = (accumulationBuffer[idx * 3 + 2] / count) * exposure;

        // Apply Gamma Correction: color = color^(1/gamma)
        r = Math.pow(r, 1/gamma) * 255;
        g = Math.pow(g, 1/gamma) * 255;
        b = Math.pow(b, 1/gamma) * 255;

        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fillRect(x, y, 1, 1);
    }

    sampleCount++;
    requestAnimationFrame(renderLoop);
}
const renderAllBtn = document.getElementById('render-all-btn');
renderAllBtn.addEventListener('click', () => {
    if (isRendering) {
        // Toggle OFF
        isRendering = false;
        renderAllBtn.innerText = "Resume Rendering";
    } else {
        // Toggle ON
        lockCameraForRender(); // Syncs cameras and shows marker
        isRendering = true;
        renderAllBtn.innerText = "Stop Rendering";
        renderLoop();
    }
});


function renderFullScene() {
    
    // 2. Wipe the "Memory" of the image
    accumulationBuffer.fill(0);
    pixelSampleCounts.fill(0);
    
    // 3. Clear the 2D Canvas 
    ctx.clearRect(0, 0, canvas2D.width, canvas2D.height);

    //4. reset the sample count 
    sampleCount = 0

    // 5. Start the infinite loop if it's not already running
    if (!isRendering) {
        isRendering = true;
        renderLoop(); 
    }
}

// Start the animation loop

animate();

