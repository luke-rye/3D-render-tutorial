/**
 * ====================================================================
 * RAY TRACER - 3D VISUALIZATION & RAY TRACING ENGINE
 * ====================================================================
 * 
 * TABLE OF CONTENTS - Search for these labels with Ctrl+F:
 * ─────────────────────────────────────────────────────────────────
 * 1.  IMPORTS & DEPENDENCIES
 * 2.  DEBUG VISUALIZATION SETUP (Arrows for ray tracing)
 * 3.  SCENE INITIALIZATION 
 * 4.  CAMERA SETUP (3D viewport + static render camera)
 * 5.  RENDERER & CONTROLS (WebGL + OrbitControls + TransformControls)
 * 6.  SHAPE MANAGEMENT (Shape class + addShape function)
 * 7.  LIGHTING SYSTEM (PointLight creation + shadow calculation)
 * 8.  OBJECT SELECTION & UI SYNC (Click-to-select + property binding)
 * 9.  UI EVENT LISTENERS (Buttons, sliders, color picker)
 * 10. RAY TRACING ENGINE (traceRay + lighting calculations)
 * 11. 2D CANVAS RENDERING (renderPixel + renderFullScene)
 * 12. ANIMATION LOOP (requestAnimationFrame + viewport updates)
 * 13. INITIALIZE & START (Canvas setup + event setup)
 * ─────────────────────────────────────────────────────────────────
 */

// ===== 1. IMPORTS & DEPENDENCIES =====
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

import { 
    nearestHit, 
    reflect, 
    refract,
    Shape,
    calculateLighting
} from './geometry.js';

// ===== 2. DEBUG VISUALIZATION SETUP (Arrows for ray tracing) =====
// Bounce arrows for visualizing complete ray path
const bounceArrows = [];  // bounceArrows[depth]
const bounceColors = [
    0xff0000, // Red for Primary Ray
    0x00ff00, // Green for First Bounce
    0x00ffff, // Cyan for Second Bounce
    0xffff00, // Yellow for Third Bounce
    0xff00ff, // Magenta for Fourth Bounce
    0xff8800, // Orange for Fifth Bounce
    0xff0088, // Pink for Sixth Bounce
    0x88ff00, // Lime for Seventh Bounce
    0x0088ff, // Light Blue for Eighth Bounce
    0xff8888  // Light Red for Ninth Bounce
];

// Create bounce arrows for each possible depth
const MAX_DEPTH = 10;
for (let d = 0; d < MAX_DEPTH; d++) {
    const arrow = new THREE.ArrowHelper(
        new THREE.Vector3(0, 1, 0), 
        new THREE.Vector3(0, 0, 0), 
        1, 
        bounceColors[d % bounceColors.length]
    );
    bounceArrows.push(arrow);
}

// Shadow feelers to each light at each bounce depth (will be created dynamically)
const shadowArrows = [];     // shadowArrows[depth][lightIndex]
const shadowColors = [
    0xFFFF00, // Yellow
    0xFF00FF, // Magenta
    0x00FFFF, // Cyan
    0xFFAA00, // Orange
    0xAA00FF, // Purple
    0x00FF88  // Light Green
];

// Initialize 3D array for shadow arrows: [depth][light]
for (let d = 0; d < MAX_DEPTH; d++) {  // Support up to MAX_DEPTH bounce depths
    shadowArrows[d] = [];
}

// ===== 3. SCENE INITIALIZATION =====
// Scene with dark background
const viewport = document.getElementById('viewport-3d');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x333333);



// Add debug arrows to scene
for (const arrow of bounceArrows) {
    scene.add(arrow);
}

// ===== 4. CAMERA SETUP (3D viewport + static render camera) =====
let isLocked = false;

// Main interactive camera for 3D viewport
const camera = new THREE.PerspectiveCamera(75, viewport.clientWidth / viewport.clientHeight, 0.1, 1000);
camera.position.set(10, 5, 10);
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld();
scene.add(camera);

