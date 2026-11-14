// Weapon state and gunfeel math. A shooter is any object with
// {weapon, mag, reserve, bloom, lastShotAt, reloading, reloadEndsAt}.
// All timing is in sim seconds; this module holds no three.js state.
import { WEAPONS } from './config.js';

export function makeWeaponState(weaponId, mag = -1, reserve = -1) {
  const w = WEAPONS[weaponId];
  return {
    weapon: weaponId,
    mag: mag < 0 ? w.mag : mag,
    reserve: reserve < 0 ? w.reserve : reserve,
    bloom: 0, // accumulated spread from recent shots, decays over time
    lastShotAt: -10,
    reloading: false,
    reloadEndsAt: 0,
    triggerHeld: false,
  };
}

// Current spread (radians) for a shot: base + movement + air, minus crouch/ADS.
export function currentSpread(w, shooter, speed2d, airborne, crouched, ads) {
  let s = w.spread + shooter.bloom;
  if (speed2d > 0.5) s += w.moveSpread * Math.min(1, speed2d / 5);
  if (airborne) s += 0.03;
  if (crouched) s *= 0.7;
  if (ads) s *= 0.45;
  return s;
}

// Time between shots for this weapon.
export function shotInterval(w) { return 60 / w.rpm; }

export function canFire(w, shooter, now) {
  if (shooter.reloading) return false;
  if (shooter.mag <= 0) return false;
  return now - shooter.lastShotAt >= shotInterval(w) - 0.0001;
}

export function startReload(w, shooter, now) {
  if (shooter.reloading || shooter.reserve <= 0 || shooter.mag >= w.mag) return false;
  shooter.reloading = true;
  shooter.reloadEndsAt = now + w.reload;
  return true;
}

export function finishReload(w, shooter) {
  const need = w.mag - shooter.mag;
  const take = Math.min(need, shooter.reserve);
  shooter.mag += take;
  shooter.reserve -= take;
  shooter.reloading = false;
  shooter.bloom = 0;
}

// Recoil kick applied to the shooter's pitch (radians) and bloom.
export function applyRecoil(w, shooter, rng) {
  shooter.bloom = Math.min(0.05, shooter.bloom + w.recoil * 0.55);
  return w.recoil * (0.85 + rng() * 0.3);
}

// Damage at distance, with head multiplier applied by the caller.
export function damageAt(w, dist, head) {
  let d = w.damage;
  if (dist > w.range) {
    const t = Math.min(1, (dist - w.range) / w.range);
    d *= 1 - (1 - w.falloff) * t;
  }
  if (head) d *= w.headMult;
  return d;
}
