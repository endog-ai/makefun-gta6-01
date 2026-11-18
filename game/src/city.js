// Velmora's map: roads, blocks, buildings, park, beach and harbour.
// Pure generation from a seed — the same seed always builds the same city.
import { WORLD, ROAD_STEP, ROAD_HALF, ROAD_CENTRES, DISTRICTS, BEACH_Y, SEA_Y, HARBOUR_X, HARBOUR_Y } from './config.js';
import { makeRng, pick, range } from './random.js';

// Which district a point falls in (defaults to Uptown outside them all).
function districtAt(x, y) {
  const hit = Object.keys(DISTRICTS).find((key) => {
    const d = DISTRICTS[key];
    return x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1;
  });
  return hit === undefined ? 'uptown' : hit;
}

// Lighten a hex colour by a fixed amount, for roof tops.
function shade(hex) {
  const n = parseInt(hex.slice(1), 16);
  const channels = [16, 8, 0].map((shift) => {
    const v = ((n >> shift) & 255) + 26;
    return v > 255 ? 255 : v;
  });
  return 'rgb(' + channels[0] + ',' + channels[1] + ',' + channels[2] + ')';
}

// One building, with its fields in the order the city hash expects.
function addBuilding(buildings, x, y, w, h, color, roof, tall, district) {
  const b = {};
  b.x = x;
  b.y = y;
  b.w = w;
  b.h = h;
  b.color = color;
  b.roof = roof;
  b.tall = tall;
  b.district = district;
  buildings.push(b);
}

// The park block stays green: fourteen trees, no buildings.
function plantPark(rng, x0, y0, w, h, trees) {
  for (let i = 0; i < 14; i += 1) {
    const t = {};
    t.x = range(rng, x0 + 20, x0 + w - 20);
    t.y = range(rng, y0 + 20, y0 + h - 20);
    t.r = range(rng, 12, 22);
    trees.push(t);
  }
}

// Dockside blocks get warehouses and a container yard.
function buildDockside(rng, x0, y0, w, h, buildings, containers) {
  addBuilding(buildings, x0, y0, w * 0.62, h * 0.5, '#6b655c', '#7d766c', 0, 'dockside');
  addBuilding(buildings, x0 + w * 0.66, y0 + h * 0.45, w * 0.3, h * 0.45, '#5a564e', '#6e685f', 0, 'dockside');
  for (let i = 0; i < 5; i += 1) {
    const c = {};
    c.x = range(rng, x0, x0 + w - 60);
    c.y = range(rng, y0 + h * 0.55, y0 + h - 24);
    c.w = 56;
    c.h = 20;
    c.color = pick(rng, ['#c95a3c', '#3c7fc9', '#e0a030', '#4f9a5a']);
    containers.push(c);
  }
}

// One or two buildings on a normal block, with a possible third, a neon
// sign downtown, and trees in the suburbs and Old Town.
function buildBlock(rng, key, d, x0, y0, w, h, cx, cy, buildings, neonSigns, trees) {
  const downtown = key === 'downtown';
  let count = 1;
  if (downtown) count = 2;
  else if (rng() < 0.55) count = 2;
  function tower() {
    if (downtown === false) return 0;
    return range(rng, 1, 3);
  }
  const bw = w * 0.44;
  const bh = h * 0.44;
  if (count === 1) {
    const w1 = range(rng, w * 0.45, w * 0.8);
    const h1 = range(rng, h * 0.45, h * 0.8);
    addBuilding(buildings, cx - w1 / 2, cy - h1 / 2, w1, h1, d.roof, shade(d.roof), tower(), key);
  } else {
    addBuilding(buildings, x0, y0, bw, bh, d.roof, shade(d.roof), tower(), key);
    addBuilding(buildings, x0 + w - bw, y0 + h - bh, bw, bh, d.roof, shade(d.roof), tower(), key);
    if (rng() < 0.6) {
      addBuilding(buildings, x0 + w - bw, y0, bw * 0.7, bh * 0.7, d.roof, shade(d.roof), 0, key);
    }
  }
  if (downtown && rng() < 0.8) {
    const s = {};
    s.x = cx + range(rng, -80, 80);
    s.y = cy + range(rng, -80, 80);
    s.color = pick(rng, ['#ff2e88', '#22e0ff', '#ffe14d', '#7CFF6B']);
    s.text = pick(rng, ['HOTEL', 'BAR', '24H', 'CLUB', 'NEON', 'PIZZA', 'CASINO']);
    neonSigns.push(s);
  }
  if (key === 'suburbs' || key === 'oldtown') {
    for (let i = 0; i < 3; i += 1) {
      const t = {};
      t.x = range(rng, x0, x0 + w);
      t.y = range(rng, y0, y0 + h);
      t.r = range(rng, 10, 18);
      trees.push(t);
    }
  }
}

