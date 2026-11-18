// Cars: traffic AI, parked cars, police cars and the player's ride.
// Top-down arcade physics: a car has a heading, a speed, and slides a little.
import { WORLD, ROAD_CENTRES, CAR_MODELS } from './config.js';
import { clamp, dist2, angleDiff, pick, range } from './random.js';
import { roadAxisAt, nearestCentre, collidesWithBuildings, onRoad } from './city.js';

let nextId = 1;

// Heading angle per axis and direction: [forward, reverse].
const TRAVEL_ANGLE = {
  v: [Math.PI / 2, -Math.PI / 2],
  h: [0, Math.PI],
};

// Every car on the road, whatever its job, starts from the same shape.
export function makeCar(x, y, angle, model, kind) {
  let horizontal = Math.abs(Math.cos(angle)) > 0.7;
  let car = {
    id: nextId++,
    kind: 'traffic',
    model,
    x,
    y,
    angle,
    speed: 0,
    steer: 0,
    len: model.len,
    wid: model.wid,
    color: model.color,
    hp: 100,
    dead: false,
    honked: 0,
    brakeLight: false,
    axis: 'v',
    dir: 1,
  };
  if (kind) car.kind = kind;
  if (horizontal) car.axis = 'h';
  car.cruise = 150;
  car.laneOffset = 24;
  car.wait = 0;
  car.targetSpeed = 150;
  return car;
}

// A moving car on some road, heading along it.
export function spawnTrafficCar(city, rng, x, y) {
  let model = pick(rng, CAR_MODELS);
  let px;
  let py;
  let heading;
  if (x !== undefined) {
    px = x;
    py = y;
    heading = rng() < 0.5 ? 0 : Math.PI / 2;
  } else {
    let road = pick(rng, ROAD_CENTRES);
    let vertical = rng() < 0.5;
    let along = range(rng, 300, WORLD - 300);
    if (vertical) {
      px = road;
      py = along;
      heading = rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      px = along;
      py = road;
      heading = rng() < 0.5 ? 0 : Math.PI;
    }
  }
  let car = makeCar(px, py, heading, model, 'traffic');
  car.axis = Math.abs(Math.cos(car.angle)) > 0.7 ? 'h' : 'v';
  let forward = car.axis === 'h' ? Math.cos(car.angle) : Math.sin(car.angle);
  car.dir = forward > 0 ? 1 : -1;
  car.cruise = range(rng, 130, 210);
  car.speed = car.cruise;
  return car;
}

// A parked car hugging the side of a road.
export function spawnParkedCar(city, rng) {
  let model = pick(rng, CAR_MODELS);
  let vertical = rng() < 0.5;
  let road = pick(rng, ROAD_CENTRES);
  let along = range(rng, 400, WORLD - 400);
  let side = rng() < 0.5 ? -1 : 1;
  let x;
  let y;
  let angle;
  if (vertical) {
    x = road + side * 44;
    y = along;
    angle = side > 0 ? Math.PI / 2 : -Math.PI / 2;
  } else {
    x = along;
    y = road + side * 44;
    angle = side > 0 ? 0 : Math.PI;
  }
  let car = makeCar(x, y, angle, model, 'parked');
  car.color = model.color;
  return car;
}

// The nearest other car in front of this one, within `look` pixels.
function carAhead(cars, car, look) {
  let fx = Math.cos(car.angle);
  let fy = Math.sin(car.angle);
  let bestCar = null;
  let bestD = look;
  for (let i = 0; i < cars.length; i++) {
    let o = cars[i];
    if (o === car || o.dead) continue;
    let dx = o.x - car.x;
    let dy = o.y - car.y;
    let along = dx * fx + dy * fy;
    let side = Math.abs(-dx * fy + dy * fx);
    if (along > 0 && along < bestD && side < 30) {
      bestCar = o;
      bestD = along;
    }
  }
  return bestCar;
}

