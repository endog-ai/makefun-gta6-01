// The story: four jobs for Rico and Mara, chained with phone-call dialogue.
import { MISSIONS } from './config.js';
import { dist2 } from './random.js';
import { makeEnemy } from './combat.js';

export function createMissionState() {
  const state = {};
  state.index = 0;
  state.step = 0;
  state.dialogue = null;
  state.lineIdx = 0;
  state.timer = 0;
  state.done = false;
  state.kills = 0;
  state.stepStarted = false;
  state.lastStep = -1;
  return state;
}

export function missionDef(game) {
  const m = MISSIONS[game.missions.index];
  return m === undefined ? null : m;
}

export function currentStep(game) {
  const m = missionDef(game);
  if (m === null) return null;
  return m.steps[game.missions.step];
}

// Post the Viper guards for the Dockside job.
function spawnGuards(game, step) {
  game.enemies = [];
  const offsets = [[-60, -40], [60, -40], [-40, 60], [70, 50]];
  for (const off of offsets) {
    game.enemies.push(makeEnemy(step.target.x + off[0], step.target.y + off[1]));
  }
}

export function startMission(game) {
  const m = missionDef(game);
  if (m === null) {
    game.missions.done = true;
    return;
  }
  game.missions.dialogue = m.intro.slice();
  game.missions.lineIdx = 0;
  game.missions.step = 0;
  game.missions.timer = 0;
  game.missions.kills = 0;
  if (m.id === 3) spawnGuards(game, m.steps[1]);
  if (m.id === 4) game.police.setWanted(3);
}

export function advanceDialogue(game) {
  const ms = game.missions;
  if (ms.dialogue === null) return;
  ms.lineIdx += 1;
  game.audio.click();
  if (ms.lineIdx >= ms.dialogue.length) ms.dialogue = null;
}

export function completeMission(game) {
  const m = missionDef(game);
  if (m === null) return;
  game.player.money += m.reward;
  game.player.hp = Math.min(game.player.hp + 25, 100);
  game.player.ammo += 24;
  game.audio.missionDone();
  game.effects.floatText(game.player.x, game.player.y - 40, '+$' + m.reward + '  MISSION COMPLETE', '#7CFF6B');
  game.missions.index += 1;
  game.missions.step = 0;
  game.missions.kills = 0;
  game.pickup = null;
  if (game.missions.index >= MISSIONS.length) {
    game.missions.done = true;
    game.screen = 'complete'; // the complete screen carries the closing text
  } else {
    startMission(game);
  }
}

// Close enough to a target point to count as arrived.
function arrived(p, target) {
  return dist2(p.x, p.y, target.x, target.y) < 110 * 110;
}

// One frame of the current step's logic, by step kind.
function runSteal(game, m, step) {
  if (game.player.inCar === null) return;
  game.missions.step += 1;
  game.audio.pickup();
}
function runGoto(game, m, step) {
  if (arrived(game.player, step.target) === false) return;
  game.missions.step += 1;
  if (game.missions.step >= m.steps.length) completeMission(game);
  else game.audio.pickup();
}
function runPickup(game, m, step) {
  if (game.pickup !== null) return;
  const kind = m.id === 3 ? 'briefcase' : 'package';
  game.pickup = { x: step.target.x, y: step.target.y, kind };
  // The actual grab happens via the E key (player.js emits 'pickup').
}
function runClear(game, m, step) {
  let alive = 0;
  for (const e of game.enemies) {
    if (e.dead === false) alive += 1;
  }
  const killed = step.count - alive; // the current step's own target, not a fixed step index
  if (killed !== game.missions.kills) game.missions.kills = killed;
  if (alive === 0) game.missions.step += 1;
}
function runEscape(game, m, step) {
  const home = arrived(game.player, step.target) && game.police.wanted === 0;
  if (home) completeMission(game);
}
function runDeliver(game, m, step, dt) {
  game.missions.timer += dt;
  if (game.missions.timer > step.time) {
    game.screen = 'busted';
    game.bustedReason = 'Out of time — the drop went cold.';
    return;
  }
  if (arrived(game.player, step.target)) completeMission(game);
}
const STEP_RUNNERS = {
  steal: runSteal,
  goto: runGoto,
  pickup: runPickup,
  clear: runClear,
  escape: runEscape,
  deliver: runDeliver,
};

function runStep(game, dt, m, step) {
  const run = STEP_RUNNERS[step.kind];
  if (run !== undefined) run(game, m, step, dt);
}

// Called every frame while playing: advance the current objective.
export function updateMissions(game, dt) {
  const ms = game.missions;
  if (ms.done || ms.dialogue !== null) return;
  const m = missionDef(game);
  if (m === null) return;
  const step = m.steps[ms.step];
  if (step === undefined) return;
  // When a step starts, apply its wanted level once (so the player can lose it).
  if (ms.lastStep !== ms.step) {
    ms.lastStep = ms.step;
    ms.stepStarted = false;
  }
  if (ms.stepStarted === false) {
    ms.stepStarted = true;
    if (step.wanted) game.police.setWanted(step.wanted);
  }
  runStep(game, dt, m, step);
}

export function objectiveText(game) {
  const m = missionDef(game);
  if (m === null) return 'Free roam — Velmora is yours.';
  const step = m.steps[game.missions.step];
  if (step === undefined) return m.title;
  let text = step.text;
  if (step.kind === 'clear') {
    text = 'Take out the Viper guards (' + game.missions.kills + '/' + step.count + ')';
  } else if (step.kind === 'deliver') {
    const left = Math.max(Math.ceil(step.time - game.missions.timer), 0);
    text += ' — ' + left + 's left';
  }
  return m.title + ': ' + text;
}
