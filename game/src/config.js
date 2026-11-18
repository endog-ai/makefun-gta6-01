// Velmora — world constants, districts, vehicles, story data.
// Everything here is original: the city, its districts, people and cars are invented.

// --- World geometry -------------------------------------------------------
export const WORLD = 4800; // the world is WORLD x WORLD px
export const ROAD_STEP = 400; // distance between road centrelines
export const ROAD_HALF = 48; // half the road width
export const ROAD_CENTRES = Array.from({ length: 12 }, (v, k) => 200 + k * ROAD_STEP);

// --- Districts ------------------------------------------------------------
// Each district owns a rectangle of the map, a ground tint, a roof colour,
// and whether its signs glow neon at night.
// Rows: key, x0, y0, x1, y1, name, ground, roof, neon.
function districtRow(row) {
  const d = {};
  d.x0 = row[1];
  d.y0 = row[2];
  d.x1 = row[3];
  d.y1 = row[4];
  d.name = row[5];
  d.ground = row[6];
  d.roof = row[7];
  d.neon = row[8];
  return d;
}
const DISTRICT_ROWS = [
  ['downtown', 2000, 1000, 3400, 2600, 'Neon Mile', '#2b2f38', '#3a4152', true],
  ['oldtown', 0, 0, 2000, 2000, 'Old Town', '#3d3a2e', '#6b5a44', false],
  ['marina', 0, 2600, 1600, 4800, 'Marina Bay', '#2e3a3d', '#4a6b74', false],
  ['dockside', 3600, 2600, 4800, 4800, 'Dockside', '#33302c', '#55504a', false],
  ['suburbs', 1600, 2600, 3600, 4800, 'Palm Heights', '#3a3d2c', '#5d6b44', false],
  ['uptown', 3400, 0, 4800, 2600, 'Uptown', '#34343c', '#4c4c5e', false],
];
export const DISTRICTS = {};
for (const row of DISTRICT_ROWS) DISTRICTS[row[0]] = districtRow(row);

// --- Waterfront -----------------------------------------------------------
// Beach + sea along the south edge; harbour water on the west edge (Marina).
export const BEACH_Y = 4520;
export const SEA_Y = 4660;
export const HARBOUR_X = 120;
export const HARBOUR_Y = 3200; // harbour water starts south of this line on the west edge

// --- Vehicles -------------------------------------------------------------
// Rows: name, color, top, accel, len, wid. (Row order is load-bearing:
// the first model is the police cruiser's base, so never reorder.)
function carRow(row) {
  const m = {};
  m.name = row[0];
  m.color = row[1];
  m.top = row[2];
  m.accel = row[3];
  m.len = row[4];
  m.wid = row[5];
  return m;
}
export const CAR_MODELS = [
  ['Vireo', '#c94f43', 620, 430, 52, 26],
  ['Kestrel', '#3f7fd0', 560, 400, 50, 26],
  ['Vandal', '#e8b93c', 500, 360, 54, 28],
  ['Falco GT', '#d6336c', 660, 480, 50, 25],
  ['Hauler', '#7a8894', 420, 300, 64, 30],
  ['Taxi', '#f2c230', 540, 390, 50, 26],
].map(carRow);

// --- People ---------------------------------------------------------------
export const PED_COLORS = ['#e8e0d0', '#d0a080', '#8a6f4d', '#c9b8a3', '#a8c8d8', '#e0c060'];
export const PED_SHIRTS = ['#d94f4f', '#4f7fd9', '#4fd97a', '#e0a030', '#9a5fd9', '#e0e0e0', '#3fb8a8'];

// --- The player and the arsenal -------------------------------------------
export const PLAYER = {};
PLAYER.walk = 230;
PLAYER.run = 350;
PLAYER.radius = 14;
PLAYER.hp = 100;
PLAYER.startMoney = 150;
PLAYER.startAmmo = 36;

function weaponRow(name, range, damage, cooldown, bulletSpeed) {
  const w = {};
  w.name = name;
  w.range = range;
  w.damage = damage;
  w.cooldown = cooldown;
  if (bulletSpeed !== undefined) w.bulletSpeed = bulletSpeed;
  return w;
}
export const WEAPONS = {};
WEAPONS.fists = weaponRow('Fists', 60, 25, 0.35);
WEAPONS.pistol = weaponRow('P-9 Pistol', 640, 34, 0.28, 950);

