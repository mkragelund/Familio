// Familio – vejrudsigt fra Open-Meteo (gratis, ingen API-nøgle).
// Stedet vælges i forældre-appen og gemmes på familien som settings.weather = { name, area, lat, lon }.
// Udsigten gemmes i browseren og hentes igen hver halve time. Er nettet nede, vises den sidste udsigt.
import { DEMO } from './store.js';
import { ymd, addDays, today } from './model.js';
import { esc } from './ui.js';

var FRESH = 30 * 60 * 1000;      // hent ny udsigt efter 30 min
var RETRY = 5 * 60 * 1000;       // vent 5 min efter en fejl
var LS_KEY = 'familio-weather';
var mem = null;                   // { key, at, data }
var inflight = false, lastTry = 0;

export function weatherLoc(family) {
  var w = family && family.settings && family.settings.weather;
  return w && typeof w.lat === 'number' && typeof w.lon === 'number' ? w : null;
}

function keyOf(loc) { return loc.lat.toFixed(3) + ',' + loc.lon.toFixed(3); }

// Returnerer udsigten for stedet (eller null) og henter i baggrunden, hvis den er gammel.
// onUpdate kaldes, når en ny udsigt er hentet.
export function getWeather(loc, onUpdate) {
  if (!loc) { return null; }
  if (DEMO) { return demoWeather(); }
  var key = keyOf(loc);
  if (!mem || mem.key !== key) {
    mem = null;
    try {
      var saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      if (saved && saved.key === key && saved.data) { mem = saved; }
    } catch (e) { /* */ }
  }
  var stale = !mem || Date.now() - mem.at > FRESH;
  if (stale && !inflight && Date.now() - lastTry > RETRY) {
    inflight = true; lastTry = Date.now();
    fetchForecast(loc).then(function (data) {
      inflight = false;
      mem = { key: key, at: Date.now(), data: data };
      try { localStorage.setItem(LS_KEY, JSON.stringify(mem)); } catch (e) { /* */ }
      if (onUpdate) { onUpdate(); }
    }).catch(function () { inflight = false; });
  }
  return mem && mem.key === key ? mem.data : null;
}

function fetchForecast(loc) {
  var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + loc.lat + '&longitude=' + loc.lon +
    '&current=temperature_2m,weather_code,is_day' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
    '&timezone=Europe%2FCopenhagen&past_days=7&forecast_days=10';
  return fetch(url).then(function (r) {
    if (!r.ok) { throw new Error('Vejret svarede ' + r.status); }
    return r.json();
  }).then(function (j) {
    var days = {};
    var d = j.daily || {};
    (d.time || []).forEach(function (t, i) {
      days[t] = {
        code: d.weather_code[i], max: d.temperature_2m_max[i], min: d.temperature_2m_min[i],
        rain: d.precipitation_probability_max ? d.precipitation_probability_max[i] : null
      };
    });
    var c = j.current || {};
    return { cur: { t: c.temperature_2m, code: c.weather_code, day: c.is_day !== 0 }, days: days };
  });
}

// Søg efter et sted (by, postnummer) – til indstillingerne i forældre-appen.
export function searchPlaces(q) {
  q = (q || '').trim();
  if (!q) { return Promise.resolve([]); }
  if (DEMO) {
    var all = [
      { name: 'Holte', area: 'Rudersdal, Region Hovedstaden', lat: 55.8157, lon: 12.4718 },
      { name: 'Søllerød', area: 'Rudersdal, Region Hovedstaden', lat: 55.8167, lon: 12.4889 },
      { name: 'Aarhus', area: 'Aarhus, Region Midtjylland', lat: 56.1567, lon: 10.2108 }
    ];
    var hit = all.filter(function (p) { return p.name.toLowerCase().indexOf(q.toLowerCase()) === 0; });
    return Promise.resolve(hit.length ? hit : all.slice(0, 2));
  }
  var digits = /^\d{4}$/.test(q);
  var url = 'https://geocoding-api.open-meteo.com/v1/search?count=8&language=da&format=json&name=' + encodeURIComponent(q) +
    (digits ? '&countryCode=DK' : '');
  return fetch(url).then(function (r) { return r.json(); }).then(function (j) {
    return (j.results || []).map(function (p) {
      var area = [p.admin2, p.admin1, p.country_code === 'DK' ? '' : p.country].filter(function (x, i, a) { return x && a.indexOf(x) === i && x !== p.name; }).join(', ');
      return { name: p.name, area: area, lat: Math.round(p.latitude * 10000) / 10000, lon: Math.round(p.longitude * 10000) / 10000 };
    });
  });
}

