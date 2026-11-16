// Familio – forældre-appen (mobil). Katrine og Morten logger ind og styrer det hele herfra.
import { createStore, DEMO, FV } from './store.js';
import { APP_VERSION } from './config.js';
import {
  ymd, parseYmd, today, addDays, mondayOf, weekDays, isoWeek, weekRangeLabel, DAY_NAMES, DAY_2,
  eventsOn, timeLabel, recurrenceLabel, sumPoints, periodBounds, memberById, kidsOf, shortDate, longDate,
  monthName, seedFamily, seedEvents, newId, dow
} from './model.js';
import { esc, pal, icon, logo, avatar, toast } from './ui.js';

var store;
var S = {
  user: null, authReady: false, family: null, famState: 'loading', events: [], meals: {}, completions: [], adjustments: [], pairing: [],
  tab: 'uge', weekMon: mondayOf(today()), sheet: null, form: null, loginErr: '', busy: false
};
var app = document.getElementById('app');
var unsubs = [], famUnsub = null, mealsUnsub = null;
var pendingRender = false;

var EMAIL_KEY = 'familio-email';

function boot() {
  app.innerHTML = '<div class="center-screen"><div class="spinner" aria-label="Indlæser"></div></div>';
  createStore().then(function (st) {
    store = st;
    store.onUser(function (u) {
      S.authReady = true;
      if (u && u.anon) { u = null; }
      S.user = u;
      if (u) { watchFamily(); } else { stopAll(); S.family = null; S.famState = 'loading'; }
      render();
    });
  }).catch(function (e) {
    app.innerHTML = '<div class="center-screen">' + logo(72) + '<b>Familio kunne ikke starte</b><p class="muted">' + esc(e.message || e) + '</p></div>';
  });
  document.addEventListener('click', onClick);
  document.addEventListener('input', onInput);
  document.addEventListener('change', onChange);
  document.addEventListener('submit', onSubmit);
  document.addEventListener('focusout', function () { setTimeout(function () { if (pendingRender && !editing()) { render(); } }, 0); });
}

function stopAll() {
  unsubs.forEach(function (u) { u(); }); unsubs = [];
  if (famUnsub) { famUnsub(); famUnsub = null; }
  if (mealsUnsub) { mealsUnsub(); mealsUnsub = null; }
}

function watchFamily() {
  stopAll();
  S.famState = 'loading';
  famUnsub = store.watchDoc('', function (fam) {
    var first = !S.family;
    S.family = fam;
    S.famState = fam ? 'ok' : 'missing';
    if (fam && first) { subscribeData(); }
    render();
  }, function (err) {
    S.family = null;
    S.famState = (err && /permission/i.test(err.code || err.message || '')) ? 'denied' : 'error';
    S.famErr = err && err.message;
    render();
  });
}

function subscribeData() {
  unsubs.forEach(function (u) { u(); }); unsubs = [];
  var t = today();
  var prevMonth = ymd(new Date(t.getFullYear(), t.getMonth() - 1, 1));
  var from = ymd(addDays(mondayOf(t), -7)) < prevMonth ? ymd(addDays(mondayOf(t), -7)) : prevMonth;
  unsubs.push(store.watchColl('events', null, function (l) { S.events = l; render(); }));
  unsubs.push(store.watchColl('completions', ['date', '>=', from], function (l) { S.completions = l; render(); }));
  unsubs.push(store.watchColl('adjustments', ['date', '>=', from], function (l) { S.adjustments = l; render(); }));
  unsubs.push(store.watchColl('pairing', null, function (l) { S.pairing = l; render(); }, function () { S.pairing = []; }));
  watchMeals();
}

function watchMeals() {
  if (mealsUnsub) { mealsUnsub(); }
  // denne uge + ugen før (til "kopiér sidste uge")
  mealsUnsub = store.watchColl('meals', ['date', '>=', ymd(addDays(S.weekMon, -7))], function (l) {
    var m = {}; l.forEach(function (x) { m[x.id] = x.text || ''; }); S.meals = m; render();
  });
}

function editing() {
  var a = document.activeElement;
  return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && a.type !== 'checkbox' && app.contains(a);
}

// ---------- Render ----------
function render() {
  if (editing()) { pendingRender = true; return; }
  pendingRender = false;
  if (!S.authReady) { return; }
  if (!S.user) { app.innerHTML = renderLogin(); return; }
  if (S.famState === 'loading') { app.innerHTML = '<div class="center-screen"><div class="spinner" aria-label="Indlæser"></div></div>'; return; }
  if (S.famState !== 'ok') { app.innerHTML = renderNoFamily(); return; }
  var scroll = window.scrollY;
  var sheetScroll = document.querySelector('.sheet-body') ? document.querySelector('.sheet-body').scrollTop : 0;
  var h = '';
  if (DEMO) { h += '<div class="demo-band">DEMO – data gemmes kun i denne browser</div>'; }
  h += '<div class="ad">';
  if (S.tab === 'uge') { h += renderWeek(); }
  else if (S.tab === 'mad') { h += renderMeals(); }
  else { h += renderPoints(); }
  h += '</div>' + renderTabbar();
  if (S.sheet) { h += renderSheet(); }
  app.innerHTML = h;
  window.scrollTo(0, scroll);
  var sb = document.querySelector('.sheet-body');
  if (sb) { sb.scrollTop = sheetScroll; }
  document.body.style.overflow = S.sheet ? 'hidden' : '';
}

function renderLogin() {
  var email = '';
  try { email = localStorage.getItem(EMAIL_KEY) || ''; } catch (e) { /* */ }
  return '<div class="login">' + logo(88) +
    '<div style="text-align:center"><div class="display" style="font-size:40px;line-height:1">Familio</div><div class="muted" style="font-weight:700;margin-top:6px">Log ind for at planlægge</div></div>' +
    '<form id="login" autocomplete="on">' +
    '<div class="field"><label for="email">E-mail</label><input class="input" id="email" name="email" type="email" autocomplete="username" required value="' + esc(email) + '"></div>' +
    '<div class="field"><label for="pw">Kode</label><input class="input" id="pw" name="pw" type="password" autocomplete="current-password" required minlength="6"></div>' +
    (S.loginErr ? '<div class="err" role="alert">' + esc(S.loginErr) + '</div>' : '') +
    '<button class="btn block" type="submit" style="height:54px"' + (S.busy ? ' disabled' : '') + '>' + (S.busy ? 'Logger ind…' : 'Log ind') + '</button></form>' +
    '<p class="hint" style="text-align:center">Du forbliver logget ind på denne telefon.</p></div>';
}

