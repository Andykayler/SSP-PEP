// src/firebase.js
import { initializeApp } from "firebase/app";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBjwGpzj8N-jrvYV0wvZAgaoUL9RI-g3KM",
  authDomain: "ssp-pep.firebaseapp.com",
  projectId: "ssp-pep",
  storageBucket: "ssp-pep.firebasestorage.app",
  messagingSenderId: "1066419306308",
  appId: "1:1066419306308:web:a0c2958a1589153f886111"
};

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Services
//
// Schools here run on intermittent power and a single mobile dongle, and
// teachers mark registers on phones. Without a local cache a dropped
// connection loses a period's work; with one, reads serve from disk and
// writes queue on the device until the network returns.
//
// The multi-tab manager matters because staff leave the portal open in
// several tabs — a single-tab cache would refuse to start in all but one
// of them and silently fall back to no persistence.
export const db = initializeFirestore(
  app,
  { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) },
  "(default)",                                    // Explicit default database
);
export const auth = getAuth(app);                 // Authentication
export const storage = getStorage(app);           // Thread / message attachments

export default app;
