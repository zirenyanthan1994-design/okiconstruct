import * as admin from "firebase-admin";

// Use a variable to prevent multiple initializations
let app;

if (!admin.apps.length) {
  // We check for the Project ID first. If it's missing, we don't crash the build.
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  if (projectId) {
    app = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: projectId,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // The replace() fix is mandatory for Vercel's private key handling
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  } else {
    // This console log will show up in Vercel if the key is missing
    console.warn("Firebase Admin: FIREBASE_PROJECT_ID is missing. Build might fail if database access is required.");
  }
} else {
  app = admin.app();
}

const adminDb = admin.firestore();
export { adminDb };