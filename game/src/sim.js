// EMBERLINE simulation. Pure game logic: no three.js, no DOM.
// Fixed-step (1/60 s) from main.js; render reads this state, never the
// other way round. All entity positions are plain numbers; temporary
// vectors are module-level and reused so the hot loop allocates nothing.
import { ROUND, WEAPONS, GRENADES, ARMOR_PRICE, ARMOR_ABSORB, BOT } from './config.js';
import { makeRng, shuffle } from './rng.js';
import {
  rayHit, hasLOS, moveBox, siteAt, SITES,
  EMBER_SPAWNS, ASH_SPAWNS, nearestNode, findPath,
} from './level.js';
import { makeWeaponState, currentSpread, shotInterval, canFire, startReload, finishReload, applyRecoil, damageAt } from './weapons.js';
import { makeBot, assignObjective, updateBot, BOT_NAMES } from './bots.js';

const DT = 1 / 60;
const EYE_STAND = 1.55;
const EYE_CROUCH = 1.1;
const HALF = { x: 0.35, y: 0.85, z: 0.35 };
const HALF_CROUCH = { x: 0.35, y: 0.55, z: 0.35 };
const TMP_BOX = { x: 0, y: 0, z: 0 };
const TMP_RAY = { dist: 0 };
const GRENADE_HALF = { x: 0.12, y: 0.12, z: 0.12 };
const GRAVITY = 18;

function dirFromYawPitch(yaw, pitch, out) {
  const cp = Math.cos(pitch);
  out.x = -Math.sin(yaw) * cp;
  out.y = Math.sin(pitch);
  out.z = -Math.cos(yaw) * cp;
  return out;
}

// Ray vs a fighter's body box + head sphere. Returns {dist, head} or null.
// Writes into `out` (reused): {dist, head:boolean}.
const _hit = { dist: 0, head: false };
function rayFighter(ox, oy, oz, dx, dy, dz, f, out) {
  const cy = f.y + (f.crouched ? 0.55 : 0.85);
  const hy = f.crouched ? 0.55 : 0.85;
  let best = Infinity, head = false;
  // Body box slab test.
  const minX = f.x - 0.35, maxX = f.x + 0.35;
  const minY = cy - hy, maxY = cy + hy;
  const minZ = f.z - 0.35, maxZ = f.z + 0.35;
  let tmin = 0, tmax = Infinity, ok = true;
  if (dx === 0) { if (ox < minX || ox > maxX) ok = false; }
  else {
    let t1 = (minX - ox) / dx, t2 = (maxX - ox) / dx;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) ok = false;
  }
  if (ok) {
    if (dy === 0) { if (oy < minY || oy > maxY) ok = false; }
    else {
      let t1 = (minY - oy) / dy, t2 = (maxY - oy) / dy;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) ok = false;
    }
  }
  if (ok) {
    if (dz === 0) { if (oz < minZ || oz > maxZ) ok = false; }
    else {
      let t1 = (minZ - oz) / dz, t2 = (maxZ - oz) / dz;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) ok = false;
    }
  }
  if (ok && tmin >= 0) { best = tmin; head = false; }
  // Head sphere (radius 0.28 at eye height).
  const hx = f.x, hy2 = f.y + (f.crouched ? 1.0 : 1.5), hz = f.z;
  const lx = hx - ox, ly = hy2 - oy, lz = hz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca > 0) {
    const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
    if (d2 < 0.28 * 0.28) {
      const thc = Math.sqrt(0.28 * 0.28 - d2);
      const t0 = tca - thc;
      if (t0 >= 0 && t0 < best) { best = t0; head = true; }
    }
  }
  if (best === Infinity) return null;
  out.dist = best; out.head = head;
  return out;
}

export class Game {
  constructor(seed = 1) {
    this.rng = makeRng(seed);
    this.time = 0;
    this.phase = 'menu'; // menu | freeze | live | roundEnd | matchEnd
    this.phaseT = 0; // seconds in current phase
    this.round = 0;
    this.roundsPlayed = 0;
    this.score = { ember: 0, ash: 0 };
    this.timer = ROUND.roundSeconds;
    this.money = ROUND.startMoney;
    this.lossStreak = 0;
    this.events = [];
    this.fighters = [];
    this.bots = [];
    this.grenades = [];
    this.smokes = []; // {x,y,z,r,life,maxLife}
    this.lastShot = null;
    this.bomb = { state: 'carried', carrier: 'player', site: null, x: 0, y: 0, z: 0, plantProgress: 0, fuse: 0, beepAt: 0 };
    this.player = this.makePlayer();
    this.stats = { shotsFired: 0, shotsHit: 0, kills: 0, deaths: 0, roundsWon: 0, plants: 0 };
    this.endReason = '';
    this.matchWinner = null;
    this.siteChoice = 'A';
    this.announce = '';
    this.announceAt = -99;
  }

