// All sound is synthesised with WebAudio — no audio files, nothing over the network.
export function createAudio() {
  let ac = null;
  let master = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let musicTimer = null;
  let musicStep = 0;
  let noiseBuf = null; // one shared 1s noise buffer — every gunshot used to allocate its own
  const bassLine = [55, 0, 55, 65.4, 55, 0, 49, 58.3, 55, 0, 55, 65.4, 73.4, 65.4, 58.3, 49];

  // Lazily create the audio context on first use (browsers need a gesture).
  function ensure() {
    if (ac !== null) return true;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      ac = new Ctor();
      master = ac.createGain();
      master.gain.value = 0.5;
      master.connect(ac.destination);
    } catch (e) {
      return false;
    }
    return true;
  }

  // A short oscillator blip, optionally sliding to another pitch.
  function tone(freq, dur, type, vol, slideTo) {
    if (ac === null || muted) return;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type ? type : 'sine';
    o.frequency.value = freq;
    if (slideTo) {
      const target = Math.max(slideTo, 1);
      o.frequency.exponentialRampToValueAtTime(target, ac.currentTime + dur);
    }
    g.gain.setValueAtTime(vol ? vol : 0.2, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    o.connect(g);
    g.connect(master);
    o.start();
    o.stop(ac.currentTime + dur);
  }

  // The shared noise buffer, built once and reused by every noise sound.
  function getNoiseBuf() {
    if (noiseBuf !== null) return noiseBuf;
    const len = ac.sampleRate;
    noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i += 1) {
      d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    return noiseBuf;
  }

  // Filtered noise burst (gunshots, crashes, punches).
  function noise(dur, vol, freq) {
    if (ac === null || muted) return;
    const src = ac.createBufferSource();
    src.buffer = getNoiseBuf();
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq ? freq : 1200;
    const g = ac.createGain();
    g.gain.value = vol ? vol : 0.3;
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start();
    src.stop(ac.currentTime + dur);
  }

  // Play a note after a delay (for two-note effects).
  function later(freq, dur, type, vol, delay, slideTo) {
    setTimeout(() => tone(freq, dur, type, vol, slideTo), delay);
  }

  function startEngine() {
    engineOsc = ac.createOscillator();
    engineOsc.type = 'sawtooth';
    engineFilter = ac.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 900;
    engineGain = ac.createGain();
    engineGain.gain.value = 0.04;
    engineOsc.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
  }

  function stopEngine() {
    if (engineOsc === null) return;
    try {
      engineOsc.stop();
    } catch (e) {
      // Already stopped.
    }
    engineOsc = null;
  }

  const api = {};
  api.unlock = function () {
    if (ensure() === false) return;
    if (ac.state === 'suspended') ac.resume();
  };
  Object.defineProperty(api, 'muted', {
    get() { return muted; },
  });
  api.toggleMute = function () {
    muted = muted === false;
    if (master !== null) master.gain.value = muted ? 0 : 0.5;
    return muted;
  };
  api.click = function () { tone(660, 0.06, 'square', 0.08); };
  api.pickup = function () { tone(880, 0.09, 'sine', 0.18); later(1320, 0.12, 'sine', 0.18, 70); };
  api.coin = function () { tone(988, 0.08, 'triangle', 0.2); later(1319, 0.14, 'triangle', 0.2, 80); };
  api.gunshot = function () { noise(0.16, 0.45, 2600); tone(140, 0.1, 'square', 0.2, 50); };
  api.punch = function () { noise(0.08, 0.3, 500); tone(90, 0.08, 'sine', 0.25, 45); };
  api.crash = function () { noise(0.3, 0.45, 700); tone(70, 0.25, 'sawtooth', 0.2, 35); };
  api.siren = function () { tone(720, 0.45, 'sine', 0.09, 950); later(950, 0.45, 'sine', 0.09, 450, 720); };
  api.horn = function () { tone(370, 0.18, 'square', 0.1); tone(466, 0.18, 'square', 0.08); };
  api.busted = function () { tone(392, 0.3, 'sawtooth', 0.15); later(311, 0.5, 'sawtooth', 0.15, 300); };
  api.missionDone = function () {
    const notes = [523, 659, 784, 1047];
    notes.forEach((n, i) => later(n, 0.22, 'triangle', 0.2, i * 110));
  };
  api.engine = function (on, speedRatio) {
    if (ac === null || muted) return;
    if (on && engineOsc === null) startEngine();
    if (on === false) {
      stopEngine();
      return;
    }
    if (engineOsc !== null) {
      engineOsc.frequency.value = 55 + speedRatio * 165;
      engineGain.gain.value = 0.05 + speedRatio * 0.05;
    }
  };
  api.startMusic = function () {
    if (ac === null || musicTimer !== null) return;
    musicTimer = setInterval(() => {
      if (muted) return;
      const f = bassLine[musicStep % bassLine.length];
      musicStep += 1;
      if (f) tone(f, 0.24, 'triangle', 0.12);
      if (musicStep % 4 === 0) noise(0.03, 0.05, 6000);
    }, 240);
  };
  api.stopMusic = function () {
    if (musicTimer !== null) {
      clearInterval(musicTimer);
      musicTimer = null;
    }
  };
  return api;
}
