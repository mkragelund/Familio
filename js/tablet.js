// Familio – tablet-visningen (låst iPad i køkkenet). Ingen login for børnene.
import { createStore, DEMO } from './store.js';
import {
  ymd, parseYmd, today, addDays, mondayOf, weekDays, isoWeek, weekRangeLabel, DAY_NAMES, DAY_SHORT,
  eventsOn, timeLabel, sumPoints, periodBounds, completionId, packedId, memberById, kidsOf, inNight,
  shortDate, monthName, MONTHS_SHORT, pad, randomCode
} from './model.js';
import { esc, pal, icon, logo, avatar, confettiHtml, pick, autoUpdate, justUpdated, toast } from './ui.js';
import { APP_VERSION } from './config.js';
import { play, unlockAudio } from './sound.js';
import { weatherLoc, getWeather, dayWeather, wxIcon, wxText, deg, dayBadge } from './weather.js';
function sfx(name) { play(name, S.family && S.family.settings, S.dimShown); }
// Vejrudsigten for familiens sted (null hvis intet sted er valgt). Ny udsigt → tegn igen.
function wx() { return getWeather(weatherLoc(S.family), function () { render(); }); }

var store;
var S = {
  fid: null, linkChecked: false, pairCode: '', seenAdj: null,
  user: null, family: null, famError: null, paired: true, events: [], meals: {}, completions: [], adjustments: [], packed: {},
  view: 'dag', selDay: ymd(today()), day: ymd(today()), cele: null, wakeUntil: 0, nightShown: false
};
var unsubs = [];
var famUnsub = null, linkUnsub = null;
function F(p) { return 'families/' + S.fid + (p ? '/' + p : ''); }
var PAIR_KEY = 'familio-pair-code';
var app = document.getElementById('app');
var overlay = document.getElementById('overlay');

var HEADS = ['Sådan', 'Flot klaret', 'Yes', 'Wow', 'High five', 'Super', 'Sejt gået', 'Godt gået'];
var BODIES = [
  '{p} point på kontoen – keep it up!', '+{p} point. Du er godt i gang!', 'Et skridt nærmere ugens belønning!',
  '{p} point lige i lommen!', 'Stjerneindsats – {p} point til dig!', 'Mor og far er stolte. +{p} point!',
  'Du er on fire! +{p} point.', 'Sådan klarer man det! +{p} point.'
];

function boot() {
  app.innerHTML = '<div class="center-screen"><div class="spinner" aria-label="Indlæser"></div></div>';
  createStore().then(function (st) {
    store = st;
    store.onUser(function (u) {
      if (!u) {
        // Demo: simuleret tablet. Ellers logger en forælder ind med Google én gang på tabletten.
        if (store.demo) { store.signInAnon().catch(showFatal); return; }
        S.user = null; S.linkChecked = true; S.paired = true; renderTabletLogin(); return;
      }
      S.user = u;
      watchLink();
    });
  }).catch(showFatal);
  document.addEventListener('click', onClick);
  document.addEventListener('touchstart', onActivity, { passive: true });
  // iOS låser kun lyden op ved slutningen af et tryk
  var unlock = function () { unlockAudio(S.family && S.family.settings); };
  document.addEventListener('touchend', unlock, { passive: true });
  document.addEventListener('click', unlock);
  document.addEventListener('mousedown', onActivity);
  setInterval(tick, 20000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { tick(); requestWake(); } });
  requestWake();
  // Tavlen står altid åben: hent ny version af sig selv, når ingen bruger den (pauseskærm/nat) eller efter 2 min uden tryk
  autoUpdate(APP_VERSION, function () { return !S.cele && !S.panel && (S.dimShown || Date.now() - lastActive > 120000); });
  if (justUpdated()) { setTimeout(function () { toast('Familio er opdateret til version ' + APP_VERSION); }, 1500); }
}

function renderTabletLogin(err) {
  app.innerHTML = '<div class="center-screen">' + logo(96) +
    '<b class="display" style="font-size:34px">Familio-tavlen</b>' +
    '<p class="muted" style="font-size:18px;max-width:540px">Log ind én gang med en forælders Google-konto. Tabletten husker familien bagefter – børnene skal ikke logge ind.</p>' +
    '<button class="btn secondary" style="height:60px;font-size:18px;padding:0 28px" data-a="tablet-google">' +
    '<svg width="22" height="22" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.8 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.8c4.3-4 6.9-9.9 6.9-17.2z"/><path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-2.9-.8-4.7s.3-3.3.8-4.7l-7.8-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.8l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.8c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.8 6.1C6.6 42.6 14.6 48 24 48z"/></svg>' +
    'Log ind med Google</button>' + (err ? '<p class="err">' + esc(err) + '</p>' : '') + '</div>';
}

function showFatal(e) {
  app.innerHTML = '<div class="center-screen">' + logo(72) + '<b class="display" style="font-size:24px">Familio kunne ikke starte</b><p class="muted">' +
    esc((e && e.message) || e) + '</p><button class="btn" onclick="location.reload()">Prøv igen</button></div>';
}

var wakeSentinel = null;
function requestWake() {
  try {
    if (navigator.wakeLock && !document.hidden && !wakeSentinel) {
      navigator.wakeLock.request('screen').then(function (w) {
        wakeSentinel = w;
        w.addEventListener('release', function () { wakeSentinel = null; });
      }).catch(function () {});
    }
  } catch (e) { /* ikke understøttet */ }
}
// Pauseskærm/nat: slip skærmlåsen, så iPad'ens egen Autolås kan slukke skærmen helt
function releaseWake() {
  try { if (wakeSentinel) { wakeSentinel.release(); wakeSentinel = null; } } catch (e) { /* */ }
}

var lastActive = Date.now();
function idleMinutes() {
  var v = S.family && S.family.settings && S.family.settings.idleMin;
  return v === undefined ? 5 : +v;   // 0 = ingen pauseskærm
}
function isSaver() {
  var m = idleMinutes();
  return !!S.family && m > 0 && !isNight() && Date.now() - lastActive > m * 60000;
}
function onActivity() {
  var wasDim = S.dimShown;
  lastActive = Date.now();
  if (wasDim) {
    // Væk skærmen – men tegn først om lidt efter, så iPad'en ikke mister trykket
    if (isNight()) { S.wakeUntil = Date.now() + 3 * 60 * 1000; setTimeout(render, 3 * 60 * 1000 + 500); }
    requestWake();
    setTimeout(render, 350);
  }
}

