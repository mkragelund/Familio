// Familio – vejrudsigt fra Open-Meteo (gratis, ingen API-nøgle).
// Stedet vælges i forældre-appen og gemmes på familien som settings.weather = { name, area, lat, lon }.
// Udsigten gemmes i browseren og hentes igen hver halve time. Er nettet nede, vises den sidste udsigt.
import { DEMO } from './store.js';
import { ymd, addDays, today, parseYmd, pad, DAY_NAMES, MONTHS_SHORT } from './model.js';
import { esc } from './ui.js';

var FRESH = 30 * 60 * 1000;      // hent ny udsigt efter 30 min
var RETRY = 5 * 60 * 1000;       // vent 5 min efter en fejl
var LS_KEY = 'familio-weather-2';
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
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,sunrise,sunset' +
    '&hourly=temperature_2m,weather_code,precipitation_probability,is_day' +
    '&wind_speed_unit=ms&timezone=Europe%2FCopenhagen&past_days=7&forecast_days=10';
  return fetch(url).then(function (r) {
    if (!r.ok) { throw new Error('Vejret svarede ' + r.status); }
    return r.json();
  }).then(function (j) {
    var days = {};
    var d = j.daily || {};
    (d.time || []).forEach(function (t, i) {
      days[t] = {
        code: d.weather_code[i], max: d.temperature_2m_max[i], min: d.temperature_2m_min[i],
        rain: d.precipitation_probability_max ? d.precipitation_probability_max[i] : null,
        mm: d.precipitation_sum ? d.precipitation_sum[i] : null,
        wind: d.wind_speed_10m_max ? d.wind_speed_10m_max[i] : null,
        gust: d.wind_gusts_10m_max ? d.wind_gusts_10m_max[i] : null,
        rise: d.sunrise ? String(d.sunrise[i]).slice(11, 16) : '',
        set: d.sunset ? String(d.sunset[i]).slice(11, 16) : ''
      };
    });
    // Time for time – kun fra i dag og to døgn frem (resten bruges ikke)
    var hours = [], hh = j.hourly || {}, from = ymd(today());
    (hh.time || []).forEach(function (t, i) {
      if (t.slice(0, 10) < from || hours.length >= 48) { return; }
      hours.push({ t: t, temp: hh.temperature_2m[i], code: hh.weather_code[i], rain: hh.precipitation_probability ? hh.precipitation_probability[i] : null, day: hh.is_day ? hh.is_day[i] !== 0 : true });
    });
    var c = j.current || {};
    return { cur: { t: c.temperature_2m, code: c.weather_code, day: c.is_day !== 0 }, days: days, hours: hours };
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
    var mm = code >= 51 ? Math.round((1 + (n * 7) % 9) * 10) / 10 : 0;
    var wind = 3 + (n * 3) % 9;
    days[ds] = { code: code, max: max, min: min, rain: rain, mm: mm, wind: wind, gust: wind + 4 + n % 5, rise: '07:5' + (n % 10), set: '15:4' + (n % 10) };
  }
  var hours = [];
  for (var hI = 0; hI < 48; hI++) {
    var dd = addDays(today(), Math.floor(hI / 24)), dw = days[ymd(dd)], hr = hI % 24;
    var curve = Math.sin((hr - 8) / 24 * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5;
    var hc = hr >= 10 && hr <= 15 ? dw.code : (dw.code >= 51 ? 3 : dw.code === 0 ? 1 : dw.code);
    hours.push({ t: ymd(dd) + 'T' + pad(hr) + ':00', temp: dw.min + (dw.max - dw.min) * (1 - curve), code: hc, rain: dw.code >= 51 && hr >= 9 && hr <= 18 ? dw.rain : Math.round(dw.rain / 3), day: hr >= 8 && hr < 16 });
  }
  var td = days[ymd(today())];
  var h = new Date().getHours();
  return { cur: { t: td.min + 2.3, code: td.code, day: h >= 7 && h < 17 }, days: days, hours: hours, demo: true };
}

// ---------- Overblik over ugens vejr (tavlen og forældre-appen) ----------
// Viser time for time resten af dagen og de næste 7 dage med regn, vind og temperatur.
// big = tavlen (større tekst). Returnerer '' hvis der ikke er nogen udsigt.
export function forecastHtml(data, loc, big) {
  if (!data || !data.days) { return ''; }
  var t0 = today(), ds0 = ymd(t0), now = new Date();
  var list = [];
  for (var i = 0; i < 7; i++) {
    var d = addDays(t0, i), ds = ymd(d), w = data.days[ds];
    if (w) { list.push({ d: d, ds: ds, w: w, i: i }); }
  }
  if (!list.length) { return ''; }
  var lo = Math.min.apply(null, list.map(function (x) { return x.w.min; }));
  var hi = Math.max.apply(null, list.map(function (x) { return x.w.max; }));
  var span = Math.max(1, hi - lo);
  var h = '<div class="fc' + (big ? ' big' : '') + '">';

  // Time for time: fra nu og 12 timer frem, hver anden time på tavlen og hver tredje på telefonen
  var hours = (data.hours || []).filter(function (x) { return new Date(x.t) >= new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours()); });
  var step = big ? 2 : 3, n = big ? 8 : 6, slots = [];
  for (var k = 0; k < hours.length && slots.length < n; k += step) { slots.push(hours[k]); }
  if (slots.length) {
    h += '<div class="label">Resten af dagen</div><div class="fc-hours">';
    slots.forEach(function (x, j) {
      var hr = +x.t.slice(11, 13), other = x.t.slice(0, 10) !== ds0;
      h += '<div class="fc-h' + (j === 0 ? ' now' : '') + '"><span class="tm">' + (j === 0 ? 'Nu' : (other && hr < step ? 'I morgen ' : '') + pad(hr)) + '</span>' +
        wxIcon(x.code, big ? 34 : 32, !x.day, wxText(x.code)) + '<b>' + deg(x.temp) + '</b>' +
        '<span class="rn' + (x.rain >= 50 ? ' wet' : '') + '">' + (typeof x.rain === 'number' && x.rain >= 10 ? drop() + Math.round(x.rain) + '%' : '&nbsp;') + '</span></div>';
    });
    h += '</div>';
  }

  // Godt at vide – korte råd, som børnene kan forstå
  var tips = adviceFor(list);
  if (tips.length) {
    h += '<div class="fc-tips">' + tips.map(function (t) { return '<span class="tip">' + t + '</span>'; }).join('') + '</div>';
  }

  // De næste 7 dage
  h += '<div class="label">De næste 7 dage</div><div class="fc-days">';
  list.forEach(function (x) {
    var w = x.w, name = x.i === 0 ? 'I dag' : x.i === 1 ? 'I morgen' : DAY_NAMES[(x.d.getDay() + 6) % 7];
    var left = (w.min - lo) / span * 100, width = Math.max(6, (w.max - w.min) / span * 100);
    h += '<div class="fc-d' + (x.i === 0 ? ' today' : '') + '">' +
      '<div class="dn"><b>' + esc(name) + '</b><span>' + x.d.getDate() + '. ' + MONTHS_SHORT[x.d.getMonth()] + '</span></div>' +
      wxIcon(w.code, big ? 40 : 34, false, wxText(w.code)) +
      '<div class="tx"><b>' + esc(wxText(w.code)) + '</b><span>' +
        (typeof w.rain === 'number' ? '<i class="' + (w.rain >= 50 ? 'wet' : '') + '">' + drop() + Math.round(w.rain) + '%' + (w.mm >= 0.5 ? ' · ' + fmtMm(w.mm) : '') + '</i>' : '') +
        (typeof w.wind === 'number' ? '<i>' + windIc() + Math.round(w.wind) + (typeof w.gust === 'number' && w.gust - w.wind >= 5 ? ' (' + Math.round(w.gust) + ')' : '') + ' m/s</i>' : '') +
      '</span></div>' +
      '<div class="tr"><span class="mn">' + deg(w.min) + '</span><span class="bar"><i style="left:' + left.toFixed(1) + '%;width:' + Math.min(100 - left, width).toFixed(1) + '%"></i></span><span class="mx">' + deg(w.max) + '</span></div>' +
      '</div>';
  });
  h += '</div>';
  var tw = data.days[ds0];
  h += '<div class="fc-foot">' + (tw && tw.rise ? sunIc() + 'Solen står op ' + tw.rise.replace(':', '.') + ' og går ned ' + tw.set.replace(':', '.') + ' · ' : '') +
    'Vejret i ' + esc(loc ? loc.name : '') + ' fra Open-Meteo' + (data.demo ? ' (demo)' : '') + '</div>';
  return h + '</div>';
}

