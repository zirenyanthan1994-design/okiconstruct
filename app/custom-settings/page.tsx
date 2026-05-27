"use client";
import { useState, useEffect } from 'react';
import { auth, db } from '../lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import Navbar from '../components/Navbar';

// Master Constants matching the new processBOQ.ts engine
const defaultSettings = {
  ratios: {
    pcc: { c: 1, s: 3, g: 6 }, slab: { c: 1, s: 2, g: 4 }, footing: { c: 1, s: 2, g: 4 }, 
    plinthBeam: { c: 1, s: 3, g: 4 }, beam: { c: 1, s: 3, g: 4 }, column: { c: 1, s: 3, g: 4 }, 
    mortar: { c: 1, s: 4, g: 0 }, tileBedding: { c: 1, s: 4, g: 0 }
  },
  tmtSpecs: {
    '8mm': { length: 38, weight: 4.74 }, '10mm': { length: 38, weight: 7.40 }, 
    '12mm': { length: 38, weight: 10.66 }, '16mm': { length: 38, weight: 18.96 }, 
    '20mm': { length: 38, weight: 29.60 }, '25mm': { length: 38, weight: 46.20 }
  },
  dimensions: { slabThickness: 5, meshGap: 4, ringSpacing: 5 },
  percentages: { 
    wastage: { cement: 10, sand: 10, gravel: 10, tmt: 10, bricks: 10, tiles: 10 },
    concreteAllowances: { footing: 5, column: 5, plinthBeam: 5, roofBeam: 5, slab: 25 },
    shuttering: 5, electrical: 12, plumbing: 8, misc: 5, logistics: 10, contingency: 5 
  },
  consumption: { 
    puttyCoverage: 10, interiorPaintCoverage: 50, exteriorPaintCoverage: 50, 
    bricksPerSqft: 5, plasterCftPerSqft: 0.10, brickJoiningCftPerSqft: 0.10, tileBeddingCftPerSqft: 0.20 
  }
};