function watchLink() {
  if (linkUnsub) { linkUnsub(); }
  // En forælder, der allerede er logget ind på enheden, ser bare sin egen familie
  var path = S.user.anon ? 'tabletLinks/' + S.user.uid : 'users/' + S.user.uid;
  linkUnsub = store.watchDoc(path, function (link) {
    S.linkChecked = true;
    var fid = link && link.familyId;
    if (fid && fid !== S.fid) {
      S.fid = fid; S.family = null; S.paired = true; S.pairRequested = false;
      watchFamily();
    } else if (!fid) {
      S.fid = null; S.family = null; S.paired = false;
      stopData();
      if (S.user.anon) { requestPairing(); }
    }
    render();
  }, function () { S.linkChecked = true; S.paired = false; requestPairing(); render(); });
}

function stopData() {
  unsubs.forEach(function (u) { u(); }); unsubs = [];
  if (famUnsub) { famUnsub(); famUnsub = null; }
}

function watchFamily() {
  stopData();
  famUnsub = store.watchDoc(F(''), function (fam) {
    var first = !S.family;
    var t = fam && fam.settings && fam.settings.soundTest;
    if (t && S.lastSoundTest !== undefined && t !== S.lastSoundTest && Date.now() - t < 60000) { play('done', fam.settings, false, true); }
    S.lastSoundTest = t || 0;
    S.family = fam; S.paired = !!fam; S.famError = null;
    if (fam && first) { subscribeData(); }
    if (!fam) { requestPairing(); }
    render();
  }, function () {
    // Tabletten er fjernet fra familien
    S.family = null; S.paired = false; S.fid = null;
    stopData();
    requestPairing();
    render();
  });
}

function requestPairing() {
  if (!S.user || S.pairRequested) { return; }
  S.pairRequested = true;
  var code = '';
  try { code = localStorage.getItem(PAIR_KEY) || ''; } catch (e) { /* */ }
  if (!code) { code = randomCode(6); try { localStorage.setItem(PAIR_KEY, code); } catch (e) { /* */ } }
  S.pairCode = code;
  store.set('pairing/' + code, { uid: S.user.uid, at: Date.now(), device: (navigator.userAgent || '').slice(0, 120) }).catch(function () {
    // koden er taget af en anden enhed – lav en ny
    try { localStorage.removeItem(PAIR_KEY); } catch (e) { /* */ }
    S.pairCode = ''; S.pairRequested = false; setTimeout(requestPairing, 500);
  });
}

function subscribeData() {
  unsubs.forEach(function (u) { u(); });
  unsubs = [];
  S.seenAdj = null;
  var t = parseYmd(S.day);
  var b = periodBounds(t);
  var from = b.weekFrom < b.monthFrom ? b.weekFrom : b.monthFrom;
  var mon = mondayOf(t);
  unsubs.push(store.watchColl(F('events'), null, function (list) { S.events = list; render(); }));
  // Måltider gemmes med datoen som id og som felt "date"
  unsubs.push(store.watchColl(F('meals'), ['date', '>=', ymd(mon)], function (list) {
    var m = {}; list.forEach(function (x) { m[x.id] = x.text || ''; }); S.meals = m; render();
  }));
  unsubs.push(store.watchColl(F('completions'), ['date', '>=', from], function (list) { S.completions = list; render(); }));
  unsubs.push(store.watchColl(F('adjustments'), ['date', '>=', from], function (list) { S.adjustments = list; checkBonus(list); render(); }));
  unsubs.push(store.watchColl(F('packed'), ['date', '>=', ymd(mon)], function (list) {
    var p = {}; list.forEach(function (x) { p[x.id] = true; }); S.packed = p; render();
  }));
}

function tick() {
  var d = ymd(today());
  if (d !== S.day) {
    // Ny dag – og mandag betyder automatisk ny uge
    S.day = d; S.selDay = d;
    if (S.family) { subscribeData(); }
    render();
    return;
  }
  wx();
  var dim = isNight() || isSaver();
  if (dim || dim !== S.dimShown) { render(); }
}

function isNight() {
  if (!S.family) { return false; }
  return inNight(S.family.settings, new Date()) && Date.now() > S.wakeUntil;
}

// ---------- Beregninger ----------
function kids() { return kidsOf(S.family); }
function chores() { return (S.family && S.family.chores) || []; }
function goals(kid) {
  var g = (S.family && S.family.goals && S.family.goals[kid]) || {};
  return { weekPts: +g.weekPts || 0, weekReward: g.weekReward || '', monthPts: +g.monthPts || 0, monthReward: g.monthReward || '' };
}
function points(kid) {
  var b = periodBounds(parseYmd(S.day));
  return {
    week: sumPoints(S.completions, S.adjustments, kid, b.weekFrom, b.weekTo),
    month: sumPoints(S.completions, S.adjustments, kid, b.monthFrom, b.monthTo)
  };
}
function isDone(date, choreId, kid) {
  var id = completionId(date, choreId, kid);
  for (var i = 0; i < S.completions.length; i++) { if (S.completions[i].id === id) { return true; } }
  return false;
}
function pct(a, b) { return b > 0 ? Math.min(100, Math.round(a / b * 100)) : 0; }

// ---------- Render ----------
function render() {
  S.nightShown = false;
  if (!S.user) { return; }
  if (!S.linkChecked) { return; }
  if (!S.paired) { app.innerHTML = renderPairing(); return; }
  if (S.famError) { showFatal(S.famError); return; }
  if (!S.family) {
    app.innerHTML = '<div class="center-screen">' + logo(72) + '<b class="display" style="font-size:24px">Venter på familien…</b>' +
      '<p class="muted">Henter familien…</p></div>';
    return;
  }
  var mon = mondayOf(parseYmd(S.day));
  var html = '';
  if (DEMO) { html += '<div class="demo-band">DEMO – data gemmes kun i denne browser. <button data-a="demo-reset">Nulstil demo</button></div>'; }
  html += '<div class="tb"' + (DEMO ? ' style="height:calc(100vh - 30px)"' : '') + '>';
  html += renderHead(mon);
  html += '<main class="tb-main">';
  if (S.view === 'dag') { html += renderDay(); }
  else if (S.view === 'uge') { html += renderWeek(mon); }
  else if (S.view === 'mad') { html += renderMeals(mon); }
  else if (S.view === 'pligter') { html += renderChores(mon); }
  else { html += renderActs(mon); }
  html += '</main>';
  html += renderNav();
  html += '</div>';
  if (isNight()) { html += renderNight(); S.nightShown = true; }
  else if (isSaver()) { html += renderSaver(); }
  S.dimShown = isNight() || isSaver();
  document.documentElement.classList.toggle('dark', S.dimShown);
  setThemeColor(S.nightShown ? '#0B0D12' : S.dimShown ? '#000000' : '#1F2430');
  if (S.dimShown) { releaseWake(); }
  app.innerHTML = html;
  renderPanel();
}

