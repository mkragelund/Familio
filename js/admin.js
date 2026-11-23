// Familio – forældre-appen (mobil). Katrine og Morten logger ind og styrer det hele herfra.
import { createStore, DEMO, FV } from './store.js';
import { APP_VERSION } from './config.js';
import {
  ymd, parseYmd, today, addDays, mondayOf, weekDays, isoWeek, weekRangeLabel, DAY_NAMES, DAY_2,
  eventsOn, timeLabel, recurrenceLabel, sumPoints, periodBounds, memberById, kidsOf, shortDate, longDate,
  monthName, seedFamily, newId, dow, nthOf, nthLabel, familyIdNew, randomCode, formatCode, cleanCode, adultMember, KID_COLORS, initials
} from './model.js';
import { esc, pal, icon, logo, avatar, toast, autoUpdate, justUpdated, COLOR_CHOICES, PALETTE } from './ui.js';
import { HOLIDAYS, TYPES, OTHER_ICONS, holidaySettings, upcoming, todays } from './occasions.js';
import { weatherLoc, getWeather, searchPlaces, dayBadge } from './weather.js';

var store;
var S = {
  fid: null, userDoc: null, onboard: null, invite: null,
  user: null, authReady: false, family: null, famState: 'loading', events: [], meals: {}, completions: [], adjustments: [], pairing: [],
  tab: 'uge', weekMon: mondayOf(today()), sheet: null, form: null, loginErr: '', busy: false
};
var app = document.getElementById('app');
var unsubs = [], famUnsub = null, mealsUnsub = null, userUnsub = null;
// Vejrudsigten for familiens sted (null hvis intet sted er valgt)
function wx() { return getWeather(weatherLoc(S.family), function () { render(); }); }
function F(p) { return 'families/' + S.fid + (p ? '/' + p : ''); }
// Familie-relative kald
var fs = {
  watchDoc: function (p, cb, e) { return store.watchDoc(F(p), cb, e); },
  watchColl: function (p, w, cb, e) { return store.watchColl(F(p), w, cb, e); },
  set: function (p, d, m) { return store.set(F(p), d, m); },
  update: function (p, d) { return store.update(F(p), d); },
  add: function (p, d) { return store.add(F(p), d); },
  del: function (p) { return store.del(F(p)); }
};
var JOIN = cleanCode((location.search.match(/[?&]join=([A-Za-z0-9-]+)/) || [])[1] || '');
var pendingRender = false;


function boot() {
  app.innerHTML = '<div class="center-screen"><div class="spinner" aria-label="Indlæser"></div></div>';
  createStore().then(function (st) {
    store = st;
    store.onUser(function (u) {
      S.authReady = true;
      if (u && u.anon) { u = null; }
      S.user = u;
      if (u) { watchUser(); } else { stopAll(); S.family = null; S.fid = null; S.famState = 'loading'; }
      render();
    });
  }).catch(function (e) {
    app.innerHTML = '<div class="center-screen">' + logo(72) + '<b>Familio kunne ikke starte</b><p class="muted">' + esc(e.message || e) + '</p></div>';
  });
  document.addEventListener('click', onClick);
  document.addEventListener('input', onInput);
  document.addEventListener('change', onChange);
  document.addEventListener('submit', onSubmit);
  // Ny version: genindlæs, når man ikke er i gang med at skrive eller har et vindue åbent
  autoUpdate(APP_VERSION, function () { return !editing() && !S.sheet && !S.busy; });
  if (justUpdated()) { setTimeout(function () { toast('Familio er opdateret til version ' + APP_VERSION); }, 1200); }
  document.addEventListener('focusout', function () { setTimeout(function () { if (pendingRender && !editing()) { render(); } }, 0); });
}

function stopAll() {
  if (userUnsub) { userUnsub(); userUnsub = null; }
  unsubs.forEach(function (u) { u(); }); unsubs = [];
  if (famUnsub) { famUnsub(); famUnsub = null; }
  if (mealsUnsub) { mealsUnsub(); mealsUnsub = null; }
}

function watchUser() {
  stopAll();
  S.famState = 'loading';
  userUnsub = store.watchDoc('users/' + S.user.uid, function (doc) {
    S.userDoc = doc;
    var fid = doc && doc.familyId;
    if (fid && fid !== S.fid) { S.fid = fid; S.family = null; watchFamily(); }
    else if (!fid) {
      S.fid = null; S.family = null; S.famState = 'none';
      if (!S.onboard) { S.onboard = { step: JOIN ? 'join' : 'start', code: JOIN, role: '', name: '', kids: [{ name: '', color: 'blue' }, { name: '', color: 'orange' }], err: '' }; }
    }
    render();
  }, function (e) { S.famState = 'error'; S.famErr = e && e.message; render(); });
}

function watchFamily() {
  unsubs.forEach(function (u) { u(); }); unsubs = [];
  if (famUnsub) { famUnsub(); }
  if (mealsUnsub) { mealsUnsub(); mealsUnsub = null; }
  S.famState = 'loading';
  famUnsub = fs.watchDoc('', function (fam) {
    var first = !S.family;
    S.family = fam;
    S.famState = fam ? 'ok' : 'missing';
    if (fam && first) { subscribeData(); }
    render();
  }, function (err) {
    S.family = null;
    S.famState = (err && /permission/i.test(err.code || err.message || '')) ? 'denied' : 'error';
    S.famErr = err && err.message;
    if (S.famState === 'denied') {
      // Jeg er ikke (længere) med i familien – start forfra
      store.set('users/' + S.user.uid, { familyId: '' }, true).catch(function () {});
    }
    render();
  });
}

function subscribeData() {
  unsubs.forEach(function (u) { u(); }); unsubs = [];
  var t = today();
  var prevMonth = ymd(new Date(t.getFullYear(), t.getMonth() - 1, 1));
  var from = ymd(addDays(mondayOf(t), -7)) < prevMonth ? ymd(addDays(mondayOf(t), -7)) : prevMonth;
  unsubs.push(fs.watchColl('events', null, function (l) { S.events = l; render(); }));
  unsubs.push(fs.watchColl('completions', ['date', '>=', from], function (l) { S.completions = l; render(); }));
  unsubs.push(fs.watchColl('adjustments', ['date', '>=', from], function (l) { S.adjustments = l; render(); }));
  watchMeals();
}