  makePlayer() {
    return {
      isPlayer: true, team: 'ember', name: 'You',
      x: 0, y: 0, z: 19, vx: 0, vy: 0, vz: 0,
      yaw: Math.PI, pitch: 0, hp: 100, armor: 0, alive: true,
      crouched: false, onGround: true, airborne: false,
      ...makeWeaponState('p9'),
      sidearm: makeWeaponState('p9'),
      primary: null, // weapon state when a primary is owned
      primaryId: null,
      grenades: { he: 0, smoke: 0, flash: 0 },
      hasBomb: true,
      plantProgress: 0,
      blindUntil: 0, flashAlpha: 0,
      kills: 0, deaths: 0,
      moveSpeed2d: 0,
      ads: false,
      zoom: 1,
    };
  }

  allFighters() { return this.fighters; }

  // ---------------------------------------------------------- round flow
  startMatch() {
    this.score = { ember: 0, ash: 0 };
    this.round = 0;
    this.roundsPlayed = 0;
    this.money = ROUND.startMoney;
    this.lossStreak = 0;
    this.stats = { shotsFired: 0, shotsHit: 0, kills: 0, deaths: 0, roundsWon: 0, plants: 0 };
    this.startRound();
  }

  startRound() {
    this.round++;
    this.roundsPlayed++;
    this.phase = 'freeze';
    this.phaseT = 0;
    this.timer = ROUND.roundSeconds;
    this.grenades.length = 0;
    this.smokes.length = 0;
    this.lastShot = null;
    this.siteChoice = this.rng() < 0.5 ? 'A' : 'B';
    // Reset the player.
    const p = this.player;
    p.hp = 100; p.alive = true;
    p.crouched = false; p.vx = 0; p.vy = 0; p.vz = 0; p.y = 0;
    p.hasBomb = true;
    p.plantProgress = 0; p.blindUntil = 0; p.flashAlpha = 0;
    p.reloading = false; p.bloom = 0;
    if (p.primary) { p.primary.mag = WEAPONS[p.primaryId].mag; p.primary.reserve = WEAPONS[p.primaryId].reserve; }
    p.sidearm.mag = WEAPONS.p9.mag; p.sidearm.reserve = WEAPONS.p9.reserve;
    // Spawn the player at a random EMBER spawn, facing north (yaw PI faces -z? yaw PI => dir (0,0,1)? see dirFromYawPitch: yaw PI -> (0,0,1) south. We want north: yaw 0.)
    const sp = EMBER_SPAWNS[Math.floor(this.rng() * EMBER_SPAWNS.length)];
    p.x = sp[0]; p.z = sp[1]; p.yaw = 0; p.pitch = 0;
    this.equip('sidearm');
    // Bots: 3 EMBER teammates, 4 ASH defenders.
    this.bots = [];
    const names = shuffle(this.rng, [...BOT_NAMES]);
    let ni = 0;
    const emberWeapons = ['ar77', 'ar77', 'vex9'];
    for (let i = 0; i < 3; i++) {
      const s = EMBER_SPAWNS[(i + 1) % EMBER_SPAWNS.length];
      const b = makeBot(`e${i}`, 'ember', names[ni++], s[0] + 1.5, s[1], emberWeapons[i], 0.55 + this.rng() * 0.2, this.rng);
      assignObjective(b, this.rng, this.siteChoice);
      this.bots.push(b);
    }
    const ashWeapons = ['ar77', 'ar77', 'longbow', 'vex9'];
    for (let i = 0; i < 4; i++) {
      const s = ASH_SPAWNS[i % ASH_SPAWNS.length];
      const b = makeBot(`a${i}`, 'ash', names[ni++], s[0], s[1], ashWeapons[i], 0.55 + this.rng() * 0.25, this.rng);
      assignObjective(b, this.rng, i % 2 === 0 ? 'A' : 'B');
      this.bots.push(b);
    }
    this.bomb = { state: 'carried', carrier: 'player', site: null, x: 0, y: 0, z: 0, plantProgress: 0, fuse: 0, beepAt: 0 };
    this.rebuildFighters();
    this.events.push({ type: 'round-start', round: this.round, site: this.siteChoice });
    this.setAnnounce(`ROUND ${this.round} — push ${this.siteChoice}`);
  }

  rebuildFighters() {
    this.fighters.length = 0;
    this.fighters.push(this.player);
    for (const b of this.bots) this.fighters.push(b);
  }

  setAnnounce(text) {
    this.announce = text;
    this.announceAt = this.time;
  }

