// Familio – tablet-visningen (låst iPad i køkkenet). Ingen login for børnene.
import { createStore, DEMO } from './store.js';
import {
  ymd, parseYmd, today, addDays, mondayOf, weekDays, isoWeek, weekRangeLabel, DAY_NAMES, DAY_SHORT,
  eventsOn, timeLabel, sumPoints, periodBounds, completionId, packedId, memberById, kidsOf, inNight,
  shortDate, monthName, MONTHS_SHORT, pad, randomCode
} from './model.js';
import { esc, pal, icon, logo, avatar, confettiHtml, pick } from './ui.js';

var store;
var S = {
  fid: null, linkChecked: false, pairCode: '', seenAdj: null,
  user: null, family: null, famError: null, paired: true, events: [], meals: {}, completions: [], adjustments: [], packed: {},
  view: 'uge', selDay: ymd(today()), day: ymd(today()), cele: null, wakeUntil: 0, nightShown: false
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
      if (!u) { store.signInAnon().catch(showFatal); return; }
      S.user = u;
      watchLink();
    });
  }).catch(showFatal);
  document.addEventListener('click', onClick);
  setInterval(tick, 20000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { tick(); requestWake(); } });
  requestWake();
}

function showFatal(e) {
  app.innerHTML = '<div class="center-screen">' + logo(72) + '<b class="display" style="font-size:24px">Familio kunne ikke starte</b><p class="muted">' +
    esc((e && e.message) || e) + '</p><button class="btn" onclick="location.reload()">Prøv igen</button></div>';
}

function requestWake() {
  try {
    if (navigator.wakeLock && !document.hidden) { navigator.wakeLock.request('screen').catch(function () {}); }
  } catch (e) { /* ikke understøttet */ }
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
      requestPairing();
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
  var night = isNight();
  if (night || night !== S.nightShown) { render(); }
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
  if (S.view === 'uge') { html += renderWeek(mon); }
  else if (S.view === 'mad') { html += renderMeals(mon); }
  else if (S.view === 'pligter') { html += renderChores(mon); }
  else { html += renderActs(mon); }
  html += '</main>';
  html += renderNav();
  html += '</div>';
  if (isNight()) { html += renderNight(); S.nightShown = true; }
  app.innerHTML = html;
}

function renderPairing() {
  return '<div class="center-screen">' + logo(88) +
    '<b class="display" style="font-size:30px">Tilknyt denne tablet</b>' +
    '<p class="muted" style="font-size:18px;max-width:560px">Åbn Familio på din telefon › Indstillinger › Tablets › <b>Tilknyt tablet</b>, og skriv koden herunder.</p>' +
    '<div class="display" style="font-size:64px;letter-spacing:.15em;background:#fff;border-radius:20px;padding:14px 28px">' + esc(S.pairCode || '······') + '</div>' +
    '<p class="muted">Siden opdaterer automatisk, når den er godkendt.</p></div>';
}