function fmtMm(mm) { return (Math.round(mm * 10) / 10).toString().replace('.', ',') + ' mm'; }
function drop() { return '<svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true"><path fill="#2F6FDE" d="M12 2.5l5.5 7.5a7 7 0 1 1-11 0z"/></svg>'; }
function windIc() { return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8"/></svg>'; }
function sunIc() { return '<svg width="14" height="14" viewBox="0 0 32 32" aria-hidden="true">' + sun(16, 16, 6.5) + '</svg>'; }

function dayWord(x) { return x.i === 0 ? 'i dag' : x.i === 1 ? 'i morgen' : DAY_NAMES[(x.d.getDay() + 6) % 7].toLowerCase(); }
function joinWords(a) { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' og ' + a[a.length - 1]; }
function adviceFor(list) {
  var tips = [];
  var wet = list.filter(function (x) { return x.i < 5 && x.w.rain >= 60 && x.w.code >= 51 && x.w.code < 71; }).map(dayWord);
  if (wet.length) { tips.push('☔ Regntøj ' + joinWords(wet.slice(0, 3))); }
  var snow = list.filter(function (x) { return x.i < 5 && ((x.w.code >= 71 && x.w.code <= 77) || x.w.code === 85 || x.w.code === 86); }).map(dayWord);
  if (snow.length) { tips.push('❄️ Sne ' + joinWords(snow.slice(0, 3))); }
  var cold = list.filter(function (x) { return x.i < 3 && x.w.min <= 0; }).map(dayWord);
  if (cold.length) { tips.push('🧤 Frost ' + joinWords(cold) + ' – hue og vanter'); }
  var windy = list.filter(function (x) { return x.i < 3 && x.w.wind >= 10; }).map(dayWord);
  if (windy.length) { tips.push('💨 Blæsende ' + joinWords(windy)); }
  var best = list.filter(function (x) { return x.i > 0 && x.w.code <= 2 && x.w.rain < 30; })[0];
  if (best && tips.length < 3) { tips.push('☀️ Tørt og lyst ' + dayWord(best)); }
  return tips.slice(0, 3);
}