// iOS farver statuslinjen (ur, wifi, batteri) efter theme-color. I nat/pauseskærm gøres den sort,
// så den ikke lyser som en blå stribe øverst. Selve statuslinjen kan iPadOS ikke skjule.
var themeMeta = document.querySelector('meta[name="theme-color"]');
function setThemeColor(c) {
  if (themeMeta && themeMeta.getAttribute('content') !== c) { themeMeta.setAttribute('content', c); }
}

function renderPairing() {
  if (!S.user.anon) {
    return '<div class="center-screen">' + logo(88) + '<b class="display" style="font-size:30px">Ingen familie endnu</b>' +
      '<p class="muted" style="font-size:18px;max-width:520px">Kontoen ' + esc(S.user.email) + ' er ikke med i en familie. Opret familien i Familio på telefonen først – så dukker den op her.</p></div>';
  }
  return '<div class="center-screen">' + logo(88) +
    '<b class="display" style="font-size:30px">Tilknyt denne tablet</b>' +
    '<p class="muted" style="font-size:18px;max-width:560px">Åbn Familio på din telefon › Indstillinger › Tablets › <b>Tilknyt tablet</b>, og skriv koden herunder.</p>' +
    '<div class="display" style="font-size:64px;letter-spacing:.15em;background:#fff;border-radius:20px;padding:14px 28px">' + esc(S.pairCode || '······') + '</div>' +
    '<p class="muted">Siden opdaterer automatisk, når den er godkendt.</p></div>';
}

function renderHead(mon) {
  var h = '<header class="tb-head"><div class="tb-brand">' + logo(52) + '<div>' +
    '<div class="name"><b>Familio</b><span>· ' + esc((S.family.name || '').toUpperCase()) + '</span><em class="ver">v' + esc(APP_VERSION) + '</em></div>' +
    '<div class="tb-week"><span class="w">Uge ' + isoWeek(mon) + '</span><span class="r">' + esc(weekRangeLabel(mon)) + '</span></div>' +
    '</div></div>' + renderTodayWx() + '<div class="tb-kids">';
  var mName = MONTHS_SHORT[parseYmd(S.day).getMonth()];
  kids().forEach(function (k) {
    var p = pal(k), pt = points(k.id), g = goals(k.id);
    h += '<button class="kidcard" data-a="kid" data-kid="' + esc(k.id) + '" aria-label="Se hvordan det går for ' + esc(k.name) + '">' + avatar(k, 40) + '<div class="info"><span class="nm">' + esc(k.name) + '</span>' +
      '<div class="row"><span style="width:34px;color:var(--muted)">Uge</span><div class="bar"><i style="width:' + pct(pt.week, g.weekPts) + '%;background:' + p.color + '"></i></div><span style="color:' + p.text + '">' + pt.week + '/' + g.weekPts + '</span></div>' +
      '<div class="row"><span style="width:34px;color:var(--muted)">' + esc(mName.charAt(0).toUpperCase() + mName.slice(1)) + '</span><div class="bar"><i style="width:' + pct(pt.month, g.monthPts) + '%;background:' + p.color + '"></i></div><span style="color:' + p.text + '">' + pt.month + '/' + g.monthPts + '</span></div>' +
      '</div></button>';
  });
  return h + '</div></header>';
}

function renderTodayWx() {
  var data = wx(), w = dayWeather(data, S.day);
  if (!w) { return '<div class="tb-wx empty"></div>'; }
  var c = data.cur || {};
  var code = typeof c.code === 'number' ? c.code : w.code;
  var loc = weatherLoc(S.family);
  return '<div class="tb-wx" aria-label="Dagens vejr i ' + esc(loc.name) + '">' + wxIcon(code, 52, c.day === false) +
    '<div class="wx-txt"><span class="label">Dagens vejr · ' + esc(loc.name) + '</span>' +
    '<div class="wx-now"><b>' + deg(typeof c.t === 'number' ? c.t : w.max) + '</b><span>' + esc(wxText(code)) + '</span></div>' +
    '<div class="wx-range">' + deg(w.max) + ' / ' + deg(w.min) + (typeof w.rain === 'number' ? ' · ' + rainDrop() + Math.round(w.rain) + '%' : '') + '</div></div></div>';
}
function rainDrop() { return '<svg width="11" height="11" viewBox="0 0 24 24" aria-label="Regnrisiko" role="img"><path fill="#2F6FDE" d="M12 2.5l5.5 7.5a7 7 0 1 1-11 0z"/></svg>'; }

function choreRows() {
  // Fælles pligter: én række pr. pligt. Personlige: samles i rækker med én knap pr. barn.
  var ks = kids();
  var rows = [];
  chores().forEach(function (c) {
    var ck = (c.kids || []).filter(function (id) { return ks.some(function (k) { return k.id === id; }); });
    if (ck.length > 1) { rows.push({ icon: c.icon || 'star', label: c.label, cells: ks.map(function (k) { return ck.indexOf(k.id) >= 0 ? { chore: c, kid: k } : null; }) }); }
  });
  var personal = {};
  var maxN = 0;
  ks.forEach(function (k) {
    personal[k.id] = chores().filter(function (c) { return (c.kids || []).length === 1 && c.kids[0] === k.id; });
    maxN = Math.max(maxN, personal[k.id].length);
  });
  for (var i = 0; i < maxN; i++) {
    var cells = ks.map(function (k) { var c = personal[k.id][i]; return c ? { chore: c, kid: k } : null; });
    var used = cells.filter(Boolean);
    var same = used.length === 1;
    rows.push({ icon: same ? (used[0].chore.icon || 'star') : 'star', label: used.map(function (x) { return x.kid.short + ': ' + x.chore.label; }).join(', '), cells: cells });
  }
  return rows;
}

