import * as admin from 'firebase-admin';

// This checks if the app is already connected so Next.js doesn't crash during reloads
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // The replace function ensures the weird \n characters format correctly
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'), 
    }),
  });
}

const adminDb = admin.firestore();

export { adminDb };