export default function CustomSettings() {
  const router = useRouter();
  
  // --- STATE ---
  const [user, setUser] = useState<any>(null);
  const [userData, setUserData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [settings, setSettings] = useState(defaultSettings);

  // --- INITIALIZATION ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        
        const docRef = doc(db, "users", currentUser.uid);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data();
          setUserData(data);
          
          if (data.tier !== "premium") {
            router.push('/dashboard');
            return;
          }

          // 100% ACCOUNT ISOLATION: Load their custom formulas securely from Firebase
          if (data.customFormulas) {
            setSettings(prev => ({
              ...prev,
              ratios: { ...prev.ratios, ...(data.customFormulas.ratios || {}) },
              tmtSpecs: { ...prev.tmtSpecs, ...(data.customFormulas.tmtSpecs || {}) },
              dimensions: { ...prev.dimensions, ...(data.customFormulas.dimensions || {}) },
              consumption: { ...prev.consumption, ...(data.customFormulas.consumption || {}) },
              percentages: { 
                ...prev.percentages, 
                ...(data.customFormulas.percentages || {}),
                wastage: { ...prev.percentages.wastage, ...(data.customFormulas.percentages?.wastage || {}) },
                concreteAllowances: { ...prev.percentages.concreteAllowances, ...(data.customFormulas.percentages?.concreteAllowances || {}) }
              }
            }));
            
            // Sync to local storage strictly locked to their UID
            localStorage.setItem(`OkiConstruct_settings_${currentUser.uid}`, JSON.stringify(data.customFormulas));
          }
        }
      } else {
        router.push('/dashboard');
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [router]);

  // --- ACTION HANDLERS ---
  const handleSaveFormulas = async (e: any) => {
    e.preventDefault();
    if (!user) return;
    setIsSaving(true);

    try {
      // 1. Save strictly to the User's Firebase Document
      await updateDoc(doc(db, "users", user.uid), {
        customFormulas: settings
      });
      
      // 2. Save strictly to their UID-locked browser cache
      localStorage.setItem(`OkiConstruct_settings_${user.uid}`, JSON.stringify(settings));
      
      alert("Master Formulas Synchronized! Your BOQ Estimates will now use your custom engineering variables.");
      window.scrollTo(0, 0);
    } catch (error) {
      console.error("Error saving formulas:", error);
      alert("Failed to save custom formulas.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetDefaults = () => {
    if(confirm("Are you sure you want to revert all engineering variables back to OkiConstruct Global Defaults?")) {
      setSettings(defaultSettings);
      if (user) {
         localStorage.removeItem(`OkiConstruct_settings_${user.uid}`);
      }
    }
  };

  const updateSetting = (category: string, subCategory: string | null, field: string, value: string) => {
    setSettings((prev: any) => {
      const d = JSON.parse(JSON.stringify(prev));
      if (subCategory) {
        d[category][subCategory][field] = Number(value);
      } else {
        d[category][field] = Number(value);
      }
      return d;
    });
  };

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-[#22c55e] font-bold text-xl flex items-center gap-3">
        <svg className="animate-spin h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
        Loading Master Engine...
      </div>
    </div>
  );

  const inputStyle = "w-full border border-gray-200 bg-gray-50 rounded-xl p-3 text-gray-900 font-bold focus:bg-white focus:ring-2 focus:ring-[#22c55e]/30 focus:border-[#22c55e] transition-all outline-none";
  const labelStyle = "text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block";
  const sectionTitleStyle = "text-xl md:text-2xl font-black text-gray-900 mb-6 border-b border-gray-100 pb-4 flex items-center gap-3";
  const cardStyle = "bg-white border border-gray-100 rounded-3xl p-6 md:p-8 shadow-sm mb-8";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans pb-20">
      <Navbar />
      
      <main className="max-w-5xl mx-auto w-full p-4 md:p-8 mt-4">
        
        {/* HEADER SECTION */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-black text-gray-900 flex items-center gap-3">
              ⚙️ Pro Engine Settings
            </h1>
            <div className="flex items-center gap-3 mt-2">
              <span className="font-bold text-xs bg-gray-900 text-[#22c55e] px-3 py-1 rounded-md tracking-widest uppercase">Premium Override</span>
              <p className="text-gray-500 font-medium text-sm">Master Configuration for the BOQ Algorithm</p>
            </div>
          </div>
          
          <div className="flex gap-3 w-full md:w-auto sticky top-24 z-40 bg-gray-50/90 backdrop-blur-sm py-2">
            <button type="button" onClick={handleResetDefaults} className="flex-1 md:flex-none px-6 py-3 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-100 transition-colors shadow-sm text-sm">
              Reset Defaults
            </button>
            <button onClick={handleSaveFormulas} disabled={isSaving} className="flex-1 md:flex-none px-8 py-3 bg-[#22c55e] text-white font-bold rounded-xl hover:bg-[#1ea950] transition-colors shadow-md text-sm flex items-center justify-center gap-2">
              {isSaving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </div>

        {/* 1. MASTER PERCENTAGES & BUFFERS */}
        <div className={cardStyle}>
          <h2 className={sectionTitleStyle}><span className="text-[#22c55e]">1.</span> Percentages & Allowances</h2>
          
          <div className="mb-8">
            <h3 className="font-bold text-gray-700 mb-4 bg-gray-50 p-3 rounded-xl border border-gray-100">Material Wastage (%)</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {Object.keys(settings.percentages.wastage).map(mat => (
                <div key={mat}>
                  <label className={labelStyle}>{mat}</label>
                  <div className="relative">
                    <input type="number" className={inputStyle} value={settings.percentages.wastage[mat as keyof typeof settings.percentages.wastage]} onChange={(e) => updateSetting('percentages', 'wastage', mat, e.target.value)} />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mb-8">
            <h3 className="font-bold text-gray-700 mb-4 bg-gray-50 p-3 rounded-xl border border-gray-100">Concrete Buffer/Spill Allowance (%)</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {Object.keys(settings.percentages.concreteAllowances).map(elem => (
                <div key={elem}>
                  <label className={labelStyle}>{elem.replace('Beam', ' Beam')}</label>
                  <div className="relative">
                    <input type="number" className={inputStyle} value={settings.percentages.concreteAllowances[elem as keyof typeof settings.percentages.concreteAllowances]} onChange={(e) => updateSetting('percentages', 'concreteAllowances', elem, e.target.value)} />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-bold text-gray-700 mb-4 bg-gray-50 p-3 rounded-xl border border-gray-100">Service Add-ons (% of Material Cost)</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {['electrical', 'plumbing', 'shuttering', 'logistics', 'contingency', 'misc'].map(serv => (
                <div key={serv}>
                  <label className={labelStyle}>{serv}</label>
                  <div className="relative">
                    <input type="number" className={inputStyle} value={(settings.percentages as any)[serv]} onChange={(e) => updateSetting('percentages', null, serv, e.target.value)} />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 2. CONCRETE & MORTAR RATIOS */}
        <div className={cardStyle}>
          <h2 className={sectionTitleStyle}><span className="text-[#22c55e]">2.</span> Mix Ratios (Cement : Sand : Gravel)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {Object.keys(settings.ratios).map(mix => (
              <div key={mix} className="border border-gray-100 p-4 rounded-2xl bg-gray-50/50 hover:bg-white transition-colors">
                <label className="font-bold text-gray-800 capitalize mb-3 block">{mix.replace(/([A-Z])/g, ' $1').trim()}</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1"><span className="text-[10px] font-bold text-gray-400 block mb-1">CEMENT</span><input type="number" className={inputStyle} value={(settings.ratios as any)[mix].c} onChange={(e) => updateSetting('ratios', mix, 'c', e.target.value)} /></div>
                  <span className="font-black text-gray-300 mt-4">:</span>
                  <div className="flex-1"><span className="text-[10px] font-bold text-gray-400 block mb-1">SAND</span><input type="number" className={inputStyle} value={(settings.ratios as any)[mix].s} onChange={(e) => updateSetting('ratios', mix, 's', e.target.value)} /></div>
                  <span className="font-black text-gray-300 mt-4">:</span>
                  <div className="flex-1"><span className="text-[10px] font-bold text-gray-400 block mb-1">GRAVEL</span><input type="number" className={inputStyle} value={(settings.ratios as any)[mix].g} onChange={(e) => updateSetting('ratios', mix, 'g', e.target.value)} /></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 3. CONSUMPTION METRICS */}
        <div className={cardStyle}>
          <h2 className={sectionTitleStyle}><span className="text-[#22c55e]">3.</span> Consumption Metrics</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="border border-gray-100 p-5 rounded-2xl">
              <label className={labelStyle}>Putty Coverage (SqFt/KG)</label>
              <input type="number" className={inputStyle} value={settings.consumption.puttyCoverage} onChange={(e) => updateSetting('consumption', null, 'puttyCoverage', e.target.value)} />
            </div>
            <div className="border border-gray-100 p-5 rounded-2xl">
              <label className={labelStyle}>Int. Paint Coverage (SqFt/L)</label>
              <input type="number" className={inputStyle} value={settings.consumption.interiorPaintCoverage} onChange={(e) => updateSetting('consumption', null, 'interiorPaintCoverage', e.target.value)} />
            </div>
            <div className="border border-gray-100 p-5 rounded-2xl">
              <label className={labelStyle}>Ext. Paint Coverage (SqFt/L)</label>
              <input type="number" className={inputStyle} value={settings.consumption.exteriorPaintCoverage} onChange={(e) => updateSetting('consumption', null, 'exteriorPaintCoverage', e.target.value)} />
            </div>
            <div className="border border-gray-100 p-5 rounded-2xl">
              <label className={labelStyle}>Bricks per SqFt (Wall)</label>
              <input type="number" className={inputStyle} value={settings.consumption.bricksPerSqft} onChange={(e) => updateSetting('consumption', null, 'bricksPerSqft', e.target.value)} />
            </div>
            <div className="border border-gray-100 p-5 rounded-2xl">
              <label className={labelStyle}>Plaster Vol. (CFT per SqFt)</label>
              <input type="number" step="0.01" className={inputStyle} value={settings.consumption.plasterCftPerSqft} onChange={(e) => updateSetting('consumption', null, 'plasterCftPerSqft', e.target.value)} />
            </div>
            <div className="border border-gray-100 p-5 rounded-2xl">
              <label className={labelStyle}>Tile Bedding (CFT per SqFt)</label>
              <input type="number" step="0.01" className={inputStyle} value={settings.consumption.tileBeddingCftPerSqft} onChange={(e) => updateSetting('consumption', null, 'tileBeddingCftPerSqft', e.target.value)} />
            </div>
          </div>
        </div>

        {/* 4. STRUCTURAL DIMENSIONS & TMT SPECS */}
        <div className={cardStyle}>
          <h2 className={sectionTitleStyle}><span className="text-[#22c55e]">4.</span> Structural Engineering Base</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-blue-50/50 border border-blue-100 p-5 rounded-2xl">
              <label className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-2 block">Default Slab Thick (Inches)</label>
              <input type="number" className={inputStyle} value={settings.dimensions.slabThickness} onChange={(e) => updateSetting('dimensions', null, 'slabThickness', e.target.value)} />
            </div>
            <div className="bg-blue-50/50 border border-blue-100 p-5 rounded-2xl">
              <label className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-2 block">Slab Mesh Gap (Inches)</label>
              <input type="number" className={inputStyle} value={settings.dimensions.meshGap} onChange={(e) => updateSetting('dimensions', null, 'meshGap', e.target.value)} />
            </div>
            <div className="bg-blue-50/50 border border-blue-100 p-5 rounded-2xl">
              <label className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-2 block">Ring Spacing (Inches c/c)</label>
              <input type="number" className={inputStyle} value={settings.dimensions.ringSpacing} onChange={(e) => updateSetting('dimensions', null, 'ringSpacing', e.target.value)} />
            </div>
          </div>

          <h3 className="font-bold text-gray-700 mb-4 bg-gray-50 p-3 rounded-xl border border-gray-100">Standard TMT Bar Weights (Per Length)</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {Object.keys(settings.tmtSpecs).map(size => (
              <div key={size} className="border border-gray-100 p-4 rounded-xl">
                <label className="font-bold text-gray-900 block mb-2">{size}</label>
                <div className="space-y-2">
                  <div>
                     <span className="text-[9px] font-bold text-gray-400 block mb-1 uppercase">Length (Ft)</span>
                     <input type="number" className="w-full border-b border-gray-200 bg-transparent py-1 text-sm font-semibold outline-none focus:border-[#22c55e]" value={(settings.tmtSpecs as any)[size].length} onChange={(e) => updateSetting('tmtSpecs', size, 'length', e.target.value)} />
                  </div>
                  <div>
                     <span className="text-[9px] font-bold text-gray-400 block mb-1 uppercase">Weight (KG)</span>
                     <input type="number" step="0.01" className="w-full border-b border-gray-200 bg-transparent py-1 text-sm font-semibold outline-none focus:border-[#22c55e]" value={(settings.tmtSpecs as any)[size].weight} onChange={(e) => updateSetting('tmtSpecs', size, 'weight', e.target.value)} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* BOTTOM SAVE BUTTON */}
        <button type="button" onClick={handleSaveFormulas} disabled={isSaving} className="w-full p-5 bg-gray-900 text-white font-bold rounded-2xl hover:bg-[#22c55e] transition-colors shadow-md text-xl">
          {isSaving ? "Synchronizing Engine..." : "Save Master Settings ➔"}
        </button>

      </main>
    </div>
  );
}