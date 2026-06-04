"use client";
import { useState, useEffect } from 'react';
import { auth, db } from '../lib/firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import Link from 'next/link';
import Navbar from '../components/Navbar';
import PaymentModal from '../components/PaymentModal';

export default function UpgradePage() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Database States
  const [payAsYouGo, setPayAsYouGo] = useState({ newProjectPrice: 299, unlockLayoutPrice: 99 });
  const [userProjects, setUserProjects] = useState<any[]>([]);
  
  // Modal States
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPaymentType, setSelectedPaymentType] = useState("");
  const [selectedAmount, setSelectedAmount] = useState(0);
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(undefined);
  
  // Success State
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Fetch Admin Pricing
        try {
          const billingDoc = await getDoc(doc(db, "platform", "billing"));
          if (billingDoc.exists() && billingDoc.data().payAsYouGo) {
            setPayAsYouGo(billingDoc.data().payAsYouGo);
          }
        } catch (error) {
          console.error("Error fetching billing:", error);
        }

        // Fetch User's Free Projects (To populate the Unlock Dropdown)
        try {
          const q = query(collection(db, "boq_projects"), where("userId", "==", currentUser.uid));
          const querySnapshot = await getDocs(q);
          const projects: any[] = [];
          querySnapshot.forEach((doc) => {
            const data = doc.data();
            // Only list projects that haven't been unlocked yet
            if (!data.isPremiumLayout) {
              projects.push({ id: doc.id, name: data.projectName || "Unnamed Project" });
            }
          });
          setUserProjects(projects);
          if (projects.length > 0) setSelectedProjectId(projects[0].id);
        } catch (error) {
          console.error("Error fetching projects:", error);
        }
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleOpenModal = (type: 'NEW_PROJECT' | 'UNLOCK_LAYOUT') => {
    if (!user) return alert("Please log in to make a purchase.");
    
    if (type === 'NEW_PROJECT') {
      setSelectedPaymentType("New Premium Project Workspace");
      setSelectedAmount(payAsYouGo.newProjectPrice);
      setSelectedProjectId(undefined);
    } else {
      if (userProjects.length === 0) return alert("You don't have any locked projects to upgrade!");
      setSelectedPaymentType("Unlock Unlimited Layouts");
      setSelectedAmount(payAsYouGo.unlockLayoutPrice);
    }
    
    setShowPaymentModal(true);
  };

  const handlePaymentSuccess = () => {
    setShowPaymentModal(false);
    setPaymentSuccess(true);
  };

  if (isLoading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="w-12 h-12 border-4 border-[#22c55e] border-t-transparent rounded-full animate-spin"></div></div>;
  }

  if (paymentSuccess) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-10 rounded-3xl shadow-xl text-center max-w-md w-full border border-green-100">
          <div className="w-20 h-20 bg-green-50 text-[#22c55e] rounded-full flex items-center justify-center text-4xl mx-auto mb-6">✓</div>
          <h2 className="text-2xl font-black text-gray-900 mb-2">Payment Received</h2>
          <p className="text-gray-500 font-medium mb-8 text-sm">Your UPI transaction is being verified by our team. The feature will unlock automatically within 5-10 minutes once approved.</p>
          <Link href="/" className="bg-gray-900 text-white px-8 py-4 rounded-xl font-bold hover:bg-[#22c55e] transition-colors block">Return to Dashboard</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans pb-20">
      <Navbar />
      
      <main className="max-w-[1000px] mx-auto p-4 md:p-8 mt-4 w-full">
        
        <div className="text-center mb-12">
          <span className="text-[#22c55e] font-black uppercase tracking-widest text-xs bg-green-50 px-3 py-1 rounded-md border border-green-200">Pay As You Go</span>
          <h1 className="text-4xl md:text-5xl font-black text-gray-900 tracking-tight mt-4 mb-4">Workspace Add-Ons</h1>
          <p className="text-gray-500 font-medium max-w-xl mx-auto">Skip the monthly subscriptions. Pay only for what you need, exactly when you need it.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          
          {/* CARD 1: NEW PROJECT */}
          <div className="bg-white border-2 border-gray-100 rounded-3xl p-8 shadow-sm flex flex-col hover:border-gray-300 transition-colors relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl -mr-10 -mt-10 group-hover:bg-purple-500/20 transition-all"></div>
            
            <div className="flex justify-between items-start mb-6 relative z-10">
              <div className="w-14 h-14 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center text-2xl shadow-sm">🏢</div>
            </div>
            
            <h2 className="text-2xl font-black text-gray-900 mb-2 relative z-10">New Project Workspace</h2>
            <p className="text-gray-500 font-medium text-sm mb-6 relative z-10">Bypass the 1-project free tier limit and unlock a dedicated workspace for your new client.</p>
            
            <ul className="space-y-4 mb-8 flex-grow relative z-10">
              <li className="flex items-center gap-3 text-sm font-bold text-gray-700"><span className="text-purple-500 text-lg">✓</span> Generates +1 Project Slot</li>
              <li className="flex items-center gap-3 text-sm font-bold text-gray-700"><span className="text-purple-500 text-lg">✓</span> Independent Expense Tracker</li>
              <li className="flex items-center gap-3 text-sm font-bold text-gray-700"><span className="text-[#22c55e] text-lg text-shadow-sm">★</span> Unlimited Layout Generations Included</li>
            </ul>

            <div className="mt-auto relative z-10">
              <div className="flex items-end gap-1 mb-4">
                <span className="text-4xl font-black text-gray-900">₹{payAsYouGo.newProjectPrice.toLocaleString()}</span>
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">/ One Time</span>
              </div>
              <button onClick={() => handleOpenModal('NEW_PROJECT')} className="w-full bg-gray-900 text-white font-bold py-4 rounded-xl hover:bg-purple-600 transition-colors shadow-md">
                Buy Workspace Slot
              </button>
            </div>
          </div>

          {/* CARD 2: UNLOCK LAYOUTS */}
          <div className="bg-white border-2 border-[#22c55e]/20 rounded-3xl p-8 shadow-xl flex flex-col relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#22c55e]/10 rounded-full blur-3xl -mr-10 -mt-10 group-hover:bg-[#22c55e]/20 transition-all"></div>
            
            <div className="flex justify-between items-start mb-6 relative z-10">
              <div className="w-14 h-14 bg-green-50 text-[#22c55e] rounded-2xl flex items-center justify-center text-2xl shadow-sm border border-green-100">📐</div>
              <span className="bg-[#22c55e] text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full shadow-sm">Popular</span>
            </div>
            
            <h2 className="text-2xl font-black text-gray-900 mb-2 relative z-10">Unlock Layout Engine</h2>
            <p className="text-gray-500 font-medium text-sm mb-6 relative z-10">Hit the 3-layout generation wall? Permanently unlock the AI Layout Generator for a specific free project.</p>
            
            <ul className="space-y-4 mb-8 flex-grow relative z-10">
              <li className="flex items-center gap-3 text-sm font-bold text-gray-700"><span className="text-[#22c55e] text-lg">✓</span> Unlimited AI Auto-Generations</li>
              <li className="flex items-center gap-3 text-sm font-bold text-gray-700"><span className="text-[#22c55e] text-lg">✓</span> Download High-Res JPG Blueprints</li>
              <li className="flex items-center gap-3 text-sm font-bold text-gray-700"><span className="text-[#22c55e] text-lg">✓</span> Download AutoCAD (.DXF) Files</li>
            </ul>

            <div className="mt-auto border-t border-gray-100 pt-6 relative z-10">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">Select Project to Unlock</label>
              <div className="relative mb-6">
                <select 
                  className="w-full border border-gray-200 bg-gray-50 rounded-xl p-3 font-bold text-gray-900 outline-none focus:border-[#22c55e] appearance-none"
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                >
                  {userProjects.length === 0 ? (
                    <option value="">No locked projects found</option>
                  ) : (
                    userProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)
                  )}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 text-sm">▼</div>
              </div>

              <div className="flex items-end gap-1 mb-4">
                <span className="text-4xl font-black text-[#22c55e]">₹{payAsYouGo.unlockLayoutPrice.toLocaleString()}</span>
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">/ Per Project</span>
              </div>
              <button 
                onClick={() => handleOpenModal('UNLOCK_LAYOUT')} 
                disabled={userProjects.length === 0}
                className="w-full bg-[#22c55e] text-white font-bold py-4 rounded-xl hover:bg-[#1ea950] transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Unlock Unlimited Layouts
              </button>
            </div>
          </div>

        </div>
      </main>

      {showPaymentModal && (
        <PaymentModal 
          paymentType={selectedPaymentType} 
          amount={selectedAmount} 
          projectId={selectedProjectId}
          onClose={() => setShowPaymentModal(false)}
          onSuccess={handlePaymentSuccess}
        />
      )}
    </div>
  );
}