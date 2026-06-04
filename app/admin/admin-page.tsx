"use client";
import { useState, useEffect } from 'react';
import { auth, db } from '../lib/firebase';
import { collection, getDocs, doc, getDoc, setDoc, updateDoc, Timestamp } from 'firebase/firestore'; 
import { onAuthStateChanged, signInWithEmailAndPassword } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

// ==========================================
// 🛑 HARDCODED ADMIN CREDENTIALS
// ==========================================
const ADMIN_EMAIL = "okiconstruct2026@gmail.com"; 
const ADMIN_PASS = "Okiconstruct@2026";

// ==========================================
// MASTER DEFAULT SETTINGS
// ==========================================
const defaultSettings = {
  ratios: { 
    pcc: { c: 1, s: 3, g: 6 }, slab: { c: 1, s: 2, g: 5 }, footing: { c: 1, s: 2, g: 4 }, 
    plinthBeam: { c: 1, s: 3, g: 4 }, beam: { c: 1, s: 3, g: 4 }, column: { c: 1, s: 3, g: 4 },
    mortar: { c: 1, s: 4, g: 0 }, tileBedding: { c: 1, s: 4, g: 0 }
  },
  tmtSpecs: { 
    '8mm': { length: 38, weight: 4.74 }, '10mm': { length: 38, weight: 7.40 }, '12mm': { length: 38, weight: 10.66 }, 
    '16mm': { length: 38, weight: 18.96 }, '20mm': { length: 38, weight: 29.60 }, '25mm': { length: 38, weight: 46.20 } 
  },
  dimensions: { slabThickness: 5, meshGap: 4, slabOverhang: 3, ringSpacing: 5 },
  percentages: { 
    wastage: { cement: 15, sand: 15, gravel: 15, tmt: 10, bricks: 15, tiles: 10 },
    slabExtraConcrete: 25, shuttering: 8, electrical: 12, plumbing: 8, misc: 5, logistics: 10, contingency: 5 
  },
  consumption: { 
    puttyCoverage: 10, interiorPaintCoverage: 50, exteriorPaintCoverage: 50,  
    bricksPerSqft: 5, plasterCftPerSqft: 0.15, brickJoiningCftPerSqft: 0.15, tileBeddingCftPerSqft: 0.25 
  },
  premiumDefaults: {
    footingMesh: '10mm',
    footingThickness: 5,
    floorThickness: 4,
    floorRccMesh: '8mm',
    rccWallThickness: 6,
    rccWallMesh: '10mm',
    slabMesh: '10mm',
    sillDepth: 4,
    sillWidth: 9,
    lintelDepth: 6,
    lintelWidth: 9
  }
};

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

const DEFAULT_PAY_AS_YOU_GO = {
  newProjectPrice: 299,
  unlockLayoutPrice: 99
};

const formatLabel = (key: string) => {
  const result = key.replace(/([A-Z])/g, " $1");
  return result.charAt(0).toUpperCase() + result.slice(1);
};

const customLabels: Record<string, string> = {
  pcc: "PCC (Foundation Bed)", slab: "Roof Slab Concrete", footing: "Footing Concrete",
  plinthBeam: "Plinth Beam Concrete", beam: "Roof Beam Concrete", column: "Column Concrete",
  mortar: "Wall Plaster & Masonry Mortar (No Gravel)", tileBedding: "Floor Tile Bedding Mortar (No Gravel)",
  puttyCoverage: "Wall Putty Coverage (Sq.Ft per Kg)", interiorPaintCoverage: "Interior Paint Coverage (Sq.Ft per Liter)",
  exteriorPaintCoverage: "Exterior Paint Coverage (Sq.Ft per Liter)", bricksPerSqft: "Bricks (Pcs per Sq.Ft of Wall)",
  plasterCftPerSqft: "Wall Plaster Volume (CFT per Sq.Ft)", brickJoiningCftPerSqft: "Brick Joining Mortar Volume (CFT per Sq.Ft)",
  tileBeddingCftPerSqft: "Tile Bedding Volume (CFT per Sq.Ft)"
};

const inputStyle = "w-full border border-gray-200 bg-gray-50 rounded-xl p-4 text-gray-900 font-medium focus:bg-white focus:ring-2 focus:ring-[#22c55e]/30 focus:border-[#22c55e] transition-all outline-none";
const labelStyle = "text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block";

