// Save / continue via localStorage. Nothing leaves the browser.
const KEY = 'velmora-save-v1';

// What a save carries: the player's state, the story position, the clock.
function snapshot(game) {
  const p = game.player;
  const snap = {};
  snap.money = p.money;
  snap.hp = p.hp;
  snap.ammo = p.ammo;
  snap.x = p.x;
  snap.y = p.y;
  snap.weapon = p.weapon;
  snap.missionIndex = game.missions.index;
  snap.timeOfDay = game.timeOfDay;
  snap.savedAt = Date.now();
  return snap;
}

// A save is only trusted when every field is the right shape and in range.
function validSave(s) {
  if (s === null || typeof s !== 'object') return false;
  const numbers = ['money', 'hp', 'ammo', 'x', 'y'];
  for (let i = 0; i < numbers.length; i += 1) {
    if (Number.isFinite(s[numbers[i]]) === false) return false;
  }
  const mi = s.missionIndex;
  if (mi !== undefined) {
    const inRange = Number.isInteger(mi) && mi >= 0 && mi <= 4;
    if (inRange === false) return false;
  }
  const w = s.weapon;
  if (w === undefined) return true;
  return w === 'fists' || w === 'pistol';
}

export function saveGame(game) {
  let ok = true;
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshot(game)));
  } catch (e) {
    ok = false;
  }
  return ok;
}

export function loadSave() {
  let parsed = null;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return null;
    parsed = JSON.parse(raw);
  } catch (e) {
    return null;
  }
  // A save from an older build, a hand-edited value or a corrupt write
  // must never crash the continue path — reject anything out of shape.
  if (validSave(parsed)) return parsed;
  return null;
}

export function hasSave() {
  return loadSave() !== null;
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch (e) {
    // A missing or blocked store is not a crash.
  }
}
