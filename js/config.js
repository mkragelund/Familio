// Familio – konfiguration
//
// Indsæt web-app-konfigurationen fra Firebase (projekt "MK Work" › Project settings › Your apps › Familio).
// Så længe apiKey starter med "INDSÆT", kører appen i DEMO-tilstand: alt gemmes kun lokalt i browseren.
export const FIREBASE_CONFIG = {
  apiKey: 'INDSÆT_API_KEY',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: ''
};

// Navnet på Familios egen Firestore-database i projektet (ikke "(default)").
export const DATABASE_ID = 'familio';

// Id for familien i databasen. Hver familie får sit eget dokument under /families/{FAMILY_ID}.
export const FAMILY_ID = 'kragelund';

export const APP_VERSION = '1.0.0';
