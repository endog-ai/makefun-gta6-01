// Velmora — game loop, screens, and wiring. The entry point the page loads.
import { WORLD, DAY_LENGTH, GARAGE, HOSPITAL } from './config.js';
import { buildCity, randomRoadPoint, nearestCentre } from './city.js';
import { makeRng, range, pick, clamp, dist2 } from './random.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createEffects } from './effects.js';
import { createPolice, updatePolice } from './police.js';
import { makePlayer, updatePlayer, nearestCar } from './player.js';
import { spawnTrafficCar, spawnParkedCar, updateTrafficCar } from './vehicles.js';
import { makePed, updatePed } from './pedestrians.js';
import { updateBullets, playerShoot, playerPunch, updateEnemies, hurtPlayer } from './combat.js';
import { createMissionState, startMission, advanceDialogue, updateMissions, objectiveText, currentStep, completeMission, missionDef } from './missions.js';
import { createCamera, updateCamera, renderWorld } from './render.js';
import { drawHUD, drawDialogue, drawTitle, drawPause, drawBusted, drawWasted, drawComplete } from './hud.js';
import { saveGame, loadSave, hasSave } from './save.js';
import { stageShot } from './shots.js';

// Seed from the URL (?seed=3); anything unparseable falls back to 1 so a
// junk query string can never break the city.
let params = new URLSearchParams(location.search);
let seedRaw = Number(params.get('seed') || 1);
let seed = Number.isFinite(seedRaw) ? seedRaw : 1;
let shotName = params.get('shot');

let canvas = document.getElementById('game');
let gfx = canvas.getContext('2d');

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

let rng = makeRng(seed);

// The whole game state lives in one object so every system can reach it.
let game = {
  time: 0,
  timeOfDay: 16.5, // golden hour
  screen: 'title',
  bustedReason: '',
  city: buildCity(seed),
  input: createInput(canvas),
  audio: createAudio(),
  effects: createEffects(),
  police: createPolice(),
  player: makePlayer(GARAGE.x - 120, GARAGE.y),
  cars: [],
  peds: [],
  cops: [],
  enemies: [],
  bullets: [],
  pickups: [],
  missions: createMissionState(),
  camera: createCamera(),
  view: { w: canvas.width, h: canvas.height },
  pickup: null,
  missionStep: null,
  objective: '',
  ctx: gfx,
  canvas,
};

// Run `spawn` n times. Used below so the seeded RNG is consumed in the
// fixed spawn order: traffic, parked cars, pedestrians, cash pickups.
function spawnMany(n, spawn) {
  for (let i = 0; i < n; i++) spawn();
}

function populateWorld() {
  spawnMany(26, () => game.cars.push(spawnTrafficCar(game.city, rng)));
  spawnMany(16, () => game.cars.push(spawnParkedCar(game.city, rng)));
  spawnMany(42, () => game.peds.push(makePed(rng)));
  // Cash, health and ammo scattered around town.
  spawnMany(9, () => {
    let p = randomRoadPoint(rng);
    game.pickups.push({ x: p.x, y: p.y, kind: 'cash', taken: false });
  });
  let fixed = [
    [HOSPITAL.x, HOSPITAL.y + 80, 'health'],
    [HOSPITAL.x, HOSPITAL.y - 80, 'health'],
    [2620, 2180, 'ammo'],
    [1020, 3380, 'ammo'],
  ];
  for (let entry of fixed) {
    game.pickups.push({ x: entry[0], y: entry[1], kind: entry[2], taken: false });
  }
}
populateWorld();

window.__game = game;

// The hidden #status line in index.html gets a one-line summary whenever the
// screen changes, so the game is not silent for assistive tech.
let statusEl = document.getElementById('status');
let lastScreen = '';
function announceScreen() {
  if (!statusEl || game.screen === lastScreen) return;
  lastScreen = game.screen;
  let text;
  switch (game.screen) {
    case 'title': text = 'Velmora title screen. Press Enter to start.'; break;
    case 'play': text = game.objective || 'Playing Velmora.'; break;
    case 'pause': text = 'Game paused.'; break;
    case 'busted': text = 'Busted by the Velmora PD.'; break;
    case 'wasted': text = 'Wasted. The hospital patched you up.'; break;
    case 'complete': text = 'Story complete. Velmora is yours.'; break;
    default: text = game.screen;
  }
  statusEl.textContent = text;
}