// Static camera for ray tracing renders (fixed perspective)
const staticCamera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
staticCamera.position.set(0, 0, 0);
staticCamera.lookAt(0, 0, 0);
staticCamera.rotation.y = Math.PI;
staticCamera.updateMatrixWorld();
scene.add(staticCamera);

let useStaticCamera = false;

// Visual marker showing where renders are captured from
const cameraMarkerGeometry = new THREE.ConeGeometry(0.5, 1, 4);
const cameraMarkerMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
const cameraMarker = new THREE.Mesh(cameraMarkerGeometry, cameraMarkerMaterial);
cameraMarker.rotation.x = Math.PI / 2;
cameraMarker.visible = false;
scene.add(cameraMarker);

/**
 * Lock the camera at current position for ray tracing, then render full scene
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

// ===== 5. RENDERER & CONTROLS (WebGL + OrbitControls + TransformControls) =====
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(viewport.clientWidth, viewport.clientHeight);
viewport.appendChild(renderer.domElement);

// Orbit controls for interactive 3D navigation
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.01;

// Transform controls for moving/rotating/scaling selected objects
const transformControls = new TransformControls(camera, renderer.domElement);
scene.add(transformControls);

transformControls.addEventListener('dragging-changed', (event) => {
    controls.enabled = !event.value; // Disable orbit while dragging object
});

scene.background = new THREE.Color(0x333333);
scene.add(new THREE.AmbientLight(0xffffff, 0.6)); // Add this line

// ===== 6. SHAPE MANAGEMENT (Shape class + addShape function) =====
const sceneObjects = []; // Array of all objects for ray tracer

// ===== 6. SHAPE MANAGEMENT (Shape class + addShape function) =====

/**
 * Add a shape (sphere, box, or plane) to the scene
 * @param {string} type - 'sphere', 'box', or 'plane'
 * @param {number} color - Hex color (default 0x00ff00 green)
 * @param {object} position - {x, y, z} position coordinates
 * @param {number} opacity - Transparency level (0-1, default 1.0)
 * @returns {THREE.Mesh} - The created mesh
 */
function addShape(type, color = 0x00ff00, position = {x: 0, y: 1, z: 0}, opacity = 1.0) {
    let geometry;

    // Define geometry based on type
    if (type === 'sphere') {
        geometry = new THREE.SphereGeometry(1, 32, 32);
    } else if (type === 'box') {
        geometry = new THREE.BoxGeometry(2, 2, 2);
    } else if (type === 'plane') {
        geometry = new THREE.PlaneGeometry(20, 20);
    
    }
    
    // Create the shape using the Shape class
    const newShape = new Shape(type, geometry, color);
    newShape.mesh.material.opacity = opacity; // Set opacity parameter
    
    // Handle plane-specific properties
    if (type === 'plane') {
        newShape.mesh.material.side = THREE.DoubleSide;
    } else {
        newShape.mesh.material.side = THREE.FrontSide;
    }
    
    // Set position
    newShape.mesh.position.set(position.x, position.y, position.z);
    
    // Rotate plane to be horizontal
    if (type === 'plane') newShape.mesh.rotation.x = -Math.PI / 2;

    // Register mesh for ray tracer
    scene.add(newShape.mesh);
    sceneObjects.push(newShape.mesh);
    return newShape.mesh;
}

// Initialize default scene objects
addShape('plane', 0xCE5555, {x: 0, y: 0, z: 0});
addShape('sphere', 0xeeeeee, {x: -3, y: 1.5, z: 0});
addShape('box', 0x00ff00, {x: 3, y: 3, z: 5}, 0.5); // Cube is 50% transparent

// ===== 7. LIGHTING SYSTEM (PointLight creation + shadow calculation) =====
const lights = [];



