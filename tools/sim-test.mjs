// Headless test of the EMBERLINE sim (no DOM, no three rendering).
// Run: node tools/sim-test.mjs
import { Game } from '../game/src/sim.js';
import { makeInput } from '../game/src/input.js';

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
}
const input = makeInput();
const game = new Game(1);
const step = (n) => { for (let i = 0; i < n; i++) game.step(input); };

game.startMatch();
check('match starts in freeze', game.phase === 'freeze', game.phase);
check('4v4 fighters', game.fighters.length === 8, String(game.fighters.length));
check('player has bomb', game.player.hasBomb);

// Economy: buy during freeze.
game.money = 4000;
check('buy ar77', game.buyWeapon('ar77') === true && game.player.weapon === 'ar77', game.player.weapon);
check('money deducted', game.money === 1300, String(game.money));
check('buy armor', game.buyArmor() === true && game.player.armor === 100);
check('buy HE', game.buyGrenade('he') === true && game.player.grenades.he === 1);
check('buy too expensive denied', game.buyWeapon('longbow') === false);

// Freeze -> live after 12 s.
step(12 * 60);
check('freeze ends to live', game.phase === 'live', game.phase);

// Movement: forward (yaw 0 faces -z) moves the player north.
const z0 = game.player.z;
input.forward = true;
step(60);
input.forward = false;
check('player moves forward', game.player.z < z0 - 2, `z ${z0} -> ${game.player.z}`);

// Bots move off spawn.
const moved = game.bots.filter((b) => Math.hypot(b.x - b.x, b.z - b.z) >= 0 || b.moveSpeed > 0);
const botMoved = game.bots.some((b) => Math.abs(b.z) < 17.5 || Math.abs(b.x) > 7);
check('bots leave spawn area', botMoved);

// Shooting: pin an ASH bot in place, teleport the player behind it,
// aim exactly at it, fire.
const foe = game.bots.find((b) => b.team === 'ash');
foe.state = 'hold'; foe.holdUntil = 999; foe.vx = 0; foe.vz = 0; foe.moveSpeed = 0;
game.player.x = foe.x; game.player.z = foe.z + 5;
game.player.yaw = Math.atan2(-(foe.x - game.player.x), -(foe.z - game.player.z));
game.player.pitch = 0;
game.player.mag = 30;
const hpBefore = foe.hp;
input.fire = true;
step(90); // 1.5 s of auto fire
input.fire = false;
check('shots fired', game.stats.shotsFired > 0, String(game.stats.shotsFired));
check('foe took damage or died', foe.hp < hpBefore || !foe.alive, `hp ${hpBefore} -> ${foe.hp}`);
check('events include tracer', game.events.some((e) => e.type === 'tracer'));
game.events.length = 0;

// Reload. The round may have ended while the player was shooting, so
// advance to a fresh live round first; the test player is made very hard
// to kill so the checks below are not interrupted by bot fire.
if (game.phase === 'roundEnd') step(5 * 60);
if (game.phase === 'freeze') step(12 * 60);
game.player.hp = 10000;
game.player.mag = 0;
game.playerReload(game.time);
check('reload starts', game.player.reloading === true);
step(180);
check('reload finishes, mag full', game.player.mag === 30 && !game.player.reloading, `mag ${game.player.mag}`);

// Grenade: throw HE, wait for the pop.
game.player.grenades.he = 1;
check('throw HE', game.throwGrenade('he') === true);
step(150);
check('HE exploded and left the world', game.grenades.length === 0, String(game.grenades.length));
check('explosion event seen', game.events.some((e) => e.type === 'explosion'));
game.events.length = 0;

// Plant: teleport to Site A, hold E.
game.player.x = -23.5; game.player.z = -13.5;
game.player.plantProgress = 0;
input.plant = true;
step(200);
input.plant = false;
check('bomb planted', game.bomb.state === 'planted', game.bomb.state);
check('plant reward paid', game.money >= 650, String(game.money));

// Detonation: remove the defenders first so nobody can defuse.
for (const b of game.bots) if (b.team === 'ash') { b.alive = false; b.hp = 0; }

// Fuse runs out -> EMBER wins the round.
step(31 * 60);
check('round ends on detonation', game.phase === 'roundEnd', game.phase);
check('ember scored', game.score.ember >= 1, JSON.stringify(game.score));

// Next round starts after the banner.
step(5 * 60);
check('next round starts', game.phase === 'freeze' && game.round >= 2, `${game.phase} r${game.round}`);

// Elimination win: kill all ASH bots.
step(12 * 60); // freeze -> live
for (const b of game.bots) if (b.team === 'ash') game.damageFighter(b, 999, game.player, false);
check('elimination ends round for ember', game.phase === 'roundEnd' && game.score.ember >= 2, `${game.phase} ${JSON.stringify(game.score)}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