function kidBtn(date, cell) {
  if (!cell) { return '<span class="kbtn empty"></span>'; }
  var on = isDone(date, cell.chore.id, cell.kid.id);
  var p = pal(cell.kid);
  var st = on ? 'background:' + p.color + ';border-color:' + p.color + ';color:#fff' : 'color:' + p.text;
  return '<button class="kbtn' + lockCls(date, on) + '" style="' + st + '" data-a="chore" data-date="' + date + '" data-chore="' + esc(cell.chore.id) + '" data-kid="' + esc(cell.kid.id) +
    '" aria-pressed="' + on + '" aria-label="' + esc(cell.chore.label + ' – ' + cell.kid.name) + '">' + (on ? '✓ ' : '') + esc(cell.kid.short) + '</button>';
}

function actChip(o) {
  var m = memberById(S.family, o.ev.who), p = pal(m);
  var st = o.cancelled ? 'background:#EFEDE8;color:var(--muted)' : 'background:' + p.tint + ';color:' + p.text;
  var h = '<div class="act' + (o.cancelled ? ' x' : '') + '" style="' + st + '"><span class="t">' + esc(o.ev.title) + ' · ' + esc(m.short) + '</span>' +
    '<span class="s">' + (o.cancelled ? 'Aflyst' : esc(timeLabel(o.ev))) + '</span>';
  if (o.driver && !o.cancelled) { h += '<span class="drv">' + icon('car', 13, 2.2) + esc(o.driver) + '</span>'; }
  return h + '</div>';
}

function renderWeek(mon) {
  var rows = choreRows();
  var n = kids().length;
  var data = wx();
  var h = '<div class="grid7">';
  weekDays(mon).forEach(function (d, i) {
    var ds = ymd(d), isToday = ds === S.day;
    var evs = eventsOn(S.events, ds, { tabletOnly: true });
    h += '<section class="daycol' + (isToday ? ' today' : '') + '" aria-label="' + DAY_NAMES[i] + '">' +
      '<div class="dayhead"><div><div class="d">' + DAY_NAMES[i] + '</div><div class="dt">' + esc(shortDate(d)) + '</div></div>' +
      (isToday ? '<span class="tag-today">I DAG</span>' : '') + '</div>';
    h += dayBadge(data, ds, 26);
    h += '<div class="meal"><span class="label">Aftensmad</span><span class="t">' + (S.meals[ds] ? esc(S.meals[ds]) : '<span class="none">Ikke planlagt</span>') + '</span></div>';
    h += '<div class="acts"><span class="label" style="font-size:10px">Aktiviteter</span>';
    if (!evs.length) { h += '<span class="none">Ingen</span>'; }
    evs.forEach(function (o) { h += actChip(o); });
    h += '</div><div class="chores"><span class="label" style="font-size:10px">Pligter</span>';
    kids().forEach(function (k) {
      var p = pal(k);
      var mine = chores().filter(function (c) { return (c.kids || []).indexOf(k.id) >= 0; });
      var n = 0, dots = '';
      mine.forEach(function (c) {
        var on = isDone(ds, c.id, k.id);
        if (on) { n++; }
        dots += '<i style="' + (on ? 'background:' + p.color + ';border-color:' + p.color : 'border-color:' + p.color) + '"></i>';
      });
      h += '<button class="cstat" style="background:' + p.tint + ';color:' + p.text + '" data-a="goday" data-date="' + ds + '" aria-label="' + esc(k.name + ', ' + DAY_NAMES[i] + ': ' + n + ' af ' + mine.length + ' pligter klaret') + '">' +
        '<span class="cs-top"><b>' + esc(k.short) + '</b><span>' + n + '/' + mine.length + '</span></span><span class="dots">' + dots + '</span></button>';
    });
    h += '</div></section>';
  });
  return h + '</div>';
}

function renderDay() {
  var ds = S.selDay;
  var d = parseYmd(ds);
  var mon = mondayOf(parseYmd(S.day));
  var data = wx();
  var h = '<div class="daytabs">';
  weekDays(mon).forEach(function (x, i) {
    var xs = ymd(x), xw = dayWeather(data, xs);
    h += '<button class="chip" data-a="day" data-date="' + xs + '" aria-pressed="' + (xs === ds) + '">' + (xw ? wxIcon(xw.code, 24) : '') + (xs === S.day ? 'I dag' : DAY_SHORT[i] + ' ' + x.getDate() + '.') + '</button>';
  });
  h += '</div><div class="dayview">';
  // venstre: dato, aftensmad, program
  var evs = eventsOn(S.events, ds, { tabletOnly: true });
  h += '<div class="dv-left"><div class="dv-date"><span class="display">' + esc(DAY_NAMES[(d.getDay() + 6) % 7]) + '</span><span>' + d.getDate() + '. ' + esc(monthName(d)) + '</span></div>' + dayWxLine(dayWeather(data, ds)) +
    '<div class="dv-meal">' + icon('food', 30, 1.8) + '<div><span class="label" style="color:var(--meal-text)">Aftensmad</span><b>' + esc(S.meals[ds] || 'Ikke planlagt') + '</b></div></div>' +
    '<div class="label">Program</div><div class="dv-prog">';
  if (!evs.length) { h += '<div class="none" style="font-size:16px;padding:8px 0">Ingen aktiviteter i dag</div>'; }
  evs.forEach(function (o) {
    var m = memberById(S.family, o.ev.who), p = pal(m), x = o.cancelled;
    var pack = o.ev.pack || [];
    var nP = pack.filter(function (it, j) { return S.packed[packedId(ds, o.ev.id, j)]; }).length;
    h += '<div class="dv-ev' + (x ? ' x' : '') + '" style="' + (x ? 'background:#EFEDE8;color:var(--muted)' : 'background:' + p.tint + ';color:' + p.text) + '">' +
      '<span class="tm">' + esc(x ? 'Aflyst' : timeLabel(o.ev)) + '</span><div class="mid"><b>' + esc(o.ev.title) + '</b><span>' + esc(m.name) + (o.driver && !x ? ' · ' + o.driver + ' kører' : '') + '</span></div>' +
      (pack.length && !x ? '<button class="packopen" style="width:auto;color:' + p.text + '" data-a="packopen" data-date="' + ds + '" data-ev="' + esc(o.ev.id) + '">' + icon(nP === pack.length ? 'check' : 'bag', 18, 2.2) + (nP === pack.length ? 'Pakket' : 'Pak ' + nP + '/' + pack.length) + '</button>' : '') +
      '</div>';
  });
  h += '</div></div>';
  // højre: pligter pr. barn
  h += '<div class="dv-right" style="grid-template-columns:repeat(' + Math.max(1, kids().length) + ',minmax(0,1fr))">';
  kids().forEach(function (k) {
    var p = pal(k);
    var mine = chores().filter(function (c) { return (c.kids || []).indexOf(k.id) >= 0; });
    var n = mine.filter(function (c) { return isDone(ds, c.id, k.id); }).length;
    h += '<div class="dv-kid"><button class="dv-kidhead" data-a="kid" data-kid="' + esc(k.id) + '">' + avatar(k, 36) + '<b>' + esc(k.name.split(' ')[0]) + '</b><span style="color:' + p.text + '">' + n + '/' + mine.length + '</span></button>';
    mine.forEach(function (c) {
      var on = isDone(ds, c.id, k.id);
      h += '<button class="dv-chore' + lockCls(ds, on) + '" style="' + (on ? 'background:' + p.color + ';color:#fff;border-color:' + p.color : 'background:#fff;color:' + p.text + ';border-color:' + p.tint) + '" data-a="chore" data-date="' + ds + '" data-chore="' + esc(c.id) + '" data-kid="' + esc(k.id) + '" aria-pressed="' + on + '">' +
        icon(c.icon || 'star', 22, 2) + '<span class="l">' + esc(c.label) + '</span><span class="p">' + (on ? '✓' : '+' + c.pts) + '</span></button>';
    });
    h += '</div>';
  });
  return h + '</div></div>';
}

