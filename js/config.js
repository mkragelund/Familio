// Familio – konfiguration
//
// Indsæt web-app-konfigurationen fra Firebase (projekt "MK Work" › Project settings › Your apps › Familio).
// Sæt authDomain til 'minfamilio.web.app', så Google-login også virker, når appen er installeret på hjemmeskærmen.
// Så længe apiKey starter med "INDSÆT", kører appen i DEMO-tilstand: alt gemmes kun lokalt i browseren.
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBpegpUV5TKNky99QT1rdsdi3yhWNRwRhk',
  authDomain: 'minfamilio.web.app',
  projectId: 'gen-lang-client-0858229520',
  storageBucket: 'gen-lang-client-0858229520.firebasestorage.app',
  messagingSenderId: '633012127634',
  appId: '1:633012127634:web:68f2700070fd2b760be34b'
};

// Navnet på Familios egen Firestore-database i projektet (ikke "(default)").
export const DATABASE_ID = 'familio';

export const APP_VERSION = '1.4.0';
