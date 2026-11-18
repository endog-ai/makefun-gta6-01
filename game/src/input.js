// Keyboard + mouse state, with edge-triggered "just pressed" keys.
export function createInput(canvas) {
  const keys = {};
  const pressed = {};
  const mouse = { x: 0, y: 0, down: false, clicked: false };

  // Normalise single-character keys to lowercase; arrows and space stay as-is.
  function keyName(e) {
    const k = e.key;
    if (k.length !== 1) return k;
    return k.toLowerCase();
  }

  const stopKeys = new Set([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
  function onKey(e) {
    if (stopKeys.has(e.key)) e.preventDefault();
    const k = keyName(e);
    if (keys[k] !== true) pressed[k] = true;
    keys[k] = true;
  }
  function onUp(e) {
    keys[keyName(e)] = false;
  }
  // A lost window focus drops keyup events, which used to leave keys stuck
  // down (the player kept walking or driving with no key held). Clear all.
  function onBlur() {
    for (const name of Object.keys(keys)) keys[name] = false;
  }

  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    mouse.down = true;
    mouse.clicked = true;
  });
  window.addEventListener('mouseup', () => {
    mouse.down = false;
  });

  const input = {};
  input.keys = keys;
  input.mouse = mouse;
  input.down = function (...names) {
    return names.some((n) => keys[n] === true);
  };
  input.justPressed = function (name) {
    return pressed[name] === true;
  };
  input.endFrame = function () {
    for (const name of Object.keys(pressed)) pressed[name] = false;
    mouse.clicked = false;
  };
  return input;
}