function dayWxLine(w) {
  if (!w) { return ''; }
  return '<div class="dv-wx">' + wxIcon(w.code, 34) + '<b>' + esc(wxText(w.code)) + '</b><span>' + deg(w.max) + ' / ' + deg(w.min) +
    (typeof w.rain === 'number' ? ' · ' + rainDrop() + ' ' + Math.round(w.rain) + '% regn' : '') + '</span></div>';
}

function renderMeals(mon) {
  var h = '<div class="grid7 meals7">';
  weekDays(mon).forEach(function (d, i) {
    var ds = ymd(d);
    h += '<div class="mcard' + (ds === S.day ? ' today' : '') + '"><div><div class="d">' + DAY_NAMES[i] + '</div><div class="dt">' + esc(shortDate(d)) + '</div></div>' +
      icon('food', 40, 1.6) + '<div class="t">' + (S.meals[ds] ? esc(S.meals[ds]) : '<span style="opacity:.5">Ikke planlagt</span>') + '</div></div>';
  });
  return h + '</div>';
}

function renderChores(mon) {
  var h = '<div class="daytabs">';
  weekDays(mon).forEach(function (d, i) {
    var ds = ymd(d);
    h += '<button class="chip" data-a="day" data-date="' + ds + '" aria-pressed="' + (ds === S.selDay) + '">' + DAY_SHORT[i] + ' ' + d.getDate() + '.</button>';
  });
  h += '</div><div class="panels" style="grid-template-columns:repeat(' + Math.max(1, kids().length) + ',minmax(0,1fr))">';
  var mName = monthName(parseYmd(S.day));
  kids().forEach(function (k) {
    var p = pal(k), pt = points(k.id), g = goals(k.id);
    var mine = chores().filter(function (c) { return (c.kids || []).indexOf(k.id) >= 0; });
    var dayPts = 0;
    mine.forEach(function (c) { if (isDone(S.selDay, c.id, k.id)) { dayPts += +c.pts || 0; } });
    h += '<div class="panel"><div class="panel-head">' + avatar(k, 48) + '<span class="nm">' + esc(k.name) + '</span>' +
      '<div class="pts"><b style="color:' + p.text + '">' + pt.week + ' / ' + g.weekPts + ' p denne uge</b><span>' + pt.month + ' p i ' + esc(mName) + ' · +' + dayPts + ' den valgte dag</span></div></div>';
    h += '<div class="tiles">';
    mine.forEach(function (c) {
      var on = isDone(S.selDay, c.id, k.id);
      var st = on ? 'background:' + p.color + ';border-color:' + p.color + ';color:#fff' : 'background:' + p.tint + ';border-color:' + p.tint + ';color:' + p.text;
      h += '<button class="tile' + lockCls(S.selDay, on) + '" style="' + st + '" data-a="chore" data-date="' + S.selDay + '" data-chore="' + esc(c.id) + '" data-kid="' + esc(k.id) +
        '" aria-pressed="' + on + '">' + icon(c.icon || 'star', 40, 1.8) + '<span class="l">' + esc(c.label) + '</span><span class="s">' + (on ? '✓ Klaret!' : '+' + c.pts + ' point') + '</span></button>';
    });
    h += '</div></div>';
  });
  return h + '</div>';
}

function renderActs(mon) {
  var h = '<div class="legend">';
  ((S.family && S.family.members) || []).forEach(function (m) {
    var p = pal(m);
    h += '<span style="background:' + p.tint + ';color:' + p.text + '">' + esc(m.name) + '</span>';
  });
  // Dage med aktiviteter får dobbelt bredde, så huskelisterne kan læses
  var data = wx();
  var cols = weekDays(mon).map(function (d) { return eventsOn(S.events, ymd(d), { tabletOnly: true }).length ? '1.6fr' : '1fr'; });
  h += '</div><div class="grid7" style="height:auto;flex:1;min-height:0;grid-template-columns:' + cols.map(function (c) { return 'minmax(0,' + c + ')'; }).join(' ') + '">';
  weekDays(mon).forEach(function (d, i) {
    var ds = ymd(d);
    var evs = eventsOn(S.events, ds, { tabletOnly: true });
    h += '<section class="daycol' + (ds === S.day ? ' today' : '') + '"><div><div class="dayhead"><div><div class="d" style="font-size:20px">' + DAY_NAMES[i] + '</div><div class="dt">' + esc(shortDate(d)) + '</div></div></div>' + dayBadge(data, ds, 26) + '</div>';
    if (!evs.length) { h += '<span class="none" style="font-size:14px">Ingen aktiviteter</span>'; }
    evs.forEach(function (o) {
      var m = memberById(S.family, o.ev.who), p = pal(m);
      var x = o.cancelled;
      var st = x ? 'background:#EFEDE8;color:var(--muted)' : 'background:' + p.tint + ';color:' + p.text;
      var pack = (o.ev.pack || []);
      var allPacked = pack.length > 0 && pack.every(function (it, j) { return S.packed[packedId(ds, o.ev.id, j)]; });
      h += '<div class="bigact' + (x ? ' x' : '') + '" style="' + st + '"><div class="top"><span>' + esc(timeLabel(o.ev)) + '</span>' +
        (x ? '<span class="pill" style="background:var(--ink);color:#fff">AFLYST</span>' : '') +
        (allPacked && !x ? '<span class="pill" style="background:#fff">✓ PAKKET</span>' : '') + '</div>' +
        '<span class="t">' + esc(o.ev.title) + '</span><span class="w">' + esc(m.name) + '</span>';
      if (o.driver && !x) { h += '<span class="drv">' + icon('car', 16, 2.2) + 'Kører: ' + esc(o.driver) + '</span>'; }
      if (pack.length && !x) {
        var nP = pack.filter(function (it, j) { return S.packed[packedId(ds, o.ev.id, j)]; }).length;
        h += '<button class="packopen" style="color:' + p.text + '" data-a="packopen" data-date="' + ds + '" data-ev="' + esc(o.ev.id) + '">' +
          icon(allPacked ? 'check' : 'bag', 18, 2.2) + '<span>' + (allPacked ? 'Pakket' : 'Pak ' + nP + '/' + pack.length) + '</span></button>';
      }
      h += '</div>';
    });
    h += '</section>';
  });
  return h + '</div>';
}

