import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, initializeFirestore, persistentLocalCache } from "firebase/firestore";
import { getStorage } from "firebase/storage"; // NEW: Added Storage

const firebaseConfig = {
  apiKey: "AIzaSyAf4q5vHh9r5Ta0LQsJvIA_6JckNfleogs",
  authDomain: "okiconstruct-app-v2.firebaseapp.com",
  projectId: "okiconstruct-app-v2",
  storageBucket: "okiconstruct-app-v2.firebasestorage.app",
  messagingSenderId: "590310575347",
  appId: "1:590310575347:web:23e94dd18df2ea3bb8bb86"
};

// 2. Initialize App Securely
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const storage = getStorage(app); // NEW: Initialize Storage

// 3. Bulletproof Database Connection
let db: any;

if (typeof window !== "undefined") {
  // BROWSER MODE
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache()
    });
  } catch (error) {
    db = getFirestore(app);
  }
} else {
  // SERVER MODE 
  db = getFirestore(app);
}

export { auth, db, storage }; // NEW: Exported Storage