function watchMeals() {
  if (mealsUnsub) { mealsUnsub(); }
  // denne uge + ugen før (til "kopiér sidste uge")
  mealsUnsub = fs.watchColl('meals', ['date', '>=', ymd(addDays(S.weekMon, -7))], function (l) {
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
  if (S.famState === 'none') { app.innerHTML = renderOnboard(); return; }
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

var GOOGLE_G = '<svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.8 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.8c4.3-4 6.9-9.9 6.9-17.2z"/><path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-2.9-.8-4.7s.3-3.3.8-4.7l-7.8-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.8l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.8c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.8 6.1C6.6 42.6 14.6 48 24 48z"/></svg>';

function renderLogin() {
  var re = store.redirectError && store.redirectError();
  var err = S.loginErr || (re ? 'Login mislykkedes (' + (re.code || re.message) + ').' : '');
  return '<div class="login">' + logo(88) +
    '<div style="text-align:center"><div class="display" style="font-size:40px;line-height:1">Familio</div><div class="muted" style="font-weight:700;margin-top:6px">Familiens ugeplan – madplan, aktiviteter og pligter</div></div>' +
    (JOIN ? '<div class="card" style="width:100%;text-align:center"><b>Du er inviteret til en familie</b><span class="hint">Log ind for at tilslutte dig med koden ' + esc(formatCode(JOIN)) + '</span></div>' : '') +
    '<button class="btn secondary block" style="height:56px;font-size:17px" data-a="google"' + (S.busy ? ' disabled' : '') + '>' + GOOGLE_G + (S.busy ? 'Logger ind…' : 'Fortsæt med Google') + '</button>' +
    (err ? '<div class="err" role="alert">' + esc(err) + '</div>' : '') +
    '<p class="hint" style="text-align:center">Du forbliver logget ind på denne telefon. Børnene skal ikke logge ind – de bruger tavlen.</p></div>';
}

function renderOnboard() {
  var o = S.onboard;
  var h = '<div class="login" style="align-items:stretch">' + '<div style="display:flex;justify-content:center">' + logo(64) + '</div>';
  if (o.step === 'start') {
    h += '<div style="text-align:center"><div class="display" style="font-size:30px">Velkommen' + (S.user.name ? ', ' + esc(S.user.name.split(' ')[0]) : '') + '</div>' +
      '<p class="muted" style="font-weight:600">Opret jeres familie, eller tilslut dig en familie, du er inviteret til.</p></div>' +
      '<button class="btn block" style="height:56px" data-a="ob" data-v="create">Opret ny familie</button>' +
      '<button class="btn secondary block" style="height:56px" data-a="ob" data-v="join">Jeg har en invitationskode</button>';
  } else if (o.step === 'join') {
    h += '<div class="display" style="font-size:26px;text-align:center">Tilslut familie</div>' +
      '<div class="field"><label for="ob-code">Invitationskode</label><input class="input" id="ob-code" data-ob="code" autocapitalize="characters" autocomplete="off" placeholder="fx KRAG-7F3Q" value="' + esc(formatCode(o.code)) + '" style="font-size:22px;letter-spacing:.1em;text-transform:uppercase"></div>' +
      roleField(o) +
      (o.err ? '<div class="err" role="alert">' + esc(o.err) + '</div>' : '') +
      '<button class="btn block" style="height:54px" data-a="ob-join"' + (S.busy ? ' disabled' : '') + '>' + (S.busy ? 'Tilslutter…' : 'Tilslut') + '</button>' +
      '<button class="btn ghost" data-a="ob" data-v="start">Tilbage</button>';
  } else {
    h += '<div class="display" style="font-size:26px;text-align:center">Opret jeres familie</div>' +
      '<div class="field"><label for="ob-name">Familiens navn</label><input class="input" id="ob-name" data-ob="name" placeholder="fx Familien Kragelund" value="' + esc(o.name) + '"></div>' +
      roleField(o) +
      '<div class="field"><span class="label">Børn</span>';
    o.kids.forEach(function (k, i) {
      h += '<div style="display:flex;gap:8px;align-items:center"><label class="sr" for="ob-kid-' + i + '">Barn ' + (i + 1) + '</label>' +
        '<input class="input" id="ob-kid-' + i + '" data-obkid="' + i + '" placeholder="Barnets navn" value="' + esc(k.name) + '">' +
        '<button class="iconbtn" data-a="ob-color" data-i="' + i + '" aria-label="Skift farve" style="background:' + pal({ color: k.color }).color + ';border-radius:50%;width:40px;height:40px;flex-shrink:0"></button>' +
        (o.kids.length > 1 ? '<button class="iconbtn" data-a="ob-kid-del" data-i="' + i + '" aria-label="Fjern barn">' + icon('x', 16, 2.4) + '</button>' : '') + '</div>';
    });
    h += (o.kids.length < 6 ? '<button class="btn dashed" data-a="ob-kid-add">+ Tilføj barn</button>' : '') + '</div>' +
      '<p class="hint">I får standardpligter (dække bord, tage af bordet, vaske op, rydde værelse, støvsuge) og mål på 120 point om ugen og 450 om måneden. Alt kan rettes bagefter.</p>' +
      (o.err ? '<div class="err" role="alert">' + esc(o.err) + '</div>' : '') +
      '<button class="btn block" style="height:54px" data-a="ob-create"' + (S.busy ? ' disabled' : '') + '>' + (S.busy ? 'Opretter…' : 'Opret familien') + '</button>' +
      '<button class="btn ghost" data-a="ob" data-v="start">Tilbage</button>';
  }
  h += '<p class="foot">Logget ind som ' + esc(S.user.email) + ' · <button class="btn ghost" style="min-height:24px;padding:0;font-size:12px;text-decoration:underline" data-a="logout">Log ud</button></p></div>';
  return h;
}

function roleField(o) {
  var roles = ['Mor', 'Far'];
  var custom = o.role && roles.indexOf(o.role) < 0;
  return '<div class="field"><span class="label">Hvad kalder børnene dig?</span><div class="chips">' +
    roles.map(function (r) { return '<button class="chip" data-a="ob-role" data-v="' + r + '" aria-pressed="' + (o.role === r) + '">' + r + '</button>'; }).join('') +
    '<label class="sr" for="ob-role">Andet navn</label><input class="input" id="ob-role" data-ob="role" placeholder="Andet" style="width:130px;height:44px" value="' + esc(custom ? o.role : '') + '"></div></div>';
}

function renderNoFamily() {
  return '<div class="center-screen">' + logo(72) + '<b>Der skete en fejl</b><p class="muted">' + esc(S.famErr || 'Kunne ikke hente familien.') + '</p>' +
    '<button class="btn" onclick="location.reload()">Prøv igen</button><button class="btn ghost" data-a="logout">Log ud</button></div>';
}

function renderTop(title, sub, withWeek) {
  var h = '<div class="ad-top"><div class="ad-title"><div class="t"><b>' + esc(title) + '</b><span>' + esc(sub) + ' <em class="ver">v' + esc(APP_VERSION) + '</em></span></div>' +
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

// Skift uge på tavlen: forældre kan vise næste uge på tavlen før tid (fx søndag aften).
function boardAhead() {
  var next = ymd(addDays(mondayOf(today()), 7));
  return ((S.family.settings || {}).boardWeek === next) ? next : '';
}
function renderBoardWeek() {
  var cur = mondayOf(today()), next = addDays(cur, 7);
  var on = !!boardAhead();
  return '<div class="boardrow' + (on ? ' on' : '') + '"><span class="bi">' + icon('calendar', 22, 2) + '</span><div class="bt">' +
    (on ? '<b>Tavlen viser uge ' + isoWeek(next) + '</b><span>Næste uge vises allerede nu. Fra mandag kører alt som normalt.</span>'
        : '<b>Tavlen viser uge ' + isoWeek(cur) + '</b><span>Skift tavlen til næste uge før tid.</span>') +
    '</div><button class="btn' + (on ? ' secondary' : '') + '" data-a="board-week" data-on="' + (on ? '0' : '1') + '">' + (on ? 'Fortryd' : 'Vis uge ' + isoWeek(next)) + '</button></div>';
}

function renderWeek() {
  var h = renderTop('Familio', S.family.name || '', true) + '<div class="ad-body">';
  var td = ymd(today());
  var data = wx();
  h += renderBoardWeek();
  weekDays(S.weekMon).forEach(function (d, i) {
    var ds = ymd(d);
    var evs = eventsOn(S.events, ds);
    h += '<div class="card' + (ds === td ? ' today' : '') + '"><div class="card-head"><b>' + DAY_NAMES[i] + ' <span>' + esc(shortDate(d)) + '</span></b>' + dayBadge(data, ds, 26) +
      '<button class="iconbtn" data-a="new-ev" data-date="' + ds + '" aria-label="Tilføj aktivitet ' + DAY_NAMES[i] + '" style="margin:-10px -8px -10px 0">' + icon('plus', 20, 2.2) + '</button></div>' +
      todays(S.family, ds).map(function (o) { var m = o.who ? memberById(S.family, o.who) : null; return '<span class="occ-pill ' + o.kind + '"' + (m ? ' style="background:' + pal(m).color + '"' : '') + '>' + o.emoji + ' ' + esc(o.title) + '</span>'; }).join('') +
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
      '<div class="adj"><button data-a="bonus" data-kid="' + k.id + '" style="grid-column:span 2">' + icon('star', 16, 2.2) + ' Giv bonus</button></div></div>';
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
    var label = r.kind === 'c' ? choreLabel(r.o.chore) : (r.o.pts > 0 ? 'Bonus' : 'Rettelse') + (r.o.reason ? ': ' + r.o.reason : '') + ' (' + (r.o.byName || 'forælder') + ')';
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
  if (s.kind === 'bonus') { return renderBonus(); }
  if (s.kind === 'occ') { return renderOccForm(); }
  if (s.kind === 'rem') { return renderRemForm(); }
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
    days: [dow(parseYmd(d))], freq: 'w1', nth: Math.min(4, nthOf(parseYmd(d))), start: d, end: '', allDay: false, from: '15:00', to: '16:00',
    driver: '', pack: '', showOnTablet: true, err: ''
  };
}

function formFromEvent(ev) {
  return {
    id: ev.id, title: ev.title || '', who: ev.who || 'fam', type: ev.type || 'once', date: ev.date || ev.start || ymd(today()), endDate: ev.endDate || '',
    days: (ev.days || []).slice(), freq: ev.freq || 'w1', nth: +ev.nth || 1, start: ev.start || ev.date || ymd(today()), end: ev.end || '', allDay: !!ev.allDay,
    from: ev.from || '', to: ev.to || '', driver: ev.driver || '', pack: (ev.pack || []).join(', '), showOnTablet: ev.showOnTablet !== false, err: ''
  };
}

function recurrenceFields(f, rem) {
  var b = '';
  if (f.type === 'once') {
    b += '<div class="row2"><div class="field"><label for="f-date">Dato</label><input class="input" id="f-date" type="date" data-f="date" value="' + esc(f.date) + '"></div>' +
      (rem ? '</div>' : '<div class="field"><label for="f-endDate">Slutdato (valgfri)</label><input class="input" id="f-endDate" type="date" data-f="endDate" value="' + esc(f.endDate) + '"></div></div>' +
      '<span class="hint">Brug slutdato til fx rejser over flere dage.</span>');
  } else {
    b += '<div class="field"><span class="label">Hvor ofte</span><div class="chips">' +
      chipsHtml((rem ? [['d', 'Hver dag']] : []).concat([['w1', 'Hver uge'], ['w2', 'Hver 2. uge'], ['mw', 'Månedlig ugedag'], ['m1', 'Samme dato hver måned']]), 'f-freq', f.freq) + '</div></div>';
    if (f.freq === 'mw') {
      b += '<div class="field"><span class="label">Hvilken i måneden</span><div class="chips">' +
        chipsHtml([['1', '1.'], ['2', '2.'], ['3', '3.'], ['4', '4.'], ['-1', 'Sidste']], 'f-nth', String(f.nth)) + '</div></div>';
      b += '<div class="field"><span class="label">Ugedag</span><div class="days7">';
      DAY_2.forEach(function (n, i) {
        b += '<button class="chip" data-a="f-day1" data-v="' + (i + 1) + '" aria-pressed="' + (f.days[0] === i + 1) + '" aria-label="' + DAY_NAMES[i] + '">' + n + '</button>';
      });
      b += '</div><span class="hint" style="font-weight:800;color:var(--ink)">' + esc(nthLabel(f.nth) + ' ' + DAY_NAMES[(f.days[0] || 7) - 1].toLowerCase() + ' i hver måned') + '</span></div>';
    } else if (f.freq !== 'm1' && f.freq !== 'd') {
      b += '<div class="field"><span class="label">Ugedag(e)</span><div class="days7">';
      DAY_2.forEach(function (n, i) {
        b += '<button class="chip" data-a="f-day" data-v="' + (i + 1) + '" aria-pressed="' + (f.days.indexOf(i + 1) >= 0) + '" aria-label="' + DAY_NAMES[i] + '">' + n + '</button>';
      });
      b += '</div></div>';
    }
    b += '<div class="row2"><div class="field"><label for="f-start">Starter</label><input class="input" id="f-start" type="date" data-f="start" value="' + esc(f.start) + '"></div>' +
      '<div class="field"><label for="f-end">Slutter (valgfri)</label><input class="input" id="f-end" type="date" data-f="end" value="' + esc(f.end) + '"></div></div>' +
      '<span class="hint">' + (f.freq === 'm1' ? 'Gentages samme dato hver måned som startdatoen. ' : '') + (f.freq === 'mw' ? 'Første gang er den første ' + DAY_NAMES[(f.days[0] || 7) - 1].toLowerCase() + ' efter startdatoen, der passer. ' : '') + 'Tom slutdato = fortsætter, til I sletter den.' + (rem ? '' : ' En enkelt gang kan aflyses fra ugeoversigten.') + '</span>';
  }
  return b;
}

function renderEventForm() {
  var f = S.form;
  var people = (S.family.members || []).map(function (m) { return [m.id, m.name]; }).concat([['fam', 'Hele familien']]);
  var b = '<div class="field"><label for="f-title">Titel</label><input class="input" id="f-title" data-f="title" placeholder="fx Svømning, tandlæge, legeaftale" value="' + esc(f.title) + '"></div>';
  b += '<div class="field"><span class="label">Hvem</span><div class="chips">' + chipsHtml(people, 'f-who', f.who) + '</div></div>';
  b += '<div class="field"><span class="label">Type</span><div class="seg"><button data-a="f-type" data-v="once" aria-pressed="' + (f.type === 'once') + '">Én gang</button>' +
    '<button data-a="f-type" data-v="rec" aria-pressed="' + (f.type === 'rec') + '">Gentages</button></div></div>';
  b += recurrenceFields(f, false);
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

var REM_ICONS = ['🔔', '👓', '💊', '🦷', '📚', '🎒', '🎻', '⚽', '🐶', '🌱', '🗑️', '🧺', '🛁', '🍎', '💧', '⏰'];

function renderRemSettings() {
  var list = (S.family.reminders || []).slice().sort(function (a, b) { return (a.time || '') < (b.time || '') ? -1 : 1; });
  var b = '<div class="section"><span class="label">Påmindelser på tavlen</span><div class="card occ-set" style="padding:4px 16px">';
  if (!list.length) { b += '<div class="row"><span class="grow"><span>Ingen påmindelser endnu. Tavlen siger til med lyd på klokkeslættet.</span></span></div>'; }
  list.forEach(function (r) {
    var m = r.who ? memberById(S.family, r.who) : null;
    b += '<button class="row occ-row" data-a="rem-edit" data-v="' + esc(r.id) + '"><span class="e">' + esc(r.icon || '🔔') + '</span><span class="grow"><b>' + esc(r.text) + (m ? ' · ' + esc(m.name) : '') + '</b><span>' +
      esc('Kl. ' + (r.time || '').replace(':', '.') + ' · ' + recurrenceLabel(r) + (r.chore ? ' · kun hvis ikke klaret' : '')) + '</span></span>' + icon('pencil', 18, 2) + '</button>';
  });
  return b + '</div><button class="btn dashed" data-a="rem-new">+ Ny påmindelse</button></div>';
}

function renderRemForm() {
  var f = S.form;
  var people = [['', 'Alle']].concat((S.family.members || []).map(function (m) { return [m.id, m.name]; }));
  var b = '<div class="field"><label for="r-text">Hvad skal tavlen minde om?</label><input class="input" id="r-text" data-f="text" placeholder="fx Øjenklap på" value="' + esc(f.text) + '"></div>';
  b += '<div class="field"><span class="label">Ikon</span><div class="iconpick">';
  REM_ICONS.forEach(function (ic) { b += '<button class="ip" data-a="r-icon" data-v="' + ic + '" aria-pressed="' + (f.icon === ic) + '">' + ic + '</button>'; });
  b += '</div></div>';
  b += '<div class="field"><label for="r-time">Klokkeslæt</label><input class="input" id="r-time" type="time" data-f="time" value="' + esc(f.time) + '"></div>';
  b += '<div class="field"><span class="label">Hvem er den til</span><div class="chips">' + chipsHtml(people, 'r-who', f.who) + '</div></div>';
  b += '<div class="field"><span class="label">Gentagelse</span><div class="seg"><button data-a="f-type" data-v="once" aria-pressed="' + (f.type === 'once') + '">Én gang</button>' +
    '<button data-a="f-type" data-v="rec" aria-pressed="' + (f.type === 'rec') + '">Gentages</button></div></div>';
  b += recurrenceFields(f, true);
  var m = f.who ? memberById(S.family, f.who) : null;
  var mine = m ? (S.family.chores || []).filter(function (c) { return (c.kids || []).indexOf(m.id) >= 0; }) : [];
  if (mine.length) {
    b += '<div class="field"><span class="label">Spring over, hvis pligten er klaret (valgfri)</span><div class="chips">' +
      chipsHtml([['', 'Altid']].concat(mine.map(function (c) { return [c.id, c.label]; })), 'r-chore', f.chore) + '</div>' +
      '<span class="hint">Så kan ' + esc(m.name.split(' ')[0]) + ' krydse pligten af direkte fra påmindelsen.</span></div>';
  }
  if (f.err) { b += '<div class="err" role="alert">' + esc(f.err) + '</div>'; }
  var foot = '<div style="display:flex;flex-direction:column;gap:8px"><button class="btn block" style="height:54px" data-a="r-save">Gem påmindelse</button>' +
    (f.id ? '<button class="btn danger" data-a="r-del">Slet påmindelsen</button>' : '') + '</div>';
  return sheetFrame(f.id ? 'Rediger påmindelse' : 'Ny påmindelse', b, foot, '<button class="btn ghost" data-a="occ-back">Tilbage</button>');
}

function remForm(r) {
  var d = ymd(today());
  r = r || {};
  return {
    id: r.id || '', text: r.text || '', icon: r.icon || '🔔', time: r.time || '16:00', who: r.who || '', chore: r.chore || '',
    type: r.type || 'rec', date: r.date || d, freq: r.freq || 'd', days: (r.days || [dow(parseYmd(d))]).slice(), nth: r.nth || Math.min(4, nthOf(parseYmd(d))),
    start: r.start || d, end: r.end || '', err: ''
  };
}

function saveRem() {
  var f = S.form;
  if (!f.text.trim()) { f.err = 'Skriv hvad tavlen skal minde om.'; render(); return; }
  if (!/^\d{2}:\d{2}$/.test(f.time || '')) { f.err = 'Vælg et klokkeslæt.'; render(); return; }
  if (f.type === 'rec' && (f.freq === 'w1' || f.freq === 'w2') && !f.days.length) { f.err = 'Vælg mindst én ugedag.'; render(); return; }
  var r = { id: f.id || newId(), text: f.text.trim(), icon: f.icon || '🔔', time: f.time, who: f.who || '', chore: f.who ? (f.chore || '') : '', type: f.type };
  if (f.type === 'once') { r.date = f.date; } else { r.freq = f.freq; r.days = f.days.slice(); r.nth = f.nth; r.start = f.start; r.end = f.end || ''; }
  var list = (S.family.reminders || []).filter(function (x) { return x.id !== r.id; }).concat([r]);
  fs.update('', { reminders: list }).then(function () { toast('Gemt'); S.form = null; S.sheet = { kind: 'settings' }; render(); }).catch(fail);
}

function renderColorSettings() {
  var ms = (S.family.members || []).slice().sort(function (a, b) { return (a.kind === 'child' ? 0 : 1) - (b.kind === 'child' ? 0 : 1); });
  ms.push(memberById(S.family, 'fam'));
  var b = '<div class="section"><span class="label">Familiens farver</span><div class="card col-set" style="padding:4px 16px">';
  ms.forEach(function (m) {
    var p = pal(m), open = S.colorOpen === m.id;
    b += '<div class="col-row"><button class="col-head" data-a="col-open" data-v="' + esc(m.id) + '" aria-expanded="' + open + '">' + avatar(m, 36) +
      '<span class="grow"><b>' + esc(m.name) + '</b><span>' + esc(colorName(m.color)) + '</span></span>' +
      '<span class="col-demo" style="background:' + p.tint + ';color:' + p.text + '">' + esc(m.kind === 'all' ? 'Fællesspisning' : 'Aktivitet') + '</span>' + icon(open ? 'x' : 'pencil', 16, 2.2) + '</button>';
    if (open) {
      b += '<div class="swatches">';
      COLOR_CHOICES.forEach(function (c) {
        var cp = PALETTE[c[0]];
        b += '<button class="swatch" style="background:' + cp.color + '" data-a="col-pick" data-v="' + esc(m.id) + '" data-c="' + c[0] + '" aria-pressed="' + ((m.color || 'gray') === c[0]) + '" aria-label="' + c[1] + '">' + ((m.color || 'gray') === c[0] ? '✓' : '') + '</button>';
      });
      b += '</div>';
    }
    b += '</div>';
  });
  return b + '</div><span class="hint">Farven bruges til personens aktiviteter, pligter og point på tavlen og i appen.</span></div>';
}
function colorName(c) { var x = COLOR_CHOICES.filter(function (y) { return y[0] === (c || 'gray'); })[0]; return x ? x[1] : c; }

var LEADS = [3, 5, 7, 10, 14, 21, 30, 45, 60];
function leadSelect(attr, key, cur, julStyle) {
  var opts = julStyle ? [[23, 'Fra 1. dec.'], [14, '14 dage før'], [7, '7 dage før']] : LEADS.map(function (n) { return [n, n + ' dage før']; });
  if (!opts.some(function (o) { return o[0] === cur; })) { opts.push([cur, cur + ' dage før']); }
  return '<label class="sr" for="ol-' + key + '">Nedtælling starter</label><select class="input" id="ol-' + key + '" ' + attr + '="' + esc(key) + '">' +
    opts.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === cur ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>';
}

function renderOccSettings() {
  var hs = holidaySettings(S.family);
  var b = '<div class="section"><span class="label">Mærkedage og nedtælling</span><div class="card occ-set" style="padding:4px 16px">';
  HOLIDAYS.forEach(function (d) {
    var st = hs[d.key];
    b += '<div class="row"><span class="e">' + d.emoji + '</span><span class="grow"><b>' + esc(d.title) + '</b><span>' + (d.key === 'jul' ? 'Med kalenderlys og adventskrans' : esc(d.md.slice(3) + '. ' + (d.md.slice(0, 2) === '12' ? 'december' : 'oktober'))) + '</span></span>' +
      (st.on ? leadSelect('data-occ-lead', d.key, st.lead, d.key === 'jul') : '') +
      '<input type="checkbox" aria-label="Vis ' + esc(d.title) + '" data-occ-on="' + d.key + '"' + (st.on ? ' checked' : '') + '></div>';
  });
  var td = ymd(today());
  var mine = upcoming({ occasions: S.family.occasions || [], members: S.family.members, settings: { holidays: { jul: { on: false }, nytaar: { on: false }, halloween: { on: false } } } }, td);
  var past = (S.family.occasions || []).filter(function (o) { return !mine.some(function (x) { return x.key.indexOf(o.id) === 0; }); });
  b += '<div class="occ-sub">Egne mærkedage</div>';
  mine.forEach(function (x) {
    var o = (S.family.occasions || []).filter(function (y) { return x.key.indexOf(y.id) === 0; })[0];
    var d = parseYmd(x.date);
    b += '<button class="row occ-row" data-a="occ-edit" data-v="' + esc(o.id) + '"><span class="e">' + x.emoji + '</span><span class="grow"><b>' + esc(x.title) + '</b><span>' +
      esc(d.getDate() + '. ' + monthName(d) + (o.yearly ? ' · hvert år' : ' ' + d.getFullYear()) + ' · om ' + x.days + ' dage') + '</span></span>' + icon('pencil', 18, 2) + '</button>';
  });
  past.forEach(function (o) {
    b += '<button class="row occ-row" style="opacity:.6" data-a="occ-edit" data-v="' + esc(o.id) + '"><span class="e">' + (TYPES[o.type] || TYPES.other).emoji + '</span><span class="grow"><b>' + esc(o.title) + '</b><span>Overstået</span></span>' + icon('pencil', 18, 2) + '</button>';
  });
  b += '</div><button class="btn dashed" data-a="occ-new">+ Tilføj mærkedag</button>' +
    '<span class="hint">Fødselsdage, ferier og andre dage tæller ned på tavlen. På selve dagen er der konfetti og lyd.</span></div>';
  return b;
}

function renderOccForm() {
  var f = S.form;
  var bday = f.type === 'birthday';
  var b = '<div class="field"><span class="label">Hvad er det</span><div class="chips">';
  Object.keys(TYPES).forEach(function (k) {
    b += '<button class="chip" data-a="o-type" data-v="' + k + '" aria-pressed="' + (f.type === k) + '">' + TYPES[k].emoji + ' ' + TYPES[k].label + '</button>';
  });
  b += '</div></div>';
  if (f.type === 'other') {
    b += '<div class="field"><span class="label">Ikon</span><div class="iconpick">';
    OTHER_ICONS.forEach(function (ic) { b += '<button class="ip" data-a="o-icon" data-v="' + ic + '" aria-pressed="' + ((f.icon || '⭐') === ic) + '">' + ic + '</button>'; });
    b += '</div></div>';
  }
  b += '<div class="field"><span class="label">' + (bday ? 'Hvis fødselsdag' : 'Hvem (valgfrit)') + '</span><div class="chips">';
  (S.family.members || []).forEach(function (m) {
    b += '<button class="chip" data-a="o-who" data-v="' + esc(m.id) + '" aria-pressed="' + (f.who === m.id) + '">' + esc(m.name) + '</button>';
  });
  b += '</div></div>';
  b += '<div class="field"><label for="o-title">' + (bday ? 'Navn (hvis det ikke er en fra familien)' : 'Navn') + '</label><input class="input" id="o-title" data-f="title" value="' + esc(f.title) + '" placeholder="' + (bday ? 'fx Mormor' : 'fx Skiferie i Norge') + '"></div>';
  b += '<div class="field"><label for="o-date">' + (bday ? 'Fødselsdato' : 'Dato') + '</label><input class="input" id="o-date" type="date" data-f="date" value="' + esc(f.date) + '"></div>';
  if (!bday) { b += '<label class="toggle"><span class="grow"><b>Gentages hvert år</b></span><input type="checkbox" data-fc="yearly"' + (f.yearly ? ' checked' : '') + '></label>'; }
  b += '<div class="field"><label for="ol-form">Nedtællingen starter</label>' + leadSelect('data-f', 'lead', +f.lead, false).replace('id="ol-lead"', 'id="ol-form"') + '</div>';
  if (f.err) { b += '<div class="err" role="alert">' + esc(f.err) + '</div>'; }
  var foot = '<div style="display:flex;flex-direction:column;gap:8px"><button class="btn block" style="height:54px" data-a="o-save">Gem mærkedag</button>' +
    (f.id ? '<button class="btn danger" data-a="o-del">Slet mærkedagen</button>' : '') + '</div>';
  return sheetFrame(f.id ? 'Rediger mærkedag' : 'Ny mærkedag', b, foot, '<button class="btn ghost" data-a="occ-back">Tilbage</button>');
}

function saveOcc() {
  var f = S.form;
  var bday = f.type === 'birthday';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date || '')) { f.err = 'Vælg en dato.'; render(); return; }
  if (bday && !f.who && !f.title.trim()) { f.err = 'Vælg hvem der har fødselsdag, eller skriv et navn.'; render(); return; }
  if (!bday && !f.title.trim()) { f.err = 'Giv mærkedagen et navn.'; render(); return; }
  var o = { id: f.id || newId(), type: f.type, title: f.title.trim(), date: f.date, yearly: bday ? true : !!f.yearly, who: f.who || '', lead: +f.lead || 30, icon: f.type === 'other' ? (f.icon || '⭐') : '' };
  var list = (S.family.occasions || []).filter(function (x) { return x.id !== o.id; }).concat([o]);
  fs.update('', { occasions: list }).then(function () { toast('Gemt'); S.form = null; S.sheet = { kind: 'settings' }; render(); }).catch(fail);
}

function renderWxSettings() {
  var loc = weatherLoc(S.family);
  var q = S.wxSearch || {};
  var b = '<div class="section"><span class="label">Vejrudsigt</span><div class="card">';
  if (loc && !q.open) {
    b += '<b>' + esc(loc.name) + '</b><span class="hint">' + esc(loc.area ? loc.area + ' · ' : '') + 'Vises på tavlen og i ugeoversigten.</span>' +
      '<div class="row2"><button class="btn secondary" data-a="wx-change">Skift sted</button><button class="btn ghost" data-a="wx-off">Slå vejret fra</button></div>';
  } else {
    b += '<b>' + (loc ? 'Skift sted' : 'Vis vejret for jeres by') + '</b><span class="hint">Søg på by eller postnummer. Udsigten kommer fra Open-Meteo.</span>' +
      '<form id="wxform" style="display:flex;gap:8px"><label for="wxq" class="sr">By eller postnummer</label><input id="wxq" class="input" placeholder="fx Holte eller 2840" value="' + esc(q.q || '') + '" enterkeyhint="search"><button class="btn" type="submit">Søg</button></form>';
    if (q.busy) { b += '<span class="hint">Søger…</span>'; }
    else if (q.err) { b += '<span class="hint" style="color:var(--danger)">' + esc(q.err) + '</span>'; }
    else if (q.results && !q.results.length) { b += '<span class="hint">Fandt ingen steder. Prøv et andet navn.</span>'; }
    if (q.results && q.results.length) {
      b += '<div class="wx-results">';
      q.results.forEach(function (r, i) { b += '<button data-a="wx-pick" data-v="' + i + '"><b>' + esc(r.name) + '</b>' + (r.area ? '<span>' + esc(r.area) + '</span>' : '') + '</button>'; });
      b += '</div>';
    }
    if (loc) { b += '<button class="btn ghost" data-a="wx-cancel">Annullér</button>'; }
  }
  return b + '</div></div>';
}

function renderSettings() {
  var fam = S.family;
  var b = '';
  b += '<div class="section"><span class="label">Familien</span><div class="card"><b>' + esc(fam.name) + '</b><span class="hint">Alle forældre har samme rettigheder.</span></div></div>';
  b += '<div class="section"><span class="label">Forældre</span><div class="list">';
  (fam.parents || []).forEach(function (uid) {
    var nm = (fam.parentNames && fam.parentNames[uid]) || 'Forælder';
    b += '<div class="item"><div class="grow"><b>' + esc(nm) + '</b>' + (uid === S.user.uid ? '<span>Dig</span>' : '') + '</div>' +
      (uid !== S.user.uid ? '<button class="iconbtn" data-a="parent-del" data-v="' + esc(uid) + '" aria-label="Fjern ' + esc(nm) + '">' + icon('x', 16, 2.4) + '</button>' : '') + '</div>';
  });
  b += '</div>';
  if (S.invite) {
    var link = location.origin + location.pathname + '?join=' + S.invite.code;
    b += '<div class="card" style="text-align:center;gap:8px"><span class="label">Invitationskode · gyldig i 7 dage</span>' +
      '<div class="display" style="font-size:34px;letter-spacing:.1em">' + esc(formatCode(S.invite.code)) + '</div>' +
      '<span class="hint" style="word-break:break-all">' + esc(link) + '</span>' +
      '<div class="row2"><button class="btn secondary" data-a="invite-copy" data-v="' + esc(link) + '">' + icon('copy', 16, 2) + 'Kopiér link</button>' +
      '<button class="btn" data-a="invite-share" data-v="' + esc(link) + '">Del</button></div></div>';
  } else {
    b += '<button class="btn dashed" data-a="invite">+ Inviter forælder</button>';
  }
  b += '</div>';

  var tabUrl = location.origin + location.pathname.replace(/index\.html$/, '') + 'tablet.html';
  b += '<div class="section"><span class="label">Tavlen på tabletten</span><div class="card">' +
    '<b>Sådan sætter du tabletten op</b>' +
    '<span class="hint">1. Åbn <b>' + esc(tabUrl) + '</b> i Safari på iPad\'en.<br>2. Del › Føj til hjemmeskærm, og åbn Familio derfra.<br>3. Log ind med din Google-konto én gang – så viser den jeres familie.</span>' +
    '<button class="btn secondary" data-a="invite-copy" data-v="' + esc(tabUrl) + '">' + icon('copy', 16, 2) + 'Kopiér adressen</button></div></div>';

  var st = fam.settings || {};
  b += '<div class="section"><span class="label">Tavlen</span><div class="card" style="padding:4px 16px">' +
    '<div class="toggle"><span class="grow"><b>Nattilstand</b><span>Skærmen dæmpes med ur og morgendagens plan</span></span></div>' +
    '<div class="row2" style="padding-bottom:12px"><div class="field"><label for="s-nf">Fra</label><input class="input" id="s-nf" type="time" data-set="nightFrom" value="' + esc(st.nightFrom || '21:00') + '"></div>' +
    '<div class="field"><label for="s-nt">Til</label><input class="input" id="s-nt" type="time" data-set="nightTo" value="' + esc(st.nightTo || '06:00') + '"></div></div>' +
    '<div class="toggle"><span class="grow"><b>Pauseskærm</b><span>Dæmpet ur, når ingen har rørt tavlen</span></span>' +
    '<label class="sr" for="s-idle">Pauseskærm efter</label><select class="input" id="s-idle" data-set="idleMin" style="width:140px;height:44px">' +
    [['2', 'Efter 2 min'], ['5', 'Efter 5 min'], ['10', 'Efter 10 min'], ['30', 'Efter 30 min'], ['0', 'Aldrig']].map(function (o) {
      var cur = st.idleMin === undefined ? '5' : String(st.idleMin);
      return '<option value="' + o[0] + '"' + (cur === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
    }).join('') + '</select></div>' +
    '<div class="toggle"><span class="grow"><b>Ny uge starter automatisk</b><span>Natten mellem søndag og mandag</span></span></div></div></div>';

  var so = st.sound || {};
  b += '<div class="section"><span class="label">Lyd på tavlen</span><div class="card" style="padding:4px 16px">' +
    '<label class="toggle"><span class="grow"><b>Lydeffekter</b><span>Blødt "pling" ved pligter, fanfare ved nåede mål</span></span><input type="checkbox" data-setb="sound.on"' + (so.on === false ? '' : ' checked') + '></label>' +
    '<div class="toggle"><span class="grow"><b>Lydstyrke</b></span><label class="sr" for="s-vol">Lydstyrke</label><select class="input" id="s-vol" data-set="sound.vol" style="width:140px;height:44px">' +
    [['lav', 'Lav'], ['mellem', 'Mellem'], ['hoej', 'Høj']].map(function (o) { return '<option value="' + o[0] + '"' + ((so.vol || 'lav') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div>' +
    '<div class="row2" style="padding:10px 0 12px"><div class="field"><label for="s-qf">Stille fra</label><input class="input" id="s-qf" type="time" data-set="sound.quietFrom" value="' + esc(so.quietFrom || '20:00') + '"></div>' +
    '<div class="field"><label for="s-qt">Stille til</label><input class="input" id="s-qt" type="time" data-set="sound.quietTo" value="' + esc(so.quietTo || '07:00') + '"></div></div>' +
    '<div style="padding-bottom:12px"><button class="btn secondary block" data-a="sound-test">Afspil testlyd på tavlen</button>' +
    '<span class="hint">Spiller også i stilletiden. Har ingen rørt tavlen siden den blev åbnet, så tryk én gang på den først.</span></div></div></div>';

  b += renderRemSettings();
  b += renderColorSettings();
  b += renderWxSettings();
  b += renderOccSettings();

  b += '<div class="section"><span class="label">Chauffører</span><div class="chips">';
  (fam.drivers || []).forEach(function (d) {
    b += '<button class="chip" data-a="driver-del" data-v="' + esc(d) + '" aria-label="Fjern ' + esc(d) + '">' + esc(d) + ' ✕</button>';
  });
  b += '</div><form id="driverform" style="display:flex;gap:8px"><label for="drivernew" class="sr">Ny chauffør</label><input id="drivernew" class="input" placeholder="fx Mormor"><button class="btn" type="submit">Tilføj</button></form></div>';


  b += '<div class="section"><span class="label">Konto</span><div class="list"><div class="item"><div class="grow"><b>' + esc(S.user.name || S.user.email) + '</b><span>' + esc(S.user.email) + '</span></div>' +
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
  if (id === 'tabletform') {
    linkTablet(document.getElementById('tabletcode').value);
  } else if (id === 'packform') {
    var v = document.getElementById('packnew').value.trim();
    var ev = findEvent(S.sheet.id);
    if (v && ev) { fs.update('events/' + ev.id, { pack: (ev.pack || []).concat([v]) }).catch(fail); }
    document.getElementById('packnew').value = '';
  } else if (id === 'wxform') {
    var q = document.getElementById('wxq').value.trim();
    S.wxSearch = { open: true, q: q, busy: true };
    document.activeElement && document.activeElement.blur && document.activeElement.blur();
    render();
    searchPlaces(q).then(function (list) {
      if (!S.wxSearch || S.wxSearch.q !== q) { return; }
      S.wxSearch.busy = false; S.wxSearch.results = list; render();
    }).catch(function () {
      if (!S.wxSearch) { return; }
      S.wxSearch.busy = false; S.wxSearch.err = 'Kunne ikke søge – tjek internettet'; render();
    });
    return;
  } else if (id === 'driverform') {
    var d = document.getElementById('drivernew').value.trim();
    if (d) { fs.update('', { drivers: FV.union(d) }).catch(fail); }
    document.getElementById('drivernew').value = '';
  }
  document.activeElement && document.activeElement.blur && document.activeElement.blur();
}

function onInput(e) {
  var t = e.target;
  if (t.hasAttribute('data-f') && S.form) { S.form[t.getAttribute('data-f')] = t.value; }
  if (t.hasAttribute('data-ob') && S.onboard) { S.onboard[t.getAttribute('data-ob')] = t.getAttribute('data-ob') === 'code' ? cleanCode(t.value) : t.value; }
  if (t.hasAttribute('data-obkid') && S.onboard) { S.onboard.kids[+t.getAttribute('data-obkid')].name = t.value; }
}

function onChange(e) {
  var t = e.target;
  if (t.hasAttribute('data-fc') && S.form) { S.form[t.getAttribute('data-fc')] = t.checked; render(); return; }
  if (t.hasAttribute('data-meal')) {
    var ds = t.getAttribute('data-meal'), v = t.value.trim();
    if ((S.meals[ds] || '') === v) { return; }
    S.meals[ds] = v;
    (v ? fs.set('meals/' + ds, { date: ds, text: v }) : fs.del('meals/' + ds)).catch(fail);
    return;
  }
  if (t.hasAttribute('data-goal')) {
    var parts = t.getAttribute('data-goal').split('.');
    var val = /Pts$/.test(parts[1]) ? Math.max(0, parseInt(t.value, 10) || 0) : t.value.trim();
    var upd = {}; upd['goals.' + parts[0] + '.' + parts[1]] = val;
    fs.update('', upd).then(function () { toast('Gemt'); }).catch(fail);
    return;
  }
  if (t.hasAttribute('data-occ-on') || t.hasAttribute('data-occ-lead')) {
    var hk = t.getAttribute('data-occ-on') || t.getAttribute('data-occ-lead');
    var hu = {};
    if (t.hasAttribute('data-occ-on')) { hu['settings.holidays.' + hk + '.on'] = t.checked; }
    else { hu['settings.holidays.' + hk + '.lead'] = +t.value; }
    fs.update('', hu).then(function () { toast('Gemt'); }).catch(fail);
    return;
  }
  if (t.hasAttribute('data-f') && S.form && t.tagName === 'SELECT') { S.form[t.getAttribute('data-f')] = t.value; return; }
  if (t.hasAttribute('data-setb')) {
    var ub = {}; ub['settings.' + t.getAttribute('data-setb')] = t.checked;
    fs.update('', ub).then(function () { toast(t.checked ? 'Lyd slået til' : 'Lyd slået fra'); }).catch(fail);
    return;
  }
  if (t.hasAttribute('data-set')) {
    var u = {}; u['settings.' + t.getAttribute('data-set')] = t.getAttribute('data-set') === 'idleMin' ? +t.value : t.value;
    fs.update('', u).then(function () { toast('Gemt'); }).catch(fail);
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
    case 'board-week':
      var bon = el.getAttribute('data-on') === '1', bnext = addDays(mondayOf(today()), 7);
      fs.update('', { 'settings.boardWeek': bon ? ymd(bnext) : '' }).then(function () {
        toast(bon ? 'Tavlen viser nu uge ' + isoWeek(bnext) : 'Tavlen viser denne uge igen');
      }).catch(fail);
      if (bon) { S.weekMon = bnext; watchMeals(); render(); }
      break;
    case 'settings': S.invite = null; S.wxSearch = null; S.sheet = { kind: 'settings' }; render(); break;
    case 'wx-change': S.wxSearch = { open: true }; render(); break;
    case 'wx-cancel': S.wxSearch = null; render(); break;
    case 'wx-off':
      if (window.confirm('Slå vejrudsigten fra på tavlen og i appen?')) { fs.update('', { 'settings.weather': null }).then(function () { toast('Vejret er slået fra'); }).catch(fail); }
      break;
    case 'wx-pick':
      var pl = S.wxSearch && S.wxSearch.results && S.wxSearch.results[+v];
      if (pl) {
        S.wxSearch = null;
        fs.update('', { 'settings.weather': { name: pl.name, area: pl.area || '', lat: pl.lat, lon: pl.lon } })
          .then(function () { toast('Vejret vises nu for ' + pl.name); }).catch(fail);
        render();
      }
      break;
    case 'close-sheet': closeSheet(); break;
    case 'logout': closeSheet(); S.onboard = null; store.signOut(); break;
    case 'google':
      S.busy = true; S.loginErr = ''; render();
      store.signInGoogle().then(function () { S.busy = false; render(); }).catch(function (err) {
        S.busy = false;
        var c = (err && err.code) || '';
        S.loginErr = /popup-closed|cancelled/.test(c) ? '' : /network/.test(c) ? 'Ingen forbindelse til internettet.' : 'Kunne ikke logge ind (' + (c || err.message) + ').';
        render();
      });
      break;
    case 'ob': S.onboard.step = v; S.onboard.err = ''; render(); break;
    case 'ob-role': S.onboard.role = v; render(); break;
    case 'ob-color':
      var ok = S.onboard.kids[+el.getAttribute('data-i')];
      ok.color = KID_COLORS[(KID_COLORS.indexOf(ok.color) + 1) % KID_COLORS.length]; render(); break;
    case 'ob-kid-add': S.onboard.kids.push({ name: '', color: KID_COLORS[S.onboard.kids.length % KID_COLORS.length] }); render(); break;
    case 'ob-kid-del': S.onboard.kids.splice(+el.getAttribute('data-i'), 1); render(); break;
    case 'ob-create': createFamily(); break;
    case 'ob-join': joinFamily(); break;
    case 'invite': createInvite(); break;
    case 'invite-copy':
      try { navigator.clipboard.writeText(v).then(function () { toast('Link kopieret'); }); } catch (x) { toast(v); }
      break;
    case 'invite-share':
      if (navigator.share) { navigator.share({ title: 'Familio', text: 'Tilslut dig vores familie i Familio – kode ' + formatCode(S.invite.code), url: v }).catch(function () {}); }
      else { try { navigator.clipboard.writeText(v); toast('Link kopieret'); } catch (x) { /* */ } }
      break;
    case 'parent-del':
      if (window.confirm('Fjern ' + ((S.family.parentNames || {})[v] || 'forælderen') + ' fra familien?')) {
        var pn = {}; pn['parentNames.' + v] = FV.deleteField();
        fs.update('', Object.assign({ parents: FV.remove(v) }, pn)).catch(fail);
      }
      break;
    case 'bonus':
      S.form = { kid: el.getAttribute('data-kid'), pts: 10, reason: BONUS_REASONS[0], custom: '', err: '' };
      S.sheet = { kind: 'bonus' }; render(); break;
    case 'sound-test': fs.update('', { 'settings.soundTest': Date.now() }).then(function () { toast('Testlyd sendt til tavlen'); }).catch(fail); break;
    case 'b-kid': f.kid = v; render(); break;
    case 'b-pts': f.pts = +v; render(); break;
    case 'b-reason': f.reason = v; f.custom = ''; render(); break;
    case 'b-save': giveBonus(); break;
    case 'b-fix': fixPoints(); break;
    case 'demo-reset': if (window.confirm('Nulstil demo-data?')) { store.reset(); closeSheet(); } break;

    case 'new-ev': S.form = blankForm(el.getAttribute('data-date')); S.sheet = { kind: 'form' }; render(); break;
    case 'open-ev': S.sheet = { kind: 'ev', id: el.getAttribute('data-id'), date: el.getAttribute('data-date') }; render(); break;
    case 'f-who': f.who = v; render(); break;
    case 'f-type': f.type = v; render(); break;
    case 'f-freq':
      f.freq = v;
      if (v === 'mw') {
        var sd = parseYmd(f.start || ymd(today()));
        f.days = [f.days.length === 1 ? f.days[0] : dow(sd)];
        if (!f.nth) { f.nth = Math.min(4, nthOf(sd)); }
      }
      render(); break;
    case 'f-nth': f.nth = +v; render(); break;
    case 'f-day1': f.days = [+v]; render(); break;
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
      if (evp) { var pk = (evp.pack || []).slice(); pk.splice(+el.getAttribute('data-i'), 1); fs.update('events/' + evp.id, { pack: pk }).catch(fail); }
      break;

    case 'del-log':
      var kind = el.getAttribute('data-kind'), lid = el.getAttribute('data-id');
      if (window.confirm('Fjern registreringen? Pointene trækkes fra.')) { fs.del((kind === 'c' ? 'completions/' : 'adjustments/') + lid).catch(fail); }
      break;
    case 'chore-pts':
      var ch = (S.family.chores || []).slice(), ci = +el.getAttribute('data-i');
      ch[ci] = Object.assign({}, ch[ci], { pts: Math.max(0, (+ch[ci].pts || 0) + (+el.getAttribute('data-d'))) });
      fs.update('', { chores: ch }).catch(fail); break;
    case 'new-chore': S.form = { i: -1, label: '', pts: 5, kids: kidsOf(S.family).map(function (k) { return k.id; }), icon: 'star', err: '' }; S.sheet = { kind: 'chore' }; render(); break;
    case 'edit-chore':
      var c = S.family.chores[+el.getAttribute('data-i')];
      S.form = { i: +el.getAttribute('data-i'), id: c.id, label: c.label, pts: c.pts, kids: (c.kids || []).slice(), icon: c.icon || 'star', err: '' };
      S.sheet = { kind: 'chore' }; render(); break;
    case 'c-kid': var ki = f.kids.indexOf(v); if (ki >= 0) { f.kids.splice(ki, 1); } else { f.kids.push(v); } render(); break;
    case 'c-icon': f.icon = v; render(); break;
    case 'c-save': saveChore(); break;
    case 'occ-new': S.form = { id: '', type: 'birthday', who: '', title: '', date: '', yearly: false, lead: 30, err: '' }; S.sheet = { kind: 'occ' }; render(); break;
    case 'occ-edit':
      var oe = (S.family.occasions || []).filter(function (x) { return x.id === v; })[0];
      if (oe) { S.form = { id: oe.id, type: oe.type || 'other', who: oe.who || '', title: oe.title || '', date: oe.date, yearly: !!oe.yearly, lead: oe.lead || 30, icon: oe.icon || '', err: '' }; S.sheet = { kind: 'occ' }; render(); }
      break;
    case 'col-open': S.colorOpen = S.colorOpen === v ? null : v; render(); break;
    case 'col-pick':
      var cc = el.getAttribute('data-c');
      if (v === 'fam') { fs.update('', { 'settings.famColor': cc }).catch(fail); }
      else { fs.update('', { members: (S.family.members || []).map(function (m) { return m.id === v ? Object.assign({}, m, { color: cc }) : m; }) }).catch(fail); }
      toast('Farven er ændret');
      break;
    case 'occ-back': S.form = null; S.sheet = { kind: 'settings' }; render(); break;
    case 'o-type': f.type = v; f.err = ''; render(); break;
    case 'o-icon': f.icon = v; render(); break;
    case 'rem-new': S.form = remForm(); S.sheet = { kind: 'rem' }; render(); break;
    case 'rem-edit':
      var re0 = (S.family.reminders || []).filter(function (x) { return x.id === v; })[0];
      if (re0) { S.form = remForm(re0); S.sheet = { kind: 'rem' }; render(); }
      break;
    case 'r-icon': f.icon = v; render(); break;
    case 'r-who': f.who = v; f.chore = ''; render(); break;
    case 'r-chore': f.chore = v; render(); break;
    case 'r-save': saveRem(); break;
    case 'r-del':
      if (window.confirm('Slet påmindelsen?')) {
        fs.update('', { reminders: (S.family.reminders || []).filter(function (x) { return x.id !== f.id; }) }).then(function () { S.form = null; S.sheet = { kind: 'settings' }; render(); }).catch(fail);
      }
      break;
    case 'o-who': f.who = f.who === v ? '' : v; f.err = ''; render(); break;
    case 'o-save': saveOcc(); break;
    case 'o-del':
      if (window.confirm('Slet mærkedagen?')) {
        fs.update('', { occasions: (S.family.occasions || []).filter(function (x) { return x.id !== f.id; }) }).then(function () { S.form = null; S.sheet = { kind: 'settings' }; render(); }).catch(fail);
      }
      break;
    case 'c-del':
      if (window.confirm('Slet pligten "' + f.label + '"? Point, der allerede er optjent, bliver stående.')) {
        var cl = (S.family.chores || []).slice(); cl.splice(f.i, 1);
        fs.update('', { chores: cl }).then(closeSheet).catch(fail);
      }
      break;

    case 'tablet-del':
      if (window.confirm('Fjern adgangen for denne tablet?')) {
        fs.update('', { tablets: FV.remove(v) }).then(function () { return store.del('tabletLinks/' + v); }).catch(fail);
      }
      break;
    case 'driver-del': if (window.confirm('Fjern ' + v + ' som chauffør?')) { fs.update('', { drivers: FV.remove(v) }).catch(fail); } break;
  }
}

function closeSheet() {
  var back = S.sheet && S.sheet.back;
  S.sheet = back || null; S.form = null;
  render();
}

function myRole() { return String((S.onboard && S.onboard.role) || '').trim(); }

function createFamily() {
  var o = S.onboard;
  o.err = '';
  if (!String(o.name).trim()) { o.err = 'Skriv familiens navn.'; }
  else if (!myRole()) { o.err = 'Vælg hvad børnene kalder dig.'; }
  else if (!o.kids.some(function (k) { return String(k.name).trim(); })) { o.err = 'Skriv mindst ét barns navn.'; }
  if (o.err) { render(); return; }
  S.busy = true; render();
  var fid = familyIdNew();
  var fam = seedFamily({ name: o.name, parentUid: S.user.uid, parentName: myRole(), kids: o.kids });
  store.set('families/' + fid, fam).then(function () {
    return store.set('users/' + S.user.uid, { familyId: fid, joinedAt: Date.now() }, true);
  }).then(function () {
    S.busy = false; S.onboard = null; toast('Familien er oprettet');
    if (location.search) { history.replaceState(null, '', location.pathname); }
  }).catch(function (e) { S.busy = false; o.err = 'Kunne ikke oprette familien: ' + ((e && (e.code || e.message)) || e); render(); });
}

function joinFamily() {
  var o = S.onboard;
  var code = cleanCode(o.code);
  o.err = '';
  if (code.length !== 8) { o.err = 'Koden skal have 8 tegn, fx KRAG-7F3Q.'; }
  else if (!myRole()) { o.err = 'Vælg hvad børnene kalder dig.'; }
  if (o.err) { render(); return; }
  S.busy = true; render();
  var fid;
  store.get('invites/' + code).then(function (inv) {
    if (!inv || !inv.familyId) { throw { msg: 'Koden findes ikke. Tjek den, eller bed om en ny.' }; }
    if (inv.expiresAt < Date.now()) { throw { msg: 'Koden er udløbet. Bed om en ny invitation.' }; }
    fid = inv.familyId;
    var u = { parents: FV.union(S.user.uid), members: FV.union(adultMember(S.user.uid, myRole(), { members: [{ color: 'purple' }] })), drivers: FV.union(myRole()), joinCode: code };
    u['parentNames.' + S.user.uid] = myRole();
    return store.update('families/' + fid, u);
  }).then(function () {
    return store.set('users/' + S.user.uid, { familyId: fid, joinedAt: Date.now() }, true);
  }).then(function () {
    S.busy = false; S.onboard = null; toast('Velkommen i familien!');
    if (location.search) { history.replaceState(null, '', location.pathname); }
  }).catch(function (e) {
    S.busy = false;
    o.err = (e && e.msg) || 'Kunne ikke tilslutte: ' + ((e && (e.code || e.message)) || e);
    render();
  });
}

function createInvite() {
  var code = randomCode(8);
  store.set('invites/' + code, { familyId: S.fid, createdBy: S.user.uid, expiresAt: Date.now() + 7 * 24 * 3600 * 1000 })
    .then(function () { S.invite = { code: code }; render(); }).catch(fail);
}

function linkTablet(raw) {
  var code = cleanCode(raw);
  if (code.length !== 6) { toast('Koden fra tavlen har 6 tegn'); return; }
  store.get('pairing/' + code).then(function (p) {
    if (!p || !p.uid) { throw { msg: 'Koden findes ikke – tjek tavlen og prøv igen.' }; }
    return fs.update('', { tablets: FV.union(p.uid) })
      .then(function () { return store.set('tabletLinks/' + p.uid, { familyId: S.fid, at: Date.now() }); })
      .then(function () { return store.del('pairing/' + code).catch(function () {}); });
  }).then(function () { toast('Tabletten er tilknyttet'); var i = document.getElementById('tabletcode'); if (i) { i.value = ''; } })
    .catch(function (e) { toast((e && e.msg) || 'Kunne ikke tilknytte: ' + ((e && (e.code || e.message)) || e)); });
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
  else {
    ev.days = f.freq === 'mw' ? [f.days[0]] : f.days.slice().sort(); ev.freq = f.freq; ev.start = f.start; ev.end = f.end || '';
    if (f.freq === 'mw') { ev.nth = +f.nth || 1; }
  }
  var id = f.id || newId();
  fs.set('events/' + id, ev).then(function () {
    toast(f.id ? 'Ændringer gemt' : 'Aktiviteten er gemt');
    S.sheet = null; S.form = null; render();
  }).catch(fail);
}

function deleteEvent() {
  var ev = findEvent(S.sheet.id);
  if (!ev) { return; }
  var msg = ev.type === 'once' ? 'Slet "' + ev.title + '"?' : 'Slet HELE serien "' + ev.title + '"? Vil du kun aflyse én gang, så brug "Aflys kun".';
  if (!window.confirm(msg)) { return; }
  fs.del('events/' + ev.id).then(function () { toast('Slettet'); S.sheet = null; render(); }).catch(fail);
}

function setCancelled(on) {
  var ev = findEvent(S.sheet.id), ds = S.sheet.date;
  if (!ev) { return; }
  var u = {}; u['exceptions.' + ds + '.cancelled'] = on ? true : FV.deleteField();
  fs.update('events/' + ev.id, u).then(function () { toast(on ? 'Aflyst denne gang' : 'Genåbnet'); }).catch(fail);
}

function setDriver(name) {
  var ev = findEvent(S.sheet.id), ds = S.sheet.date;
  if (!ev) { return; }
  if (ev.type === 'once') { fs.update('events/' + ev.id, { driver: name }).catch(fail); return; }
  var u = {}; u['exceptions.' + ds + '.driver'] = name === (ev.driver || '') ? FV.deleteField() : name;
  fs.update('events/' + ev.id, u).catch(fail);
}

function setDriverSeries() {
  var ev = findEvent(S.sheet.id), ds = S.sheet.date;
  var o = eventsOn([ev], ds)[0];
  if (!ev || !o) { return; }
  var u = { driver: o.driver || '' }; u['exceptions.' + ds + '.driver'] = FV.deleteField();
  fs.update('events/' + ev.id, u).then(function () { toast('Fast chauffør opdateret'); }).catch(fail);
}

var BONUS_REASONS = ['Hjalp uden at blive spurgt', 'Ekstra opgave', 'God ved sin søskende', 'Flot opførsel'];

function myName() { return ((S.family && S.family.parentNames) || {})[S.user.uid] || (S.user.name || '').split(' ')[0] || 'forælder'; }

function giveBonus() {
  var f = S.form;
  var custom = (document.getElementById('b-custom') || {}).value;
  var reason = String(custom || '').trim() || f.reason;
  fs.add('adjustments', { date: ymd(today()), kid: f.kid, pts: f.pts, reason: reason, kind: 'bonus', byName: myName(), at: Date.now() })
    .then(function () { toast('+' + f.pts + ' bonuspoint til ' + memberById(S.family, f.kid).name); S.sheet = null; S.form = null; render(); }).catch(fail);
}

function fixPoints() {
  var f = S.form;
  if (!window.confirm('Træk 5 point fra ' + memberById(S.family, f.kid).name + '? Brug det kun til at rette fejl.')) { return; }
  fs.add('adjustments', { date: ymd(today()), kid: f.kid, pts: -5, reason: 'Rettelse', kind: 'fix', byName: myName(), at: Date.now() })
    .then(function () { toast('5 point trukket fra'); S.sheet = null; S.form = null; render(); }).catch(fail);
}

function renderBonus() {
  var f = S.form;
  var kids = kidsOf(S.family).map(function (k) { return [k.id, k.name]; });
  var b = '<div class="field"><span class="label">Til</span><div class="chips">' + chipsHtml(kids, 'b-kid', f.kid) + '</div></div>' +
    '<div class="field"><span class="label">Point</span><div class="chips pts6">' + chipsHtml([['5', '+5'], ['10', '+10'], ['15', '+15'], ['20', '+20'], ['25', '+25'], ['30', '+30']], 'b-pts', String(f.pts)) + '</div></div>' +
    '<div class="field"><span class="label">Hvorfor</span><div class="chips">' + chipsHtml(BONUS_REASONS.map(function (r) { return [r, r]; }), 'b-reason', f.reason) + '</div>' +
    '<label class="sr" for="b-custom">Egen grund</label><input class="input" id="b-custom" placeholder="Eller skriv din egen grund"></div>' +
    '<p class="hint">Bonussen vises med det samme som en fejring på tavlen.</p>';
  var foot = '<div style="display:flex;flex-direction:column;gap:8px"><button class="btn block" style="height:54px" data-a="b-save">Giv +' + f.pts + ' point</button>' +
    '<button class="btn ghost" style="font-size:14px;color:var(--muted)" data-a="b-fix">Ret en fejl: træk 5 point fra</button></div>';
  return sheetFrame('Giv bonus', b, foot, '<button class="btn ghost" data-a="close-sheet">Annuller</button>');
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
  fs.update('', { chores: list }).then(function () { toast('Pligten er gemt'); closeSheet(); }).catch(fail);
}

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(function () {});
}

boot();