function renderNav() {
  var tabs = [['dag', 'sun', 'I dag'], ['uge', 'calendar', 'Uge'], ['mad', 'food', 'Madplan'], ['pligter', 'star', 'Pligter'], ['akt', 'clock', 'Aktiviteter']];
  var h = '<nav class="tb-nav" aria-label="Visning"><div class="inner">';
  tabs.forEach(function (t) {
    h += '<button data-a="view" data-v="' + t[0] + '" aria-pressed="' + (S.view === t[0]) + '">' + icon(t[1], 22, 2.2) + t[2] + '</button>';
  });
  return h + '</div></nav>';
}

function renderSaver() {
  var now = new Date();
  // flyt uret lidt hvert minut, så skærmen ikke brænder ind
  var m = now.getMinutes();
  var dx = ((m * 37) % 60) - 30, dy = ((m * 23) % 40) - 20;
  var t = S.day;
  var next = eventsOn(S.events, t, { tabletOnly: true }).filter(function (o) {
    return !o.cancelled && (o.ev.allDay || (o.ev.to || o.ev.from || '') >= pad(now.getHours()) + ':' + pad(now.getMinutes()));
  })[0];
  return '<button class="saver" data-a="wake" aria-label="Tryk for at vække skærmen"><div style="transform:translate(' + dx + 'vw,' + dy + 'vh);display:flex;flex-direction:column;align-items:center;gap:10px">' +
    '<div class="clock">' + pad(now.getHours()) + '.' + pad(now.getMinutes()) + '</div>' +
    '<div class="sub">' + esc(DAY_NAMES[(now.getDay() + 6) % 7]) + ' ' + now.getDate() + '. ' + esc(monthName(now)) + '</div>' +
    saverWx() +
    (next ? '<div class="sub" style="font-size:18px">Næste: ' + esc(memberById(S.family, next.ev.who).name + ' · ' + next.ev.title + ' ' + timeLabel(next.ev)) + '</div>' : '') +
    '<div class="hintn">Tryk for at vække</div></div></button>';
}

function saverWx() {
  var data = wx(), w = dayWeather(data, S.day);
  if (!w) { return ''; }
  var c = data.cur || {}, code = typeof c.code === 'number' ? c.code : w.code;
  return '<div class="saver-wx">' + wxIcon(code, 44, c.day === false) + '<b>' + deg(typeof c.t === 'number' ? c.t : w.max) + '</b><span>' + esc(wxText(code)) + ' · ' + deg(w.max) + ' / ' + deg(w.min) + '</span></div>';
}

function renderNight() {
  var now = new Date();
  var early = now.getHours() < 12;
  var target = early ? parseYmd(S.day) : addDays(parseYmd(S.day), 1);
  var ts = ymd(target);
  var evs = eventsOn(S.events, ts, { tabletOnly: true }).filter(function (o) { return !o.cancelled; });
  var h = '<button class="night" data-a="wake" aria-label="Væk skærmen">' + icon('moon', 40, 1.8) +
    '<div><div class="clock">' + pad(now.getHours()) + '.' + pad(now.getMinutes()) + '</div>' +
    '<div class="sub">' + (early ? 'Godmorgen' : 'God nat') + ' · ' + esc(DAY_NAMES[(now.getDay() + 6) % 7]) + ' ' + now.getDate() + '. ' + esc(monthName(now)) + '</div></div>' +
    '<div class="tomorrow"><span class="label" style="color:#8A90A2">' + (early ? 'I dag' : 'I morgen') + ' · ' + esc(DAY_NAMES[(target.getDay() + 6) % 7]) + '</span>';
  evs.forEach(function (o) {
    var m = memberById(S.family, o.ev.who);
    h += '<div class="row"><span>' + esc(m.name) + ' · ' + esc(o.ev.title) + '</span><span>' + esc(timeLabel(o.ev)) + (o.driver ? ' · ' + esc(o.driver) + ' kører' : '') + '</span></div>';
  });
  var tw = dayWeather(wx(), ts);
  if (tw) { h += '<div class="row"><span>Vejret</span><span class="nwx">' + wxIcon(tw.code, 26) + esc(wxText(tw.code)) + ' · ' + deg(tw.max) + ' / ' + deg(tw.min) + '</span></div>'; }
  h += '<div class="row"><span>Aftensmad</span><span>' + esc(S.meals[ts] || 'Ikke planlagt') + '</span></div></div>' +
    '<span class="hintn">Nattilstand ' + esc(((S.family.settings || {}).nightFrom || '21:00').replace(':', '.')) + '–' + esc(((S.family.settings || {}).nightTo || '06:00').replace(':', '.')) + ' · tryk for at vække skærmen</span></button>';
  return h;
}

