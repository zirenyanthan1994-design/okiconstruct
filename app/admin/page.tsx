"use client";
import { useState, useEffect } from 'react';
import { auth, db } from '../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useRouter } from 'next/navigation';

// ==========================================
// MASTER DEFAULT SETTINGS
// ==========================================
const defaultSettings = {
  ratios: { 
    pcc: { c: 1, s: 3, g: 6 }, 
    slab: { c: 1, s: 2, g: 4 }, 
    footing: { c: 1, s: 2, g: 4 }, 
    plinthBeam: { c: 1, s: 2, g: 4 }, 
    beam: { c: 1, s: 1.5, g: 3 }, 
    column: { c: 1, s: 1.5, g: 3 },
    mortar: { c: 1, s: 4, g: 0 }, 
    tileBedding: { c: 1, s: 4, g: 0 }
  },
  tmtSpecs: { 
    '8mm': { length: 40, weight: 4.74 }, 
    '10mm': { length: 40, weight: 7.40 }, 
    '12mm': { length: 40, weight: 10.66 }, 
    '16mm': { length: 40, weight: 18.96 }, 
    '20mm': { length: 40, weight: 29.60 }, 
    '25mm': { length: 40, weight: 46.20 } 
  },
  dimensions: { 
    slabThickness: 5, 
    meshGap: 4, 
    slabOverhang: 3, 
    ringSpacing: 5 
  },
  percentages: { 
    materialWastage: 7, 
    slabExtraConcrete: 30 
  },
  consumption: { 
    puttyCoverage: 10, 
    bricksPerSqft: 5, 
    plasterCftPerSqft: 0.08, 
    brickJoiningCftPerSqft: 0.05, 
    tileBeddingCftPerSqft: 0.15 
  }
};

const formatLabel = (key: string) => {
  const result = key.replace(/([A-Z])/g, " $1");
  return result.charAt(0).toUpperCase() + result.slice(1);
};

const customLabels: Record<string, string> = {
  pcc: "PCC (Foundation Bed)",
  slab: "Roof Slab Concrete",
  footing: "Footing Concrete",
  plinthBeam: "Plinth Beam Concrete",
  beam: "Roof Beam Concrete",
  column: "Column Concrete",
  mortar: "Wall Plaster & Masonry Mortar (No Gravel)",
  tileBedding: "Floor Tile Bedding Mortar (No Gravel)",
  puttyCoverage: "Wall Putty Coverage (Sq.Ft per Kg)",
  bricksPerSqft: "Bricks (Pcs per Sq.Ft of Wall)",
  plasterCftPerSqft: "Wall Plaster Volume (CFT per Sq.Ft)",
  brickJoiningCftPerSqft: "Brick Joining Mortar Volume (CFT per Sq.Ft)",
  tileBeddingCftPerSqft: "Tile Bedding Volume (CFT per Sq.Ft)"
};