export function dayWeather(data, ds) { return (data && data.days && data.days[ds]) || null; }

// ---------- Tekster og ikoner ----------
export function wxText(code) {
  if (code === 0) { return 'Klart vejr'; }
  if (code === 1) { return 'Mest sol'; }
  if (code === 2) { return 'Sol og skyer'; }
  if (code === 3) { return 'Overskyet'; }
  if (code === 45 || code === 48) { return 'Tåge'; }
  if (code >= 51 && code <= 55) { return 'Støvregn'; }
  if (code === 56 || code === 57 || code === 66 || code === 67) { return 'Isslag'; }
  if (code === 61) { return 'Let regn'; }
  if (code === 63) { return 'Regn'; }
  if (code === 65) { return 'Kraftig regn'; }
  if (code === 71) { return 'Let sne'; }
  if (code === 73 || code === 75 || code === 77) { return 'Sne'; }
  if (code >= 80 && code <= 82) { return 'Regnbyger'; }
  if (code === 85 || code === 86) { return 'Snebyger'; }
  if (code >= 95) { return 'Torden'; }
  return '';
}

function kindOf(code, night) {
  if (code === 0 || code === 1) { return night ? 'moon' : 'sun'; }
  if (code === 2) { return night ? 'mooncloud' : 'partly'; }
  if (code === 3) { return 'cloud'; }
  if (code === 45 || code === 48) { return 'fog'; }
  if (code >= 51 && code <= 57) { return 'drizzle'; }
  if (code === 66 || code === 67) { return 'sleet'; }
  if (code >= 61 && code <= 65) { return 'rain'; }
  if (code >= 71 && code <= 77) { return 'snow'; }
  if (code >= 80 && code <= 82) { return night ? 'rain' : 'showers'; }
  if (code === 85 || code === 86) { return 'snow'; }
  if (code >= 95) { return 'thunder'; }
  return 'cloud';
}

var C_SUN = '#F5A623', C_CLOUD = '#B9C0CC', C_CLOUD2 = '#DDE1E8', C_RAIN = '#2F6FDE', C_SNOW = '#7FB2F0', C_MOON = '#E9C46A';
function sun(cx, cy, r) {
  var rays = '';
  for (var i = 0; i < 8; i++) {
    var a = i * Math.PI / 4, x1 = cx + Math.cos(a) * (r + 2.2), y1 = cy + Math.sin(a) * (r + 2.2), x2 = cx + Math.cos(a) * (r + 4.6), y2 = cy + Math.sin(a) * (r + 4.6);
    rays += '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '"/>';
  }
  return '<g stroke="' + C_SUN + '" stroke-width="2" stroke-linecap="round">' + rays + '</g><circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + C_SUN + '"/>';
}
function moon(cx, cy, r) {
  return '<path fill="' + C_MOON + '" d="M' + (cx + r * 0.35) + ' ' + (cy - r) + 'a' + r + ' ' + r + ' 0 1 0 ' + (r * 0.65) + ' ' + (r * 1.55) + 'a' + (r * 0.85) + ' ' + (r * 0.85) + ' 0 0 1 -' + (r * 0.65) + ' -' + (r * 1.55) + 'z"/>';
}
function cloud(dy, fill) {
  var f = fill || C_CLOUD;
  return '<g fill="' + f + '" transform="translate(0 ' + (dy || 0) + ')"><circle cx="11" cy="20" r="5"/><circle cx="17.5" cy="16" r="7"/><circle cx="24" cy="20.5" r="4.5"/><rect x="11" y="19" width="13" height="6"/></g>';
}
function drops(color, n) {
  var xs = n === 2 ? [13, 20] : [11, 17, 23], h = '';
  xs.forEach(function (x) { h += '<line x1="' + x + '" y1="25" x2="' + (x - 1.5) + '" y2="29.5"/>'; });
  return '<g stroke="' + color + '" stroke-width="2.2" stroke-linecap="round">' + h + '</g>';
}
function flakes() {
  return '<g fill="' + C_SNOW + '"><circle cx="11" cy="27" r="1.8"/><circle cx="17" cy="29" r="1.8"/><circle cx="23" cy="27" r="1.8"/></g>';
}

