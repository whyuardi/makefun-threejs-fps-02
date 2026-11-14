// EMBERLINE bootstrap. Fixed-step sim (60 Hz) decoupled from rendering;
// the loop accumulates real time and steps the sim in 1/60 s slices.
// ?shot=start|play|plant|end&seed=N stages a deterministic scene for
// screenshots (no pointer lock needed). window.__fps exposes live state
// for play-testing and debugging.
import { Game } from './sim.js';
import { Renderer } from './render.js';
import { HUD } from './hud.js';
import { makeInput, Input } from './input.js';
import { ensureAudio, playSound } from './audio.js';
import { WEAPONS } from './config.js';

const params = new URLSearchParams(window.location.search);
const seed = Number(params.get('seed') || '1');
const shot = params.get('shot') || '';

const sim = new Game(seed);
const input = makeInput();
const renderer = new Renderer(document.getElementById('game'));
const hud = new HUD(sim, () => startGame());
let inputCtl = null;

function startGame() {
  ensureAudio();
  document.getElementById('menu').hidden = true;
  sim.startMatch();
  lockPointer();
}

function lockPointer() {
  const canvas = renderer.renderer.domElement;
  if (document.pointerLockElement !== canvas) {
    canvas.requestPointerLock?.();
  }
}

inputCtl = new Input(input, renderer.renderer.domElement, {
  requestLock: () => {
    if (sim.phase === 'live' || sim.phase === 'freeze') lockPointer();
  },
  onBuyToggle: () => hud.toggleBuy(),
  onBuyKey: () => hud.toggleBuy(),
  onLockChange: () => {},
});

// Right-click ADS should not open the context menu.
renderer.renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

// ---- deterministic screenshot staging ------------------------------------
function stageShot(kind) {
  sim.startMatch();
  const p = sim.player;
  if (kind === 'start') {
    // Freeze phase, buy menu open, spawn view down the mid lane.
    p.x = 0; p.z = 19; p.yaw = 0; p.pitch = 0;
    hud.showBuy();
  } else if (kind === 'play') {
    // Mid-round combat down the east lane: two ASH bots in the open,
    // continuous fire so a tracer + muzzle flash are in the frame.
    sim.money = 4000;
    sim.buyWeapon('ar77');
    sim.phase = 'live';
    sim.phaseT = 0;
    sim.timer = 78;
    p.x = 24; p.z = 10; p.yaw = -0.17; p.pitch = 0.01;
    const a0 = sim.bots.find((b) => b.id === 'a0');
    const a1 = sim.bots.find((b) => b.id === 'a1');
    if (a0) { a0.x = 26; a0.z = -2; a0.yaw = Math.PI; a0.state = 'hold'; a0.holdUntil = 999; a0.hp = 1000; }
    if (a1) { a1.x = 22; a1.z = -8; a1.yaw = Math.PI - 0.3; a1.state = 'hold'; a1.holdUntil = 999; a1.hp = 1000; }
    setTimeout(() => { input.fire = true; }, 350);
  } else if (kind === 'plant') {
    // Planting the charge at Site A, facing the entrance where an
    // enemy is closing in.
    sim.phase = 'live';
    sim.phaseT = 0;
    sim.timer = 64;
    p.x = -22; p.z = -12; p.yaw = -1.2; p.pitch = 0;
    p.plantProgress = 1.6;
    input.plant = true;
    const a2 = sim.bots.find((b) => b.id === 'a2');
    if (a2) { a2.x = -16; a2.z = -8; a2.yaw = Math.PI; a2.state = 'route'; }
  } else if (kind === 'end') {
    // Round-end banner: EMBER up 1-0 after a squad elimination.
    sim.phase = 'live';
    for (const b of sim.bots) if (b.team === 'ash') { b.alive = false; b.hp = 0; }
    sim.checkRoundEnd(); // endRound scores EMBER 1-0 and shows the banner
    // Pull the camera to a wide view of the yard.
    p.x = 8; p.z = 14; p.yaw = -0.5; p.pitch = 0.06;
  }
  hud.refresh();
}

// ---- main loop -----------------------------------------------------------
const STEP = 1 / 60;
let last = performance.now();
let acc = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;
  acc += dt;
  let steps = 0;
  while (acc >= STEP && steps < 5) {
    sim.step(input);
    acc -= STEP;
    steps++;
  }
  // Drain sim events into visuals + audio, then clear.
  if (sim.events.length) {
    renderer.consumeEvents(sim.events, playSound);
    for (const ev of sim.events) {
      if (ev.type === 'kill') hud.killfeed(`${ev.killer} ✕ ${ev.victim}${ev.head ? ' (HEADSHOT)' : ''}`, ev.killer === 'You');
      if (ev.type === 'hitmarker') hud.hitmarker(ev.head);
      if (ev.type === 'hurt') hud.hurtFlash();
    }
    sim.events.length = 0;
  }
  hud.refresh();
  renderer.render(sim, dt, sim.time);
}

// Debug/test handle: live state, no writes except through sim methods.
window.__fps = {
  get state() { return sim.snapshot(); },
  get sim() { return sim; },
  get input() { return input; },
  start: () => startGame(),
  version: 'emberline-v1',
};

if (shot) {
  ensureAudio();
  stageShot(shot);
} else {
  // Menu backdrop: a slow camera drift over the yard before play starts.
  sim.startMatch();
  sim.phase = 'menu';
  sim.phaseT = 0;
  const p = sim.player;
  p.x = 0; p.z = 14; p.yaw = 0.2; p.pitch = 0.05;
}

requestAnimationFrame(frame);
