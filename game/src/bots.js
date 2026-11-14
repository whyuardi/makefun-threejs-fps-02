// Bot AI for EMBERLINE. One module, one job: decide what a bot does.
// Bots route on the nav graph, hold angles, engage what they see, react to
// what they hear, and (ASH only) converge to defuse a planted charge.
// The sim owns shooting, damage and movement; this module only steers.
import { BOT } from './config.js';
import { NAV, findPath, nearestNode, hasLOS, blockedBySmoke } from './level.js';
import { makeWeaponState } from './weapons.js';
import { range } from './rng.js';

export const BOT_NAMES = ['Vex', 'Moss', 'Kite', 'Rook', 'Fable', 'Sable', 'Wren', 'Bram'];

// Hold spots: [x, z, facingYaw] where defenders watch a lane or a site.
const HOLD_SPOTS = {
  A: [[-20, -10, 2.4], [-26, -16, 1.2], [-18, -16, 2.0], [-24, -6, 3.1]],
  B: [[20, -10, -2.4], [26, -16, -1.2], [18, -16, -2.0], [24, -6, -3.1]],
  MID: [[-6, -2, 0.4], [6, -2, -0.4], [0, 8, 3.14], [-10, 4, 0.8], [10, 4, -0.8]],
};

export function makeBot(id, team, name, x, z, weaponId, skill, rng) {
  const yaw = team === 'ash' ? 0 : Math.PI; // ash faces south, ember faces north
  return {
    id, team, name, skill,
    x, y: 0, z, yaw, pitch: 0,
    vx: 0, vz: 0,
    hp: BOT.hp, armor: 0, alive: true,
    ...makeWeaponState(weaponId),
    state: 'route',
    path: [], pathIdx: 0,
    holdUntil: 0, holdYaw: yaw,
    target: null, lastSeen: null, lastSeenAt: -99,
    reactionAt: 0, burstLeft: 0, burstPauseUntil: 0,
    strafeDir: 1, strafeUntil: 0,
    alert: null, alertAt: -99,
    site: null, // assigned objective site (A or B)
    crouched: false,
    blindUntil: 0,
    defuseProgress: 0,
    moveSpeed: 0,
    kills: 0,
  };
}

// Pick an objective for a bot at round start.
export function assignObjective(bot, rng, siteId) {
  bot.site = siteId;
  const spots = HOLD_SPOTS[siteId];
  const spot = spots[Math.floor(rng() * spots.length)];
  bot.holdSpot = spot;
  // Route to the hold spot via the nav graph.
  bot.path = findPath(bot.x, bot.z, nearestNode(spot[0], spot[1]));
  bot.pathIdx = 0;
  bot.state = 'route';
}

function eyeY(bot) { return bot.y + (bot.crouched ? 1.1 : 1.55); }

// Can this bot see `other` (player or bot)? FOV + range + LOS + smoke.
export function canSee(bot, other, smokes) {
  if (!other.alive) return false;
  const dx = other.x - bot.x, dz = other.z - bot.z;
  const dist = Math.hypot(dx, dz);
  if (dist > BOT.sightRange) return false;
  const oy = other.y + (other.crouched ? 1.1 : 1.55);
  // FOV: forward vector from yaw (yaw 0 faces -z).
  const fx = -Math.sin(bot.yaw), fz = -Math.cos(bot.yaw);
  const dot = (dx * fx + dz * fz) / (dist || 1);
  if (dot < BOT.fovCos && dist > 4) return false;
  if (!hasLOS(bot.x, eyeY(bot), bot.z, other.x, oy, other.z)) return false;
  if (blockedBySmoke(bot.x, eyeY(bot), bot.z, other.x, oy, other.z, smokes)) return false;
  return true;
}

// Nearest visible enemy for a bot. `foes` is an array of player/bot objects.
export function nearestVisible(bot, foes, smokes) {
  let best = null, bestD = Infinity;
  for (const f of foes) {
    if (!f.alive || f.team === bot.team) continue;
    if (!canSee(bot, f, smokes)) continue;
    const d = Math.hypot(f.x - bot.x, f.z - bot.z);
    if (d < bestD) { bestD = d; best = f; }
  }
  return best;
}

// Face a point (lerped yaw so bots turn like they have a neck, not a snap).
export function faceToward(bot, tx, tz, dt, rate = 7) {
  const want = Math.atan2(-(tx - bot.x), -(tz - bot.z));
  let d = want - bot.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  const step = Math.max(-rate * dt, Math.min(rate * dt, d));
  bot.yaw += step;
}