  endRound(winner, reason) {
    if (this.phase === 'roundEnd' || this.phase === 'matchEnd') return;
    this.phase = 'roundEnd';
    this.phaseT = 0;
    this.endReason = reason;
    this.score[winner]++;
    const playerWon = winner === 'ember';
    if (playerWon) {
      this.money += ROUND.winReward;
      this.lossStreak = 0;
      this.stats.roundsWon++;
      this.events.push({ type: 'sound', name: 'round-win' });
    } else {
      this.money += ROUND.lossReward + Math.min(2, this.lossStreak) * ROUND.lossStreakBonus;
      this.lossStreak++;
      this.events.push({ type: 'sound', name: 'round-lose' });
    }
    this.setAnnounce(playerWon ? `ROUND WON — ${reason}` : `ROUND LOST — ${reason}`);
    this.events.push({ type: 'round-end', winner, reason, score: { ...this.score } });
  }

  endMatch() {
    this.phase = 'matchEnd';
    this.phaseT = 0;
    this.matchWinner = this.score.ember > this.score.ash ? 'ember' : 'ash';
    this.events.push({ type: 'match-end', winner: this.matchWinner, score: { ...this.score } });
  }

  // ------------------------------------------------------------- economy
  buyWeapon(id) {
    const p = this.player;
    const w = WEAPONS[id];
    if (!w || w.slot !== 'primary') return false;
    if (this.phase !== 'freeze') return false;
    if (this.money < w.price) { this.events.push({ type: 'sound', name: 'denied' }); return false; }
    this.money -= w.price;
    p.primaryId = id;
    p.primary = makeWeaponState(id);
    this.equip('primary');
    this.events.push({ type: 'sound', name: 'buy' });
    return true;
  }

  buyArmor() {
    const p = this.player;
    if (this.phase !== 'freeze' || p.armor >= 100) return false;
    if (this.money < ARMOR_PRICE) { this.events.push({ type: 'sound', name: 'denied' }); return false; }
    this.money -= ARMOR_PRICE;
    p.armor = 100;
    this.events.push({ type: 'sound', name: 'buy' });
    return true;
  }

  buyGrenade(id) {
    const p = this.player;
    const g = GRENADES[id];
    if (!g || this.phase !== 'freeze') return false;
    if (p.grenades[id] >= 2) return false;
    if (this.money < g.price) { this.events.push({ type: 'sound', name: 'denied' }); return false; }
    this.money -= g.price;
    p.grenades[id]++;
    this.events.push({ type: 'sound', name: 'buy' });
    return true;
  }

  equip(slot) {
    const p = this.player;
    if (slot === 'primary' && p.primary) {
      p.weapon = p.primaryId; p.mag = p.primary.mag; p.reserve = p.primary.reserve;
      p.bloom = p.primary.bloom; p.reloading = p.primary.reloading; p.reloadEndsAt = p.primary.reloadEndsAt;
      p._slot = 'primary';
    } else {
      p.weapon = 'p9'; p.mag = p.sidearm.mag; p.reserve = p.sidearm.reserve;
      p.bloom = p.sidearm.bloom; p.reloading = p.sidearm.reloading; p.reloadEndsAt = p.sidearm.reloadEndsAt;
      p._slot = 'sidearm';
    }
  }

  // Keep the active weapon state's numbers synced back to its slot object.
  syncWeaponState() {
    const p = this.player;
    const slot = p._slot === 'primary' && p.primary ? p.primary : p.sidearm;
    slot.mag = p.mag; slot.reserve = p.reserve; slot.bloom = p.bloom;
    slot.reloading = p.reloading; slot.reloadEndsAt = p.reloadEndsAt;
    slot.lastShotAt = p.lastShotAt;
  }