function renderHead(mon) {
  var h = '<header class="tb-head"><div class="tb-brand">' + logo(52) + '<div>' +
    '<div class="name"><b>Familio</b><span>· ' + esc((S.family.name || '').toUpperCase()) + '</span></div>' +
    '<div class="tb-week"><span class="w">Uge ' + isoWeek(mon) + '</span><span class="r">' + esc(weekRangeLabel(mon)) + '</span></div>' +
    '</div></div><div class="tb-kids">';
  var mName = MONTHS_SHORT[parseYmd(S.day).getMonth()];
  kids().forEach(function (k) {
    var p = pal(k), pt = points(k.id), g = goals(k.id);
    h += '<div class="kidcard">' + avatar(k, 40) + '<div class="info"><span class="nm">' + esc(k.name) + '</span>' +
      '<div class="row"><span style="width:34px;color:var(--muted)">Uge</span><div class="bar"><i style="width:' + pct(pt.week, g.weekPts) + '%;background:' + p.color + '"></i></div><span style="color:' + p.text + '">' + pt.week + '/' + g.weekPts + '</span></div>' +
      '<div class="row"><span style="width:34px;color:var(--muted)">' + esc(mName.charAt(0).toUpperCase() + mName.slice(1)) + '</span><div class="bar"><i style="width:' + pct(pt.month, g.monthPts) + '%;background:' + p.color + '"></i></div><span style="color:' + p.text + '">' + pt.month + '/' + g.monthPts + '</span></div>' +
      '</div></div>';
  });
  return h + '</div></header>';
}

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
  return '<button class="kbtn" style="' + st + '" data-a="chore" data-date="' + date + '" data-chore="' + esc(cell.chore.id) + '" data-kid="' + esc(cell.kid.id) +
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
  var h = '<div class="grid7">';
  weekDays(mon).forEach(function (d, i) {
    var ds = ymd(d), isToday = ds === S.day;
    var evs = eventsOn(S.events, ds, { tabletOnly: true });
    h += '<section class="daycol' + (isToday ? ' today' : '') + '" aria-label="' + DAY_NAMES[i] + '">' +
      '<div class="dayhead"><div><div class="d">' + DAY_NAMES[i] + '</div><div class="dt">' + esc(shortDate(d)) + '</div></div>' +
      (isToday ? '<span class="tag-today">I DAG</span>' : '') + '</div>';
    h += '<div class="meal"><span class="label">Aftensmad</span><span class="t">' + (S.meals[ds] ? esc(S.meals[ds]) : '<span class="none">Ikke planlagt</span>') + '</span></div>';
    h += '<div class="acts"><span class="label" style="font-size:10px">Aktiviteter</span>';
    if (!evs.length) { h += '<span class="none">Ingen</span>'; }
    evs.forEach(function (o) { h += actChip(o); });
    h += '</div><div class="chores"><span class="label" style="font-size:10px">Pligter</span>';
    rows.forEach(function (r) {
      h += '<div class="crow" style="grid-template-columns:22px repeat(' + n + ',minmax(0,1fr))"><span class="ic" title="' + esc(r.label) + '">' + icon(r.icon, 20, 2) + '</span>';
      r.cells.forEach(function (c) { h += kidBtn(ds, c); });
      h += '</div>';
    });
    h += '</div></section>';
  });
  return h + '</div>';
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
      h += '<button class="tile" style="' + st + '" data-a="chore" data-date="' + S.selDay + '" data-chore="' + esc(c.id) + '" data-kid="' + esc(k.id) +
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
  var cols = weekDays(mon).map(function (d) { return eventsOn(S.events, ymd(d), { tabletOnly: true }).length ? '2fr' : '1fr'; });
  h += '</div><div class="grid7" style="height:auto;flex:1;min-height:0;grid-template-columns:' + cols.map(function (c) { return 'minmax(0,' + c + ')'; }).join(' ') + '">';
  weekDays(mon).forEach(function (d, i) {
    var ds = ymd(d);
    var evs = eventsOn(S.events, ds, { tabletOnly: true });
    h += '<section class="daycol' + (ds === S.day ? ' today' : '') + '"><div><div class="dayhead"><div><div class="d" style="font-size:20px">' + DAY_NAMES[i] + '</div><div class="dt">' + esc(shortDate(d)) + '</div></div></div></div>';
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
        h += '<div class="pack"><span class="label" style="color:inherit;font-size:10px">Husk at pakke</span>';
        pack.forEach(function (it, j) {
          var on = !!S.packed[packedId(ds, o.ev.id, j)];
          h += '<button class="packbtn' + (on ? ' on' : '') + '" style="background:' + (on ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,.55)') + ';color:' + p.text + '" data-a="pack" data-date="' + ds +
            '" data-ev="' + esc(o.ev.id) + '" data-idx="' + j + '" aria-pressed="' + on + '"><span class="box" style="border-color:' + p.color + ';background:' + (on ? p.color : '#fff') + '">' + (on ? '✓' : '') + '</span><span class="lbl">' + esc(it) + '</span></button>';
        });
        h += '</div>';
      }
      h += '</div>';
    });
    h += '</section>';
  });
  return h + '</div>';
}

function renderNav() {
  var tabs = [['uge', 'calendar', 'Uge'], ['mad', 'food', 'Madplan'], ['pligter', 'star', 'Pligter'], ['akt', 'clock', 'Aktiviteter']];
  var h = '<nav class="tb-nav" aria-label="Visning"><div class="inner">';
  tabs.forEach(function (t) {
    h += '<button data-a="view" data-v="' + t[0] + '" aria-pressed="' + (S.view === t[0]) + '">' + icon(t[1], 22, 2.2) + t[2] + '</button>';
  });
  return h + '</div></nav>';
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
    clearTimeout(celeTimer);
    celeTimer = setTimeout(function () { if (S.cele && S.cele.key === a.id) { S.cele = null; renderCele(); } }, 9000);
  });
}

// ---------- Handlinger ----------
var celeTimer = null;

function toggleChore(date, choreId, kidId) {
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
  if (a === 'view') { S.view = el.getAttribute('data-v'); render(); }
  else if (a === 'day') { S.selDay = el.getAttribute('data-date'); render(); }
  else if (a === 'chore') { toggleChore(el.getAttribute('data-date'), el.getAttribute('data-chore'), el.getAttribute('data-kid')); }
  else if (a === 'pack') {
    var date = el.getAttribute('data-date');
    var id = packedId(date, el.getAttribute('data-ev'), el.getAttribute('data-idx'));
    if (S.packed[id]) { store.del(F('packed/' + id)).catch(report); }
    else { store.set(F('packed/' + id), { date: date, at: Date.now() }).catch(report); }
  }
  else if (a === 'undo') {
    if (S.cele && !S.cele.bonus) { store.del(F('completions/' + S.cele.key)).catch(report); }
    S.cele = null; renderCele();
  }
  else if (a === 'close') { S.cele = null; renderCele(); }
  else if (a === 'wake') { S.wakeUntil = Date.now() + 3 * 60 * 1000; render(); setTimeout(render, 3 * 60 * 1000 + 500); }
  else if (a === 'demo-reset') { if (confirmReset()) { store.reset(); } }
}

function confirmReset() { return window.confirm ? window.confirm('Nulstil demo-data?') : true; }

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(function () {});
}

boot();