/**
 * Add a point light to the scene with visual bulb
 * @param {number} color - Hex color (default white)
 * @param {number} intensity - Light intensity (default 100)
 * @param {object} position - {x, y, z} position coordinates
 * @returns {THREE.PointLight} - The created light
 */
function addPointLight(color = 0xffffff, intensity = 100, position = {x: 5, y: 10, z: 5}) {
    const light = new THREE.PointLight(color, intensity);
    light.position.set(position.x, position.y, position.z);
    
    // Create a visual bulb so the light is clickable/visible
    const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.5), 
        new THREE.MeshBasicMaterial({ color: color })
    );

    // Store reference to bulb so we can update it when light color changes
    light.userData.bulb = bulb;

    // Add bulb to light and light to scene
    light.add(bulb); 
    scene.add(light);
    sceneObjects.push(light);
    lights.push(light);
    
    // Create shadow feeler arrows for this light at each bounce depth
    const lightIndex = lights.length - 1;
    const shadowColor = shadowColors[lightIndex % shadowColors.length];
    
    for (let d = 0; d < MAX_DEPTH; d++) {
        const shadowArrow = new THREE.ArrowHelper(
            new THREE.Vector3(0, 1, 0), 
            new THREE.Vector3(0, 0, 0), 
            1, 
            shadowColor
        );
        scene.add(shadowArrow);
        shadowArrows[d][lightIndex] = shadowArrow;
    }
    
    return light;
}

// Initialize default light
const pointLight = addPointLight();

// ===== 8. OBJECT SELECTION & UI SYNC (Click-to-select + property binding) =====
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

    // For lights
    if (selectedObject.isPointLight) {
        const intensity = selectedObject.intensity;
        document.getElementById('light-intensity-slider').value = intensity;
    } else {
        // For shapes
        const colorHex = "#" + selectedObject.material.color.getHexString();
        const size = selectedObject.scale.x;
        const opacity = selectedObject.material.opacity;
        const reflectivity = selectedObject.userData.reflectivity || 0;

        // Update HTML elements to match
        document.getElementById('color-picker').value = colorHex;
        document.getElementById('size-slider').value = size;
        document.getElementById('Opacity-slider').value = opacity;
        document.getElementById('reflectivity-slider').value = reflectivity;
    }
}

/**
 * Select an object and attach transform controls
 * @param {THREE.Mesh} obj - The object to select
 */
function selectObject(obj) {
    selectedObject = obj;

    // Attach transform gizmo
    transformControls.attach(obj);
    
    // Show wireframe highlight
    selectionHighlight.setFromObject(obj);
    selectionHighlight.visible = true;

    // Show/hide UI based on object type
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
    // Convert mouse coordinates to normalized device coordinates
    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    // Setup raycaster
    const picker = new THREE.Raycaster();
    picker.setFromCamera(mouse, camera);

    // Find intersections
    const intersects = picker.intersectObjects(sceneObjects);

    if (intersects.length > 0) {
        let clickedObj = intersects[0].object;
        // If clicked on light bulb, select the light instead
        if (clickedObj.parent && clickedObj.parent.isPointLight) {
            clickedObj = clickedObj.parent;
        }
        selectObject(clickedObj);
    } else {
        deselectObject();
    }
});

transformControls.addEventListener('change', () => {
    // Transform control changes handled automatically
});

// ===== 9. UI EVENT LISTENERS (Buttons, sliders, color picker) =====
let isEditMode = true; // true = Move Objects, false = Camera/Picking


/**
 * Add Shape button - Create new shape from dropdown
 */
document.getElementById('add-shape-btn').addEventListener('click', () => {
    const selectedType = document.getElementById('shape-selector').value;
    addShape(selectedType);
});


/**
 * Delete button - Remove selected object
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
 * Handles color, size, opacity, reflectivity, intensity
 */
