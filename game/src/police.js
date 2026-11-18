// Wanted level and the Velmora PD: they chase, ram, and bust you.
import { WANTED_MAX, BUST_TIME, CAR_MODELS, WORLD } from './config.js';
import { clamp, dist2, angleDiff, range } from './random.js';
import { makeCar, drawCar } from './vehicles.js';
import { randomRoadPoint } from './city.js';

export function createPolice() {
  const state = {};
  state.wanted = 0;
  state.heat = 0;
  state.unseenT = 0;
  state.bustT = 0;
  state.sirenT = 0;
  state.addHeat = function (n) {
    this.heat = Math.min(Math.max(this.heat + n, 0), WANTED_MAX);
    this.wanted = Math.floor(this.heat);
  };
  state.setWanted = function (n) {
    this.heat = n;
    this.wanted = n;
  };
  state.addWanted = function (n) {
    const next = Math.min(this.wanted + n, WANTED_MAX);
    this.setWanted(next);
  };
  return state;
}

// A fresh black-and-white cruiser, dropped on a random road.
function spawnCopCar(game, rng) {
  const model = Object.assign({}, CAR_MODELS[0]);
  model.color = '#14181d';
  const p = randomRoadPoint(rng);
  const car = makeCar(p.x, p.y, 0, model, 'police');
  car.cruise = 300;
  car.speed = 200;
  return car;
}

// How far away the nearest living cop is (squared).
function nearestCopDist2(game) {
  const p = game.player;
  let best = Infinity;
  for (const cop of game.cops) {
    best = Math.min(best, dist2(p.x, p.y, cop.car.x, cop.car.y));
  }
  return best;
}

export function updatePolice(game, dt, rng) {
  const police = game.police;
  const p = game.player;
  // Wanted decays when no cop can see the player.
  const wanted = police.wanted > 0;
  const seen = wanted && nearestCopDist2(game) <= 700 * 700;
  if (wanted && seen === false) {
    police.unseenT += dt;
    if (police.unseenT > 7) {
      police.unseenT = 0;
      police.addWanted(-1);
      if (police.wanted === 0) police.heat = 0;
    }
  } else if (wanted) {
    police.unseenT = 0;
  }
  // Spawn cops up to wanted + 1.
  const want = wanted ? Math.min(police.wanted + 1, 5) : 0;
  while (game.cops.length < want) game.cops.push({ car: spawnCopCar(game, rng), stuckT: 0 });
  // Despawn extra cops when the heat is gone.
  if (police.wanted === 0) {
    game.cops = game.cops.filter((cop) => dist2(p.x, p.y, cop.car.x, cop.car.y) <= 900 * 900);
  }
  // Siren blips while wanted.
  police.sirenT -= dt;
  if (police.wanted > 0 && police.sirenT <= 0) {
    police.sirenT = 2.2;
    game.audio.siren();
  }
  // Drop dead cops that are far away; the rest cruise or chase.
  game.cops = game.cops.filter((cop) => {
    const deadFar = cop.car.dead && dist2(p.x, p.y, cop.car.x, cop.car.y) > 800 * 800;
    return deadFar === false;
  });
  for (const cop of game.cops) {
    if (cop.car.dead) continue;
    if (police.wanted === 0) cruiseCop(game, cop, dt);
    else chaseCop(game, cop, dt);
  }
  return police;
}

// No heat, no chase: stood-down cops cruise straight ahead instead of
// still ramming and busting a clean player.
function cruiseCop(game, cop, dt) {
  const car = cop.car;
  game.police.bustT = 0;
  let accel = 240 - car.speed;
  accel = clamp(accel, -420 * dt, 300 * dt);
  car.speed += accel;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  car.x = clamp(car.x, 100, WORLD - 100);
  car.y = clamp(car.y, 100, WORLD - 100);
}

// Chase: steer toward the player, ram when close, bust on foot.
function chaseCop(game, cop, dt) {
  const police = game.police;
  const p = game.player;
  const car = cop.car;
  const targetAngle = Math.atan2(p.y - car.y, p.x - car.x);
  let turn = angleDiff(car.angle, targetAngle);
  turn = clamp(turn, -3.2 * dt, 3.2 * dt);
  car.angle += turn;
  const d = Math.sqrt(dist2(p.x, p.y, car.x, car.y));
  const targetSpeed = d > 260 ? 330 + police.wanted * 22 : 300;
  let accel = targetSpeed - car.speed;
  accel = clamp(accel, -420 * dt, 300 * dt);
  car.speed += accel;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  car.x = clamp(car.x, 100, WORLD - 100);
  car.y = clamp(car.y, 100, WORLD - 100);
  // Ram the player's car / bust the player on foot.
  const inCar = p.inCar !== null;
  if (inCar && dist2(car.x, car.y, p.inCar.x, p.inCar.y) < 52 * 52) {
    const push = 160 * dt;
    p.inCar.x += Math.cos(car.angle) * push;
    p.inCar.y += Math.sin(car.angle) * push;
    p.inCar.speed *= 0.94;
    p.inCar.hp -= 2 * dt * 10;
    game.effects.sparks((car.x + p.inCar.x) / 2, (car.y + p.inCar.y) / 2);
    if (Math.random() < dt * 2) game.audio.crash();
  }
  if (inCar === false) {
    if (d < 46 && p.speed < 60) {
      police.bustT += dt;
      if (police.bustT > BUST_TIME) {
        game.screen = 'busted';
        game.audio.busted();
      }
    } else {
      police.bustT = Math.max(police.bustT - dt * 2, 0);
    }
  }
  // Cop cars bump traffic out of the way.
  for (const o of game.cars) {
    if (o === car || o.dead) continue;
    const dd = dist2(car.x, car.y, o.x, o.y);
    if (dd >= 50 * 50) continue;
    let ddx = Math.sqrt(dd);
    if (ddx === 0) ddx = 1;
    o.x += ((o.x - car.x) / ddx) * 30 * dt * 10;
    o.y += ((o.y - car.y) / ddx) * 30 * dt * 10;
    o.speed *= 0.8;
  }
  if (car.hp <= 0) {
    car.dead = true;
    if (car.smoked !== true) {
      car.smoked = true;
      game.effects.smoke(car.x, car.y);
    }
  }
}

export function drawCops(gfx, game) {
  for (const cop of game.cops) {
    if (cop.car.dead === false) drawCar(gfx, cop.car, game.timeOfDay);
  }
}