function renderNoFamily() {
  var h = '<div class="center-screen">' + logo(72);
  if (S.famState === 'missing' || S.famState === 'denied') {
    h += '<b class="display" style="font-size:26px">Velkommen til Familio</b>' +
      '<p class="muted" style="max-width:380px">Er du den første forælder, så opret familien nu. Ellers skal den anden forælder tilføje <b>' + esc(S.user.email) + '</b> under Indstillinger › Forældre.</p>' +
      '<button class="btn" data-a="create-family"' + (S.busy ? ' disabled' : '') + '>Opret familien</button>';
  } else {
    h += '<b>Der skete en fejl</b><p class="muted">' + esc(S.famErr || '') + '</p>';
  }
  return h + '<button class="btn ghost" data-a="logout">Log ud</button></div>';
}

function renderTop(title, sub, withWeek) {
  var h = '<div class="ad-top"><div class="ad-title"><div class="t"><b>' + esc(title) + '</b><span>' + esc(sub) + '</span></div>' +
    '<button class="roundbtn" data-a="settings" aria-label="Indstillinger">' + icon('gear', 22, 2) + '</button></div>';
  if (withWeek) {
    var isNow = ymd(S.weekMon) === ymd(mondayOf(today()));
    h += '<div class="weeknav"><button class="iconbtn" data-a="week" data-d="-1" aria-label="Forrige uge">' + icon('left', 20, 2.2) + '</button>' +
      '<button class="mid" data-a="week" data-d="0" aria-label="Gå til denne uge"><b>Uge ' + isoWeek(S.weekMon) + (isNow ? ' · denne uge' : '') + '</b><span>' + esc(weekRangeLabel(S.weekMon)) + '</span></button>' +
      '<button class="iconbtn" data-a="week" data-d="1" aria-label="Næste uge">' + icon('right', 20, 2.2) + '</button></div>';
  }
  return h + '</div>';
}

function evRow(o, ds) {
  var m = memberById(S.family, o.ev.who), p = pal(m);
  var st = o.cancelled ? 'background:#EFEDE8;color:var(--muted)' : 'background:' + p.tint + ';color:' + p.text;
  var sub = o.cancelled ? 'Aflyst denne gang' : (o.driver ? 'Kører: ' + o.driver : '');
  if (o.ev.showOnTablet === false) { sub = (sub ? sub + ' · ' : '') + 'Skjult på tablet'; }
  return '<button class="evrow' + (o.cancelled ? ' x' : '') + '" style="' + st + '" data-a="open-ev" data-id="' + esc(o.ev.id) + '" data-date="' + ds + '">' +
    '<span class="l"><span class="t">' + esc(o.ev.title) + ' · ' + esc(m.short) + '</span>' + (sub ? '<span class="s">' + esc(sub) + '</span>' : '') + '</span>' +
    '<span class="r">' + esc(o.cancelled ? '' : timeLabel(o.ev)) + (o.ev.type === 'once' ? ' <span class="pill" style="background:rgba(255,255,255,.7)">ÉN GANG</span>' : icon('repeat', 14, 2.2, 'Gentages')) + '</span></button>';
}

function renderWeek() {
  var h = renderTop('Familio', S.family.name || '', true) + '<div class="ad-body">';
  var td = ymd(today());
  weekDays(S.weekMon).forEach(function (d, i) {
    var ds = ymd(d);
    var evs = eventsOn(S.events, ds);
    h += '<div class="card' + (ds === td ? ' today' : '') + '"><div class="card-head"><b>' + DAY_NAMES[i] + ' <span>' + esc(shortDate(d)) + '</span></b>' +
      '<button class="iconbtn" data-a="new-ev" data-date="' + ds + '" aria-label="Tilføj aktivitet ' + DAY_NAMES[i] + '" style="margin:-10px -8px -10px 0">' + icon('plus', 20, 2.2) + '</button></div>' +
      '<button class="mealline' + (S.meals[ds] ? '' : ' empty') + '" data-a="tab" data-t="mad">' + icon('food', 16, 2) + esc(S.meals[ds] || 'Ingen aftensmad planlagt') + '</button>';
    evs.forEach(function (o) { h += evRow(o, ds); });
    h += '</div>';
  });
  h += '<p class="foot">Familio ' + esc(APP_VERSION) + '</p></div>';
  h += '<button class="fab" data-a="new-ev" data-date="' + ymd(S.weekMon) + '" aria-label="Tilføj aktivitet">' + icon('plus', 26, 2.5) + '</button>';
  return h;
}

function renderMeals() {
  var h = renderTop('Madplan', 'Aftensmad for ugen', true) + '<div class="ad-body">';
  h += '<button class="btn dashed" data-a="copy-meals">' + icon('copy', 16, 2) + 'Kopiér sidste uges madplan</button>';
  var td = ymd(today());
  weekDays(S.weekMon).forEach(function (d, i) {
    var ds = ymd(d);
    h += '<div class="mealrow' + (ds === td ? ' today' : '') + '"><label for="m-' + ds + '">' + DAY_NAMES[i] + ' · ' + esc(shortDate(d)) + '</label>' +
      '<input id="m-' + ds + '" data-meal="' + ds + '" type="text" enterkeyhint="next" placeholder="Hvad skal vi have?" value="' + esc(S.meals[ds] || '') + '"></div>';
  });
  h += '<p class="hint">Gemmes automatisk, når du forlader feltet.</p></div>';
  return h;
}

