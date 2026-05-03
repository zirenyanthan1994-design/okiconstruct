"use client";
import { useState, useEffect } from 'react';
import { auth, db } from '../lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

// Default Engineering Constants (Matches your Admin Panel screenshots exactly)
const DEFAULT_FORMULAS = {
  percentages: { wastage: 7, slabExtra: 30 },
  ratios: {
    pcc: { c: 1, s: 3, g: 6 },
    roofSlab: { c: 1, s: 2, g: 4 },
    footing: { c: 1, s: 2, g: 4 },
    plinthBeam: { c: 1, s: 2, g: 4 },
    roofBeam: { c: 1, s: 1.5, g: 3 },
    column: { c: 1, s: 1.5, g: 3 },
    wallPlaster: { c: 1, s: 4, g: 0 },
    floorTile: { c: 1, s: 4, g: 0 }
  },
  tmt: {
    d8: { length: 40, weight: 4.74 },
    d10: { length: 40, weight: 7.4 },
    d12: { length: 40, weight: 10.66 },
    d16: { length: 40, weight: 18.96 },
    d20: { length: 40, weight: 29.6 },
    d25: { length: 40, weight: 46.2 }
  },
  dimensions: {
    slabThickness: 5, meshGap: 4, slabOverhang: 3, ringSpacing: 5
  },
  consumption: {
    puttyCoverage: 10, bricksPerSqFt: 5, plasterVolume: 0.08, mortarVolume: 0.05, tileBeddingVolume: 0.08
  }
};

