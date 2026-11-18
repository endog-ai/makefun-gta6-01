// Camera and world rendering: ground, roads, buildings, cars, people, light.
// The world is drawn in layers every frame — terrain first, then props, then
// everything that moves, then the day/night lighting on top.
import { WORLD, ROAD_STEP, ROAD_HALF, ROAD_CENTRES, DISTRICTS, BEACH_Y, SEA_Y, HARBOUR_X, HARBOUR_Y } from './config.js';
import { clamp } from './random.js';
import { drawCar } from './vehicles.js';
import { drawPed } from './pedestrians.js';
import { drawPlayer } from './player.js';
import { drawEnemy } from './combat.js';
import { drawCops } from './police.js';

// The camera starts in the middle of the map at full zoom.
export function createCamera() {
  return { x: WORLD / 2, y: WORLD / 2, zoom: 1 };
}

// Ease a value toward a target by a frame-rate-independent fraction.
function easeToward(value, target, rate, dt) {
  let f = Math.min(1, dt * rate);
  return value + (target - value) * f;
}

// Ease the camera toward the player and zoom out a little while driving.
export function updateCamera(game, dt) {
  let cam = game.camera;
  let p = game.player;
  let targetZoom = p.inCar ? 0.85 : 1;
  cam.zoom = easeToward(cam.zoom, targetZoom, 2, dt);
  let halfW = game.view.w / 2 / cam.zoom;
  let halfH = game.view.h / 2 / cam.zoom;
  cam.x = easeToward(cam.x, clamp(p.x, halfW, WORLD - halfW), 5, dt);
  cam.y = easeToward(cam.y, clamp(p.y, halfH, WORLD - halfH), 5, dt);
}

export function isNight(t) {
  return t < 6 || t >= 18;
}

export function isDusk(t) {
  return (t >= 5.5 && t < 6.5) || (t >= 16.5 && t < 18);
}

// The rectangle of world space visible on screen, with a margin so sprites
// near the edge are drawn before they pop in.
function visibleRect(game) {
  let cam = game.camera;
  let w = game.view.w / cam.zoom;
  let h = game.view.h / cam.zoom;
  let m = 60;
  return {
    l: cam.x - w / 2 - m,
    t: cam.y - h / 2 - m,
    r: cam.x + w / 2 + m,
    b: cam.y + h / 2 + m,
    w,
    h,
  };
}

function inside(r, x, y) {
  return x > r.l && x < r.r && y > r.t && y < r.b;
}

// Small canvas helpers so the draw code reads as intent, not raw state calls.
export function rect(gfx, x, y, w, h, color) {
  gfx.fillStyle = color;
  gfx.fillRect(x, y, w, h);
}

export function disc(gfx, x, y, r, color) {
  gfx.fillStyle = color;
  gfx.beginPath();
  gfx.arc(x, y, r, 0, 7);
  gfx.fill();
}

export function label(gfx, text, x, y, font, color) {
  gfx.font = font;
  gfx.textAlign = 'center';
  gfx.fillStyle = color;
  gfx.fillText(text, x, y);
}

// Each layer draws one part of the frame; renderWorld runs them in order.
function paintCars(game, r) {
  let { ctx: gfx } = game;
  for (let i = 0; i < game.cars.length; i++) {
    let car = game.cars[i];
    if (!car.dead && inside(r, car.x, car.y)) drawCar(gfx, car, game.timeOfDay);
  }
}

function paintPeds(game, r) {
  let { ctx: gfx } = game;
  for (let i = 0; i < game.peds.length; i++) {
    let ped = game.peds[i];
    if (!ped.dead && inside(r, ped.x, ped.y)) drawPed(gfx, ped);
  }
}

function paintEnemies(game, r) {
  let { ctx: gfx } = game;
  for (let i = 0; i < game.enemies.length; i++) {
    let e = game.enemies[i];
    if (inside(r, e.x, e.y)) drawEnemy(gfx, e, game.time);
  }
}

