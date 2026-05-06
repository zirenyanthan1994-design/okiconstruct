import Razorpay from 'razorpay';
import { NextResponse } from 'next/server';
import { adminDb } from '@/app/lib/firebase-admin'; // This imports your VIP connection

// 1. Initialize Razorpay with your secret keys
const razorpay = new Razorpay({
  key_id: process.env.rzp_test_SlfoV2BijOVNwK!,
  key_secret: process.env.ke1hpnjmpnYIzh8d70LkzQTF!,
});

export async function POST(request: Request) {
  try {
    // 2. The frontend will tell us which plan they clicked (e.g., "1yr" or "1mo")
    const { planId } = await request.json(); 

    // 3. SECURE CHECK: Read the real price directly from your database
    const configDoc = await adminDb.collection('pricing_config').doc('subscriptionTiers').get();
    const tiers = configDoc.data();

    // If the plan doesn't exist in your database, reject the order
    if (!tiers || !tiers[planId]) {
      return NextResponse.json({ error: "Invalid Plan Selected" }, { status: 400 });
    }

    // Grab the exact sale price you set in your Firebase dashboard
    const finalPrice = tiers[planId].sale_price;

    // 4. Create the Razorpay Order
    const options = {
      amount: finalPrice * 100, // Razorpay requires paise (so ₹2499 becomes 249900)
      currency: "INR",
      receipt: `rcpt_${Math.random().toString(36).substring(7)}`,
    };

    const order = await razorpay.orders.create(options);
    
    // 5. Send the safe Order ID back to the user's phone/browser
    return NextResponse.json(order);

  } catch (error) {
    console.error("Order Error:", error);
    return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
  }
}