function renderPoints() {
  var t = today();
  var b = periodBounds(t);
  var mName = monthName(t);
  var h = renderTop('Pligter & point', 'Uge ' + isoWeek(t) + ' · ' + mName, false) + '<div class="ad-body">';
  h += '<div class="kidstats">';
  kidsOf(S.family).forEach(function (k) {
    var p = pal(k);
    var g = (S.family.goals && S.family.goals[k.id]) || {};
    var w = sumPoints(S.completions, S.adjustments, k.id, b.weekFrom, b.weekTo);
    var m = sumPoints(S.completions, S.adjustments, k.id, b.monthFrom, b.monthTo);
    h += '<div class="kidstat" style="background:' + p.tint + ';color:' + p.text + '"><b style="font-size:14px">' + esc(k.name) + '</b>' +
      '<span class="big">' + w + '</span><span class="small">af ' + (+g.weekPts || 0) + ' denne uge</span>' +
      '<span class="small" style="margin-top:4px">' + m + ' af ' + (+g.monthPts || 0) + ' i ' + esc(mName) + '</span>' +
      '<div class="adj"><button data-a="adjust" data-kid="' + k.id + '" data-pts="-5" aria-label="Træk 5 point fra ' + esc(k.name) + '">−5</button>' +
      '<button data-a="adjust" data-kid="' + k.id + '" data-pts="5" aria-label="Giv 5 point til ' + esc(k.name) + '">+5</button></div></div>';
  });
  h += '</div>';

  // Seneste registreringer
  var log = S.completions.map(function (c) { return { kind: 'c', o: c, at: c.at || 0 }; })
    .concat(S.adjustments.map(function (a) { return { kind: 'a', o: a, at: a.at || 0 }; }))
    .sort(function (x, y) { return y.at - x.at; }).slice(0, 15);
  h += '<div class="section"><span class="label">Seneste registreringer</span><div class="list">';
  if (!log.length) { h += '<div class="item"><span class="muted">Ingen endnu</span></div>'; }
  log.forEach(function (r) {
    var k = memberById(S.family, r.o.kid);
    var label = r.kind === 'c' ? choreLabel(r.o.chore) : (r.o.pts > 0 ? 'Bonus fra ' : 'Rettelse fra ') + (r.o.by || 'forælder');
    var when = r.at ? whenLabel(r.at) : shortDate(parseYmd(r.o.date));
    h += '<div class="item"><div class="grow"><b>' + esc(k.name) + ' · ' + esc(label) + '</b><span>' + esc(when) + (r.kind === 'c' && r.o.date !== ymd(new Date(r.at || Date.now())) ? ' · for ' + esc(shortDate(parseYmd(r.o.date))) : '') +
      ' · ' + (r.o.pts > 0 ? '+' : '') + r.o.pts + ' point</span></div>' +
      '<button class="iconbtn" data-a="del-log" data-kind="' + r.kind + '" data-id="' + esc(r.o.id) + '" aria-label="Fjern registrering" style="color:var(--danger)">' + icon('trash', 18, 2) + '</button></div>';
  });
  h += '</div></div>';

  // Mål og belønninger
  h += '<div class="section"><span class="label">Mål & belønninger</span>';
  kidsOf(S.family).forEach(function (k) {
    var g = (S.family.goals && S.family.goals[k.id]) || {};
    h += '<div class="card"><b>' + esc(k.name) + '</b>' +
      '<div class="row2"><div class="field"><label for="g-' + k.id + '-wp">Ugemål (point)</label><input class="input" id="g-' + k.id + '-wp" type="number" inputmode="numeric" data-goal="' + k.id + '.weekPts" value="' + esc(g.weekPts || 0) + '"></div>' +
      '<div class="field"><label for="g-' + k.id + '-mp">Månedsmål (point)</label><input class="input" id="g-' + k.id + '-mp" type="number" inputmode="numeric" data-goal="' + k.id + '.monthPts" value="' + esc(g.monthPts || 0) + '"></div></div>' +
      '<div class="field"><label for="g-' + k.id + '-wr">Ugens belønning</label><input class="input" id="g-' + k.id + '-wr" type="text" placeholder="fx 30 min ekstra skærmtid" data-goal="' + k.id + '.weekReward" value="' + esc(g.weekReward || '') + '"></div>' +
      '<div class="field"><label for="g-' + k.id + '-mr">Månedens belønning</label><input class="input" id="g-' + k.id + '-mr" type="text" placeholder="fx 100 kr. i lommepenge" data-goal="' + k.id + '.monthReward" value="' + esc(g.monthReward || '') + '"></div></div>';
  });
  h += '</div>';

  // Pligter
  h += '<div class="section"><span class="label">Pligter & pointværdi</span><div class="list">';
  (S.family.chores || []).forEach(function (c, i) {
    var who = (c.kids || []).map(function (id) { return memberById(S.family, id).short; }).join(' + ');
    h += '<div class="item"><span style="display:flex;color:var(--muted)">' + icon(c.icon || 'star', 22, 2) + '</span><div class="grow"><b>' + esc(c.label) + '</b><span>' + esc(who) + '</span></div>' +
      '<div class="stepper"><button data-a="chore-pts" data-i="' + i + '" data-d="-5" aria-label="Færre point">−</button><span>' + (+c.pts || 0) + '</span><button data-a="chore-pts" data-i="' + i + '" data-d="5" aria-label="Flere point">+</button></div>' +
      '<button class="iconbtn" data-a="edit-chore" data-i="' + i + '" aria-label="Rediger ' + esc(c.label) + '">' + icon('pencil', 18, 2) + '</button></div>';
  });
  h += '</div><button class="btn dashed" data-a="new-chore">+ Ny pligt</button></div>';
  h += '<p class="hint">Point tæller både til ugens og månedens mål. Nye uger starter mandag, nye måneder den 1.</p></div>';
  return h;
}

function choreLabel(id) {
  var c = (S.family.chores || []).filter(function (x) { return x.id === id; })[0];
  return c ? c.label : id;
}

function whenLabel(at) {
  var d = new Date(at), t = today();
  var hm = (d.getHours() < 10 ? '0' : '') + d.getHours() + '.' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
  var ds = ymd(d);
  if (ds === ymd(t)) { return 'I dag ' + hm; }
  if (ds === ymd(addDays(t, -1))) { return 'I går ' + hm; }
  return shortDate(d) + ' ' + hm;
}

function renderTabbar() {
  var tabs = [['uge', 'calendar', 'Uge'], ['mad', 'food', 'Madplan'], ['point', 'star', 'Pligter & point']];
  var h = '<nav class="tabbar" aria-label="Hovedmenu"><div class="inner">';
  tabs.forEach(function (t) {
    h += '<button data-a="tab" data-t="' + t[0] + '"' + (S.tab === t[0] ? ' aria-current="page"' : '') + '>' + icon(t[1], 22, S.tab === t[0] ? 2.2 : 2) + esc(t[2]) + '</button>';
  });
  return h + '</div></nav>';
}

