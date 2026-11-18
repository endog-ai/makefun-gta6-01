// Combat: fists, pistol, bullets, and the Viper gang members who shoot back.
import { WEAPONS } from './config.js';
import { dist2, angleDiff, clamp, range } from './random.js';
import { collidesWithBuildings } from './city.js';
import { scarePeds } from './pedestrians.js';

// A Viper guard posted near the docks, waiting for trouble.
export function makeEnemy(x, y) {
  let guard = {};
  guard.x = x;
  guard.y = y;
  guard.angle = 0;
  guard.hp = 100;
  guard.shootCd = range(Math.random, 0.5, 1.5);
  guard.dead = false;
  guard.speed = 90;
  guard.guardX = x;
  guard.guardY = y;
  return guard;
}

// Spawn a bullet flying from (fromX, fromY) along `angle`.
export function fireBullet(game, fromX, fromY, angle, friendly) {
  let w = WEAPONS.pistol;
  let bullet = {};
  bullet.x = fromX + Math.cos(angle) * 24;
  bullet.y = fromY + Math.sin(angle) * 24;
  bullet.vx = Math.cos(angle) * w.bulletSpeed;
  bullet.vy = Math.sin(angle) * w.bulletSpeed;
  bullet.life = w.range / w.bulletSpeed;
  bullet.friendly = friendly;
  game.bullets.push(bullet);
  game.effects.muzzle(fromX, fromY, angle);
  game.audio.gunshot();
}

// Fire the pistol at the mouse aim point.
export function playerShoot(game) {
  let p = game.player;
  if (p.inCar || p.weapon !== 'pistol' || p.shootCd > 0) return;
  if (p.ammo <= 0) {
    game.effects.floatText(p.x, p.y - 30, 'NO AMMO', '#ff8888');
    return;
  }
  p.ammo -= 1;
  p.shootCd = WEAPONS.pistol.cooldown;
  let angle = p.aimAngle !== undefined ? p.aimAngle : p.angle;
  fireBullet(game, p.x, p.y, angle, true);
  game.effects.addShake(1.5);
  game.police.addHeat(0.35);
  // Gunshots scare nearby pedestrians (same helper the police chase uses).
  scarePeds(game.peds, p.x, p.y, 420);
}

// Is target `t` in front of the player within `reach`?
function inFront(p, t, reach) {
  let facing = (t.x - p.x) * Math.cos(p.angle) + (t.y - p.y) * Math.sin(p.angle) > 0;
  return facing && dist2(p.x, p.y, t.x, t.y) < reach * reach;
}

// Run `act` on every live target in `list` standing in front of the player.
// `pos` picks the hittable body out of a list entry (a cop entry is not
// itself a body — its car is).
function forEachInFront(game, list, reach, alive, pos, act) {
  let p = game.player;
  for (let i = 0; i < list.length; i++) {
    let entry = list[i];
    if (!alive(entry)) continue;
    let body = pos(entry);
    if (inFront(p, body, reach)) act(entry, body);
  }
}

export function playerPunch(game) {
  let p = game.player;
  if (p.inCar || p.punchCd > 0) return;
  p.punchCd = WEAPONS.fists.cooldown;
  game.audio.punch();
  let reach = WEAPONS.fists.range;
  forEachInFront(game, game.enemies, reach, (e) => !e.dead, (e) => e, (e) => {
    damageEnemy(game, e, WEAPONS.fists.damage, p.angle);
  });
  forEachInFront(game, game.peds, reach, (ped) => !ped.dead, (ped) => ped, (ped) => {
    ped.dead = true;
    game.effects.blood(ped.x, ped.y);
    game.police.addWanted(1);
    game.effects.floatText(ped.x, ped.y - 20, 'WANTED +1', '#ff6666');
  });
  forEachInFront(game, game.cops, reach, (cop) => !cop.car.dead, (cop) => cop.car, (cop) => {
    cop.car.hp -= 20;
    game.police.addWanted(1);
  });
}

export function damageEnemy(game, e, dmg, angle) {
  e.hp -= dmg;
  game.effects.blood(e.x, e.y);
  e.x += Math.cos(angle) * 8;
  e.y += Math.sin(angle) * 8;
  if (e.hp <= 0 && !e.dead) {
    e.dead = true;
    game.player.money += 25;
    game.effects.floatText(e.x, e.y - 24, '+$25', '#7CFF6B');
  }
}

// What a friendly bullet hits, in priority order. Returns true if the
// bullet is spent. Each entry names a target list, its hit radius and what
// happens on a hit; the table is walked in priority order.
function friendlyHit(game, b) {
  let targets = [
    {
      list: game.enemies,
      radius: 16,
      hit: (e) => {
        damageEnemy(game, e, WEAPONS.pistol.damage, Math.atan2(b.vy, b.vx));
      },
    },
    {
      list: game.peds,
      radius: 12,
      hit: (ped) => {
        ped.dead = true;
        game.effects.blood(ped.x, ped.y);
        game.police.addWanted(1);
        game.effects.floatText(ped.x, ped.y - 20, 'WANTED +1', '#ff6666');
      },
    },
    {
      list: game.cops,
      radius: 26,
      hit: (cop) => {
        cop.car.hp -= WEAPONS.pistol.damage;
        game.effects.sparks(b.x, b.y);
        game.police.addWanted(1);
      },
    },
    {
      list: game.cars,
      radius: 26,
      hit: (c) => {
        c.hp -= WEAPONS.pistol.damage;
        game.effects.sparks(b.x, b.y);
        if (c.hp <= 0) {
          c.dead = true;
          game.effects.burst(c.x, c.y, '#ff7a2e', 20, 240);
          game.audio.crash();
        }
      },
    },
  ];
  for (let ti = 0; ti < targets.length; ti++) {
    let spec = targets[ti];
    for (let i = 0; i < spec.list.length; i++) {
      let t = spec.list[i];
      let body = t.car || t;
      let dead = t.dead || (t.car && t.car.dead);
      if (dead) continue;
      if (t.kind === 'player') continue;
      if (dist2(b.x, b.y, body.x, body.y) < spec.radius * spec.radius) {
        spec.hit(t);
        return true;
      }
    }
  }
  return false;
}