// One paint function per layer, in draw order. renderWorld walks the list.
function paintLayer(game, r, i) {
  switch (i) {
    case 0: paintGround(game, r); break;
    case 1: paintRoads(game, r); break;
    case 2: paintPark(game, r); break;
    case 3: paintBeach(game, r); break;
    case 4: paintContainers(game, r); break;
    case 5: paintBuildings(game, r); break;
    case 6: paintTrees(game, r); break;
    case 7: paintSkids(game); break;
    case 8: paintPickups(game); break;
    case 9: paintMissionMarker(game); break;
    case 10: paintCars(game, r); break;
    case 11: drawCops(game.ctx, game); break;
    case 12: paintPeds(game, r); break;
    case 13: paintEnemies(game, r); break;
    case 14: drawPlayer(game.ctx, game.player, game.time); break;
    case 15: paintBullets(game); break;
    case 16: paintParticles(game); break;
    case 17: paintFloatingTexts(game); break;
  }
}

const LAYER_COUNT = 18;

export function renderWorld(game) {
  let { ctx: gfx, view } = game;
  let cam = game.camera;
  let shake = game.effects.shakeOffset();
  let r = visibleRect(game);

  gfx.save();
  gfx.clearRect(0, 0, view.w, view.h);
  gfx.translate(view.w / 2, view.h / 2);
  gfx.scale(cam.zoom, cam.zoom);
  gfx.translate(-cam.x + shake.x, -cam.y + shake.y);

  for (let li = 0; li < LAYER_COUNT; li++) paintLayer(game, r, li);

  // Light over everything.
  paintLighting(game, r);
  gfx.restore();
}

function paintGround(game, r) {
  let { ctx: gfx } = game;
  rect(gfx, r.l, r.t, r.r - r.l, r.b - r.t, '#3a3d2c');
  // Each district tints its own patch of ground.
  for (let key in DISTRICTS) {
    let d = DISTRICTS[key];
    if (d.x1 < r.l || d.x0 > r.r || d.y1 < r.t || d.y0 > r.b) continue;
    let x = Math.max(r.l, d.x0);
    let y = Math.max(r.t, d.y0);
    let x1 = Math.min(r.r, d.x1);
    let y1 = Math.min(r.b, d.y1);
    rect(gfx, x, y, x1 - x, y1 - y, d.ground);
  }
}

// One road's dark strip, horizontal and vertical.
function roadStrip(gfx, r, c) {
  if (c > r.t && c < r.b) gfx.fillRect(r.l, c - ROAD_HALF, r.r - r.l, ROAD_HALF * 2);
  if (c > r.l && c < r.r) gfx.fillRect(c - ROAD_HALF, r.t, ROAD_HALF * 2, r.b - r.t);
}

// Pale sidewalk strips along one road's edges.
function roadSidewalk(gfx, r, c) {
  if (c > r.t && c < r.b) {
    gfx.fillRect(r.l, c - ROAD_HALF - 8, r.r - r.l, 8);
    gfx.fillRect(r.l, c + ROAD_HALF, r.r - r.l, 8);
  }
  if (c > r.l && c < r.r) {
    gfx.fillRect(c - ROAD_HALF - 8, r.t, 8, r.b - r.t);
    gfx.fillRect(c + ROAD_HALF, r.t, 8, r.b - r.t);
  }
}

// Broken centre dashes for one road, one per 80 px.
function roadDashes(gfx, r, c) {
  if (c > r.t && c < r.b) {
    for (let s = Math.floor(r.l / 80) * 80; s < r.r; s += 80) {
      gfx.fillRect(s, c - 2, 34, 4);
    }
  }
  if (c > r.l && c < r.r) {
    for (let s = Math.floor(r.t / 80) * 80; s < r.b; s += 80) {
      gfx.fillRect(c - 2, s, 4, 34);
    }
  }
}

function paintRoads(game, r) {
  let { ctx: gfx } = game;
  gfx.fillStyle = '#23262c';
  for (let ci = 0; ci < ROAD_CENTRES.length; ci++) roadStrip(gfx, r, ROAD_CENTRES[ci]);
  gfx.fillStyle = '#3d4148';
  for (let ci = 0; ci < ROAD_CENTRES.length; ci++) roadSidewalk(gfx, r, ROAD_CENTRES[ci]);
  gfx.fillStyle = '#d8c95a';
  for (let ci = 0; ci < ROAD_CENTRES.length; ci++) roadDashes(gfx, r, ROAD_CENTRES[ci]);
}