function renderCele() {
  var c = S.cele;
  if (!c) { overlay.innerHTML = ''; return; }
  var k = memberById(S.family, c.kid), p = pal(k);
  overlay.innerHTML = '<div class="overlay">' + confettiHtml(c.big ? 80 : 48) +
    '<div class="cele" role="alertdialog" aria-live="assertive" aria-label="' + esc(c.head) + '">' + avatar(k, 84) +
    '<div class="h" style="color:' + p.text + '">' + esc(c.head) + '</div><div class="b">' + esc(c.body) + '</div>' +
    (c.reward ? '<div class="reward">' + icon('trophy', 24, 2) + esc(c.reward) + '</div>' : '') +
    '<div class="sub">' + esc(c.task) + ' · ' + c.week + ' p denne uge · ' + c.month + ' p i ' + esc(monthName(parseYmd(S.day))) + '</div>' +
    '<div class="btns"' + (c.bonus ? ' style="grid-template-columns:1fr"' : '') + '>' + (c.bonus ? '' : '<button class="btn secondary" data-a="undo">' + icon('undo', 20, 2.4) + 'Fortryd</button>') +
    '<button class="btn" style="background:' + p.color + '" data-a="close">' + (c.bonus ? 'Tak!' : 'Super!') + '</button></div></div></div>';
}

// ---------- Paneler (barnets overblik, huskeliste) ----------
var panelEl = document.createElement('div');
document.body.appendChild(panelEl);

function renderPanel() {
  var pn = S.panel;
  if (!pn || !S.family) { panelEl.innerHTML = ''; return; }
  panelEl.innerHTML = '<div class="overlay" data-a="panel-bg">' + (pn.kind === 'kid' ? kidPanel(pn.kid) : packPanel(pn.date, pn.ev)) + '</div>';
}

function kidPanel(kidId) {
  var k = memberById(S.family, kidId), p = pal(k), g = goals(kidId), pt = points(kidId);
  var t = parseYmd(S.day), mon = mondayOf(t);
  function goalCard(title, val, goal, reward) {
    var left = Math.max(0, goal - val);
    return '<div class="gcard" style="background:' + p.tint + ';color:' + p.text + '"><span class="label" style="color:inherit">' + esc(title) + '</span>' +
      '<div><b class="big">' + val + '</b><span class="of"> / ' + goal + ' point</span></div>' +
      '<div class="bar big"><i style="width:' + pct(val, goal) + '%;background:' + p.color + '"></i></div>' +
      '<span class="st">' + (goal && left === 0 ? icon('trophy', 18, 2.2) + ' Mål nået!' : 'Mangler ' + left + ' point') + '</span>' +
      (reward ? '<span class="rw">Belønning: ' + esc(reward) + '</span>' : '') + '</div>';
  }
  var h = '<div class="panel-card" role="dialog" aria-modal="true" aria-label="' + esc(k.name) + '">' +
    '<div class="panel-top">' + avatar(k, 64) + '<b class="display" style="font-size:30px;flex:1">' + esc(k.name) + '</b>' +
    '<button class="btn secondary" data-a="panel-close">Luk</button></div>' +
    '<div class="gcards">' + goalCard('Denne uge', pt.week, g.weekPts, g.weekReward) + goalCard(monthName(t).charAt(0).toUpperCase() + monthName(t).slice(1), pt.month, g.monthPts, g.monthReward) + '</div>';
  // point pr. dag
  var days = weekDays(mon).map(function (d) { var ds = ymd(d); return { d: d, ds: ds, v: sumPoints(S.completions, S.adjustments, kidId, ds, ds) }; });
  var max = Math.max(30, Math.max.apply(null, days.map(function (x) { return x.v; })));
  h += '<div class="label">Point pr. dag i denne uge</div><div class="daybars">';
  days.forEach(function (x, i) {
    var future = x.ds > S.day;
    h += '<div class="db' + (x.ds === S.day ? ' today' : '') + '"><span class="v">' + (future ? '' : x.v) + '</span><div class="col"><i style="height:' + Math.round(x.v / max * 100) + '%;background:' + p.color + '"></i></div><span class="d">' + DAY_SHORT[i] + '</span></div>';
  });
  h += '</div>';
  // daglige opgaver (pligter kun for dette barn)
  var daily = chores().filter(function (c) { return (c.kids || []).length === 1 && c.kids[0] === kidId; });
  var passed = days.filter(function (x) { return x.ds <= S.day; });
  if (daily.length) {
    h += '<div class="label">Daglige opgaver i denne uge</div><div class="dailies">';
    daily.forEach(function (c) {
      var n = passed.filter(function (x) { return isDone(x.ds, c.id, kidId); }).length;
      h += '<div class="daily">' + icon(c.icon || 'star', 22, 2) + '<b>' + esc(c.label) + '</b><span>' + n + ' af ' + passed.length + ' dage</span><span class="ticks">';
      days.forEach(function (x) { h += '<i class="' + (x.ds > S.day ? 'f' : isDone(x.ds, c.id, kidId) ? 'y' : 'n') + '" style="' + (isDone(x.ds, c.id, kidId) ? 'background:' + p.color : '') + '"></i>'; });
      h += '</span></div>';
    });
    h += '</div>';
  }
  return h + '</div>';
}

function packPanel(ds, evId) {
  var ev = S.events.filter(function (e) { return e.id === evId; })[0];
  if (!ev) { return ''; }
  var m = memberById(S.family, ev.who), p = pal(m);
  var h = '<div class="panel-card" role="dialog" aria-modal="true" aria-label="Huskeliste" style="width:560px">' +
    '<div class="panel-top"><div style="flex:1"><b class="display" style="font-size:28px">Husk at pakke</b><div class="muted" style="font-weight:700">' +
    esc(ev.title + ' · ' + m.name + ' · ' + DAY_NAMES[(parseYmd(ds).getDay() + 6) % 7].toLowerCase() + ' ' + timeLabel(ev)) + '</div></div>' +
    '<button class="btn secondary" data-a="panel-close">Luk</button></div><div class="packlist">';
  (ev.pack || []).forEach(function (it, j) {
    var on = !!S.packed[packedId(ds, ev.id, j)];
    h += '<button class="packbig' + (on ? ' on' : '') + '" style="background:' + (on ? p.tint : '#fff') + ';color:' + p.text + '" data-a="pack" data-date="' + ds + '" data-ev="' + esc(ev.id) + '" data-idx="' + j + '" aria-pressed="' + on + '">' +
      '<span class="box" style="border-color:' + p.color + ';background:' + (on ? p.color : '#fff') + '">' + (on ? '✓' : '') + '</span><span class="lbl">' + esc(it) + '</span></button>';
  });
  return h + '</div></div>';
}