// What an enemy bullet hits. Returns true if the bullet is spent.
function enemyHit(game, b) {
  let p = game.player;
  if (!p.inCar && dist2(b.x, b.y, p.x, p.y) < 14 * 14) {
    hurtPlayer(game, 12);
    return true;
  }
  if (p.inCar && dist2(b.x, b.y, p.inCar.x, p.inCar.y) < 28 * 28) {
    p.inCar.hp -= 6;
    return true;
  }
  return false;
}

// Move one bullet a frame; returns false when it is spent and dropped.
function stepBullet(game, b, dt) {
  b.life -= dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  if (b.life <= 0) return false;
  if (collidesWithBuildings(game.city, b.x, b.y, 2)) {
    game.effects.sparks(b.x, b.y);
    return false;
  }
  if (b.friendly) return !friendlyHit(game, b);
  return !enemyHit(game, b);
}

export function updateBullets(game, dt) {
  let survivors = [];
  for (let i = 0; i < game.bullets.length; i++) {
    if (stepBullet(game, game.bullets[i], dt)) survivors.push(game.bullets[i]);
  }
  game.bullets = survivors;
}

export function hurtPlayer(game, dmg) {
  let p = game.player;
  if (p.hurtT > 0 || p.dead) return;
  p.hp -= dmg;
  p.hurtT = 0.4;
  game.effects.addShake(4);
  if (p.hp <= 0) {
    p.hp = 0;
    p.dead = true;
    game.screen = 'wasted';
    game.audio.busted();
  }
}

// One guard's turn: chase and shoot the player when close, drift back to
// the guard post when the player is gone.
function updateGuard(game, e, dt) {
  let p = game.player;
  let d = Math.sqrt(dist2(p.x, p.y, e.x, e.y));
  if (d >= 520 || p.dead) {
    // Drift back to the guard post.
    let gd = Math.sqrt(dist2(e.x, e.y, e.guardX, e.guardY));
    if (gd > 30) {
      let a = Math.atan2(e.guardY - e.y, e.guardX - e.x);
      e.x += Math.cos(a) * e.speed * 0.6 * dt;
      e.y += Math.sin(a) * e.speed * 0.6 * dt;
      e.angle = a;
    }
    return;
  }
  e.angle = Math.atan2(p.y - e.y, p.x - e.x);
  // Strafe at mid range, hold ground up close.
  if (d > 260) {
    e.x += Math.cos(e.angle) * e.speed * dt;
    e.y += Math.sin(e.angle) * e.speed * dt;
  }
  e.shootCd -= dt;
  if (e.shootCd > 0 || d >= 480) return;
  e.shootCd = 1.1 + Math.random() * 0.7;
  let spread = (Math.random() - 0.5) * 0.35;
  let bullet = {};
  bullet.x = e.x + Math.cos(e.angle) * 22;
  bullet.y = e.y + Math.sin(e.angle) * 22;
  bullet.vx = Math.cos(e.angle + spread) * 780;
  bullet.vy = Math.sin(e.angle + spread) * 780;
  bullet.life = 0.8;
  bullet.friendly = false;
  game.bullets.push(bullet);
  game.effects.muzzle(e.x, e.y, e.angle);
  game.audio.gunshot();
}

export function updateEnemies(game, dt) {
  for (let i = 0; i < game.enemies.length; i++) {
    let e = game.enemies[i];
    if (!e.dead) updateGuard(game, e, dt);
  }
}

export function drawEnemy(gfx, e, time) {
  void time;
  gfx.save();
  gfx.translate(e.x, e.y);
  if (e.dead) {
    gfx.rotate(e.angle);
    gfx.fillStyle = '#3a1a1a';
    gfx.beginPath();
    gfx.ellipse(0, 0, 12, 7, 0, 0, 7);
    gfx.fill();
  } else {
    gfx.fillStyle = 'rgba(0,0,0,0.3)';
    gfx.beginPath();
    gfx.ellipse(2, 3, 10, 8, 0, 0, 7);
    gfx.fill();
    gfx.rotate(e.angle);
    // Viper purple jackets.
    gfx.fillStyle = '#7a2e8a';
    gfx.beginPath();
    gfx.arc(0, 0, 11, 0, 7);
    gfx.fill();
    gfx.fillStyle = '#e8c39a';
    gfx.beginPath();
    gfx.arc(3, 0, 6, 0, 7);
    gfx.fill();
    gfx.fillStyle = '#1a1a1a';
    gfx.fillRect(8, -2, 12, 4);
  }
  gfx.restore();
  // Health bar.
  let barW = 28;
  let shown = Math.max(0, e.hp / 100);
  gfx.fillStyle = 'rgba(0,0,0,0.5)';
  gfx.fillRect(e.x - 14, e.y - 24, barW, 4);
  gfx.fillStyle = '#ff4444';
  gfx.fillRect(e.x - 14, e.y - 24, barW * shown, 4);
}
