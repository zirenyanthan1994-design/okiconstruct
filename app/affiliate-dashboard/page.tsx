"use client";
import { useState, useEffect } from 'react';
import { auth, db } from '../lib/firebase';
import { collection, query, where, getDocs, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import Link from 'next/link';
import Navbar from '../components/Navbar';

export default function AffiliateDashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Affiliate States
  const [affiliateData, setAffiliateData] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [referredUsers, setReferredUsers] = useState<any[]>([]);
  
  // UI States
  const [copied, setCopied] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [customCode, setCustomCode] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        await fetchAffiliateData(currentUser.uid);
      } else {
        setIsLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const fetchAffiliateData = async (uid: string) => {
    try {
      // 1. Check if they have an affiliate profile
      const q = query(collection(db, "affiliates"), where("uid", "==", uid));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const data = querySnapshot.docs[0].data();
        setAffiliateData({ id: querySnapshot.docs[0].id, ...data });

        // 2. Fetch their referred users
        const usersQ = query(collection(db, "users"), where("referredBy", "==", data.affiliateCode));
        const usersSnap = await getDocs(usersQ);
        const usersList: any[] = [];
        usersSnap.forEach(d => usersList.push({ id: d.id, ...d.data() }));
        setReferredUsers(usersList);

        // 3. Fetch their revenue transactions
        const txQ = query(collection(db, "transactions"), where("affiliateCode", "==", data.affiliateCode));
        const txSnap = await getDocs(txQ);
        const txList: any[] = [];
        txSnap.forEach(d => txList.push({ id: d.id, ...d.data() }));
        
        // Sort newest first
        txList.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setTransactions(txList);
      }
    } catch (error) {
      console.error("Error fetching affiliate data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleActivateAffiliate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!customCode || customCode.length < 4) return alert("Code must be at least 4 characters long.");
    
    setIsActivating(true);
    const finalCode = customCode.toUpperCase().replace(/\s+/g, '');

    try {
      // Check if code is already taken
      const codeCheck = await getDocs(query(collection(db, "affiliates"), where("affiliateCode", "==", finalCode)));
      if (!codeCheck.empty) {
        alert("This code is already taken. Please try another one.");
        setIsActivating(false);
        return;
      }

      // Create Affiliate Profile (Default 20% commission)
      const newAffiliateRef = doc(collection(db, "affiliates"));
      await setDoc(newAffiliateRef, {
        uid: user.uid,
        email: user.email,
        name: user.displayName || "Partner",
        affiliateCode: finalCode,
        commissionRate: 20, // 20%
        totalRevenueGenerated: 0,
        totalEarned: 0,
        balanceRemaining: 0,
        createdAt: serverTimestamp()
      });

      await fetchAffiliateData(user.uid);
    } catch (err) {
      console.error(err);
      alert("Failed to activate account. Please try again.");
    } finally {
      setIsActivating(false);
    }
  };

  const handleCopy = () => {
    const link = `https://okiconstruct.com/register?ref=${affiliateData?.affiliateCode}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div></div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 text-center">
        <h1 className="text-3xl font-black text-gray-900 mb-4">Partner Login Required</h1>
        <p className="text-gray-500 mb-8 font-medium">You must be logged in to access the Affiliate Dashboard.</p>
        <Link href="/login" className="bg-gray-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-purple-600 transition-colors">Log In</Link>
      </div>
    );
  }

  // ==========================================
  // STATE 1: ONBOARDING (Not an affiliate yet)
  // ==========================================
  if (!affiliateData) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
        <Navbar />
        <main className="max-w-[600px] mx-auto p-4 md:p-8 mt-10 w-full">
          <div className="bg-white border-2 border-purple-100 rounded-3xl p-8 md:p-12 shadow-xl text-center relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-40 h-40 bg-purple-500/10 rounded-full blur-3xl -mr-10 -mt-10"></div>
            
            <div className="w-20 h-20 bg-purple-50 text-purple-600 rounded-3xl flex items-center justify-center text-4xl mx-auto mb-6 shadow-sm border border-purple-100">🤝</div>
            <h1 className="text-3xl font-black text-gray-900 mb-4 relative z-10">Become an Oki Partner</h1>
            <p className="text-gray-500 font-medium mb-8 relative z-10">Earn a massive <strong className="text-purple-600">20% commission</strong> on every single purchase, subscription, and project unlock made by users you refer.</p>
            
            <form onSubmit={handleActivateAffiliate} className="relative z-10 text-left">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block mb-2">Create Your Custom Code</label>
              <div className="relative mb-6">
                <input 
                  type="text" 
                  required
                  placeholder="e.g. BUILDER20"
                  value={customCode}
                  onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
                  className="w-full border border-gray-200 bg-gray-50 rounded-xl p-4 font-black text-gray-900 uppercase focus:bg-white focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500 outline-none transition-all"
                />
              </div>
              <button disabled={isActivating} type="submit" className="w-full bg-purple-600 text-white font-bold py-4 rounded-xl hover:bg-purple-700 transition-colors shadow-md disabled:opacity-50">
                {isActivating ? 'Activating Profile...' : 'Activate Affiliate Account ➔'}
              </button>
            </form>
          </div>
        </main>
      </div>
    );
  }

  // ==========================================
  // STATE 2: ACTIVE DASHBOARD
  // ==========================================
  
  // Calculate specific metrics
  const paidTransactions = transactions.filter(t => t.status === 'Approved');
  const pendingTransactions = transactions.filter(t => t.status === 'Pending');

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans pb-20">
      <Navbar />
      
      <main className="max-w-[1200px] mx-auto p-4 md:p-8 mt-4 w-full">
        
        {/* HEADER & LINK GENERATOR */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 border-b border-gray-200 pb-8 gap-6">
          <div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-gray-900">Partner Dashboard</h1>
            <p className="font-bold text-purple-600 uppercase tracking-widest text-xs mt-2">Commission Rate: {affiliateData.commissionRate}%</p>
          </div>
          
          <div className="bg-white border border-gray-200 p-2 pl-4 rounded-2xl flex items-center gap-4 shadow-sm w-full md:w-auto">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Your Referral Link</p>
              <p className="font-bold text-gray-900 text-sm">okiconstruct.com/register?ref=<span className="text-purple-600">{affiliateData.affiliateCode}</span></p>
            </div>
            <button onClick={handleCopy} className={`px-4 py-2 rounded-xl font-bold text-xs transition-colors ${copied ? 'bg-green-50 text-[#22c55e]' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
              {copied ? 'Copied!' : 'Copy Link'}
            </button>
          </div>
        </div>

        {/* METRIC CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          
          <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
            <h3 className="font-bold text-gray-400 uppercase tracking-widest text-[10px] mb-2 flex items-center gap-2"><span className="text-lg">👥</span> Total Signups</h3>
            <p className="text-4xl font-black text-gray-900">{referredUsers.length}</p>
            <p className="text-[10px] font-bold mt-3 text-gray-400">Users who used your link</p>
          </div>

          <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
            <h3 className="font-bold text-gray-400 uppercase tracking-widest text-[10px] mb-2 flex items-center gap-2"><span className="text-lg">📈</span> Revenue Generated</h3>
            <p className="text-4xl font-black text-gray-900">₹{affiliateData.totalRevenueGenerated.toLocaleString()}</p>
            <p className="text-[10px] font-bold mt-3 text-gray-400">Total spent by your referrals</p>
          </div>

          <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm border-b-4 border-b-purple-500">
            <h3 className="font-bold text-purple-400 uppercase tracking-widest text-[10px] mb-2 flex items-center gap-2"><span className="text-lg">💰</span> Total Earned</h3>
            <p className="text-4xl font-black text-purple-600">₹{affiliateData.totalEarned.toLocaleString()}</p>
            <p className="text-[10px] font-bold mt-3 text-purple-400">Lifetime commission</p>
          </div>

          <div className="bg-gray-900 text-white rounded-3xl p-6 shadow-md relative overflow-hidden">
            <div className="absolute -right-4 -top-4 text-6xl opacity-10">💸</div>
            <h3 className="font-bold text-gray-400 uppercase tracking-widest text-[10px] mb-2 relative z-10">Pending Payout</h3>
            <p className="text-4xl font-black text-white relative z-10">₹{affiliateData.balanceRemaining.toLocaleString()}</p>
            <p className="text-[10px] font-bold mt-3 text-gray-400 relative z-10">Available for withdrawal</p>
          </div>

        </div>

        {/* LEDGER & USERS SPLIT */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          
          {/* Recent Conversions (Spans 2 columns) */}
          <div className="xl:col-span-2 bg-white border border-gray-100 rounded-3xl shadow-sm overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-100">
              <h2 className="font-bold text-lg text-gray-900">Recent Conversions</h2>
            </div>
            
            <div className="flex-grow overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[600px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="p-4 font-bold uppercase tracking-wider text-[10px] text-gray-500">Date</th>
                    <th className="p-4 font-bold uppercase tracking-wider text-[10px] text-gray-500">User / Purchase</th>
                    <th className="p-4 font-bold uppercase tracking-wider text-[10px] text-gray-500 text-right">Revenue</th>
                    <th className="p-4 font-bold uppercase tracking-wider text-[10px] text-gray-500 text-right">Your Cut</th>
                    <th className="p-4 font-bold uppercase tracking-wider text-[10px] text-gray-500 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.length === 0 ? (
                    <tr><td colSpan={5} className="p-8 text-center text-gray-400 font-bold text-sm">No purchases from your referrals yet.</td></tr>
                  ) : transactions.map((tx) => {
                    const commission = tx.status === 'Approved' ? (tx.amount * (affiliateData.commissionRate / 100)) : 0;
                    return (
                      <tr key={tx.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                        <td className="p-4 font-medium text-gray-500 text-xs">{tx.createdAt ? new Date(tx.createdAt.seconds * 1000).toLocaleDateString() : 'N/A'}</td>
                        <td className="p-4">
                          <p className="font-bold text-gray-900 text-sm">{tx.userName || tx.email}</p>
                          <p className="text-xs text-gray-500 font-medium mt-0.5">{tx.paymentType}</p>
                        </td>
                        <td className="p-4 text-right font-black text-gray-900 text-sm">₹{tx.amount?.toLocaleString()}</td>
                        <td className="p-4 text-right font-black text-purple-600 text-sm">₹{commission.toLocaleString()}</td>
                        <td className="p-4 text-center">
                          <span className={`inline-block px-2 py-1 text-[9px] font-black uppercase tracking-widest rounded ${tx.status === 'Approved' ? 'bg-green-50 text-[#22c55e]' : tx.status === 'Rejected' ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-500'}`}>
                            {tx.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Referred Users List (Spans 1 column) */}
          <div className="bg-white border border-gray-100 rounded-3xl shadow-sm overflow-hidden flex flex-col h-[500px]">
             <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <h2 className="font-bold text-lg text-gray-900">Your Network</h2>
              <span className="bg-purple-50 text-purple-600 text-xs font-black px-2 py-1 rounded-lg">{referredUsers.length}</span>
            </div>
            <div className="flex-grow overflow-y-auto p-2">
               {referredUsers.length === 0 ? (
                 <div className="p-6 text-center text-gray-400 font-bold text-sm h-full flex items-center justify-center">No signups yet. Share your link!</div>
               ) : referredUsers.map((u) => (
                 <div key={u.id} className="p-4 hover:bg-gray-50 rounded-xl transition-colors flex items-center gap-3">
                   <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 font-bold text-sm shrink-0">
                     {u.name ? u.name.charAt(0).toUpperCase() : u.email.charAt(0).toUpperCase()}
                   </div>
                   <div className="overflow-hidden">
                     <p className="font-bold text-gray-900 text-sm truncate">{u.name || 'Builder'}</p>
                     <p className="text-xs text-gray-500 truncate">{u.email}</p>
                   </div>
                 </div>
               ))}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}