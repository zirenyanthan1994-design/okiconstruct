"use client";
import { useState, useEffect } from 'react';
import { auth, db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '../components/Navbar';
import PaymentModal from '../components/PaymentModal';

export default function Upgrade() {
  const router = useRouter();
  
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        const docRef = doc(db, "users", currentUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setUserData(docSnap.data());
          if (docSnap.data().tier === "premium") {
            router.push('/dashboard');
          }
        }
      } else {
        router.push('/dashboard');
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [router]);

  const handlePaymentSuccess = () => {
    setShowPaymentModal(false);
    alert("Transaction submitted! Our team is verifying your payment and will activate your Premium account shortly.");
    router.push('/dashboard');
  };

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-[#22c55e] font-bold text-xl flex items-center gap-3">
        Loading Secure Checkout...
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans pb-20">
      
      {/* ERROR FIX: Removed problematic props from Navbar */}
      <Navbar />

      <main className="max-w-[1200px] mx-auto p-4 md:p-6 mt-10 w-full flex-grow">
        
        <div className="text-center mb-16 pt-8">
          <div className="w-16 h-16 bg-green-50 text-[#22c55e] rounded-2xl flex items-center justify-center mx-auto mb-6 text-3xl shadow-sm border border-green-100">🚀</div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-gray-900 mb-4">Upgrade Your Workflow</h1>
          <p className="text-lg font-medium text-gray-500 max-w-2xl mx-auto leading-relaxed">Stop leaving money on the table. Unlock custom material rates, precise engineering overrides, and global directory visibility.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          
          <div className="bg-white border border-gray-100 rounded-3xl p-8 md:p-10 shadow-sm flex flex-col">
            <h2 className="text-xl font-black uppercase text-gray-900 tracking-wider mb-2">Standard Tier</h2>
            <p className="text-4xl font-black text-gray-900 mb-8 border-b border-gray-100 pb-6">₹0 <span className="text-base text-gray-400 font-medium normal-case">/ forever</span></p>
            
            <ul className="space-y-4 font-semibold text-gray-600 mb-12 flex-grow">
              <li className="flex items-center gap-3"><span className="text-[#22c55e] text-lg">✓</span> Basic BOQ Estimation</li>
              <li className="flex items-center gap-3"><span className="text-[#22c55e] text-lg">✓</span> Personal Expenditure Ledger</li>
              <li className="flex items-center gap-3"><span className="text-[#22c55e] text-lg">✓</span> Access to Expert Directory</li>
            </ul>

            <button disabled className="w-full bg-gray-50 border border-gray-200 py-4 font-bold text-gray-400 rounded-xl cursor-not-allowed">
              Your Current Plan
            </button>
          </div>

          <div className="bg-gray-900 text-white rounded-3xl p-8 md:p-10 shadow-xl flex flex-col relative overflow-hidden transform hover:-translate-y-1 transition-transform">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#22c55e] to-green-300"></div>
            <div className="absolute top-6 right-6 bg-[#22c55e]/20 text-[#22c55e] font-bold px-3 py-1 uppercase tracking-widest text-[10px] rounded-full border border-[#22c55e]/30">
              Pro Choice
            </div>
            
            <h2 className="text-xl font-black uppercase tracking-wider mb-2 text-[#22c55e]">Premium VIP</h2>
            <p className="text-4xl font-black mb-8 border-b border-gray-800 pb-6">₹999 <span className="text-base text-gray-500 font-medium normal-case">/ month</span></p>
            
            <ul className="space-y-4 font-semibold text-gray-300 mb-12 flex-grow">
              <li className="flex items-center gap-3 text-white"><span className="text-[#22c55e] text-lg">★</span> Everything in Standard, plus:</li>
              <li className="flex items-center gap-3"><span className="text-[#22c55e] text-lg">✓</span> Override Master BOQ Formulas</li>
              <li className="flex items-center gap-3"><span className="text-[#22c55e] text-lg">✓</span> Multi-Story Apartment Engine</li>
              <li className="flex items-center gap-3"><span className="text-[#22c55e] text-lg">✓</span> Custom Material Rates & Buffers</li>
            </ul>

            {user ? (
              <button 
                onClick={() => setShowPaymentModal(true)} 
                className="w-full bg-[#22c55e] text-white font-bold text-lg py-4 rounded-xl hover:bg-[#1ea950] transition-colors shadow-lg"
              >
                Upgrade Now ➔
              </button>
            ) : (
              <button disabled className="w-full bg-gray-800 text-gray-500 font-bold py-4 rounded-xl cursor-not-allowed">
                Loading Account...
              </button>
            )}
          </div>
        </div>
      </main>

      {showPaymentModal && (
        <PaymentModal 
          paymentType="Premium Subscription" 
          amount={999} 
          onClose={() => setShowPaymentModal(false)} 
          onSuccess={handlePaymentSuccess} 
        />
      )}
    </div>
  );
}