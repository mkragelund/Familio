// Familio – mærkedage og nedtælling: jul (med kalenderlys og advent), nytår, halloween,
// fødselsdage og familiens egne mærkedage.
//
// Data på familien:
//   settings.holidays = { jul: { on, lead }, nytaar: { on, lead }, halloween: { on, lead } }
//   occasions = [{ id, title, date: 'YYYY-MM-DD', type: 'birthday'|'party'|'trip'|'other', yearly, who, lead }]
import { ymd, parseYmd, addDays, memberById } from './model.js';

// Ikoner man kan vælge til "Andet" (og fest)
export var OTHER_ICONS = ['⭐', '⚽', '🏊', '🎭', '🎬', '🎤', '🎨', '🎵', '🏕️', '🎡', '🐶', '🦷', '📚', '🎓', '🚗', '🧁'];

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
      key: o.id + date.slice(0, 4), kind: o.type || 'other', title: title, short: short, name: name, emoji: (o.type === 'other' || o.type === 'party') && o.icon ? o.icon : t.emoji, icon: o.icon || '', date: date,
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

// ---------- Sjove nedtællingsfigurer ----------
// p = hvor langt vi er på vej mod dagen (0 = nedtællingen er lige startet, 1 = i dag)
export function progressOf(o) {
  if (!o || o.days <= 0) { return 1; }
  var lead = Math.max(1, o.lead || 30);
  return Math.max(0, Math.min(1, 1 - o.days / lead));
}