// One traffic car's brain: stay in lane, slow for the car ahead, sometimes
// turn at an intersection, and never leave the map.
export function updateTrafficCar(car, dt, cars, city, rng) {
  if (car.kind === 'parked' || car.dead) return;
  // Dodge the player's car: swerve to the other lane instead of sitting on it.
  let ahead0 = carAhead(cars, car, 100);
  if (ahead0 && ahead0.kind === 'player') car.dodgeT = 1.2;
  car.dodgeT = Math.max(0, (car.dodgeT || 0) - dt);
  let lane = car.dodgeT > 0 ? -car.laneOffset : car.laneOffset;
  // Stay in lane: pull toward the road centreline + lane offset.
  let centreCoord = car.axis === 'v' ? car.x : car.y;
  let centre = nearestCentre(centreCoord);
  let targetX = car.axis === 'v' ? centre + lane * car.dir : car.x;
  let targetY = car.axis === 'v' ? car.y : centre + lane * car.dir;
  let travelAngle = TRAVEL_ANGLE[car.axis][car.dir > 0 ? 0 : 1];
  // Steer toward the lane first, then toward the travel direction.
  let laneAngle = Math.atan2(targetY - car.y, targetX - car.x);
  let dLane = Math.hypot(targetX - car.x, targetY - car.y);
  let desired = dLane > 26 ? laneAngle : travelAngle;
  car.angle += clamp(angleDiff(car.angle, desired), -2.4 * dt, 2.4 * dt);
  // Slow for the car ahead.
  let ahead = carAhead(cars, car, 90);
  if (ahead) {
    car.targetSpeed = Math.max(0, ahead.speed - 20);
  } else {
    car.targetSpeed = car.cruise;
  }
  if (car.wait > 0) {
    car.wait -= dt;
    car.targetSpeed = 0;
  }
  car.speed += clamp(car.targetSpeed - car.speed, -260 * dt, 140 * dt);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  // At an intersection, sometimes turn onto the cross street.
  if (roadAxisAt(car.x, car.y) === 'x' && rng() < 0.012) {
    if (rng() < 0.5) car.dir = -car.dir;
    car.axis = car.axis === 'v' ? 'h' : 'v';
    car.angle = TRAVEL_ANGLE[car.axis][car.dir > 0 ? 0 : 1];
    car.laneOffset = rng() < 0.5 ? 24 : -24;
    car.x = clamp(car.x, 120, WORLD - 120);
    car.y = clamp(car.y, 120, WORLD - 120);
  }
  // Turn around at the map edge instead of driving off it.
  if (car.x < 100 || car.x > WORLD - 100 || car.y < 100 || car.y > WORLD - 100) {
    car.x = clamp(car.x, 120, WORLD - 120);
    car.y = clamp(car.y, 120, WORLD - 120);
    car.angle += Math.PI;
    car.axis = car.axis === 'v' ? 'h' : 'v';
    car.dir = -car.dir;
  }
}

// Player driving physics. Returns true when the car is destroyed.
export function driveCar(car, dt, input, city, cars, effects, audio) {
  let fwd = input.down('w', 'ArrowUp') ? 1 : 0;
  let back = input.down('s', 'ArrowDown') ? 1 : 0;
  let left = input.down('a', 'ArrowLeft') ? 1 : 0;
  let right = input.down('d', 'ArrowRight') ? 1 : 0;
  let handbrake = input.down(' ');
  let accel = car.model.accel;
  if (fwd) car.speed += accel * dt;
  if (back) {
    let braking = car.speed > 10 ? 620 : 260;
    car.speed -= braking * dt;
  }
  if (!fwd && !back) {
    let drag = Math.min(200 * dt, Math.abs(car.speed));
    car.speed -= Math.sign(car.speed) * drag;
  }
  car.speed = clamp(car.speed, -car.model.top * 0.45, car.model.top);
  // Steering bites harder the faster you go, and reverses when reversing.
  let steerInput = 0;
  if (left) steerInput = -1;
  if (right) steerInput = 1;
  let grip = handbrake ? 0.45 : 0.92;
  void grip;
  let speedFrac = clamp(Math.abs(car.speed) / 160, 0, 1);
  let steerAmount = steerInput * 2.1 * dt * speedFrac;
  if (car.speed < 0) steerAmount = -steerAmount;
  car.angle += handbrake ? steerAmount * 1.6 : steerAmount;
  let fx = Math.cos(car.angle);
  let fy = Math.sin(car.angle);
  let nx = car.x + fx * car.speed * dt;
  let ny = car.y + fy * car.speed * dt;
  // Building collision: check the nose and the middle.
  let noseX = nx + fx * car.len * 0.5;
  let noseY = ny + fy * car.len * 0.5;
  let hit = collidesWithBuildings(city, noseX, noseY, 10)
    || collidesWithBuildings(city, nx, ny, car.wid * 0.45);
  let outOfBounds = nx < 90 || nx > WORLD - 90 || ny < 90 || ny > WORLD - 90;
  if (hit || outOfBounds) {
    if (Math.abs(car.speed) > 120) {
      effects.sparks(car.x + fx * car.len * 0.5, car.y + fy * car.len * 0.5);
      effects.addShake(6);
      audio.crash();
      car.hp -= Math.abs(car.speed) * 0.03;
    }
    car.speed *= -0.25;
  } else {
    car.x = nx;
    car.y = ny;
  }
  // Skid marks when drifting hard.
  if (handbrake && Math.abs(car.speed) > 200) {
    effects.skid(car.x - fx * car.len * 0.4, car.y - fy * car.len * 0.4, car.angle);
  }
  // Bumping other cars: traffic yields to the player — the other car takes
  // most of the push (and a sideways glance so the cars slide past), and
  // damage/speed only apply on a fresh impact.
  car._bumpCd = Math.max(0, (car._bumpCd || 0) - dt);
  for (let i = 0; i < cars.length; i++) {
    let o = cars[i];
    if (o === car || o.dead) continue;
    let d2 = dist2(car.x, car.y, o.x, o.y);
    let min = (car.len + o.len) * 0.42;
    if (d2 >= min * min) continue;
    let d = Math.sqrt(d2) || 1;
    let push = (min - d) * 0.5;
    let px = (o.x - car.x) / d;
    let py = (o.y - car.y) / d;
    o.x += px * push * 1.8;
    o.y += py * push * 1.8;
    car.x -= px * push * 0.1;
    car.y -= py * push * 0.1;
    // Sideways glance: shove the other car to the side it already sits on
    // relative to my heading, so the cars slide past instead of sticking.
    let hx = Math.cos(car.angle);
    let hy = Math.sin(car.angle);
    let cross = (o.x - car.x) * hy - (o.y - car.y) * hx; // >0: other car is left of my heading
    let side = cross < 0 ? -1 : 1;
    o.x += -hy * side * push * 0.9;
    o.y += hx * side * push * 0.9;
    if (car._bumpCd) continue;
    car._bumpCd = 0.4;
    if (Math.abs(car.speed) > 150) {
      effects.sparks((car.x + o.x) / 2, (car.y + o.y) / 2);
      audio.crash();
      car.hp -= 4;
      o.hp -= 4;
    }
    car.speed *= 0.85;
    o.speed *= 0.8;
  }
  car.brakeLight = !!back;
  if (car.hp <= 0) return true;
  return false;
}

