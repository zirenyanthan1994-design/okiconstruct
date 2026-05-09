"use client";
import { useState, useEffect } from 'react';
import { auth, db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import Navbar from '../components/Navbar';
import BlueprintRenderer from '../components/BlueprintRenderer';

export default function Generate2DLayout() {
  const router = useRouter();
  const [userData, setUserData] = useState<any>(null);
  
  // UX Flow State
  const [currentStep, setCurrentStep] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [activeConcept, setActiveConcept] = useState<'A' | 'B' | 'C' | null>(null);

  // --- PHASE 1: SITE & REQUIREMENTS ---
  const [siteDetails, setSiteDetails] = useState({
    projectName: '',
    northSide: '',
    southSide: '',
    eastSide: '',
    westSide: '',
    roadFacing: 'East',
    stairType: 'Internal',
    bhkType: '2BHK' 
  });

  // --- PHASE 2: DIMENSIONS ---
  const [roomLayout, setRoomLayout] = useState({
    hall: { l: '', w: '' }, 
    kitchen: { l: '', w: '' }, 
    dining: { l: '', w: '' }, 
    stairsDim: { l: '', w: '' },
    bedrooms: [] as any[],
    bathrooms: [] as any[]
  });

  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        const docRef = doc(db, "users", currentUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) setUserData(docSnap.data());
      }
    });
    return () => unsubscribe();
  }, []);

  const handleGenerateConcepts = () => {
    const s = siteDetails;
    if (!s.projectName.trim()) return setErrorMsg("Please provide a Project Name.");
    if (!Number(s.northSide) || !Number(s.southSide) || !Number(s.eastSide) || !Number(s.westSide)) {
      return setErrorMsg("Please enter valid lengths for all 4 sides of the plot.");
    }
    
    // Auto-generate dimension form based on BHK selection
    const bhkCount = parseInt(s.bhkType.charAt(0)) || 1;
    let newBeds = [];
    let newBaths = [{ id: 'common', l: '', w: '', isAttached: false, attachedTo: '' }];
    
    for(let i=0; i<bhkCount; i++) {
      const bedName = `Bedroom ${i+1}`;
      newBeds.push({ id: `bed_${i}`, name: bedName, l: '', w: '' });
      if (i === 0) newBaths.push({ id: `bath_${i}`, l: '', w: '', isAttached: true, attachedTo: bedName });
    }

    setRoomLayout(prev => ({
      ...prev,
      bedrooms: newBeds,
      bathrooms: newBaths
    }));

    setErrorMsg("");
    setIsGenerating(true);
    
    setLoadingMessage("Analyzing plot boundaries and setbacks...");
    setTimeout(() => setLoadingMessage("Evaluating Vastu and structural flows..."), 2000);
    setTimeout(() => setLoadingMessage("Drafting 3 distinct architectural topologies..."), 4000);

    setTimeout(() => {
      setIsGenerating(false);
      setCurrentStep(2);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 6000);
  };

  const selectConcept = (concept: 'A' | 'B' | 'C') => {
    setActiveConcept(concept);
    setCurrentStep(3);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleFinalize = () => {
    let isValid = true;
    const isVal = (v: any) => Number(v) > 0;
    
    if (!isVal(roomLayout.hall.l) || !isVal(roomLayout.hall.w) || !isVal(roomLayout.kitchen.l) || !isVal(roomLayout.kitchen.w)) isValid = false;
    if (!isVal(roomLayout.stairsDim.l) || !isVal(roomLayout.stairsDim.w)) isValid = false;
    roomLayout.bedrooms.forEach(b => { if (!isVal(b.l) || !isVal(b.w)) isValid = false; });
    roomLayout.bathrooms.forEach(b => { if (!isVal(b.l) || !isVal(b.w)) isValid = false; });

    if (!isValid) return setErrorMsg("Please fill in all room dimensions to generate the final blueprint.");
    
    setErrorMsg("");
    setIsGenerating(true);
    
    setLoadingMessage("Routing central spine corridor...");
    setTimeout(() => setLoadingMessage("Aligning flush exterior walls..."), 1500);
    setTimeout(() => setLoadingMessage("Generating CAD and 3D Models..."), 3000);

    setTimeout(() => {
      setIsGenerating(false);
      setCurrentStep(4);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 4500);
  };

  // Safe State Updaters to fix React strict-mode bugs
  const updateRoom = (key: 'hall' | 'kitchen' | 'dining' | 'stairsDim', dim: 'l' | 'w', val: string) => {
    setRoomLayout(prev => ({ ...prev, [key]: { ...(prev as any)[key], [dim]: val } }));
  };

  const updateArrayRoom = (type: 'bedrooms' | 'bathrooms', index: number, dim: 'l' | 'w', val: string) => {
    setRoomLayout(prev => {
      const arr = [...prev[type]];
      arr[index] = { ...arr[index], [dim]: val };
      return { ...prev, [type]: arr };
    });
  };

  const inputStyle = "w-full border border-gray-200 bg-gray-50 rounded-xl p-4 text-gray-900 font-medium focus:bg-white focus:ring-2 focus:ring-[#22c55e]/30 focus:border-[#22c55e] transition-all outline-none";
  const selectStyle = "w-full border border-gray-200 bg-gray-50 rounded-xl p-4 text-gray-900 font-medium focus:bg-white focus:ring-2 focus:ring-[#22c55e]/30 focus:border-[#22c55e] transition-all outline-none cursor-pointer appearance-none";
  const labelStyle = "text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      <Navbar />
      
      <main className="max-w-4xl mx-auto w-full p-4 md:p-8 mt-4 pb-24">
        
        {currentStep < 4 && !isGenerating && (
          <div className="mb-10 animate-in fade-in duration-500">
            <div className="flex items-center justify-between text-[10px] md:text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
              <span className={currentStep >= 1 ? "text-[#22c55e]" : ""}>1. Plot & BHK</span>
              <span className={currentStep >= 2 ? "text-[#22c55e]" : ""}>2. Concept</span>
              <span className={currentStep >= 3 ? "text-[#22c55e]" : ""}>3. Dimensions</span>
            </div>
            <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
              <div className="bg-[#22c55e] h-full transition-all duration-700 ease-out" style={{ width: `${(currentStep / 3) * 100}%` }}></div>
            </div>
          </div>
        )}

        {isGenerating ? (
          <div className="bg-white border border-gray-100 rounded-3xl p-12 md:p-20 shadow-lg flex flex-col items-center justify-center animate-in fade-in duration-500">
             <div className="w-24 h-24 border-8 border-gray-100 border-t-[#22c55e] rounded-full animate-spin mb-8"></div>
             <h2 className="text-2xl font-bold text-gray-900 mb-3 text-center">Processing Architecture</h2>
             <p className="text-[#22c55e] font-bold tracking-widest uppercase text-sm animate-pulse text-center">{loadingMessage}</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-100 rounded-3xl p-6 md:p-10 shadow-lg print:border-none print:shadow-none print:p-0">
            
            {errorMsg && (
               <div className="bg-red-50 text-red-600 border border-red-200 rounded-xl p-4 mb-8 font-medium flex items-center gap-3">
                  <span className="text-xl">⚠️</span> {errorMsg}
               </div>
            )}

            {currentStep === 1 && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="text-center mb-8">
                  <h1 className="text-3xl font-bold text-gray-900 mb-2">Site Context</h1>
                  <p className="text-gray-500 font-medium">Define your plot boundaries and basic requirements.</p>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className={labelStyle}>Project Name</label>
                    <input type="text" placeholder="e.g. Skyline Residence" className={inputStyle} value={siteDetails.projectName} onChange={e => setSiteDetails({...siteDetails, projectName: e.target.value})} />
                  </div>

                  <div className="p-6 border border-gray-100 bg-gray-50/50 rounded-2xl">
                    <label className="text-sm font-bold text-gray-900 mb-4 block">Plot Boundaries (Feet)</label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <label className={labelStyle}>North</label>
                        <input type="number" className={inputStyle} value={siteDetails.northSide} onChange={e => setSiteDetails({...siteDetails, northSide: e.target.value})} />
                      </div>
                      <div>
                        <label className={labelStyle}>East</label>
                        <input type="number" className={inputStyle} value={siteDetails.eastSide} onChange={e => setSiteDetails({...siteDetails, eastSide: e.target.value})} />
                      </div>
                      <div>
                        <label className={labelStyle}>South</label>
                        <input type="number" className={inputStyle} value={siteDetails.southSide} onChange={e => setSiteDetails({...siteDetails, southSide: e.target.value})} />
                      </div>
                      <div>
                        <label className={labelStyle}>West</label>
                        <input type="number" className={inputStyle} value={siteDetails.westSide} onChange={e => setSiteDetails({...siteDetails, westSide: e.target.value})} />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={labelStyle}>Road Facing Direction</label>
                      <div className="relative">
                        <select className={selectStyle} value={siteDetails.roadFacing} onChange={e => setSiteDetails({...siteDetails, roadFacing: e.target.value})}>
                          <option value="East">East</option>
                          <option value="North">North</option>
                          <option value="West">West</option>
                          <option value="South">South</option>
                        </select>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 text-sm">▼</div>
                      </div>
                    </div>
                    <div>
                      <label className={labelStyle}>Requirement (BHK)</label>
                      <div className="relative">
                        <select className={selectStyle} value={siteDetails.bhkType} onChange={e => setSiteDetails({...siteDetails, bhkType: e.target.value})}>
                          <option value="1BHK">1 BHK</option>
                          <option value="2BHK">2 BHK</option>
                          <option value="3BHK">3 BHK</option>
                          <option value="4BHK">4 BHK</option>
                        </select>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 text-sm">▼</div>
                      </div>
                    </div>
                  </div>

                  <div className="p-5 border border-blue-100 bg-blue-50/50 rounded-2xl">
                    <label className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-3 block">Staircase Access</label>
                    <div className="flex gap-4">
                      <button type="button" onClick={() => setSiteDetails({...siteDetails, stairType: 'Internal'})} className={`flex-1 p-3 rounded-xl font-semibold transition-all border ${siteDetails.stairType === 'Internal' ? 'bg-white border-blue-500 text-blue-600 shadow-sm ring-2 ring-blue-500/20' : 'bg-transparent border-blue-200 text-gray-600 hover:bg-white'}`}>Internal Stairs</button>
                      <button type="button" onClick={() => setSiteDetails({...siteDetails, stairType: 'External'})} className={`flex-1 p-3 rounded-xl font-semibold transition-all border ${siteDetails.stairType === 'External' ? 'bg-white border-blue-500 text-blue-600 shadow-sm ring-2 ring-blue-500/20' : 'bg-transparent border-blue-200 text-gray-600 hover:bg-white'}`}>External Stairs</button>
                    </div>
                  </div>
                </div>

                <button type="button" onClick={handleGenerateConcepts} className="w-full bg-gray-900 text-white font-bold text-lg p-4 rounded-xl mt-8 hover:bg-[#22c55e] transition-colors shadow-md">
                  Analyze & Generate Concepts ➔
                </button>
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-8 animate-in fade-in slide-in-from-right-8 duration-500">
                <div className="text-center mb-10">
                  <h2 className="text-3xl font-black text-gray-900 mb-2">Phase 1: Choose Topology</h2>
                  <p className="text-gray-500 font-medium">Select how you want the {siteDetails.bhkType} to flow. We will add exact dimensions next.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {[
                    { id: 'A', name: 'Vastu Focus', desc: 'Hall on left, Kitchen/Dining separated on the right.' },
                    { id: 'B', name: 'Open Plan', desc: 'Hall, Kitchen, and Dining clustered on one massive open wing.' },
                    { id: 'C', name: 'Privacy Flow', desc: 'Hall on right, Kitchen/Dining separated on the left.' }
                  ].map(concept => (
                    <div key={concept.id} onClick={() => selectConcept(concept.id as 'A'|'B'|'C')} className="bg-white border-2 border-gray-100 rounded-3xl overflow-hidden hover:border-[#22c55e] hover:shadow-xl transition-all group cursor-pointer flex flex-col">
                      <div className="h-48 bg-gray-900 flex items-center justify-center p-6 relative overflow-hidden">
                        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(#ffffff 2px, transparent 2px)', backgroundSize: '20px 20px' }}></div>
                        <span className="text-white font-bold text-xl relative z-10 flex flex-col items-center gap-2">
                          <span className="text-4xl">📐</span> Concept {concept.id}
                        </span>
                      </div>
                      <div className="p-6 flex-grow flex flex-col">
                        <h3 className="font-bold text-lg text-gray-900 mb-2">{concept.name}</h3>
                        <p className="text-sm text-gray-500 mb-4 flex-grow">{concept.desc}</p>
                        <button type="button" className="w-full bg-gray-50 text-gray-900 font-bold py-3 rounded-xl group-hover:bg-[#22c55e] group-hover:text-white transition-colors">Select Concept</button>
                      </div>
                    </div>
                  ))}
                </div>
                
                <button type="button" onClick={() => setCurrentStep(1)} className="text-gray-500 font-bold hover:text-gray-900 mt-4 block mx-auto">⬅ Back to Plot Details</button>
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-8 animate-in fade-in slide-in-from-right-8 duration-500">
                <div className="text-center mb-8 border-b border-gray-100 pb-6">
                  <span className="bg-[#22c55e]/20 text-[#15803d] font-bold px-4 py-1.5 rounded-full text-xs uppercase tracking-wider mb-4 inline-block">Concept {activeConcept} Selected</span>
                  <h1 className="text-3xl font-bold text-gray-900 flex items-center justify-center gap-3">Phase 2: Internal Dimensions</h1>
                  <p className="text-gray-500 font-medium mt-2">Enter the exact dimensions for your {siteDetails.bhkType}. The system will autonomously build the central corridor.</p>
                </div>

                <div className="p-6 border border-blue-100 bg-blue-50/50 rounded-2xl mb-8">
                  <label className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-3 block">Stairs Footprint (ft)</label>
                  <div className="flex gap-4 items-center">
                    <input type="number" placeholder="Length" className={inputStyle} value={roomLayout.stairsDim.l} onChange={(e) => updateRoom('stairsDim', 'l', e.target.value)} />
                    <span className="font-bold text-gray-400">×</span>
                    <input type="number" placeholder="Width" className={inputStyle} value={roomLayout.stairsDim.w} onChange={(e) => updateRoom('stairsDim', 'w', e.target.value)} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-b border-gray-100 pb-6">
                  {(['hall', 'kitchen', 'dining'] as const).map((roomKey) => (
                    <div key={roomKey} className="p-5 border border-gray-100 bg-white rounded-2xl shadow-sm">
                      <label className={labelStyle}>{roomKey === 'hall' ? 'Living Area' : roomKey} (ft)</label>
                      <div className="flex gap-4 items-center mt-2">
                        <input type="number" placeholder="L" className={inputStyle} value={(roomLayout as any)[roomKey].l} onChange={(e) => updateRoom(roomKey, 'l', e.target.value)} />
                        <span className="font-bold text-gray-300">×</span>
                        <input type="number" placeholder="W" className={inputStyle} value={(roomLayout as any)[roomKey].w} onChange={(e) => updateRoom(roomKey, 'w', e.target.value)} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-4 pt-4">
                  <h3 className="font-bold text-lg text-gray-900 mb-2">Bedrooms (FT)</h3>
                  {roomLayout.bedrooms.map((room, i) => (
                    <div key={room.id} className="flex flex-col md:flex-row gap-4 items-center p-5 border border-gray-100 bg-white rounded-2xl shadow-sm">
                      <span className="text-sm font-bold text-gray-500 md:w-32">{room.name}</span>
                      <div className="flex gap-4 w-full items-center">
                        <input type="number" placeholder="Length" className={inputStyle} value={room.l} onChange={(e) => updateArrayRoom('bedrooms', i, 'l', e.target.value)} />
                        <span className="font-bold text-gray-300">×</span>
                        <input type="number" placeholder="Width" className={inputStyle} value={room.w} onChange={(e) => updateArrayRoom('bedrooms', i, 'w', e.target.value)} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-4 pt-6 border-t border-gray-100">
                  <h3 className="font-bold text-lg text-gray-900 mb-2">Bathrooms (FT)</h3>
                  {roomLayout.bathrooms.map((room, i) => (
                    <div key={room.id} className="p-5 border border-gray-100 bg-white rounded-2xl shadow-sm space-y-4">
                      <div className="flex flex-col md:flex-row gap-4 items-center">
                        <span className="text-sm font-bold text-gray-500 md:w-32">{room.isAttached ? `Attached Bath` : `Common Bath`}</span>
                        <div className="flex gap-4 w-full items-center">
                          <input type="number" placeholder="Length" className={inputStyle} value={room.l} onChange={(e) => updateArrayRoom('bathrooms', i, 'l', e.target.value)} />
                          <span className="font-bold text-gray-300">×</span>
                          <input type="number" placeholder="Width" className={inputStyle} value={room.w} onChange={(e) => updateArrayRoom('bathrooms', i, 'w', e.target.value)} />
                        </div>
                      </div>
                      {room.isAttached && (
                        <p className="text-xs font-bold text-blue-500 md:ml-36 uppercase tracking-wider">↳ Assigned to {room.attachedTo}</p>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex gap-4 pt-8">
                  <button type="button" onClick={() => setCurrentStep(2)} className="w-1/3 border border-gray-200 text-gray-600 p-4 font-semibold rounded-xl hover:bg-gray-50 transition-colors">Back</button>
                  <button type="button" onClick={handleFinalize} className="w-2/3 bg-[#22c55e] text-white font-bold text-lg p-4 rounded-xl hover:bg-[#1ea950] transition-colors shadow-md">
                    Generate Blueprint ✨
                  </button>
                </div>
              </div>
            )}

            {currentStep === 4 && activeConcept && (
              <div className="animate-in fade-in duration-700 space-y-6">
                <button type="button" onClick={() => setCurrentStep(3)} className="text-gray-500 font-bold hover:text-gray-900 transition-colors flex items-center gap-2 print:hidden">
                  ⬅ Edit Dimensions
                </button>
                
                <BlueprintRenderer siteDetails={siteDetails} roomLayout={roomLayout} conceptType={activeConcept} />

                <div className="flex gap-4 pt-6 border-t border-gray-100 mt-8 print:hidden">
                  <button type="button" onClick={() => window.print()} className="flex-1 bg-white border border-gray-200 text-gray-900 font-bold py-4 rounded-xl shadow-sm hover:bg-gray-50 transition-colors">
                    Download PDF
                  </button>
                  <button type="button" onClick={() => router.push('/estimate-boq')} className="flex-[2] bg-[#22c55e] text-white font-bold py-4 rounded-xl shadow-md hover:bg-[#1ea950] transition-colors">
                    Calculate BOQ Estimate ➔
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}