var SHAPES = {
  sun: function () { return sun(16, 16, 6.5); },
  moon: function () { return moon(13, 16, 8); },
  partly: function () { return sun(12, 11, 5) + cloud(3); },
  mooncloud: function () { return moon(10, 10, 6) + cloud(3); },
  cloud: function () { return '<g transform="translate(6 -4)">' + cloud(0, C_CLOUD2) + '</g>' + cloud(2); },
  fog: function () { return cloud(-3) + '<g stroke="' + C_CLOUD + '" stroke-width="2.2" stroke-linecap="round"><line x1="7" y1="26" x2="25" y2="26"/><line x1="10" y1="29.5" x2="27" y2="29.5"/></g>'; },
  drizzle: function () { return cloud(-3) + drops(C_RAIN, 2); },
  rain: function () { return cloud(-3) + drops(C_RAIN, 3); },
  showers: function () { return sun(10, 9, 4) + cloud(-1) + drops(C_RAIN, 2); },
  sleet: function () { return cloud(-3) + drops(C_RAIN, 2) + '<circle cx="23" cy="27" r="1.8" fill="' + C_SNOW + '"/>'; },
  snow: function () { return cloud(-3) + flakes(); },
  thunder: function () { return cloud(-3) + '<path fill="' + C_SUN + '" d="M17 21l-4 6h3l-1.5 4.5L20 25h-3l1.5-4z"/>'; }
};

export function wxIcon(code, size, night, label) {
  var s = size || 24;
  var a = label ? 'role="img" aria-label="' + esc(label) + '"' : 'aria-hidden="true"';
  var shape = SHAPES[kindOf(code, night)] || SHAPES.cloud;
  return '<svg class="wx-ic" width="' + s + '" height="' + s + '" viewBox="0 0 32 32" ' + a + '>' + shape() + '</svg>';
}

export function deg(t) {
  if (typeof t !== 'number') { return '–'; }
  var r = Math.round(t);
  return (r === 0 ? 0 : r) + '°';
}

// Kort vejrmærke til en dag: ikon + høj/lav
export function dayBadge(data, ds, size) {
  var w = dayWeather(data, ds);
  if (!w) { return ''; }
  return '<span class="wx-day" title="' + esc(wxText(w.code)) + '">' + wxIcon(w.code, size || 22, false, wxText(w.code)) +
    '<span><b>' + deg(w.max) + '</b><i>' + deg(w.min) + '</i></span></span>';
}

// ---------- Demo: opdigtet, men stabil udsigt ----------
function demoWeather() {
  var codes = [3, 61, 2, 0, 80, 63, 1, 2, 3, 71, 45, 0, 95, 2, 61, 3, 1];
  var days = {};
  var start = addDays(today(), -7);
  for (var i = 0; i < 17; i++) {
    var d = addDays(start, i), ds = ymd(d);
    var n = d.getDate() + d.getMonth() * 31;
    var code = codes[n % codes.length];
    var max = 3 + (n * 5) % 7, min = max - 3 - (n % 3);
    var rain = code >= 51 ? 60 + (n * 13) % 35 : (n * 11) % 25;
    days[ds] = { code: code, max: max, min: min, rain: rain };
  }
  var td = days[ymd(today())];
  var h = new Date().getHours();
  return { cur: { t: td.min + 2.3, code: td.code, day: h >= 7 && h < 17 }, days: days, demo: true };
}
