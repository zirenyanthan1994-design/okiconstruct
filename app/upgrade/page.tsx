"use client";
import { useState, useEffect } from 'react';
import { auth, db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '../components/Navbar';
import PaymentModal from '../components/PaymentModal';

const DEFAULT_PRICING = [
  { id: '1m', months: 1, label: '1 Month', price: 999, discount: 0 },
  { id: '2m', months: 2, label: '2 Months', price: 1998, discount: 5 },
  { id: '3m', months: 3, label: '3 Months', price: 2997, discount: 10 },
  { id: '6m', months: 6, label: '6 Months', price: 5994, discount: 15 },
  { id: '1y', months: 12, label: '1 Year', price: 11988, discount: 20 },
  { id: '2y', months: 24, label: '2 Years', price: 23976, discount: 25 },
  { id: '3y', months: 36, label: '3 Years', price: 35964, discount: 30 },
  { id: '4y', months: 48, label: '4 Years', price: 47952, discount: 35 },
  { id: '5y', months: 60, label: '5 Years', price: 59940, discount: 40 }
];

export default function Upgrade() {
  const router = useRouter();
  
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const [pricingPlans, setPricingPlans] = useState(DEFAULT_PRICING);
  const [selectedPlanId, setSelectedPlanId] = useState('1m');
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        
        // Check User Status
        const docRef = doc(db, "users", currentUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().tier === "premium") {
            router.push('/');
            return;
        }

        // Fetch Global Pricing Plans
        try {
          const pricingDoc = await getDoc(doc(db, "platform", "billing"));
          if (pricingDoc.exists() && pricingDoc.data().plans) {
            setPricingPlans(pricingDoc.data().plans);
          }
        } catch (err) {
          console.error("Using default pricing.", err);
        }

      } else {
        router.push('/');
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [router]);

  const handlePaymentSuccess = () => {
    setShowPaymentModal(false);
    alert("Transaction submitted! Our team is verifying your payment and will activate your Premium account shortly.");
    router.push('/profile');
  };

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-[#22c55e] font-bold text-xl">Loading Secure Checkout...</div>
    </div>
  );

  // Math for the selected plan
  const selectedPlan = pricingPlans.find(p => p.id === selectedPlanId) || pricingPlans[0];
  const finalPrice = Math.ceil(selectedPlan.price - (selectedPlan.price * (selectedPlan.discount / 100)));

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans pb-20">
      <Navbar />

      <main className="max-w-[1200px] mx-auto p-4 md:p-6 mt-10 w-full flex-grow">
        
        <div className="text-center mb-16 pt-8">
          <div className="w-16 h-16 bg-green-50 text-[#22c55e] rounded-2xl flex items-center justify-center mx-auto mb-6 text-3xl shadow-sm border border-green-100">🚀</div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-gray-900 mb-4">Upgrade Your Workflow</h1>
          <p className="text-lg font-medium text-gray-500 max-w-2xl mx-auto leading-relaxed">Unlock the tools, set custom material consumption ratios, precise engineering overrides, advance billing ledgers and global directory visibility.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl mx-auto">
          
          {/* STANDARD TIER CARD */}
          <div className="bg-white border border-gray-100 rounded-3xl p-8 shadow-sm flex flex-col h-full">
            <h2 className="text-xl font-black uppercase text-gray-900 tracking-wider mb-2">Standard Tier</h2>
            <p className="text-4xl font-black text-gray-900 mb-8 border-b border-gray-100 pb-6">₹0 <span className="text-base text-gray-400 font-medium normal-case">/ forever</span></p>
            
            <ul className="space-y-4 font-semibold text-gray-600 mb-12 flex-grow">
              <li className="flex items-center gap-3"><span className="text-[#22c55e] text-lg">✓</span> Basic BOQ Estimation</li>
              <li className="flex items-center gap-3"><span className="text-[#22c55e] text-lg">✓</span> Personal Expenditure Ledger</li>
              <li className="flex items-center gap-3"><span className="text-[#22c55e] text-lg">✓</span> Access to Expert Directory</li>
              <li className="flex items-center gap-3 text-gray-400 opacity-60"><span className="text-gray-300 text-lg">✕</span> No Custom Material Rates</li>
              <li className="flex items-center gap-3 text-gray-400 opacity-60"><span className="text-gray-300 text-lg">✕</span> No Engineering Defaults Override</li>
              <li className="flex items-center gap-3 text-gray-400 opacity-60"><span className="text-gray-300 text-lg">✕</span> Invisible in Directory Search</li>
            </ul>

            <button disabled className="w-full bg-gray-50 border border-gray-200 py-4 font-bold text-gray-400 rounded-xl cursor-not-allowed">
              Your Current Plan
            </button>
          </div>

          {/* PREMIUM TIER CARD */}
          <div className="bg-gray-900 text-white rounded-3xl p-8 shadow-xl flex flex-col relative overflow-hidden h-full">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#22c55e] to-green-300"></div>
            <div className="absolute top-6 right-6 bg-[#22c55e]/20 text-[#22c55e] font-bold px-3 py-1 uppercase tracking-widest text-[10px] rounded-full border border-[#22c55e]/30">
              Pro Choice
            </div>
            
            <h2 className="text-xl font-black uppercase tracking-wider mb-2 text-[#22c55e]">Premium VIP</h2>
            
            {/* UPDATED: Dynamic Price Display showing Original vs Discounted */}
            <div className="mb-8 border-b border-gray-800 pb-6 flex flex-wrap items-end gap-3">
              {selectedPlan.discount > 0 && (
                <span className="text-2xl font-bold text-gray-500 line-through decoration-red-500/80 decoration-2">
                  ₹{selectedPlan.price.toLocaleString()}
                </span>
              )}
              <span className="text-4xl font-black text-white">
                ₹{finalPrice.toLocaleString()}
              </span>
              <span className="text-base text-gray-500 font-medium normal-case mb-1">
                / {selectedPlan.label}
              </span>
            </div>

            {/* DYNAMIC PLAN SELECTOR */}
            <div className="mb-8">
               <h3 className="text-gray-400 font-bold uppercase tracking-widest text-xs mb-3">Select Subscription Duration</h3>
               <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {pricingPlans.map(plan => {
                     const isSelected = selectedPlanId === plan.id;
                     const planFinalPrice = Math.ceil(plan.price - (plan.price * (plan.discount / 100)));
                     
                     return (
                       <button 
                         key={plan.id}
                         onClick={() => setSelectedPlanId(plan.id)} 
                         className={`relative text-center p-3 rounded-xl border-2 transition-all flex flex-col justify-center items-center ${isSelected ? 'border-[#22c55e] bg-[#22c55e]/10 shadow-inner' : 'border-gray-700 bg-gray-800 hover:border-gray-600'}`}
                       >
                          <div className="text-xs font-bold text-white mb-1.5">{plan.label}</div>
                          
                          <div className="flex flex-col items-center leading-tight">
                            {plan.discount > 0 ? (
                              <>
                                <span className="text-[11px] text-gray-400 line-through decoration-red-500/80 decoration-2 mb-0.5">
                                  ₹{plan.price.toLocaleString()}
                                </span>
                                <span className={`text-sm font-black ${isSelected ? 'text-[#22c55e]' : 'text-gray-300'}`}>
                                  ₹{planFinalPrice.toLocaleString()}
                                </span>
                              </>
                            ) : (
                              <span className={`text-sm font-black mt-2 ${isSelected ? 'text-[#22c55e]' : 'text-gray-300'}`}>
                                ₹{plan.price.toLocaleString()}
                              </span>
                            )}
                          </div>

                          {plan.discount > 0 && (
                            <div className="absolute -top-2 -right-2 bg-amber-400 text-amber-900 text-[10px] font-black px-2 py-0.5 rounded-md shadow-md transform rotate-3 border border-amber-300">
                              -{plan.discount}%
                            </div>
                          )}
                       </button>
                     )
                  })}
               </div>
            </div>
            
            <ul className="space-y-4 font-semibold text-gray-300 mb-12 flex-grow">
              <li className="flex items-center gap-3"><span className="text-[#22c55e] text-lg">✓</span> Override Master BOQ Formulas</li>
              <li className="flex items-center gap-3"><span className="text-[#22c55e] text-lg">✓</span> Multi-Story Apartment Engine</li>
              <li className="flex items-center gap-3"><span className="text-[#22c55e] text-lg">✓</span> Custom Material Rates & Buffers</li>
              <li className="flex items-center gap-3"><span className="text-[#22c55e] text-lg">✓</span> Billable Client Invoice Generation</li>
              <li className="flex items-center gap-3"><span className="text-[#22c55e] text-lg">✓</span> Profit Margin Calculators</li>
              <li className="flex items-center gap-3"><span className="text-[#22c55e] text-lg">✓</span> "Featured Profile" Status in Directory</li>
            </ul>

            <button 
              onClick={() => setShowPaymentModal(true)} 
              className="w-full bg-[#22c55e] text-white font-bold text-lg py-4 rounded-xl hover:bg-[#1ea950] transition-colors shadow-lg"
            >
              Checkout - ₹{finalPrice.toLocaleString()} ➔
            </button>
          </div>

        </div>
      </main>

      {showPaymentModal && (
        <PaymentModal 
          paymentType="Premium Subscription" 
          amount={finalPrice} 
          onClose={() => setShowPaymentModal(false)} 
          onSuccess={handlePaymentSuccess} 
        />
      )}
    </div>
  );
}