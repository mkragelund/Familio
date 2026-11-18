// Familio – små, bløde lydeffekter. Lydene syntetiseres som korte WAV-klip i browseren
// og afspilles som almindelig lyd (<audio>), så de også virker på iPad (iOS spiller ikke
// Web Audio, når iPad'en står på lydløs). Kun til fejringer. Stille i nattilstand,
// på pauseskærmen og i stilletiden.

var RATE = 22050;
var LEVEL = { lav: 0.22, mellem: 0.45, hoej: 0.8 };

// [frekvens, start (s), varighed (s), bølgeform, styrke]
var DEF = {
  done: [[784, 0, 0.18, 'sine', 1], [1047, 0.08, 0.22, 'sine', 1]],
  goal: [[523, 0, 0.22, 'tri', 1], [659, 0.12, 0.22, 'tri', 1], [784, 0.24, 0.22, 'tri', 1], [1047, 0.36, 0.6, 'tri', 1], [1568, 0.36, 0.5, 'sine', 0.35]],
  bonus: [[1319, 0, 0.3, 'sine', 0.8], [1568, 0.07, 0.3, 'sine', 0.8], [2093, 0.14, 0.3, 'sine', 0.8], [1760, 0.21, 0.3, 'sine', 0.8], [2349, 0.28, 0.3, 'sine', 0.8]],
  packed: [[880, 0, 0.08, 'tri', 0.8], [1175, 0.07, 0.2, 'sine', 1]],
  tick: [[1400, 0, 0.05, 'sine', 0.5]],
  undo: [[523, 0, 0.1, 'tri', 0.7], [392, 0.07, 0.15, 'tri', 0.7]],
  // Fødselsdag: første linje af "I dag er det …"-melodien (fri), blødt
  party: [[392, 0, 0.2, 'tri', 0.9], [392, 0.24, 0.12, 'tri', 0.9], [440, 0.4, 0.32, 'tri', 0.9], [392, 0.76, 0.32, 'tri', 0.9], [523, 1.12, 0.32, 'tri', 0.9], [494, 1.48, 0.6, 'tri', 0.9], [1047, 1.48, 0.5, 'sine', 0.25]],
  // Påmindelse: venlig dobbelt-klokke (spilles to gange)
  remind: [[880, 0, 0.35, 'sine', 0.9], [1175, 0.2, 0.5, 'sine', 0.9], [880, 0.9, 0.35, 'sine', 0.9], [1175, 1.1, 0.6, 'sine', 0.9]],
  // Jul og advent: små klokker
  jingle: [[1319, 0, 0.5, 'sine', 0.7], [1568, 0.18, 0.5, 'sine', 0.7], [1760, 0.36, 0.5, 'sine', 0.6], [2093, 0.54, 0.9, 'sine', 0.6], [1047, 0.54, 0.9, 'sine', 0.3]]
};

function synth(notes, level) {
  var len = 0;
  notes.forEach(function (n) { len = Math.max(len, n[1] + n[2] + 0.03); });
  var N = Math.ceil(len * RATE);
  var buf = new Float32Array(N);
  notes.forEach(function (n) {
    var f = n[0], s0 = Math.floor(n[1] * RATE), d = n[2] * RATE, wave = n[3], amp = n[4];
    for (var i = 0; i < d && s0 + i < N; i++) {
      var t = i / RATE;
      var ph = (f * t) % 1;
      var v = wave === 'tri' ? (ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph) : Math.sin(2 * Math.PI * ph);
      var att = Math.min(1, i / (0.012 * RATE));
      var dec = Math.exp(-5.5 * i / d);
      buf[s0 + i] += v * amp * att * dec;
    }
  });
  var peak = 0;
  for (var j = 0; j < N; j++) { peak = Math.max(peak, Math.abs(buf[j])); }
  var k = peak > 0 ? level / peak : 0;
  // WAV (16-bit mono)
  var out = new DataView(new ArrayBuffer(44 + N * 2));
  function str(o, s) { for (var q = 0; q < s.length; q++) { out.setUint8(o + q, s.charCodeAt(q)); } }
  str(0, 'RIFF'); out.setUint32(4, 36 + N * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
  out.setUint32(24, RATE, true); out.setUint32(28, RATE * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true);
  str(36, 'data'); out.setUint32(40, N * 2, true);
  for (var m = 0; m < N; m++) { out.setInt16(44 + m * 2, Math.max(-1, Math.min(1, buf[m] * k)) * 32767, true); }
  return URL.createObjectURL(new Blob([out], { type: 'audio/wav' }));
}

var cache = {};      // vol -> { navn: Audio }
var unlocked = false;

function clips(vol) {
  if (!cache[vol]) {
    var set = {};
    Object.keys(DEF).forEach(function (name) {
      var a = new Audio(synth(DEF[name], LEVEL[vol] || LEVEL.lav));
      a.preload = 'auto';
      set[name] = a;
    });
    cache[vol] = set;
  }
  return cache[vol];
}

// iOS: lyd skal "låses op" i et tryk (touchend/click). Afspil hvert klip lydløst én gang.
export function unlockAudio(settings) {
  if (unlocked) { return; }
  var vol = (settings && settings.sound && settings.sound.vol) || 'lav';
  var set = clips(vol);
  unlocked = true;
  Object.keys(set).forEach(function (n) {
    var a = set[n];
    try {
      a.muted = true;
      var p = a.play();
      var reset = function () { try { a.pause(); a.currentTime = 0; a.muted = false; } catch (e) { /* */ } };
      if (p && p.then) { p.then(reset).catch(function () { a.muted = false; unlocked = false; }); } else { reset(); }
    } catch (e) { unlocked = false; }
  });
}

function inRange(from, to, now) {
  var t = (now.getHours() < 10 ? '0' : '') + now.getHours() + ':' + (now.getMinutes() < 10 ? '0' : '') + now.getMinutes();
  if (!from || !to || from === to) { return false; }
  return from < to ? (t >= from && t < to) : (t >= from || t < to);
}

// settings: familiens indstillinger (sound: { on, vol, quietFrom, quietTo }). force = ignorer stilletid (test)
export function play(name, settings, muted, force) {
  var s = (settings && settings.sound) || {};
  if (s.on === false || muted) { return false; }
  if (!force && inRange(s.quietFrom || '20:00', s.quietTo || '07:00', new Date())) { return false; }
  var a = clips(s.vol || 'lav')[name];
  if (!a) { return false; }
  try {
    a.muted = false;
    a.currentTime = 0;
    var p = a.play();
    if (p && p.catch) { p.catch(function () { /* ikke låst op endnu */ }); }
  } catch (e) { return false; }
  return true;
}