function updateObjectProperty(prop, value) {
    if (!selectedObject) return;

    if (prop === 'color') {
        // Handle both shapes (with material) and lights (no material)
        if (selectedObject.material) {
            selectedObject.material.color.set(value);
        } else if (selectedObject.isPointLight) {
            selectedObject.color.set(value);
            // Also update the bulb color
            if (selectedObject.userData.bulb) {
                selectedObject.userData.bulb.material.color.set(value);
            }
        }
    }
    if (prop === 'size') {
        selectedObject.scale.set(value, value, value);
        selectedObject.updateMatrixWorld(); // Critical for ray tracing
    }
    if (prop === 'opacity') selectedObject.material.opacity = value;
    if (prop === 'reflectivity') {
        selectedObject.userData.reflectivity = value;
        if (selectedObject.material) {
            selectedObject.material.roughness = 1.0 - value; // Higher reflectivity = lower roughness
            selectedObject.material.metalness = value;       // Higher reflectivity = more metallic
        }}
    if (prop === 'intensity') selectedObject.intensity = value;
}

/**
 * Color picker - Update selected object color
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
 * Slider listeners - Update object properties in real-time
 */
document.getElementById('size-slider').oninput = (e) => updateObjectProperty('size', parseFloat(e.target.value));
document.getElementById('Opacity-slider').oninput = (e) => updateObjectProperty('opacity', parseFloat(e.target.value));
document.getElementById('reflectivity-slider').oninput = (e) => updateObjectProperty('reflectivity', parseFloat(e.target.value));
document.getElementById('light-intensity-slider').oninput = (e) => updateObjectProperty('intensity', parseFloat(e.target.value));


const addLightBtn = document.getElementById('add-light-btn'); // Ensure ID matches your HTML
addLightBtn.addEventListener('click', () => {
    // Spawn the light at a default position or the camera's position
    const newLight = addPointLight(0xffffff, 100, { x: 0, y: 5, z: 0 });
    
    // Automatically select the new light so the gizmo appears immediately
    selectObject(newLight);
    
    console.log("New light added to scene.");
});

// ===== 10. RAY TRACING ENGINE (traceRay + lighting calculations) =====
const MaxDepth = 10; // Max recursion depth for ray tracing



/**
 * Trace a ray through the scene with reflection/refraction support
 * @param {THREE.Vector3} origin - Ray origin
 * @param {THREE.Vector3} dir - Ray direction
 * @param {number} depth - Current recursion depth
 * @returns {THREE.Color} - Final color at this pixel
 */