  // ------------------------------------------------------------ shooting
  // Resolve one hitscan shot from `shooter` along `dir` (unit) from origin.
  // `aimErr` adds bot inaccuracy; `dmgScale` scales damage (bots hit softer).
  // Returns the hit fighter or null.
  fireHitscan(shooter, ox, oy, oz, dx, dy, dz, aimErr, rng, dmgScale = 1) {
    const w = WEAPONS[shooter.weapon];
    const pellets = w.pellets || 1;
    let hitFighter = null;
    let hitHead = false;
    let hitDist = Infinity;
    for (let pi = 0; pi < pellets; pi++) {
      // Spread cone around the aim direction.
      const spread = (shooter._spread ?? w.spread) + aimErr;
      const a = rng() * Math.PI * 2;
      const r = spread * Math.sqrt(rng());
      // Build an orthonormal basis around (dx,dy,dz).
      let ux = -dz, uy = 0, uz = dx;
      const ul = Math.hypot(ux, uy, uz) || 1;
      ux /= ul; uy /= ul; uz /= ul;
      const vx = dy * uz - dz * uy, vy = dz * ux - dx * uz, vz = dx * uy - dy * ux;
      const px = dx + (ux * Math.cos(a) + vx * Math.sin(a)) * r;
      const py = dy + (uy * Math.cos(a) + vy * Math.sin(a)) * r;
      const pz = dz + (uz * Math.cos(a) + vz * Math.sin(a)) * r;
      const pl = Math.hypot(px, py, pz);
      const qx = px / pl, qy = py / pl, qz = pz / pl;
      // Wall distance first.
      let wallDist = Infinity;
      if (rayHit(ox, oy, oz, qx, qy, qz, 120, TMP_RAY)) wallDist = TMP_RAY.dist;
      // Nearest enemy fighter.
      let best = null, bestHead = false, bestDist = wallDist;
      for (const f of this.fighters) {
        if (f === shooter || !f.alive || f.team === shooter.team) continue;
        const h = rayFighter(ox, oy, oz, qx, qy, qz, f, _hit);
        if (h && h.dist < bestDist) { best = f; bestHead = h.head; bestDist = h.dist; }
      }
      const endX = ox + qx * bestDist, endY = oy + qy * bestDist, endZ = oz + qz * bestDist;
      this.events.push({ type: 'tracer', ax: ox, ay: oy, az: oz, bx: endX, by: endY, bz: endZ });
      if (best) {
        const dmg = damageAt(w, bestDist, bestHead) * dmgScale;
        this.damageFighter(best, dmg, shooter, bestHead);
        this.events.push({ type: 'spark', x: endX, y: endY, z: endZ, n: 6, blood: true });
        if (pi === 0) { hitFighter = best; hitHead = bestHead; hitDist = bestDist; }
      } else if (wallDist < Infinity) {
        this.events.push({ type: 'spark', x: endX, y: endY, z: endZ, n: 4, blood: false });
      }
    }
    return hitFighter ? { fighter: hitFighter, head: hitHead, dist: hitDist } : null;
  }

  damageFighter(target, dmg, attacker, head) {
    if (!target.alive) return;
    let remaining = dmg;
    if (target.armor > 0) {
      const absorbed = Math.min(target.armor, remaining * ARMOR_ABSORB);
      target.armor -= absorbed;
      remaining -= absorbed;
    }
    target.hp -= remaining;
    if (target.isPlayer) {
      this.events.push({ type: 'hurt', amount: remaining });
      this.events.push({ type: 'sound', name: 'hurt' });
    } else if (attacker && attacker.isPlayer) {
      this.events.push({ type: 'hitmarker', head });
      this.events.push({ type: 'sound', name: 'hit' });
      this.stats.shotsHit++;
    }
    if (target.hp <= 0) {
      target.hp = 0;
      target.alive = false;
      target.deaths = (target.deaths || 0) + 1;
      if (attacker) attacker.kills = (attacker.kills || 0) + 1;
      this.events.push({ type: 'kill', victim: target.name, killer: attacker ? attacker.name : '?', head, victimTeam: target.team });
      if (attacker && attacker.isPlayer) {
        this.money += ROUND.killReward;
        this.stats.kills++;
        this.events.push({ type: 'sound', name: 'kill' });
      }
      if (target.isPlayer) {
        this.stats.deaths++;
        this.events.push({ type: 'sound', name: 'round-lose' });
        // Bomb drops where the player fell.
        if (this.bomb.state === 'carried' && this.bomb.carrier === 'player') {
          this.bomb.state = 'dropped';
          this.bomb.x = target.x; this.bomb.y = 0.6; this.bomb.z = target.z;
          this.setAnnounce('CHARGE DROPPED — a teammate will recover it');
        }
      }
      this.checkRoundEnd();
    }
  }

  checkRoundEnd() {
    if (this.phase !== 'live') return;
    const emberAlive = this.fighters.some((f) => f.team === 'ember' && f.alive);
    const ashAlive = this.fighters.some((f) => f.team === 'ash' && f.alive);
    if (!ashAlive) this.endRound('ember', 'SQUAD ELIMINATED');
    else if (!emberAlive) this.endRound('ash', 'SQUAD ELIMINATED');
  }

