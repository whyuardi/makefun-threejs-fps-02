// Rendering for EMBERLINE: owns the THREE scene, camera, bot meshes, the
// weapon viewmodel and the HUD-facing world bits. Reads sim state each
// frame; it never writes sim state. Temporary vectors are module-level.
import * as THREE from 'three';
import { PALETTE, WEAPONS } from './config.js';
import { buildLevel, SITES } from './level.js';
import { FX } from './fx.js';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

function makeBotMesh(team) {
  const group = new THREE.Group();
  const bodyColor = team === 'ember' ? 0xb35a14 : 0x1f6f66;
  const vestColor = team === 'ember' ? 0x3a2c22 : 0x22333a;
  const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
  const vestMat = new THREE.MeshLambertMaterial({ color: vestColor });
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xc9a184 });
  const accentMat = new THREE.MeshBasicMaterial({ color: team === 'ember' ? PALETTE.ember : PALETTE.ash });
  // Legs.
  const legGeo = new THREE.BoxGeometry(0.17, 0.75, 0.2);
  const legL = new THREE.Mesh(legGeo, vestMat); legL.position.set(-0.11, 0.38, 0);
  const legR = new THREE.Mesh(legGeo, vestMat); legR.position.set(0.11, 0.38, 0);
  // Torso + vest plate.
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.62, 0.32), bodyMat);
  torso.position.y = 1.06;
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.42, 0.36), vestMat);
  vest.position.y = 1.08;
  // Head + helmet + visor stripe.
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), skinMat);
  head.position.y = 1.56;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), bodyMat);
  helmet.position.y = 1.58;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.05), accentMat);
  stripe.position.set(0, 1.56, -0.2);
  // Arms + rifle.
  const armGeo = new THREE.BoxGeometry(0.13, 0.5, 0.15);
  const armL = new THREE.Mesh(armGeo, bodyMat); armL.position.set(-0.33, 1.1, -0.12); armL.rotation.x = -1.1;
  const armR = new THREE.Mesh(armGeo, bodyMat); armR.position.set(0.33, 1.1, -0.12); armR.rotation.x = -1.1;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.85), vestMat);
  gun.position.set(0.1, 1.22, -0.45);
  // Team ring at the feet (readable at a glance).
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.5, 20),
    new THREE.MeshBasicMaterial({ color: team === 'ember' ? PALETTE.ember : PALETTE.ash, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  for (const m of [legL, legR, torso, vest, head, helmet, armL, armR, gun]) {
    m.castShadow = true;
    group.add(m);
  }
  group.add(stripe);
  group.add(ring);
  group.userData = { legL, legR, head, ring };
  return group;
}

function makeViewmodel() {
  const group = new THREE.Group();
  const dark = new THREE.MeshLambertMaterial({ color: 0x23262b });
  const mid = new THREE.MeshLambertMaterial({ color: 0x3a3f46 });
  const accent = new THREE.MeshBasicMaterial({ color: PALETTE.accent });
  // Rifle body: receiver, barrel, stock, grip, sight.
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.5), dark);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.42, 8), mid);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -0.42);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.11, 0.22), dark);
  stock.position.set(0, 0.01, 0.32);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.09), dark);
  grip.position.set(0, -0.1, 0.08);
  grip.rotation.x = 0.35;
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.08), dark);
  sight.position.set(0, 0.09, -0.02);
  const frontPost = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.05, 0.015), accent);
  frontPost.position.set(0, 0.09, -0.3);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.1), mid);
  mag.position.set(0, -0.13, -0.08);
  mag.rotation.x = 0.15;
  for (const m of [receiver, barrel, stock, grip, sight, frontPost, mag]) group.add(m);
  group.scale.setScalar(0.75);
  group.position.set(0.28, -0.26, -0.5);
  return group;
}

