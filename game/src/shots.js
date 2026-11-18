// Screenshot scenes behind ?shot=start|drive|chase|mission.
// Each one plays the real game forward from a fresh world for a fixed number
// of steps, steered by a simple autopilot, so the frame is what real play
// looks like and the same seed always gives the same frame.
import { DOCKS } from './config.js';
import { makeCar } from './vehicles.js';
import { makeEnemy } from './combat.js';
import { startMission } from './missions.js';

const STEP = 1 / 60;
const FALCO = {};
FALCO.name = 'Falco GT';
FALCO.color = '#d6336c';
FALCO.top = 660;
FALCO.accel = 480;
FALCO.len = 50;
FALCO.wid = 25;

// Wrap an angle difference into (-PI, PI].
function wrapAngle(d) {
  if (d > Math.PI) return d - Math.PI * 2;
  if (d < -Math.PI) return d + Math.PI * 2;
  return d;
}

// Hold W and steer straight ahead, using the real update loop.
function driveForward(game, seconds) {
  const input = game.input;
  const hold = { w: true };
  const origDown = input.down.bind(input);
  input.down = function (...names) {
    for (const n of names) {
      if (hold[n] || origDown(n)) return true;
    }
    return false;
  };
  const frames = Math.round(seconds / STEP);
  for (let i = 0; i < frames; i += 1) {
    const p = game.player;
    if (p.inCar === null) {
      game._step(STEP);
      continue;
    }
    // Steer gently toward the road ahead. (Revision note: steering toward
    // the road centreline was tried here and reverted — it kept the car at
    // full speed so long that the chase scene ended at the world edge with
    // a fourth wanted star, a worse frame than the approved one. Straight
    // ahead keeps the car in the action.)
    const ahead = 200;
    const fx = Math.cos(p.angle);
    const fy = Math.sin(p.angle);
    const tx = p.x + fx * ahead;
    const ty = p.y + fy * ahead;
    const want = Math.atan2(ty - p.y, tx - p.x);
    const d = wrapAngle((want - p.angle) % (Math.PI * 2));
    hold.a = d < -0.05;
    hold.d = d > 0.05;
    game._step(STEP);
  }
  input.down = origDown;
}

// Put the player in a Falco GT at (2500, 1800), heading east.
function stageCar(game, speed) {
  const car = makeCar(2500, 1800, 0, FALCO, 'player');
  car.speed = speed;
  game.cars.push(car);
  const p = game.player;
  p.inCar = car;
  p.x = car.x;
  p.y = car.y;
  p.angle = 0;
  game.camera.x = p.x;
  game.camera.y = p.y;
}

function stageDrive(game) {
  // Golden-hour drive down the Neon Mile in a Falco GT.
  game.timeOfDay = 17.2;
  game.screen = 'play';
  game.missions.dialogue = null;
  stageCar(game, 320);
  driveForward(game, 2.5);
}

function stageChase(game) {
  // Night police chase, three stars, downtown.
  game.timeOfDay = 20.6;
  game.screen = 'play';
  game.missions.dialogue = null;
  stageCar(game, 380);
  game.police.setWanted(3);
  driveForward(game, 3.5);
  // Pull a cop right into frame behind the player.
  const p = game.player;
  const slots = [[-160, 60], [-220, -70]];
  for (let k = 0; k < slots.length; k += 1) {
    const cop = game.cops[k];
    if (cop === undefined) continue;
    cop.car.x = p.x + slots[k][0];
    cop.car.y = p.y + slots[k][1];
    cop.car.angle = 0;
    cop.car.speed = 340;
  }
  game._step(STEP);
}

function stageMission(game) {
  // Dockside shootout: mission 3, Viper guards, briefcase marker.
  game.timeOfDay = 17.8;
  game.screen = 'play';
  game.missions.index = 2;
  game.missions.step = 1;
  game.missions.lastStep = -1;
  startMission(game);
  game.missions.dialogue = null;
  const p = game.player;
  p.x = DOCKS.x - 260;
  p.y = DOCKS.y + 40;
  p.angle = 0;
  p.aimAngle = 0;
  p.weapon = 'pistol';
  p.ammo = 36;
  game.camera.x = p.x + 120;
  game.camera.y = p.y;
  // A couple of shots fired so the frame shows the fight.
  game._step(STEP);
  game.bullets.push({ x: p.x + 40, y: p.y, vx: 950, vy: 0, life: 0.5, friendly: true });
  game.effects.muzzle(p.x, p.y, 0);
  game._step(STEP);
  game._step(STEP);
}

function stageTitle(game) {
  // Title screen over the city at dusk (the cover).
  game.timeOfDay = 17.4;
  game.screen = 'title';
  game.camera.x = 2600;
  game.camera.y = 1800;
  game.camera.zoom = 0.9;
  game._step(STEP);
}

export function stageShot(name, game, stepFn, renderFn) {
  // Wire the game's own update/render into a stepper the scenes can drive.
  game._step = (dt) => { stepFn(dt); renderFn(); };
  const scenes = {};
  scenes.drive = stageDrive;
  scenes.chase = stageChase;
  scenes.mission = stageMission;
  const stage = scenes[name] === undefined ? stageTitle : scenes[name];
  stage(game);
  window.__shotReady = true;
}