export default function AdminPortal() {
  const router = useRouter();
  
  // 🔒 HIGH SECURITY AUTH STATES
  const [authStatus, setAuthStatus] = useState<'LOADING' | 'NOT_LOGGED_IN' | 'NORMAL_USER' | 'ADMIN'>('LOADING');
  const [adminLoginEmail, setAdminLoginEmail] = useState('');
  const [adminLoginPassword, setAdminLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // UI STATES
  const [activeTab, setActiveTab] = useState<'ANALYTICS' | 'PRICING' | 'ENGINE'>('ANALYTICS');
  const [analyticsFilter, setAnalyticsFilter] = useState<'ALL' | 'PENDING' | 'ACTIVE_SUBS' | 'USERS'>('ALL');
  
  // DATA STATES
  const [users, setUsers] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any | null>(null); // For CRM Modal
  
  const [settings, setSettings] = useState(defaultSettings);
  const [pricingPlans, setPricingPlans] = useState(DEFAULT_PRICING);
  const [payAsYouGoPricing, setPayAsYouGoPricing] = useState(DEFAULT_PAY_AS_YOU_GO);
  const [saveStatus, setSaveStatus] = useState("");

  // SECURITY GATEWAY INITIALIZATION
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        setAuthStatus('NOT_LOGGED_IN');
      } else if (currentUser.email && currentUser.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
        setAuthStatus('ADMIN');
        await fetchMasterData();
        await loadCloudSettings();
      } else {
        setAuthStatus('NORMAL_USER'); // Triggers the Stealth 404
      }
    });
    return () => unsubscribe();
  }, []);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError('');

    if (adminLoginEmail.toLowerCase() !== ADMIN_EMAIL.toLowerCase() || adminLoginPassword !== ADMIN_PASS) {
        setLoginError('Access Denied: Incorrect Admin Credentials.');
        setIsLoggingIn(false);
        return;
    }

    try {
        await signInWithEmailAndPassword(auth, adminLoginEmail, adminLoginPassword);
    } catch (error: any) {
        console.error("Login Error:", error);
        setLoginError('Database connection error. Check credentials.');
    } finally {
        setIsLoggingIn(false);
    }
  };

  const fetchMasterData = async () => {
    try {
      const usersSnap = await getDocs(collection(db, "users"));
      const fetchedUsers: any[] = [];
      usersSnap.forEach((doc) => fetchedUsers.push({ id: doc.id, ...doc.data() }));

      const projectsSnap = await getDocs(collection(db, "boq_projects"));
      const fetchedProjects: any[] = [];
      projectsSnap.forEach((doc) => fetchedProjects.push({ id: doc.id, ...doc.data() }));

      // Fetch Transaction History
      const txSnap = await getDocs(collection(db, "transactions"));
      const fetchedTx: any[] = [];
      txSnap.forEach(doc => fetchedTx.push({ id: doc.id, ...doc.data() }));
      fetchedTx.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setTransactions(fetchedTx);

      const enrichedUsers = fetchedUsers.map(user => {
        const userProjects = fetchedProjects.filter(p => p.userId === user.id);
        const userTx = fetchedTx.filter(t => t.uid === user.id);
        const boqCount = userProjects.filter(p => !p.isManualTracker).length;
        const ledgerCount = userProjects.filter(p => p.isManualTracker).length;
        return { ...user, totalBOQs: boqCount, totalLedgers: ledgerCount, totalProjects: userProjects.length, transactions: userTx };
      });

      enrichedUsers.sort((a, b) => b.totalProjects - a.totalProjects);
      setUsers(enrichedUsers);
      setProjects(fetchedProjects);
    } catch (error) {
      console.error("Error fetching master data:", error);
    }
  };

  const loadCloudSettings = async () => {
    try {
      const engineDoc = await getDoc(doc(db, "platform", "engine"));
      if (engineDoc.exists() && engineDoc.data().settings) {
         setSettings(engineDoc.data().settings);
      }
      const pricingDoc = await getDoc(doc(db, "platform", "billing"));
      if (pricingDoc.exists()) {
        const data = pricingDoc.data();
        if (data.plans) setPricingPlans(data.plans);
        if (data.payAsYouGo) setPayAsYouGoPricing(data.payAsYouGo);
      }
    } catch (err) {
      console.error("Failed to load cloud settings, using defaults.", err);
    }
  };

  const handleSaveChanges = async () => {
    try {
      await setDoc(doc(db, "platform", "engine"), { settings }, { merge: true });
      await setDoc(doc(db, "platform", "billing"), { plans: pricingPlans, payAsYouGo: payAsYouGoPricing }, { merge: true });
      setSaveStatus("Cloud Sync Successful! All systems updated.");
    } catch (error) {
      console.error(error);
      setSaveStatus("Sync Failed! Please check your Firestore rules.");
    }
    setTimeout(() => setSaveStatus(""), 4000);
  };

  const handleResetSettings = () => {
    if(confirm("Are you sure you want to reset all formulas and pricing to factory defaults globally?")) {
      setSettings(defaultSettings);
      setPricingPlans(DEFAULT_PRICING);
      setPayAsYouGoPricing(DEFAULT_PAY_AS_YOU_GO);
      handleSaveChanges();
    }
  };

  // ==========================================
  // CRM ACTIONS (Approve, Reject, Manage)
  // ==========================================
  const handleApproveTransaction = async (tx: any) => {
    if(!confirm(`Approve this payment of ₹${tx.amount}?`)) return;
    try {
      await updateDoc(doc(db, "transactions", tx.id), { status: "Approved", approvedAt: Timestamp.now() });
      
      // Determine what was purchased and unlock the corresponding feature
      if (tx.paymentType === "New Premium Project Workspace" || tx.paymentType === "Unlock Unlimited Layouts") {
        
        if (tx.projectId) {
           // It's a layout unlock for a specific project
           await updateDoc(doc(db, "boq_projects", tx.projectId), {
             isPremiumLayout: true
           });
        }
        // If it was a New Project purchase, the frontend already tracks it or we can flag the user
        // We will add logic on the frontend to allow them to create a project if they have an approved 'New Project' transaction
        
        alert("Payment approved! The user's micro-transaction feature is now unlocked.");
      } else {
        // Standard Subscription Upgrade Logic
        let addDays = 30; // Default 1 month
        if (tx.paymentType.includes("2 Month")) addDays = 60;
        if (tx.paymentType.includes("3 Month")) addDays = 90;
        if (tx.paymentType.includes("6 Month")) addDays = 180;
        if (tx.paymentType.includes("1 Year")) addDays = 365;
        if (tx.paymentType.includes("2 Year")) addDays = 730;
        if (tx.paymentType.includes("3 Year")) addDays = 1095;
        if (tx.paymentType.includes("4 Year")) addDays = 1460;
        if (tx.paymentType.includes("5 Year")) addDays = 1825;

        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + addDays);

        await updateDoc(doc(db, "users", tx.uid), {
          tier: "premium",
          planExpiry: Timestamp.fromDate(expiryDate),
          lastPaymentAmount: tx.amount
        });
        alert("User successfully upgraded to Premium VIP!");
      }

      fetchMasterData();
    } catch (err) { console.error("Approval failed:", err); alert("Failed to approve transaction."); }
  };

  const handleRejectTransaction = async (txId: string) => {
    const reason = prompt("Enter reason for rejection (e.g., Invalid screenshot, Incorrect amount):");
    if (reason === null) return;
    try {
      await updateDoc(doc(db, "transactions", txId), { 
        status: "Rejected", 
        rejectionReason: reason || "Verification failed.",
        rejectedAt: Timestamp.now()
      });
      alert("Transaction rejected.");
      fetchMasterData();
    } catch (err) { console.error("Rejection failed:", err); }
  };

  const handleToggleUserStatus = async (userId: string, currentStatus: string) => {
    const newStatus = currentStatus === "suspended" ? "active" : "suspended";
    if(!confirm(`Are you sure you want to ${newStatus === 'suspended' ? 'SUSPEND' : 'ACTIVATE'} this user?`)) return;
    try {
      await updateDoc(doc(db, "users", userId), { accountStatus: newStatus });
      alert(`User is now ${newStatus}.`);
      fetchMasterData();
      if (selectedUser?.id === userId) setSelectedUser({...selectedUser, accountStatus: newStatus});
    } catch (err) { console.error(err); }
  };

  const handleDeleteUser = async (userId: string) => {
    const code = prompt('DANGER: To delete this profile, type "DELETE"');
    if (code !== "DELETE") return;
    try {
      await updateDoc(doc(db, "users", userId), { isDeleted: true, accountStatus: 'deleted' });
      alert("User soft-deleted from the system.");
      setSelectedUser(null);
      fetchMasterData();
    } catch (err) { console.error(err); }
  };

  // State updaters
  const updateRatio = (key: string, field: 'c' | 's' | 'g', val: string) => setSettings((prev: any) => ({ ...prev, ratios: { ...prev.ratios, [key]: { ...prev.ratios[key], [field]: Number(val) } } }));
  const updateTmt = (key: string, field: 'length' | 'weight', val: string) => setSettings((prev: any) => ({ ...prev, tmtSpecs: { ...prev.tmtSpecs, [key]: { ...prev.tmtSpecs[key], [field]: Number(val) } } }));
  const updateDimension = (key: string, val: string) => setSettings((prev: any) => ({ ...prev, dimensions: { ...prev.dimensions, [key]: Number(val) } }));
  const updateWastage = (key: string, val: string) => setSettings((prev: any) => ({ ...prev, percentages: { ...prev.percentages, wastage: { ...prev.percentages.wastage, [key]: Number(val) } } }));
  const updatePercentage = (key: string, val: string) => setSettings((prev: any) => ({ ...prev, percentages: { ...prev.percentages, [key]: Number(val) } }));
  const updateConsumption = (key: string, val: string) => setSettings((prev: any) => ({ ...prev, consumption: { ...prev.consumption, [key]: Number(val) } }));
  const updatePricing = (index: number, field: string, value: string) => { setPricingPlans((prev: any) => { const newPlans = [...prev]; newPlans[index][field] = Number(value); return newPlans; }); };
  const updatePremiumDefaultStr = (key: string, val: string) => setSettings((prev: any) => ({ ...prev, premiumDefaults: { ...prev.premiumDefaults, [key]: val } }));
  const updatePremiumDefaultNum = (key: string, val: string) => setSettings((prev: any) => ({ ...prev, premiumDefaults: { ...prev.premiumDefaults, [key]: Number(val) } }));

  // ==========================================
  // RENDER BLOCKS: SECURITY ROUTING
  // ==========================================

  if (authStatus === 'LOADING') return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center font-bold text-xl text-gray-500 uppercase tracking-widest">
          <span className="text-4xl animate-pulse mb-4">🛡️</span> Verifying Clearance...
      </div>
  );

  if (authStatus === 'NORMAL_USER') return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center text-center p-4">
          <h1 className="text-7xl font-black text-gray-900 mb-4 tracking-tighter">404</h1>
          <p className="text-xl font-bold text-gray-500 mb-8">This page could not be found.</p>
          <Link href="/" className="bg-[#22c55e] text-white px-8 py-3 rounded-xl font-bold shadow-md hover:bg-[#1ea950] transition-colors">
              Return Home
          </Link>
      </div>
  );

  if (authStatus === 'NOT_LOGGED_IN') return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4 font-sans">
          <form onSubmit={handleAdminLogin} className="bg-gray-800 border border-gray-700 p-8 md:p-10 rounded-3xl w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-300">
              <div className="w-16 h-16 bg-red-500/10 text-red-500 flex items-center justify-center rounded-full mx-auto mb-6 text-2xl border border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.2)]">🔒</div>
              <h2 className="text-2xl font-black text-white text-center mb-2 tracking-tight">System Gateway</h2>
              <p className="text-gray-400 text-sm text-center mb-8 font-medium">Restricted Access. Authenticate to continue.</p>

              {loginError && <div className="bg-red-500/10 text-red-400 p-3 rounded-xl mb-6 text-sm font-bold text-center border border-red-500/20">{loginError}</div>}

              <div className="space-y-5">
                  <div>
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 block">Admin Email</label>
                      <input type="email" value={adminLoginEmail} onChange={e => setAdminLoginEmail(e.target.value)} required className="w-full bg-gray-900 border border-gray-700 text-white rounded-xl p-4 outline-none focus:border-[#22c55e] focus:ring-1 focus:ring-[#22c55e]/50 transition-all font-medium" placeholder="admin@okiconstruct.com" />
                  </div>
                  <div>
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 block">Passcode</label>
                      <input type="password" value={adminLoginPassword} onChange={e => setAdminLoginPassword(e.target.value)} required className="w-full bg-gray-900 border border-gray-700 text-white rounded-xl p-4 outline-none focus:border-[#22c55e] focus:ring-1 focus:ring-[#22c55e]/50 transition-all font-medium" placeholder="••••••••" />
                  </div>
              </div>

              <button type="submit" disabled={isLoggingIn} className="w-full bg-[#22c55e] text-white font-bold text-lg py-4 rounded-xl mt-8 hover:bg-[#1ea950] transition-colors shadow-lg shadow-green-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                  {isLoggingIn ? 'Authenticating...' : 'Secure Login'}
              </button>
              
              <div className="mt-8 text-center">
                 <Link href="/" className="text-xs font-bold text-gray-500 hover:text-gray-300 transition-colors uppercase tracking-widest">⬅ Return to Public Site</Link>
              </div>
          </form>
      </div>
  );

  // ==========================================
  // 4. MAIN ADMIN DASHBOARD 
  // ==========================================
  
  // Computed Dashboard Stats
  const activePremiumUsers = users.filter(u => u.tier === 'premium' && !u.isDeleted && (!u.planExpiry || u.planExpiry.seconds * 1000 > Date.now())); 
  const activeStandardUsers = users.filter(u => u.tier !== 'premium' && !u.isDeleted);
  const totalBOQs = projects.filter(p => !p.isManualTracker).length;
  const totalLedgers = projects.filter(p => p.isManualTracker).length;
  
  const pendingTransactions = transactions.filter(t => t.status === 'Pending');
  const allTimeRevenue = transactions.filter(t => t.status === 'Approved').reduce((sum, t) => sum + (t.amount || 0), 0);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans pb-20 relative">
      
      <main className="max-w-[1400px] mx-auto p-4 md:p-8 mt-4 w-full flex-grow">
        
        <div className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-end border-b border-gray-200 pb-6 gap-6">
          <div className="animate-in fade-in slide-in-from-left-4 duration-500">
            <h1 className="text-4xl md:text-5xl font-black tracking-tight text-gray-900">System Admin</h1>
            <p className="font-bold text-gray-500 uppercase tracking-widest text-xs mt-2">Master Override & CRM Dashboard</p>
          </div>
          
          <div className="flex gap-2 w-full md:w-auto bg-gray-200 p-1 rounded-2xl animate-in fade-in slide-in-from-right-4 duration-500 overflow-x-auto">
             <button onClick={() => setActiveTab('ANALYTICS')} className={`flex-1 md:flex-none px-6 py-3 rounded-xl font-bold uppercase text-sm transition-all ${activeTab === 'ANALYTICS' ? 'bg-white text-[#22c55e] shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>Analytics & CRM</button>
             <button onClick={() => setActiveTab('PRICING')} className={`flex-1 md:flex-none px-6 py-3 rounded-xl font-bold uppercase text-sm transition-all ${activeTab === 'PRICING' ? 'bg-white text-[#22c55e] shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>Pricing</button>
             <button onClick={() => setActiveTab('ENGINE')} className={`flex-1 md:flex-none px-6 py-3 rounded-xl font-bold uppercase text-sm transition-all ${activeTab === 'ENGINE' ? 'bg-white text-[#22c55e] shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>Engine</button>
          </div>
        </div>

        {saveStatus && (
          <div className={`border p-4 rounded-xl mb-8 font-bold text-center animate-in slide-in-from-top-2 flex items-center justify-center gap-2 ${saveStatus.includes('Failed') ? 'bg-red-50 text-red-600 border-red-200' : 'bg-green-50 text-[#22c55e] border-green-200'}`}>
            <span>{saveStatus.includes('Failed') ? '⚠' : '✅'}</span> {saveStatus}
          </div>
        )}

        {/* TAB 1: ANALYTICS & CRM */}
        {activeTab === 'ANALYTICS' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
              <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
                <h3 className="font-bold text-gray-400 uppercase tracking-widest text-xs mb-2">Pending Approvals</h3>
                <p className="text-5xl font-black text-[#22c55e]">{pendingTransactions.length}</p>
                <p className="text-[10px] font-bold mt-4 uppercase tracking-widest text-gray-400">Requires Action</p>
              </div>
              
              <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm flex flex-col justify-between relative overflow-hidden">
                <h3 className="font-bold text-gray-400 uppercase tracking-widest text-xs mb-2 relative z-10">Total Operators</h3>
                <p className="text-5xl font-black text-gray-900 relative z-10">{users.filter(u => !u.isDeleted).length}</p>
                <div className="flex items-center gap-2 mt-4 relative z-10">
                  <span className="bg-green-50 text-[#22c55e] text-[10px] font-bold px-2 py-1 rounded-md">{activePremiumUsers.length} VIP</span>
                  <span className="bg-gray-100 text-gray-500 text-[10px] font-bold px-2 py-1 rounded-md">{activeStandardUsers.length} Free</span>
                </div>
              </div>
              
              <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
                <h3 className="font-bold text-gray-400 uppercase tracking-widest text-xs mb-2">Total BOQs Generated</h3>
                <p className="text-5xl font-black text-gray-900">{totalBOQs}</p>
                <p className="text-[10px] font-bold mt-4 uppercase tracking-widest text-gray-400">System Wide</p>
              </div>
              
              <div className="bg-gray-900 text-white rounded-3xl p-6 shadow-md flex flex-col justify-between relative overflow-hidden">
                <div className="absolute -right-4 -top-4 text-8xl opacity-10">₹</div>
                <h3 className="font-bold text-gray-400 uppercase tracking-widest text-xs mb-2 relative z-10">Total Revenue</h3>
                <p className="text-4xl font-black text-white relative z-10">₹{allTimeRevenue.toLocaleString()}</p>
                <p className="text-[10px] font-bold mt-4 uppercase tracking-widest text-gray-500 relative z-10">All Time Approved</p>
              </div>
            </div>

            {/* CRM DATABASE */}
            <div className="bg-white border border-gray-100 rounded-3xl shadow-sm overflow-hidden">
              <div className="p-6 md:p-8 border-b border-gray-100 bg-white flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                <h2 className="font-bold text-2xl text-gray-900 flex items-center gap-3">
                  <span className="bg-gray-100 p-2 rounded-xl text-xl">👥</span> User Management (CRM)
                </h2>
                <div className="flex gap-2 w-full lg:w-auto bg-gray-50 p-1 rounded-xl border border-gray-200 overflow-x-auto">
                  {['ALL', 'PENDING', 'ACTIVE_SUBS', 'USERS'].map((t) => (
                    <button 
                      key={t} 
                      onClick={() => setAnalyticsFilter(t as any)} 
                      className={`flex-1 md:flex-none px-4 py-2.5 font-bold uppercase text-[10px] tracking-wider rounded-lg transition-colors whitespace-nowrap ${analyticsFilter === t ? 'bg-white text-[#22c55e] shadow-sm border border-gray-100' : 'text-gray-500 hover:text-gray-900'}`}
                    >
                      {t.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto">
                {analyticsFilter === 'PENDING' ? (
                  // PENDING TRANSACTIONS VIEW
                  <table className="w-full text-left border-collapse min-w-[1000px]">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="p-5 font-bold uppercase tracking-wider text-xs text-gray-500">Date</th>
                        <th className="p-5 font-bold uppercase tracking-wider text-xs text-gray-500">User / UTR</th>
                        <th className="p-5 font-bold uppercase tracking-wider text-xs text-gray-500 text-center">Amount</th>
                        <th className="p-5 font-bold uppercase tracking-wider text-xs text-gray-500 text-center">Receipt</th>
                        <th className="p-5 font-bold uppercase tracking-wider text-xs text-gray-500 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingTransactions.length === 0 ? (
                        <tr><td colSpan={5} className="p-8 text-center text-gray-400 font-bold">No pending approvals required.</td></tr>
                      ) : pendingTransactions.map((tx) => (
                        <tr key={tx.id} className="border-b border-gray-50 hover:bg-gray-50/80 transition-colors">
                          <td className="p-5 font-medium text-gray-500 text-sm">{tx.createdAt ? new Date(tx.createdAt.seconds * 1000).toLocaleString() : 'N/A'}</td>
                          <td className="p-5">
                            <p className="font-bold text-gray-900">{tx.userName}</p>
                            <p className="text-xs text-[#22c55e] font-bold my-1">{tx.paymentType}</p>
                            <p className="text-xs text-gray-400 font-mono">UTR: {tx.utrNumber}</p>
                          </td>
                          <td className="p-5 text-center font-black text-xl text-gray-900">₹{tx.amount?.toLocaleString()}</td>
                          <td className="p-5 text-center">
                            <a href={tx.screenshotUrl} target="_blank" rel="noreferrer" className="inline-block bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-100 transition-colors">View Image ↗</a>
                          </td>
                          <td className="p-5 flex justify-end gap-2">
                             <button onClick={() => handleRejectTransaction(tx.id)} className="bg-red-50 text-red-600 px-4 py-2 rounded-lg font-bold text-xs hover:bg-red-100">Reject</button>
                             <button onClick={() => handleApproveTransaction(tx)} className="bg-[#22c55e] text-white px-4 py-2 rounded-lg font-bold text-xs hover:bg-[#1ea950] shadow-sm">Approve</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  // STANDARD USERS VIEW
                  <table className="w-full text-left border-collapse min-w-[1000px]">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="p-5 font-bold uppercase tracking-wider text-[10px] text-gray-500">Builder Profile</th>
                        <th className="p-5 font-bold uppercase tracking-wider text-[10px] text-gray-500 text-center">System Status</th>
                        <th className="p-5 font-bold uppercase tracking-wider text-[10px] text-gray-500 text-center">Subscription Tier</th>
                        <th className="p-5 font-bold uppercase tracking-wider text-[10px] text-gray-500 text-center">Expiry Date</th>
                        <th className="p-5 font-bold uppercase tracking-wider text-[10px] text-gray-500 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.filter(u => {
                        if (analyticsFilter === 'ACTIVE_SUBS') return u.tier === 'premium';
                        if (analyticsFilter === 'USERS') return u.tier !== 'premium';
                        return true;
                      }).map((u) => {
                        const isExpired = u.tier === 'premium' && u.planExpiry && u.planExpiry.seconds * 1000 < Date.now();
                        const isSuspended = u.accountStatus === 'suspended';
                        return (
                          <tr key={u.id} className={`border-b border-gray-50 hover:bg-gray-50/80 transition-colors ${u.isDeleted ? 'opacity-40' : ''}`}>
                            <td className="p-5">
                              <p className="font-bold text-base text-gray-900">{u.name || 'Unknown Builder'} {u.isDeleted && <span className="text-red-500 text-xs">(Deleted)</span>}</p>
                              <p className="font-medium text-gray-500 text-sm">{u.email}</p>
                            </td>
                            <td className="p-5 text-center">
                              {isSuspended ? <span className="text-[10px] font-black text-red-500 bg-red-50 px-2 py-1 rounded uppercase tracking-widest">Suspended</span> : <span className="text-[10px] font-black text-[#22c55e] bg-green-50 px-2 py-1 rounded uppercase tracking-widest">Active</span>}
                            </td>
                            <td className="p-5 text-center">
                              <span className={`inline-block px-3 py-1 font-bold text-xs uppercase tracking-widest rounded-md ${u.tier === 'premium' ? 'bg-gray-900 text-[#22c55e]' : 'bg-gray-100 text-gray-500'}`}>
                                {u.tier === 'premium' ? 'PRO VIP' : 'FREE'}
                              </span>
                            </td>
                            <td className="p-5 text-center font-medium text-sm">
                              {u.tier === 'premium' && u.planExpiry ? (
                                <span className={isExpired ? 'text-red-500 font-bold' : 'text-gray-700'}>
                                  {new Date(u.planExpiry.seconds * 1000).toLocaleDateString()} {isExpired && '(Expired)'}
                                </span>
                              ) : <span className="text-gray-300">-</span>}
                            </td>
                            <td className="p-5 text-right">
                              <button onClick={() => setSelectedUser(u)} className="bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg font-bold text-xs hover:border-[#22c55e] hover:text-[#22c55e] transition-colors shadow-sm">View & Manage</button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: PRICING */}
        {activeTab === 'PRICING' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 bg-white p-6 md:p-8 rounded-3xl border border-gray-100 shadow-sm">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3"><span className="bg-gray-100 p-2 rounded-xl text-xl">💳</span> Global Pricing</h2>
                <p className="font-medium text-gray-500 mt-2 text-sm">Control the base prices, pay-as-you-go micro-transactions, and discount incentives.</p>
              </div>
              <div className="flex gap-4 mt-6 md:mt-0 w-full md:w-auto">
                 <button onClick={handleResetSettings} className="flex-1 md:flex-none border border-gray-200 bg-white text-gray-600 px-6 py-3 font-bold rounded-xl hover:bg-gray-50 transition-colors text-sm">Reset Defaults</button>
                 <button onClick={handleSaveChanges} className="flex-1 md:flex-none bg-[#22c55e] text-white px-8 py-3 font-bold rounded-xl shadow-md hover:bg-[#1ea950] transition-colors text-sm">Save Global Sync</button>
              </div>
            </div>

            {/* PAY AS YOU GO SECTION */}
            <section className="bg-white border border-purple-100 rounded-3xl p-6 md:p-10 shadow-sm mb-8">
              <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                 <span className="bg-purple-100 text-purple-600 w-8 h-8 rounded-full flex items-center justify-center text-sm">⚡</span> Pay-As-You-Go Limits
              </h2>
              <p className="text-sm font-medium text-gray-500 mb-6">Set the prices for one-time unlocks used by free-tier users when they hit their limits.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="border border-gray-200 p-5 rounded-2xl bg-gray-50/50">
                   <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-3">Price for a New Project Workspace</label>
                   <div className="relative">
                     <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">₹</span>
                     <input type="number" className={`${inputStyle} pl-8 border-purple-200 focus:border-purple-500 focus:ring-purple-500/20`} value={payAsYouGoPricing.newProjectPrice} onChange={(e) => setPayAsYouGoPricing({...payAsYouGoPricing, newProjectPrice: Number(e.target.value)})} />
                   </div>
                   <p className="text-xs text-gray-400 mt-3 font-medium">Bypasses the strict 1-project free limit.</p>
                </div>
                
                <div className="border border-gray-200 p-5 rounded-2xl bg-gray-50/50">
                   <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-3">Price to Unlock Unlimited Layouts</label>
                   <div className="relative">
                     <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">₹</span>
                     <input type="number" className={`${inputStyle} pl-8 border-purple-200 focus:border-purple-500 focus:ring-purple-500/20`} value={payAsYouGoPricing.unlockLayoutPrice} onChange={(e) => setPayAsYouGoPricing({...payAsYouGoPricing, unlockLayoutPrice: Number(e.target.value)})} />
                   </div>
                   <p className="text-xs text-gray-400 mt-3 font-medium">Bypasses the 3-layout free limit per individual project.</p>
                </div>
              </div>
            </section>

            {/* SUBSCRIPTION SECTION */}
            <section className="bg-white border border-blue-100 rounded-3xl p-6 md:p-10 shadow-sm mb-8">
              <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                 <span className="bg-blue-100 text-blue-600 w-8 h-8 rounded-full flex items-center justify-center text-sm">📅</span> Monthly/Yearly Subscription Plans
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {pricingPlans.map((plan, i) => {
                  const finalPrice = Math.ceil(plan.price - (plan.price * (plan.discount/100)));
                  return (
                    <div key={plan.id} className="border border-gray-200 p-5 rounded-2xl bg-gray-50/50 hover:border-blue-300 transition-colors">
                      <div className="font-black text-gray-900 mb-4 pb-3 border-b border-gray-200">{plan.label} VIP</div>
                      <div className="space-y-4">
                        <div><label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Base Price</label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium text-sm">₹</span><input type="number" className="w-full border border-gray-200 rounded-lg p-2.5 pl-7 font-bold focus:border-[#22c55e] outline-none" value={plan.price} onChange={(e) => updatePricing(i, 'price', e.target.value)} /></div></div>
                        <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Discount</label>
                          <div className="relative"><input type="number" className="w-full border border-gray-200 rounded-lg p-2.5 font-bold focus:border-[#22c55e] outline-none pr-8" value={plan.discount} onChange={(e) => updatePricing(i, 'discount', e.target.value)} /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-bold">%</span></div>
                        </div>
                        <div className="pt-4 flex justify-between items-center text-sm border-t border-gray-100"><span className="font-bold text-gray-500">Final:</span><span className="font-black text-[#22c55e] text-xl">₹{finalPrice.toLocaleString()}</span></div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          </div>
        )}

        {/* TAB 3: ENGINE */}
        {activeTab === 'ENGINE' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 bg-white p-6 md:p-8 rounded-3xl border border-gray-100 shadow-sm">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3"><span className="bg-gray-100 p-2 rounded-xl text-xl">⚙️</span> Engine Configuration</h2>
                <p className="font-medium text-gray-500 mt-2 text-sm">Sync specific BOQ formulas and material constants directly to the cloud.</p>
              </div>
              <div className="flex gap-4 mt-6 md:mt-0 w-full md:w-auto">
                 <button onClick={handleResetSettings} className="flex-1 md:flex-none border border-gray-200 bg-white text-gray-600 px-6 py-3 font-bold rounded-xl hover:bg-gray-50 transition-colors text-sm">Reset Defaults</button>
                 <button onClick={handleSaveChanges} className="flex-1 md:flex-none bg-[#22c55e] text-white px-8 py-3 font-bold rounded-xl shadow-md hover:bg-[#1ea950] transition-colors text-sm">Save Global Sync</button>
              </div>
            </div>

            <div className="space-y-8">
              <section className="bg-white border border-gray-100 rounded-3xl p-6 md:p-10 shadow-sm">
                <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2"><span className="bg-green-100 text-[#22c55e] w-8 h-8 rounded-full flex items-center justify-center text-sm">1</span> Material Wastage Ratios (%)</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-6 ml-0 md:ml-10">
                  {['cement', 'sand', 'gravel', 'tmt', 'bricks', 'tiles'].map((key) => (
                    <div key={key}><label className={labelStyle}>{key} Wastage</label><div className="relative"><input type="number" inputMode="decimal" className={`${inputStyle} text-[#22c55e] pr-8`} value={(settings.percentages.wastage as any)?.[key] ?? ''} onChange={(e) => updateWastage(key, e.target.value)} /><span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">%</span></div></div>
                  ))}
                </div>
              </section>

              <section className="bg-white border border-gray-100 rounded-3xl p-6 md:p-10 shadow-sm">
                 <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2"><span className="bg-green-100 text-[#22c55e] w-8 h-8 rounded-full flex items-center justify-center text-sm">2</span> Service & Overhead Percentages (%)</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 ml-0 md:ml-10">
                  {Object.keys(settings.percentages).filter(k => k !== 'wastage').map(key => (
                    <div key={key}><label className={labelStyle}>{formatLabel(key)}</label><div className="relative"><input type="number" value={(settings.percentages as any)[key]} onChange={(e) => updatePercentage(key, e.target.value)} className={`${inputStyle} pr-8`} /><span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">%</span></div></div>
                  ))}
                </div>
              </section>

              <section className="bg-white border border-gray-100 rounded-3xl p-6 md:p-10 shadow-sm">
                  <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2"><span className="bg-green-100 text-[#22c55e] w-8 h-8 rounded-full flex items-center justify-center text-sm">3</span> Concrete & Mortar Ratios</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 ml-0 md:ml-10">
                  {Object.keys(settings.ratios).map(key => {
                    const ratio = (settings.ratios as any)[key];
                    const displayTitle = customLabels[key] || formatLabel(key);
                    return (
                      <div key={key} className={`border border-gray-100 p-5 rounded-2xl ${key === 'mortar' || key === 'tileBedding' ? 'bg-green-50/50' : 'bg-gray-50/50'}`}>
                        <h3 className="font-bold text-gray-800 text-sm mb-4 min-h-[40px]">{displayTitle}</h3>
                        <div className="flex gap-3">
                          <div className="flex flex-col flex-1"><span className="text-[10px] font-bold uppercase text-gray-400 mb-1">Cement</span><input type="number" value={ratio.c} onChange={(e) => updateRatio(key, 'c', e.target.value)} className="w-full border border-gray-200 rounded-lg p-2 font-bold text-center focus:border-[#22c55e] outline-none" /></div>
                          <div className="flex flex-col flex-1"><span className="text-[10px] font-bold uppercase text-gray-400 mb-1">Sand</span><input type="number" value={ratio.s} onChange={(e) => updateRatio(key, 's', e.target.value)} className="w-full border border-gray-200 rounded-lg p-2 font-bold text-center focus:border-[#22c55e] outline-none" /></div>
                          <div className="flex flex-col flex-1"><span className="text-[10px] font-bold uppercase text-gray-400 mb-1">Gravel</span><input type="number" value={ratio.g} onChange={(e) => updateRatio(key, 'g', e.target.value)} disabled={key === 'mortar' || key === 'tileBedding'} className="w-full border border-gray-200 rounded-lg p-2 font-bold text-center disabled:bg-gray-100 disabled:text-gray-400 focus:border-[#22c55e] outline-none" /></div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>

              <section className="bg-white border border-gray-100 rounded-3xl p-6 md:p-10 shadow-sm">
                <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2"><span className="bg-green-100 text-[#22c55e] w-8 h-8 rounded-full flex items-center justify-center text-sm">4</span> Standard TMT Specifications</h2>
                <div className="overflow-x-auto ml-0 md:ml-10">
                  <table className="w-full text-left border-collapse">
                    <thead><tr className="bg-gray-50 border-y border-gray-100"><th className="p-4 font-bold text-xs text-gray-500 uppercase tracking-wider">Bar Size</th><th className="p-4 font-bold text-xs text-gray-500 uppercase tracking-wider text-center">Length (Ft)</th><th className="p-4 font-bold text-xs text-gray-500 uppercase tracking-wider text-center">Weight (Kg)</th></tr></thead>
                    <tbody>
                      {Object.keys(settings.tmtSpecs).map((key) => {
                        const spec = (settings.tmtSpecs as any)[key];
                        return (
                          <tr key={key} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                            <td className="p-4 font-bold text-gray-900">{key}</td>
                            <td className="p-4"><input type="number" value={spec.length} onChange={(e) => updateTmt(key, 'length', e.target.value)} className="w-full max-w-[150px] mx-auto block border border-gray-200 rounded-lg p-2 font-semibold text-center outline-none focus:border-[#22c55e]" /></td>
                            <td className="p-4"><input type="number" step="0.01" value={spec.weight} onChange={(e) => updateTmt(key, 'weight', e.target.value)} className="w-full max-w-[150px] mx-auto block border border-gray-200 rounded-lg p-2 font-semibold text-center outline-none focus:border-[#22c55e]" /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="bg-white border border-gray-100 rounded-3xl p-6 md:p-10 shadow-sm">
                <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2"><span className="bg-green-100 text-[#22c55e] w-8 h-8 rounded-full flex items-center justify-center text-sm">5</span> Structural Dimensions (Inches)</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 ml-0 md:ml-10">
                  {Object.keys(settings.dimensions).map(key => (
                    <div key={key}><label className={labelStyle}>{formatLabel(key)}</label><input type="number" value={(settings.dimensions as any)[key]} onChange={(e) => updateDimension(key, e.target.value)} className={inputStyle} /></div>
                  ))}
                </div>
              </section>

              <section className="bg-white border border-gray-100 rounded-3xl p-6 md:p-10 shadow-sm">
                   <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2"><span className="bg-green-100 text-[#22c55e] w-8 h-8 rounded-full flex items-center justify-center text-sm">6</span> Consumption Metrics</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 ml-0 md:ml-10">
                  {Object.keys(settings.consumption).map(key => {
                    const displayTitle = customLabels[key] || formatLabel(key);
                    return (
                      <div key={key}><label className={labelStyle}>{displayTitle}</label><input type="number" step="0.01" value={(settings.consumption as any)[key]} onChange={(e) => updateConsumption(key, e.target.value)} className={`${inputStyle} text-[#22c55e]`} /></div>
                    )
                  })}
                </div>
              </section>

              <section className="bg-white border border-[#22c55e]/30 bg-green-50/10 rounded-3xl p-6 md:p-10 shadow-sm">
                <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                   <span className="bg-green-100 text-[#22c55e] w-8 h-8 rounded-full flex items-center justify-center text-sm">7</span> Premium Structural Defaults
                </h2>
                <p className="text-sm text-gray-500 mb-6 ml-0 md:ml-10">Set the default values that will populate for users utilizing premium features like RCC walls or extra beams.</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 ml-0 md:ml-10">
                  {/* Footing Overrides */}
                  <div className="md:col-span-2 grid grid-cols-2 gap-4 border border-gray-100 p-4 rounded-xl bg-white shadow-sm">
                     <div className="col-span-2 text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-50 pb-2">Foundation</div>
                     <div><label className={labelStyle}>Footing Thick (in)</label><input type="number" value={(settings.premiumDefaults as any)?.footingThickness || 5} onChange={(e) => updatePremiumDefaultNum('footingThickness', e.target.value)} className={inputStyle} /></div>
                     <div><label className={labelStyle}>Footing Mesh</label><select className={inputStyle} value={(settings.premiumDefaults as any)?.footingMesh || '10mm'} onChange={(e) => updatePremiumDefaultStr('footingMesh', e.target.value)}><option value="8mm">8mm</option><option value="10mm">10mm</option><option value="12mm">12mm</option><option value="16mm">16mm</option></select></div>
                  </div>

                  {/* Floor Casting Overrides */}
                  <div className="md:col-span-2 grid grid-cols-2 gap-4 border border-gray-100 p-4 rounded-xl bg-white shadow-sm">
                     <div className="col-span-2 text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-50 pb-2">Ground / Basement Floor</div>
                     <div><label className={labelStyle}>RCC Floor Thick (in)</label><input type="number" value={(settings.premiumDefaults as any)?.floorThickness || 4} onChange={(e) => updatePremiumDefaultNum('floorThickness', e.target.value)} className={inputStyle} /></div>
                     <div><label className={labelStyle}>RCC Floor Mesh</label><select className={inputStyle} value={(settings.premiumDefaults as any)?.floorRccMesh || '8mm'} onChange={(e) => updatePremiumDefaultStr('floorRccMesh', e.target.value)}><option value="8mm">8mm</option><option value="10mm">10mm</option><option value="12mm">12mm</option></select></div>
                  </div>

                  {/* Roof Slab */}
                  <div className="grid grid-cols-1 gap-4 border border-gray-100 p-4 rounded-xl bg-white shadow-sm">
                     <div className="text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-50 pb-2">Suspended Slab</div>
                     <div><label className={labelStyle}>Roof Slab Mesh</label><select className={inputStyle} value={(settings.premiumDefaults as any)?.slabMesh || '10mm'} onChange={(e) => updatePremiumDefaultStr('slabMesh', e.target.value)}><option value="8mm">8mm</option><option value="10mm">10mm</option><option value="12mm">12mm</option></select></div>
                  </div>

                  {/* RCC Retaining Walls */}
                  <div className="md:col-span-3 grid grid-cols-2 gap-4 border border-gray-100 p-4 rounded-xl bg-white shadow-sm">
                     <div className="col-span-2 text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-50 pb-2">Basement RCC Walls</div>
                     <div><label className={labelStyle}>Wall Thickness (in)</label><input type="number" value={(settings.premiumDefaults as any)?.rccWallThickness || 6} onChange={(e) => updatePremiumDefaultNum('rccWallThickness', e.target.value)} className={inputStyle} /></div>
                     <div><label className={labelStyle}>Dual Mesh Size</label><select className={inputStyle} value={(settings.premiumDefaults as any)?.rccWallMesh || '10mm'} onChange={(e) => updatePremiumDefaultStr('rccWallMesh', e.target.value)}><option value="8mm">8mm</option><option value="10mm">10mm</option><option value="12mm">12mm</option><option value="16mm">16mm</option></select></div>
                  </div>

                  {/* Extra Beams */}
                  <div className="md:col-span-4 grid grid-cols-2 md:grid-cols-4 gap-4 border border-gray-100 p-4 rounded-xl bg-white shadow-sm mt-2">
                     <div className="col-span-2 md:col-span-4 text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-50 pb-2">Sill & Lintel Extra Beams</div>
                     <div><label className={labelStyle}>Sill Depth (in)</label><input type="number" value={(settings.premiumDefaults as any)?.sillDepth || 4} onChange={(e) => updatePremiumDefaultNum('sillDepth', e.target.value)} className={inputStyle} /></div>
                     <div><label className={labelStyle}>Sill Width (in)</label><input type="number" value={(settings.premiumDefaults as any)?.sillWidth || 9} onChange={(e) => updatePremiumDefaultNum('sillWidth', e.target.value)} className={inputStyle} /></div>
                     <div><label className={labelStyle}>Lintel Depth (in)</label><input type="number" value={(settings.premiumDefaults as any)?.lintelDepth || 6} onChange={(e) => updatePremiumDefaultNum('lintelDepth', e.target.value)} className={inputStyle} /></div>
                     <div><label className={labelStyle}>Lintel Width (in)</label><input type="number" value={(settings.premiumDefaults as any)?.lintelWidth || 9} onChange={(e) => updatePremiumDefaultNum('lintelWidth', e.target.value)} className={inputStyle} /></div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        )}
      </main>

      {/* ========================================== */}
      {/* CRM MODAL: DETAILED USER VIEW */}
      {/* ========================================== */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-300">
            
            {/* Header */}
            <div className="bg-gray-900 text-white p-6 md:p-8 flex justify-between items-start">
              <div>
                <h2 className="text-3xl font-black">{selectedUser.name || 'Unknown User'}</h2>
                <p className="text-gray-400 font-medium text-sm mt-1">{selectedUser.email} • ID: {selectedUser.id}</p>
                <div className="flex gap-2 mt-4">
                  <span className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded ${selectedUser.tier === 'premium' ? 'bg-[#22c55e] text-white' : 'bg-gray-700 text-gray-300'}`}>{selectedUser.tier === 'premium' ? 'Premium VIP' : 'Standard Free'}</span>
                  <span className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded ${selectedUser.accountStatus === 'suspended' ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'}`}>{selectedUser.accountStatus === 'suspended' ? 'Suspended' : 'Active Account'}</span>
                </div>
              </div>
              <button onClick={() => setSelectedUser(null)} className="text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-full w-10 h-10 flex items-center justify-center transition-colors font-bold">✕</button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-gray-50">
              <div className="grid grid-cols-3 gap-4 mb-8">
                <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm text-center">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">BOQs Created</p>
                  <p className="text-3xl font-black text-gray-900">{selectedUser.totalBOQs}</p>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm text-center">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Ledgers</p>
                  <p className="text-3xl font-black text-gray-900">{selectedUser.totalLedgers}</p>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm text-center">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Joined Date</p>
                  <p className="text-lg font-black text-gray-900 mt-2">{selectedUser.createdAt ? new Date(selectedUser.createdAt.seconds * 1000).toLocaleDateString() : 'N/A'}</p>
                </div>
              </div>

              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest mb-4 border-b border-gray-200 pb-2">Transaction History</h3>
              {selectedUser.transactions && selectedUser.transactions.length > 0 ? (
                <div className="space-y-3 mb-8">
                  {selectedUser.transactions.map((tx: any) => (
                    <div key={tx.id} className="bg-white border border-gray-200 rounded-xl p-4 flex justify-between items-center">
                      <div>
                        <p className="font-bold text-sm text-gray-900">{tx.paymentType}</p>
                        <p className="text-xs text-gray-500 font-mono mt-1">UTR: {tx.utrNumber} • {new Date(tx.createdAt.seconds * 1000).toLocaleDateString()}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-black text-lg text-gray-900">₹{tx.amount}</p>
                        <p className={`text-[10px] font-bold uppercase tracking-widest ${tx.status === 'Approved' ? 'text-[#22c55e]' : tx.status === 'Rejected' ? 'text-red-500' : 'text-amber-500'}`}>{tx.status}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm font-bold text-gray-400 italic mb-8 bg-white border border-gray-100 p-6 rounded-xl text-center">No payment history found for this user.</p>
              )}
            </div>

            {/* Footer Actions */}
            <div className="bg-white p-6 border-t border-gray-100 flex justify-between items-center">
              <button onClick={() => handleDeleteUser(selectedUser.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50 px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-widest transition-colors">
                Delete Profile
              </button>
              
              <div className="flex gap-3">
                <button onClick={() => handleToggleUserStatus(selectedUser.id, selectedUser.accountStatus)} className="bg-gray-100 text-gray-700 hover:bg-gray-200 px-6 py-3 rounded-xl font-bold text-sm transition-colors shadow-sm">
                  {selectedUser.accountStatus === 'suspended' ? 'Re-Activate User' : 'Suspend / Deactivate'}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}