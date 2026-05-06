import Razorpay from 'razorpay';
import { NextResponse } from 'next/server';
import { adminDb } from '@/app/lib/firebase-admin'; //

// 1. Initialize Razorpay with your provided keys
const razorpay = new Razorpay({
  key_id: 'rzp_test_SlfoV2BijOVNwK',
  key_secret: 'ke1hpnjmpnYIzh8d70LkzQTF',
}); //

export async function POST(request: Request) {
  try {
    // 2. The frontend will tell us which plan they clicked (e.g., "1yr" or "1mo")
    const { planId } = await request.json(); //[cite: 1]

    // 3. SECURE CHECK: Read the real price directly from your database
    const configDoc = await adminDb.collection('pricing_config').doc('subscriptionTiers').get();
    const tiers = configDoc.data(); //[cite: 1]

    // If the plan doesn't exist in your database, reject the order
    if (!tiers || !tiers[planId]) {
      return NextResponse.json({ error: "Invalid Plan Selected" }, { status: 400 });
    } //[cite: 1]

    // Grab the exact sale price you set in your Firebase dashboard
    const finalPrice = tiers[planId].sale_price; //[cite: 1]

    // 4. Create the Razorpay Order
    const options = {
      amount: finalPrice * 100, // Razorpay requires paise
      currency: "INR",
      receipt: `rcpt_${Math.random().toString(36).substring(7)}`,
    }; //[cite: 1]

    const order = await razorpay.orders.create(options);
    
    // 5. Send the safe Order ID back to the user's phone/browser
    return NextResponse.json(order); //[cite: 1]

  } catch (error) {
    console.error("Order Error:", error);
    return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
  } //[cite: 1]
}