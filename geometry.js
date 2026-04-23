import * as THREE from 'three';

 const vec = {
    sub: (a, b) => new THREE.Vector3().subVectors(a, b),
    dot: (a, b) => a.dot(b),
    normalize: (v) => v.clone().normalize(),
    multiplyScalar: (v, s) => v.clone().multiplyScalar(s),
    add: (a, b) => new THREE.Vector3().addVectors(a, b)
};


// interactions
// Ray - sphere
 function intersectSphere(origin, dir, sphere) {
    const center = sphere.position;
    const baseradius = sphere.geometry.parameters.radius;
    const radius = baseradius * sphere.scale.x; // uniform scaling
    const oc = vec.sub(origin, center);
    const a = vec.dot(dir, dir);
    const b = 2.0 * vec.dot(oc, dir);
    const c = vec.dot(oc, oc) - radius * radius;
    const discriminant = b * b - 4 * a * c;

    if (discriminant < 0) return null;
    
    const t = (-b - Math.sqrt(discriminant)) / (2.0 * a);
    return t > 0 ? t : null;
}

//Ray - Plane
function intersectPlane(origin, dir, plane) {
    // A horizontal plane at y=0 has a normal of [0, 1, 0]
    const normal = new THREE.Vector3(0, 1, 0);
    const denom = vec.dot(normal, dir);
    
    // If denom is close to 0, the ray is parallel to the plane
    if (Math.abs(denom) > 1e-6) {
        const p0l0 = vec.sub(plane.position, origin);
        const t = vec.dot(p0l0, normal) / denom;
        return t >= 0 ? t : null;
    }
    return null;
}


// Axis-aligned box intersection in the box's local space (AABB [-half, +half])
function intersectBox(origin, dir, mesh) {
    // Move the ray into the Box's coordinate system
    const inv = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
    const o = origin.clone().applyMatrix4(inv);
    const d = dir.clone().transformDirection(inv).normalize();

    const geom = mesh.geometry.parameters;
    const h = { x: geom.width / 2, y: geom.height / 2, z: geom.depth / 2 };

    // Robust Slab Calculation (Handles d.x/y/z = 0)
    //use a small epsilon to avoid division by zero
    const invDx = 1.0 / (Math.abs(d.x) < 1e-8 ? (d.x < 0 ? -1e-8 : 1e-8) : d.x);
    const invDy = 1.0 / (Math.abs(d.y) < 1e-8 ? (d.y < 0 ? -1e-8 : 1e-8) : d.y);
    const invDz = 1.0 / (Math.abs(d.z) < 1e-8 ? (d.z < 0 ? -1e-8 : 1e-8) : d.z);

    let t1 = (-h.x - o.x) * invDx;
    let t2 = (h.x - o.x) * invDx;
    let tmin = Math.min(t1, t2);
    let tmax = Math.max(t1, t2);

    let t3 = (-h.y - o.y) * invDy;
    let t4 = (h.y - o.y) * invDy;
    tmin = Math.max(tmin, Math.min(t3, t4));
    tmax = Math.min(tmax, Math.max(t3, t4));

    let t5 = (-h.z - o.z) * invDz;
    let t6 = (h.z - o.z) * invDz;
    tmin = Math.max(tmin, Math.min(t5, t6));
    tmax = Math.min(tmax, Math.max(t5, t6));

    //  Final Hit Logic
    if (tmax < 0 || tmin > tmax) return null;
    const t = tmin < 0 ? tmax : tmin;

    // Transform back to WORLD SPACE
    const hitLocal = o.clone().add(d.clone().multiplyScalar(t));
    const hitWorld = hitLocal.clone().applyMatrix4(mesh.matrixWorld);

    let normalLocal = new THREE.Vector3();
const eps = 1e-4;
if (Math.abs(hitLocal.x - h.x) < eps) normalLocal.set(1, 0, 0);
else if (Math.abs(hitLocal.x + h.x) < eps) normalLocal.set(-1, 0, 0);
else if (Math.abs(hitLocal.y - h.y) < eps) normalLocal.set(0, 1, 0);
else if (Math.abs(hitLocal.y + h.y) < eps) normalLocal.set(0, -1, 0);
else if (Math.abs(hitLocal.z - h.z) < eps) normalLocal.set(0, 0, 1);
else normalLocal.set(0, 0, -1);

const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
const normalWorld = normalLocal.clone().applyMatrix3(normalMatrix).normalize();
    
    // Calculate distance in world space for correct depth sorting
    const worldT = hitWorld.distanceTo(origin);

    return { t: worldT, point: hitWorld, normal: normalWorld, obj: mesh }; 
}

// Schlick's approximation for Fresnel
 function schlick(cosine, ior) {
  const r0 = Math.pow((1 - ior) / (1 + ior), 2);
  return r0 + (1 - r0) * Math.pow(1 - cosine, 5);
}



