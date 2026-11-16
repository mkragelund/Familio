// Familio – datalag. Samme API for Firebase og for demo-tilstand (localStorage).
// Alle stier er absolutte i Familio-databasen, fx 'families/fabc/events/xyz'.
import { FIREBASE_CONFIG, DATABASE_ID } from './config.js';
import { seedFamily, ymd, mondayOf, today, addDays, completionId } from './model.js';

export var DEMO = !FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey.indexOf('INDSÆT') === 0;

var SDK = '10.12.2';

export function createStore() {
  return DEMO ? Promise.resolve(new DemoStore()) : createFirebaseStore();
}

// Fælles "sentinels" til array-opdateringer
export var FV = {
  union: function () { return { __op: 'union', vals: [].slice.call(arguments) }; },
  remove: function () { return { __op: 'remove', vals: [].slice.call(arguments) }; },
  deleteField: function () { return { __op: 'delete' }; }
};

function isStandalone() {
  return !!(window.navigator.standalone || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches));
}

function userObj(u) {
  if (!u) { return null; }
  return { uid: u.uid, email: (u.email || '').toLowerCase(), name: u.displayName || '', anon: !!u.isAnonymous };
}

// ---------- Firebase ----------
function createFirebaseStore() {
  var base = 'https://www.gstatic.com/firebasejs/' + SDK + '/';
  return Promise.all([
    import(base + 'firebase-app.js'),
    import(base + 'firebase-firestore.js'),
    import(base + 'firebase-auth.js')
  ]).then(function (mods) {
    var A = mods[0], F = mods[1], U = mods[2];
    var app = A.initializeApp(FIREBASE_CONFIG);
    var db = F.getFirestore(app, DATABASE_ID);
    var auth = U.getAuth(app);
    var redirectError = null;
    U.getRedirectResult(auth).catch(function (e) { redirectError = e; });

    function dref(path) { return F.doc.apply(null, [db].concat(path.split('/'))); }
    function cref(path) { return F.collection.apply(null, [db].concat(path.split('/'))); }
    function conv(data) {
      if (!data || typeof data !== 'object') { return data; }
      var out = {};
      Object.keys(data).forEach(function (k) {
        var v = data[k];
        if (v && v.__op === 'union') { out[k] = F.arrayUnion.apply(null, v.vals); }
        else if (v && v.__op === 'remove') { out[k] = F.arrayRemove.apply(null, v.vals); }
        else if (v && v.__op === 'delete') { out[k] = F.deleteField(); }
        else { out[k] = v; }
      });
      return out;
    }

    return {
      demo: false,
      redirectError: function () { return redirectError; },
      onUser: function (cb) { return U.onAuthStateChanged(auth, function (u) { cb(userObj(u)); }); },
      signInGoogle: function () {
        var p = new U.GoogleAuthProvider();
        p.setCustomParameters({ prompt: 'select_account' });
        // Installeret på hjemmeskærmen (iOS) virker pop-up ikke – brug omdirigering
        if (isStandalone()) { return U.signInWithRedirect(auth, p); }
        return U.signInWithPopup(auth, p).catch(function (e) {
          if (/popup-blocked|operation-not-supported/.test(e.code || '')) { return U.signInWithRedirect(auth, p); }
          throw e;
        });
      },
      signInAnon: function () { return U.signInAnonymously(auth); },
      signOut: function () { return U.signOut(auth); },
      get: function (path) { return F.getDoc(dref(path)).then(function (s) { return s.exists() ? s.data() : null; }); },
      watchDoc: function (path, cb, err) {
        return F.onSnapshot(dref(path), function (s) { cb(s.exists() ? s.data() : null); }, err);
      },
      watchColl: function (path, where, cb, err) {
        var q = cref(path);
        if (where) { q = F.query(q, F.where(where[0], where[1], where[2])); }
        return F.onSnapshot(q, function (s) {
          cb(s.docs.map(function (d) { var o = d.data(); o.id = d.id; return o; }));
        }, err);
      },
      set: function (path, data, merge) { return F.setDoc(dref(path), conv(data), { merge: !!merge }); },
      update: function (path, data) { return F.updateDoc(dref(path), conv(data)); },
      add: function (path, data) { return F.addDoc(cref(path), conv(data)); },
      del: function (path) { return F.deleteDoc(dref(path)); }
    };
  });
}

// ---------- Demo (localStorage, synkroniserer mellem faner) ----------
var KEY = 'familio-demo-v2';
var USER_KEY = 'familio-demo-user';
export var DEMO_FAMILY = 'fdemo';