export class Renderer {
  constructor(canvasHost) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    canvasHost.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(PALETTE.fog, 30, 130);
    this.camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.05, 400);
    this.camera.rotation.order = 'YXZ';

    buildLevel(this.scene);
    this.fx = new FX(this.scene);
    this.viewmodel = makeViewmodel();
    this.camera.add(this.viewmodel);
    this.scene.add(this.camera);

    // Bomb site markers: floating letters + a ground beacon.
    this.siteMarkers = {};
    for (const key of ['A', 'B']) {
      const s = SITES[key];
      const canvas = document.createElement('canvas');
      canvas.width = 128; canvas.height = 128;
      const g = canvas.getContext('2d');
      g.fillStyle = '#d8c56a';
      g.font = 'bold 84px system-ui, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(key, 64, 70);
      const tex = new THREE.CanvasTexture(canvas);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true }));
      sprite.scale.set(3.2, 3.2, 1);
      sprite.position.set(s.x, 4.6, s.z);
      this.scene.add(sprite);
      this.siteMarkers[key] = sprite;
    }

    this.botMeshes = new Map();
    this.walkPhase = 0;
    this.cameraBob = 0;

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  syncBots(bots) {
    const seen = new Set();
    for (const b of bots) {
      seen.add(b.id);
      let mesh = this.botMeshes.get(b.id);
      if (!mesh) {
        mesh = makeBotMesh(b.team);
        this.scene.add(mesh);
        this.botMeshes.set(b.id, mesh);
      }
      mesh.visible = b.alive;
      if (!b.alive) continue;
      mesh.position.set(b.x, b.y, b.z);
      mesh.rotation.y = b.yaw;
      // Walk cycle on the legs.
      const phase = this.walkPhase + (b.id.charCodeAt(1) || 0);
      const swing = b.moveSpeed > 0.5 ? Math.sin(phase * 6) * 0.5 : 0;
      mesh.userData.legL.rotation.x = swing;
      mesh.userData.legR.rotation.x = -swing;
      // Crouch: squash the group.
      const targetScale = b.crouched ? 0.68 : 1;
      mesh.scale.y += (targetScale - mesh.scale.y) * 0.3;
    }
    for (const [id, mesh] of this.botMeshes) {
      if (!seen.has(id)) {
        this.scene.remove(mesh);
        this.botMeshes.delete(id);
      }
    }
  }

  // Consume sim events into visuals. `playSound` is injected so the
  // renderer stays free of audio imports.
  consumeEvents(events, playSound) {
    for (const ev of events) {
      switch (ev.type) {
        case 'tracer':
          this.fx.addTracer(ev.ax, ev.ay, ev.az, ev.bx, ev.by, ev.bz);
          break;
        case 'spark':
          this.fx.addSparks(ev.x, ev.y, ev.z, ev.n, ev.blood ? 1.6 : 2.4);
          break;
        case 'explosion':
          this.fx.addSparks(ev.x, ev.y, ev.z, 40, 6);
          this.fx.addSmoke(ev.x, ev.y + 0.5, ev.z, 2.5, 1.2);
          break;
        case 'smoke':
          this.fx.addSmoke(ev.x, ev.y + 1, ev.z, ev.r, ev.life);
          break;
        case 'muzzle':
          if (!ev.bot) {
            // Muzzle flash at the viewmodel tip (camera space).
            _v1.set(0.26, -0.18, -0.95);
            this.camera.localToWorld(_v1);
            this.fx.muzzle(_v1.x, _v1.y, _v1.z, ev.yaw);
          }
          break;
        case 'sound':
          if (playSound) playSound(ev.name, { vol: ev.vol });
          break;
        default:
          break;
      }
    }
  }

  render(sim, dt, time) {
    const p = sim.player;
    this.walkPhase += dt * (p.moveSpeed2d > 0.5 ? p.moveSpeed2d * 0.35 : 0);
    // Camera follows the player head.
    const eyeY = p.y + (p.crouched ? 1.1 : 1.55);
    // Recoil offset (from the sim) decays; viewmodel bobs with movement.
    const recoil = p.recoil || 0;
    this.camera.position.set(p.x, eyeY, p.z);
    const targetFov = p.ads && WEAPONS[p.weapon].zoom ? 78 / WEAPONS[p.weapon].zoom : 78;
    if (Math.abs(this.camera.fov - targetFov) > 0.1) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 12);
      this.camera.updateProjectionMatrix();
    }
    this.camera.rotation.set(p.pitch + recoil, p.yaw, 0);
    // Viewmodel: bob + recoil + reload dip.
    const bob = p.moveSpeed2d > 0.5 ? Math.sin(this.walkPhase * 2) * 0.012 : 0;
    const bobY = p.moveSpeed2d > 0.5 ? Math.abs(Math.cos(this.walkPhase * 2)) * 0.01 : 0;
    this.viewmodel.position.set(
      p.ads ? 0 : 0.28 + bob,
      -0.26 + bobY - (p.reloading ? 0.12 : 0) + recoil * 0.5,
      -0.5 + recoil * 0.25,
    );
    this.viewmodel.rotation.x = recoil * 1.4;
    this.viewmodel.visible = p.alive && sim.phase !== 'menu';

    this.syncBots(sim.bots);
    this.fx.syncSmoke(sim.smokes);
    this.fx.update(dt, time);
    // Bomb light pulses at the planted charge.
    if (sim.bomb.state === 'planted') {
      this.fx.bombLight.visible = true;
      this.fx.bombLight.position.set(sim.bomb.x, sim.bomb.y + 0.3, sim.bomb.z);
    } else {
      this.fx.bombLight.visible = false;
    }
    this.renderer.render(this.scene, this.camera);
  }
}
