// The player: Jax Carter, on foot and behind the wheel.
import { PLAYER, WORLD } from './config.js';
import { clamp, dist2 } from './random.js';
import { collidesWithBuildings, onRoad } from './city.js';
import { driveCar } from './vehicles.js';

export function makePlayer(x, y) {
  const pl = {};
  pl.x = x;
  pl.y = y;
  pl.angle = -Math.PI / 2;
  pl.hp = PLAYER.hp;
  pl.money = PLAYER.startMoney;
  pl.ammo = PLAYER.startAmmo;
  pl.weapon = 'pistol';
  pl.inCar = null;
  pl.speed = 0;
  pl.punchCd = 0;
  pl.shootCd = 0;
  pl.hurtT = 0;
  pl.dead = false;
  return pl;
}

// The closest living car within `maxD` of a point.
export function nearestCar(cars, x, y, maxD) {
  let bestCar = null;
  let bestD = maxD * maxD;
  for (const c of cars) {
    if (c.dead) continue;
    const d = dist2(x, y, c.x, c.y);
    if (d >= bestD) continue;
    bestCar = c;
    bestD = d;
  }
  return bestCar;
}

// Driving: physics, engine sound, speeding heat, wrecks, stepping out.
// Returns events for the main loop.
function updateDriving(game, dt) {
  const pl = game.player;
  const input = game.input;
  const events = [];
  const car = pl.inCar;
  const wasHp = car.hp;
  const destroyed = driveCar(car, dt, input, game.city, game.cars, game.effects, game.audio);
  pl.x = car.x;
  pl.y = car.y;
  pl.angle = car.angle;
  pl.speed = car.speed;
  game.audio.engine(true, Math.abs(car.speed) / car.model.top);
  const speeding = Math.abs(car.speed) > 260;
  let copNear = false;
  if (speeding) {
    for (const cop of game.cops) {
      if (dist2(car.x, car.y, cop.car.x, cop.car.y) < 500 * 500) copNear = true;
    }
  }
  if (copNear) {
    // Speeding: tiny wanted heat if a cop is near (per second, not per frame,
    // so the heat does not depend on the frame rate).
    game.police.addHeat(1.2 * dt);
  }
  if (destroyed && wasHp > 0) {
    events.push({ type: 'carDestroyed', car });
    pl.inCar = null;
    pl.hp = Math.max(pl.hp - 20, 10);
    game.effects.burst(car.x, car.y, '#ff7a2e', 30, 300);
    game.effects.addShake(10);
    game.audio.crash();
  }
  if (input.justPressed('e') === false) return events;
  // Step out beside the car — never inside a building: try the other side,
  // and if both are blocked, stay at the car itself.
  pl.inCar = null;
  if (car.kind === 'player') car.kind = 'parked';
  const sideX = Math.cos(car.angle + Math.PI / 2);
  const sideY = Math.sin(car.angle + Math.PI / 2);
  const tries = [
    [sideX * 34, sideY * 34],
    [-sideX * 34, -sideY * 34],
    [0, 0],
  ];
  let spot = [0, 0];
  for (const try_ of tries) {
    const dx = try_[0];
    const dy = try_[1];
    if (collidesWithBuildings(game.city, car.x + dx, car.y + dy, PLAYER.radius) === null) {
      spot = [dx, dy];
      break;
    }
  }
  pl.x = car.x + spot[0];
  pl.y = car.y + spot[1];
  pl.speed = 0;
  game.audio.engine(false, 0);
  events.push({ type: 'exitCar' });
  return events;
}