  // Player fires the equipped weapon (called from input / shot staging).
  playerShoot(now) {
    const p = this.player;
    if (!p.alive || this.phase !== 'live') return false;
    const w = WEAPONS[p.weapon];
    if (p.reloading) return false;
    if (p.mag <= 0) {
      this.events.push({ type: 'sound', name: 'dry' });
      return false;
    }
    if (!canFire(w, p, now)) return false;
    const eyeY = p.y + (p.crouched ? EYE_CROUCH : EYE_STAND);
    const dir = dirFromYawPitch(p.yaw, p.pitch, { x: 0, y: 0, z: 0 });
    // Muzzle origin slightly forward/down of the camera.
    const mx = p.x + dir.x * 0.5, my = eyeY - 0.18, mz = p.z + dir.z * 0.5;
    p._spread = currentSpread(w, p, p.moveSpeed2d, !p.onGround, p.crouched, p.ads);
    this.fireHitscan(p, mx, my, mz, dir.x, dir.y, dir.z, 0, this.rng);
    p.mag--;
    p.lastShotAt = now;
    const kick = applyRecoil(w, p, this.rng);
    p.recoil = Math.min(0.4, (p.recoil || 0) + kick);
    p.yaw += (this.rng() - 0.5) * kick * 0.4;
    this.stats.shotsFired++;
    this.lastShot = { x: p.x, y: p.y, z: p.z, team: 'ember', at: now };
    this.events.push({ type: 'sound', name: `shot-${w.id === 'ar77' ? 'rifle' : w.id === 'vex9' ? 'smg' : w.id === 'longbow' ? 'sniper' : w.id === 'breacher' ? 'shotgun' : 'pistol'}` });
    this.events.push({ type: 'muzzle', x: mx, y: my, z: mz, yaw: p.yaw });
    this.syncWeaponState();
    return true;
  }

  // Bot fires at a visible target.
  botShoot(bot, target, rng) {
    const w = WEAPONS[bot.weapon];
    if (bot.reloading) return;
    if (bot.mag <= 0) {
      if (startReload(w, bot, this.time)) this.events.push({ type: 'reload', who: bot.id });
      return;
    }
    if (!canFire(w, bot, this.time)) return;
    const eyeY = bot.y + (bot.crouched ? EYE_CROUCH : EYE_STAND);
    const tx = target.x, ty = target.y + (target.crouched ? 1.0 : 1.35), tz = target.z;
    let dx = tx - bot.x, dy = ty - eyeY, dz = tz - bot.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len; dy /= len; dz /= len;
    const dist = len;
    bot._spread = currentSpread(w, bot, bot.moveSpeed, false, bot.crouched, false);
    const aimErr = BOT.aimErrorBase * (1.4 - bot.skill) * (0.6 + dist / 40);
    const mx = bot.x + dx * 0.5, my = eyeY - 0.15, mz = bot.z + dz * 0.5;
    this.fireHitscan(bot, mx, my, mz, dx, dy, dz, aimErr, rng, BOT.damageScale);
    bot.mag--;
    bot.lastShotAt = this.time;
    applyRecoil(w, bot, rng);
    this.lastShot = { x: bot.x, y: bot.y, z: bot.z, team: bot.team, at: this.time };
    const vol = Math.min(1, 24 / Math.max(6, dist));
    this.events.push({ type: 'sound', name: 'shot-distant', vol });
    this.events.push({ type: 'muzzle', x: mx, y: my, z: mz, yaw: bot.yaw, bot: true });
  }

  playerReload(now) {
    const p = this.player;
    if (!p.alive || p.reloading) return;
    const w = WEAPONS[p.weapon];
    if (startReload(w, p, now)) {
      this.events.push({ type: 'sound', name: 'reload' });
      this.syncWeaponState();
    }
  }

  // ------------------------------------------------------------ grenades
  throwGrenade(id) {
    const p = this.player;
    if (!p.alive || this.phase !== 'live') return false;
    if ((p.grenades[id] || 0) <= 0) return false;
    p.grenades[id]--;
    const eyeY = p.y + (p.crouched ? EYE_CROUCH : EYE_STAND);
    const dir = dirFromYawPitch(p.yaw, p.pitch, { x: 0, y: 0, z: 0 });
    this.grenades.push({
      id, x: p.x + dir.x * 0.6, y: eyeY - 0.1, z: p.z + dir.z * 0.6,
      vx: dir.x * 15, vy: dir.y * 15 + 3.5, vz: dir.z * 15 + 3.5 * 0,
      fuse: id === 'he' ? 2.0 : 1.4, bounced: false, owner: 'player',
    });
    this.events.push({ type: 'sound', name: 'step' });
    return true;
  }