// Compute refracted vector using Snell's law
export function refract(dir, normal, etai_over_etat) {
  const cosi = Math.max(-1, Math.min(1, dir.dot(normal) * -1));
  const eta = etai_over_etat;
  const k = 1 - eta * eta * (1 - cosi * cosi);

  
  if (k < 0) return null; // total internal reflection
  return dir.clone().multiplyScalar(eta)
    .add(normal.clone().multiplyScalar(eta * cosi - Math.sqrt(k))).normalize();

    
}

// small helpers
const EPS = 1e-4;
export function reflect(dir, normal) {
  return dir.clone().sub(normal.clone().multiplyScalar(2 * dir.dot(normal))).normalize();
}

// checks scene intersections (sphere + plane). Returns {object, t, normal} or null
export function nearestHit(origin, dir,objects, maxDist = Infinity) {
  let best = { t: Infinity, obj: null, normal: null, point: null };

for (const obj of objects) {
    if (!obj.geometry) continue; // Skip objects without geometry
    let t = null;
    let hitInfo = null;

    if (obj.geometry.type === 'SphereGeometry') {
      t = intersectSphere(origin, dir, obj);
    } else if (obj.geometry.type === 'PlaneGeometry') {
      t = intersectPlane(origin, dir, obj);
    } else if (obj.geometry.type === 'BoxGeometry') {
      hitInfo = intersectBox(origin, dir, obj);
      if (hitInfo) t = hitInfo.t;
    }

    if (t && t < best.t && t < maxDist) {
      const p = hitInfo ? hitInfo.point : origin.clone().add(dir.clone().multiplyScalar(t));
   // Determine normal based on object type
      let n;
      if (hitInfo) {
        n = hitInfo.normal;
      } else if (obj.geometry.type === 'PlaneGeometry') {
        n = new THREE.Vector3(0, 1, 0);
      } else {
        n = p.clone().sub(obj.position).normalize();
      }

      best = { t, obj, normal: n, point: p };
    }
  }
  return best.obj ? best : null;
}

// geometry.js
export function getCosineWeightedSample(normal) {
    // Generate random numbers for the hemisphere
    const r1 = Math.random();
    const r2 = Math.random();
    const r = Math.sqrt(r1);
    const theta = 2 * Math.PI * r2;

    const x = r * Math.cos(theta);
    const y = r * Math.sin(theta);
    const z = Math.sqrt(Math.max(0, 1 - r1));

    // Align the random vector with the surface normal
    const tangent = Math.abs(normal.x) > 0.1 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();
    const tangentFinal = new THREE.Vector3().crossVectors(bitangent, normal).normalize();

    return tangentFinal.multiplyScalar(x)
        .add(bitangent.multiplyScalar(y))
        .add(normal.clone().multiplyScalar(z)).normalize();
}

/* ====================================================================
   SHARED SCENE MANAGEMENT - Used by both pathtracer and raytracer
   ==================================================================== */

/**
 * Shape class - Encapsulates geometry and material for scene objects
 * Used by both ray tracer and path tracer
 */
export class Shape {
    constructor(type, geometry, color) {
        this.type = type;
        const material = new THREE.MeshStandardMaterial({
            color: color,
            transparent: true,
            metalness: 0.0,
            roughness: 1.0,
            opacity: 1.0
        });
        this.mesh = new THREE.Mesh(geometry, material);

        // Link the class to the mesh so the UI can find it later
        this.mesh.userData.shapeInstance = this;
    }

    /**
     * Update mesh scale (uniformly across x, y, z)
     */
    setSize(val) {
        this.mesh.scale.set(val, val, val);
        this.mesh.updateMatrixWorld();
    }

    /**
     * Update mesh color
     */
    setColor(hex) {
        this.mesh.material.color.set(hex);
    }
}

/**
 * Calculate lighting at a hit point - parameterized for both tracers
 * @param {object} hit - Hit information with point and normal
 * @param {array} lights - Array of THREE.PointLight objects
 * @param {array} sceneObjects - Array of scene objects for shadow casting
 * @returns {number} - Total light intensity at hit point
 */
export function calculateLighting(hit, lights, sceneObjects) {
    let totalIntensity = 0;

    for (const light of lights) {
        const lightVec = new THREE.Vector3().subVectors(light.position, hit.point);
        const distance = lightVec.length();
        const lightDir = lightVec.normalize();

        // Check for shadows
        const shadowOrigin = hit.point.clone().add(hit.normal.clone().multiplyScalar(0.001));
        const shadowHit = nearestHit(shadowOrigin, lightDir, sceneObjects, distance);

        if (!shadowHit) {
            // Not in shadow - calculate contribution
            const attenuation = light.intensity / (distance * distance);
            const dot = Math.max(0, hit.normal.dot(lightDir));
            totalIntensity += (dot * attenuation);
        }
    }

    return totalIntensity;
}