// On foot: walk, run, collide with buildings and cars, aim, enter a car or
// grab a pickup. Returns events for the main loop.
function updateOnFoot(game, dt) {
  const pl = game.player;
  const input = game.input;
  const events = [];
  game.audio.engine(false, 0);
  const right = input.down('d', 'ArrowRight') ? 1 : 0;
  const left = input.down('a', 'ArrowLeft') ? 1 : 0;
  const mx = right - left;
  const down = input.down('s', 'ArrowDown') ? 1 : 0;
  const up = input.down('w', 'ArrowUp') ? 1 : 0;
  const my = down - up;
  const moving = mx !== 0 || my !== 0;
  const speed = input.down('Shift') ? PLAYER.run : PLAYER.walk;
  if (moving) {
    const len = Math.hypot(mx, my);
    const dx = mx / len;
    const dy = my / len;
    pl.angle = Math.atan2(dy, dx);
    const nx = pl.x + dx * speed * dt;
    const ny = pl.y + dy * speed * dt;
    // Slide along walls: try each axis on its own.
    if (collidesWithBuildings(game.city, nx, pl.y, PLAYER.radius) === null) pl.x = nx;
    if (collidesWithBuildings(game.city, pl.x, ny, PLAYER.radius) === null) pl.y = ny;
    pl.speed = speed;
    // Don't walk through cars — push out to the bumper.
    for (const c of game.cars) {
      if (c.dead) continue;
      const d = dist2(pl.x, pl.y, c.x, c.y);
      if (d >= 30 * 30) continue;
      let dd = Math.sqrt(d);
      if (dd === 0) dd = 1;
      pl.x = c.x + ((pl.x - c.x) / dd) * 30;
      pl.y = c.y + ((pl.y - c.y) / dd) * 30;
    }
  } else {
    pl.speed = 0;
  }
  pl.x = clamp(pl.x, 100, WORLD - 100);
  pl.y = clamp(pl.y, 100, WORLD - 100);

  // Aim with the mouse when armed.
  if (pl.weapon === 'pistol' && game.camera) {
    const wx = game.camera.x + (input.mouse.x - game.view.w / 2) / game.camera.zoom;
    const wy = game.camera.y + (input.mouse.y - game.view.h / 2) / game.camera.zoom;
    if (Math.hypot(wx - pl.x, wy - pl.y) > 24) pl.aimAngle = Math.atan2(wy - pl.y, wx - pl.x);
  }

  if (input.justPressed('e') === false) return events;
  const car = nearestCar(game.cars, pl.x, pl.y, 70);
  if (car !== null) {
    const wasPlayerCar = car.kind === 'player';
    pl.inCar = car;
    car.kind = 'player';
    car.speed = 0;
    const stolen = wasPlayerCar === false;
    events.push({ type: 'enterCar', car, stolen });
    game.audio.click();
    return events;
  }
  if (game.pickup && dist2(pl.x, pl.y, game.pickup.x, game.pickup.y) < 60 * 60) {
    events.push({ type: 'pickup' });
  }
  return events;
}

// On-foot movement + entering/exiting cars. Returns events for the main loop.
export function updatePlayer(game, dt) {
  const pl = game.player;
  for (const k of ['punchCd', 'shootCd', 'hurtT']) {
    pl[k] = Math.max(pl[k] - dt, 0);
  }
  if (pl.inCar) return updateDriving(game, dt);
  return updateOnFoot(game, dt);
}

export function drawPlayer(gfx, pl, time) {
  if (pl.inCar) return; // the car drawing shows the driver
  gfx.save();
  gfx.translate(pl.x, pl.y);
  // Soft shadow.
  gfx.fillStyle = 'rgba(0,0,0,0.35)';
  gfx.beginPath();
  gfx.ellipse(2, 3, 11, 9, 0, 0, 7);
  gfx.fill();
  const bob = pl.speed > 0 ? Math.sin(time * 14) * 1.5 : 0;
  gfx.rotate(pl.angle);
  // Legs, swinging as he walks.
  gfx.fillStyle = '#2c3e50';
  gfx.fillRect(-7 + bob, -7, 12, 4);
  gfx.fillRect(-7 - bob, 3, 12, 4);
  // Jacket — flashes red while hurt.
  const flashing = pl.hurtT > 0 && Math.floor(time * 12) % 2 === 0;
  gfx.fillStyle = flashing ? '#ff5555' : '#e8b93c';
  gfx.beginPath();
  gfx.arc(0, 0, 11, 0, 7);
  gfx.fill();
  // Head + cap.
  gfx.fillStyle = '#e8c39a';
  gfx.beginPath();
  gfx.arc(3, 0, 6, 0, 7);
  gfx.fill();
  gfx.fillStyle = '#222';
  gfx.fillRect(2, -6, 8, 12);
  // Gun in hand when armed.
  if (pl.weapon === 'pistol') {
    gfx.fillStyle = '#1a1a1a';
    gfx.fillRect(8, -2, 12, 4);
  }
  gfx.restore();
}