  explodeGrenade(g) {
    const def = GRENADES[g.id];
    if (g.id === 'he') {
      this.events.push({ type: 'explosion', x: g.x, y: g.y, z: g.z });
      this.events.push({ type: 'sound', name: 'explosion' });
      for (const f of this.fighters) {
        if (!f.alive) continue;
        const d = Math.hypot(f.x - g.x, f.z - g.z);
        if (d < def.radius) {
          const dmg = def.damage * (1 - d / (def.radius * 1.4));
          this.damageFighter(f, dmg, this.player, false);
        }
      }
    } else if (g.id === 'smoke') {
      this.smokes.push({ x: g.x, y: Math.max(1, g.y), z: g.z, r: def.radius, life: def.life, maxLife: def.life });
      this.events.push({ type: 'smoke', x: g.x, y: g.y, z: g.z, r: def.radius, life: def.life });
    } else if (g.id === 'flash') {
      this.events.push({ type: 'sound', name: 'flash' });
      // Blind bots (and the player) looking at the pop.
      for (const f of this.fighters) {
        if (!f.alive) continue;
        const d = Math.hypot(f.x - g.x, (f.y + 1.4) - g.y, f.z - g.z);
        if (d > def.radius) continue;
        if (!hasLOS(f.x, f.y + 1.4, f.z, g.x, g.y, g.z)) continue;
        // Facing: dot of forward vs direction to the flash.
        const fx = -Math.sin(f.yaw), fz = -Math.cos(f.yaw);
        const tx = (g.x - f.x) / (d || 1), tz = (g.z - f.z) / (d || 1);
        const facing = fx * tx + fz * tz;
        if (facing > -0.2) {
          const dur = 2.5 * (1 - d / (def.radius * 1.5)) * (0.4 + 0.6 * Math.max(0, facing));
          if (f.isPlayer) { this.player.blindUntil = this.time + dur; this.player.flashAlpha = 1; }
          else f.blindUntil = this.time + dur;
        }
      }
    }
  }

  // ------------------------------------------------------------ bomb
  plantBomb() {
    const p = this.player;
    if (this.phase !== 'live' || !p.alive) return;
    if (this.bomb.state !== 'carried' || this.bomb.carrier !== 'player') return;
    const site = siteAt(p.x, p.z);
    if (!site) return;
    p.plantProgress += DT;
    if (p.plantProgress >= ROUND.plantSeconds) {
      this.bomb.state = 'planted';
      this.bomb.site = site.id;
      this.bomb.x = p.x; this.bomb.y = 0.4; this.bomb.z = p.z;
      this.bomb.fuse = ROUND.fuseSeconds;
      this.bomb.beepAt = this.time;
      p.hasBomb = false;
      this.money += ROUND.plantReward;
      this.stats.plants++;
      this.setAnnounce(`CHARGE PLANTED AT ${site.id} — defend it!`);
      this.events.push({ type: 'sound', name: 'plant-done' });
      this.events.push({ type: 'planted', site: site.id });
    } else {
      if (this.time - (this._lastBeep || 0) > 0.5) {
        this._lastBeep = this.time;
        this.events.push({ type: 'sound', name: 'plant-beep' });
      }
    }
  }

  defuseBomb(bot) {
    if (this.bomb.state !== 'planted') return;
    this.bomb.state = 'defused';
    this.endRound('ash', `CHARGE DEFUSED BY ${bot.name.toUpperCase()}`);
  }