var ART = {
  // Gave der pakkes op: låget løftes og vipper, og der titter stjerner frem
  birthday: function (p, c) {
    var lift = 16 * p, tilt = -24 * p;
    var h = '';
    if (p > 0.25) {
      var a = Math.min(1, (p - 0.25) / 0.6);
      h += '<g opacity="' + a.toFixed(2) + '"><circle cx="32" cy="30" r="' + (6 + 10 * p).toFixed(1) + '" fill="#FFE27A" opacity=".55"/>' +
        '<path d="M32 ' + (30 - 12 * p).toFixed(1) + 'l2 4.5 4.8.6-3.5 3.3.9 4.7-4.2-2.3-4.2 2.3.9-4.7-3.5-3.3 4.8-.6z" fill="#F5B700"/></g>';
    }
    h += '<rect x="13" y="32" width="38" height="26" rx="3" fill="' + c + '"/><rect x="29" y="32" width="6" height="26" fill="#F5B700"/>';
    h += '<g transform="rotate(' + tilt.toFixed(1) + ' 10 30) translate(0 ' + (-lift).toFixed(1) + ')"><rect x="10" y="24" width="44" height="10" rx="2.5" fill="' + c + '" stroke="rgba(0,0,0,.12)"/>' +
      '<rect x="29" y="24" width="6" height="10" fill="#F5B700"/>' +
      '<path d="M32 24c-6-9-15-6-10-1 2 2 6 1 10 1zM32 24c6-9 15-6 10-1-2 2-6 1-10 1z" fill="#F5B700"/></g>';
    return h;
  },
  // Balloner der pustes op
  party: function (p) {
    var s = 0.35 + 0.65 * p, h = '';
    [[20, '#E05297', 0], [32, '#2F6FDE', -6], [44, '#F5B700', 2]].forEach(function (b) {
      var r = 9 * s, cy = 30 + b[2] - 6 * p;
      h += '<path d="M' + b[0] + ' ' + (cy + r * 1.15).toFixed(1) + 'q-3 8 0 ' + (60 - cy - r * 1.15 - 2).toFixed(1) + '" stroke="#8A8F9C" stroke-width="1.2" fill="none"/>' +
        '<ellipse cx="' + b[0] + '" cy="' + cy.toFixed(1) + '" rx="' + (r * 0.88).toFixed(1) + '" ry="' + r.toFixed(1) + '" fill="' + b[1] + '"/>' +
        '<ellipse cx="' + (b[0] - r * 0.3).toFixed(1) + '" cy="' + (cy - r * 0.35).toFixed(1) + '" rx="' + (r * 0.18).toFixed(1) + '" ry="' + (r * 0.3).toFixed(1) + '" fill="#fff" opacity=".45"/>';
    });
    return h;
  },
  // Fly der flyver fra huset mod rejsemålet
  trip: function (p) {
    var x0 = 9, y0 = 48, x1 = 32, y1 = 8, x2 = 55, y2 = 44;
    var t = p, mt = 1 - t;
    var x = mt * mt * x0 + 2 * mt * t * x1 + t * t * x2, y = mt * mt * y0 + 2 * mt * t * y1 + t * t * y2;
    var dx = 2 * mt * (x1 - x0) + 2 * t * (x2 - x1), dy = 2 * mt * (y1 - y0) + 2 * t * (y2 - y1);
    var ang = Math.atan2(dy, dx) * 180 / Math.PI;
    var h = '<path d="M' + x0 + ' ' + y0 + 'Q' + x1 + ' ' + y1 + ' ' + x2 + ' ' + y2 + '" fill="none" stroke="#B9C0CC" stroke-width="1.8" stroke-dasharray="2.5 3"/>';
    h += '<path d="M3 52l6-6 6 6v8H3z" fill="#5B6070"/><rect x="7" y="54" width="4" height="6" fill="#fff"/>';
    h += '<path d="M55 58c-5-7-8-11-8-15a8 8 0 0 1 16 0c0 4-3 8-8 15z" fill="#E11D48"/><circle cx="55" cy="43" r="3" fill="#fff"/>';
    h += '<g transform="translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ') rotate(' + ang.toFixed(1) + ')"><path d="M-9 0L7-1.6c2.5 0 3 .8 3 1.6s-.5 1.6-3 1.6L-9 0z" fill="#2F6FDE"/>' +
      '<path d="M-1 -1L-6 -8h-3l3 7zM-1 1L-6 8h-3l3-7zM-7 -.8l-3-3.5h-2l2 4.3zM-7 .8l-3 3.5h-2l2-4.3z" fill="#1F4FA8"/></g>';
    return h;
  },
  // Valgt ikon i en ring, der lukker sig, og ikonet vokser frem
  icon: function (p, c, id, o) {
    var r = 26, circ = 2 * Math.PI * r;
    return '<circle cx="32" cy="32" r="' + r + '" fill="none" stroke="#ECE8DF" stroke-width="5"/>' +
      '<circle cx="32" cy="32" r="' + r + '" fill="none" stroke="' + c + '" stroke-width="5" stroke-linecap="round" stroke-dasharray="' + (circ * p).toFixed(1) + ' ' + circ.toFixed(1) + '" transform="rotate(-90 32 32)"/>' +
      '<text x="32" y="32" text-anchor="middle" dominant-baseline="central" font-size="' + (16 + 12 * p).toFixed(1) + '">' + o.icon + '</text>';
  },
  // Stjerne der fyldes op nedefra
  other: function (p, c, id) {
    var g = 'sf' + id;
    var off = (1 - p).toFixed(3);
    return '<defs><linearGradient id="' + g + '" x1="0" y1="1" x2="0" y2="0"><stop offset="' + p.toFixed(3) + '" stop-color="#F5B700"/><stop offset="' + p.toFixed(3) + '" stop-color="#F5B700" stop-opacity=".12"/></linearGradient></defs>' +
      '<path d="M32 6l7.6 15.4 17 2.5-12.3 12 2.9 16.9L32 44.8 16.8 52.8l2.9-16.9-12.3-12 17-2.5z" fill="url(#' + g + ')" stroke="#F5B700" stroke-width="2.5" stroke-linejoin="round" data-off="' + off + '"/>';
  },
  // Nytår: lunten på raketten brænder ned
  nytaar: function (p) {
    var fuse = 18 * (1 - p) + 2;
    var h = '<rect x="27" y="22" width="10" height="30" rx="2" fill="#C62828"/><path d="M27 22l5-9 5 9z" fill="#1F2430"/>' +
      '<rect x="27" y="30" width="10" height="3" fill="#F5B700"/><rect x="27" y="40" width="10" height="3" fill="#F5B700"/>' +
      '<line x1="32" y1="52" x2="32" y2="62" stroke="#8A6B3F" stroke-width="2"/>';
    var fx = 37 + fuse * 0.8, fy = 50 + fuse * 0.3;
    h += '<path d="M37 50q' + (fuse * 0.4).toFixed(1) + ' -3 ' + (fuse * 0.8).toFixed(1) + ' ' + (fuse * 0.3).toFixed(1) + '" stroke="#5B6070" stroke-width="1.6" fill="none"/>';
    h += '<g class="spark" transform="translate(' + fx.toFixed(1) + ' ' + fy.toFixed(1) + ')"><circle r="3.2" fill="#FFD66B"/><path d="M0-6v3M0 6V3M-6 0h3M6 0H3M-4-4l2 2M4 4L2 2M-4 4l2-2M4-4L2-2" stroke="#F5A623" stroke-width="1.4" stroke-linecap="round"/></g>';
    if (p >= 1) { h += '<g stroke-linecap="round" stroke-width="2"><path d="M32 8V2M24 10l-4-4M40 10l4-4M22 17h-6M42 17h6" stroke="#E11D48"/></g>'; }
    return h;
  },
  // Halloween: græskarret skæres ud og lyser op
  halloween: function (p) {
    var lit = Math.max(0, (p - 0.4) / 0.6);
    var h = '<path d="M32 18c-2-6 1-9 4-10" stroke="#3F7D3A" stroke-width="3" fill="none" stroke-linecap="round"/>' +
      '<ellipse cx="22" cy="38" rx="13" ry="17" fill="#E8741C"/><ellipse cx="42" cy="38" rx="13" ry="17" fill="#E8741C"/><ellipse cx="32" cy="38" rx="11" ry="18" fill="#F08A2B"/>';
    var face = 'M21 33l5-6 5 6zM33 33l5-6 5 6zM20 42q12 10 24 0l-4 2-3-3-3 3-3-3-3 3-3-3-3 3z';
    h += '<path d="' + face + '" fill="none" stroke="#9A3412" stroke-width="1" stroke-dasharray="2 2" opacity="' + (0.5 * (1 - p)).toFixed(2) + '"/>';
    h += '<path d="' + face + '" fill="' + (lit > 0 ? '#FFD66B' : '#7A2E0B') + '" opacity="' + Math.min(1, p * 1.4).toFixed(2) + '"/>';
    if (lit > 0) { h += '<ellipse cx="32" cy="38" rx="22" ry="20" fill="#FFD66B" opacity="' + (0.18 * lit).toFixed(2) + '"/>'; }
    return h;
  },
  jul: function (p) { return ART.other(p, '#1F6B45', 'jul'); }
};

var artN = 0;
export function occArt(o, size, color) {
  var s = size || 48;
  var f = o.kind === 'other' && o.icon && o.icon !== '⭐' ? ART.icon : (ART[o.kind] || ART.other);
  return '<svg class="occ-art ' + esc2(o.kind) + '" width="' + s + '" height="' + s + '" viewBox="0 0 64 64" aria-hidden="true">' + f(progressOf(o), color || '#7C3AED', 'a' + (artN++), o) + '</svg>';
}
function esc2(s) { return String(s || '').replace(/[^a-z0-9_-]/gi, ''); }