function traceRay(origin, dir, depth) {
    if (depth > MaxDepth) return new THREE.Color(0, 0, 0);
    
    // Hide all arrows on first call (depth 0) - only show arrows for the actual ray path
    if (depth === 0) {
        for (let d = 0; d < bounceArrows.length; d++) {
            bounceArrows[d].visible = false;
        }
        // Also hide all shadow feelers
        for (let d = 0; d < shadowArrows.length; d++) {
            for (let i = 0; i < shadowArrows[d].length; i++) {
                if (shadowArrows[d][i]) {
                    shadowArrows[d][i].visible = false;
                }
            }
        }
    }
    
    const hit = nearestHit(origin, dir, sceneObjects);

    // Update visual debug arrows for all bounces
    if (depth < bounceArrows.length) {
        const arrow = bounceArrows[depth];
        arrow.position.copy(origin);
        arrow.setDirection(dir.clone().normalize());
        arrow.setLength(hit ? hit.t : 20);
        arrow.visible = !!hit;  // Only show if there's a hit
    }
    
    // Hide all deeper bounce arrows when we don't have a hit
    if (!hit || hit.obj === null) {
        for (let d = depth + 1; d < bounceArrows.length; d++) {
            bounceArrows[d].visible = false;
        }
    }

    // No hit - return background color
    if (!hit || hit.obj === null) {
        return new THREE.Color(0.1, 0.1, 0.1);
    }

    // Update shadow ray visualization - one to each light at EVERY hit point
    if (hit) {  // Show shadow feelers for all bounce depths
        const hitPointOffset = hit.point.clone().add(hit.normal.clone().multiplyScalar(0.01));
        
        // Update shadow feeler for each light at this bounce depth
        for (let i = 0; i < lights.length; i++) {
            const light = lights[i];
            const shadowArrow = shadowArrows[depth] && shadowArrows[depth][i];
            
            if (shadowArrow) {
                const lightVec = new THREE.Vector3().subVectors(light.position, hit.point);
                const lightDir = lightVec.clone().normalize();
                const lightDist = lightVec.length();

                shadowArrow.position.copy(hitPointOffset);
                shadowArrow.setDirection(lightDir);
                
                const shadowHit = nearestHit(hitPointOffset, lightDir, sceneObjects, lightDist);
                if (shadowHit) {
                    // In shadow - use darker color
                    shadowArrow.setLength(shadowHit.t, 0.2, 0.1);
                    const baseColor = shadowColors[i % shadowColors.length];
                    const darkColor = new THREE.Color(baseColor).multiplyScalar(0.3);
                    shadowArrow.setColor(darkColor);
                } else {
                    // Not in shadow - use bright color
                    shadowArrow.setLength(lightDist, 0.2, 0.1);
                    const baseColor = shadowColors[i % shadowColors.length];
                    shadowArrow.setColor(new THREE.Color(baseColor));
                }
                shadowArrow.visible = true;
            }
        }
    } else if (!hit) {
        // Hide all shadow arrows if no hit at this depth
        if (shadowArrows[depth]) {
            for (let i = 0; i < shadowArrows[depth].length; i++) {
                if (shadowArrows[depth][i]) {
                    shadowArrows[depth][i].visible = false;
                }
            }
        }
    }

    // If ray hits a light bulb, return glow
    for (const light of lights) {
        if (hit.obj === light) {
            return new THREE.Color(light.intensity, light.intensity, light.intensity);
        }
    }

    // Handle refraction for transparent objects
    if (hit.obj.material.transparent && hit.obj.material.opacity < 1.0) {
        const ior = 1.5;
        const isEntering = dir.dot(hit.normal) < 0;
        const eta = isEntering ? (1.0 / ior) : (ior / 1.0);
        const normal = isEntering ? hit.normal.clone() : hit.normal.clone().multiplyScalar(-1);

        const refractDir = refract(dir.clone().normalize(), normal, eta);

        if (refractDir) {
            // Continue through transparent object
            const refractOrigin = hit.point.clone().add(refractDir.clone().multiplyScalar(0.001)); 
            const refractedColor = traceRay(refractOrigin, refractDir, depth + 1);
            
            // Blend with object color
            const opacity = hit.obj.material.opacity;
            const intensity = calculateLighting(hit, lights, sceneObjects);
            const surfaceColor = hit.obj.material.color.clone().multiplyScalar(intensity);

            return surfaceColor.lerp(refractedColor, 1 - opacity);
        } else {
            // Total internal reflection fallback
            const reflectDir = reflect(dir.clone().normalize(), normal);
            const reflectOrigin = hit.point.clone().add(reflectDir.clone().multiplyScalar(0.001));
            return traceRay(reflectOrigin, reflectDir, depth + 1);
        }
    }

    // Handle reflectivity for reflective objects
    const reflectivity = hit.obj.userData.reflectivity || 0;
    if (reflectivity > 0 && depth < MAX_DEPTH) {
        const normal = dir.dot(hit.normal) < 0 ? hit.normal.clone() : hit.normal.clone().multiplyScalar(-1);
        const reflectDir = reflect(dir.clone().normalize(), normal);
        const reflectOrigin = hit.point.clone().add(reflectDir.clone().multiplyScalar(0.001));
        const reflectedColor = traceRay(reflectOrigin, reflectDir, depth + 1);
        
        // Blend between surface color and reflection based on reflectivity
        const intensity = calculateLighting(hit, lights, sceneObjects);
        const surfaceColor = hit.obj.material.color.clone().multiplyScalar(intensity);
        
        return surfaceColor.lerp(reflectedColor, reflectivity);
    }

    // Diffuse lighting for non-transparent and non-reflective objects
    // Use calculateLighting to account for ALL lights in the scene, not just the original pointLight
    const finalIntensity = calculateLighting(hit, lights, sceneObjects);
    return hit.obj.material.color.clone().multiplyScalar(finalIntensity);
}

