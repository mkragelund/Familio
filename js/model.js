// Familio – datamodel: datoer, gentagelser, point og startdata.
// Skrevet i ES2017 (ingen ?. eller ??) så det også kører på ældre iPads.

export var DAY_NAMES = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'];
export var DAY_SHORT = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];
export var DAY_2 = ['Ma', 'Ti', 'On', 'To', 'Fr', 'Lø', 'Sø'];
export var MONTHS = ['januar', 'februar', 'marts', 'april', 'maj', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'december'];
export var MONTHS_SHORT = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

export function pad(n) { return n < 10 ? '0' + n : '' + n; }
export function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
export function parseYmd(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
export function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
export function today() { var n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
// 1 = mandag … 7 = søndag
export function dow(d) { return ((d.getDay() + 6) % 7) + 1; }
export function mondayOf(d) { return addDays(d, -(dow(d) - 1)); }
export function weekDays(monday) { var a = []; for (var i = 0; i < 7; i++) { a.push(addDays(monday, i)); } return a; }
export function monthKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
export function monthName(d) { return MONTHS[d.getMonth()]; }

export function isoWeek(d) {
  var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  var dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  var y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - y0) / 86400000 + 1) / 7);
}

export function shortDate(d) { return d.getDate() + '. ' + MONTHS_SHORT[d.getMonth()]; }
export function longDate(d) { return DAY_NAMES[dow(d) - 1] + ' ' + d.getDate() + '. ' + MONTHS[d.getMonth()]; }

export function weekRangeLabel(monday) {
  var sun = addDays(monday, 6);
  if (monday.getMonth() === sun.getMonth()) {
    return monday.getDate() + '.–' + sun.getDate() + '. ' + MONTHS[sun.getMonth()];
  }
  return monday.getDate() + '. ' + MONTHS_SHORT[monday.getMonth()] + ' – ' + sun.getDate() + '. ' + MONTHS_SHORT[sun.getMonth()];
}

function weeksBetween(a, b) {
  return Math.round((mondayOf(b) - mondayOf(a)) / (7 * 86400000));
}

// Forekommer en begivenhed på datoen (YYYY-MM-DD)?
export function occursOn(ev, dateStr) {
  if (!ev) { return false; }
  if (ev.type === 'once') {
    var start = ev.date;
    var end = ev.endDate && ev.endDate >= ev.date ? ev.endDate : ev.date;
    return !!start && dateStr >= start && dateStr <= end;
  }
  if (!ev.start || dateStr < ev.start) { return false; }
  if (ev.end && dateStr > ev.end) { return false; }
  var d = parseYmd(dateStr);
  if (ev.freq === 'd') { return true; }
  if (ev.freq === 'm1') {
    return parseYmd(ev.start).getDate() === d.getDate();
  }
  if (ev.freq === 'mw') {
    // fx "1. søndag i måneden" (nth 1–4) eller "sidste søndag" (nth -1)
    var wd = (ev.days || [])[0];
    if (!wd || dow(d) !== wd) { return false; }
    var nth = +ev.nth || 1;
    if (nth === -1) { return addDays(d, 7).getMonth() !== d.getMonth(); }
    return Math.ceil(d.getDate() / 7) === nth;
  }
  var days = ev.days || [];
  if (days.indexOf(dow(d)) < 0) { return false; }
  if (ev.freq === 'w2') {
    return weeksBetween(parseYmd(ev.start), d) % 2 === 0;
  }
  return true;
}

function timeKey(ev) { return ev.allDay ? '00:00' : (ev.from || '99:99'); }

// Begivenheder på en dato, med evt. undtagelse (aflyst / anden chauffør)
export function eventsOn(events, dateStr, opts) {
  var tabletOnly = opts && opts.tabletOnly;
  var out = [];
  (events || []).forEach(function (ev) {
    if (tabletOnly && ev.showOnTablet === false) { return; }
    if (!occursOn(ev, dateStr)) { return; }
    var ex = (ev.exceptions && ev.exceptions[dateStr]) || {};
    out.push({
      ev: ev,
      date: dateStr,
      cancelled: !!ex.cancelled,
      driver: ex.driver !== undefined ? ex.driver : (ev.driver || '')
    });
  });
  out.sort(function (a, b) { return timeKey(a.ev) < timeKey(b.ev) ? -1 : timeKey(a.ev) > timeKey(b.ev) ? 1 : 0; });
  return out;
}

export function timeLabel(ev) {
  if (ev.allDay) { return 'Hele dagen'; }
  var f = (ev.from || '').replace(':', '.');
  var t = (ev.to || '').replace(':', '.');
  return t ? f + '–' + t : f;
}

export function recurrenceLabel(ev) {
  if (ev.type === 'once') {
    if (ev.endDate && ev.endDate > ev.date) { return 'Én gang · ' + shortDate(parseYmd(ev.date)) + ' – ' + shortDate(parseYmd(ev.endDate)); }
    return 'Én gang';
  }
  if (ev.freq === 'd') { return 'Hver dag'; }
  var f = ev.freq === 'w2' ? 'Hver 2. uge' : ev.freq === 'm1' ? 'Hver måned' : 'Hver uge';
  if (ev.freq === 'm1') { return f + ' d. ' + parseYmd(ev.start).getDate() + '.'; }
  if (ev.freq === 'mw') { return nthLabel(ev.nth) + ' ' + DAY_NAMES[((ev.days || [7])[0]) - 1].toLowerCase() + ' i hver måned'; }
  var names = (ev.days || []).slice().sort().map(function (n) { return DAY_NAMES[n - 1].toLowerCase(); });
  return f + (names.length ? ' · ' + names.join(', ') : '');
}