export function updateBot(sim, bot, dt, rng) {
  const now = sim.time;
  if (!bot.alive) return;
  if (now < bot.blindUntil) {
    bot.moveSpeed = 0;
    return; // flashed: frozen, cannot see or shoot
  }

  const foes = sim.allFighters();
  const seen = nearestVisible(bot, foes, sim.smokes);

  // --- bomb logic overrides everything for ASH after a plant
  if (sim.bomb.state === 'planted' && bot.team === 'ash') {
    const b = sim.bomb;
    const d = Math.hypot(b.x - bot.x, b.z - bot.z);
    if (d < 1.8) {
      // Channel the defuse.
      bot.state = 'defuse';
      bot.moveSpeed = 0;
      faceToward(bot, b.x, b.z, dt);
      if (seen) { /* still shoots while defusing? No: defuse needs focus */ }
      bot.defuseProgress += dt;
      if (bot.defuseProgress >= 5) {
        sim.defuseBomb(bot);
      }
      return;
    }
    // Route to the bomb.
    bot.state = 'route';
    bot.path = findPath(bot.x, bot.z, nearestNode(b.x, b.z));
    bot.pathIdx = 0;
  }

  if (seen) {
    bot.target = seen;
    bot.lastSeen = { x: seen.x, y: seen.y, z: seen.z };
    bot.lastSeenAt = now;
    bot.state = 'engage';
  } else if (bot.state === 'engage') {
    // Lost sight: keep the last seen position for a moment, then investigate.
    if (now - bot.lastSeenAt > 2.0) {
      bot.state = 'route';
      bot.alert = bot.lastSeen;
      bot.alertAt = now;
      if (bot.alert) {
        bot.path = findPath(bot.x, bot.z, nearestNode(bot.alert.x, bot.alert.z));
        bot.pathIdx = 0;
      }
    }
  }

  // Hearing: a recent gunshot nearby pulls the bot to investigate.
  if (!seen && sim.lastShot && now - sim.lastShot.at < 0.6) {
    const s = sim.lastShot;
    const d = Math.hypot(s.x - bot.x, s.z - bot.z);
    if (d < BOT.hearRange && s.team !== bot.team && now - bot.alertAt > 4) {
      bot.alert = { x: s.x, z: s.z };
      bot.alertAt = now;
      if (bot.state !== 'engage') {
        bot.state = 'route';
        bot.path = findPath(bot.x, bot.z, nearestNode(s.x, s.z));
        bot.pathIdx = 0;
      }
    }
  }

  switch (bot.state) {
    case 'engage': {
      const t = bot.target;
      if (!t || !t.alive) { bot.state = 'route'; break; }
      faceToward(bot, t.x, t.z, dt, 9);
      // Strafe sideways while fighting; pause to shoot straight sometimes.
      if (now > bot.strafeUntil) {
        bot.strafeDir = rng() < 0.5 ? -1 : 1;
        bot.strafeUntil = now + range(rng, 0.5, 1.4);
      }
      const dist = Math.hypot(t.x - bot.x, t.z - bot.z);
      const wantClose = dist > 16;
      const fx = -Math.sin(bot.yaw), fz = -Math.cos(bot.yaw);
      const rx = Math.cos(bot.yaw), rz = -Math.sin(bot.yaw);
      let mx = 0, mz = 0;
      if (wantClose) { mx += fx; mz += fz; }
      else if (dist < 6) { mx -= fx; mz -= fz; }
      mx += rx * bot.strafeDir * 0.7; mz += rz * bot.strafeDir * 0.7;
      const ml = Math.hypot(mx, mz) || 1;
      bot.vx = (mx / ml) * BOT.walkSpeed * 0.8;
      bot.vz = (mz / ml) * BOT.walkSpeed * 0.8;
      bot.moveSpeed = BOT.walkSpeed * 0.8;
      // Fire in bursts after a reaction delay.
      if (now >= bot.reactionAt && now >= bot.burstPauseUntil) {
        if (bot.burstLeft <= 0) {
          bot.burstLeft = Math.floor(range(rng, BOT.burstMin, BOT.burstMax + 1));
          bot.reactionAt = now + range(rng, BOT.reactionMin, BOT.reactionMax) * (1.3 - bot.skill * 0.6);
        }
      }
      if (bot.burstLeft > 0 && now >= bot.reactionAt) {
        sim.botShoot(bot, t, rng);
        bot.burstLeft--;
        if (bot.burstLeft <= 0) bot.burstPauseUntil = now + range(rng, BOT.burstPauseMin, BOT.burstPauseMax);
      }
      break;
    }
    case 'hold': {
      bot.moveSpeed = 0;
      bot.vx = 0; bot.vz = 0;
      // Scan: slow yaw sweep around the hold facing.
      bot.yaw = bot.holdYaw + Math.sin(now * 0.4) * 0.5;
      if (now > bot.holdUntil) {
        // Pick a new hold spot or push to the site.
        const spots = HOLD_SPOTS[bot.site || 'A'];
        const spot = spots[Math.floor(rng() * spots.length)];
        bot.holdSpot = spot;
        bot.path = findPath(bot.x, bot.z, nearestNode(spot[0], spot[1]));
        bot.pathIdx = 0;
        bot.state = 'route';
      }
      break;
    }
    case 'route':
    default: {
      // Follow the path; when it ends, hold.
      if (bot.pathIdx >= bot.path.length) {
        bot.state = 'hold';
        bot.holdUntil = now + range(rng, 4, 9);
        if (bot.holdSpot) bot.holdYaw = bot.holdSpot[2];
        bot.vx = 0; bot.vz = 0; bot.moveSpeed = 0;
        break;
      }
      const node = NAV.nodes[bot.path[bot.pathIdx]];
      const dx = node[0] - bot.x, dz = node[1] - bot.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.6) { bot.pathIdx++; break; }
      const speed = BOT.runSpeed;
      bot.vx = (dx / d) * speed;
      bot.vz = (dz / d) * speed;
      bot.moveSpeed = speed;
      faceToward(bot, node[0], node[1], dt, 6);
      break;
    }
  }
}