function paintPark(game, r) {
  let { ctx: gfx } = game;
  let park = game.city.park;
  void r;
  gfx.fillStyle = '#3f7a3a';
  gfx.fillRect(park.x, park.y, park.w, park.h);
  gfx.fillStyle = '#5a9a4a';
  gfx.beginPath();
  gfx.arc(park.x + 200, park.y + 200, 90, 0, 7);
  gfx.fill();
  gfx.fillStyle = '#6ab8d8';
  gfx.beginPath();
  gfx.ellipse(park.x + 110, park.y + 120, 46, 30, 0, 0, 7);
  gfx.fill();
  gfx.fillStyle = '#c8b28a';
  gfx.font = 'bold 15px sans-serif';
  gfx.textAlign = 'center';
  gfx.fillText('PALMERA PARK', park.x + 200, park.y + 350);
}

function paintBeach(game, r) {
  let { ctx: gfx } = game;
  if (r.b < BEACH_Y) return;
  gfx.fillStyle = '#d8c08a';
  gfx.fillRect(r.l, BEACH_Y, r.r - r.l, SEA_Y - BEACH_Y);
  let wave = Math.sin(game.time * 1.4) * 6;
  gfx.fillStyle = '#2f7fb8';
  gfx.fillRect(r.l, SEA_Y + wave, r.r - r.l, r.b - SEA_Y);
  // Whitecaps rolling along the shore.
  gfx.fillStyle = 'rgba(255,255,255,0.35)';
  for (let x = Math.floor(r.l / 120) * 120; x < r.r; x += 120) {
    gfx.fillRect(x, SEA_Y + wave - 4, 60, 3);
  }
  gfx.fillStyle = '#8a6f4d';
  gfx.font = 'bold 15px sans-serif';
  gfx.textAlign = 'center';
  gfx.fillText('SOUTH BEACH', (r.l + r.r) / 2, BEACH_Y + 40);
  // Harbour water down the west edge.
  if (r.l < HARBOUR_X) {
    gfx.fillStyle = '#2f7fb8';
    gfx.fillRect(r.l, HARBOUR_Y, HARBOUR_X - r.l, r.b - HARBOUR_Y);
  }
}

function paintContainers(game, r) {
  let { ctx: gfx } = game;
  for (let i = 0; i < game.city.containers.length; i++) {
    let c = game.city.containers[i];
    if (!inside(r, c.x, c.y)) continue;
    rect(gfx, c.x, c.y, c.w, c.h, c.color);
    gfx.strokeStyle = 'rgba(0,0,0,0.4)';
    gfx.strokeRect(c.x, c.y, c.w, c.h);
  }
}

function paintBuildings(game, r) {
  let { ctx: gfx } = game;
  let night = isNight(game.timeOfDay);
  for (let bi = 0; bi < game.city.buildings.length; bi++) {
    let b = game.city.buildings[bi];
    if (b.x + b.w < r.l || b.x > r.r || b.y + b.h < r.t || b.y > r.b) continue;
    // Drop shadow, offset a little more for tall towers.
    gfx.fillStyle = 'rgba(0,0,0,0.4)';
    gfx.fillRect(b.x + 5 + b.tall * 2, b.y + 6 + b.tall * 2, b.w, b.h);
    gfx.fillStyle = b.color;
    gfx.fillRect(b.x, b.y, b.w, b.h);
    gfx.fillStyle = b.roof;
    gfx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
    // Windows: a pseudo-random subset lit at night.
    gfx.fillStyle = night ? '#ffe9a8' : '#2a3442';
    let cols = Math.max(1, Math.floor(b.w / 34));
    let rows = Math.max(1, Math.floor(b.h / 34));
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        if (((i * 7 + j * 13 + b.x) % 5) < 2) {
          gfx.fillRect(b.x + 12 + i * 34, b.y + 12 + j * 34, 14, 10);
        }
      }
    }
    // Sunlit edge on tall buildings.
    if (b.tall > 0) {
      gfx.fillStyle = 'rgba(255,255,255,0.12)';
      gfx.fillRect(b.x + b.w - 14, b.y + 8, 8, b.h - 16);
    }
  }
  // Neon signs flicker downtown.
  for (let si = 0; si < game.city.neonSigns.length; si++) {
    let s = game.city.neonSigns[si];
    if (!inside(r, s.x, s.y)) continue;
    gfx.font = 'bold 13px sans-serif';
    gfx.textAlign = 'center';
    gfx.fillStyle = s.color;
    gfx.globalAlpha = 0.55 + 0.45 * Math.sin(game.time * 3 + s.x);
    gfx.fillText(s.text, s.x, s.y);
    gfx.globalAlpha = 1;
  }
}