function DemoStore() {
  this.demo = true;
  this.watchers = [];
  this.userCbs = [];
  this.user = null;
  this.load();
  if (!this.docs.__seeded) { this.seed(); }
  try { this.user = JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch (e) { this.user = null; }
  if (/demo-tablet=/.test(location.search)) { this.user = null; } // test af en ny tablet
  var self = this;
  window.addEventListener('storage', function (e) {
    if (e.key === KEY) { self.load(); self.notify(); }
  });
}

DemoStore.prototype.load = function () {
  try { this.docs = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { this.docs = {}; }
};
DemoStore.prototype.save = function () {
  try { localStorage.setItem(KEY, JSON.stringify(this.docs)); } catch (e) { /* fuld eller blokeret */ }
};
DemoStore.prototype.seed = function () {
  var self = this;
  var F = 'families/' + DEMO_FAMILY;
  var fam = seedFamily({ name: 'Familien Kragelund', parentUid: 'demo-far', parentName: 'Far', kids: [{ name: 'Jens Christian', color: 'blue' }, { name: 'Ida Marie', color: 'orange' }] });
  var jc = fam.members[0].id, ida = fam.members[1].id;
  fam.members[2].color = 'teal';
  fam.members.push({ id: 'demo-mor', name: 'Mor', short: 'Mor', color: 'purple', kind: 'adult' });
  fam.parents.push('demo-mor'); fam.parentNames['demo-mor'] = 'Mor';
  fam.tablets = ['demo-tablet'];
  fam.drivers = ['Mor', 'Far', 'Bedstefar'];
  fam.chores.push({ id: 'laes', label: 'Læse 15 min', pts: 10, kids: [jc], icon: 'laes' });
  fam.chores.push({ id: 'oejen', label: 'Øjenklap', pts: 10, kids: [ida], icon: 'oejen' });
  fam.goals[jc].weekReward = '30 min ekstra skærmtid';
  fam.goals[ida].weekReward = 'Vælge fredagsfilm';
  fam.goals[ida].weekPts = 100; fam.goals[ida].monthPts = 375;
  this.docs = { __seeded: true };
  this.docs[F] = fam;
  this.docs['users/demo-far'] = { familyId: DEMO_FAMILY };
  this.docs['users/demo-mor'] = { familyId: DEMO_FAMILY };
  this.docs['tabletLinks/demo-tablet'] = { familyId: DEMO_FAMILY };
  var s = ymd(mondayOf(today()));
  var evs = [
    { id: 'padel', title: 'Padel', who: jc, type: 'rec', days: [4], freq: 'w1', start: s, from: '15:00', to: '16:00', driver: 'Bedstefar', pack: ['Ketsjer', 'Indendørssko', 'Vandflaske'] },
    { id: 'fodbold-ti', title: 'Fodbold', who: ida, type: 'rec', days: [2], freq: 'w1', start: s, from: '16:30', to: '18:00', driver: 'Mor', pack: ['Fodboldstøvler', 'Benskinner', 'Vandflaske'] },
    { id: 'fodbold-so', title: 'Fodbold', who: ida, type: 'rec', days: [7], freq: 'w1', start: s, from: '11:00', to: '12:30', driver: 'Far', pack: ['Fodboldstøvler', 'Benskinner', 'Vandflaske'] }
  ];
  evs.forEach(function (ev) {
    var id = ev.id; delete ev.id;
    ev.end = ''; ev.allDay = false; ev.showOnTablet = true; ev.exceptions = {};
    self.docs[F + '/events/' + id] = ev;
  });
  var mon = mondayOf(today());
  var meals = ['Kylling i karry med ris', 'Frikadeller med kartofler', 'Pasta med kødsovs', 'Tacos', 'Hjemmelavet pizza', 'Fiskefrikadeller', 'Suppe og brød'];
  for (var i = 0; i < 7; i++) { var md = ymd(addDays(mon, i)); self.docs[F + '/meals/' + md] = { date: md, text: meals[i] }; }
  var t = ymd(today());
  [['daek', ida, 5], ['laes', jc, 10]].forEach(function (c) {
    self.docs[F + '/completions/' + completionId(t, c[0], c[1])] = { date: t, chore: c[0], kid: c[1], pts: c[2], at: Date.now() - 3600000 };
  });
  this.save();
};
DemoStore.prototype.reset = function () { this.seed(); this.notify(); };

DemoStore.prototype.notify = function () {
  var self = this;
  if (this.pending) { return; }
  this.pending = true;
  setTimeout(function () {
    self.pending = false;
    self.watchers.slice().forEach(function (w) { self.fire(w); });
  }, 0);
};
function clone(o) { return JSON.parse(JSON.stringify(o)); }
DemoStore.prototype.fire = function (w) {
  var self = this;
  if (w.kind === 'doc') {
    var d = this.docs[w.path];
    w.cb(d ? clone(d) : null);
    return;
  }
  var prefix = w.path + '/';
  var list = [];
  Object.keys(this.docs).forEach(function (k) {
    if (k.indexOf(prefix) === 0 && k.slice(prefix.length).indexOf('/') < 0) {
      var o = clone(self.docs[k]);
      o.id = k.slice(prefix.length);
      if (w.where) {
        var v = o[w.where[0]], op = w.where[1], x = w.where[2];
        var ok = op === '>=' ? v >= x : op === '<=' ? v <= x : op === '==' ? v === x : op === '>' ? v > x : op === '<' ? v < x : true;
        if (!ok) { return; }
      }
      list.push(o);
    }
  });
  w.cb(list);
};
DemoStore.prototype.later = function (fn) { setTimeout(fn, 0); };
DemoStore.prototype.setUser = function (u, persist) {
  this.user = u;
  if (persist) { try { localStorage.setItem(USER_KEY, JSON.stringify(u)); } catch (e) { /* */ } }
  var self = this;
  this.userCbs.forEach(function (cb) { self.later(function () { cb(u); }); });
};
DemoStore.prototype.redirectError = function () { return null; };
DemoStore.prototype.onUser = function (cb) {
  var self = this;
  this.userCbs.push(cb);
  this.later(function () { cb(self.user && !self.user.anon ? self.user : null); });
  return function () { self.userCbs = self.userCbs.filter(function (x) { return x !== cb; }); };
};
DemoStore.prototype.signInGoogle = function () {
  // I demo er man "Far" (har en familie) – eller en ny bruger via ?demo-user=xyz
  var as = (location.search.match(/demo-user=([\w-]+)/) || [])[1] || 'demo-far';
  var name = as === 'demo-far' ? 'Morten' : as === 'demo-mor' ? 'Katrine' : 'Ny Forælder';
  this.setUser({ uid: as, email: as + '@gmail.com', name: name, anon: false }, true);
  return Promise.resolve();
};
DemoStore.prototype.signInAnon = function () {
  var uid = (location.search.match(/demo-tablet=([\w-]+)/) || [])[1] || 'demo-tablet';
  this.setUser({ uid: uid, email: '', name: '', anon: true }, false);
  return Promise.resolve();
};
DemoStore.prototype.signOut = function () {
  try { localStorage.removeItem(USER_KEY); } catch (e) { /* */ }
  this.setUser(null, false);
  return Promise.resolve();
};
DemoStore.prototype.get = function (path) {
  var d = this.docs[path];
  return Promise.resolve(d ? clone(d) : null);
};
DemoStore.prototype.watchDoc = function (path, cb) { return this.watch({ kind: 'doc', path: path, cb: cb }); };
DemoStore.prototype.watchColl = function (path, where, cb) { return this.watch({ kind: 'coll', path: path, where: where, cb: cb }); };
DemoStore.prototype.watch = function (w) {
  var self = this;
  this.watchers.push(w);
  this.later(function () { if (self.watchers.indexOf(w) >= 0) { self.fire(w); } });
  return function () { self.watchers = self.watchers.filter(function (x) { return x !== w; }); };
};
function applyOps(target, data) {
  Object.keys(data).forEach(function (k) {
    var v = data[k];
    if (k.indexOf('.') > 0) {
      var ps = k.split('.');
      var ob = target;
      for (var j = 0; j < ps.length - 1; j++) { ob[ps[j]] = ob[ps[j]] || {}; ob = ob[ps[j]]; }
      var last = ps[ps.length - 1];
      if (v && v.__op === 'delete') { delete ob[last]; } else { ob[last] = v; }
    } else if (v && v.__op === 'union') {
      var a = (target[k] || []).slice();
      v.vals.forEach(function (x) { if (a.indexOf(x) < 0) { a.push(x); } });
      target[k] = a;
    } else if (v && v.__op === 'remove') {
      target[k] = (target[k] || []).filter(function (x) { return v.vals.indexOf(x) < 0; });
    } else if (v && v.__op === 'delete') {
      delete target[k];
    } else {
      target[k] = v;
    }
  });
  return target;
}
DemoStore.prototype.set = function (path, data, merge) {
  var cur = merge ? (this.docs[path] || {}) : {};
  this.docs[path] = applyOps(clone(cur), data);
  this.save(); this.notify();
  return Promise.resolve();
};
DemoStore.prototype.update = function (path, data) {
  if (!this.docs[path]) { return Promise.reject(new Error('not-found')); }
  return this.set(path, data, true);
};
DemoStore.prototype.add = function (path, data) {
  var id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return this.set(path + '/' + id, data).then(function () { return { id: id }; });
};
DemoStore.prototype.del = function (path) {
  delete this.docs[path];
  this.save(); this.notify();
  return Promise.resolve();
};
