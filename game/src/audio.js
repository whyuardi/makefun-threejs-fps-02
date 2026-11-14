// Synthesised sound effects via WebAudio — no audio assets, no network.
// Everything is guarded: if the context cannot start, calls are no-ops.
let ctx = null;
let master = null;
let noiseBuf = null;

export function ensureAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return true;
  }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch {
    ctx = null;
    return false;
  }
  return true;
}

function noise(dur, filterFreq, gainVal, type = 'lowpass') {
  if (!ctx || !master) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = filterFreq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gainVal, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t); src.stop(t + dur);
}

function tone(freq, dur, gainVal, type = 'sine', slideTo = 0) {
  if (!ctx || !master) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gainVal, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur);
}

export function playSound(name, opts = {}) {
  if (!ctx) return;
  switch (name) {
    case 'shot-rifle': noise(0.12, 2400, 0.9); tone(160, 0.08, 0.5, 'square', 60); break;
    case 'shot-smg': noise(0.08, 3000, 0.7); tone(200, 0.05, 0.35, 'square', 80); break;
    case 'shot-pistol': noise(0.09, 2800, 0.7); tone(180, 0.06, 0.4, 'square', 70); break;
    case 'shot-sniper': noise(0.22, 1600, 1.0); tone(120, 0.15, 0.6, 'square', 40); break;
    case 'shot-shotgun': noise(0.2, 1400, 1.0); tone(110, 0.12, 0.6, 'square', 45); break;
    case 'shot-distant': noise(0.1, 900, 0.25 * (opts.vol ?? 1)); break;
    case 'reload': tone(900, 0.05, 0.2, 'square'); setTimeout(() => tone(700, 0.05, 0.2, 'square'), 140); break;
    case 'dry': tone(1200, 0.03, 0.15, 'square'); break;
    case 'hit': tone(2400, 0.05, 0.3, 'sine'); break;
    case 'kill': tone(1800, 0.06, 0.35, 'sine'); setTimeout(() => tone(2600, 0.08, 0.3, 'sine'), 70); break;
    case 'hurt': tone(220, 0.12, 0.4, 'sawtooth', 110); break;
    case 'plant-beep': tone(1200, 0.09, 0.3, 'sine'); break;
    case 'plant-done': tone(880, 0.15, 0.35, 'sine'); setTimeout(() => tone(1320, 0.2, 0.35, 'sine'), 130); break;
    case 'explosion': noise(0.9, 500, 1.0); tone(70, 0.8, 0.8, 'sine', 30); break;
    case 'round-win': [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.18, 0.3, 'sine'), i * 120)); break;
    case 'round-lose': [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.2, 0.3, 'sine'), i * 130)); break;
    case 'buy': tone(1500, 0.05, 0.25, 'sine'); setTimeout(() => tone(1900, 0.06, 0.25, 'sine'), 60); break;
    case 'denied': tone(300, 0.12, 0.3, 'square', 200); break;
    case 'flash': noise(0.3, 6000, 0.4, 'highpass'); break;
    case 'step': noise(0.04, 500, 0.12); break;
    default: break;
  }
}
