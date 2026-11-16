// Familio – fælles UI-hjælpere: escaping, farver, ikoner, logo.

export function esc(s) {
  return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

export var PALETTE = {
  blue: { color: '#2F6FDE', tint: '#E4ECFB', text: '#1F4FA8', bright: '#5B8DEF' },
  orange: { color: '#C2410C', tint: '#FBE7DA', text: '#9A3412', bright: '#F08A4B' },
  purple: { color: '#7C3AED', tint: '#EEE6FD', text: '#5B21B6', bright: '#A78BFA' },
  teal: { color: '#0F766E', tint: '#DCF2EF', text: '#115E59', bright: '#2DD4BF' },
  pink: { color: '#BE185D', tint: '#FCE7F3', text: '#9D174D', bright: '#F472B6' },
  green: { color: '#15803D', tint: '#DCFCE7', text: '#166534', bright: '#4ADE80' },
  gray: { color: '#1F2430', tint: '#ECE8DF', text: '#1F2430', bright: '#C9CCD6' }
};

export function pal(member) {
  return PALETTE[(member && member.color) || 'gray'] || PALETTE.gray;
}

var P = {
  daek: '<circle cx="12.5" cy="12" r="6"/><path d="M3 4v6M5 4v6M4 10v10M21 4c-1.5 0-2.5 2-2.5 5h2.5v11"/>',
  tag: '<path d="M3 17h18"/><path d="M5 17a7 7 0 0 1 14 0"/><path d="M12 10V3M9 6l3-3 3 3"/>',
  opvask: '<path d="M12 2.7l5.7 5.7a8 8 0 1 1-11.3 0z"/>',
  vaer: '<path d="M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9"/>',
  stoev: '<path d="M4 21h11a3 3 0 0 0 0-6H8"/><path d="M8 15V5a2 2 0 0 1 2-2h3"/><circle cx="18" cy="18" r="1"/><path d="M2 21h2"/>',
  laes: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  oejen: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M3 4l18 16"/>',
  star: '<path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  food: '<path d="M3 2v7c0 1.1.9 2 2 2h2a2 2 0 0 0 2-2V2"/><path d="M6 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  car: '<path d="M5 17h14M3 17v-4l2-5h14l2 5v4"/><circle cx="7.5" cy="17.5" r="1.8"/><circle cx="16.5" cy="17.5" r="1.8"/>',
  repeat: '<path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  left: '<path d="M15 18l-6-6 6-6"/>',
  right: '<path d="M9 18l6-6-6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  bag: '<path d="M6 7h12l1 14H5z"/><path d="M9 7V5a3 3 0 0 1 6 0v2"/>'
};

export function icon(name, size, sw, label) {
  var s = size || 20;
  var a = label ? 'role="img" aria-label="' + esc(label) + '"' : 'aria-hidden="true"';
  return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (sw || 2) +
    '" stroke-linecap="round" stroke-linejoin="round" ' + a + '>' + (P[name] || '') + '</svg>';
}

export function logo(size) {
  var s = size || 48;
  return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 64 64" role="img" aria-label="Familio">' +
    '<rect width="64" height="64" rx="16" fill="#1F2430"/>' +
    '<path d="M13 30L32 14l19 16v18a4 4 0 0 1-4 4H17a4 4 0 0 1-4-4z" fill="none" stroke="#F6F3EC" stroke-width="3.5" stroke-linejoin="round"/>' +
    '<rect x="22" y="27.5" width="9" height="9" rx="2.5" fill="#5B8DEF"/><rect x="33" y="27.5" width="9" height="9" rx="2.5" fill="#F08A4B"/>' +
    '<rect x="22" y="38.5" width="9" height="9" rx="2.5" fill="#A78BFA"/><rect x="33" y="38.5" width="9" height="9" rx="2.5" fill="#2DD4BF"/></svg>';
}

export function avatar(member, size) {
  var p = pal(member);
  var s = size || 40;
  return '<span class="avatar" style="width:' + s + 'px;height:' + s + 'px;background:' + p.color + ';font-size:' + Math.round(s * 0.38) + 'px">' + esc(member.short) + '</span>';
}

export function confettiHtml(n) {
  var cols = ['#2F6FDE', '#C2410C', '#7C3AED', '#0F766E', '#F5B700', '#E11D48'];
  var h = '';
  for (var i = 0; i < (n || 48); i++) {
    h += '<span class="confetti" style="left:' + ((i * 37) % 100) + '%;width:' + (8 + (i % 3) * 3) + 'px;height:' + (12 + (i % 4) * 3) +
      'px;background:' + cols[i % cols.length] + ';animation-duration:' + (2.2 + (i % 5) * 0.35) + 's;animation-delay:' + ((i % 8) * 0.12) + 's"></span>';
  }
  return h;
}

export function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

export function toast(msg) {
  var t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(function () { t.classList.add('out'); }, 2200);
  setTimeout(function () { if (t.parentNode) { t.parentNode.removeChild(t); } }, 2700);
}

// Automatisk opdatering: spørg serveren om nyeste version (version.json) og genindlæs, hvis der er en ny.
// shouldReloadNow() afgør, om det er et godt tidspunkt (fx ikke midt i en fejring).
export function autoUpdate(current, shouldReloadNow, everyMs) {
  var pending = false;
  function check() {
    if (!navigator.onLine && navigator.onLine !== undefined) { return; }
    fetch('version.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (j && j.version && j.version !== current) { pending = true; tryReload(); }
    }).catch(function () {});
  }
  function tryReload() {
    if (!pending) { return; }
    var last = 0;
    try { last = +localStorage.getItem('familio-reload-at') || 0; } catch (e) { /* */ }
    if (Date.now() - last < 60 * 60 * 1000) { return; } // højst én automatisk genindlæsning i timen
    if (!shouldReloadNow || shouldReloadNow()) {
      try { sessionStorage.setItem('familio-updated', '1'); localStorage.setItem('familio-reload-at', String(Date.now())); } catch (e) { /* */ }
      location.reload();
    }
  }
  setInterval(check, everyMs || 15 * 60 * 1000);
  setInterval(tryReload, 30 * 1000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { check(); } });
  setTimeout(check, 5000);
}

export function justUpdated() {
  try { var v = sessionStorage.getItem('familio-updated'); sessionStorage.removeItem('familio-updated'); return !!v; } catch (e) { return false; }
}