function startGame(fromSave) {
  if (fromSave) {
    let s = loadSave();
    if (s) {
      game.player.money = s.money;
      game.player.hp = s.hp;
      game.player.ammo = s.ammo;
      game.player.x = s.x;
      game.player.y = s.y;
      if (s.weapon) game.player.weapon = s.weapon;
      game.missions.index = s.missionIndex || 0;
      game.timeOfDay = s.timeOfDay || 16.5;
    }
  }
  game.screen = 'play';
  game.audio.unlock();
  game.audio.startMusic();
  startMission(game);
}

// Back on the street after a bust or a hospital visit, minus the fine.
function respawn(penalty) {
  let p = game.player;
  p.money = Math.max(0, p.money - penalty);
  p.hp = 100;
  p.dead = false;
  p.inCar = null;
  p.x = HOSPITAL.x;
  p.y = HOSPITAL.y + 80;
  game.police.setWanted(0);
  game.police.bustT = 0;
  game.cops = [];
  game.screen = 'play';
}

// What the player just did, as reported by the player system.
function handlePlayerEvents(events) {
  for (let i = 0; i < events.length; i++) {
    let e = events[i];
    switch (e.type) {
      case 'enterCar': {
        if (!e.stolen) break;
        game.police.addWanted(1);
        game.effects.floatText(game.player.x, game.player.y - 30, 'CAR STOLEN — WANTED +1', '#ff6666');
        game.audio.horn();
        break;
      }
      case 'carDestroyed': {
        if (game.player.hp > 0) break;
        game.player.dead = true;
        game.screen = 'wasted';
        break;
      }
      case 'pickup': {
        // Grab the mission package / briefcase.
        let step = currentStep(game);
        if (!step || step.kind !== 'pickup' || !game.pickup) break;
        game.pickup = null;
        game.missions.step += 1;
        game.audio.pickup();
        let m = missionDef(game);
        if (m && game.missions.step >= m.steps.length) completeMission(game);
        break;
      }
    }
  }
}

// Cash / health / ammo lying on the ground.
function collectPickups() {
  let p = game.player;
  for (let i = 0; i < game.pickups.length; i++) {
    let pk = game.pickups[i];
    if (pk.taken) continue;
    if (dist2(p.x, p.y, pk.x, pk.y) >= 34 * 34) continue;
    pk.taken = true;
    switch (pk.kind) {
      case 'cash':
        p.money += 50;
        game.effects.floatText(pk.x, pk.y - 20, '+$50', '#7CFF6B');
        game.audio.coin();
        break;
      case 'health':
        p.hp = Math.min(100, p.hp + 40);
        game.effects.floatText(pk.x, pk.y - 20, '+40 HP', '#7CFF6B');
        game.audio.pickup();
        break;
      case 'ammo':
        p.ammo += 24;
        game.effects.floatText(pk.x, pk.y - 20, '+24 AMMO', '#ffd24d');
        game.audio.pickup();
        break;
    }
  }
}

// Cars the player shot to pieces blow up (traffic wrecks also draw heat).
function checkDestroyedCars() {
  for (let i = 0; i < game.cars.length; i++) {
    let car = game.cars[i];
    if (car.dead || car.hp > 0 || car.kind === 'player') continue;
    car.dead = true;
    game.effects.burst(car.x, car.y, '#ff7a2e', 26, 280);
    game.effects.addShake(8);
    game.audio.crash();
    if (car.kind === 'traffic') game.police.addHeat(0.3);
  }
}

// Traffic simulation: move cars, recycle far ones near the player, top the
// streets back up, and clear dead wrecks.
function updateTraffic(dt) {
  for (let i = 0; i < game.cars.length; i++) {
    let car = game.cars[i];
    if (car.dead || car.kind === 'player') continue;
    updateTrafficCar(car, dt, game.cars, game.city, rng);
    // Parked cars stay where they spawned (on a road). Only traffic gets
    // recycled near the player, snapped onto the nearest road.
    if (car.kind !== 'traffic') continue;
    if (dist2(car.x, car.y, game.player.x, game.player.y) <= 1600 * 1600) continue;
    let spot = randomRoadPoint(rng);
    let near = {
      x: game.player.x + (spot.x - 2400) * 0.4,
      y: game.player.y + (spot.y - 2400) * 0.4,
    };
    if (Math.abs(near.x - nearestCentre(near.x)) < Math.abs(near.y - nearestCentre(near.y))) {
      near.x = nearestCentre(near.x);
    } else {
      near.y = nearestCentre(near.y);
    }
    car.x = clamp(near.x, 200, WORLD - 200);
    car.y = clamp(near.y, 200, WORLD - 200);
  }
  // Keep the streets busy: top traffic back up to 26.
  let alive = game.cars.filter((c) => !c.dead && c.kind === 'traffic').length;
  if (alive < 20 && Math.random() < dt * 0.5) game.cars.push(spawnTrafficCar(game.city, rng));
  // Recycle dead cars.
  game.cars = game.cars.filter((c) => !(c.dead && c.kind === 'traffic' && Math.random() < dt * 0.05));
}