export default function AdminPortal() {
  const router = useRouter();
  
  // --- MASTER STATE ---
  const [activeTab, setActiveTab] = useState<'ANALYTICS' | 'ENGINE'>('ANALYTICS');
  const [isLoading, setIsLoading] = useState(true);
  
  // --- ANALYTICS STATE ---
  const [users, setUsers] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [filter, setFilter] = useState<'ALL' | 'PREMIUM' | 'STANDARD'>('ALL');
  const PREMIUM_PRICE_INR = 9999;

  // --- ENGINE STATE ---
  const [settings, setSettings] = useState(defaultSettings);
  const [saveStatus, setSaveStatus] = useState("");

  // ==========================================
  // INITIALIZATION
  // ==========================================
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        await fetchMasterData();
        loadEngineSettings();
      } else {
        router.push('/dashboard');
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
    } finally {
      setIsLoading(false);
    }
  };

  const loadEngineSettings = () => {
    const saved = localStorage.getItem("OkiConstruct_settings");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSettings({
          ratios: { ...defaultSettings.ratios, ...(parsed.ratios || {}) },
          tmtSpecs: { ...defaultSettings.tmtSpecs, ...(parsed.tmtSpecs || {}) },
          dimensions: { ...defaultSettings.dimensions, ...(parsed.dimensions || {}) },
          percentages: { ...defaultSettings.percentages, ...(parsed.percentages || {}) },
          consumption: { ...defaultSettings.consumption, ...(parsed.consumption || {}) }
        });
      } catch (e) {
        console.error("Failed to parse settings", e);
      }
    }
  };

  // ==========================================
  // ENGINE ACTION HANDLERS
  // ==========================================
  const handleSaveEngine = () => {
    localStorage.setItem("OkiConstruct_settings", JSON.stringify(settings));
    setSaveStatus("Settings Saved Successfully!");
    setTimeout(() => setSaveStatus(""), 3000);
  };

  const handleResetEngine = () => {
    if(confirm("Are you sure you want to reset all formulas to factory defaults?")) {
      setSettings(defaultSettings);
      localStorage.removeItem("OkiConstruct_settings");
      setSaveStatus("Reset to Defaults Successfully!");
      setTimeout(() => setSaveStatus(""), 3000);
    }
  };

  const updateRatio = (key: string, field: 'c' | 's' | 'g', val: string) => setSettings(prev => ({ ...prev, ratios: { ...prev.ratios, [key]: { ...prev.ratios[key as keyof typeof defaultSettings.ratios], [field]: Number(val) } } }));
  const updateTmt = (key: string, field: 'length' | 'weight', val: string) => setSettings(prev => ({ ...prev, tmtSpecs: { ...prev.tmtSpecs, [key]: { ...prev.tmtSpecs[key as keyof typeof defaultSettings.tmtSpecs], [field]: Number(val) } } }));
  const updateDimension = (key: string, val: string) => setSettings(prev => ({ ...prev, dimensions: { ...prev.dimensions, [key]: Number(val) } }));
  const updatePercentage = (key: string, val: string) => setSettings(prev => ({ ...prev, percentages: { ...prev.percentages, [key]: Number(val) } }));
  const updateConsumption = (key: string, val: string) => setSettings(prev => ({ ...prev, consumption: { ...prev.consumption, [key]: Number(val) } }));

  if (isLoading) return <div className="min-h-screen flex items-center justify-center font-black text-2xl uppercase tracking-widest text-black">Initializing Master Portal...</div>;

  // --- ANALYTICS DERIVATIVES ---
  const premiumUsers = users.filter(u => u.tier === 'premium');
  const standardUsers = users.filter(u => u.tier !== 'premium');
  const totalBOQs = projects.filter(p => !p.isManualTracker).length;
  const totalLedgers = projects.filter(p => p.isManualTracker).length;
  const estimatedRevenue = premiumUsers.length * PREMIUM_PRICE_INR;
  const filteredUsers = users.filter(u => filter === 'ALL' ? true : filter === 'PREMIUM' ? u.tier === 'premium' : u.tier !== 'premium');

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col pb-20">
      <main className="max-w-[1400px] mx-auto p-4 md:p-6 mt-10 w-full flex-grow">
        
        {/* TAB CONTROLS & HEADER */}
        <div className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-end border-b-8 border-black pb-6 gap-6">
          <div>
            <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter text-black">
               System Admin
            </h1>
            <p className="font-bold text-gray-500 uppercase tracking-widest text-sm mt-2">Master Override & Analytics Dashboard</p>
          </div>
          <div className="flex gap-4 w-full md:w-auto">
             <button onClick={() => setActiveTab('ANALYTICS')} className={`flex-1 md:flex-none border-[4px] border-black px-8 py-4 font-black uppercase transition-all ${activeTab === 'ANALYTICS' ? 'bg-black text-[#22c55e] shadow-[4px_4px_0px_0px_rgba(34,197,94,1)] translate-y-1' : 'bg-white text-black hover:bg-gray-200 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]'}`}>
               Analytics
             </button>
             <button onClick={() => setActiveTab('ENGINE')} className={`flex-1 md:flex-none border-[4px] border-black px-8 py-4 font-black uppercase transition-all ${activeTab === 'ENGINE' ? 'bg-black text-[#22c55e] shadow-[4px_4px_0px_0px_rgba(34,197,94,1)] translate-y-1' : 'bg-white text-black hover:bg-gray-200 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]'}`}>
               Master Engine
             </button>
          </div>
        </div>

        {/* ========================================================= */}
        {/* TAB 1: SYSTEM ANALYTICS */}
        {/* ========================================================= */}
        {activeTab === 'ANALYTICS' && (
          <div className="animate-in fade-in duration-300">
            {/* TOP METRICS MATRIX */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
              <div className="bg-black text-white border-[6px] border-black p-6 shadow-[8px_8px_0px_0px_rgba(34,197,94,1)]">
                <h3 className="font-bold text-gray-400 uppercase tracking-widest text-xs mb-2">Total Operators</h3>
                <p className="text-5xl font-black text-[#22c55e]">{users.length}</p>
                <p className="text-xs font-bold mt-2 uppercase tracking-widest">{premiumUsers.length} Pro / {standardUsers.length} Free</p>
              </div>
              <div className="bg-white border-[6px] border-black p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                <h3 className="font-bold text-gray-500 uppercase tracking-widest text-xs mb-2">Total BOQs Generated</h3>
                <p className="text-5xl font-black text-black">{totalBOQs}</p>
                <p className="text-xs font-bold mt-2 uppercase tracking-widest text-gray-400">System Wide</p>
              </div>
              <div className="bg-white border-[6px] border-black p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                <h3 className="font-bold text-gray-500 uppercase tracking-widest text-xs mb-2">Active Expense Ledgers</h3>
                <p className="text-5xl font-black text-black">{totalLedgers}</p>
                <p className="text-xs font-bold mt-2 uppercase tracking-widest text-gray-400">System Wide</p>
              </div>
              <div className="bg-[#22c55e] border-[6px] border-black p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                <h3 className="font-bold text-black uppercase tracking-widest text-xs mb-2">Est. Gross Revenue</h3>
                <p className="text-4xl md:text-5xl font-black text-black">₹{(estimatedRevenue).toLocaleString()}</p>
                <p className="text-xs font-bold mt-2 uppercase tracking-widest text-black">Based on Active Pro Tiers</p>
              </div>
            </div>

            {/* USER DATABASE VIEWER */}
            <div className="bg-white border-[6px] border-black shadow-[10px_10px_0px_0px_rgba(0,0,0,1)]">
              <div className="p-6 border-b-4 border-black bg-gray-50 flex flex-col md:flex-row justify-between items-center gap-4">
                <h2 className="font-black text-2xl uppercase tracking-widest">Operator Database</h2>
                <div className="flex gap-2 w-full md:w-auto">
                  {['ALL', 'PREMIUM', 'STANDARD'].map((t) => (
                    <button key={t} onClick={() => setFilter(t as any)} className={`flex-1 md:flex-none px-6 py-3 font-black uppercase text-sm border-[4px] border-black transition-colors ${filter === t ? 'bg-black text-[#22c55e]' : 'bg-white text-black hover:bg-gray-200'}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[800px]">
                  <thead>
                    <tr className="bg-black text-white">
                      <th className="p-4 font-black uppercase tracking-widest text-xs border-r-[4px] border-black">User ID / Email</th>
                      <th className="p-4 font-black uppercase tracking-widest text-xs border-r-[4px] border-black text-center">Tier</th>
                      <th className="p-4 font-black uppercase tracking-widest text-xs border-r-[4px] border-black text-center">BOQs</th>
                      <th className="p-4 font-black uppercase tracking-widest text-xs border-r-[4px] border-black text-center">Ledgers</th>
                      <th className="p-4 font-black uppercase tracking-widest text-xs text-right">Join Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u, i) => (
                      <tr key={u.id} className={`border-b-[4px] border-black hover:bg-[#22c55e]/10 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                        <td className="p-4 border-r-[4px] border-black">
                          <p className="font-black text-lg uppercase text-black">{u.name || 'Unknown Builder'}</p>
                          <p className="font-bold text-gray-500 text-xs tracking-widest">{u.email}</p>
                          <p className="font-bold text-gray-400 text-[10px] tracking-widest mt-1">ID: {u.id}</p>
                        </td>
                        <td className="p-4 border-r-[4px] border-black text-center">
                          <span className={`inline-block px-3 py-1 font-black text-xs uppercase tracking-widest border-[3px] border-black ${u.tier === 'premium' ? 'bg-[#22c55e] text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]' : 'bg-gray-200 text-gray-600'}`}>
                            {u.tier === 'premium' ? 'PRO' : 'FREE'}
                          </span>
                        </td>
                        <td className="p-4 border-r-[4px] border-black text-center font-black text-2xl">{u.totalBOQs}</td>
                        <td className="p-4 border-r-[4px] border-black text-center font-black text-2xl">{u.totalLedgers}</td>
                        <td className="p-4 text-right font-bold text-gray-600 text-sm tracking-widest uppercase">
                          {u.createdAt ? new Date(u.createdAt.seconds * 1000).toLocaleDateString() : 'Legacy'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: MASTER ENGINE CONFIG */}
        {/* ========================================================= */}
        {activeTab === 'ENGINE' && (
          <div className="bg-white border-[6px] border-black p-6 md:p-10 shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] text-black animate-in fade-in duration-300">
            
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 border-b-8 border-black pb-6">
              <div>
                <h2 className="text-3xl font-black text-black uppercase">Engine Configuration</h2>
                <p className="font-bold text-gray-500 mt-2 uppercase tracking-widest text-sm">Update specific BOQ variables</p>
              </div>
              <div className="flex gap-4 mt-6 md:mt-0 w-full md:w-auto">
                 <button onClick={handleResetEngine} className="flex-1 md:flex-none border-[4px] border-black px-6 py-3 font-black uppercase hover:bg-gray-100 transition-all text-sm md:text-base">Reset Defaults</button>
                 <button onClick={handleSaveEngine} className="flex-1 md:flex-none bg-[#22c55e] border-[4px] border-black px-6 py-3 font-black text-black uppercase shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-y-1 hover:shadow-none transition-all text-sm md:text-base">Save Settings</button>
              </div>
            </div>

            {saveStatus && (
              <div className="bg-black text-[#22c55e] p-4 mb-8 border-[4px] border-black font-black uppercase text-center animate-pulse text-xl">
                {saveStatus}
              </div>
            )}

            <div className="space-y-12">
              
              <section className="bg-gray-50 border-[4px] border-black p-6 md:p-8 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
                <h2 className="text-2xl font-black uppercase italic mb-6 text-[#22c55e] border-b-4 border-black pb-2 inline-block">1. Master Percentages & Buffers</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {Object.keys(settings.percentages).map(key => (
                    <div key={key} className="flex flex-col gap-2">
                      <label className="font-black uppercase text-lg">{formatLabel(key)} (%)</label>
                      <input type="number" value={(settings.percentages as any)[key]} onChange={(e) => updatePercentage(key, e.target.value)} className="border-[4px] border-black p-4 font-black text-2xl w-full focus:bg-white transition-colors outline-none" />
                    </div>
                  ))}
                </div>
              </section>

              <section className="bg-white border-[4px] border-black p-6 md:p-8 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
                <div>
                  <h2 className="text-2xl font-black uppercase italic text-[#22c55e] border-b-4 border-black pb-2 inline-block mb-2">2. Concrete & Mortar Ratios</h2>
                  <p className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-6">Define the parts of cement, sand, and gravel for each mixture.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {Object.keys(settings.ratios).map(key => {
                    const ratio = (settings.ratios as any)[key];
                    const displayTitle = customLabels[key] || formatLabel(key);
                    return (
                      <div key={key} className={`border-[4px] border-black p-4 ${key === 'mortar' || key === 'tileBedding' ? 'bg-[#22c55e]/10' : 'bg-gray-50'}`}>
                        <h3 className="font-black uppercase text-lg mb-4 tracking-widest min-h-[50px]">{displayTitle}</h3>
                        <div className="flex gap-2">
                          <div className="flex flex-col flex-1"><span className="text-[10px] font-black uppercase text-gray-500 mb-1">Cement</span><input type="number" value={ratio.c} onChange={(e) => updateRatio(key, 'c', e.target.value)} className="border-2 border-black p-2 font-black text-lg text-center" /></div>
                          <div className="flex flex-col flex-1"><span className="text-[10px] font-black uppercase text-gray-500 mb-1">Sand</span><input type="number" value={ratio.s} onChange={(e) => updateRatio(key, 's', e.target.value)} className="border-2 border-black p-2 font-black text-lg text-center" /></div>
                          <div className="flex flex-col flex-1"><span className="text-[10px] font-black uppercase text-gray-500 mb-1">Gravel</span><input type="number" value={ratio.g} onChange={(e) => updateRatio(key, 'g', e.target.value)} disabled={key === 'mortar' || key === 'tileBedding'} className="border-2 border-black p-2 font-black text-lg text-center disabled:bg-gray-300 focus:bg-white" /></div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>

              <section className="bg-gray-50 border-[4px] border-black p-6 md:p-8 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
                <h2 className="text-2xl font-black uppercase italic mb-6 text-[#22c55e] border-b-4 border-black pb-2 inline-block">3. Standard TMT Specifications</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[600px]">
                    <thead>
                      <tr className="bg-black text-white">
                        <th className="p-4 font-black uppercase text-lg border-r-[4px] border-black">Bar Size</th>
                        <th className="p-4 font-black uppercase text-lg border-r-[4px] border-black text-center">Length (Ft)</th>
                        <th className="p-4 font-black uppercase text-lg text-center">Weight (Kg)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.keys(settings.tmtSpecs).map((key) => {
                        const spec = (settings.tmtSpecs as any)[key];
                        return (
                          <tr key={key} className="border-b-[4px] border-black bg-white">
                            <td className="p-4 font-black text-xl uppercase border-r-[4px] border-black">{key}</td>
                            <td className="p-4 border-r-[4px] border-black"><input type="number" value={spec.length} onChange={(e) => updateTmt(key, 'length', e.target.value)} className="w-full border-2 border-black p-3 font-black text-center text-lg outline-none" /></td>
                            <td className="p-4"><input type="number" step="0.01" value={spec.weight} onChange={(e) => updateTmt(key, 'weight', e.target.value)} className="w-full border-2 border-black p-3 font-black text-center text-lg outline-none" /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="bg-white border-[4px] border-black p-6 md:p-8 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
                <h2 className="text-2xl font-black uppercase italic mb-6 text-[#22c55e] border-b-4 border-black pb-2 inline-block">4. Structural Dimensions (Inches)</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {Object.keys(settings.dimensions).map(key => (
                    <div key={key} className="flex flex-col gap-2">
                      <label className="font-black uppercase text-sm text-gray-500 h-10">{formatLabel(key)}</label>
                      <input type="number" value={(settings.dimensions as any)[key]} onChange={(e) => updateDimension(key, e.target.value)} className="border-[4px] border-black p-4 font-black text-2xl w-full focus:bg-gray-50 transition-colors outline-none" />
                    </div>
                  ))}
                </div>
              </section>

              <section className="bg-gray-50 border-[4px] border-black p-6 md:p-8 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
                <div>
                   <h2 className="text-2xl font-black uppercase italic text-[#22c55e] border-b-4 border-black pb-2 inline-block mb-2">5. Consumption Metrics</h2>
                   <p className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-6">Set the required volume (CFT) per Sq.Ft.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {Object.keys(settings.consumption).map(key => {
                    const displayTitle = customLabels[key] || formatLabel(key);
                    return (
                      <div key={key} className="flex flex-col gap-2 p-4 border-[4px] border-black bg-white">
                        <label className="font-black uppercase text-base min-h-[50px]">{displayTitle}</label>
                        <input type="number" step="0.01" value={(settings.consumption as any)[key]} onChange={(e) => updateConsumption(key, e.target.value)} className="border-[4px] border-black p-4 font-black text-2xl w-full focus:bg-gray-50 transition-colors outline-none text-[#22c55e]" />
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