// Body + shadow + top edge, drawn in the car's own rotated frame.
function paintCarBody(gfx, car) {
  let L = car.len;
  let W = car.wid;
  gfx.fillStyle = 'rgba(0,0,0,0.35)';
  gfx.fillRect(-L / 2 + 3, -W / 2 + 4, L, W);
  gfx.fillStyle = car.color;
  roundRect(gfx, -L / 2, -W / 2, L, W, 7);
  gfx.fill();
  gfx.fillStyle = 'rgba(255,255,255,0.16)';
  roundRect(gfx, -L / 2, -W / 2, L, 5, 4);
  gfx.fill();
  // Cabin + windshield.
  gfx.fillStyle = '#1b2430';
  roundRect(gfx, -L * 0.18, -W * 0.38, L * 0.36, W * 0.76, 4);
  gfx.fill();
  gfx.fillStyle = '#9fd8ef';
  gfx.fillRect(L * 0.16, -W * 0.34, 4, W * 0.68);
}

// Headlights, brake lights, police trim and taxi sign.
function paintCarLights(gfx, car, timeOfDay) {
  let L = car.len;
  let W = car.wid;
  let night = timeOfDay < 6 || timeOfDay >= 18;
  if (night) {
    gfx.fillStyle = '#ffe9a8';
    gfx.beginPath();
    gfx.arc(L / 2 - 2, -W / 2 + 4, 3, 0, 7);
    gfx.arc(L / 2 - 2, W / 2 - 4, 3, 0, 7);
    gfx.fill();
  }
  if (car.brakeLight) {
    gfx.fillStyle = '#ff2e2e';
    gfx.fillRect(-L / 2, -W / 2 + 3, 3, 6);
    gfx.fillRect(-L / 2, W / 2 - 9, 3, 6);
  }
  if (car.kind === 'police') drawPoliceTrim(gfx, L, W);
  if (car.kind === 'taxi') {
    gfx.fillStyle = '#111111';
    gfx.font = 'bold 8px sans-serif';
    gfx.textAlign = 'center';
    gfx.fillText('TAXI', 0, 3);
  }
}

export function drawCar(gfx, car, timeOfDay) {
  gfx.save();
  gfx.translate(car.x, car.y);
  gfx.rotate(car.angle);
  paintCarBody(gfx, car);
  paintCarLights(gfx, car, timeOfDay);
  gfx.restore();
}

// White door band, blue + red light bar, flashing halo.
function drawPoliceTrim(gfx, L, W) {
  gfx.fillStyle = '#ffffff';
  gfx.fillRect(-L * 0.32, -W / 2 + 1, L * 0.2, W - 2);
  gfx.fillStyle = '#2244ff';
  gfx.fillRect(-L * 0.1, -W / 2 + 2, 8, 6);
  gfx.fillRect(-L * 0.1, W / 2 - 8, 8, 6);
  gfx.fillStyle = '#ff2222';
  gfx.fillRect(-L * 0.1 + 10, -W / 2 + 2, 8, 6);
  gfx.fillRect(-L * 0.1 + 10, W / 2 - 8, 8, 6);
  let flash = (Date.now() / 300) % 2 < 1;
  gfx.fillStyle = flash ? 'rgba(60,120,255,0.5)' : 'rgba(255,60,60,0.5)';
  gfx.beginPath();
  gfx.arc(0, 0, L * 0.42, 0, 7);
  gfx.fill();
}

export function roundRect(gfx, x, y, w, h, r) {
  let corners = [
    [x + w, y, x + w, y + h],
    [x + w, y + h, x, y + h],
    [x, y + h, x, y],
    [x, y, x + w, y],
  ];
  gfx.beginPath();
  gfx.moveTo(x + r, y);
  for (let i = 0; i < corners.length; i++) {
    let c = corners[i];
    gfx.arcTo(c[0], c[1], c[2], c[3], r);
  }
  gfx.closePath();
}
