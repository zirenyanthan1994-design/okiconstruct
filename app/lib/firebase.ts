import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBIWjg4vyjA3d3Ox5TWtmZ9RTAAjtvdIz4",
  authDomain: "okiconstruct.firebaseapp.com",
  projectId: "okiconstruct",
  storageBucket: "okiconstruct.firebasestorage.app",
  messagingSenderId: "115890289043",
  appId: "1:115890289043:web:70182816ef81893d761066",
  measurementId: "G-NKBP2C2XWZ"
};

// Initialize Firebase only once
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app, "default");