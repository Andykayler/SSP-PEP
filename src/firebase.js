// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
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
export const db = getFirestore(app, "(default)");   // Explicit default database
export const auth = getAuth(app);                   // Authentication
export const storage = getStorage(app);             // Thread / message attachments

export default app;