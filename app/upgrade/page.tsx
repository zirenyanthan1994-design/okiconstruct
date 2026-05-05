"use client";
import { useState, useEffect } from 'react';
import { auth, db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import CheckoutButton from '../components/CheckoutButton'; // Fixed relative import path

export default function Upgrade() {
  const router = useRouter();
  
  // --- STATE ---
  const [user, setUser] = useState<User | null>(null); // Added proper Firebase User typing
  const [userData, setUserData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // --- INITIALIZATION ---
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

  const handleLogout = async () => {
    await signOut(auth);
    router.push('/dashboard');
  };

  if (isLoading) return <div className="min-h-screen flex items-center justify-center font-black text-2xl uppercase">Loading Secure Checkout...</div>;

  const isPremium = userData?.tier === "premium";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col pb-20">
      
      {/* MASTER HEADER */}
      <header className="bg-black text-white border-b-4 border-black sticky top-0 z-50">
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 h-20 flex justify-between items-center bg-black relative z-50">
          <Link href="/dashboard" className="font-black text-2xl tracking-tighter cursor-pointer hover:opacity-80 transition-opacity">
            <span className="text-white">OKI</span><span className="text-[#22c55e]">CONSTRUCT</span>
          </Link>
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="flex items-center gap-2 text-white font-black text-xl hover:text-[#22c55e] transition-colors">
            <span className="text-sm tracking-widest uppercase hidden md:inline-block">Menu</span>
            <span className="text-2xl">{isMobileMenuOpen ? "✕" : "☰"}</span>
          </button>
        </div>

        {isMobileMenuOpen && (
          <nav className="absolute top-full left-0 w-full bg-gray-900 border-b-4 border-black flex flex-col p-6 gap-4 animate-in slide-in-from-top-2 shadow-[0px_10px_0px_0px_rgba(0,0,0,1)] z-40">
            <div className="max-w-[1400px] mx-auto w-full flex flex-col gap-4">
              <Link href="/estimate-boq" className="font-black text-sm md:text-base uppercase hover:text-[#22c55e] border-b border-gray-800 pb-3 transition-colors">Estimate BOQ</Link>
              <Link href="/track-expenditure" className="font-black text-sm md:text-base uppercase hover:text-[#22c55e] border-b border-gray-800 pb-3 transition-colors">Track Expenditure</Link>
              <Link href="/contact-experts" className="font-black text-sm md:text-base uppercase hover:text-[#22c55e] border-b border-gray-800 pb-3 transition-colors">Contact Experts</Link>
              {isPremium && <Link href="/custom-settings" className="font-black text-sm md:text-base uppercase text-[#22c55e] border-b border-gray-800 pb-3 hover:text-white transition-colors">⚙️ Custom Rates</Link>}
              <Link href="/profile" className="font-black text-sm md:text-base uppercase text-gray-300 hover:text-white border-b border-gray-800 pb-3 transition-colors">My Profile</Link>
              <button onClick={handleLogout} className="font-black text-sm md:text-base uppercase text-red-500 text-left pt-2 hover:text-white transition-colors w-fit">Logout ➔</button>
            </div>
          </nav>
        )}
      </header>

      <main className="max-w-[1200px] mx-auto p-4 md:p-6 mt-10 w-full flex-grow">
        
        {/* HERO SECTION */}
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter mb-4">Upgrade Your Workflow</h1>
          <p className="text-xl font-bold text-gray-500 max-w-2xl mx-auto">Stop leaving money on the table. Unlock client invoicing, custom material rates, and global directory visibility.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          
          {/* STANDARD TIER CARD */}
          <div className="bg-white border-4 border-black p-8 opacity-70 hover:opacity-100 transition-opacity flex flex-col">
            <h2 className="text-2xl font-black uppercase mb-2">Standard Tier</h2>
            <p className="text-3xl font-black mb-8 border-b-4 border-gray-200 pb-4">₹0 <span className="text-sm text-gray-500 font-bold">/ forever</span></p>
            
            <ul className="space-y-4 font-bold text-sm mb-12 flex-grow">
              <li className="flex items-center gap-2"><span>✅</span> Basic BOQ Estimation</li>
              <li className="flex items-center gap-2"><span>✅</span> Personal Expenditure Ledger</li>
              <li className="flex items-center gap-2"><span>✅</span> Access to Expert Directory</li>
              <li className="flex items-center gap-2 text-gray-400"><span>❌</span> No Custom Material Rates</li>
              <li className="flex items-center gap-2 text-gray-400"><span>❌</span> No Client Invoicing Features</li>
              <li className="flex items-center gap-2 text-gray-400"><span>❌</span> Invisible in Directory Search</li>
            </ul>

            <button disabled className="w-full border-4 border-black p-4 font-black uppercase bg-gray-200 text-gray-500 cursor-not-allowed">
              Your Current Plan
            </button>
          </div>

          {/* PREMIUM TIER CARD */}
          <div className="bg-black text-white border-4 border-black p-8 shadow-[12px_12px_0px_0px_rgba(34,197,94,1)] flex flex-col relative transform hover:-translate-y-2 transition-transform">
            <div className="absolute -top-4 right-4 bg-[#22c55e] text-black font-black px-4 py-1 uppercase tracking-widest text-xs border-2 border-black">
              Recommended for Pros
            </div>
            
            <h2 className="text-2xl font-black uppercase mb-2 text-[#22c55e]">Premium VIP</h2>
            <p className="text-3xl font-black mb-8 border-b-4 border-gray-700 pb-4">₹999 <span className="text-sm text-gray-400 font-bold">/ month</span></p>
            
            <ul className="space-y-4 font-bold text-sm mb-12 flex-grow">
              <li className="flex items-center gap-2"><span>🔥</span> <span className="text-[#22c55e]">Everything in Standard, plus:</span></li>
              <li className="flex items-center gap-2"><span>✅</span> Override Admin Material Rates</li>
              <li className="flex items-center gap-2"><span>✅</span> Billable Client Invoice Generation</li>
              <li className="flex items-center gap-2"><span>✅</span> Profit Margin Calculators</li>
              <li className="flex items-center gap-2"><span>✅</span> "Featured Profile" Status in Directory</li>
              <li className="flex items-center gap-2"><span>✅</span> Priority Client Lead Routing</li>
            </ul>

            {/* REAL RAZORPAY ENGINE */}
            {user ? (
              <CheckoutButton 
                planId="1mo" 
                label="1 Month VIP" 
                price={999} 
                userId={user.uid}
              />
            ) : (
              <button disabled className="w-full border-4 border-black p-4 font-black uppercase bg-gray-600 text-gray-300 cursor-not-allowed">
                Loading Account...
              </button>
            )}

          </div>

        </div>
      </main>
    </div>
  );
}