function paintTrees(game, r) {
  let { ctx: gfx } = game;
  for (let i = 0; i < game.city.trees.length; i++) {
    let t = game.city.trees[i];
    if (!inside(r, t.x, t.y)) continue;
    disc(gfx, t.x, t.y, t.r, '#2c5a26');
    disc(gfx, t.x - 3, t.y - 3, t.r * 0.7, '#3f7a3a');
  }
}

function paintSkids(game) {
  let { ctx: gfx } = game;
  gfx.fillStyle = 'rgba(10,10,10,0.5)';
  for (let i = 0; i < game.effects.skids.length; i++) {
    let s = game.effects.skids[i];
    gfx.save();
    gfx.translate(s.x, s.y);
    gfx.rotate(s.angle);
    gfx.fillRect(-14, -3, 28, 3);
    gfx.fillRect(-14, 3, 28, 3);
    gfx.restore();
  }
}

// One drawer per pickup kind, picked by a switch below.
function drawCashPickup(gfx) {
  gfx.fillStyle = '#2fae4e';
  gfx.beginPath();
  gfx.arc(0, 0, 12, 0, 7);
  gfx.fill();
  gfx.fillStyle = '#fff';
  gfx.font = 'bold 13px sans-serif';
  gfx.textAlign = 'center';
  gfx.fillText('$', 0, 5);
}

function drawHealthPickup(gfx) {
  gfx.fillStyle = '#ffffff';
  gfx.beginPath();
  gfx.arc(0, 0, 12, 0, 7);
  gfx.fill();
  gfx.fillStyle = '#e02020';
  gfx.fillRect(-7, -2, 14, 4);
  gfx.fillRect(-2, -7, 4, 14);
}

function drawAmmoPickup(gfx) {
  gfx.fillStyle = '#e0a030';
  gfx.fillRect(-10, -7, 20, 14);
  gfx.fillStyle = '#222';
  gfx.font = 'bold 9px sans-serif';
  gfx.textAlign = 'center';
  gfx.fillText('AMMO', 0, 3);
}

function paintPickups(game) {
  let { ctx: gfx } = game;
  for (let i = 0; i < game.pickups.length; i++) {
    let pk = game.pickups[i];
    if (pk.taken) continue;
    let bob = Math.sin(game.time * 3 + pk.x) * 3;
    gfx.save();
    gfx.translate(pk.x, pk.y + bob);
    switch (pk.kind) {
      case 'cash': drawCashPickup(gfx); break;
      case 'health': drawHealthPickup(gfx); break;
      case 'ammo': drawAmmoPickup(gfx); break;
    }
    gfx.restore();
  }
  // The mission package / briefcase waiting on the ground.
  if (!game.pickup) return;
  let bob = Math.sin(game.time * 4) * 3;
  gfx.save();
  gfx.translate(game.pickup.x, game.pickup.y + bob);
  gfx.fillStyle = game.pickup.kind === 'briefcase' ? '#3a2a1a' : '#d8c060';
  gfx.fillRect(-13, -9, 26, 18);
  gfx.strokeStyle = '#ffd24d';
  gfx.lineWidth = 2;
  gfx.strokeRect(-13, -9, 26, 18);
  gfx.restore();
  // Bouncing arrow pointing down at it.
  gfx.fillStyle = '#ffd24d';
  gfx.beginPath();
  gfx.moveTo(game.pickup.x, game.pickup.y - 44 + bob);
  gfx.lineTo(game.pickup.x - 8, game.pickup.y - 58 + bob);
  gfx.lineTo(game.pickup.x + 8, game.pickup.y - 58 + bob);
  gfx.closePath();
  gfx.fill();
}

