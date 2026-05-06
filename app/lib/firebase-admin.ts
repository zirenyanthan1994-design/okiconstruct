import * as admin from "firebase-admin";

// 1. Mandatory Project ID pulled directly from your firebase_2.ts configuration
const projectId = "okiconstruct-app-v2";

if (!admin.apps.length) {
  // 2. Prevent the build from crashing if Vercel is missing the keys during compilation
  if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: projectId,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
  } else {
    // 3. Safe fallback so the Vercel "collect page data" phase can successfully finish
    admin.initializeApp({ projectId: projectId });
  }
}

const adminDb = admin.firestore();
export { adminDb };