export default function CustomSettings() {
  const router = useRouter();
  
  // --- STATE ---
  const [user, setUser] = useState<any>(null);
  const [userData, setUserData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // The Massive Formula State
  const [formulas, setFormulas] = useState(DEFAULT_FORMULAS);

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

          // Load their custom formulas if they exist, otherwise fallback to defaults
          if (data.customFormulas) {
            // Deep merge to ensure no missing keys crash the UI
            setFormulas(prev => ({
              ...prev,
              ...data.customFormulas,
              ratios: { ...prev.ratios, ...(data.customFormulas.ratios || {}) },
              tmt: { ...prev.tmt, ...(data.customFormulas.tmt || {}) },
              dimensions: { ...prev.dimensions, ...(data.customFormulas.dimensions || {}) },
              consumption: { ...prev.consumption, ...(data.customFormulas.consumption || {}) },
              percentages: { ...prev.percentages, ...(data.customFormulas.percentages || {}) }
            }));
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
      await updateDoc(doc(db, "users", user.uid), {
        customFormulas: formulas
      });
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
      setFormulas(DEFAULT_FORMULAS);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    router.push('/dashboard');
  };

  const handleNestedChange = (category: string, item: string, subItem: string | null, value: string) => {
    setFormulas(prev => {
      const updated = { ...prev };
      if (subItem) {
        // @ts-ignore
        updated[category][item][subItem] = Number(value);
      } else {
        // @ts-ignore
        updated[category][item] = Number(value);
      }
      return updated;
    });
  };

  if (isLoading) return <div className="min-h-screen flex items-center justify-center font-black text-2xl uppercase">Loading Master Engine...</div>;
  const isPremium = userData?.tier === "premium";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col pb-20">
      
      {/* 1. MASTER HEADER */}
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

      <main className="max-w-[1400px] mx-auto p-4 md:p-6 mt-6 w-full flex-grow">
        
        <form onSubmit={handleSaveFormulas} className="bg-white border-[6px] border-black p-4 md:p-8 shadow-[12px_12px_0px_0px_rgba(0,0,0,1)]">
          
          {/* HEADER ROW */}
          <div className="border-b-[6px] border-black pb-4 mb-8">
            <h1 className="text-3xl md:text-5xl font-black uppercase">Admin Control Panel</h1>
            <p className="font-bold text-gray-500 uppercase tracking-widest mt-1 text-sm md:text-base">Master Formula Engine <span className="text-[#22c55e] bg-black px-2 py-1 ml-2 text-xs">PREMIUM OVERRIDE</span></p>
          </div>

          <div className="flex flex-col md:flex-row border-[4px] border-black mb-8 font-black uppercase text-sm">
            <button type="button" onClick={handleResetDefaults} className="flex-1 p-3 text-center hover:bg-gray-200 transition-colors border-b-4 md:border-b-0 md:border-r-4 border-black">Reset Defaults</button>
            <button type="submit" disabled={isSaving} className={`flex-1 p-3 text-center transition-colors ${isSaving ? 'bg-gray-400' : 'bg-[#22c55e] hover:bg-black hover:text-[#22c55e]'}`}>
              {isSaving ? "Saving..." : "Save Settings"}
            </button>
          </div>

          {/* SECTION 1 */}
          <section className="mb-12">
            <h2 className="text-xl md:text-2xl font-black italic uppercase text-[#22c55e] underline underline-offset-4 mb-4">1. Master Percentages & Buffers</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-black uppercase tracking-widest block mb-1">Material Wastage (%)</label>
                <input type="number" step="any" className="w-full border-[3px] border-black p-2 font-black" value={formulas.percentages.wastage} onChange={(e) => handleNestedChange('percentages', 'wastage', null, e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-black uppercase tracking-widest block mb-1">Slab Extra Concrete (%)</label>
                <input type="number" step="any" className="w-full border-[3px] border-black p-2 font-black" value={formulas.percentages.slabExtra} onChange={(e) => handleNestedChange('percentages', 'slabExtra', null, e.target.value)} />
              </div>
            </div>
          </section>

          {/* SECTION 2 */}
          <section className="mb-12 border-t-[6px] border-black pt-8">
            <h2 className="text-xl md:text-2xl font-black italic uppercase text-[#22c55e] underline underline-offset-4 mb-2">2. Concrete & Mortar Ratios (The "Recipe")</h2>
            <p className="font-bold text-xs uppercase mb-6">Define the parts of Cement, Sand, and Gravel for each mixture.</p>
            
            <div className="space-y-6">
              {[
                { id: 'pcc', title: 'PCC (Foundation Bed)' },
                { id: 'roofSlab', title: 'Roof Slab Concrete' },
                { id: 'footing', title: 'Footing Concrete' },
                { id: 'plinthBeam', title: 'Plinth Beam Concrete' },
                { id: 'roofBeam', title: 'Roof Beam Concrete' },
                { id: 'column', title: 'Column Concrete' },
                { id: 'wallPlaster', title: 'Wall Plaster & Masonry Mortar (No Gravel)', bg: 'bg-green-50' },
                { id: 'floorTile', title: 'Floor Tile Bedding Mortar (No Gravel)', bg: 'bg-green-50' }
              ].map((mix) => (
                <div key={mix.id} className={`border-[3px] border-black ${mix.bg || 'bg-white'}`}>
                  <div className="border-b-[3px] border-black p-2"><h3 className="font-black uppercase text-sm">{mix.title}</h3></div>
                  <div className="grid grid-cols-3">
                    <div className="p-2 border-r-[3px] border-black">
                      <label className="text-[10px] font-black text-gray-500 block mb-1">Cement</label>
                      <input type="number" step="any" className="w-full border-b-[3px] border-black text-center font-black focus:outline-none bg-transparent" value={(formulas.ratios as any)[mix.id].c} onChange={(e) => handleNestedChange('ratios', mix.id, 'c', e.target.value)} />
                    </div>
                    <div className="p-2 border-r-[3px] border-black">
                      <label className="text-[10px] font-black text-gray-500 block mb-1">Sand</label>
                      <input type="number" step="any" className="w-full border-b-[3px] border-black text-center font-black focus:outline-none bg-transparent" value={(formulas.ratios as any)[mix.id].s} onChange={(e) => handleNestedChange('ratios', mix.id, 's', e.target.value)} />
                    </div>
                    <div className="p-2">
                      <label className="text-[10px] font-black text-gray-500 block mb-1">Gravel</label>
                      <input type="number" step="any" className="w-full border-b-[3px] border-black text-center font-black focus:outline-none bg-transparent" value={(formulas.ratios as any)[mix.id].g} onChange={(e) => handleNestedChange('ratios', mix.id, 'g', e.target.value)} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* SECTION 3 */}
          <section className="mb-12 border-t-[6px] border-black pt-8">
            <h2 className="text-xl md:text-2xl font-black italic uppercase text-[#22c55e] underline underline-offset-4 mb-6">3. Standard TMT Specifications</h2>
            <div className="border-[3px] border-black overflow-x-auto">
              <table className="w-full text-left font-black text-sm uppercase">
                <thead className="border-b-[3px] border-black">
                  <tr><th className="p-2 border-r-[3px] border-black">Bar Size</th><th className="p-2 border-r-[3px] border-black text-center">Length (FT)</th><th className="p-2 text-center">Weight (KG)</th></tr>
                </thead>
                <tbody>
                  {[ {id: 'd8', label: '8mm'}, {id: 'd10', label: '10mm'}, {id: 'd12', label: '12mm'}, {id: 'd16', label: '16mm'}, {id: 'd20', label: '20mm'}, {id: 'd25', label: '25mm'} ].map((tmt) => (
                    <tr key={tmt.id} className="border-b-[3px] border-black last:border-b-0">
                      <td className="p-2 border-r-[3px] border-black bg-gray-100">{tmt.label}</td>
                      <td className="border-r-[3px] border-black p-0"><input type="number" step="any" className="w-full p-2 text-center focus:bg-yellow-50 outline-none" value={(formulas.tmt as any)[tmt.id].length} onChange={(e) => handleNestedChange('tmt', tmt.id, 'length', e.target.value)} /></td>
                      <td className="p-0"><input type="number" step="any" className="w-full p-2 text-center focus:bg-yellow-50 outline-none" value={(formulas.tmt as any)[tmt.id].weight} onChange={(e) => handleNestedChange('tmt', tmt.id, 'weight', e.target.value)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* SECTION 4 */}
          <section className="mb-12 border-t-[6px] border-black pt-8">
            <h2 className="text-xl md:text-2xl font-black italic uppercase text-[#22c55e] underline underline-offset-4 mb-6">4. Structural Dimensions (Inches)</h2>
            <div className="space-y-4">
              {[
                { id: 'slabThickness', label: 'Slab Thickness' },
                { id: 'meshGap', label: 'Mesh Gap' },
                { id: 'slabOverhang', label: 'Slab Overhang' },
                { id: 'ringSpacing', label: 'Ring Spacing' }
              ].map((dim) => (
                <div key={dim.id}>
                  <label className="text-xs font-black uppercase tracking-widest block mb-1">{dim.label}</label>
                  <input type="number" step="any" className="w-full border-[3px] border-black p-2 font-black" value={(formulas.dimensions as any)[dim.id]} onChange={(e) => handleNestedChange('dimensions', dim.id, null, e.target.value)} />
                </div>
              ))}
            </div>
          </section>

          {/* SECTION 5 */}
          <section className="mb-8 border-t-[6px] border-black pt-8">
            <h2 className="text-xl md:text-2xl font-black italic uppercase text-[#22c55e] underline underline-offset-4 mb-2">5. Consumption Metrics (The "Volume")</h2>
            <p className="font-bold text-xs uppercase mb-6">Set the required volume (CFT) per SQ.FT to define layer thickness.</p>
            <div className="space-y-4">
              {[
                { id: 'puttyCoverage', label: 'Wall Putty Coverage (SQ.FT per KG)' },
                { id: 'bricksPerSqFt', label: 'Bricks (Pcs per SQ.FT of wall)' },
                { id: 'plasterVolume', label: 'Wall Plaster Volume (CFT per SQ.FT)' },
                { id: 'mortarVolume', label: 'Brick Joining Mortar Volume (CFT per SQ.FT)' },
                { id: 'tileBeddingVolume', label: 'Tile Bedding Volume (CFT per SQ.FT)' }
              ].map((metric) => (
                <div key={metric.id}>
                  <label className="text-xs font-black uppercase tracking-widest block mb-1">{metric.label}</label>
                  <input type="number" step="any" className="w-full border-[3px] border-black p-2 font-black" value={(formulas.consumption as any)[metric.id]} onChange={(e) => handleNestedChange('consumption', metric.id, null, e.target.value)} />
                </div>
              ))}
            </div>
          </section>

          {/* BOTTOM SAVE BUTTON */}
          <button type="submit" disabled={isSaving} className={`w-full p-6 font-black uppercase text-2xl border-[6px] border-black transition-all ${isSaving ? 'bg-gray-400 text-black' : 'bg-[#22c55e] text-black hover:bg-black hover:text-[#22c55e]'}`}>
            {isSaving ? "Synchronizing Engine..." : "Save Master Settings ➔"}
          </button>
        </form>

      </main>
    </div>
  );
}