  // ------------------------------------------------------------ step
  step(input) {
    this.time += DT;
    this.phaseT += DT;
    const p = this.player;

    // Phase transitions.
    if (this.phase === 'freeze' && this.phaseT >= ROUND.freezeSeconds) {
      this.phase = 'live';
      this.phaseT = 0;
      this.setAnnounce(`ROUND ${this.round} — GO! Plant at ${this.siteChoice}`);
      this.events.push({ type: 'live' });
    } else if (this.phase === 'roundEnd' && this.phaseT >= 4) {
      if (this.score.ember >= ROUND.winRounds || this.score.ash >= ROUND.winRounds || this.roundsPlayed >= ROUND.maxRounds) {
        this.endMatch();
      } else {
        this.startRound();
      }
    }

    if (this.phase === 'live') {
      this.timer -= DT;
      if (this.timer <= 0) {
        this.timer = 0;
        if (this.bomb.state === 'planted') {
          // Fuse keeps running below; timer expiry alone does not end it.
        } else {
          this.endRound('ash', 'TIME EXPIRED');
        }
      }
      // Planted fuse.
      if (this.bomb.state === 'planted') {
        this.bomb.fuse -= DT;
        if (this.time - this.bomb.beepAt > Math.max(0.25, this.bomb.fuse / 30)) {
          this.bomb.beepAt = this.time;
          this.events.push({ type: 'sound', name: 'plant-beep' });
        }
        if (this.bomb.fuse <= 0) {
          this.events.push({ type: 'explosion', x: this.bomb.x, y: this.bomb.y, z: this.bomb.z });
          this.events.push({ type: 'sound', name: 'explosion' });
          this.endRound('ember', 'CHARGE DETONATED');
        }
      }
    }

    // ---- player movement (only while alive and in a playable phase)
    const playable = (this.phase === 'live' || this.phase === 'freeze') && p.alive;
    if (playable) {
      const speedBase = p.crouched ? 2.2 : input.sprint && !p.ads ? 6.2 : 4.6;
      const speed = speedBase * (WEAPONS[p.weapon].speed || 1) * (p.ads ? 0.55 : 1);
      const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
      let ix = 0, iz = 0;
      if (input.forward) { ix += -sin; iz += -cos; }
      if (input.back) { ix += sin; iz += cos; }
      if (input.left) { ix += -cos; iz += sin; }
      if (input.right) { ix += cos; iz += -sin; }
      const il = Math.hypot(ix, iz) || 1;
      const tx = (ix / il) * speed * (input.forward || input.back || input.left || input.right ? 1 : 0);
      const tz = (iz / il) * speed * (input.forward || input.back || input.left || input.right ? 1 : 0);
      const accel = p.onGround ? 14 : 3;
      p.vx += (tx - p.vx) * Math.min(1, accel * DT);
      p.vz += (tz - p.vz) * Math.min(1, accel * DT);
      p.moveSpeed2d = Math.hypot(p.vx, p.vz);
      // Jump.
      if (input.jump && p.onGround) {
        p.vy = 6.5;
        p.onGround = false;
      }
      p.vy -= GRAVITY * DT;
      // Move with collision (center-based box).
      TMP_BOX.x = p.x; TMP_BOX.y = p.y + (p.crouched ? 0.55 : 0.85); TMP_BOX.z = p.z;
      const half = p.crouched ? HALF_CROUCH : HALF;
      const flags = moveBox(TMP_BOX, half, p.vx * DT, p.vy * DT, p.vz * DT);
      p.x = TMP_BOX.x;
      p.z = TMP_BOX.z;
      p.y = TMP_BOX.y - half.y;
      if (flags & 1) p.vx = 0;
      if (flags & 4) p.vz = 0;
      if (flags & 2) {
        if (p.vy < 0) { p.onGround = true; p.vy = 0; }
        else p.vy = 0;
      }
      if (p.y <= 0) { p.y = 0; p.vy = 0; p.onGround = true; }
      p.airborne = !p.onGround;
      p.crouched = !!input.crouch;
      p.ads = !!input.ads && !p.reloading;
      // Clamp to the yard.
      p.x = Math.max(-31.4, Math.min(31.4, p.x));
      p.z = Math.max(-21.4, Math.min(21.4, p.z));
      // Look.
      p.yaw -= input.lookDX * 0.0023;
      p.pitch -= input.lookDY * 0.0023;
      p.pitch = Math.max(-1.5, Math.min(1.5, p.pitch));
      // Shooting.
      if (input.fire) {
        if (WEAPONS[p.weapon].auto) this.playerShoot(this.time);
        else if (!input._firedOnce) { this.playerShoot(this.time); input._firedOnce = true; }
      } else {
        input._firedOnce = false;
      }
      if (input.reload) this.playerReload(this.time);
      // Reload completion.
      if (p.reloading && this.time >= p.reloadEndsAt) {
        finishReload(WEAPONS[p.weapon], p);
        this.syncWeaponState();
      }
      p.bloom = Math.max(0, p.bloom - DT * 0.06);
      // Recoil offset recovers so sustained fire walks the aim up only briefly.
      p.recoil = Math.max(0, (p.recoil || 0) - DT * 0.3);
      // Planting (hold E inside a site).
      if (input.plant) this.plantBomb();
      else p.plantProgress = 0;
      // Grenades.
      if (input.throwHE) this.throwGrenade('he');
      if (input.throwSmoke) this.throwGrenade('smoke');
      if (input.throwFlash) this.throwGrenade('flash');
      if (input.switchPrimary) this.equip('primary');
      if (input.switchSidearm) this.equip('sidearm');
      // Flash fade.
      if (this.time > p.blindUntil) p.flashAlpha = Math.max(0, p.flashAlpha - DT * 0.6);
    } else {
      p.vx = 0; p.vz = 0; p.moveSpeed2d = 0;
    }

    // ---- bots (only while a round is being played)
    if (this.phase === 'live' || this.phase === 'freeze') {
    for (const b of this.bots) {
      if (!b.alive) continue;
      // Bot reload completion.
      if (b.reloading && this.time >= b.reloadEndsAt) finishReload(WEAPONS[b.weapon], b);
      b.bloom = Math.max(0, b.bloom - DT * 0.06);
      // Carrier bot picks up a dropped charge.
      if (this.bomb.state === 'dropped' && b.team === 'ember') {
        const d = Math.hypot(this.bomb.x - b.x, this.bomb.z - b.z);
        if (d < 1.6) {
          this.bomb.state = 'carried';
          this.bomb.carrier = b.id;
          this.setAnnounce(`${b.name.toUpperCase()} RECOVERED THE CHARGE`);
        }
      }
      // Carrier bot plants at the site.
      if (this.bomb.state === 'carried' && this.bomb.carrier === b.id) {
        const site = SITES[b.site || this.siteChoice];
        const d = Math.hypot(site.x - b.x, site.z - b.z);
        if (d < site.r) {
          b.plantProgress = (b.plantProgress || 0) + DT;
          b.moveSpeed = 0; b.vx = 0; b.vz = 0;
          if (b.plantProgress >= ROUND.plantSeconds) {
            this.bomb.state = 'planted';
            this.bomb.site = site.id;
            this.bomb.x = b.x; this.bomb.y = 0.4; this.bomb.z = b.z;
            this.bomb.fuse = ROUND.fuseSeconds;
            this.bomb.beepAt = this.time;
            this.setAnnounce(`CHARGE PLANTED AT ${site.id} — defend it!`);
            this.events.push({ type: 'sound', name: 'plant-done' });
            this.events.push({ type: 'planted', site: site.id });
          }
        } else {
          b.plantProgress = 0;
          // Route the carrier to its site.
          if (b.state !== 'engage') {
            b.path = findPath(b.x, b.z, nearestNode(site.x, site.z));
            b.pathIdx = 0;
            b.state = 'route';
          }
        }
      }
      updateBot(this, b, DT, this.rng);
      // Integrate bot movement with collision.
      TMP_BOX.x = b.x; TMP_BOX.y = b.y + 0.85; TMP_BOX.z = b.z;
      const flags = moveBox(TMP_BOX, HALF, b.vx * DT, 0, b.vz * DT);
      b.x = TMP_BOX.x; b.z = TMP_BOX.z;
      if (flags & 1) b.vx = 0;
      if (flags & 4) b.vz = 0;
      b.x = Math.max(-31.4, Math.min(31.4, b.x));
      b.z = Math.max(-21.4, Math.min(21.4, b.z));
    }
    }

    // ---- grenades
    if (this.phase === 'live' || this.phase === 'freeze') {
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.fuse -= DT;
      g.vy -= 12 * DT;
      TMP_BOX.x = g.x; TMP_BOX.y = g.y; TMP_BOX.z = g.z;
      const flags = moveBox(TMP_BOX, GRENADE_HALF, g.vx * DT, g.vy * DT, g.vz * DT);
      g.x = TMP_BOX.x; g.y = TMP_BOX.y; g.z = TMP_BOX.z;
      if (flags & 1) { g.vx *= -0.45; g.bounced = true; }
      if (flags & 4) { g.vz *= -0.45; g.bounced = true; }
      if (flags & 2) { g.vy = Math.abs(g.vy) * 0.4; g.bounced = true; }
      if (g.y < 0.12) { g.y = 0.12; g.vy = Math.abs(g.vy) * 0.4; g.vx *= 0.8; g.vz *= 0.8; g.bounced = true; }
      if (g.fuse <= 0 || (g.bounced && g.id !== 'he' && g.fuse < 0.9)) {
        this.explodeGrenade(g);
        this.grenades.splice(i, 1);
      }
    }
    }