// ===== 11. 2D CANVAS RENDERING (renderPixel + renderFullScene) =====
const canvas2D = document.getElementById('render-2d-canvas');
const ctx = canvas2D.getContext('2d');

const width = canvas2D.width;
const height = canvas2D.height;
const GRID_SIZE = 1;

/**
 * Initialize the 2D canvas with black background
 */
function initCanvas() {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);
}

/**
 * Render a single pixel using ray tracing
 * @param {number} x - Canvas x coordinate
 * @param {number} y - Canvas y coordinate
 */
function renderPixel(x, y) {
    staticCamera.updateMatrixWorld();
    const mouse = new THREE.Vector2((x / 512) * 2 - 1, -(y / 512) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, staticCamera);
    const ray = raycaster.ray;

    const gridX = Math.floor(x / GRID_SIZE) * GRID_SIZE;
    const gridY = Math.floor(y / GRID_SIZE) * GRID_SIZE;

    const finalColor = traceRay(ray.origin, ray.direction, 0);

    ctx.fillStyle = `rgb(${finalColor.r * 255}, ${finalColor.g * 255}, ${finalColor.b * 255})`;
    ctx.fillRect(gridX, gridY, GRID_SIZE, GRID_SIZE);
}

/**
 * Render the entire 512x512 scene
 */
function renderFullScene() {
    for (let x = 0; x < canvas2D.width; x += GRID_SIZE) {
        for (let y = 0; y < canvas2D.height; y += GRID_SIZE) {
            renderPixel(x + GRID_SIZE / 2, y + GRID_SIZE / 2);
        }
    }
}

let hoveredPixel = {x: -1, y: -1};

/**
 * Canvas hover - Render pixel under mouse in real-time
 */
canvas2D.addEventListener('mousemove', (e) => {
    const rect = canvas2D.getBoundingClientRect();
    
    const x = (e.clientX - rect.left) * (canvas2D.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas2D.height / rect.height);

    hoveredPixel.x = Math.floor(x / GRID_SIZE) * GRID_SIZE;
    hoveredPixel.y = Math.floor(y / GRID_SIZE) * GRID_SIZE;

    if (hoveredPixel.x !== -1) {
        renderPixel(hoveredPixel.x + GRID_SIZE / 2, hoveredPixel.y + GRID_SIZE / 2);
    }
});

/**
 * Full render button - Lock camera and render complete scene
 */
const renderAllBtn = document.getElementById('render-all-btn');
renderAllBtn.addEventListener('click', () => {
    console.log("Shapes to trace:", sceneObjects.filter(o => o.geometry).length);
    console.log("Lights to calculate:", lights.length);
    lockCameraForRender();
});

// ===== 12. ANIMATION LOOP (requestAnimationFrame + viewport updates) =====
/**
 * Main animation loop - Updates 3D viewport every frame
 */
function animate() {
    requestAnimationFrame(animate);

    // Update selection highlight
    if (selectionHighlight.visible) {
        selectionHighlight.update();
    }
    
    controls.update();

    // Handle window resizing
    renderer.setSize(viewport.clientWidth, viewport.clientHeight);
    camera.aspect = viewport.clientWidth / viewport.clientHeight;
    camera.updateProjectionMatrix();

    // Render 3D scene
    renderer.render(scene, camera);
}

// ===== 13. INITIALIZE & START =====
initCanvas();
animate();