// ---------- Sheets ----------
function sheetFrame(title, body, foot, left) {
  return '<div class="sheet-wrap" data-a="sheet-bg"><div class="sheet" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
    '<div class="sheet-head">' + (left || '<button class="btn ghost" data-a="close-sheet">Luk</button>') + '<b>' + esc(title) + '</b><span style="width:70px"></span></div>' +
    '<div class="sheet-body">' + body + '</div>' + (foot ? '<div class="sheet-foot">' + foot + '</div>' : '') + '</div></div>';
}

function renderSheet() {
  var s = S.sheet;
  if (s.kind === 'ev') { return renderEventSheet(); }
  if (s.kind === 'form') { return renderEventForm(); }
  if (s.kind === 'settings') { return renderSettings(); }
  if (s.kind === 'chore') { return renderChoreForm(); }
  return '';
}

function findEvent(id) { return S.events.filter(function (e) { return e.id === id; })[0]; }

function chipsHtml(items, action, current, extra) {
  return items.map(function (it) {
    return '<button class="chip" data-a="' + action + '" data-v="' + esc(it[0]) + '"' + (extra || '') + ' aria-pressed="' + (current === it[0]) + '">' + esc(it[1]) + '</button>';
  }).join('');
}

function renderEventSheet() {
  var ev = findEvent(S.sheet.id);
  if (!ev) { S.sheet = null; return ''; }
  var ds = S.sheet.date;
  var o = eventsOn([ev], ds)[0] || { cancelled: false, driver: ev.driver || '' };
  var m = memberById(S.family, ev.who), p = pal(m);
  var rec = ev.type !== 'once';
  var b = '<div class="evhero" style="background:' + p.tint + ';color:' + p.text + '"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px">' +
    '<span class="t">' + esc(ev.title) + '</span><span class="pill" style="background:' + p.color + ';color:#fff;font-size:13px;padding:4px 10px">' + esc(m.name) + '</span></div>' +
    '<b style="font-size:16px">' + esc(longDate(parseYmd(ds))) + ' · ' + esc(timeLabel(ev)) + '</b>' +
    '<span style="display:flex;align-items:center;gap:6px;font-size:14px;font-weight:700">' + (rec ? icon('repeat', 15, 2.2) : '') + esc(recurrenceLabel(ev)) + '</span></div>';
  if (o.cancelled) {
    b += '<div class="banner"><span>Aflyst d. ' + esc(shortDate(parseYmd(ds))) + '. Resten af serien kører videre.</span><button data-a="ev-cancel" data-on="0">Genåbn</button></div>';
  }
  var drivers = [['', 'Ingen']].concat((S.family.drivers || []).map(function (d) { return [d, d]; }));
  b += '<div class="section"><span class="label">Hvem kører' + (rec ? ' denne gang' : '') + '?</span><div class="chips">' + chipsHtml(drivers, 'ev-driver', o.driver || '') + '</div>';
  if (rec && o.driver !== (ev.driver || '')) {
    b += '<button class="btn ghost" style="align-self:flex-start;padding:0;font-size:14px" data-a="ev-driver-series">Brug ' + esc(o.driver || 'ingen') + ' fast for hele serien</button>';
  }
  b += '</div>';
  b += '<div class="section"><span class="label">Huskeliste (børnene krydser af på tabletten)</span><div class="list">';
  (ev.pack || []).forEach(function (it, i) {
    b += '<div class="item"><div class="grow"><b>' + esc(it) + '</b></div><button class="iconbtn" data-a="pack-del" data-i="' + i + '" aria-label="Fjern ' + esc(it) + '">' + icon('x', 16, 2.4) + '</button></div>';
  });
  b += '<form class="item" id="packform" style="gap:8px"><label for="packnew" class="sr">Tilføj til huskeliste</label><input id="packnew" class="input" style="border:0;padding:0;height:44px" placeholder="Tilføj ting, fx håndklæde">' +
    '<button class="btn" type="submit" style="min-height:36px;padding:0 12px;font-size:14px">Tilføj</button></form></div>' +
    '<span class="hint">Huskelisten gælder hver gang' + (rec ? ', ikke kun denne dato' : '') + '.</span></div>';
  var foot = '<div style="display:flex;flex-direction:column;gap:8px">';
  if (rec) {
    foot += '<button class="btn ' + (o.cancelled ? 'secondary' : '') + ' block" style="height:52px" data-a="ev-cancel" data-on="' + (o.cancelled ? '0' : '1') + '">' +
      (o.cancelled ? 'Genåbn d. ' : 'Aflys kun d. ') + esc(shortDate(parseYmd(ds))) + '</button>';
  }
  foot += '<div class="row2"><button class="btn secondary" data-a="ev-edit">' + icon('pencil', 16, 2) + 'Rediger</button>' +
    '<button class="btn danger" data-a="ev-delete">' + (rec ? 'Slet hele serien' : 'Slet') + '</button></div></div>';
  return sheetFrame(ev.title, b, foot);
}

function blankForm(date) {
  var d = date || ymd(today());
  return {
    id: '', title: '', who: (kidsOf(S.family)[0] || {}).id || 'fam', type: 'once', date: d, endDate: '',
    days: [dow(parseYmd(d))], freq: 'w1', start: d, end: '', allDay: false, from: '15:00', to: '16:00',
    driver: '', pack: '', showOnTablet: true, err: ''
  };
}

function formFromEvent(ev) {
  return {
    id: ev.id, title: ev.title || '', who: ev.who || 'fam', type: ev.type || 'once', date: ev.date || ev.start || ymd(today()), endDate: ev.endDate || '',
    days: (ev.days || []).slice(), freq: ev.freq || 'w1', start: ev.start || ev.date || ymd(today()), end: ev.end || '', allDay: !!ev.allDay,
    from: ev.from || '', to: ev.to || '', driver: ev.driver || '', pack: (ev.pack || []).join(', '), showOnTablet: ev.showOnTablet !== false, err: ''
  };
}

