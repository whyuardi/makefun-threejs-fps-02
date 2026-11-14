// EMBER YARD — an original dusk-lit industrial yard. Flat ground, three lanes,
// two charge sites (A west, B east), container stacks and crates for cover.
// Colliders are axis-aligned boxes; every visual prop registers one.
// Nav graph nodes are hand-placed in open ground; edges are pruned at build
// time when a straight segment at eye height hits a collider.
import * as THREE from 'three';
import { PALETTE } from './config.js';

// ---------------------------------------------------------------- colliders
// Each collider: [cx, cy, cz, sx, sy, sz] (center + full size). y is up.
const BOXES = [];
function box(cx, cy, cz, sx, sy, sz) {
  BOXES.push([cx, cy, cz, sx, sy, sz]);
  return BOXES.length - 1;
}

// Perimeter walls (height 4.5).
box(0, 2.25, -22.5, 66, 4.5, 1);
box(0, 2.25, 22.5, 66, 4.5, 1);
box(-32.5, 2.25, 0, 1, 4.5, 46);
box(32.5, 2.25, 0, 1, 4.5, 46);

// Mid plaza: stacked containers forming the central corner (the "totem").
box(-2, 1.3, 2, 6, 2.6, 2.6);
box(-2, 3.9, 2, 6, 2.6, 2.6);
box(4.5, 1.3, 6.5, 2.6, 2.6, 6);

// West lane containers + low cover wall.
box(-20, 1.3, 8, 6, 2.6, 2.6);
box(-20, 1.3, -2, 2.6, 2.6, 6);
box(-26, 0.55, 4, 4, 1.1, 1.2); // crouch-height wall
box(-14, 0.6, -8, 1.2, 1.2, 1.2); // crate
box(-27, 0.6, -8, 1.2, 1.2, 1.2);
box(-27, 1.8, -8, 1.2, 1.2, 1.2);

// East lane, mirrored in spirit but not in detail.
box(20, 1.3, 8, 2.6, 2.6, 6);
box(20, 1.3, -2, 6, 2.6, 2.6);
box(26, 0.55, 2, 4, 1.1, 1.2);
box(14, 0.6, -8, 1.2, 1.2, 1.2);
box(14, 1.8, -8, 1.2, 1.2, 1.2);
box(27, 0.6, -6, 1.2, 1.2, 1.2);

// Site A (west yard): L of containers + crates, open plant pocket.
box(-27, 1.3, -14, 2.6, 2.6, 6);
box(-22, 1.3, -18, 6, 2.6, 2.6);
box(-18, 0.6, -12, 1.2, 1.2, 1.2);
box(-24, 0.6, -10, 1.2, 1.2, 1.2);

// Site B (east yard): container row + low walls, different sightlines.
box(27, 1.3, -14, 2.6, 2.6, 6);
box(22, 1.3, -18, 6, 2.6, 2.6);
box(18, 0.6, -12, 1.2, 1.2, 1.2);
box(24, 0.55, -9, 4, 1.1, 1.2);

// South (EMBER) side cover, north (ASH) side cover.
box(-8, 0.6, 12, 1.2, 1.2, 1.2);
box(8, 0.6, 12, 1.2, 1.2, 1.2);
box(-8, 0.6, -10, 1.2, 1.2, 1.2);
box(8, 0.6, -10, 1.2, 1.2, 1.2);
box(0, 0.55, 12, 4, 1.1, 1.2);
box(0, 0.55, -12, 4, 1.1, 1.2);

// Barrels (visual cylinders, square colliders for simplicity).
box(-10, 0.5, 4, 1, 1, 1);
box(10, 0.5, -4, 1, 1, 1);
box(-4, 0.5, -6, 1, 1, 1);

// Precompute min/max for ray tests.
export const COLLIDERS = BOXES.map(([cx, cy, cz, sx, sy, sz]) => ({
  minX: cx - sx / 2, maxX: cx + sx / 2,
  minY: cy - sy / 2, maxY: cy + sy / 2,
  minZ: cz - sz / 2, maxZ: cz + sz / 2,
  cx, cy, cz, sx, sy, sz,
}));