export function nthLabel(n) { n = +n || 1; return n === -1 ? 'Sidste' : n + '.'; }
export function nthOf(d) { return Math.ceil(d.getDate() / 7); }

// Point
export function sumPoints(completions, adjustments, kid, from, to) {
  var s = 0;
  (completions || []).forEach(function (c) { if (c.kid === kid && c.date >= from && c.date <= to) { s += +c.pts || 0; } });
  (adjustments || []).forEach(function (a) { if (a.kid === kid && a.date >= from && a.date <= to) { s += +a.pts || 0; } });
  return s;
}

export function periodBounds(d) {
  var mon = mondayOf(d);
  var first = new Date(d.getFullYear(), d.getMonth(), 1);
  var last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { weekFrom: ymd(mon), weekTo: ymd(addDays(mon, 6)), monthFrom: ymd(first), monthTo: ymd(last) };
}

export function completionId(dateStr, choreId, kid) { return dateStr + '_' + choreId + '_' + kid; }
export function packedId(dateStr, eventId, idx) { return dateStr + '_' + eventId + '_' + idx; }

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Koder og id'er
var CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function randomCode(n) {
  var out = '';
  var buf = null;
  try { buf = new Uint32Array(n); (window.crypto || window.msCrypto).getRandomValues(buf); } catch (e) { buf = null; }
  for (var i = 0; i < n; i++) {
    var r = buf ? buf[i] : Math.floor(Math.random() * 4294967296);
    out += CODE_ALPHABET.charAt(r % CODE_ALPHABET.length);
  }
  return out;
}
export function familyIdNew() { return 'f' + randomCode(11).toLowerCase(); }
export function formatCode(c) { c = String(c || '').toUpperCase(); return c.length === 8 ? c.slice(0, 4) + '-' + c.slice(4) : c; }
export function cleanCode(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

export var KID_COLORS = ['blue', 'orange', 'green', 'pink'];
export var ADULT_COLORS = ['purple', 'teal', 'pink', 'green'];

export function initials(name) {
  var w = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!w.length) { return '?'; }
  if (w.length === 1) { return w[0].slice(0, 3); }
  return (w[0].charAt(0) + w[1].charAt(0)).toUpperCase();
}

export var DEFAULT_GOALS = { weekPts: 120, weekReward: '', monthPts: 450, monthReward: '100 kr. i lommepenge' };

export function defaultChores(kidIds) {
  return [
    { id: 'daek', label: 'Dække bord', pts: 5, kids: kidIds.slice(), icon: 'daek' },
    { id: 'tag', label: 'Tage af bordet', pts: 5, kids: kidIds.slice(), icon: 'tag' },
    { id: 'opvask', label: 'Vaske op', pts: 10, kids: kidIds.slice(), icon: 'opvask' },
    { id: 'vaer', label: 'Rydde værelse', pts: 10, kids: kidIds.slice(), icon: 'vaer' },
    { id: 'stoev', label: 'Støvsuge', pts: 10, kids: kidIds.slice(), icon: 'stoev' }
  ];
}

// Ny familie ud fra opsætningen. kids: [{name, color}]
export function seedFamily(o) {
  var kids = (o.kids || []).filter(function (k) { return String(k.name || '').trim(); }).map(function (k, i) {
    var name = String(k.name).trim();
    return { id: 'k' + randomCode(5).toLowerCase(), name: name, short: initials(name), color: k.color || KID_COLORS[i % KID_COLORS.length], kind: 'child' };
  });
  var goals = {};
  kids.forEach(function (k) { goals[k.id] = Object.assign({}, DEFAULT_GOALS); });
  var parentNames = {};
  parentNames[o.parentUid] = o.parentName;
  return {
    name: String(o.name || '').trim() || 'Vores familie',
    parents: [o.parentUid],
    parentNames: parentNames,
    tablets: [],
    members: kids.concat([{ id: o.parentUid, name: o.parentName, short: o.parentName.length <= 4 ? o.parentName : initials(o.parentName), color: ADULT_COLORS[0], kind: 'adult' }]),
    chores: defaultChores(kids.map(function (k) { return k.id; })),
    goals: goals,
    drivers: [o.parentName],
    settings: { nightFrom: '21:00', nightTo: '06:00' },
    createdAt: Date.now()
  };
}

// Voksen-medlem når en ny forælder tilslutter sig
export function adultMember(uid, name, family) {
  var used = ((family && family.members) || []).map(function (m) { return m.color; });
  var color = ADULT_COLORS.filter(function (c) { return used.indexOf(c) < 0; })[0] || 'teal';
  return { id: uid, name: name, short: name.length <= 4 ? name : initials(name), color: color, kind: 'adult' };
}

export function memberById(family, id) {
  var ms = (family && family.members) || [];
  for (var i = 0; i < ms.length; i++) { if (ms[i].id === id) { return ms[i]; } }
  if (id === 'fam') { return { id: 'fam', name: 'Hele familien', short: 'Alle', color: (family && family.settings && family.settings.famColor) || 'gray', kind: 'all' }; }
  return { id: id, name: id, short: id, color: 'gray' };
}

export function kidsOf(family) {
  return ((family && family.members) || []).filter(function (m) { return m.kind === 'child'; });
}

export function inNight(settings, now) {
  var from = (settings && settings.nightFrom) || '21:00';
  var to = (settings && settings.nightTo) || '06:00';
  var t = pad(now.getHours()) + ':' + pad(now.getMinutes());
  if (from === to) { return false; }
  return from < to ? (t >= from && t < to) : (t >= from || t < to);
}
