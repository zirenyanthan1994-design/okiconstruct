"use client";
import { useState } from "react";
import { auth, db, storage } from "../lib/firebase";
import { collection, addDoc, serverTimestamp, doc, getDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

interface PaymentModalProps {
  paymentType: string;
  amount: number;
  projectId?: string; 
  onClose: () => void;
  onSuccess: () => void;
}

export default function PaymentModal({ paymentType, amount, projectId, onClose, onSuccess }: PaymentModalProps) {
  const [utr, setUtr] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  // Your UPI Credentials
  const UPI_ID = "9619067768@pthdfc"; 
  const UPI_NAME = "OkiConstruct";
  
  // Native OS Deep Link for UPI
  const upiDeepLink = `upi://pay?pa=${UPI_ID}&pn=${UPI_NAME}&am=${amount}&cu=INR`;

  const handleCopy = () => {
    navigator.clipboard.writeText(UPI_ID);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!utr || utr.length < 8) return setError("Please enter a valid 12-digit UTR/Reference Number.");
    if (!file) return setError("Please upload the payment screenshot.");
    if (!auth.currentUser) return setError("You must be logged in.");

    setIsSubmitting(true);
    setError("");

    try {
      // 1. Upload Screenshot to Firebase Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `receipts/${auth.currentUser.uid}_${Date.now()}.${fileExt}`;
      const storageRef = ref(storage, fileName);
      
      const snapshot = await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(snapshot.ref);

      // 2. SECRET AFFILIATE CHECK: See if this user was referred by someone
      const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
      const affiliateCode = userDoc.exists() ? (userDoc.data().referredBy || null) : null;

      // 3. Save Transaction to Firestore with the Affiliate Code
      await addDoc(collection(db, "transactions"), {
        uid: auth.currentUser.uid,
        userName: auth.currentUser.displayName || "Builder",
        email: auth.currentUser.email,
        paymentType,
        amount,
        projectId: projectId || null, 
        utrNumber: utr,
        screenshotUrl: downloadUrl,
        affiliateCode: affiliateCode, // <-- The code is permanently locked to the receipt
        status: "Pending",
        createdAt: serverTimestamp()
      });

      onSuccess();
    } catch (err: any) {
      console.error(err);
      setError("Failed to submit payment details. Please try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
        
        <div className="bg-gray-900 p-6 text-center relative">
          <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white w-8 h-8 flex items-center justify-center rounded-full bg-gray-800 transition-colors">✕</button>
          <h2 className="text-xl font-bold text-white mb-1">Complete Payment</h2>
          <p className="text-[#22c55e] font-black text-3xl">₹{amount.toLocaleString()}</p>
          <p className="text-gray-400 text-xs mt-2 uppercase tracking-widest font-bold">{paymentType}</p>
        </div>

        <div className="p-6 md:p-8 max-h-[70vh] overflow-y-auto">
          {error && <div className="bg-red-50 text-red-600 p-3 rounded-xl mb-6 text-sm font-bold text-center border border-red-100">{error}</div>}

          <div className="mb-8">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Step 1: Pay via UPI</h3>
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 text-center">
              <a href={upiDeepLink} className="w-full bg-[#22c55e] text-white font-bold py-3 rounded-xl mb-4 shadow-md hover:bg-[#1ea950] transition-colors flex items-center justify-center gap-2">
                Pay instantly with UPI App ↗
              </a>
              <div className="flex items-center gap-4 my-4">
                <hr className="flex-1 border-gray-200" />
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">OR COPY UPI ID</span>
                <hr className="flex-1 border-gray-200" />
              </div>
              <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl p-3">
                <span className="font-bold text-gray-700 tracking-wide select-all">{UPI_ID}</span>
                <button onClick={handleCopy} className="text-xs font-bold bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-200 transition-colors">
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Step 2: Upload Proof</h3>
            <div className="space-y-4">
              
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-2">Screenshot of Payment</label>
                <input 
                  type="file" 
                  accept="image/*" 
                  required
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="w-full border border-gray-200 bg-gray-50 rounded-xl p-3 text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-gray-900 file:text-white hover:file:bg-gray-800 transition-all cursor-pointer"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-2">12-Digit UTR / Ref Number</label>
                <input 
                  type="text" 
                  placeholder="e.g. 312345678901" 
                  required
                  className="w-full border border-gray-200 bg-gray-50 rounded-xl p-4 text-gray-900 font-bold focus:bg-white focus:ring-2 focus:ring-[#22c55e]/30 focus:border-[#22c55e] outline-none transition-all"
                  value={utr}
                  onChange={(e) => setUtr(e.target.value)}
                />
              </div>

            </div>

            <div className="mt-8 pt-6 border-t border-gray-100">
              <button 
                type="submit" 
                disabled={isSubmitting || !file} 
                className="w-full bg-gray-900 text-white font-bold uppercase tracking-widest py-4 rounded-xl hover:bg-[#22c55e] transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
              >
                {isSubmitting ? 'Uploading Proof...' : 'Submit Payment'}
              </button>
              <p className="text-[10px] text-gray-400 text-center font-bold uppercase tracking-widest mt-4">Verification usually takes 5-10 minutes</p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}