// Ny bonus fra en forælder → fejring på tavlen
function checkBonus(list) {
  if (!S.seenAdj) { S.seenAdj = {}; list.forEach(function (a) { S.seenAdj[a.id] = true; }); return; }
  list.forEach(function (a) {
    if (S.seenAdj[a.id]) { return; }
    S.seenAdj[a.id] = true;
    if (!(a.pts > 0) || a.kind === 'fix' || Date.now() - (a.at || 0) > 10 * 60 * 1000) { return; }
    var k = memberById(S.family, a.kid);
    var pt = points(a.kid);
    S.cele = {
      key: a.id, kid: a.kid, bonus: true, head: 'Bonus fra ' + (a.byName || 'mor og far') + '!',
      body: (a.reason ? a.reason + ' · ' : '') + '+' + a.pts + ' point til ' + k.name, task: 'Bonus', reward: '', big: a.pts >= 20,
      week: pt.week, month: pt.month
    };
    renderCele();
    sfx('bonus');
    clearTimeout(celeTimer);
    celeTimer = setTimeout(function () { if (S.cele && S.cele.key === a.id) { S.cele = null; renderCele(); } }, 9000);
  });
}

// ---------- Handlinger ----------
var celeTimer = null;

// Børnene kan kun krydse pligter af (og fortryde) på selve dagen. Glemte pligter klarer forældrene med bonus.
function lockCls(date, on) { return date === S.day ? '' : ' locked' + (on ? '' : ' dim'); }

function toggleChore(date, choreId, kidId) {
  if (date !== S.day) {
    var t = document.createElement('div');
    t.className = 'toast'; t.textContent = 'Pligter kan kun krydses af i dag';
    document.body.appendChild(t);
    setTimeout(function () { if (t.parentNode) { t.parentNode.removeChild(t); } }, 2500);
    return;
  }
  var chore = chores().filter(function (c) { return c.id === choreId; })[0];
  if (!chore) { return; }
  var id = completionId(date, choreId, kidId);
  if (isDone(date, choreId, kidId)) {
    store.del(F('completions/' + id)).catch(report);
    return;
  }
  var before = points(kidId);
  var g = goals(kidId);
  var pts = +chore.pts || 0;
  var b = periodBounds(parseYmd(S.day));
  var inWeek = date >= b.weekFrom && date <= b.weekTo;
  var inMonth = date >= b.monthFrom && date <= b.monthTo;
  store.set(F('completions/' + id), { date: date, chore: choreId, kid: kidId, pts: pts, at: Date.now(), by: 'tablet' }).catch(report);
  var k = memberById(S.family, kidId);
  var head = pick(HEADS) + ', ' + k.name + '!';
  var reward = '', big = false;
  if (inMonth && g.monthPts && before.month < g.monthPts && before.month + pts >= g.monthPts) {
    head = 'Månedens mål nået, ' + k.name + '!'; reward = g.monthReward || 'Månedens belønning er din!'; big = true;
  } else if (inWeek && g.weekPts && before.week < g.weekPts && before.week + pts >= g.weekPts) {
    head = 'Ugens mål nået, ' + k.name + '!'; reward = g.weekReward || 'Ugens belønning er din!'; big = true;
  }
  S.cele = {
    key: id, kid: kidId, head: head, body: pick(BODIES).replace('{p}', pts), task: chore.label, reward: reward, big: big,
    week: before.week + (inWeek ? pts : 0), month: before.month + (inMonth ? pts : 0)
  };
  renderCele();
  sfx(big ? 'goal' : 'done');
  clearTimeout(celeTimer);
  celeTimer = setTimeout(function () { if (S.cele && S.cele.key === id) { S.cele = null; renderCele(); } }, big ? 9000 : 5000);
}

function report(e) {
  console.error(e);
  var t = document.createElement('div');
  t.className = 'toast'; t.textContent = 'Kunne ikke gemme – tjek internettet';
  document.body.appendChild(t);
  setTimeout(function () { if (t.parentNode) { t.parentNode.removeChild(t); } }, 3000);
}

function onClick(e) {
  var el = e.target.closest ? e.target.closest('[data-a]') : null;
  if (!el) { return; }
  var a = el.getAttribute('data-a');
  if (a === 'view') { S.view = el.getAttribute('data-v'); if (S.view === 'dag') { S.selDay = S.day; } render(); }
  else if (a === 'day') { S.selDay = el.getAttribute('data-date'); render(); }
  else if (a === 'goday') { S.selDay = el.getAttribute('data-date'); S.view = 'pligter'; render(); }
  else if (a === 'kid') { S.panel = { kind: 'kid', kid: el.getAttribute('data-kid') }; renderPanel(); }
  else if (a === 'packopen') { S.panel = { kind: 'pack', date: el.getAttribute('data-date'), ev: el.getAttribute('data-ev') }; renderPanel(); }
  else if (a === 'panel-close') { S.panel = null; renderPanel(); }
  else if (a === 'panel-bg') { if (e.target === el) { S.panel = null; renderPanel(); } }
  else if (a === 'chore') { toggleChore(el.getAttribute('data-date'), el.getAttribute('data-chore'), el.getAttribute('data-kid')); }
  else if (a === 'pack') {
    var date = el.getAttribute('data-date');
    var id = packedId(date, el.getAttribute('data-ev'), el.getAttribute('data-idx'));
    if (S.packed[id]) { store.del(F('packed/' + id)).catch(report); }
    else {
      store.set(F('packed/' + id), { date: date, at: Date.now() }).catch(report);
      var ev0 = S.events.filter(function (x) { return x.id === el.getAttribute('data-ev'); })[0];
      var rest = ((ev0 && ev0.pack) || []).filter(function (it, j) { var pid = packedId(date, ev0.id, j); return pid !== id && !S.packed[pid]; }).length;
      sfx(rest === 0 ? 'packed' : 'tick');
    }
  }
  else if (a === 'undo') {
    sfx('undo');
    if (S.cele && !S.cele.bonus) { store.del(F('completions/' + S.cele.key)).catch(report); }
    S.cele = null; renderCele();
  }
  else if (a === 'close') { S.cele = null; renderCele(); }
  else if (a === 'wake') {
    if (isNight()) { S.wakeUntil = Date.now() + 3 * 60 * 1000; setTimeout(render, 3 * 60 * 1000 + 500); }
    lastActive = Date.now(); requestWake(); setTimeout(render, 0);
  }
  else if (a === 'tablet-google') {
    store.signInGoogle().catch(function (e) { renderTabletLogin('Login mislykkedes (' + ((e && (e.code || e.message)) || e) + ')'); });
  }
  else if (a === 'demo-reset') { if (confirmReset()) { store.reset(); } }
}

function confirmReset() { return window.confirm ? window.confirm('Nulstil demo-data?') : true; }

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(function () {});
}

boot();
