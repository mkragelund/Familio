// Familio – konfiguration
//
// Indsæt web-app-konfigurationen fra Firebase (projekt "MK Work" › Project settings › Your apps › Familio).
// Sæt authDomain til 'minfamilio.web.app', så Google-login også virker, når appen er installeret på hjemmeskærmen.
// Så længe apiKey starter med "INDSÆT", kører appen i DEMO-tilstand: alt gemmes kun lokalt i browseren.
export const FIREBASE_CONFIG = {
  apiKey: 'INDSÆT_API_KEY',
  authDomain: 'minfamilio.web.app',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: ''
};

// Navnet på Familios egen Firestore-database i projektet (ikke "(default)").
export const DATABASE_ID = 'familio';

export const APP_VERSION = '1.1.0';