function renderEventForm() {
  var f = S.form;
  var people = (S.family.members || []).map(function (m) { return [m.id, m.name]; }).concat([['fam', 'Hele familien']]);
  var b = '<div class="field"><label for="f-title">Titel</label><input class="input" id="f-title" data-f="title" placeholder="fx Svømning, tandlæge, legeaftale" value="' + esc(f.title) + '"></div>';
  b += '<div class="field"><span class="label">Hvem</span><div class="chips">' + chipsHtml(people, 'f-who', f.who) + '</div></div>';
  b += '<div class="field"><span class="label">Type</span><div class="seg"><button data-a="f-type" data-v="once" aria-pressed="' + (f.type === 'once') + '">Én gang</button>' +
    '<button data-a="f-type" data-v="rec" aria-pressed="' + (f.type === 'rec') + '">Gentages</button></div></div>';
  if (f.type === 'once') {
    b += '<div class="row2"><div class="field"><label for="f-date">Dato</label><input class="input" id="f-date" type="date" data-f="date" value="' + esc(f.date) + '"></div>' +
      '<div class="field"><label for="f-endDate">Slutdato (valgfri)</label><input class="input" id="f-endDate" type="date" data-f="endDate" value="' + esc(f.endDate) + '"></div></div>' +
      '<span class="hint">Brug slutdato til fx rejser over flere dage.</span>';
  } else {
    b += '<div class="field"><span class="label">Hvor ofte</span><div class="chips">' + chipsHtml([['w1', 'Hver uge'], ['w2', 'Hver 2. uge'], ['m1', 'Hver måned']], 'f-freq', f.freq) + '</div></div>';
    if (f.freq !== 'm1') {
      b += '<div class="field"><span class="label">Ugedag(e)</span><div class="days7">';
      DAY_2.forEach(function (n, i) {
        b += '<button class="chip" data-a="f-day" data-v="' + (i + 1) + '" aria-pressed="' + (f.days.indexOf(i + 1) >= 0) + '" aria-label="' + DAY_NAMES[i] + '">' + n + '</button>';
      });
      b += '</div></div>';
    }
    b += '<div class="row2"><div class="field"><label for="f-start">Starter</label><input class="input" id="f-start" type="date" data-f="start" value="' + esc(f.start) + '"></div>' +
      '<div class="field"><label for="f-end">Slutter (valgfri)</label><input class="input" id="f-end" type="date" data-f="end" value="' + esc(f.end) + '"></div></div>' +
      '<span class="hint">' + (f.freq === 'm1' ? 'Gentages samme dato hver måned som startdatoen. ' : '') + 'Tom slutdato = fortsætter, til I sletter den. En enkelt gang kan aflyses fra ugeoversigten.</span>';
  }
  if (!f.allDay) {
    b += '<div class="row2"><div class="field"><label for="f-from">Fra</label><input class="input" id="f-from" type="time" data-f="from" value="' + esc(f.from) + '"></div>' +
      '<div class="field"><label for="f-to">Til</label><input class="input" id="f-to" type="time" data-f="to" value="' + esc(f.to) + '"></div></div>';
  }
  var drivers = [['', 'Ingen']].concat((S.family.drivers || []).map(function (d) { return [d, d]; }));
  b += '<div class="field"><span class="label">Hvem kører? (valgfri)</span><div class="chips">' + chipsHtml(drivers, 'f-driver', f.driver) + '</div></div>';
  b += '<div class="field"><label for="f-pack">Huskeliste (valgfri)</label><input class="input" id="f-pack" data-f="pack" placeholder="fx Ketsjer, indendørssko, vandflaske" value="' + esc(f.pack) + '"><span class="hint">Adskil med komma. Børnene krydser af på tabletten.</span></div>';
  b += '<div class="card" style="padding:0 16px">' +
    '<label class="toggle"><span class="grow"><b>Hele dagen</b><span>Skjuler tidspunkt – fx "Far ude at rejse"</span></span><input type="checkbox" data-fc="allDay"' + (f.allDay ? ' checked' : '') + '></label>' +
    '<label class="toggle"><span class="grow"><b>Vis på tablet</b><span>Slå fra for private aftaler</span></span><input type="checkbox" data-fc="showOnTablet"' + (f.showOnTablet ? ' checked' : '') + '></label></div>';
  if (f.err) { b += '<div class="err" role="alert">' + esc(f.err) + '</div>'; }
  var foot = '<button class="btn block" style="height:54px" data-a="f-save">' + (f.id ? 'Gem ændringer' : 'Gem aktivitet') + '</button>';
  return sheetFrame(f.id ? 'Rediger aktivitet' : 'Ny aktivitet', b, foot, '<button class="btn ghost" data-a="close-sheet">Annuller</button>');
}