export function buildCity(seed) {
  const rng = makeRng(seed);
  const buildings = [];
  const trees = [];
  const containers = [];
  const neonSigns = [];

  // Park block: the block between roads 1800/2200 and 3000/3400.
  const park = { x: 1848, y: 3048, w: 304, h: 304 };

  for (let i = 0; i < 144; i += 1) {
    const bx = (i / 12) | 0;
    const by = i % 12;
    // Blocks sit BETWEEN roads (roads are centred at 200 + k*400).
    const x0 = bx * ROAD_STEP + 200 + ROAD_HALF + 14;
    const y0 = by * ROAD_STEP + 200 + ROAD_HALF + 14;
    const w = ROAD_STEP - ROAD_HALF * 2 - 28;
    const h = ROAD_STEP - ROAD_HALF * 2 - 28;
    const cx = x0 + w / 2;
    const cy = y0 + h / 2;
    // Park block stays green.
    const inPark = cx > park.x && cx < park.x + park.w && cy > park.y && cy < park.y + park.h;
    if (inPark) {
      plantPark(rng, x0, y0, w, h, trees);
      continue;
    }
    // Beach blocks stay sand.
    if (y0 > BEACH_Y - 200) continue;
    const key = districtAt(cx, cy);
    const d = DISTRICTS[key];
    if (key === 'dockside') {
      buildDockside(rng, x0, y0, w, h, buildings, containers);
      continue;
    }
    buildBlock(rng, key, d, x0, y0, w, h, cx, cy, buildings, neonSigns, trees);
  }
  const city = { buildings, trees, containers, neonSigns, park, seed };
  return city;
}

export function roadAxisAt(x, y) {
  const rx = nearestCentre(x);
  const ry = nearestCentre(y);
  const onV = Math.abs(x - rx) <= ROAD_HALF;
  const onH = Math.abs(y - ry) <= ROAD_HALF;
  if (onV && onH) return 'x';
  if (onV) return 'v';
  if (onH) return 'h';
  return null;
}

export function nearestCentre(v) {
  return Math.round((v - 200) / ROAD_STEP) * ROAD_STEP + 200;
}

export function onRoad(x, y) {
  return roadAxisAt(x, y) !== null;
}

export function inWater(x, y) {
  if (y > SEA_Y) return true;
  return x < HARBOUR_X && y > HARBOUR_Y;
}

export function onBeach(x, y) {
  return y > BEACH_Y && y <= SEA_Y;
}

// The first building whose rectangle contains (x, y) expanded by r.
export function collidesWithBuildings(city, x, y, r) {
  for (const b of city.buildings) {
    const hit = x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h;
    if (hit) return b;
  }
  return null;
}

export function districtNameAt(x, y) {
  if (y > BEACH_Y) return 'South Beach';
  return DISTRICTS[districtAt(x, y)].name;
}

// A random point on a road, for spawning traffic and pedestrians.
export function randomRoadPoint(rng) {
  const vertical = rng() < 0.5;
  const c = pick(rng, ROAD_CENTRES);
  const along = range(rng, 300, WORLD - 300);
  if (vertical) return { x: c, y: along, axis: 'v' };
  return { x: along, y: c, axis: 'h' };
}
