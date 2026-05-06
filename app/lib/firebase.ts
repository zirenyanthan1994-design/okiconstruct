import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, initializeFirestore, persistentLocalCache } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAf4q5vHh9r5Ta0LQsJvIA_6JckNfleogs",
  authDomain: "okiconstruct-app-v2.firebaseapp.com",
  projectId: "okiconstruct-app-v2",
  storageBucket: "okiconstruct-app-v2.firebasestorage.app",
  messagingSenderId: "590310575347",
  appId: "1:590310575347:web:23e94dd18df2ea3bb8bb86"
};

// 2. Initialize App Securely (Prevents duplicate app errors)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

// 3. Bulletproof Database Connection
let db: any;

if (typeof window !== "undefined") {
  // BROWSER MODE
  try {
    // Attempt to initialize the modern offline cache
    db = initializeFirestore(app, {
      localCache: persistentLocalCache()
    });
  } catch (error) {
    // If Next.js hot-reloads and locks the cache, safely fallback to the existing connection
    db = getFirestore(app);
  }
} else {
  // SERVER MODE (Next.js compilation)
  db = getFirestore(app);
}

export { auth, db };