function renderSettings() {
  var fam = S.family;
  var b = '';
  b += '<div class="section"><span class="label">Forældre (admin)</span><div class="list">';
  (fam.admins || []).forEach(function (e) {
    b += '<div class="item"><div class="grow"><b>' + esc(e) + '</b>' + (e === S.user.email ? '<span>Dig</span>' : '') + '</div>' +
      (e !== S.user.email ? '<button class="iconbtn" data-a="admin-del" data-v="' + esc(e) + '" aria-label="Fjern ' + esc(e) + '">' + icon('x', 16, 2.4) + '</button>' : '') + '</div>';
  });
  b += '<form class="item" id="adminform" style="gap:8px"><label for="adminnew" class="sr">Tilføj forælder (e-mail)</label><input id="adminnew" class="input" type="email" style="border:0;padding:0;height:44px" placeholder="Tilføj e-mail, fx Katrines">' +
    '<button class="btn" type="submit" style="min-height:36px;padding:0 12px;font-size:14px">Tilføj</button></form></div>' +
    '<span class="hint">Opret også personen under Authentication › Users i Firebase med den fælles kode.</span></div>';

  b += '<div class="section"><span class="label">Tablets</span><div class="list">';
  var pend = S.pairing.filter(function (p) { return (fam.tablets || []).indexOf(p.id) < 0; });
  pend.forEach(function (p) {
    b += '<div class="item"><div class="grow"><b>Ny tablet · kode ' + esc(p.code || p.id.slice(0, 6).toUpperCase()) + '</b><span>Venter på godkendelse</span></div>' +
      '<button class="btn" style="min-height:36px;padding:0 12px;font-size:14px" data-a="tablet-ok" data-v="' + esc(p.id) + '">Godkend</button>' +
      '<button class="iconbtn" data-a="tablet-no" data-v="' + esc(p.id) + '" aria-label="Afvis">' + icon('x', 16, 2.4) + '</button></div>';
  });
  (fam.tablets || []).forEach(function (uid) {
    b += '<div class="item"><div class="grow"><b>Tablet · kode ' + esc(uid.slice(0, 6).toUpperCase()) + '</b><span>Tilknyttet</span></div>' +
      '<button class="iconbtn" data-a="tablet-del" data-v="' + esc(uid) + '" aria-label="Fjern tablet" style="color:var(--danger)">' + icon('trash', 18, 2) + '</button></div>';
  });
  if (!pend.length && !(fam.tablets || []).length) { b += '<div class="item"><span class="muted">Åbn tavlen på tabletten – så dukker den op her med en kode.</span></div>'; }
  b += '</div></div>';

  var st = fam.settings || {};
  b += '<div class="section"><span class="label">Tavlen</span><div class="card" style="padding:4px 16px">' +
    '<div class="toggle"><span class="grow"><b>Nattilstand</b><span>Skærmen dæmpes med ur og morgendagens plan</span></span></div>' +
    '<div class="row2" style="padding-bottom:12px"><div class="field"><label for="s-nf">Fra</label><input class="input" id="s-nf" type="time" data-set="nightFrom" value="' + esc(st.nightFrom || '21:00') + '"></div>' +
    '<div class="field"><label for="s-nt">Til</label><input class="input" id="s-nt" type="time" data-set="nightTo" value="' + esc(st.nightTo || '06:00') + '"></div></div>' +
    '<div class="toggle"><span class="grow"><b>Ny uge starter automatisk</b><span>Natten mellem søndag og mandag</span></span></div></div></div>';

  b += '<div class="section"><span class="label">Chauffører</span><div class="chips">';
  (fam.drivers || []).forEach(function (d) {
    b += '<button class="chip" data-a="driver-del" data-v="' + esc(d) + '" aria-label="Fjern ' + esc(d) + '">' + esc(d) + ' ✕</button>';
  });
  b += '</div><form id="driverform" style="display:flex;gap:8px"><label for="drivernew" class="sr">Ny chauffør</label><input id="drivernew" class="input" placeholder="fx Mormor"><button class="btn" type="submit">Tilføj</button></form></div>';

  b += '<div class="section"><span class="label">Push-påmindelser</span><div class="card"><b>Øjenklap – Ida Marie kl. 16.00</b><span class="hint">Kommer i næste version. Det kræver en lille planlagt funktion i Firebase.</span></div></div>';

  b += '<div class="section"><span class="label">Konto</span><div class="list"><div class="item"><div class="grow"><b>' + esc(S.user.email) + '</b><span>Logget ind</span></div>' +
    '<button class="btn danger" data-a="logout">Log ud</button></div></div></div>';
  if (DEMO) { b += '<button class="btn secondary" data-a="demo-reset">Nulstil demo-data</button>'; }
  b += '<p class="foot">Familio ' + esc(APP_VERSION) + '</p>';
  return sheetFrame('Indstillinger', b, '');
}

var ICON_CHOICES = ['daek', 'tag', 'opvask', 'vaer', 'stoev', 'laes', 'oejen', 'star', 'bag'];

function renderChoreForm() {
  var f = S.form;
  var b = '<div class="field"><label for="c-label">Navn</label><input class="input" id="c-label" data-f="label" value="' + esc(f.label) + '" placeholder="fx Rydde op i entréen"></div>';
  b += '<div class="field"><label for="c-pts">Point</label><input class="input" id="c-pts" type="number" inputmode="numeric" data-f="pts" value="' + esc(f.pts) + '"></div>';
  b += '<div class="field"><span class="label">Hvem kan tage den</span><div class="chips">';
  kidsOf(S.family).forEach(function (k) {
    b += '<button class="chip" data-a="c-kid" data-v="' + k.id + '" aria-pressed="' + (f.kids.indexOf(k.id) >= 0) + '">' + esc(k.name) + '</button>';
  });
  b += '</div></div><div class="field"><span class="label">Ikon</span><div class="chips">';
  ICON_CHOICES.forEach(function (ic) {
    b += '<button class="chip" style="padding:0 12px" data-a="c-icon" data-v="' + ic + '" aria-pressed="' + (f.icon === ic) + '" aria-label="Ikon ' + ic + '">' + icon(ic, 22, 2) + '</button>';
  });
  b += '</div></div>';
  if (f.err) { b += '<div class="err" role="alert">' + esc(f.err) + '</div>'; }
  var foot = '<div style="display:flex;flex-direction:column;gap:8px"><button class="btn block" style="height:54px" data-a="c-save">Gem pligt</button>' +
    (f.i >= 0 ? '<button class="btn danger" data-a="c-del">Slet pligten</button>' : '') + '</div>';
  return sheetFrame(f.i >= 0 ? 'Rediger pligt' : 'Ny pligt', b, foot, '<button class="btn ghost" data-a="close-sheet">Annuller</button>');
}

// ---------- Handlinger ----------
function fail(e) { console.error(e); toast('Kunne ikke gemme: ' + ((e && e.message) || e)); }

function onSubmit(e) {
  var id = e.target.id;
  if (!id) { return; }
  e.preventDefault();
  if (id === 'login') {
    var email = e.target.email.value.trim().toLowerCase(), pw = e.target.pw.value;
    try { localStorage.setItem(EMAIL_KEY, email); } catch (x) { /* */ }
    S.busy = true; S.loginErr = ''; render();
    store.signInEmail(email, pw).then(function () { S.busy = false; }).catch(function (err) {
      S.busy = false;
      var c = (err && err.code) || '';
      S.loginErr = /invalid|wrong|not-found|user/.test(c) ? 'Forkert e-mail eller kode.' : /too-many/.test(c) ? 'For mange forsøg – vent lidt og prøv igen.' : /network/.test(c) ? 'Ingen forbindelse til internettet.' : 'Kunne ikke logge ind (' + c + ').';
      render();
    });
  } else if (id === 'packform') {
    var v = document.getElementById('packnew').value.trim();
    var ev = findEvent(S.sheet.id);
    if (v && ev) { store.update('events/' + ev.id, { pack: (ev.pack || []).concat([v]) }).catch(fail); }
    document.getElementById('packnew').value = '';
  } else if (id === 'adminform') {
    var a = document.getElementById('adminnew').value.trim().toLowerCase();
    if (a && a.indexOf('@') > 0) { store.update('', { admins: FV.union(a) }).then(function () { toast(a + ' er tilføjet'); }).catch(fail); }
    document.getElementById('adminnew').value = '';
  } else if (id === 'driverform') {
    var d = document.getElementById('drivernew').value.trim();
    if (d) { store.update('', { drivers: FV.union(d) }).catch(fail); }
    document.getElementById('drivernew').value = '';
  }
  document.activeElement && document.activeElement.blur && document.activeElement.blur();
}

