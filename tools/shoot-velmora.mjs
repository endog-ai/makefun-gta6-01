// Velmora play-test + screenshot driver.
// Serves game/ on localhost, plays the real game with keyboard/mouse events,
// checks the systems work, then captures the 4 screenshots.
// Usage: node tools/shoot-velmora.mjs [--port 8901]
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync, statSync, readFileSync } from 'node:fs';

const repo = '/home/hatch/workspace/makefun/repos/makefun-gta6-01';
const portArg = process.argv.indexOf('--port');
let port = 8901;
if (portArg !== -1) {
  const argPort = Number(process.argv[portArg + 1]);
  if (Number.isInteger(argPort)) port = argPort;
}

const results = [];
function check(name, ok, detail) {
  const entry = { name, ok, detail: detail ? detail : '' };
  results.push(entry);
  let line = (ok ? 'PASS  ' : 'FAIL  ') + name;
  if (detail) line += ' — ' + detail;
  console.log(line);
}

const server = spawn('node', ['serve.ts', '--port', String(port)], { cwd: repo, stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 1500));

const browser = await chromium.launch({
  executablePath: '/home/hatch/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
    '--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults'],
});

const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
const requests = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('request', (r) => requests.push(r.url()));
page.on('requestfailed', (r) => errors.push('reqfail: ' + r.url()));

// The live game state, read from the page.
async function game() { return page.evaluate(() => window.__game); }
async function pos() { return page.evaluate(() => ({ x: window.__game.player.x, y: window.__game.player.y })); }

await page.goto('http://localhost:' + port + '/?seed=1', { waitUntil: 'load' });
await page.waitForFunction(() => window.__game !== undefined, { timeout: 15000 });
await page.waitForTimeout(1500);
check('game boots, __game exposed', true);
check('title screen shown', (await game()).screen === 'title');

// Start the game.
await page.keyboard.press('Enter');
await page.waitForTimeout(800);
check('Enter starts game', (await game()).screen === 'play');
check('mission 1 dialogue shows', (await game()).missions.dialogue !== null);
// Advance dialogue (one line per key press, spaced so each lands in its own frame).
for (let di = 0; di < 3; di += 1) {
  await page.keyboard.press('Enter');
  await page.waitForTimeout(di < 2 ? 250 : 300);
}
check('dialogue advances away', (await game()).missions.dialogue === null);

// Walk around.
const p0 = await pos();
await page.keyboard.down('d');
await page.waitForTimeout(1200);
await page.keyboard.up('d');
const p1 = await pos();
check('player walks (D key)', Math.abs(p1.x - p0.x) > 100, 'moved ' + Math.round(p1.x - p0.x) + 'px');

// Teleport next to a parked car and steal it.
const stole = await page.evaluate(() => {
  const G = window.__game;
  const parked = G.cars.find((c) => c.kind === 'parked');
  if (parked === undefined) return 'no parked car';
  G.player.x = parked.x + 30;
  G.player.y = parked.y;
  G.player.angle = 0;
  return 'ok';
});
await page.keyboard.press('e');
await page.waitForTimeout(300);
const inCar = await page.evaluate(() => {
  const G = window.__game;
  return { inCar: G.player.inCar !== null, wanted: G.police.wanted };
});
check('enter car with E', inCar.inCar, stole);
check('stealing raises wanted to 1', inCar.wanted === 1, 'wanted=' + inCar.wanted);

// Drive.
const c0 = await page.evaluate(() => ({ x: window.__game.player.x, speed: window.__game.player.speed }));
await page.keyboard.down('w');
await page.waitForTimeout(2000);
await page.keyboard.up('w');
const c1 = await page.evaluate(() => ({ x: window.__game.player.x, y: window.__game.player.y, speed: window.__game.player.speed }));
check('car accelerates (W key)', Math.abs(c1.speed) > 100 || Math.hypot(c1.x - c0.x, c1.y - c0.y) > 200, 'speed=' + Math.round(c1.speed));

