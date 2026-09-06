import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getAnalytics } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCR-a2dg3kGHV3tY8LA9B9_FVBx0fm41BI",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "karmicsolutions.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "karmicsolutions",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "karmicsolutions.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "479037039920",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:479037039920:web:d3a57d00e1910c5a2094f5",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-CJFM4D74K9"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});
export const functions = getFunctions(app);
export const analytics = typeof window !== 'undefined' && firebaseConfig.projectId ? getAnalytics(app) : null;