"use client"; // This tells Next.js this is an interactive frontend component

import { useState } from "react";

// This is a helper function to load the Razorpay window safely
const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

export default function CheckoutButton({ planId, label, price, userId }: { planId: string, label: string, price: number, userId: string }) {
  const [isLoading, setIsLoading] = useState(false);

  const handleCheckout = async () => {
    setIsLoading(true);

    // 1. Load the Razorpay Script
    const res = await loadRazorpayScript();
    if (!res) {
      alert("Razorpay SDK failed to load. Are you online?");
      setIsLoading(false);
      return;
    }

    try {
      // 2. Fetch the Secure Order ID from Phase 3
      const orderResponse = await fetch("/api/razorpay/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: planId }),
      });
      const orderData = await orderResponse.json();

      if (orderData.error) throw new Error(orderData.error);

      // 3. Configure the Razorpay Checkout Window
      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID, 
        amount: orderData.amount,
        currency: orderData.currency,
        name: "OkiConstruct Premium",
        description: label,
        order_id: orderData.id,
        theme: {
          color: "#16a34a", // A premium, sharp green to match your minimalist aesthetic
        },
        // 4. Handle the success response and send it to Phase 4 for verification
        handler: async function (response: any) {
          const verifyResponse = await fetch("/api/razorpay/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              planId: planId,
              userId: userId
            }),
          });

          const verifyData = await verifyResponse.json();
          if (verifyData.success) {
            alert("Payment Successful! Your account has been upgraded.");
            // Here you can redirect them or refresh the page
          } else {
            alert("Payment verification failed.");
          }
        },
      };

      // 5. Open the window!
      const paymentObject = new (window as any).Razorpay(options);
      paymentObject.open();

    } catch (error) {
      console.error(error);
      alert("Something went wrong initializing the checkout.");
    } finally {
      setIsLoading(false);
    }
  };

  // NEW THEME: Rounded-xl, bright green, sleek hover transition
  return (
    <button
      onClick={handleCheckout}
      disabled={isLoading}
      className="w-full bg-[#22c55e] text-white font-bold text-lg p-4 rounded-xl hover:bg-[#1ea950] transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isLoading ? "Securely Processing..." : `Upgrade to ${label} (₹${price})`}
    </button>
  );
}