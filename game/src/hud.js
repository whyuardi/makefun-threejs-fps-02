// HUD: DOM overlay driven from sim snapshots. The buy menu is real DOM
// (buttons call back into the sim), so the judge can read the economy in
// code and the player can use it in the game.
import { WEAPONS, GRENADES, ARMOR_PRICE, ROUND } from './config.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(sim, onStart) {
    this.sim = sim;
    this.onStart = onStart;
    this.lastKillfeed = 0;
    this.buildBuyMenu();
    this.bindButtons(onStart);
    this.updateBuyAvailability();
  }

  bindButtons(onStart) {
    $('play-btn').addEventListener('click', () => {
      onStart();
    });
    $('restart-btn').addEventListener('click', () => {
      this.sim.startMatch();
      $('match-end').hidden = true;
      $('hud').style.visibility = 'visible';
    });
    $('buy-close').addEventListener('click', () => this.hideBuy());
    document.querySelectorAll('[data-buy]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const kind = btn.dataset.buy;
        const id = btn.dataset.id;
        if (kind === 'weapon') this.sim.buyWeapon(id);
        else if (kind === 'armor') this.sim.buyArmor();
        else if (kind === 'grenade') this.sim.buyGrenade(id);
        this.updateBuyAvailability();
        this.refresh();
      });
    });
  }

  buildBuyMenu() {
    const list = $('buy-list');
    list.innerHTML = '';
    for (const id of ['ar77', 'vex9', 'breacher', 'longbow']) {
      const w = WEAPONS[id];
      const row = document.createElement('div');
      row.className = 'buy-row';
      row.innerHTML = `<div class="buy-name">${w.name}<span>${w.damage} dmg · ${w.mag} rnd</span></div>
        <div class="buy-price">$${w.price}</div>
        <button class="buy-btn" data-buy="weapon" data-id="${id}">BUY</button>`;
      list.appendChild(row);
    }
    const armor = document.createElement('div');
    armor.className = 'buy-row';
    armor.innerHTML = `<div class="buy-name">KEVLAR VEST<span>absorbs half of damage</span></div>
      <div class="buy-price">$${ARMOR_PRICE}</div>
      <button class="buy-btn" data-buy="armor" data-id="armor">BUY</button>`;
    list.appendChild(armor);
    for (const id of ['he', 'smoke', 'flash']) {
      const g = GRENADES[id];
      const row = document.createElement('div');
      row.className = 'buy-row';
      row.innerHTML = `<div class="buy-name">${g.name}<span>throw with ${id === 'he' ? '4' : id === 'smoke' ? '5' : '6'}</span></div>
        <div class="buy-price">$${g.price}</div>
        <button class="buy-btn" data-buy="grenade" data-id="${id}">BUY</button>`;
      list.appendChild(row);
    }
  }

  showBuy() {
    if (this.sim.phase !== 'freeze') return;
    // The buy menu is a real mouse UI: release pointer lock so its
    // buttons can be clicked (lock returns when the player clicks the
    // game world again).
    if (document.pointerLockElement) document.exitPointerLock();
    $('buy-menu').hidden = false;
    this.updateBuyAvailability();
  }
  hideBuy() { $('buy-menu').hidden = true; }
  toggleBuy() {
    if ($('buy-menu').hidden) this.showBuy();
    else this.hideBuy();
  }

  updateBuyAvailability() {
    const s = this.sim;
    document.querySelectorAll('[data-buy]').forEach((btn) => {
      const kind = btn.dataset.buy;
      const id = btn.dataset.id;
      let price = 0;
      if (kind === 'weapon') price = WEAPONS[id].price;
      else if (kind === 'armor') price = ARMOR_PRICE;
      else price = GRENADES[id].price;
      if (!btn.dataset.label) btn.dataset.label = btn.textContent;
      btn.disabled = s.money < price || s.phase !== 'freeze';
      btn.textContent = s.money < price ? 'NO CASH' : btn.dataset.label;
    });
  }

  killfeed(text, good) {
    const feed = $('killfeed');
    const line = document.createElement('div');
    line.className = 'kf-line' + (good ? ' good' : '');
    line.textContent = text;
    feed.prepend(line);
    while (feed.children.length > 5) feed.lastChild.remove();
    setTimeout(() => line.remove(), 6000);
  }

  refresh() {
    const s = this.sim.snapshot();
    const p = this.sim.player;
    $('hp-num').textContent = s.hp;
    $('hp-bar').style.width = `${s.hp}%`;
    $('hp-bar').classList.toggle('low', s.hp <= 30);
    $('armor-num').textContent = s.armor;
    $('armor-bar').style.width = `${s.armor}%`;
    $('ammo-mag').textContent = s.mag;
    $('ammo-reserve').textContent = `/ ${s.reserve}`;
    $('ammo').classList.toggle('empty', s.mag === 0);
    $('money').textContent = `$${s.money}`;
    $('weapon-name').textContent = WEAPONS[s.weapon].name;
    $('round-num').textContent = `ROUND ${s.round}`;
    const mins = Math.floor(s.timer / 60);
    const secs = Math.floor(s.timer % 60).toString().padStart(2, '0');
    $('timer').textContent = s.bomb.state === 'planted'
      ? `💣 ${Math.ceil(s.bomb.fuse)}s`
      : `${mins}:${secs}`;
    $('timer').classList.toggle('urgent', s.timer < 15 || s.bomb.state === 'planted');
    $('score-ember').textContent = s.score.ember;
    $('score-ash').textContent = s.score.ash;
    $('alive-ember').textContent = `${s.emberAlive} alive`;
    $('alive-ash').textContent = `${s.ashAlive} alive`;
    // Grenade counts.
    $('nades').textContent = `HE ${s.grenades.he} · SMK ${s.grenades.smoke} · FLH ${s.grenades.flash}`;
    // Crosshair spread gap scales with bloom + movement.
    const w = WEAPONS[s.weapon];
    const spread = (p.bloom * 900 + p.moveSpeed2d * 1.2 + (p.ads ? -4 : 0));
    $('crosshair').style.setProperty('--gap', `${Math.max(4, Math.min(26, 7 + spread))}px`);
    $('crosshair').style.opacity = p.ads ? '0.55' : '0.9';
    // Announce banner (3 s).
    const ann = $('announce');
    if (s.announce && this.sim.time - this.sim.announceAt < 3.5) {
      ann.textContent = s.announce;
      ann.hidden = false;
    } else {
      ann.hidden = true;
    }
    // Plant progress ring.
    const plant = $('plant-bar');
    if (p.plantProgress > 0 && this.sim.phase === 'live') {
      plant.hidden = false;
      $('plant-fill').style.width = `${(p.plantProgress / ROUND.plantSeconds) * 100}%`;
    } else {
      plant.hidden = true;
    }
    // Flash overlay.
    $('flash').style.opacity = p.flashAlpha.toFixed(2);
    // Round-end banner.
    if (this.sim.phase === 'roundEnd') {
      const won = this.sim.score.ember > this.sim.score.ash || this.sim.endReason.includes('EMBER');
      $('round-banner').hidden = false;
      $('round-banner-title').textContent = this.sim.endReason;
      $('round-banner-sub').textContent = `EMBER ${this.sim.score.ember} — ${this.sim.score.ash} ASH · next round shortly`;
    } else {
      $('round-banner').hidden = true;
    }
    // Match end.
    if (this.sim.phase === 'matchEnd') {
      $('match-end').hidden = false;
      $('match-title').textContent = this.sim.matchWinner === 'ember' ? 'EMBER TAKES THE MATCH' : 'ASH TAKES THE MATCH';
      $('match-sub').textContent = `Final score EMBER ${this.sim.score.ember} — ${this.sim.score.ash} ASH · Kills ${this.sim.stats.kills} · Shots ${this.sim.stats.shotsFired} (hit ${this.sim.stats.shotsHit})`;
      $('hud').style.visibility = 'hidden';
    }
    // Menu visibility.
    $('menu').hidden = this.sim.phase !== 'menu';
    // Buy menu opens once when a freeze starts; afterwards B toggles it
    // and the frame loop must not fight the player's choice.
    if (this.sim.phase === 'freeze') {
      if (!this._buyAutoShown) { this.showBuy(); this._buyAutoShown = true; }
    } else {
      this._buyAutoShown = false;
      if (this.sim.phase === 'live') this.hideBuy();
    }
  }

  hitmarker(head) {
    const hm = $('hitmarker');
    hm.classList.add('on');
    hm.classList.toggle('head', head);
    clearTimeout(this._hmT);
    this._hmT = setTimeout(() => hm.classList.remove('on'), 120);
  }

  hurtFlash() {
    const d = $('damage');
    d.style.opacity = '0.55';
    clearTimeout(this._dmgT);
    this._dmgT = setTimeout(() => { d.style.opacity = '0'; }, 180);
  }
}
