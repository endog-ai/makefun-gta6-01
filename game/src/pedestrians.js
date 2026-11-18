// Pedestrians: they stroll the sidewalks, cross at corners, and run when scared.
import { WORLD, ROAD_CENTRES, PED_COLORS, PED_SHIRTS } from './config.js';
import { clamp, dist2, pick, range } from './random.js';
import { roadAxisAt, nearestCentre, onRoad, collidesWithBuildings } from './city.js';

// A person on a sidewalk, or at an explicit spot when x/y are given.
export function makePed(rng, x, y) {
  const vertical = rng() < 0.5;
  let px = x;
  let py = y;
  if (x === undefined) {
    const road = pick(rng, ROAD_CENTRES);
    if (vertical) {
      px = road + (rng() < 0.5 ? -68 : 68);
      py = range(rng, 300, WORLD - 300);
    } else {
      px = range(rng, 300, WORLD - 300);
      py = road + (rng() < 0.5 ? -68 : 68);
    }
  }
  const ped = {};
  ped.x = px;
  ped.y = py;
  ped.angle = rng() * Math.PI * 2;
  ped.speed = range(rng, 45, 75);
  ped.state = 'walk';
  ped.shirt = pick(rng, PED_SHIRTS);
  ped.skin = pick(rng, PED_COLORS);
  ped.fleeX = 0;
  ped.fleeY = 0;
  ped.fleeT = 0;
  ped.waitT = range(rng, 0, 4);
  ped.dead = false;
  ped.hp = 50;
  return ped;
}

// Everyone within `radius` of a scare runs away from it.
export function scarePeds(peds, x, y, radius) {
  for (const p of peds) {
    if (p.dead) continue;
    if (dist2(p.x, p.y, x, y) >= radius * radius) continue;
    p.state = 'flee';
    p.fleeX = x;
    p.fleeY = y;
    p.fleeT = 2.5;
  }
}

// A fleeing pedestrian runs from the scare point, sliding along walls
// instead of through them.
function updateFleeing(p, dt, city) {
  p.fleeT -= dt;
  if (p.fleeT <= 0) {
    p.state = 'walk';
    p.waitT = 0.5;
  }
  const a = Math.atan2(p.y - p.fleeY, p.x - p.fleeX);
  p.angle = a;
  const nx = p.x + Math.cos(a) * 190 * dt;
  const ny = p.y + Math.sin(a) * 190 * dt;
  if (collidesWithBuildings(city, nx, p.y, 10) === null) p.x = nx;
  if (collidesWithBuildings(city, p.x, ny, 10) === null) p.y = ny;
}

// A strolling pedestrian walks, turns at intersections, and drifts back to
// the sidewalk when they wander onto the road.
function updateStrolling(p, dt, city, rng) {
  if (p.waitT > 0) {
    p.waitT -= dt;
    return;
  }
  p.x += Math.cos(p.angle) * p.speed * dt;
  p.y += Math.sin(p.angle) * p.speed * dt;
  if (roadAxisAt(p.x, p.y) === 'x' && rng() < 0.02) {
    p.angle = pick(rng, [0, Math.PI / 2, Math.PI, -Math.PI / 2]);
    // Snap back onto a sidewalk line.
    const cx = nearestCentre(p.x);
    const cy = nearestCentre(p.y);
    const horizontal = Math.abs(Math.cos(p.angle)) > 0.7;
    if (horizontal) {
      p.y = cy + (p.y > cy ? 68 : -68);
    } else {
      p.x = cx + (p.x > cx ? 68 : -68);
    }
  }
  const out = p.x < 120 || p.x > WORLD - 120 || p.y < 120 || p.y > WORLD - 120;
  if (out) p.angle += Math.PI;
  if (onRoad(p.x, p.y)) {
    const cx = nearestCentre(p.x);
    const cy = nearestCentre(p.y);
    if (Math.abs(p.x - cx) < Math.abs(p.y - cy)) {
      p.x += (p.x > cx ? 1 : -1) * 60 * dt;
    } else {
      p.y += (p.y > cy ? 1 : -1) * 60 * dt;
    }
  }
}

export function updatePed(p, dt, city, rng) {
  if (p.dead) return;
  if (p.state === 'flee') updateFleeing(p, dt, city);
  else updateStrolling(p, dt, city, rng);
  p.x = clamp(p.x, 100, WORLD - 100);
  p.y = clamp(p.y, 100, WORLD - 100);
}

export function drawPed(gfx, p) {
  gfx.save();
  gfx.translate(p.x, p.y);
  if (p.dead) {
    gfx.rotate(p.angle);
    gfx.fillStyle = '#5a2a2a';
    gfx.beginPath();
    gfx.ellipse(0, 0, 12, 7, 0, 0, 7);
    gfx.fill();
    gfx.restore();
    return;
  }
  // Soft shadow.
  gfx.fillStyle = 'rgba(0,0,0,0.3)';
  gfx.beginPath();
  gfx.ellipse(1, 2, 9, 8, 0, 0, 7);
  gfx.fill();
  // Shirt, then the face toward the walking direction.
  gfx.fillStyle = p.shirt;
  gfx.beginPath();
  gfx.arc(0, 0, 8, 0, 7);
  gfx.fill();
  gfx.fillStyle = p.skin;
  gfx.beginPath();
  gfx.arc(Math.cos(p.angle) * 3, Math.sin(p.angle) * 3, 5, 0, 7);
  gfx.fill();
  gfx.restore();
}