    // ---- smoke decay
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      this.smokes[i].life -= DT;
      if (this.smokes[i].life <= 0) this.smokes.splice(i, 1);
    }

    // Input deltas are consumed once per step.
    input.lookDX = 0; input.lookDY = 0;
    input.throwHE = false; input.throwSmoke = false; input.throwFlash = false;
    input.switchPrimary = false; input.switchSidearm = false;
    input.jump = false;
  }

  // Snapshot for HUD/tests (plain numbers, cheap).
  snapshot() {
    const p = this.player;
    return {
      phase: this.phase, round: this.round, time: this.time,
      timer: Math.max(0, this.timer), score: { ...this.score },
      money: this.money, hp: Math.ceil(p.hp), armor: Math.ceil(p.armor),
      mag: p.mag, reserve: p.reserve, weapon: p.weapon,
      alive: p.alive, hasBomb: p.hasBomb,
      bomb: { state: this.bomb.state, site: this.bomb.site, fuse: Math.max(0, this.bomb.fuse) },
      emberAlive: this.fighters.filter((f) => f.team === 'ember' && f.alive).length,
      ashAlive: this.fighters.filter((f) => f.team === 'ash' && f.alive).length,
      grenades: { ...p.grenades },
      kills: this.stats.kills,
      announce: this.announce,
    };
  }
}