function onInput(e) {
  var t = e.target;
  if (t.hasAttribute('data-f') && S.form) { S.form[t.getAttribute('data-f')] = t.value; }
}

function onChange(e) {
  var t = e.target;
  if (t.hasAttribute('data-fc') && S.form) { S.form[t.getAttribute('data-fc')] = t.checked; render(); return; }
  if (t.hasAttribute('data-meal')) {
    var ds = t.getAttribute('data-meal'), v = t.value.trim();
    if ((S.meals[ds] || '') === v) { return; }
    S.meals[ds] = v;
    (v ? store.set('meals/' + ds, { date: ds, text: v }) : store.del('meals/' + ds)).catch(fail);
    return;
  }
  if (t.hasAttribute('data-goal')) {
    var parts = t.getAttribute('data-goal').split('.');
    var val = /Pts$/.test(parts[1]) ? Math.max(0, parseInt(t.value, 10) || 0) : t.value.trim();
    var upd = {}; upd['goals.' + parts[0] + '.' + parts[1]] = val;
    store.update('', upd).then(function () { toast('Gemt'); }).catch(fail);
    return;
  }
  if (t.hasAttribute('data-set')) {
    var u = {}; u['settings.' + t.getAttribute('data-set')] = t.value;
    store.update('', u).then(function () { toast('Gemt'); }).catch(fail);
  }
}

function onClick(e) {
  var el = e.target.closest ? e.target.closest('[data-a]') : null;
  if (!el) { return; }
  var a = el.getAttribute('data-a');
  var v = el.getAttribute('data-v');
  if (a === 'sheet-bg') { if (e.target === el) { closeSheet(); } return; }
  if (el.tagName === 'BUTTON' && el.type !== 'submit') { e.preventDefault(); }
  var f = S.form;
  switch (a) {
    case 'tab': S.tab = el.getAttribute('data-t'); window.scrollTo(0, 0); render(); break;
    case 'week':
      var d = +el.getAttribute('data-d');
      S.weekMon = d === 0 ? mondayOf(today()) : addDays(S.weekMon, 7 * d);
      watchMeals(); render(); break;
    case 'settings': S.sheet = { kind: 'settings' }; render(); break;
    case 'close-sheet': closeSheet(); break;
    case 'logout': closeSheet(); store.signOut(); break;
    case 'create-family': createFamily(); break;
    case 'demo-reset': if (window.confirm('Nulstil demo-data?')) { store.reset(); closeSheet(); } break;

    case 'new-ev': S.form = blankForm(el.getAttribute('data-date')); S.sheet = { kind: 'form' }; render(); break;
    case 'open-ev': S.sheet = { kind: 'ev', id: el.getAttribute('data-id'), date: el.getAttribute('data-date') }; render(); break;
    case 'f-who': f.who = v; render(); break;
    case 'f-type': f.type = v; render(); break;
    case 'f-freq': f.freq = v; render(); break;
    case 'f-driver': f.driver = v; render(); break;
    case 'f-day':
      var n = +v, i = f.days.indexOf(n);
      if (i >= 0) { f.days.splice(i, 1); } else { f.days.push(n); }
      render(); break;
    case 'f-save': saveEvent(); break;

    case 'ev-edit': var ev = findEvent(S.sheet.id); if (ev) { S.form = formFromEvent(ev); S.sheet = { kind: 'form', back: S.sheet }; render(); } break;
    case 'ev-delete': deleteEvent(); break;
    case 'ev-cancel': setCancelled(el.getAttribute('data-on') === '1'); break;
    case 'ev-driver': setDriver(v); break;
    case 'ev-driver-series': setDriverSeries(); break;
    case 'pack-del':
      var evp = findEvent(S.sheet.id);
      if (evp) { var pk = (evp.pack || []).slice(); pk.splice(+el.getAttribute('data-i'), 1); store.update('events/' + evp.id, { pack: pk }).catch(fail); }
      break;

    case 'adjust': adjust(el.getAttribute('data-kid'), +el.getAttribute('data-pts')); break;
    case 'del-log':
      var kind = el.getAttribute('data-kind'), lid = el.getAttribute('data-id');
      if (window.confirm('Fjern registreringen? Pointene trækkes fra.')) { store.del((kind === 'c' ? 'completions/' : 'adjustments/') + lid).catch(fail); }
      break;
    case 'chore-pts':
      var ch = (S.family.chores || []).slice(), ci = +el.getAttribute('data-i');
      ch[ci] = Object.assign({}, ch[ci], { pts: Math.max(0, (+ch[ci].pts || 0) + (+el.getAttribute('data-d'))) });
      store.update('', { chores: ch }).catch(fail); break;
    case 'new-chore': S.form = { i: -1, label: '', pts: 5, kids: kidsOf(S.family).map(function (k) { return k.id; }), icon: 'star', err: '' }; S.sheet = { kind: 'chore' }; render(); break;
    case 'edit-chore':
      var c = S.family.chores[+el.getAttribute('data-i')];
      S.form = { i: +el.getAttribute('data-i'), id: c.id, label: c.label, pts: c.pts, kids: (c.kids || []).slice(), icon: c.icon || 'star', err: '' };
      S.sheet = { kind: 'chore' }; render(); break;
    case 'c-kid': var ki = f.kids.indexOf(v); if (ki >= 0) { f.kids.splice(ki, 1); } else { f.kids.push(v); } render(); break;
    case 'c-icon': f.icon = v; render(); break;
    case 'c-save': saveChore(); break;
    case 'c-del':
      if (window.confirm('Slet pligten "' + f.label + '"? Point, der allerede er optjent, bliver stående.')) {
        var cl = (S.family.chores || []).slice(); cl.splice(f.i, 1);
        store.update('', { chores: cl }).then(closeSheet).catch(fail);
      }
      break;

    case 'admin-del': if (window.confirm('Fjern ' + v + ' som forælder?')) { store.update('', { admins: FV.remove(v) }).catch(fail); } break;
    case 'tablet-ok':
      store.update('', { tablets: FV.union(v) }).then(function () { return store.del('pairing/' + v); }).then(function () { toast('Tabletten er tilknyttet'); }).catch(fail); break;
    case 'tablet-no': store.del('pairing/' + v).catch(fail); break;
    case 'tablet-del': if (window.confirm('Fjern adgangen for denne tablet?')) { store.update('', { tablets: FV.remove(v) }).catch(fail); } break;
    case 'driver-del': if (window.confirm('Fjern ' + v + ' som chauffør?')) { store.update('', { drivers: FV.remove(v) }).catch(fail); } break;
  }
}

