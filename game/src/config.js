// EMBERLINE — config: palette, weapons, economy, round rules.
// One place for every number the design tunes. No three.js import here:
// the sim reads these values as plain data.
export const PALETTE = {
  skyTop: 0x232a4a,
  skyHorizon: 0xe8722a,
  fog: 0x35273a,
  ground: 0x3a3733,
  groundLine: 0x8a7a4a,
  hazard: 0xd8c56a,
  containerTeal: 0x2e6f6a,
  containerRust: 0xa4552f,
  containerSlate: 0x4a5568,
  containerOlive: 0x6b6b3f,
  crate: 0x7a6248,
  wall: 0x6a625a,
  wallDark: 0x4a4440,
  ember: 0xff7a1a,
  ash: 0x2dd4bf,
  accent: 0xf0a830,
  ink: 0xece7dd,
};

// Team names are original. EMBER attacks (plants the charge), ASH defends.
export const TEAMS = { EMBER: 'ember', ASH: 'ash' };

export const ROUND = {
  freezeSeconds: 12,
  roundSeconds: 100,
  plantSeconds: 3.0,
  defuseSeconds: 5.0,
  fuseSeconds: 30,
  winRounds: 5,
  maxRounds: 9,
  startMoney: 800,
  killReward: 300,
  winReward: 3250,
  lossReward: 1900,
  lossStreakBonus: 500,
  plantReward: 300,
};

// Weapons: damage is body damage at close range; head multiplies it.
export const WEAPONS = {
  p9: {
    id: 'p9', name: 'P9 SIDEARM', slot: 'sidearm', price: 0, auto: false,
    damage: 26, headMult: 2.0, rpm: 380, mag: 12, reserve: 48,
    reload: 1.4, spread: 0.011, moveSpread: 0.020, recoil: 0.011, range: 28, falloff: 0.65,
    speed: 1.0, tracer: 0xffd27a,
  },
  ar77: {
    id: 'ar77', name: 'AR-77 RIFLE', slot: 'primary', price: 2700, auto: true,
    damage: 33, headMult: 2.0, rpm: 600, mag: 30, reserve: 90,
    reload: 2.2, spread: 0.008, moveSpread: 0.026, recoil: 0.016, range: 40, falloff: 0.7,
    speed: 1.0, tracer: 0xffc46b,
  },
  vex9: {
    id: 'vex9', name: 'VEX-9 SMG', slot: 'primary', price: 1500, auto: true,
    damage: 24, headMult: 2.0, rpm: 800, mag: 32, reserve: 96,
    reload: 1.9, spread: 0.014, moveSpread: 0.030, recoil: 0.010, range: 22, falloff: 0.55,
    speed: 1.04, tracer: 0xffe08a,
  },
  longbow: {
    id: 'longbow', name: 'LONGBOW DMR', slot: 'primary', price: 4750, auto: false,
    damage: 88, headMult: 2.5, rpm: 55, mag: 5, reserve: 15,
    reload: 3.1, spread: 0.0015, moveSpread: 0.05, recoil: 0.055, range: 90, falloff: 0.9,
    speed: 0.96, zoom: 2.4, tracer: 0xfff2c0,
  },
  breacher: {
    id: 'breacher', name: 'BREACHER-12', slot: 'primary', price: 1200, auto: false,
    damage: 12, headMult: 1.8, rpm: 72, mag: 6, reserve: 24,
    reload: 2.6, spread: 0.045, moveSpread: 0.05, recoil: 0.035, range: 14, falloff: 0.35,
    speed: 1.0, pellets: 8, tracer: 0xffb36b,
  },
};

export const GRENADES = {
  he: { id: 'he', name: 'POPPER HE', price: 300, radius: 7, damage: 95 },
  smoke: { id: 'smoke', name: 'VEIL SMOKE', price: 300, radius: 5, life: 16 },
  flash: { id: 'flash', name: 'DAZZLE FLASH', price: 200, radius: 22 },
};

export const ARMOR_PRICE = 650;
export const ARMOR_ABSORB = 0.5; // half of incoming damage goes to armor first

// Bot tuning. Skill 0..1 scales reaction time, aim error and burst length.
export const BOT = {
  hp: 100,
  walkSpeed: 3.4,
  runSpeed: 4.4,
  sightRange: 46,
  fovCos: 0.28, // ~74 degrees half-angle
  hearRange: 34,
  reactionMin: 0.6,
  reactionMax: 1.3,
  aimErrorBase: 0.07,
  damageScale: 0.42, // bots deal less than half of weapon damage
  burstMin: 3,
  burstMax: 6,
  burstPauseMin: 0.8,
  burstPauseMax: 1.6,
};
