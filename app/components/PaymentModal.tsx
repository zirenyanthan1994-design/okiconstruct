"use client";
import { useState } from "react";
import { auth, db, storage } from "../lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

interface PaymentModalProps {
  paymentType: "Premium Subscription" | "Hero Ad" | "Featured Ad";
  amount: number;
  onClose: () => void;
  onSuccess: () => void;
}

export default function PaymentModal({ paymentType, amount, onClose, onSuccess }: PaymentModalProps) {
  const [utr, setUtr] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const UPI_ID = "okiconstruct@upi"; // Replace with your actual business UPI ID

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return setError("You must be logged in to make a payment.");
    if (!file) return setError("Please upload a screenshot of your successful transaction.");

    setIsSubmitting(true);
    setError("");

    try {
      // 1. Upload the Screenshot to Firebase Storage
      const fileExtension = file.name.split('.').pop();
      const fileName = `payments/${auth.currentUser.uid}_${Date.now()}.${fileExtension}`;
      const storageRef = ref(storage, fileName);
      
      await uploadBytes(storageRef, file);
      const screenshotUrl = await getDownloadURL(storageRef);

      // 2. Save Transaction to Firestore
      await addDoc(collection(db, "transactions"), {
        uid: auth.currentUser.uid,
        userName: auth.currentUser.displayName || "Unknown User",
        paymentType: paymentType,
        amount: amount,
        utrNumber: utr || "Not Provided", // UTR is not mandatory
        screenshotUrl: screenshotUrl,
        status: "Pending", // Admin must verify
        createdAt: serverTimestamp(),
      });

      onSuccess();
    } catch (err: any) {
      console.error("Payment Submission Error:", err);
      setError("Failed to submit payment. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
        
        <div className="flex flex-col md:flex-row h-full">
          {/* LEFT: Payment Instructions */}
          <div className="bg-gray-900 text-white p-8 md:w-2/5 flex flex-col justify-center items-center text-center">
            <h3 className="font-black text-xl mb-2">Scan & Pay</h3>
            <p className="text-gray-400 text-sm mb-6 font-medium">Use GPay, PhonePe, or Paytm</p>
            
            <div className="bg-white p-4 rounded-2xl mb-6 shadow-inner">
              {/* Replace this div with an actual <img> tag of your QR code */}
              <div className="w-32 h-32 bg-gray-200 border-4 border-dashed border-gray-300 flex items-center justify-center rounded-xl text-gray-500 font-bold text-xs">
                QR CODE
              </div>
            </div>

            <p className="font-bold text-gray-300 text-sm mb-2 uppercase tracking-widest">UPI ID</p>
            <div className="bg-black/50 border border-gray-700 rounded-xl py-3 px-4 w-full mb-2 font-mono text-lg text-[#22c55e]">
              {UPI_ID}
            </div>
          </div>

          {/* RIGHT: Verification Form */}
          <div className="p-8 md:w-3/5 bg-gray-50 flex flex-col">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight">{paymentType}</h2>
                <p className="text-[#22c55e] font-black text-xl mt-1">₹ {amount.toLocaleString()}</p>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-900 text-xl font-bold p-2">✕</button>
            </div>

            {error && <div className="bg-red-50 text-red-600 p-3 rounded-xl mb-6 text-sm font-bold border border-red-100">{error}</div>}

            <form onSubmit={handleSubmit} className="flex-1 flex flex-col">
              <div className="space-y-5 flex-1">
                
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Transaction Reference / UTR (Optional)</label>
                  <input 
                    type="text" 
                    placeholder="e.g. 312345678901" 
                    className="w-full border border-gray-200 bg-white rounded-xl p-3 text-gray-900 font-bold focus:ring-2 focus:ring-[#22c55e]/30 focus:border-[#22c55e] outline-none transition-all"
                    value={utr}
                    onChange={(e) => setUtr(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Upload Payment Screenshot *</label>
                  <div className="border-2 border-dashed border-gray-300 bg-white rounded-2xl p-6 text-center hover:bg-gray-50 transition-colors cursor-pointer relative">
                    <input 
                      type="file" 
                      accept="image/*" 
                      required 
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                    />
                    {file ? (
                      <div className="font-bold text-[#22c55e] break-all text-sm">📸 {file.name}</div>
                    ) : (
                      <div className="font-bold text-gray-400 text-sm">Click or Drag receipt here</div>
                    )}
                  </div>
                </div>

              </div>

              <div className="mt-8 pt-6 border-t border-gray-200">
                <button 
                  type="submit" 
                  disabled={isSubmitting || !file} 
                  className="w-full bg-[#22c55e] text-white font-black uppercase tracking-wider py-4 rounded-xl hover:bg-[#1ea950] transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? "Uploading..." : "Submit for Verification"}
                </button>
                <p className="text-center text-xs font-medium text-gray-400 mt-3">
                  Admin will verify your payment and activate your service shortly.
                </p>
              </div>
            </form>
          </div>
        </div>

      </div>
    </div>
  );
}