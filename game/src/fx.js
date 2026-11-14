// Pooled visual effects: tracers, impact sparks, smoke puffs, explosion.
// One THREE.LineSegments for tracers (preallocated), one THREE.Points for
// sparks, and a small pool of smoke sprites. No allocation in the hot loop:
// effect slots are recycled in place.
import * as THREE from 'three';

const MAX_TRACERS = 24;
const MAX_SPARKS = 240;
const MAX_SMOKE = 14;

export class FX {
  constructor(scene) {
    this.scene = scene;
    // Tracers: 2 vertices per tracer, positions updated in place.
    this.tracerGeo = new THREE.BufferGeometry();
    this.tracerPos = new Float32Array(MAX_TRACERS * 6);
    this.tracerGeo.setAttribute('position', new THREE.BufferAttribute(this.tracerPos, 3));
    this.tracerMat = new THREE.LineBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0.9 });
    this.tracers = new THREE.LineSegments(this.tracerGeo, this.tracerMat);
    this.tracers.frustumCulled = false;
    scene.add(this.tracers);
    this.tracerLife = new Float32Array(MAX_TRACERS); // seconds left; 0 = idle
    this.tracerNext = 0;

    // Sparks: points cloud, positions + per-point life in parallel arrays.
    this.sparkGeo = new THREE.BufferGeometry();
    this.sparkPos = new Float32Array(MAX_SPARKS * 3);
    this.sparkVel = new Float32Array(MAX_SPARKS * 3);
    this.sparkLife = new Float32Array(MAX_SPARKS);
    this.sparkGeo.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3));
    this.sparkMat = new THREE.PointsMaterial({ color: 0xffb36b, size: 0.05, transparent: true, opacity: 0.85, depthWrite: false });
    this.sparks = new THREE.Points(this.sparkGeo, this.sparkMat);
    this.sparks.frustumCulled = false;
    scene.add(this.sparks);
    this.sparkNext = 0;

    // Smoke: pooled translucent spheres, grown/shrunk by life.
    this.smokeMat = new THREE.MeshLambertMaterial({ color: 0x9a9a9a, transparent: true, opacity: 0.55 });
    this.smokes = [];
    const smokeGeo = new THREE.SphereGeometry(1, 12, 10);
    for (let i = 0; i < MAX_SMOKE; i++) {
      const m = new THREE.Mesh(smokeGeo, this.smokeMat.clone());
      m.visible = false;
      scene.add(m);
      this.smokes.push({ mesh: m, life: 0, maxLife: 1, r: 1, x: 0, y: 0, z: 0 });
    }
    this.smokeNext = 0;

    // Muzzle flash: one small plane at the viewmodel muzzle, shown briefly.
    this.flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 0.34),
      new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.flashLife = 0;
    scene.add(this.flash);

    // Bomb light: pulsing red sphere shown while the charge is planted.
    this.bombLight = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xff2a1a }),
    );
    this.bombLight.visible = false;
    scene.add(this.bombLight);
  }

  addTracer(ax, ay, az, bx, by, bz) {
    const i = this.tracerNext;
    this.tracerNext = (this.tracerNext + 1) % MAX_TRACERS;
    this.tracerPos[i * 6] = ax; this.tracerPos[i * 6 + 1] = ay; this.tracerPos[i * 6 + 2] = az;
    this.tracerPos[i * 6 + 3] = bx; this.tracerPos[i * 6 + 4] = by; this.tracerPos[i * 6 + 5] = bz;
    this.tracerLife[i] = 0.09;
  }

  addSparks(x, y, z, n, spread = 2.2) {
    for (let k = 0; k < n; k++) {
      const i = this.sparkNext;
      this.sparkNext = (this.sparkNext + 1) % MAX_SPARKS;
      this.sparkPos[i * 3] = x; this.sparkPos[i * 3 + 1] = y; this.sparkPos[i * 3 + 2] = z;
      this.sparkVel[i * 3] = (Math.random() - 0.5) * spread * 2;
      this.sparkVel[i * 3 + 1] = Math.random() * spread;
      this.sparkVel[i * 3 + 2] = (Math.random() - 0.5) * spread * 2;
      this.sparkLife[i] = 0.25 + Math.random() * 0.25;
    }
  }

  addSmoke(x, y, z, r, life) {
    const s = this.smokes[this.smokeNext];
    this.smokeNext = (this.smokeNext + 1) % MAX_SMOKE;
    s.x = x; s.y = y; s.z = z; s.r = r; s.life = life; s.maxLife = life;
    s.mesh.visible = true;
    s.mesh.position.set(x, y, z);
    s.mesh.scale.setScalar(r);
  }

  muzzle(x, y, z, yaw) {
    this.flash.position.set(x, y, z);
    this.flash.rotation.y = yaw;
    this.flashLife = 0.05;
    this.flash.material.opacity = 0.95;
  }

  // Sim-side smoke volumes (for LOS blocking) are kept by the sim; the FX
  // pool only renders them. This mirrors a sim smoke into the pool.
  syncSmoke(volumes) {
    // Hide all, then show the live ones (at most MAX_SMOKE).
    for (const s of this.smokes) s.mesh.visible = false;
    const n = Math.min(volumes.length, MAX_SMOKE);
    for (let i = 0; i < n; i++) {
      const v = volumes[i];
      const s = this.smokes[i];
      s.mesh.visible = true;
      s.mesh.position.set(v.x, v.y, v.z);
      const grow = Math.min(1, (v.maxLife - v.life) / 1.5 + 0.25);
      s.mesh.scale.setScalar(v.r * grow);
      s.mesh.material.opacity = 0.5 * Math.min(1, v.life / 2);
    }
  }

  update(dt, time) {
    for (let i = 0; i < MAX_TRACERS; i++) {
      if (this.tracerLife[i] > 0) {
        this.tracerLife[i] -= dt;
        if (this.tracerLife[i] <= 0) {
          // Collapse the tracer to a point so it vanishes.
          this.tracerPos[i * 6 + 3] = this.tracerPos[i * 6];
          this.tracerPos[i * 6 + 4] = this.tracerPos[i * 6 + 1];
          this.tracerPos[i * 6 + 5] = this.tracerPos[i * 6 + 2];
        }
      }
    }
    this.tracerGeo.attributes.position.needsUpdate = true;
    for (let i = 0; i < MAX_SPARKS; i++) {
      if (this.sparkLife[i] > 0) {
        this.sparkLife[i] -= dt;
        this.sparkPos[i * 3] += this.sparkVel[i * 3] * dt;
        this.sparkPos[i * 3 + 1] += this.sparkVel[i * 3 + 1] * dt;
        this.sparkPos[i * 3 + 2] += this.sparkVel[i * 3 + 2] * dt;
        this.sparkVel[i * 3 + 1] -= 6 * dt;
        if (this.sparkLife[i] <= 0) this.sparkPos[i * 3 + 1] = -100;
      }
    }
    this.sparkGeo.attributes.position.needsUpdate = true;
    if (this.flashLife > 0) {
      this.flashLife -= dt;
      this.flash.material.opacity = Math.max(0, this.flashLife / 0.05) * 0.95;
      this.flash.rotation.z = Math.random() * Math.PI;
    } else {
      this.flash.material.opacity = 0;
    }
    if (this.bombLight.visible) {
      const p = 0.6 + 0.4 * Math.sin(time * 10);
      this.bombLight.material.color.setRGB(1, 0.16 * p, 0.1 * p);
    }
  }
}
