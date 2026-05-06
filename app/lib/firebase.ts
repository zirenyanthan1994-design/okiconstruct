import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAf4q5vHh9r5Ta0LQsJvIA_6JckNfleogs",
  authDomain: "okiconstruct-app-v2.firebaseapp.com",
  projectId: "okiconstruct-app-v2",
  storageBucket: "okiconstruct-app-v2.firebasestorage.app",
  messagingSenderId: "590310575347",
  appId: "1:590310575347:web:23e94dd18df2ea3bb8bb86"
};

// 2. Initialize Firebase securely
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

// 3. THE MODERN MAGIC: Initialize Firestore with the new Offline Cache system
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

export { auth, db };