// Familio – datalag. Samme API for Firebase og for demo-tilstand (localStorage).
// Stier er relative til familiens dokument: '' = /families/{FAMILY_ID}, 'events/abc' osv.
import { FIREBASE_CONFIG, FAMILY_ID, DATABASE_ID } from './config.js';
import { seedFamily, seedEvents, ymd, mondayOf, today, addDays, completionId } from './model.js';

export var DEMO = !FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey.indexOf('INDSÆT') === 0;

var SDK = '10.12.2';

export function createStore() {
  return DEMO ? Promise.resolve(new DemoStore()) : createFirebaseStore();
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

    function segs(path) {
      var s = ['families', FAMILY_ID];
      if (path) { s = s.concat(path.split('/')); }
      return s;
    }
    function dref(path) { return F.doc.apply(null, [db].concat(segs(path))); }
    function cref(path) { return F.collection.apply(null, [db].concat(segs(path))); }
    function conv(data) {
      // erstat vores fælles sentinels med Firestores
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
      onUser: function (cb) {
        return U.onAuthStateChanged(auth, function (u) {
          cb(u ? { uid: u.uid, email: (u.email || '').toLowerCase(), anon: u.isAnonymous } : null);
        });
      },
      signInEmail: function (email, pw) { return U.signInWithEmailAndPassword(auth, email.trim(), pw); },
      signInAnon: function () { return U.signInAnonymously(auth); },
      signOut: function () { return U.signOut(auth); },
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

// Fælles "sentinels" til array-opdateringer
export var FV = {
  union: function () { return { __op: 'union', vals: [].slice.call(arguments) }; },
  remove: function () { return { __op: 'remove', vals: [].slice.call(arguments) }; },
  deleteField: function () { return { __op: 'delete' }; }
};

// ---------- Demo (localStorage, synkroniserer mellem faner) ----------
var KEY = 'familio-demo-v1';

function DemoStore() {
  this.demo = true;
  this.watchers = [];
  this.load();
  if (!this.docs['']) { this.seed(); }
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
  var fam = seedFamily('demo@familio.app');
  fam.goals.jc.weekReward = '30 min ekstra skærmtid';
  fam.goals.ida.weekReward = 'Vælge fredagsfilm';
  fam.goals.jc.monthReward = '100 kr. i lommepenge';
  fam.goals.ida.monthReward = '100 kr. i lommepenge';
  this.docs[''] = fam;
  seedEvents().forEach(function (ev) {
    if (ev.id === 'padel-jc') { ev.driver = 'Bedstefar'; ev.pack = ['Ketsjer', 'Indendørssko', 'Vandflaske']; }
    if (ev.id.indexOf('fodbold') === 0) { ev.pack = ['Fodboldstøvler', 'Benskinner', 'Vandflaske']; ev.driver = 'Mor'; }
    self.docs['events/' + ev.id] = ev;
  });
  var mon = mondayOf(today());
  var meals = ['Kylling i karry med ris', 'Frikadeller med kartofler', 'Pasta med kødsovs', 'Tacos', 'Hjemmelavet pizza', 'Fiskefrikadeller', 'Suppe og brød'];
  for (var i = 0; i < 7; i++) { var md = ymd(addDays(mon, i)); self.docs['meals/' + md] = { date: md, text: meals[i] }; }
  var t = ymd(today());
  [['daek', 'ida', 5], ['laes', 'jc', 10]].forEach(function (c) {
    self.docs['completions/' + completionId(t, c[0], c[1])] = { date: t, chore: c[0], kid: c[1], pts: c[2], at: Date.now() };
  });
  this.save();
};
DemoStore.prototype.reset = function () { this.docs = {}; this.seed(); this.notify(); };

DemoStore.prototype.notify = function () {
  var self = this;
  this.watchers.forEach(function (w) { self.fire(w); });
};
DemoStore.prototype.fire = function (w) {
  var self = this;
  if (w.kind === 'doc') {
    var d = this.docs[w.path];
    w.cb(d ? JSON.parse(JSON.stringify(d)) : null);
  } else {
    var prefix = w.path + '/';
    var list = [];
    Object.keys(this.docs).forEach(function (k) {
      if (k.indexOf(prefix) === 0 && k.slice(prefix.length).indexOf('/') < 0) {
        var o = JSON.parse(JSON.stringify(self.docs[k]));
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
  }
};
DemoStore.prototype.later = function (fn) { setTimeout(fn, 0); };
DemoStore.prototype.onUser = function (cb) {
  this.later(function () { cb({ uid: 'demo-tablet', email: 'demo@familio.app', anon: false }); });
  return function () {};
};
DemoStore.prototype.signInEmail = function () { return Promise.resolve(); };
DemoStore.prototype.signInAnon = function () { return Promise.resolve(); };
DemoStore.prototype.signOut = function () { return Promise.resolve(); };
DemoStore.prototype.watchDoc = function (path, cb) {
  var w = { kind: 'doc', path: path || '', cb: cb };
  return this.watch(w);
};
DemoStore.prototype.watchColl = function (path, where, cb) {
  var w = { kind: 'coll', path: path, where: where, cb: cb };
  return this.watch(w);
};
DemoStore.prototype.watch = function (w) {
  var self = this;
  this.watchers.push(w);
  this.later(function () { self.fire(w); });
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
  var cur = merge ? (this.docs[path || ''] || {}) : {};
  this.docs[path || ''] = applyOps(JSON.parse(JSON.stringify(cur)), data);
  this.save(); this.notify();
  return Promise.resolve();
};
DemoStore.prototype.update = function (path, data) {
  if (!this.docs[path || '']) { return Promise.reject(new Error('not-found')); }
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