// ------------------------------------------------------------------ sites
export const SITES = {
  A: { id: 'A', x: -23.5, z: -13.5, r: 5.0, label: 'SITE A' },
  B: { id: 'B', x: 23.5, z: -13.5, r: 5.0, label: 'SITE B' },
};
export function siteAt(x, z) {
  for (const key of ['A', 'B']) {
    const s = SITES[key];
    const dx = x - s.x, dz = z - s.z;
    if (dx * dx + dz * dz <= s.r * s.r) return s;
  }
  return null;
}

export const EMBER_SPAWNS = [
  [-6, 18], [-2, 19], [2, 19], [6, 18],
];
export const ASH_SPAWNS = [
  [-6, -18], [-2, -19], [2, -19], [6, -18], [0, -17],
];

// ------------------------------------------------------------------ nav
// Nodes in open ground. Edges are authored as pairs; build prunes blocked ones.
const NAV_NODES = [
  [0, 18], [-6, 18], [6, 18],           // 0-2 ember spawn
  [-10, 12], [0, 12], [10, 12],         // 3-5 south mid
  [-20, 10], [-2, 6], [20, 10],         // 6-8 lanes / mid
  [-24, 2], [0, 0], [24, 2],            // 9-11 centre
  [-14, -6], [14, -6],                  // 12-13 north mid
  [-24, -10], [24, -10],                // 14-15 site approach
  [-23.5, -13.5], [23.5, -13.5],        // 16-17 sites A / B
  [-6, -18], [6, -18], [0, -18],        // 18-20 ash spawn
  [-2, -14], [2, -14],                  // 21-22 north pocket
];
const NAV_EDGES = [
  [0, 1], [0, 2], [0, 4], [1, 3], [2, 5], [3, 4], [4, 5], [3, 6], [5, 8],
  [4, 7], [6, 9], [7, 10], [8, 11], [9, 12], [10, 12], [10, 13], [11, 13],
  [12, 14], [13, 15], [14, 16], [15, 17], [12, 21], [13, 22], [21, 18],
  [22, 19], [18, 20], [19, 20], [10, 21], [10, 22], [9, 14], [11, 15],
  [7, 12], [7, 13], [3, 7], [5, 7], [16, 21], [17, 22], [0, 3], [0, 5],
];

export const NAV = { nodes: NAV_NODES, adj: [] };
let navReady = false;
export function ensureNav() {
  if (navReady) return;
  navReady = true;
  // Prune nav edges blocked at eye height.
  NAV.adj = NAV_NODES.map(() => []);
  for (const [a, b] of NAV_EDGES) {
    const [ax, az] = NAV_NODES[a], [bx, bz] = NAV_NODES[b];
    if (hasLOS(ax, 1.4, az, bx, 1.4, bz)) {
      NAV.adj[a].push(b);
      NAV.adj[b].push(a);
    }
  }
}
export function nearestNode(x, z) {
  ensureNav();
  let best = 0, bestD = Infinity;
  for (let i = 0; i < NAV_NODES.length; i++) {
    const dx = NAV_NODES[i][0] - x, dz = NAV_NODES[i][1] - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}
// Breadth-first path of node indices from (x,z) to target node.
export function findPath(x, z, targetNode) {
  ensureNav();
  const start = nearestNode(x, z);
  if (start === targetNode) return [targetNode];
  const prev = new Int16Array(NAV_NODES.length).fill(-1);
  const queue = [start];
  prev[start] = start;
  for (let qi = 0; qi < queue.length; qi++) {
    const n = queue[qi];
    if (n === targetNode) break;
    for (const m of NAV.adj[n]) {
      if (prev[m] === -1) { prev[m] = n; queue.push(m); }
    }
  }
  if (prev[targetNode] === -1) return [targetNode];
  const path = [];
  let n = targetNode;
  while (n !== start) { path.push(n); n = prev[n]; }
  path.push(start);
  path.reverse();
  return path;
}

// ------------------------------------------------------- ray vs colliders
// Slab test. Writes into `out` ({dist, nx, ny, nz}) and returns true on hit.
const _inv = { x: 0, y: 0, z: 0 };
export function rayHit(ox, oy, oz, dx, dy, dz, maxDist, out) {
  let best = maxDist;
  let hit = false;
  for (let i = 0; i < COLLIDERS.length; i++) {
    const c = COLLIDERS[i];
    let tmin = 0, tmax = best;
    // X slab
    if (dx === 0) { if (ox < c.minX || ox > c.maxX) continue; }
    else {
      let t1 = (c.minX - ox) / dx, t2 = (c.maxX - ox) / dx;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) continue;
    }
    if (dy === 0) { if (oy < c.minY || oy > c.maxY) continue; }
    else {
      let t1 = (c.minY - oy) / dy, t2 = (c.maxY - oy) / dy;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) continue;
    }
    if (dz === 0) { if (oz < c.minZ || oz > c.maxZ) continue; }
    else {
      let t1 = (c.minZ - oz) / dz, t2 = (c.maxZ - oz) / dz;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) continue;
    }
    // A ray that starts inside a box does not hit that box: the muzzle
    // may sit a few centimetres inside a wall the shooter hugs.
    if (tmin > 0 && tmin < best) { best = tmin; hit = true; }
  }
  if (hit) { out.dist = best; return true; }
  return false;
}

