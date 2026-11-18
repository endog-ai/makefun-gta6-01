// Particles, skid marks, floating text and screen shake.
export function createEffects() {
  const particles = [];
  const skids = [];
  const texts = [];
  let shake = 0;

  // Keep a list under its cap by dropping the oldest entries.
  function trim(list, cap) {
    const over = list.length - cap;
    if (over > 0) list.splice(0, over);
  }

  function addParticle(p) {
    particles.push(p);
  }

  const fx = {};
  fx.particles = particles;
  fx.skids = skids;
  fx.texts = texts;
  fx.burst = function (x, y, color, n, speed) {
    const count = n ? n : 12;
    const base = speed ? speed : 160;
    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const s = base * (0.4 + Math.random() * 0.8);
      const life = 0.5 + Math.random() * 0.4;
      const size = 2 + Math.random() * 3;
      addParticle({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life,
        max: 0.9,
        color,
        size,
      });
    }
    // A long gunfight used to grow this list without bound; keep the newest.
    trim(particles, 600);
  };
  fx.smoke = function (x, y) {
    const vx = (Math.random() - 0.5) * 20;
    const vy = -30 - Math.random() * 30;
    const size = 5 + Math.random() * 5;
    addParticle({
      x,
      y,
      vx,
      vy,
      life: 1.2,
      max: 1.2,
      color: '#888888',
      size,
      smoke: true,
    });
  };
  fx.blood = function (x, y) {
    this.burst(x, y, '#c02020', 10, 120);
  };
  fx.sparks = function (x, y) {
    this.burst(x, y, '#ffd24d', 8, 220);
  };
  fx.muzzle = function (x, y, angle) {
    addParticle({
      x: x + Math.cos(angle) * 26,
      y: y + Math.sin(angle) * 26,
      vx: Math.cos(angle) * 60,
      vy: Math.sin(angle) * 60,
      life: 0.08,
      max: 0.08,
      color: '#ffe14d',
      size: 9,
    });
  };
  fx.skid = function (x, y, angle) {
    skids.push({ x, y, angle });
    trim(skids, 400);
  };
  fx.floatText = function (x, y, text, color) {
    const c = color ? color : '#ffffff';
    texts.push({ x, y, text, color: c, life: 1.4 });
    trim(texts, 24); // oldest first
  };
  fx.addShake = function (amount) {
    shake = Math.min(shake + amount, 18);
  };
  fx.update = function (dt) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.smoke === true) {
        p.vy -= 20 * dt;
        p.size += 6 * dt;
      }
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (let j = texts.length - 1; j >= 0; j -= 1) {
      texts[j].life -= dt;
      texts[j].y -= 34 * dt;
      if (texts[j].life <= 0) texts.splice(j, 1);
    }
    shake -= 40 * dt;
    if (shake < 0) shake = 0;
  };
  fx.shakeOffset = function () {
    if (shake <= 0.2) return { x: 0, y: 0 };
    return { x: (Math.random() - 0.5) * shake, y: (Math.random() - 0.5) * shake };
  };
  return fx;
}