// --- Heat and time --------------------------------------------------------
export const WANTED_MAX = 5;
export const BUST_TIME = 1.4; // seconds a cop must hold you before the bust lands
export const DAY_LENGTH = 480; // seconds per full day/night cycle

// --- Story places ---------------------------------------------------------
function place(x, y, name) {
  const p = {};
  p.x = x;
  p.y = y;
  p.name = name;
  return p;
}
export const GARAGE = place(2400, 2600, "Rico's Garage");
export const MARINA_PICKUP = place(620, 3980, 'Marina Bay Pier');
export const DOCKS = place(4180, 3620, 'Dockside Warehouse 7');
export const NEON_DROP = place(2620, 1780, 'Neon Mile Rooftop');
export const HOSPITAL = place(1000, 820, 'St. Anselm Hospital');

// --- The story: four jobs --------------------------------------------------
function missionStep(text, kind, extra) {
  const s = {};
  s.text = text;
  s.kind = kind;
  if (extra) {
    if (extra.target !== undefined) s.target = extra.target;
    if (extra.wanted !== undefined) s.wanted = extra.wanted;
    if (extra.count !== undefined) s.count = extra.count;
    if (extra.time !== undefined) s.time = extra.time;
  }
  return s;
}
function mission(title, id, giver, reward, intro, steps) {
  const m = {};
  m.title = title;
  m.id = id;
  m.giver = giver;
  m.reward = reward;
  m.intro = intro;
  m.steps = steps;
  return m;
}
export const MISSIONS = [
  mission('First Wheels', 1, 'Rico', 300, [
    'RICO: Velmora eats the slow, kid. You want work, you need wheels.',
    'RICO: Any car on the street will do. Walk up to one and press E to take it.',
    "RICO: Then bring it to my garage. Don't scratch it. Much.",
  ], [
    missionStep('Steal a car (walk up to one, press E)', 'steal'),
    missionStep("Drive to Rico's Garage", 'goto', { target: GARAGE }),
  ]),
  mission('The Pickup', 2, 'Rico', 500, [
    'RICO: Easy money. A package is waiting at the Marina Bay Pier.',
    'RICO: Grab it on foot and bring it back here. No questions.',
    'RICO: Word is the harbour patrol is jumpy tonight. Keep it quiet.',
  ], [
    missionStep('Drive to Marina Bay Pier', 'goto', { target: MARINA_PICKUP }),
    missionStep('Pick up the package (press E on foot)', 'pickup', { target: MARINA_PICKUP }),
    missionStep("Lose the heat and get back to Rico's Garage", 'escape', { target: GARAGE, wanted: 2 }),
  ]),
  mission('Dockside Deal', 3, 'Mara', 800, [
    'MARA: The Vipers took my briefcase to Warehouse 7, Dockside.',
    'MARA: Four of them guarding it. They shoot first, so you shoot first.',
    'MARA: Bring me that briefcase and the city will know your name.',
  ], [
    missionStep('Go to Dockside Warehouse 7', 'goto', { target: DOCKS }),
    missionStep('Take out the Viper guards (0/4)', 'clear', { target: DOCKS, count: 4 }),
    missionStep('Grab the briefcase (press E on foot)', 'pickup', { target: DOCKS }),
  ]),
  mission('Neon Getaway', 4, 'Mara', 1200, [
    'MARA: The whole Velmora PD wants that briefcase. Three stars and counting.',
    'MARA: Drive it to the Neon Mile rooftop garage. Fast. No stops.',
    'MARA: You have two and a half minutes. Make Velmora remember you.',
  ], [
    missionStep('Deliver the briefcase to Neon Mile', 'deliver', { target: NEON_DROP, wanted: 3, time: 150 }),
  ]),
];

// --- Opening crawl ----------------------------------------------------------
export const INTRO_LINES = [
  'VELMORA — a sun-soaked city on the coast, where the neon never sleeps',
  'and everybody owes somebody something.',
  '',
  'You are JAX CARTER, fresh out of the county jail, with $150,',
  'a busted phone and one contact: Rico, who runs a garage on the Mile.',
  '',
  'Steal a car. Do the jobs. Get rich — or get caught trying.',
];