const _rayOut = { dist: 0 };
export function hasLOS(ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 0.001) return true;
  return !rayHit(ax, ay, az, dx / len, dy / len, dz / len, len - 0.05, _rayOut);
}

// Segment vs smoke spheres (array of {x,y,z,r}) for vision blocking.
export function blockedBySmoke(ax, ay, az, bx, by, bz, smokes) {
  for (let i = 0; i < smokes.length; i++) {
    const s = smokes[i];
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const fx = s.x - ax, fy = s.y - ay, fz = s.z - az;
    const len2 = dx * dx + dy * dy + dz * dz;
    let t = len2 > 0 ? (fx * dx + fy * dy + fz * dz) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ax + dx * t - s.x, py = ay + dy * t - s.y, pz = az + dz * t - s.z;
    if (px * px + py * py + pz * pz < s.r * s.r) return true;
  }
  return false;
}

// AABB (moving box) vs world colliders: resolve axis by axis. `b` is
// {x, y, z} center, `h` half extents {x, y, z}. Mutates b. Returns bit flags
// of axes that collided (1 = x, 2 = y, 4 = z).
export function moveBox(b, h, dx, dy, dz) {
  let flags = 0;
  b.x += dx;
  for (const c of COLLIDERS) {
    if (b.y + h.y > c.minY && b.y - h.y < c.maxY && b.z + h.z > c.minZ && b.z - h.z < c.maxZ) {
      if (dx > 0 && b.x + h.x > c.minX && b.x - h.x < c.minX) { b.x = c.minX - h.x; flags |= 1; }
      else if (dx < 0 && b.x - h.x < c.maxX && b.x + h.x > c.maxX) { b.x = c.maxX + h.x; flags |= 1; }
    }
  }
  b.z += dz;
  for (const c of COLLIDERS) {
    if (b.y + h.y > c.minY && b.y - h.y < c.maxY && b.x + h.x > c.minX && b.x - h.x < c.maxX) {
      if (dz > 0 && b.z + h.z > c.minZ && b.z - h.z < c.minZ) { b.z = c.minZ - h.z; flags |= 4; }
      else if (dz < 0 && b.z - h.z < c.maxZ && b.z + h.z > c.maxZ) { b.z = c.maxZ + h.z; flags |= 4; }
    }
  }
  b.y += dy;
  for (const c of COLLIDERS) {
    if (b.x + h.x > c.minX && b.x - h.x < c.maxX && b.z + h.z > c.minZ && b.z - h.z < c.maxZ) {
      if (dy > 0 && b.y + h.y > c.minY && b.y - h.y < c.minY) { b.y = c.minY - h.y; flags |= 2; }
      else if (dy < 0 && b.y - h.y < c.maxY && b.y + h.y > c.maxY) { b.y = c.maxY + h.y; flags |= 2; }
    }
  }
  return flags;
}

