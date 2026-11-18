// Familio – mærkedage og nedtælling: jul (med kalenderlys og advent), nytår, halloween,
// fødselsdage og familiens egne mærkedage.
//
// Data på familien:
//   settings.holidays = { jul: { on, lead }, nytaar: { on, lead }, halloween: { on, lead } }
//   occasions = [{ id, title, date: 'YYYY-MM-DD', type: 'birthday'|'party'|'trip'|'other', yearly, who, lead }]
import { ymd, parseYmd, addDays, memberById } from './model.js';

export var TYPES = {
  birthday: { emoji: '🎂', label: 'Fødselsdag' },
  party: { emoji: '🎉', label: 'Fest' },
  trip: { emoji: '✈️', label: 'Ferie/tur' },
  other: { emoji: '⭐', label: 'Andet' }
};

// Faste dage. lead = hvor mange dage før nedtællingen starter (jul: fra 1. december).
export var HOLIDAYS = [
  { key: 'jul', md: '12-24', title: 'Juleaften', emoji: '🎄', lead: 23, leadLabel: 'fra 1. december' },
  { key: 'nytaar', md: '12-31', title: 'Nytårsaften', emoji: '🎆', lead: 10 },
  { key: 'halloween', md: '10-31', title: 'Halloween', emoji: '🎃', lead: 10 }
];

export function holidaySettings(family) {
  var h = (family && family.settings && family.settings.holidays) || {};
  var out = {};
  HOLIDAYS.forEach(function (d) {
    var s = h[d.key] || {};
    out[d.key] = { on: s.on !== false, lead: typeof s.lead === 'number' ? s.lead : d.lead };
  });
  return out;
}

function daysBetween(a, b) { return Math.round((parseYmd(b) - parseYmd(a)) / 86400000); }

// Næste forekomst (i dag eller senere) af en dato, der gentages hvert år
function nextYearly(md, fromDs) {
  var y = +fromDs.slice(0, 4);
  var ds = y + '-' + md;
  if (md === '02-29' && !leap(y)) { ds = y + '-02-28'; }
  if (ds < fromDs) { y++; ds = y + '-' + md; if (md === '02-29' && !leap(y)) { ds = y + '-02-28'; } }
  return ds;
}
function leap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }

// Alle kommende mærkedage set fra dagen ds: [{ key, title, short, emoji, date, days, lead, who, age, kind }]
export function upcoming(family, ds) {
  var list = [];
  var hs = holidaySettings(family);
  HOLIDAYS.forEach(function (d) {
    if (!hs[d.key].on) { return; }
    var date = nextYearly(d.md, ds);
    list.push({ key: d.key + date.slice(0, 4), kind: d.key, title: d.title, short: d.title, emoji: d.emoji, date: date, days: daysBetween(ds, date), lead: hs[d.key].lead });
  });
  ((family && family.occasions) || []).forEach(function (o) {
    if (!o || !o.date) { return; }
    var t = TYPES[o.type] || TYPES.other;
    var date = o.yearly ? nextYearly(o.date.slice(5), ds) : o.date;
    if (date < ds) { return; }
    var m = o.who ? memberById(family, o.who) : null;
    var age = o.type === 'birthday' && o.yearly ? +date.slice(0, 4) - +o.date.slice(0, 4) : 0;
    var name = o.title || (m ? m.name : t.label);
    var first = name.split(' ')[0];
    var title = o.type === 'birthday' ? (age > 0 ? name + ' fylder ' + age : name + ' har fødselsdag') : name;
    var short = o.type === 'birthday' ? first + (age > 0 ? ' ' + age + ' år' : '') : name;
    list.push({
      key: o.id + date.slice(0, 4), kind: o.type || 'other', title: title, short: short, name: name, emoji: t.emoji, date: date,
      days: daysBetween(ds, date), lead: typeof o.lead === 'number' ? o.lead : 30, who: o.who || '', age: age
    });
  });
  return list.sort(function (a, b) { return a.days - b.days || (a.title < b.title ? -1 : 1); });
}

// Nedtællinger der er "i gang" (inden for lead-dage, men ikke i dag)
export function countdowns(family, ds) {
  return upcoming(family, ds).filter(function (o) { return o.days > 0 && o.days <= o.lead; });
}

// Mærkedage på selve dagen (inkl. adventssøndage)
export function todays(family, ds) {
  var l = upcoming(family, ds).filter(function (o) { return o.days === 0; });
  var n = adventSunday(ds);
  if (n && holidaySettings(family).jul.on) {
    l.push({ key: 'advent' + ds, kind: 'advent', title: n + '. søndag i advent', short: n + '. advent', emoji: '🕯️', date: ds, days: 0, advent: n });
  }
  return l;
}

export function countdownText(o) {
  if (o.days === 0) { return o.title; }
  var t = o.kind === 'jul' || o.kind === 'nytaar' || o.kind === 'halloween' ? o.title.toLowerCase() : o.title;
  if (o.days === 1) { return 'I morgen: ' + o.title; }
  return o.days + ' dage til ' + t;
}

// ---------- Advent og kalenderlys ----------
// 4. søndag i advent er søndagen på eller før 24. december
export function adventSundays(year) {
  var d24 = parseYmd(year + '-12-24');
  var a4 = addDays(d24, -d24.getDay());
  return [addDays(a4, -21), addDays(a4, -14), addDays(a4, -7), a4].map(ymd);
}
export function adventSunday(ds) {
  return adventSundays(+ds.slice(0, 4)).indexOf(ds) + 1;
}
// Hvor mange adventslys er tændt (0–4) – kun i adventstiden frem til juleaften
export function adventLit(ds) {
  var y = +ds.slice(0, 4);
  if (ds > y + '-12-24') { return 0; }
  return adventSundays(y).filter(function (s) { return s <= ds; }).length;
}
// Kalenderlys: dag 1–24 i december, ellers 0
export function candleDay(ds) {
  var m = ds.slice(5, 7), d = +ds.slice(8, 10);
  return m === '12' && d <= 24 ? d : 0;
}

