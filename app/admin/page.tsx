"use client";
import { useState, useEffect } from 'react';
import { auth, db } from '../lib/firebase';
import { collection, getDocs, doc, getDoc, setDoc } from 'firebase/firestore'; 
import { onAuthStateChanged } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import Navbar from '../components/Navbar'; 

// ==========================================
// 🔒 ADMIN SECURITY WHITELIST
// ==========================================
// IMPORTANT: Replace this with your actual login email address!
const ADMIN_EMAILS = ["okiconstruct2026@gmail.com"]; 

// ==========================================
// MASTER DEFAULT SETTINGS
// ==========================================
const defaultSettings = {
  ratios: { 
    pcc: { c: 1, s: 3, g: 6 }, 
    slab: { c: 1, s: 2, g: 5 }, 
    footing: { c: 1, s: 2, g: 4 }, 
    plinthBeam: { c: 1, s: 3, g: 4 }, 
    beam: { c: 1, s: 3, g: 4 }, 
    column: { c: 1, s: 3, g: 4 },
    mortar: { c: 1, s: 4, g: 0 }, 
    tileBedding: { c: 1, s: 4, g: 0 }
  },
  tmtSpecs: { 
    '8mm': { length: 38, weight: 4.74 }, 
    '10mm': { length: 38, weight: 7.40 }, 
    '12mm': { length: 38, weight: 10.66 }, 
    '16mm': { length: 38, weight: 18.96 }, 
    '20mm': { length: 38, weight: 29.60 }, 
    '25mm': { length: 38, weight: 46.20 } 
  },
  dimensions: { 
    slabThickness: 5, 
    meshGap: 4, 
    slabOverhang: 3, 
    ringSpacing: 5 
  },
  percentages: { 
    wastage: { cement: 15, sand: 15, gravel: 15, tmt: 10, bricks: 15, tiles: 10 },
    slabExtraConcrete: 25,
    shuttering: 8, electrical: 12, plumbing: 8, misc: 5, logistics: 10, contingency: 5 
  },
  consumption: { 
    puttyCoverage: 10, interiorPaintCoverage: 50, exteriorPaintCoverage: 50,  
    bricksPerSqft: 5, plasterCftPerSqft: 0.15, brickJoiningCftPerSqft: 0.15, tileBeddingCftPerSqft: 0.25 
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
  
  const [activeTab, setActiveTab] = useState<'ANALYTICS' | 'PRICING' | 'ENGINE'>('ANALYTICS');
  const [isLoading, setIsLoading] = useState(true);
  
  const [users, setUsers] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [filter, setFilter] = useState<'ALL' | 'PREMIUM' | 'STANDARD'>('ALL');
  const PREMIUM_PRICE_INR = 999; 

  const [settings, setSettings] = useState(defaultSettings);
  const [pricingPlans, setPricingPlans] = useState(DEFAULT_PRICING);
  const [saveStatus, setSaveStatus] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      // 🔒 SECURITY GATEWAY
      if (currentUser && currentUser.email && ADMIN_EMAILS.includes(currentUser.email.toLowerCase())) {
        // User is logged in AND is an authorized admin
        await fetchMasterData();
        await loadCloudSettings();
        setIsLoading(false); // Only reveal page if authorized
      } else {
        // User is either not logged in, or is a standard user trying to access /admin
        router.push('/');
      }
    });
    return () => unsubscribe();
  }, [router]);

  const fetchMasterData = async () => {
    try {
      const usersSnap = await getDocs(collection(db, "users"));
      const fetchedUsers: any[] = [];
      usersSnap.forEach((doc) => fetchedUsers.push({ id: doc.id, ...doc.data() }));

      const projectsSnap = await getDocs(collection(db, "boq_projects"));
      const fetchedProjects: any[] = [];
      projectsSnap.forEach((doc) => fetchedProjects.push({ id: doc.id, ...doc.data() }));

      const enrichedUsers = fetchedUsers.map(user => {
        const userProjects = fetchedProjects.filter(p => p.userId === user.id);
        const boqCount = userProjects.filter(p => !p.isManualTracker).length;
        const ledgerCount = userProjects.filter(p => p.isManualTracker).length;
        return { ...user, totalBOQs: boqCount, totalLedgers: ledgerCount, totalProjects: userProjects.length };
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
      if (pricingDoc.exists() && pricingDoc.data().plans) {
        setPricingPlans(pricingDoc.data().plans);
      }
    } catch (err) {
      console.error("Failed to load cloud settings, using defaults.", err);
    }
  };

  const handleSaveChanges = async () => {
    try {
      await setDoc(doc(db, "platform", "engine"), { settings }, { merge: true });
      await setDoc(doc(db, "platform", "billing"), { plans: pricingPlans }, { merge: true });
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
      handleSaveChanges();
    }
  };

  const updateRatio = (key: string, field: 'c' | 's' | 'g', val: string) => setSettings(prev => ({ ...prev, ratios: { ...prev.ratios, [key]: { ...prev.ratios[key as keyof typeof defaultSettings.ratios], [field]: Number(val) } } }));
  const updateTmt = (key: string, field: 'length' | 'weight', val: string) => setSettings(prev => ({ ...prev, tmtSpecs: { ...prev.tmtSpecs, [key]: { ...prev.tmtSpecs[key as keyof typeof defaultSettings.tmtSpecs], [field]: Number(val) } } }));
  const updateDimension = (key: string, val: string) => setSettings(prev => ({ ...prev, dimensions: { ...prev.dimensions, [key]: Number(val) } }));
  const updateWastage = (key: string, val: string) => setSettings((prev: any) => ({ ...prev, percentages: { ...prev.percentages, wastage: { ...prev.percentages.wastage, [key]: Number(val) } } }));
  const updatePercentage = (key: string, val: string) => setSettings((prev: any) => ({ ...prev, percentages: { ...prev.percentages, [key]: Number(val) } }));
  const updateConsumption = (key: string, val: string) => setSettings(prev => ({ ...prev, consumption: { ...prev.consumption, [key]: Number(val) } }));

  const updatePricing = (index: number, field: string, value: string) => {
    setPricingPlans(prev => {
      const newPlans = [...prev];
      (newPlans[index] as any)[field] = Number(value);
      return newPlans;
    });
  };

  if (isLoading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center font-bold text-xl text-gray-400 uppercase tracking-widest">
      <div className="flex flex-col items-center gap-4">
        <span className="text-4xl animate-spin">🛡️</span>
        Verifying Security Credentials...
      </div>
    </div>
  );

  const premiumUsers = users.filter(u => u.tier === 'premium' || u.planStatus === 'premium'); 
  const standardUsers = users.filter(u => u.tier !== 'premium' && u.planStatus !== 'premium');
  const totalBOQs = projects.filter(p => !p.isManualTracker).length;
  const totalLedgers = projects.filter(p => p.isManualTracker).length;
  const estimatedRevenue = premiumUsers.length * PREMIUM_PRICE_INR;
  const filteredUsers = users.filter(u => filter === 'ALL' ? true : filter === 'PREMIUM' ? (u.tier === 'premium' || u.planStatus === 'premium') : (u.tier !== 'premium' && u.planStatus !== 'premium'));

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans pb-20">
      
      <Navbar />

      <main className="max-w-[1400px] mx-auto p-4 md:p-8 mt-4 w-full flex-grow">
        
        <div className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-end border-b border-gray-200 pb-6 gap-6">
          <div className="animate-in fade-in slide-in-from-left-4 duration-500">
            <h1 className="text-4xl md:text-5xl font-black tracking-tight text-gray-900">
               System Admin
            </h1>
            <p className="font-bold text-gray-500 uppercase tracking-widest text-xs mt-2">Master Override & Analytics Dashboard</p>
          </div>
          
          <div className="flex gap-2 w-full md:w-auto bg-gray-200 p-1 rounded-2xl animate-in fade-in slide-in-from-right-4 duration-500 overflow-x-auto">
             <button 
               onClick={() => setActiveTab('ANALYTICS')} 
               className={`flex-1 md:flex-none px-6 py-3 rounded-xl font-bold uppercase text-sm transition-all ${activeTab === 'ANALYTICS' ? 'bg-white text-[#22c55e] shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
             >
               Analytics
             </button>
             <button 
               onClick={() => setActiveTab('PRICING')} 
               className={`flex-1 md:flex-none px-6 py-3 rounded-xl font-bold uppercase text-sm transition-all ${activeTab === 'PRICING' ? 'bg-white text-[#22c55e] shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
             >
               Pricing
             </button>
             <button 
               onClick={() => setActiveTab('ENGINE')} 
               className={`flex-1 md:flex-none px-6 py-3 rounded-xl font-bold uppercase text-sm transition-all ${activeTab === 'ENGINE' ? 'bg-white text-[#22c55e] shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
             >
               Engine
             </button>
          </div>
        </div>

        {saveStatus && (
          <div className={`border p-4 rounded-xl mb-8 font-bold text-center animate-in slide-in-from-top-2 flex items-center justify-center gap-2 ${saveStatus.includes('Failed') ? 'bg-red-50 text-red-600 border-red-200' : 'bg-green-50 text-[#22c55e] border-green-200'}`}>
            <span>{saveStatus.includes('Failed') ? '⚠' : '✅'}</span> {saveStatus}
          </div>
        )}

        {/* TAB 1: ANALYTICS */}
        {activeTab === 'ANALYTICS' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
              <div className="bg-white border border-gray-100 rounded-3xl p-8 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-bl-[100px] -z-0"></div>
                <h3 className="font-bold text-gray-400 uppercase tracking-widest text-xs mb-2 relative z-10">Total Operators</h3>
                <p className="text-5xl font-black text-gray-900 relative z-10">{users.length}</p>
                <div className="flex items-center gap-3 mt-4 relative z-10">
                  <span className="bg-green-50 text-[#22c55e] text-xs font-bold px-2 py-1 rounded-md">{premiumUsers.length} Pro</span>
                  <span className="bg-gray-100 text-gray-500 text-xs font-bold px-2 py-1 rounded-md">{standardUsers.length} Free</span>
                </div>
              </div>
              
              <div className="bg-white border border-gray-100 rounded-3xl p-8 shadow-sm hover:shadow-md transition-shadow">
                <h3 className="font-bold text-gray-400 uppercase tracking-widest text-xs mb-2">Total BOQs Generated</h3>
                <p className="text-5xl font-black text-gray-900">{totalBOQs}</p>
                <p className="text-xs font-bold mt-4 uppercase tracking-widest text-gray-400">System Wide Database</p>
              </div>
              
              <div className="bg-white border border-gray-100 rounded-3xl p-8 shadow-sm hover:shadow-md transition-shadow">
                <h3 className="font-bold text-gray-400 uppercase tracking-widest text-xs mb-2">Active Expense Ledgers</h3>
                <p className="text-5xl font-black text-gray-900">{totalLedgers}</p>
                <p className="text-xs font-bold mt-4 uppercase tracking-widest text-gray-400">System Wide Database</p>
              </div>
              
              <div className="bg-[#22c55e] rounded-3xl p-8 shadow-md hover:shadow-lg transition-shadow text-white">
                <h3 className="font-bold text-white/80 uppercase tracking-widest text-xs mb-2">Est. Gross Revenue</h3>
                <p className="text-4xl md:text-5xl font-black text-white tracking-tight">₹{(estimatedRevenue).toLocaleString()}</p>
                <p className="text-xs font-bold mt-4 uppercase tracking-widest text-white/80">Based on Active Pro Tiers</p>
              </div>
            </div>

            <div className="bg-white border border-gray-100 rounded-3xl shadow-sm overflow-hidden">
              <div className="p-6 md:p-8 border-b border-gray-100 bg-white flex flex-col md:flex-row justify-between items-center gap-6">
                <h2 className="font-bold text-2xl text-gray-900 flex items-center gap-3">
                  <span className="bg-gray-100 p-2 rounded-xl text-xl">👥</span> Operator Database
                </h2>
                <div className="flex gap-2 w-full md:w-auto bg-gray-50 p-1 rounded-xl border border-gray-200">
                  {['ALL', 'PREMIUM', 'STANDARD'].map((t) => (
                    <button 
                      key={t} 
                      onClick={() => setFilter(t as any)} 
                      className={`flex-1 md:flex-none px-6 py-2.5 font-bold uppercase text-xs rounded-lg transition-colors ${filter === t ? 'bg-white text-[#22c55e] shadow-sm border border-gray-100' : 'text-gray-500 hover:text-gray-900'}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[800px]">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="p-5 font-bold uppercase tracking-wider text-xs text-gray-500">User Details</th>
                      <th className="p-5 font-bold uppercase tracking-wider text-xs text-gray-500 text-center">Tier</th>
                      <th className="p-5 font-bold uppercase tracking-wider text-xs text-gray-500 text-center">BOQs</th>
                      <th className="p-5 font-bold uppercase tracking-wider text-xs text-gray-500 text-center">Ledgers</th>
                      <th className="p-5 font-bold uppercase tracking-wider text-xs text-gray-500 text-right">Join Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u, i) => (
                      <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50/80 transition-colors">
                        <td className="p-5">
                          <p className="font-bold text-base text-gray-900">{u.name || 'Unknown Builder'}</p>
                          <p className="font-medium text-gray-500 text-sm">{u.email}</p>
                          <p className="font-medium text-gray-400 text-xs mt-1">ID: {u.id}</p>
                        </td>
                        <td className="p-5 text-center">
                          <span className={`inline-block px-3 py-1 font-bold text-xs uppercase tracking-widest rounded-md ${u.tier === 'premium' || u.planStatus === 'premium' ? 'bg-green-50 text-[#22c55e]' : 'bg-gray-100 text-gray-500'}`}>
                            {u.tier === 'premium' || u.planStatus === 'premium' ? 'PRO VIP' : 'FREE'}
                          </span>
                        </td>
                        <td className="p-5 text-center font-bold text-xl text-gray-700">{u.totalBOQs}</td>
                        <td className="p-5 text-center font-bold text-xl text-gray-700">{u.totalLedgers}</td>
                        <td className="p-5 text-right font-medium text-gray-500 text-sm">
                          {u.createdAt ? new Date(u.createdAt.seconds * 1000).toLocaleDateString() : 'Legacy Account'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: PRICING */}
        {activeTab === 'PRICING' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 bg-white p-6 md:p-8 rounded-3xl border border-gray-100 shadow-sm">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                  <span className="bg-gray-100 p-2 rounded-xl text-xl">💳</span> Global Pricing
                </h2>
                <p className="font-medium text-gray-500 mt-2 text-sm">Control the base prices and discount incentives displayed on the Upgrade page.</p>
              </div>
              <div className="flex gap-4 mt-6 md:mt-0 w-full md:w-auto">
                 <button onClick={handleResetSettings} className="flex-1 md:flex-none border border-gray-200 bg-white text-gray-600 px-6 py-3 font-bold rounded-xl hover:bg-gray-50 transition-colors text-sm">Reset Defaults</button>
                 <button onClick={handleSaveChanges} className="flex-1 md:flex-none bg-[#22c55e] text-white px-8 py-3 font-bold rounded-xl shadow-md hover:bg-[#1ea950] transition-colors text-sm">Save Global Sync</button>
              </div>
            </div>

            <section className="bg-white border border-blue-100 rounded-3xl p-6 md:p-10 shadow-sm mb-8">
              <div className="mb-6 border-b border-gray-100 pb-4">
                  <h2 className="text-xl font-bold text-gray-900 mb-2 flex items-center gap-2">Subscription Tiers</h2>
                  <p className="text-sm font-medium text-gray-500">Adjust the raw price and percentage discount for each duration.</p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {pricingPlans.map((plan, i) => {
                  const finalPrice = Math.ceil(plan.price - (plan.price * (plan.discount/100)));
                  return (
                    <div key={plan.id} className="border border-gray-200 p-4 rounded-2xl bg-gray-50/50 hover:border-blue-300 transition-colors">
                      <div className="font-black text-gray-900 mb-4 pb-2 border-b border-gray-200">{plan.label} VIP</div>
                      <div className="space-y-4">
                        <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase">Base Price (₹)</label>
                          <input type="number" className="w-full border border-gray-200 rounded-lg p-2 font-bold focus:border-[#22c55e] outline-none" value={plan.price} onChange={(e) => updatePricing(i, 'price', e.target.value)} />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase">Discount (%)</label>
                          <div className="relative">
                            <input type="number" className="w-full border border-gray-200 rounded-lg p-2 font-bold focus:border-[#22c55e] outline-none pr-8" value={plan.discount} onChange={(e) => updatePricing(i, 'discount', e.target.value)} />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-bold">%</span>
                          </div>
                        </div>
                        <div className="pt-3 flex justify-between items-center text-sm border-t border-gray-100">
                          <span className="font-bold text-gray-500">Final Price:</span>
                          <span className="font-black text-[#22c55e] text-lg">₹{finalPrice.toLocaleString()}</span>
                        </div>
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
                <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                  <span className="bg-gray-100 p-2 rounded-xl text-xl">⚙️</span> Engine Configuration
                </h2>
                <p className="font-medium text-gray-500 mt-2 text-sm">Sync specific BOQ formulas and material constants directly to the cloud.</p>
              </div>
              <div className="flex gap-4 mt-6 md:mt-0 w-full md:w-auto">
                 <button onClick={handleResetSettings} className="flex-1 md:flex-none border border-gray-200 bg-white text-gray-600 px-6 py-3 font-bold rounded-xl hover:bg-gray-50 transition-colors text-sm">Reset Defaults</button>
                 <button onClick={handleSaveChanges} className="flex-1 md:flex-none bg-[#22c55e] text-white px-8 py-3 font-bold rounded-xl shadow-md hover:bg-[#1ea950] transition-colors text-sm">Save Global Sync</button>
              </div>
            </div>

            <div className="space-y-8">
              
              <section className="bg-white border border-gray-100 rounded-3xl p-6 md:p-10 shadow-sm">
                <div className="mb-6 border-b border-gray-100 pb-4">
                   <h2 className="text-xl font-bold text-gray-900 mb-2 flex items-center gap-2">
                    <span className="bg-green-100 text-[#22c55e] w-8 h-8 rounded-full flex items-center justify-center text-sm">1</span> 
                    Material Wastage Ratios (%)
                  </h2>
                   <p className="text-sm font-medium text-gray-500 ml-10">Set distinct wastage buffers for each core material type.</p>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-3 gap-6 ml-0 md:ml-10">
                  {[
                    { key: 'cement', label: 'Cement Wastage' },
                    { key: 'sand', label: 'Sand Wastage' },
                    { key: 'gravel', label: 'Gravel Wastage' },
                    { key: 'tmt', label: 'TMT / Steel Wastage' },
                    { key: 'bricks', label: 'Bricks Wastage' },
                    { key: 'tiles', label: 'Tiles Wastage' }
                  ].map((item) => (
                    <div key={item.key}>
                      <label className={labelStyle}>{item.label}</label>
                      <div className="relative">
                        <input 
                          type="number" 
                          inputMode="decimal"
                          className={`${inputStyle} text-[#22c55e] pr-8`} 
                          value={(settings.percentages.wastage as any)?.[item.key] ?? ''} 
                          onChange={(e) => updateWastage(item.key, e.target.value)} 
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="bg-white border border-gray-100 rounded-3xl p-6 md:p-10 shadow-sm">
                 <div className="mb-6 border-b border-gray-100 pb-4">
                   <h2 className="text-xl font-bold text-gray-900 mb-2 flex items-center gap-2">
                    <span className="bg-green-100 text-[#22c55e] w-8 h-8 rounded-full flex items-center justify-center text-sm">2</span> 
                    Service & Overhead Percentages (%)
                  </h2>
                   <p className="text-sm font-medium text-gray-500 ml-10">System-wide percentage multipliers applied to the base costs.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 ml-0 md:ml-10">
                  {Object.keys(settings.percentages).filter(k => k !== 'wastage').map(key => (
                    <div key={key}>
                      <label className={labelStyle}>{formatLabel(key)}</label>
                      <div className="relative">
                         <input type="number" value={(settings.percentages as any)[key]} onChange={(e) => updatePercentage(key, e.target.value)} className={`${inputStyle} pr-8`} />
                         <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="bg-white border border-gray-100 rounded-3xl p-6 md:p-10 shadow-sm">
                <div className="mb-8">
                  <h2 className="text-xl font-bold text-gray-900 mb-2 flex items-center gap-2">
                    <span className="bg-green-100 text-[#22c55e] w-8 h-8 rounded-full flex items-center justify-center text-sm">3</span> 
                    Concrete & Mortar Ratios
                  </h2>
                  <p className="text-sm font-medium text-gray-500 ml-10">Define the parts of cement, sand, and gravel for each mixture.</p>
                </div>
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
                <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                  <span className="bg-green-100 text-[#22c55e] w-8 h-8 rounded-full flex items-center justify-center text-sm">4</span> 
                  Standard TMT Specifications
                </h2>
                <div className="overflow-x-auto ml-0 md:ml-10">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-y border-gray-100">
                        <th className="p-4 font-bold text-xs text-gray-500 uppercase tracking-wider">Bar Size</th>
                        <th className="p-4 font-bold text-xs text-gray-500 uppercase tracking-wider text-center">Length (Ft)</th>
                        <th className="p-4 font-bold text-xs text-gray-500 uppercase tracking-wider text-center">Weight (Kg)</th>
                      </tr>
                    </thead>
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
                <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                  <span className="bg-green-100 text-[#22c55e] w-8 h-8 rounded-full flex items-center justify-center text-sm">5</span> 
                  Structural Dimensions (Inches)
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 ml-0 md:ml-10">
                  {Object.keys(settings.dimensions).map(key => (
                    <div key={key}>
                      <label className={labelStyle}>{formatLabel(key)}</label>
                      <input type="number" value={(settings.dimensions as any)[key]} onChange={(e) => updateDimension(key, e.target.value)} className={inputStyle} />
                    </div>
                  ))}
                </div>
              </section>

              <section className="bg-white border border-gray-100 rounded-3xl p-6 md:p-10 shadow-sm">
                <div className="mb-8">
                   <h2 className="text-xl font-bold text-gray-900 mb-2 flex items-center gap-2">
                    <span className="bg-green-100 text-[#22c55e] w-8 h-8 rounded-full flex items-center justify-center text-sm">6</span> 
                    Consumption Metrics
                  </h2>
                   <p className="text-sm font-medium text-gray-500 ml-10">Set the required volume (CFT) per Sq.Ft.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 ml-0 md:ml-10">
                  {Object.keys(settings.consumption).map(key => {
                    const displayTitle = customLabels[key] || formatLabel(key);
                    return (
                      <div key={key}>
                        <label className={labelStyle}>{displayTitle}</label>
                        <input type="number" step="0.01" value={(settings.consumption as any)[key]} onChange={(e) => updateConsumption(key, e.target.value)} className={`${inputStyle} text-[#22c55e]`} />
                      </div>
                    )
                  })}
                </div>
              </section>
              
            </div>
          </div>
        )}
      </main>
    </div>
  );
}