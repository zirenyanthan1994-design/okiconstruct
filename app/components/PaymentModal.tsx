"use client";
import { useState } from "react";
import { auth, db, storage } from "../lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

interface PaymentModalProps {
  paymentType: string;
  amount: number;
  onClose: () => void;
  onSuccess: () => void;
}

export default function PaymentModal({ paymentType, amount, onClose, onSuccess }: PaymentModalProps) {
  const [utr, setUtr] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  // Your UPI Credentials
  const UPI_ID = "okiconstruct@upi"; 
  const UPI_NAME = "OkiConstruct";
  
  // Native OS Deep Link for UPI (Triggers GPay, PhonePe, Paytm drawer on mobile)
  const upiDeepLink = `upi://pay?pa=${UPI_ID}&pn=${UPI_NAME}&am=${amount}&cu=INR`;

  const handleCopy = () => {
    navigator.clipboard.writeText(UPI_ID);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return setError("You must be logged in to make a payment.");
    if (!file) return setError("Please upload a screenshot of your successful transaction.");
    if (!storage) return setError("Storage configuration missing in firebase.ts.");

    setIsSubmitting(true);
    setError("");

    try {
      // 1. Upload Screenshot
      const fileExtension = file.name.split('.').pop();
      const fileName = `payments/${auth.currentUser.uid}_${Date.now()}.${fileExtension}`;
      const storageRef = ref(storage, fileName);
      
      await uploadBytes(storageRef, file);
      const screenshotUrl = await getDownloadURL(storageRef);

      // 2. Save Transaction
      await addDoc(collection(db, "transactions"), {
        uid: auth.currentUser.uid,
        userName: auth.currentUser.displayName || auth.currentUser.email || "Unknown User",
        paymentType: paymentType,
        amount: amount,
        utrNumber: utr || "Not Provided",
        screenshotUrl: screenshotUrl,
        status: "Pending",
        createdAt: serverTimestamp(),
      });

      onSuccess();
    } catch (err: any) {
      console.error("Upload Error:", err);
      // Failsafe: Stops the "Uploading..." lock and shows the exact Firebase error
      setError(`Upload failed. Please ensure Firebase Storage Security Rules are configured. Error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
        
        <div className="flex flex-col md:flex-row max-h-[90vh] overflow-y-auto">
          {/* LEFT: Native UPI Payment Integration */}
          <div className="bg-gray-900 text-white p-8 md:w-[45%] flex flex-col justify-center text-center">
            
            <h3 className="font-black text-2xl mb-2 text-white">Complete Payment</h3>
            <p className="text-gray-400 text-sm mb-8 font-medium">To unlock {paymentType}</p>
            
            {/* Native Deep Link Button */}
            <a 
              href={upiDeepLink}
              className="bg-[#22c55e] text-white font-black text-lg py-4 px-6 rounded-2xl hover:bg-[#1ea950] transition-transform hover:-translate-y-1 shadow-lg mb-6 flex items-center justify-center gap-3"
            >
              <span>⚡</span> Pay via UPI App
            </a>
            
            <div className="flex items-center justify-center gap-4 mb-6 opacity-50">
               <div className="h-px bg-gray-600 flex-1"></div>
               <span className="text-xs font-bold uppercase tracking-widest">OR PAY MANUALLY</span>
               <div className="h-px bg-gray-600 flex-1"></div>
            </div>

            <p className="font-bold text-gray-500 text-xs mb-2 uppercase tracking-widest">OkiConstruct UPI ID</p>
            
            {/* Copy UPI ID Feature */}
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-2 flex items-center justify-between">
              <span className="font-mono text-[#22c55e] font-bold text-sm pl-3 overflow-hidden text-ellipsis whitespace-nowrap">
                {UPI_ID}
              </span>
              <button 
                type="button"
                onClick={handleCopy}
                className="bg-gray-700 hover:bg-gray-600 text-white p-2.5 rounded-lg transition-colors flex shrink-0"
                title="Copy UPI ID"
              >
                {copied ? (
                  <span className="text-[#22c55e] text-sm font-bold">✓ Copied</span>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                )}
              </button>
            </div>
          </div>

          {/* RIGHT: Verification Upload Form */}
          <div className="p-8 md:w-[55%] bg-white flex flex-col">
            <div className="flex justify-between items-start mb-8">
              <div>
                <h2 className="text-xl font-bold text-gray-400 uppercase tracking-widest mb-1">Total Due</h2>
                <p className="text-5xl font-black text-gray-900 tracking-tighter">₹{amount.toLocaleString()}</p>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-full w-10 h-10 flex items-center justify-center transition-colors font-bold">✕</button>
            </div>

            {error && <div className="bg-red-50 text-red-600 p-4 rounded-xl mb-6 text-sm font-bold border border-red-200 flex items-start gap-2"><span className="text-red-500">⚠</span> {error}</div>}

            <form onSubmit={handleSubmit} className="flex-1 flex flex-col">
              <div className="space-y-6 flex-1">
                
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">Upload Success Screenshot <span className="text-red-500">*</span></label>
                  <div className="border-2 border-dashed border-gray-300 bg-gray-50 rounded-2xl p-8 text-center hover:border-[#22c55e] hover:bg-green-50 transition-colors cursor-pointer relative group">
                    <input 
                      type="file" 
                      accept="image/*" 
                      required 
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                    />
                    {file ? (
                      <div className="font-bold text-[#15803d] break-all flex flex-col items-center">
                        <span className="text-3xl mb-2">📸</span>
                        {file.name}
                        <span className="text-xs text-gray-500 mt-2 font-medium">Click to change file</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center">
                         <span className="text-3xl mb-2 text-gray-400 group-hover:text-[#22c55e] transition-colors">📄</span>
                         <span className="font-bold text-gray-900">Click or Drag receipt here</span>
                         <span className="text-xs font-medium text-gray-400 mt-1">PNG, JPG, JPEG</span>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block flex items-center justify-between">
                    <span>12-Digit UTR Number</span>
                    <span className="text-[10px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded">Optional</span>
                  </label>
                  <input 
                    type="text" 
                    placeholder="e.g. 312345678901" 
                    className="w-full border border-gray-200 bg-white rounded-xl p-4 text-gray-900 font-bold focus:ring-2 focus:ring-[#22c55e]/30 focus:border-[#22c55e] outline-none transition-all"
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
                  {isSubmitting ? (
                    <><svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Uploading...</>
                  ) : "Submit for Verification"}
                </button>
              </div>
            </form>
          </div>
        </div>

      </div>
    </div>
  );
}