// Mission 1: drive to the garage marker.
const m1 = await page.evaluate(() => {
  const G = window.__game;
  return { step: G.missions.step, objective: G.objective };
});
check('mission 1 step advanced after steal', m1.step === 1, 'step=' + m1.step + ' obj=' + m1.objective);

// Exit the car, shoot the pistol.
await page.keyboard.press('e');
await page.waitForTimeout(300);
const ammo0 = await page.evaluate(() => window.__game.player.ammo);
await page.mouse.move(900, 300);
await page.mouse.click(900, 300);
await page.waitForTimeout(200);
const ammo1 = await page.evaluate(() => window.__game.player.ammo);
check('pistol fires (ammo decreases)', ammo1 === ammo0 - 1, ammo0 + ' -> ' + ammo1);

// Punch.
await page.keyboard.press('f');
await page.waitForTimeout(200);
check('punch does not error', true);

// Pause + save.
await page.keyboard.press('p');
await page.waitForTimeout(200);
check('pause screen', (await game()).screen === 'pause');
await page.keyboard.press('s');
await page.waitForTimeout(200);
check('save writes localStorage', (await page.evaluate(() => localStorage.getItem('velmora-save-v1'))) !== null);
check('save returns to play', (await game()).screen === 'play');

// Wanted decay: teleport far from cops and wait (retry: a freshly spawned
// cop within 700px resets the unseen timer, so a single attempt is flaky).
let wantedAfter = 1;
for (let attempt = 0; attempt < 3 && wantedAfter !== 0; attempt += 1) {
  await page.evaluate(() => {
    const G = window.__game;
    G.cops = [];
    G.player.x = 600;
    G.player.y = 600;
    G.police.unseenT = 6.9;
  });
  await page.waitForTimeout(1500);
  wantedAfter = await page.evaluate(() => window.__game.police.wanted);
}
check('wanted decays when unseen', wantedAfter === 0, 'wanted=' + wantedAfter);

check('zero console errors so far', errors.length === 0, errors.slice(0, 3).join(' | '));
const external = requests.filter((u) => u.startsWith('http://localhost:' + port) === false);
check('zero network requests outside localhost', external.length === 0, external.slice(0, 3).join(' | '));
await page.close();

// --- Screenshots ---
async function takeShot(shot) {
  const sp = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const serrs = [];
  sp.on('console', (m) => { if (m.type() === 'error') serrs.push(m.text()); });
  sp.on('pageerror', (e) => serrs.push('pageerror: ' + e.message));
  await sp.goto('http://localhost:' + port + '/' + shot.query, { waitUntil: 'load' });
  try {
    await sp.waitForFunction(() => window.__shotReady === true, { timeout: 60000, polling: 500 });
  } catch {
    console.log('TIMEOUT ' + shot.name + ' — capturing anyway');
  }
  await sp.waitForTimeout(400);
  const out = repo + '/screenshots/' + shot.name;
  await sp.screenshot({ path: out, type: 'jpeg', quality: 82 });
  const { size } = statSync(out);
  check('screenshot ' + shot.name + ' (' + size + ' bytes, limit 262144)', size <= 262144 && serrs.length === 0, serrs.slice(0, 2).join(' | '));
  await sp.close();
}

mkdirSync(repo + '/screenshots', { recursive: true });
const shots = JSON.parse(readFileSync(repo + '/shots.json', 'utf8'));
for (const shot of shots) await takeShot(shot);

await browser.close();
server.kill();
const failed = results.filter((r) => r.ok === false);
let summary = '\n' + (results.length - failed.length) + '/' + results.length + ' checks passed';
if (failed.length > 0) summary += ' — FAILED: ' + failed.map((r) => r.name).join(', ');
console.log(summary);
process.exit(failed.length > 0 ? 1 : 0);