// ------------------------------------------------------------------ build
// Canvas texture helpers: concrete ground + hazard stripes, generated at
// runtime (no image assets, no network).
function groundTexture() {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = '#4b463e'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const v = 40 + Math.floor(Math.random() * 30);
    g.fillStyle = `rgb(${v},${v - 2},${v - 6})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2;
  g.strokeRect(1, 1, 254, 254);
  g.strokeStyle = 'rgba(216,197,106,0.5)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, 128); g.lineTo(256, 128); g.stroke();
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 11);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function skyTexture() {
  const cv = document.createElement('canvas');
  cv.width = 4; cv.height = 256;
  const g = cv.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#232a4a');
  grad.addColorStop(0.45, '#5a3a55');
  grad.addColorStop(0.72, '#c65a2a');
  grad.addColorStop(1, '#e8722a');
  g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const CONTAINER_COLORS = [PALETTE.containerTeal, PALETTE.containerRust, PALETTE.containerSlate, PALETTE.containerOlive];

export function buildLevel(scene) {
  ensureNav();
  const group = new THREE.Group();
  group.name = 'level';

  // Sky dome.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(220, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }),
  );
  group.add(sky);
  // Low sun disc.
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(9, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd9a0, fog: false }),
  );
  sun.position.set(-60, 26, -160);
  sun.lookAt(0, 10, 0);
  group.add(sun);

  // Ground.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(66, 46),
    new THREE.MeshLambertMaterial({ map: groundTexture() }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // Lights: warm low sun + cool ambient hemisphere.
  const sunLight = new THREE.DirectionalLight(0xffb36b, 2.8);
  sunLight.position.set(-40, 38, -60);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -40; sunLight.shadow.camera.right = 40;
  sunLight.shadow.camera.top = 30; sunLight.shadow.camera.bottom = -30;
  sunLight.shadow.camera.far = 160;
  sunLight.shadow.bias = -0.0004;
  group.add(sunLight);
  group.add(new THREE.HemisphereLight(0x8a7fb0, 0x2e2620, 1.35));
  group.add(new THREE.AmbientLight(0x4a3f55, 0.5));

  // Props: one box mesh per collider, coloured by size/role.
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const mats = {};
  function matFor(color) {
    if (!mats[color]) mats[color] = new THREE.MeshLambertMaterial({ color });
    return mats[color];
  }
  const crateMat = matFor(PALETTE.crate);
  const wallMat = matFor(PALETTE.wall);
  const wallDarkMat = matFor(PALETTE.wallDark);
  let ci = 0;
  for (const c of COLLIDERS) {
    const h = c.maxY - c.minY;
    let mat;
    if (h > 4) mat = wallDarkMat; // perimeter
    else if (h > 2) mat = matFor(CONTAINER_COLORS[ci++ % CONTAINER_COLORS.length]);
    else if (h > 1.15) mat = crateMat;
    else mat = wallMat; // low cover walls
    const m = new THREE.Mesh(boxGeo, mat);
    m.position.set(c.cx, c.cy, c.cz);
    m.scale.set(c.sx, c.sy, c.sz);
    m.castShadow = h > 1.1;
    m.receiveShadow = true;
    group.add(m);
  }

  // Hazard stripe rings on the ground at each site.
  for (const key of ['A', 'B']) {
    const s = SITES[key];
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(s.r - 0.25, s.r, 40),
      new THREE.MeshBasicMaterial({ color: PALETTE.hazard, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(s.x, 0.02, s.z);
    group.add(ring);
  }

  // Lamp poles with warm glow discs (emissive look, no extra lights).
  const poleMat = matFor(0x22201e);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffc46b });
  for (const [px, pz] of [[-14, 0], [14, 0], [-24, -6], [24, -6], [0, -16], [0, 16]]) {
    const pole = new THREE.Mesh(boxGeo, poleMat);
    pole.position.set(px, 2.5, pz);
    pole.scale.set(0.25, 5, 0.25);
    group.add(pole);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), glowMat);
    lamp.position.set(px, 5.1, pz);
    group.add(lamp);
  }

  scene.add(group);
  return group;
}