function closeSheet() {
  var back = S.sheet && S.sheet.back;
  S.sheet = back || null; S.form = null;
  render();
}

function createFamily() {
  S.busy = true; render();
  var fam = seedFamily(S.user.email);
  store.set('', fam).then(function () {
    return Promise.all(seedEvents().map(function (ev) { var id = ev.id; delete ev.id; return store.set('events/' + id, ev); }));
  }).then(function () {
    S.busy = false; toast('Familien er oprettet');
    if (S.famState !== 'ok') { watchFamily(); }
  }).catch(function (e) {
    S.busy = false;
    S.famState = 'error';
    S.famErr = /permission/i.test((e && (e.code || e.message)) || '') ?
      'Familien findes allerede. Bed den anden forælder tilføje ' + S.user.email + ' under Indstillinger › Forældre.' : (e && e.message);
    render();
  });
}

function saveEvent() {
  var f = S.form;
  // hent seneste værdier fra felterne (iOS sender ikke altid input-events for dato/tid)
  Array.prototype.forEach.call(document.querySelectorAll('[data-f]'), function (inp) { f[inp.getAttribute('data-f')] = inp.value; });
  f.err = '';
  if (!f.title.trim()) { f.err = 'Skriv en titel.'; }
  else if (f.type === 'once' && !f.date) { f.err = 'Vælg en dato.'; }
  else if (f.type === 'rec' && !f.start) { f.err = 'Vælg en startdato.'; }
  else if (f.type === 'rec' && f.freq !== 'm1' && !f.days.length) { f.err = 'Vælg mindst én ugedag.'; }
  else if (!f.allDay && !f.from) { f.err = 'Vælg et tidspunkt.'; }
  if (f.err) { render(); return; }
  var old = f.id ? findEvent(f.id) : null;
  var ev = {
    title: f.title.trim(), who: f.who, type: f.type, allDay: !!f.allDay, from: f.allDay ? '' : f.from, to: f.allDay ? '' : f.to,
    driver: f.driver || '', pack: f.pack.split(',').map(function (s) { return s.trim(); }).filter(Boolean),
    showOnTablet: !!f.showOnTablet, exceptions: (old && old.exceptions) || {}
  };
  if (f.type === 'once') { ev.date = f.date; ev.endDate = f.endDate && f.endDate > f.date ? f.endDate : ''; }
  else { ev.days = f.days.slice().sort(); ev.freq = f.freq; ev.start = f.start; ev.end = f.end || ''; }
  var id = f.id || newId();
  store.set('events/' + id, ev).then(function () {
    toast(f.id ? 'Ændringer gemt' : 'Aktiviteten er gemt');
    S.sheet = null; S.form = null; render();
  }).catch(fail);
}

function deleteEvent() {
  var ev = findEvent(S.sheet.id);
  if (!ev) { return; }
  var msg = ev.type === 'once' ? 'Slet "' + ev.title + '"?' : 'Slet HELE serien "' + ev.title + '"? Vil du kun aflyse én gang, så brug "Aflys kun".';
  if (!window.confirm(msg)) { return; }
  store.del('events/' + ev.id).then(function () { toast('Slettet'); S.sheet = null; render(); }).catch(fail);
}

function setCancelled(on) {
  var ev = findEvent(S.sheet.id), ds = S.sheet.date;
  if (!ev) { return; }
  var u = {}; u['exceptions.' + ds + '.cancelled'] = on ? true : FV.deleteField();
  store.update('events/' + ev.id, u).then(function () { toast(on ? 'Aflyst denne gang' : 'Genåbnet'); }).catch(fail);
}

function setDriver(name) {
  var ev = findEvent(S.sheet.id), ds = S.sheet.date;
  if (!ev) { return; }
  if (ev.type === 'once') { store.update('events/' + ev.id, { driver: name }).catch(fail); return; }
  var u = {}; u['exceptions.' + ds + '.driver'] = name === (ev.driver || '') ? FV.deleteField() : name;
  store.update('events/' + ev.id, u).catch(fail);
}

function setDriverSeries() {
  var ev = findEvent(S.sheet.id), ds = S.sheet.date;
  var o = eventsOn([ev], ds)[0];
  if (!ev || !o) { return; }
  var u = { driver: o.driver || '' }; u['exceptions.' + ds + '.driver'] = FV.deleteField();
  store.update('events/' + ev.id, u).then(function () { toast('Fast chauffør opdateret'); }).catch(fail);
}

function adjust(kid, pts) {
  store.add('adjustments', { date: ymd(today()), kid: kid, pts: pts, at: Date.now(), by: (S.user.email || '').split('@')[0] })
    .then(function () { toast((pts > 0 ? '+' : '') + pts + ' point til ' + memberById(S.family, kid).name); }).catch(fail);
}

function saveChore() {
  var f = S.form;
  Array.prototype.forEach.call(document.querySelectorAll('[data-f]'), function (inp) { f[inp.getAttribute('data-f')] = inp.value; });
  f.err = '';
  if (!String(f.label).trim()) { f.err = 'Skriv et navn.'; }
  else if (!f.kids.length) { f.err = 'Vælg mindst ét barn.'; }
  if (f.err) { render(); return; }
  var list = (S.family.chores || []).slice();
  var c = { id: f.id || newId(), label: String(f.label).trim(), pts: Math.max(0, parseInt(f.pts, 10) || 0), kids: f.kids.slice(), icon: f.icon };
  if (f.i >= 0) { list[f.i] = Object.assign({}, list[f.i], c); } else { list.push(c); }
  store.update('', { chores: list }).then(function () { toast('Pligten er gemt'); closeSheet(); }).catch(fail);
}

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(function () {});
}

boot();
