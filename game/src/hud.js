// HUD, minimap, dialogue boxes and menus — everything drawn over the world.
import { WORLD, ROAD_CENTRES, INTRO_LINES, BEACH_Y, SEA_Y, BUST_TIME } from './config.js';
import { districtNameAt } from './city.js';
import { hasSave } from './save.js';
import { rect, disc, label } from './render.js';

// A dark translucent panel behind a HUD block.
function panel(gfx, x, y, w, h) {
  rect(gfx, x, y, w, h, 'rgba(0,0,0,0.55)');
}

// The HUD is a fixed stack of panels, drawn top to bottom every frame.
const HUD_PARTS = [
  drawMoneyPanel,
  drawWantedStars,
  drawObjectiveBanner,
  drawVitalsPanel,
  drawSpeedo,
  drawHints,
  drawMinimap,
  drawDamageOverlays,
  drawBustBar,
];

export function drawHUD(game) {
  let { ctx: gfx } = game;
  gfx.save();
  gfx.textAlign = 'left';
  HUD_PARTS.forEach((part) => part(game));
  gfx.restore();
}

// Top-left: money + district + clock.
function drawMoneyPanel(game) {
  let { ctx: gfx } = game;
  let p = game.player;
  panel(gfx, 12, 12, 250, 62);
  gfx.fillStyle = '#7CFF6B';
  gfx.font = 'bold 22px sans-serif';
  gfx.fillText('$' + p.money, 24, 38);
  gfx.fillStyle = '#ffffff';
  gfx.font = '13px sans-serif';
  gfx.fillText(districtNameAt(p.x, p.y), 24, 58);
  let minutes = Math.floor(game.timeOfDay * 60);
  let hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  let mm = String(minutes % 60).padStart(2, '0');
  gfx.fillStyle = '#ffd24d';
  gfx.fillText(hh + ':' + mm, 210, 58);
}

// Top-right: wanted stars.
function drawWantedStars(game) {
  let { ctx: gfx, view } = game;
  panel(gfx, view.w - 212, 12, 200, 40);
  gfx.font = '22px sans-serif';
  for (let i = 0; i < 5; i++) {
    gfx.fillStyle = i < game.police.wanted ? '#ffd24d' : 'rgba(255,255,255,0.25)';
    gfx.fillText('★', view.w - 198 + i * 38, 40);
  }
}

// Objective banner, top-centre.
function drawObjectiveBanner(game) {
  let { ctx: gfx, view } = game;
  let obj = game.objective;
  if (!obj) return;
  gfx.font = 'bold 15px sans-serif';
  let w = gfx.measureText(obj).width + 28;
  rect(gfx, (view.w - w) / 2, 12, w, 32, 'rgba(0,0,0,0.6)');
  label(gfx, obj, view.w / 2, 33, 'bold 15px sans-serif', '#ffd24d');
  gfx.textAlign = 'left';
}

// Bottom-left: health bar + ammo.
function drawVitalsPanel(game) {
  let { ctx: gfx, view } = game;
  let p = game.player;
  panel(gfx, 12, view.h - 58, 230, 46);
  let barX = 22;
  let barY = view.h - 44;
  rect(gfx, barX, barY, 150, 14, '#333');
  let hpFrac = Math.max(0, p.hp / 100);
  let hpColor = p.hp > 40 ? '#4fd97a' : '#ff4444';
  rect(gfx, barX, barY, 150 * hpFrac, 14, hpColor);
  gfx.fillStyle = '#fff';
  gfx.font = 'bold 12px sans-serif';
  gfx.fillText('HP ' + Math.ceil(p.hp), 178, view.h - 32);
  let armed = p.weapon === 'pistol';
  gfx.fillStyle = armed ? '#ffd24d' : '#fff';
  let ammoLine = armed ? 'PISTOL  ' + p.ammo : 'FISTS  [1] pistol';
  gfx.fillText(ammoLine, 22, view.h - 20);
}

// Bottom-right: speedometer, only while driving.
function drawSpeedo(game) {
  let { ctx: gfx, view } = game;
  let p = game.player;
  if (!p.inCar) return;
  let kmh = Math.round(Math.abs(p.speed) * 0.18);
  panel(gfx, view.w - 262, view.h - 58, 60, 46);
  gfx.fillStyle = '#fff';
  gfx.font = 'bold 20px sans-serif';
  gfx.fillText('' + kmh, view.w - 250, view.h - 26);
  gfx.font = '11px sans-serif';
  gfx.fillStyle = '#bbb';
  gfx.fillText('km/h', view.w - 214, view.h - 26);
}

