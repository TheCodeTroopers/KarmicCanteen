import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyCR-a2dg3kGHV3tY8LA9B9_FVBx0fm41BI",
  authDomain: "karmicsolutions.firebaseapp.com",
  projectId: "karmicsolutions",
  storageBucket: "karmicsolutions.firebasestorage.app",
  messagingSenderId: "479037039920",
  appId: "1:479037039920:web:d3a57d00e1910c5a2094f5",
  measurementId: "G-CJFM4D74K9"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);