import { NextResponse } from 'next/server';
import crypto from 'crypto'; // Built into Node.js, no installation required
import { adminDb } from '@/app/lib/firebase-admin';

export async function POST(request: Request) {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      planId,
      userId
    } = await request.json();

    // 1. VERIFY THE BANK SIGNATURE
    // This proves the payment actually happened and wasn't spoofed
    const secret = process.env.RAZORPAY_KEY_SECRET!;
    const generatedSignature = crypto
      .createHmac('sha256', secret)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest('hex');

    if (generatedSignature !== razorpay_signature) {
      return NextResponse.json({ error: "Fraudulent payment detected" }, { status: 400 });
    }

    // 2. FETCH THE PLAN DURATION
    // Get the exact number of months from your remote control database
    const configDoc = await adminDb.collection('pricing_config').doc('subscriptionTiers').get();
    const tiers = configDoc.data();
    const planMonths = tiers?.[planId]?.months || 12;

    // 3. FETCH THE USER'S PROFILE
    const userRef = adminDb.collection('users').doc(userId);
    const userDoc = await userRef.get();
    const userData = userDoc.data();

    // 4. THE TIME-TRAVEL ENGINE (Carry Forward + Leap Year Logic)
    const now = new Date();
    let currentExpiry = now;

    // Convert existing Firestore Timestamp to Javascript Date (if they are already a user)
    if (userData?.expiryDate) {
      currentExpiry = userData.expiryDate.toDate();
    }

    // Base date is either today OR their future expiry date (whichever is later)
    const baseDate = currentExpiry > now ? currentExpiry : now;
    
    const newExpiryDate = new Date(baseDate);
    // Adding months this way handles Leap Years and varying month lengths automatically
    newExpiryDate.setMonth(newExpiryDate.getMonth() + planMonths);

    // 5. UPDATE THE USER PROFILE
    // 'merge: true' guarantees we don't accidentally erase their name or other info
    await userRef.set({
      planStatus: 'premium',
      expiryDate: newExpiryDate,
      lastRenewalDate: now,
    }, { merge: true }); 

    return NextResponse.json({ success: true, newExpiry: newExpiryDate });

  } catch (error) {
    console.error("Verification Error:", error);
    return NextResponse.json({ error: "Failed to verify payment" }, { status: 500 });
  }
}