// Controls hint, bottom-centre.
function drawHints(game) {
  let { ctx: gfx, view } = game;
  let p = game.player;
  let text = p.inCar
    ? 'WASD drive · Space handbrake · E exit · P pause · M mute'
    : 'WASD move · Shift run · E enter car / pick up · Click shoot · F punch · 1/2 weapon';
  label(gfx, text, view.w / 2, view.h - 12, '12px sans-serif', 'rgba(255,255,255,0.55)');
  gfx.textAlign = 'left';
}

// Damage flash / low health vignette.
function drawDamageOverlays(game) {
  let { ctx: gfx, view } = game;
  let p = game.player;
  if (p.hurtT > 0) {
    rect(gfx, 0, 0, view.w, view.h, 'rgba(255,0,0,' + (p.hurtT * 0.4) + ')');
  }
  if (p.hp > 0 && p.hp <= 30) {
    let pulse = 0.10 + 0.08 * Math.sin(game.time * 5);
    gfx.strokeStyle = 'rgba(255,0,0,' + pulse + ')';
    gfx.lineWidth = 26;
    gfx.strokeRect(0, 0, view.w, view.h);
  }
}

// Bust progress bar while a cop is grabbing the player.
function drawBustBar(game) {
  let { ctx: gfx, view } = game;
  if (game.police.bustT <= 0.2) return;
  let w = 220;
  let bx = (view.w - w) / 2;
  rect(gfx, bx, view.h - 120, w, 30, 'rgba(0,0,0,0.7)');
  rect(gfx, bx + 4, view.h - 116, (w - 8) * (game.police.bustT / BUST_TIME), 22, '#4f7fd9');
  label(gfx, 'THE COPS ARE GRABBING YOU — RUN!', view.w / 2, view.h - 100, 'bold 13px sans-serif', '#fff');
  gfx.textAlign = 'left';
}

// One road line on the minimap, horizontal and vertical.
function minimapRoad(gfx, mx, my, size, s, c) {
  gfx.beginPath();
  gfx.moveTo(mx, my + c * s);
  gfx.lineTo(mx + size, my + c * s);
  gfx.stroke();
  gfx.beginPath();
  gfx.moveTo(mx + c * s, my);
  gfx.lineTo(mx + c * s, my + size);
  gfx.stroke();
}

export function drawMinimap(game) {
  let { ctx: gfx, view } = game;
  let size = 190;
  let mx = view.w - size - 12;
  let my = view.h - size - 72;
  let s = size / WORLD;
  gfx.save();
  rect(gfx, mx - 4, my - 4, size + 8, size + 8, 'rgba(0,0,0,0.65)');
  gfx.strokeStyle = '#ffd24d';
  gfx.lineWidth = 1.5;
  gfx.strokeRect(mx - 4, my - 4, size + 8, size + 8);
  rect(gfx, mx, my, size, size, '#20242c');
  // Water + beach along the south edge.
  rect(gfx, mx, my + (SEA_Y * s), size, size - SEA_Y * s, '#2f7fb8');
  rect(gfx, mx, my + (BEACH_Y * s), size, (SEA_Y - BEACH_Y) * s, '#d8c08a');
  // Roads.
  gfx.strokeStyle = '#555a63';
  gfx.lineWidth = 2;
  for (let ri = 0; ri < ROAD_CENTRES.length; ri++) {
    minimapRoad(gfx, mx, my, size, s, ROAD_CENTRES[ri]);
  }
  // Mission marker.
  let step = game.missionStep;
  if (step && step.target && !game.missions.done) {
    let pulse = 4 + Math.sin(game.time * 5) * 2;
    disc(gfx, mx + step.target.x * s, my + step.target.y * s, pulse, '#ffd24d');
  }
  // Cops as blue dots.
  for (let ci = 0; ci < game.cops.length; ci++) {
    let cop = game.cops[ci];
    disc(gfx, mx + cop.car.x * s, my + cop.car.y * s, 3, '#4f7fd9');
  }
  // Player arrow.
  let p = game.player;
  gfx.save();
  gfx.translate(mx + p.x * s, my + p.y * s);
  gfx.rotate(p.angle);
  gfx.fillStyle = '#ffffff';
  gfx.beginPath();
  gfx.moveTo(7, 0);
  gfx.lineTo(-5, -5);
  gfx.lineTo(-5, 5);
  gfx.closePath();
  gfx.fill();
  gfx.restore();
  gfx.restore();
}

