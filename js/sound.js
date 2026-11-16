// Familio – små, bløde lydeffekter lavet direkte i browseren (Web Audio, ingen lydfiler).
// Kun til fejringer. Stille i nattilstand, på pauseskærmen og i stilletiden.

var ctx = null;
var VOL = { lav: 0.07, mellem: 0.14, hoej: 0.26 };

function ensure() {
  if (!ctx) {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { return null; }
    try { ctx = new AC(); } catch (e) { return null; }
  }
  if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { /* */ } }
  return ctx;
}

// iOS kræver, at lyden "låses op" ved et tryk
export function unlockAudio() {
  var c = ensure();
  if (!c) { return; }
  try {
    var b = c.createBuffer(1, 1, 22050), s = c.createBufferSource();
    s.buffer = b; s.connect(c.destination); s.start(0);
  } catch (e) { /* */ }
}

function tone(c, master, freq, at, dur, type, level) {
  var o = c.createOscillator(), g = c.createGain();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(freq, at);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, (level || 1) * master), at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g); g.connect(c.destination);
  o.start(at); o.stop(at + dur + 0.02);
}

var SOUNDS = {
  // pligt klaret: blødt "pling" op
  done: function (c, v, t) { tone(c, v, 784, t, 0.18, 'sine'); tone(c, v, 1047, t + 0.08, 0.22, 'sine'); },
  // mål nået: lille fanfare
  goal: function (c, v, t) {
    [[523, 0], [659, 0.12], [784, 0.24], [1047, 0.36]].forEach(function (n, i) { tone(c, v, n[0], t + n[1], i === 3 ? 0.6 : 0.22, 'triangle', 1.1); });
    tone(c, v, 1568, t + 0.36, 0.5, 'sine', 0.4);
  },
  // bonus: glitrende klokker
  bonus: function (c, v, t) { [1319, 1568, 2093, 1760, 2349].forEach(function (f, i) { tone(c, v, f, t + i * 0.07, 0.3, 'sine', 0.8); }); },
  // alt pakket
  packed: function (c, v, t) { tone(c, v, 880, t, 0.08, 'triangle', 0.8); tone(c, v, 1175, t + 0.07, 0.2, 'sine'); },
  // ét punkt på huskelisten
  tick: function (c, v, t) { tone(c, v, 1400, t, 0.05, 'sine', 0.5); },
  // fortryd: dæmpet tone ned
  undo: function (c, v, t) { tone(c, v, 523, t, 0.1, 'triangle', 0.7); tone(c, v, 392, t + 0.07, 0.15, 'triangle', 0.7); }
};

function inRange(from, to, now) {
  var t = (now.getHours() < 10 ? '0' : '') + now.getHours() + ':' + (now.getMinutes() < 10 ? '0' : '') + now.getMinutes();
  if (!from || !to || from === to) { return false; }
  return from < to ? (t >= from && t < to) : (t >= from || t < to);
}

// settings: familiens indstillinger (sound: { on, vol, quietFrom, quietTo })
export function play(name, settings, muted) {
  var s = (settings && settings.sound) || {};
  if (s.on === false || muted) { return; }
  if (inRange(s.quietFrom || '20:00', s.quietTo || '07:00', new Date())) { return; }
  var c = ensure();
  if (!c || !SOUNDS[name]) { return; }
  try { SOUNDS[name](c, VOL[s.vol] || VOL.lav, c.currentTime + 0.01); } catch (e) { /* */ }
}