function paintMissionMarker(game) {
  let { ctx: gfx } = game;
  let m = game.missions;
  if (m.done || m.dialogue) return;
  let step = game.missionStep;
  if (!step || !step.target) return;
  let t = step.target;
  let pulse = 1 + 0.25 * Math.sin(game.time * 4);
  gfx.save();
  gfx.translate(t.x, t.y);
  gfx.strokeStyle = '#ffd24d';
  gfx.lineWidth = 3;
  gfx.beginPath();
  gfx.arc(0, 0, 34 * pulse, 0, 7);
  gfx.stroke();
  gfx.fillStyle = 'rgba(255,210,77,0.15)';
  gfx.beginPath();
  gfx.arc(0, 0, 34 * pulse, 0, 7);
  gfx.fill();
  gfx.fillStyle = '#ffd24d';
  gfx.beginPath();
  gfx.moveTo(0, -52);
  gfx.lineTo(-10, -72);
  gfx.lineTo(10, -72);
  gfx.closePath();
  gfx.fill();
  gfx.restore();
}

function paintBullets(game) {
  let { ctx: gfx } = game;
  gfx.fillStyle = '#ffe14d';
  for (let i = 0; i < game.bullets.length; i++) {
    let b = game.bullets[i];
    gfx.save();
    gfx.translate(b.x, b.y);
    gfx.rotate(Math.atan2(b.vy, b.vx));
    gfx.fillRect(-7, -1.5, 14, 3);
    gfx.restore();
  }
}

function paintParticles(game) {
  let { ctx: gfx } = game;
  for (let i = 0; i < game.effects.particles.length; i++) {
    let p = game.effects.particles[i];
    gfx.globalAlpha = Math.max(0, p.life / p.max);
    gfx.fillStyle = p.color;
    gfx.beginPath();
    gfx.arc(p.x, p.y, p.size, 0, 7);
    gfx.fill();
  }
  gfx.globalAlpha = 1;
}

function paintFloatingTexts(game) {
  let { ctx: gfx } = game;
  gfx.font = 'bold 15px sans-serif';
  gfx.textAlign = 'center';
  for (let i = 0; i < game.effects.texts.length; i++) {
    let t = game.effects.texts[i];
    gfx.globalAlpha = Math.min(1, t.life);
    gfx.fillStyle = t.color;
    gfx.fillText(t.text, t.x, t.y);
  }
  gfx.globalAlpha = 1;
}

function paintLighting(game, r) {
  let { ctx: gfx } = game;
  let t = game.timeOfDay;
  if (isDusk(t)) {
    gfx.fillStyle = 'rgba(255,120,40,0.10)';
    gfx.fillRect(r.l, r.t, r.r - r.l, r.b - r.t);
  }
  if (isNight(t)) {
    gfx.fillStyle = 'rgba(8,12,34,0.42)';
    gfx.fillRect(r.l, r.t, r.r - r.l, r.b - r.t);
    // Headlight glow ahead of the player's car.
    let p = game.player;
    let car = p.inCar;
    if (car) {
      let gx = car.x + Math.cos(car.angle) * 190;
      let gy = car.y + Math.sin(car.angle) * 190;
      let grad = gfx.createRadialGradient(gx, gy, 10, gx, gy, 220);
      grad.addColorStop(0, 'rgba(255,240,180,0.20)');
      grad.addColorStop(1, 'rgba(255,240,180,0)');
      gfx.fillStyle = grad;
      gfx.beginPath();
      gfx.arc(gx, gy, 220, 0, 7);
      gfx.fill();
    }
  }
}