// Kalenderlyset som SVG. day = dagens tal (1–24); tallene under dagens tal er brændt.
export function candleSvg(day, height) {
  var H = height || 220;
  var seg = 9, top0 = 28, base = top0 + 24 * seg;             // fuld højde ved dag 1
  var top = top0 + (day - 1) * seg;                           // lyset brænder ned
  var W = 56, cx = 28, h = '';
  h += '<defs><linearGradient id="cw" x1="0" x2="1"><stop offset="0" stop-color="#F3EEE4"/><stop offset=".45" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E6DFD2"/></linearGradient>' +
    '<radialGradient id="cg" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFD66B" stop-opacity=".55"/><stop offset="1" stop-color="#FFD66B" stop-opacity="0"/></radialGradient></defs>';
  // glød og flamme
  h += '<circle class="glow" cx="' + cx + '" cy="' + (top - 8) + '" r="22" fill="url(#cg)"/>';
  h += '<g class="flame" style="transform-origin:' + cx + 'px ' + (top - 1) + 'px"><path d="M' + cx + ' ' + (top - 24) + 'c6 8 8 13 8 17a8 8 0 0 1-16 0c0-4 2-9 8-17z" fill="#F5A623"/>' +
    '<path d="M' + cx + ' ' + (top - 15) + 'c3 4 4 7 4 9a4 4 0 0 1-8 0c0-2 1-5 4-9z" fill="#FFF3B0"/></g>';
  h += '<line x1="' + cx + '" y1="' + (top - 4) + '" x2="' + cx + '" y2="' + top + '" stroke="#3A3A3A" stroke-width="1.6"/>';
  // selve lyset
  h += '<rect x="' + (cx - 14) + '" y="' + top + '" width="28" height="' + (base - top) + '" rx="3" fill="url(#cw)" stroke="#E2D9C8"/>';
  h += '<path d="M' + (cx - 14) + ' ' + (top + 3) + 'q7 4 14 0t14 0" fill="none" stroke="#EDE6D8" stroke-width="2"/>';
  for (var n = day; n <= 24; n++) {
    var y = top0 + (n - 1) * seg;
    var today = n === day;
    if (n > day) { h += '<line x1="' + (cx - 14) + '" y1="' + y + '" x2="' + (cx + 14) + '" y2="' + y + '" stroke="#C62828" stroke-width="1"/>'; }
    h += '<text x="' + cx + '" y="' + (y + seg - 1.8) + '" text-anchor="middle" font-size="' + (today ? 8.5 : 7.5) + '" font-weight="800" font-family="Nunito, sans-serif" fill="#C62828">' + n + '</text>';
  }
  // grankvist og fod
  h += '<ellipse cx="' + cx + '" cy="' + (base + 4) + '" rx="24" ry="6" fill="#1F6B45"/>' +
    '<circle cx="' + (cx - 12) + '" cy="' + (base + 2) + '" r="3" fill="#C62828"/><circle cx="' + (cx + 13) + '" cy="' + (base + 3) + '" r="3" fill="#C62828"/><circle cx="' + (cx + 1) + '" cy="' + (base + 7) + '" r="2.6" fill="#C62828"/>';
  var vbH = base + 12;
  return '<svg class="candle" width="' + Math.round(W * H / vbH) + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + vbH + '" role="img" aria-label="Kalenderlys – ' + day + '. december">' + h + '</svg>';
}

// Adventskrans med fire lys; lit = antal tændte
export function wreathSvg(lit, width) {
  var W = width || 150, h = '';
  h += '<ellipse cx="75" cy="58" rx="66" ry="14" fill="#1F6B45"/><ellipse cx="75" cy="55" rx="58" ry="9" fill="#2F8A5B"/>';
  [26, 58, 92, 124].forEach(function (x, i) {
    var on = i < lit;
    h += '<rect x="' + (x - 7) + '" y="20" width="14" height="34" rx="2" fill="' + (on ? '#C62828' : '#B71C1C') + '" opacity="' + (on ? 1 : 0.75) + '"/>';
    h += '<line x1="' + x + '" y1="15" x2="' + x + '" y2="20" stroke="#3A3A3A" stroke-width="1.4"/>';
    if (on) {
      h += '<circle class="glow" cx="' + x + '" cy="9" r="11" fill="#FFD66B" opacity=".35"/>' +
        '<g class="flame" style="transform-origin:' + x + 'px 16px"><path d="M' + x + ' 0c4 5 5 8 5 10a5 5 0 0 1-10 0c0-2 1-5 5-10z" fill="#F5A623"/><path d="M' + x + ' 6c2 2 2.5 4 2.5 5a2.5 2.5 0 0 1-5 0c0-1 .5-3 2.5-5z" fill="#FFF3B0"/></g>';
    }
  });
  h += '<circle cx="40" cy="62" r="3" fill="#C62828"/><circle cx="75" cy="66" r="3" fill="#C62828"/><circle cx="110" cy="62" r="3" fill="#C62828"/>';
  return '<svg class="wreath" width="' + W + '" height="' + Math.round(W * 74 / 150) + '" viewBox="0 0 150 74" role="img" aria-label="Adventskrans – ' + lit + ' lys tændt">' + h + '</svg>';
}