// Menu / end screens: handle input, return true when the frame is done.
function menuTitle(game, dt) {
  let input = game.input;
  // Slow pan over downtown behind the menu.
  game.camera.x = 2600 + Math.sin(game.time * 0.05) * 700;
  game.camera.y = 1800 + Math.cos(game.time * 0.04) * 500;
  game.camera.zoom = 0.9;
  if (input.justPressed('Enter')) startGame(false);
  else if (input.justPressed('c') && hasSave()) startGame(true);
  updateTraffic(dt);
  input.endFrame();
  return true;
}

function menuPause(game) {
  let input = game.input;
  if (input.justPressed('p') || input.justPressed('Escape')) {
    game.screen = 'play';
    game.audio.click();
  }
  if (input.justPressed('s')) {
    saveGame(game);
    game.effects.floatText(game.player.x, game.player.y - 40, 'SAVED', '#7CFF6B');
    game.screen = 'play';
  }
  if (input.justPressed('r')) location.reload();
  if (input.justPressed('q')) game.screen = 'title';
  if (input.justPressed('m')) game.audio.toggleMute();
  input.endFrame();
  return true;
}

function menuBusted(game) {
  if (game.input.justPressed('Enter')) respawn(150);
  game.input.endFrame();
  return true;
}

function menuWasted(game) {
  if (game.input.justPressed('Enter')) respawn(200);
  game.input.endFrame();
  return true;
}

function menuComplete(game) {
  if (game.input.justPressed('Enter')) game.screen = 'play';
  game.input.endFrame();
  return true;
}

function updateMenuScreen(dt) {
  switch (game.screen) {
    case 'title': return menuTitle(game, dt);
    case 'pause': return menuPause(game);
    case 'busted': return menuBusted(game);
    case 'wasted': return menuWasted(game);
    case 'complete': return menuComplete(game);
    default: return false;
  }
}

function update(dt) {
  game.time += dt;
  game.timeOfDay = (game.timeOfDay + (dt * 24) / DAY_LENGTH) % 24;
  game.view = { w: canvas.width, h: canvas.height };
  let input = game.input;

  if (updateMenuScreen(dt)) return;

  // --- Playing ---
  if (input.justPressed('p') || input.justPressed('Escape')) {
    game.screen = 'pause';
    game.audio.click();
    input.endFrame();
    return;
  }
  if (input.justPressed('m')) game.audio.toggleMute();
  if (input.justPressed('1')) game.player.weapon = 'fists';
  if (input.justPressed('2')) game.player.weapon = 'pistol';

  // Dialogue blocks the world.
  if (game.missions.dialogue) {
    if (input.justPressed('Enter') || input.mouse.clicked) advanceDialogue(game);
    input.endFrame();
    return;
  }

  let events = updatePlayer(game, dt);
  handlePlayerEvents(events);

  updateTraffic(dt);
  for (let pi = 0; pi < game.peds.length; pi++) {
    updatePed(game.peds[pi], dt, game.city, rng);
  }
  updatePolice(game, dt, rng);
  updateBullets(game, dt);
  updateEnemies(game, dt);
  updateMissions(game, dt);
  game.missionStep = currentStep(game);
  game.objective = objectiveText(game);
  game.effects.update(dt);

  // Shooting + punching (mouse.clicked catches a quick click between frames).
  if (input.mouse.down || input.mouse.clicked || input.justPressed('j')) playerShoot(game);
  if (input.justPressed('f') || input.justPressed(' ')) playerPunch(game);

  collectPickups();
  checkDestroyedCars();
  let p = game.player;
  if (p.hp <= 0 && !p.dead) {
    p.dead = true;
    game.screen = 'wasted';
    game.audio.busted();
  }

  updateCamera(game, dt);
  input.endFrame();
}

function render() {
  renderWorld(game);
  switch (game.screen) {
    case 'title': drawTitle(game); break;
    case 'play': drawHUD(game); drawDialogue(game); break;
    case 'pause': drawPause(game); break;
    case 'busted': drawBusted(game); break;
    case 'wasted': drawWasted(game); break;
    case 'complete': drawComplete(game); break;
  }
}

let last = performance.now();
function loop(now) {
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  announceScreen();
  render();
  requestAnimationFrame(loop);
}

if (shotName) {
  stageShot(shotName, game, update, render);
} else {
  requestAnimationFrame(loop);
}