export function drawDialogue(game) {
  let { ctx: gfx, view } = game;
  let ms = game.missions;
  if (!ms.dialogue) return;
  let line = ms.dialogue[ms.lineIdx];
  gfx.save();
  rect(gfx, 60, view.h - 190, view.w - 120, 96, 'rgba(0,0,0,0.78)');
  gfx.strokeStyle = '#ffd24d';
  gfx.lineWidth = 2;
  gfx.strokeRect(60, view.h - 190, view.w - 120, 96);
  gfx.fillStyle = '#ffd24d';
  gfx.font = 'bold 15px sans-serif';
  gfx.fillText('PHONE', 80, view.h - 164);
  gfx.fillStyle = '#ffffff';
  gfx.font = '16px sans-serif';
  wrapText(gfx, line, 80, view.h - 140, view.w - 160, 22);
  gfx.fillStyle = '#aaaaaa';
  gfx.font = '12px sans-serif';
  gfx.fillText('Press ENTER to continue', 80, view.h - 108);
  gfx.restore();
}

export function wrapText(gfx, text, x, y, maxW, lh) {
  let words = text.split(' ');
  let line = '';
  let cy = y;
  for (let wi = 0; wi < words.length; wi++) {
    let w = words[wi];
    let test = line ? line + ' ' + w : w;
    if (line && gfx.measureText(test).width > maxW) {
      gfx.fillText(line, x, cy);
      cy += lh;
      line = w;
    } else {
      line = test;
    }
  }
  if (line) gfx.fillText(line, x, cy);
  return cy;
}

// A full-screen menu: big title, lines of text, an optional footer.
function menuBox(gfx, view, title, lines, footer) {
  gfx.save();
  rect(gfx, 0, 0, view.w, view.h, 'rgba(0,0,0,0.72)');
  let titleY = view.h * 0.30;
  label(gfx, title, view.w / 2, titleY, 'bold 54px sans-serif', '#ffd24d');
  let y = titleY + 48;
  for (let line of lines) {
    label(gfx, line, view.w / 2, y, '18px sans-serif', '#ffffff');
    y += 30;
  }
  if (footer) {
    label(gfx, footer, view.w / 2, y + 22, 'bold 17px sans-serif', '#ffd24d');
  }
  gfx.restore();
}

export function drawTitle(game) {
  // The city pans slowly behind the title; the menu box dims it.
  let intro = INTRO_LINES.slice(0, 3);
  let lines = ['S T R E E T S   O F   V E L M O R A', ''].concat(
    intro,
    [
      '',
      'WASD move / drive · E enter car · Mouse aim, Click shoot · F punch',
      'P pause · M mute · The city never sleeps, and neither does the PD.',
    ],
  );
  let footer = hasSave()
    ? 'Press ENTER to start  ·  C to continue your save'
    : 'Press ENTER to start';
  menuBox(game.ctx, game.view, 'VELMORA', lines, footer);
}

export function drawPause(game) {
  let lines = [
    `Money $${game.player.money} · Missions done: ${game.missions.index} / 4`,
    '',
    'P / Esc resume · S save game · R restart story',
    'M mute sound · Q quit to title',
  ];
  menuBox(game.ctx, game.view, 'PAUSED', lines, 'Press P to resume');
}

export function drawBusted(game) {
  let reason = game.bustedReason || 'The Velmora PD caught up with you.';
  let lines = [
    reason,
    '',
    'You posted bail and lost $150. The garage still owes you nothing.',
    `Money: $${game.player.money}`,
  ];
  menuBox(game.ctx, game.view, 'BUSTED!', lines, 'Press ENTER to get back on the street');
}

export function drawWasted(game) {
  let lines = [
    'Velmora buried another one. The hospital patched you up,',
    'took $200 for the trouble, and sent you back out.',
    `Money: $${game.player.money}`,
  ];
  menuBox(game.ctx, game.view, 'WASTED', lines, 'Press ENTER to get back on the street');
}

export function drawComplete(game) {
  let lines = [
    'All four jobs done. Rico and Mara both owe you.',
    `Final take: $${game.player.money}`,
    '',
    'Free roam continues — steal cars, dodge the PD,',
    'and enjoy the neon. There is always another job.',
  ];
  menuBox(game.ctx, game.view, 'VELMORA IS YOURS', lines, 'Press ENTER to keep playing');
}
