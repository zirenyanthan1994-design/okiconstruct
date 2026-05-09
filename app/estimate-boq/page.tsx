"use client";
import { useState, useEffect } from 'react';
import { auth, db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, doc, getDoc, query, where, getDocs } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import Navbar from '../components/Navbar';

// IMPORT FIX: Pointing to your lib folder
import { generateProjectBOQ } from '../lib/processBOQ';

export default function Estimator() {
  const [userData, setUserData] = useState<any>(null);

  const [siteDetails, setSiteDetails] = useState({
    roadFacing: 'East',
    stairType: 'Internal',
    bhkType: '2BHK' 
  });

  const [projectName, setProjectName] = useState(""); 
  const [currentStep, setCurrentStep] = useState(1); 
  const [activeFloor, setActiveFloor] = useState(0);
  const [totalFloorsCount, setTotalFloorsCount] = useState(1);
  const [isAskingCopy, setIsAskingCopy] = useState(false);
  
  const [slabOverhang, setSlabOverhang] = useState("2"); 
  const [copyColumnHeight, setCopyColumnHeight] = useState("10");
  const [floorSnapshots, setFloorSnapshots] = useState<any[]>([]);

  const [hasStairs, setHasStairs] = useState(true);
  const [stairsDim, setStairsDim] = useState({ length: '', width: '' });
  const [errorMsg, setErrorMsg] = useState("");
  
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const router = useRouter();

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

  const saveEstimateToDatabase = async () => {
    if (!auth.currentUser) return alert("Please log in from the Dashboard to save your estimates!");
    if (!boqReport) return alert("Error: BOQ Report is empty. Please generate the report first!");
    
    setIsSaving(true);
    try {
      const cleanData = JSON.parse(JSON.stringify(boqReport));
      const cleanName = (projectName || "OkiConstruct Build - " + new Date().toLocaleDateString()).trim();
      
      const checkQuery = query(
        collection(db, "boq_projects"),
        where("uid", "==", auth.currentUser.uid),
        where("projectName", "==", cleanName)
      );
      const duplicateCheck = await getDocs(checkQuery);
      
      if (!duplicateCheck.empty) {
        setIsSaving(false);
        return alert(`A project named "${cleanName}" already exists. Please choose a unique name to ensure expenses sync correctly.`);
      }

      const payload = {
        uid: auth.currentUser.uid, 
        projectName: cleanName, 
        totalFloors: totalFloorsCount,
        siteDetails: siteDetails,
        grandTotal: boqReport.grandTotal || 0,
        boqData: cleanData, 
        createdAt: serverTimestamp(),
      };
      
      const docRef = await addDoc(collection(db, "boq_projects"), payload);
      const pushKey = docRef.id; 

      setIsSaved(true); 
      alert(`Success! Estimate securely saved to the cloud.\nProject ID: ${pushKey}`);
    } catch (error: any) {
      alert("Database Error: " + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const [structure, setStructure] = useState<any>({
    footing: { count: '', breadth: '', width: '', depth: '' },
    column: { height: '10', breadth: '', width: '' },
    plinthBeam: { depth: '', width: '' },
    roofBeam: { depth: '', width: '' }
  });

  const [floorsData, setFloorsData] = useState<any[]>([
    {
      floorName: "Ground Floor",
      hall: { length: '', breadth: '' }, kitchenDining: { length: '', breadth: '' }, foyer: { length: '', breadth: '' },
      bedrooms: [],
      bathrooms: [],
      slabArea: ''
    }
  ]);

  const [openings, setOpenings] = useState<any>({
    mainDoor: { count: '1', height: '', width: '' },
    roomDoors: [{ id: Date.now(), count: '', height: '', width: '' }],
    bathroomDoors: [{ id: Date.now() + 1, count: '', height: '', width: '' }],
    windows: [{ id: Date.now() + 2, count: '', height: '', width: '' }],
    ventilations: [{ id: Date.now() + 3, count: '', height: '', width: '' }]
  });

  const [rates, setRates] = useState<any>({
    tmt: { "8mm": '', "10mm": '', "12mm": '', "16mm": '', "20mm": '', "25mm": '' },
    cement: '', sand: '', gravel: '', boulder: '', bricks: '',
    windowMaterial: 'Aluminum Profile', windowRate: '',
    mainDoorPrice: '', roomDoorPrice: '', bathroomDoorPrice: '', doorFramePrice: '' 
  });

  const [tiles, setTiles] = useState<Record<string, any>>({});
  const [paintData, setPaintData] = useState<any>({ puttyRate: '', brand: '', interiorRate: '', exteriorRate: '' });
  const [laborRates, setLaborRates] = useState<any>({ mason: '', painter: '', tiler: '' });
  const [boqReport, setBoqReport] = useState<any>(null);

  const updateFloorData = (roomType: string, index: number | null, field: string, value: string | boolean) => {
    setFloorsData(prev => {
      const d = JSON.parse(JSON.stringify(prev));
      if (!d[activeFloor]) return prev;
      if (index === null) {
        if (!d[activeFloor][roomType]) d[activeFloor][roomType] = {};
        d[activeFloor][roomType][field] = value;
      } else {
        if (d[activeFloor][roomType] && d[activeFloor][roomType][index]) {
          d[activeFloor][roomType][index][field] = value;
        }
      }
      return d;
    });
  };

  const updateOpening = (key: string, index: number | null, field: string, value: string) => {
    setOpenings((prev: any) => {
      const d = JSON.parse(JSON.stringify(prev));
      if (index === null) {
         d[key][field] = value;
      } else {
         if(d[key] && d[key][index]) d[key][index][field] = value;
      }
      return d;
    });
  };

  const addOpening = (key: string) => {
    setOpenings((prev: any) => ({
      ...prev,
      [key]: [...(prev[key] || []), { id: Date.now(), count: '', height: '', width: '' }]
    }));
  };

  const handleSetupComplete = () => {
    if (!projectName.trim()) return setErrorMsg("Please provide a Project Name.");
    
    const bhkCount = parseInt(siteDetails.bhkType.charAt(0)) || 1;
    let newBeds = [];
    let newBaths = [];

    for(let i = 0; i < bhkCount; i++) {
      newBeds.push({ id: Date.now() + i, length: '', breadth: '' });
    }
    
    const totalBaths = bhkCount === 1 ? 1 : bhkCount;
    for(let i = 0; i < totalBaths; i++) {
      newBaths.push({ id: Date.now() + 100 + i, length: '', breadth: '', isAttached: false, layoutType: 'outside', attachedTo: '' });
    }

    setFloorsData(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      updated[0] = { ...updated[0], bedrooms: newBeds, bathrooms: newBaths };
      return updated;
    });

    setErrorMsg("");
    setCurrentStep(2); 
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const validateAndProceed = (targetStep: number) => {
    setErrorMsg("");
    let isValid = true;
    const isVal = (v: any) => Number(v) > 0;

    if (currentStep === 2) {
      if (!isVal(structure.column.height) || !isVal(structure.column.breadth) || !isVal(structure.column.width)) isValid = false;
      if (!isVal(structure.roofBeam.depth) || !isVal(structure.roofBeam.width)) isValid = false;
      if (activeFloor === 0) {
        if (!isVal(structure.footing.count) || !isVal(structure.footing.breadth) || !isVal(structure.footing.width) || !isVal(structure.footing.depth)) isValid = false;
        if (!isVal(structure.plinthBeam.depth) || !isVal(structure.plinthBeam.width)) isValid = false;
      }
      if (!isValid) return setErrorMsg("Please ensure all structural dimensions are filled out.");
    }

    if (currentStep === 3) {
      const f = floorsData[activeFloor];
      if (!isVal(f?.hall?.length) || !isVal(f?.hall?.breadth) || !isVal(f?.kitchenDining?.length) || !isVal(f?.kitchenDining?.breadth)) isValid = false;
      f?.bedrooms?.forEach((b: any) => { if (!isVal(b?.length) || !isVal(b?.breadth)) isValid = false; });
      f?.bathrooms?.forEach((b: any) => { if (!isVal(b?.length) || !isVal(b?.breadth)) isValid = false; });
      if (hasStairs && (!isVal(stairsDim.length) || !isVal(stairsDim.width))) isValid = false;
      if (!isValid) return setErrorMsg("Please fill in all room dimensions with valid numbers.");
    }

    if (currentStep === 5) {
      if (!isVal(rates.cement) || !isVal(rates.bricks) || !isVal(rates.sand) || !isVal(rates.tmt['10mm'])) {
        return setErrorMsg("Material rates cannot be empty. Please enter prices.");
      }
    }

    setCurrentStep(targetStep);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNextFloorCheck = () => {
    setErrorMsg("");
    if (!Number(laborRates.mason) || !Number(laborRates.painter)) {
      return setErrorMsg("Please enter primary Labor Rates (Mason/Painter).");
    }

    if (activeFloor < totalFloorsCount - 1) {
      setCopyColumnHeight(structure.column.height); 
      setIsAskingCopy(true); 
    } else {
      executeProcessBOQ('none');
    }
  };

  const buildCurrentSnapshot = (floorIndex: number) => {
    return {
      floorName: floorsData[floorIndex]?.floorName || `Floor ${floorIndex + 1}`,
      layout: floorsData[floorIndex],
      structure: JSON.parse(JSON.stringify(structure)),
      openings: JSON.parse(JSON.stringify(openings)),
      tiles: JSON.parse(JSON.stringify(tiles)),
      paintData: JSON.parse(JSON.stringify(paintData)),
      laborRates: JSON.parse(JSON.stringify(laborRates)),
      hasStairs,
      stairsDim: { ...stairsDim }
    };
  };

  const executeProcessBOQ = (mode: 'none' | 'copy-all') => {
    setIsAskingCopy(false);
    let finalSnaps = [...floorSnapshots];
    const currentSnap = buildCurrentSnapshot(activeFloor);

    if (mode === 'none') {
        finalSnaps.push(currentSnap);
    } else if (mode === 'copy-all') {
        finalSnaps.push(currentSnap);
        for (let i = activeFloor + 1; i < totalFloorsCount; i++) {
            const clonedSnap = JSON.parse(JSON.stringify(currentSnap));
            clonedSnap.floorName = i === 1 ? "1st Floor" : i === 2 ? "2nd Floor" : i === 3 ? "3rd Floor" : `${i}th Floor`;
            clonedSnap.layout.floorName = clonedSnap.floorName;
            clonedSnap.structure.column.height = copyColumnHeight; 
            finalSnaps.push(clonedSnap);
        }
    }

    setFloorSnapshots(finalSnaps);
    
    // Explicit sync to match updated percentage structure from Admin
    const defaultSettings = {
      ratios: { pcc: { c: 1, s: 3, g: 6 }, slab: { c: 1, s: 2, g: 4 }, footing: { c: 1, s: 2, g: 4 }, plinthBeam: { c: 1, s: 3, g: 4 }, beam: { c: 1, s: 3, g: 4 }, column: { c: 1, s: 3, g: 4 }, mortar: { c: 1, s: 4, g: 0 }, tileBedding: { c: 1, s: 4, g: 0 } },
      tmtSpecs: { '8mm': { length: 38, weight: 4.74 }, '10mm': { length: 38, weight: 7.40 }, '12mm': { length: 38, weight: 10.66 }, '16mm': { length: 38, weight: 18.96 }, '20mm': { length: 38, weight: 29.60 }, '25mm': { length: 38, weight: 46.20 } },
      dimensions: { slabThickness: 5, meshGap: 4, ringSpacing: 5 },
      percentages: { 
        wastage: { cement: 10, sand: 10, gravel: 10, tmt: 10, bricks: 10, tiles: 10 },
        concreteAllowances: { footing: 5, column: 5, plinthBeam: 5, roofBeam: 5, slab: 25 },
        shuttering: 5,
        electrical: 12, 
        plumbing: 8, 
        misc: 5, 
        logistics: 10, 
        contingency: 5 
      },
      consumption: { puttyCoverage: 10, interiorPaintCoverage: 50, exteriorPaintCoverage: 50, bricksPerSqft: 5, plasterCftPerSqft: 0.10, brickJoiningCftPerSqft: 0.10, tileBeddingCftPerSqft: 0.20 }
    };

    let masterSettings: any = defaultSettings;
    try {
      const savedAdmin = localStorage.getItem("OkiConstruct_settings");
      if (savedAdmin) {
        const parsed = JSON.parse(savedAdmin);
        masterSettings = {
          ratios: { ...defaultSettings.ratios, ...(parsed.ratios || {}) },
          tmtSpecs: { ...defaultSettings.tmtSpecs, ...(parsed.tmtSpecs || {}) },
          dimensions: { ...defaultSettings.dimensions, ...(parsed.dimensions || {}) },
          percentages: { 
            ...defaultSettings.percentages, 
            ...(parsed.percentages || {}),
            wastage: { ...defaultSettings.percentages.wastage, ...(parsed.percentages?.wastage || {}) },
            concreteAllowances: { ...defaultSettings.percentages.concreteAllowances, ...(parsed.percentages?.concreteAllowances || {}) }
          },
          consumption: { ...defaultSettings.consumption, ...(parsed.consumption || {}) }
        };
      }
    } catch (err) {
       console.error("Local Storage Parsing Error", err);
    }

    try {
      const report = generateProjectBOQ(finalSnaps, totalFloorsCount, slabOverhang, rates, masterSettings);
      setBoqReport(report);
      setCurrentStep(9); 
    } catch (err) {
      console.error("Calculation Error:", err);
    }
  };

  const handleCopyChoice = (choice: 'yes' | 'no') => {
    if (choice === 'yes') {
      executeProcessBOQ('copy-all');
    } else {
      setFloorSnapshots(prev => [...prev, buildCurrentSnapshot(activeFloor)]);
      const nextIdx = activeFloor + 1;
      const floorLabel = nextIdx === 1 ? "1st Floor" : nextIdx === 2 ? "2nd Floor" : nextIdx === 3 ? "3rd Floor" : `${nextIdx}th Floor`;

      setFloorsData((prev: any) => [...prev, {
        floorName: floorLabel,
        hall: { length: '', breadth: '' }, kitchenDining: { length: '', breadth: '' }, foyer: { length: '', breadth: '' },
        bedrooms: [{ id: Date.now(), length: '', breadth: '' }],
        bathrooms: [{ id: Date.now() + 1, length: '', breadth: '', isAttached: false, layoutType: 'outside', attachedTo: '' }],
        slabArea: ''
      }]);
      setActiveFloor(nextIdx);
      setIsAskingCopy(false);
      
      setStructure({...structure, column: {...structure.column, height: copyColumnHeight}});
      setCurrentStep(2); 
      window.scrollTo(0,0);
    }
  };

  const addBedroom = () => {
    setFloorsData(prev => {
      const d = JSON.parse(JSON.stringify(prev));
      d[activeFloor].bedrooms.push({ id: Date.now(), length: '', breadth: '' });
      return d;
    });
  };

  const addBathroom = () => {
    setFloorsData(prev => {
      const d = JSON.parse(JSON.stringify(prev));
      d[activeFloor].bathrooms.push({ id: Date.now() + 1, length: '', breadth: '', isAttached: false, layoutType: 'outside', attachedTo: '' });
      return d;
    });
  };

  const updateTile = (roomKey: string, field: 'size' | 'type' | 'price', value: string) => {
    setTiles(prev => ({ ...prev, [roomKey]: { ...(prev[roomKey] || { size: '', type: '', price: '' }), [field]: value } }));
  };

  const getRoomArea = (room: any) => (Number(room?.length) || 0) * (Number(room?.breadth) || 0);

  const calculateFloorArea = (index: number) => {
    const f = floorsData[index];
    if (!f) return 0;
    const staticRooms = getRoomArea(f.hall) + getRoomArea(f.kitchenDining) + getRoomArea(f.foyer);
    const dynamicBedrooms = (f.bedrooms || []).reduce((sum: number, r: any) => sum + getRoomArea(r), 0);
    const dynamicBaths = (f.bathrooms || []).reduce((sum: number, r: any) => sum + (r.isAttached && r.layoutType === 'inside' ? 0 : getRoomArea(r)), 0);
    const stairsArea = hasStairs ? (Number(stairsDim.length) * Number(stairsDim.width) || 0) : 0;
    return staticRooms + dynamicBedrooms + dynamicBaths + stairsArea;
  };

  const inputStyle = "w-full border border-gray-200 bg-gray-50 rounded-xl p-4 text-gray-900 font-medium focus:bg-white focus:ring-2 focus:ring-[#22c55e]/30 focus:border-[#22c55e] transition-all outline-none";
  const selectStyle = "w-full border border-gray-200 bg-gray-50 rounded-xl p-4 text-gray-900 font-medium focus:bg-white focus:ring-2 focus:ring-[#22c55e]/30 focus:border-[#22c55e] transition-all outline-none cursor-pointer appearance-none";
  const labelStyle = "text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block";
  
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      <Navbar />
      <main className="max-w-5xl mx-auto w-full p-4 md:p-8 mt-4 pb-24 print:p-0 print:mt-0 print:max-w-none">
        
        {currentStep < 9 && (
          <div className="mb-10 animate-in fade-in duration-500 print:hidden">
            <div className="flex items-center justify-between text-[10px] md:text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
              <span className={currentStep >= 1 ? "text-[#22c55e]" : ""}>Setup</span>
              <span className={currentStep >= 2 ? "text-[#22c55e]" : ""}>Structure</span>
              <span className={currentStep >= 3 ? "text-[#22c55e]" : ""}>Layout</span>
              <span className={currentStep >= 4 ? "text-[#22c55e]" : ""}>Openings</span>
              <span className={currentStep >= 6 ? "text-[#22c55e]" : ""}>Finishes</span>
              <span className={currentStep >= 8 ? "text-[#22c55e]" : ""}>Review</span>
            </div>
            <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-[#22c55e] h-full transition-all duration-700 ease-out rounded-full" 
                style={{ width: `${((currentStep) / 8) * 100}%` }}
              ></div>
            </div>
          </div>
        )}

        <div className="bg-white border border-gray-100 rounded-3xl p-6 md:p-10 shadow-lg print:shadow-none print:border-none print:p-0">
          
          {errorMsg && (
             <div className="bg-red-50 text-red-600 border border-red-200 rounded-xl p-4 mb-8 font-medium flex items-center gap-3 animate-in slide-in-from-top-2 print:hidden">
                <span className="text-xl">⚠️</span> {errorMsg}
             </div>
          )}

          {/* --- STEP 1: SETUP & CONTEXT --- */}
          {currentStep === 1 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-2xl mx-auto">
              <div className="text-center mb-8">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Project Setup & Context</h1>
                <p className="text-gray-500 font-medium">Define your project requirements and building scale.</p>
              </div>

              <div className="space-y-6">
                <div>
                  <label className={labelStyle}>Project Name</label>
                  <input type="text" placeholder="e.g. Skyline Residence" className={inputStyle} value={projectName} onChange={e => setProjectName(e.target.value)} />
                </div>

                <div className="p-6 border border-gray-100 bg-gray-50/50 rounded-2xl">
                  <label className="text-sm font-bold text-gray-900 mb-4 block">Building Scale & Type</label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className={labelStyle}>Total Floors</label>
                      <div className="relative">
                        <select className={selectStyle} onChange={(e) => {
                          const count = e.target.value === 'G' ? 1 : parseInt(e.target.value.replace('G+', '')) + 1;
                          setTotalFloorsCount(count);
                        }}>
                          <option value="G">Ground Floor Only</option>
                          {Array.from({ length: 9 }, (_, i) => (
                            <option key={i + 1} value={`G+${i + 1}`}>G + {i + 1} Floor</option>
                          ))}
                        </select>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 text-sm">▼</div>
                      </div>
                    </div>
                    <div>
                      <label className={labelStyle}>Road Facing</label>
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
                </div>

                <div className="p-5 border border-blue-100 bg-blue-50/50 rounded-2xl">
                  <label className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-3 block">Staircase Access</label>
                  <div className="flex gap-4">
                    <button type="button" onClick={() => { setSiteDetails({...siteDetails, stairType: 'None'}); setHasStairs(false); }} className={`flex-1 p-3 rounded-xl font-semibold transition-all border ${siteDetails.stairType === 'None' ? 'bg-white border-blue-500 text-blue-600 shadow-sm ring-2 ring-blue-500/20' : 'bg-transparent border-blue-200 text-gray-600 hover:bg-white'}`}>No Stairs</button>
                    <button type="button" onClick={() => { setSiteDetails({...siteDetails, stairType: 'Internal'}); setHasStairs(true); }} className={`flex-1 p-3 rounded-xl font-semibold transition-all border ${siteDetails.stairType === 'Internal' ? 'bg-white border-blue-500 text-blue-600 shadow-sm ring-2 ring-blue-500/20' : 'bg-transparent border-blue-200 text-gray-600 hover:bg-white'}`}>Internal Stairs</button>
                    <button type="button" onClick={() => { setSiteDetails({...siteDetails, stairType: 'External'}); setHasStairs(true); }} className={`flex-1 p-3 rounded-xl font-semibold transition-all border ${siteDetails.stairType === 'External' ? 'bg-white border-blue-500 text-blue-600 shadow-sm ring-2 ring-blue-500/20' : 'bg-transparent border-blue-200 text-gray-600 hover:bg-white'}`}>External Stairs</button>
                  </div>
                </div>
              </div>

              <button type="button" onClick={handleSetupComplete} className="w-full bg-gray-900 text-white font-bold text-lg p-4 rounded-xl mt-8 hover:bg-[#22c55e] transition-colors shadow-md">
                Start BOQ Estimation ➔
              </button>
            </div>
          )}

          {isAskingCopy && (
            <div className="space-y-8 py-16 text-center animate-in fade-in duration-500 max-w-lg mx-auto">
              <div className="w-20 h-20 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-6 text-4xl">📋</div>
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
                Is the {activeFloor === 0 ? "1st Floor" : `${activeFloor + 1}th Floor`} layout the same as {floorsData[activeFloor]?.floorName}?
              </h2>
              <p className="text-gray-500 font-medium mb-4">Save time by duplicating the entire layout and measurements.</p>
              
              <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 mt-6 text-left">
                <label className={labelStyle}>What is the column height for this floor? (Feet)</label>
                <input type="number" inputMode="decimal" className={inputStyle} value={copyColumnHeight} onChange={(e) => setCopyColumnHeight(e.target.value)} />
                <p className="text-xs text-gray-500 mt-2 font-medium">We will recalculate the wall area and painting costs automatically.</p>
              </div>

              <div className="flex flex-col md:flex-row gap-4 justify-center mt-8">
                <button onClick={() => handleCopyChoice('yes')} className="flex-1 bg-[#22c55e] text-white rounded-xl py-4 font-bold text-lg hover:bg-[#1ea950] transition-colors shadow-md">Yes, Copy Layout</button>
                <button onClick={() => handleCopyChoice('no')} className="flex-1 bg-white border border-gray-200 text-gray-700 rounded-xl py-4 font-bold text-lg hover:bg-gray-50 transition-colors">No, It&apos;s Different</button>
              </div>
            </div>
          )}

          {/* --- STEP 2: STRUCTURE --- */}
          {currentStep === 2 && !isAskingCopy && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-3xl mx-auto">
              
              <div className="mb-8 border-b border-gray-100 pb-6 text-center">
                <h1 className="text-3xl font-bold text-gray-900 flex items-center justify-center gap-3">
                  <span className="text-3xl">🏛️</span> Structural Elements
                </h1>
              </div>

              {activeFloor === 0 && (
                <div className="border border-gray-200 p-6 rounded-3xl bg-white shadow-sm">
                  <h2 className="font-bold text-lg text-gray-900 mb-6 flex items-center gap-2">
                    <span className="bg-green-100 text-[#22c55e] w-8 h-8 rounded-full flex items-center justify-center text-sm">1</span> 
                    Footing (Ground Floor Only)
                  </h2>
                  <div className="space-y-5">
                    <div>
                      <label className={labelStyle}>Number of footings</label>
                      <input type="number" inputMode="decimal" min="0" placeholder="e.g., 12" className={inputStyle} value={structure.footing.count} onChange={(e) => setStructure({ ...structure, footing: { ...structure.footing, count: e.target.value } })} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={labelStyle}>Breadth (Feet)</label>
                        <input type="number" inputMode="decimal" min="0" placeholder="Breadth" className={inputStyle} value={structure.footing.breadth} onChange={(e) => setStructure({ ...structure, footing: { ...structure.footing, breadth: e.target.value } })} />
                      </div>
                      <div>
                        <label className={labelStyle}>Width (Feet)</label>
                        <input type="number" inputMode="decimal" min="0" placeholder="Width" className={inputStyle} value={structure.footing.width} onChange={(e) => setStructure({ ...structure, footing: { ...structure.footing, width: e.target.value } })} />
                      </div>
                    </div>
                    <div>
                      <label className={labelStyle}>Depth (Feet)</label>
                      <input type="number" inputMode="decimal" min="0" placeholder="e.g., 4" className={inputStyle} value={structure.footing.depth} onChange={(e) => setStructure({ ...structure, footing: { ...structure.footing, depth: e.target.value } })} />
                    </div>
                  </div>
                </div>
              )}

              <div className="border border-gray-200 p-6 rounded-3xl bg-white shadow-sm">
                <h2 className="font-bold text-lg text-gray-900 mb-6 flex items-center gap-2">
                  <span className="bg-green-100 text-[#22c55e] w-8 h-8 rounded-full flex items-center justify-center text-sm">{activeFloor === 0 ? '2' : '1'}</span> 
                  Columns
                </h2>
                <div className="space-y-5">
                  <div>
                    <label className={labelStyle}>Height (Feet)</label>
                    <input type="number" inputMode="decimal" min="0" placeholder="e.g., 10" className={inputStyle} value={structure.column.height} onChange={(e) => setStructure({ ...structure, column: { ...structure.column, height: e.target.value } })} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelStyle}>Breadth (Inches)</label>
                      <input type="number" inputMode="decimal" min="0" placeholder="e.g., 12" className={inputStyle} value={structure.column.breadth} onChange={(e) => setStructure({ ...structure, column: { ...structure.column, breadth: e.target.value } })} />
                    </div>
                    <div>
                      <label className={labelStyle}>Width (Inches)</label>
                      <input type="number" inputMode="decimal" min="0" placeholder="e.g., 12" className={inputStyle} value={structure.column.width} onChange={(e) => setStructure({ ...structure, column: { ...structure.column, width: e.target.value } })} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="border border-gray-200 p-6 rounded-3xl bg-white shadow-sm">
                <h2 className="font-bold text-lg text-gray-900 mb-6 flex items-center gap-2">
                  <span className="bg-green-100 text-[#22c55e] w-8 h-8 rounded-full flex items-center justify-center text-sm">{activeFloor === 0 ? '3' : '2'}</span> 
                  Beams (Inches)
                </h2>
                <div className="space-y-6">
                  {activeFloor === 0 && (
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                      <span className="font-bold text-gray-700 block mb-3">Plinth Beam</span>
                      <div className="grid grid-cols-2 gap-4">
                        <input type="number" inputMode="decimal" min="0" placeholder="Depth" className={inputStyle} value={structure.plinthBeam.depth} onChange={(e) => setStructure({ ...structure, plinthBeam: { ...structure.plinthBeam, depth: e.target.value } })} />
                        <input type="number" inputMode="decimal" min="0" placeholder="Width" className={inputStyle} value={structure.plinthBeam.width} onChange={(e) => setStructure({ ...structure, plinthBeam: { ...structure.plinthBeam, width: e.target.value } })} />
                      </div>
                    </div>
                  )}
                  <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                    <span className="font-bold text-gray-700 block mb-3">Roof Beam</span>
                    <div className="grid grid-cols-2 gap-4">
                      <input type="number" inputMode="decimal" min="0" placeholder="Depth" className={inputStyle} value={structure.roofBeam.depth} onChange={(e) => setStructure({ ...structure, roofBeam: { ...structure.roofBeam, depth: e.target.value } })} />
                      <input type="number" inputMode="decimal" min="0" placeholder="Width" className={inputStyle} value={structure.roofBeam.width} onChange={(e) => setStructure({ ...structure, roofBeam: { ...structure.roofBeam, width: e.target.value } })} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button onClick={() => { setErrorMsg(""); setCurrentStep(1); }} className="w-1/3 border border-gray-200 text-gray-600 p-4 font-semibold rounded-xl hover:bg-gray-50 transition-colors">Back</button>
                <button onClick={() => validateAndProceed(3)} className="w-2/3 bg-[#22c55e] text-white font-bold text-lg p-4 rounded-xl hover:bg-[#1ea950] transition-colors shadow-md">Continue to Layout</button>
              </div>
            </div>
          )}

          {/* --- STEP 3: LAYOUT --- */}
          {currentStep === 3 && !isAskingCopy && floorsData[activeFloor] && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              
              <div className="mb-8 border-b border-gray-100 pb-6 flex justify-between items-end">
                <div>
                  <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                    <span className="text-3xl">📏</span> {floorsData[activeFloor]?.floorName} Layout
                  </h1>
                  <p className="text-gray-500 font-medium mt-2">Enter the internal dimensions for each space.</p>
                </div>
              </div>

              <div className="bg-green-50/50 border border-[#22c55e]/20 p-5 rounded-2xl mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-gray-900">Slab Overhang Extension</h3>
                  <p className="text-sm text-gray-500 font-medium">How far should the slab extend beyond the built-up area?</p>
                </div>
                <div className="flex items-center gap-3 bg-white p-2 rounded-xl border border-gray-200 shadow-sm w-fit">
                  <input type="number" inputMode="decimal" className="w-20 text-center font-bold text-lg outline-none text-[#22c55e]" value={slabOverhang} onChange={(e) => setSlabOverhang(e.target.value)} />
                  <span className="font-bold text-gray-400 pr-3">Feet</span>
                </div>
              </div>
              
              {hasStairs && (
                  <div className="p-6 border border-blue-100 bg-blue-50/50 rounded-2xl mb-4">
                    <label className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-3 block">Stairs Area Provision (ft)</label>
                    <div className="flex gap-4 items-center">
                      <input type="number" inputMode="decimal" min="0" placeholder="Length" className={inputStyle} value={stairsDim.length} onChange={(e) => setStairsDim({ ...stairsDim, length: e.target.value })} />
                      <span className="font-bold text-gray-400">×</span>
                      <input type="number" inputMode="decimal" min="0" placeholder="Width" className={inputStyle} value={stairsDim.width} onChange={(e) => setStairsDim({ ...stairsDim, width: e.target.value })} />
                    </div>
                  </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { key: 'hall', label: 'Hall/Living Room' }, 
                  { key: 'kitchenDining', label: 'Kitchen & Dining' }, 
                  { key: 'foyer', label: 'Foyer' }
                ].map((room) => (
                  <div key={room.key} className="p-5 border border-gray-100 bg-white rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                    <label className={labelStyle}>
                      {room.label} (ft)
                    </label>
                    <div className="flex gap-4 items-center mt-2">
                      <input type="number" inputMode="decimal" min="0" placeholder="Length" className={inputStyle} value={floorsData[activeFloor]?.[room.key]?.length || ''} onChange={(e) => updateFloorData(room.key, null, 'length', e.target.value)} />
                      <span className="font-bold text-gray-300">×</span>
                      <input type="number" inputMode="decimal" min="0" placeholder="Breadth" className={inputStyle} value={floorsData[activeFloor]?.[room.key]?.breadth || ''} onChange={(e) => updateFloorData(room.key, null, 'breadth', e.target.value)} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-4 pt-6 border-t border-gray-100">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-lg text-gray-900">Bedrooms (FT)</h3>
                  <button onClick={addBedroom} className="text-sm font-semibold text-[#22c55e] bg-green-50 px-4 py-2 rounded-lg hover:bg-green-100 transition-colors">+ Add Room</button>
                </div>
                {floorsData[activeFloor]?.bedrooms?.map((room: any, i: number) => (
                  <div key={room.id} className="flex flex-col md:flex-row gap-4 items-center p-5 border border-gray-100 bg-white rounded-2xl shadow-sm">
                    <span className="text-sm font-bold text-gray-500 md:w-32">Bedroom {i + 1}</span>
                    <div className="flex gap-4 w-full items-center">
                      <input type="number" inputMode="decimal" min="0" placeholder="Length" className={inputStyle} value={room.length} onChange={(e) => updateFloorData('bedrooms', i, 'length', e.target.value)} />
                      <span className="font-bold text-gray-300">×</span>
                      <input type="number" inputMode="decimal" min="0" placeholder="Breadth" className={inputStyle} value={room.breadth} onChange={(e) => updateFloorData('bedrooms', i, 'breadth', e.target.value)} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-4 pt-6 border-t border-gray-100">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-lg text-gray-900">Bathrooms (FT)</h3>
                  <button onClick={addBathroom} className="text-sm font-semibold text-[#22c55e] bg-green-50 px-4 py-2 rounded-lg hover:bg-green-100 transition-colors">+ Add Bath</button>
                </div>
                {floorsData[activeFloor]?.bathrooms?.map((room: any, i: number) => (
                  <div key={room.id} className="p-5 border border-gray-100 bg-white rounded-2xl shadow-sm space-y-4">
                    <div className="flex flex-col md:flex-row gap-4 items-center">
                      <span className="text-sm font-bold text-gray-500 md:w-32">Bathroom {i + 1}</span>
                      <div className="flex gap-4 w-full items-center">
                        <input type="number" inputMode="decimal" min="0" placeholder="Length" className={inputStyle} value={room.length} onChange={(e) => updateFloorData('bathrooms', i, 'length', e.target.value)} />
                        <span className="font-bold text-gray-300">×</span>
                        <input type="number" inputMode="decimal" min="0" placeholder="Breadth" className={inputStyle} value={room.breadth} onChange={(e) => updateFloorData('bathrooms', i, 'breadth', e.target.value)} />
                      </div>
                    </div>
                    
                    <div className="flex gap-4 md:pl-36">
                      <button type="button" onClick={() => updateFloorData('bathrooms', i, 'isAttached', false)} className={`flex-1 p-2.5 text-sm rounded-xl font-semibold transition-all border ${!room.isAttached ? 'bg-gray-900 border-gray-900 text-white shadow-md' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>Common</button>
                      <button type="button" onClick={() => updateFloorData('bathrooms', i, 'isAttached', true)} className={`flex-1 p-2.5 text-sm rounded-xl font-semibold transition-all border ${room.isAttached ? 'bg-gray-900 border-gray-900 text-white shadow-md' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>Attached</button>
                    </div>
                    
                    {room.isAttached && (
                      <div className="mt-4 p-4 border border-gray-200 bg-gray-50 rounded-xl md:ml-36 space-y-4">
                        <div>
                          <label className="text-xs font-bold text-gray-500 uppercase block mb-3">Attached To</label>
                          <div className="relative">
                            <select className={selectStyle} value={room.attachedTo || ''} onChange={(e) => updateFloorData('bathrooms', i, 'attachedTo', e.target.value)}>
                              <option value="">Select Room</option>
                              {floorsData[activeFloor]?.bedrooms?.map((b: any, bIdx: number) => (
                                <option key={bIdx} value={`Bedroom ${bIdx + 1}`}>Bedroom {bIdx + 1}</option>
                              ))}
                              <option value="Hall">Hall</option>
                              <option value="Kitchen">Kitchen</option>
                            </select>
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 text-sm">▼</div>
                          </div>
                        </div>

                        <div>
                          <span className="text-xs font-bold text-gray-500 uppercase block mb-3">Layout Position</span>
                          <div className="flex flex-col gap-3">
                            <label className="flex items-center gap-3 cursor-pointer p-2 hover:bg-white rounded-lg transition-colors">
                              <input type="radio" name={`layout-${room.id}`} checked={room.layoutType === 'inside'} onChange={() => updateFloorData('bathrooms', i, 'layoutType', 'inside')} className="w-4 h-4 text-[#22c55e] focus:ring-[#22c55e]" />
                              <span className="font-medium text-sm text-gray-700">Inside room footprint <span className="text-gray-400 font-normal">(Ignores extra area)</span></span>
                            </label>
                            <label className="flex items-center gap-3 cursor-pointer p-2 hover:bg-white rounded-lg transition-colors">
                              <input type="radio" name={`layout-${room.id}`} checked={room.layoutType === 'outside' || !room.layoutType} onChange={() => updateFloorData('bathrooms', i, 'layoutType', 'outside')} className="w-4 h-4 text-[#22c55e] focus:ring-[#22c55e]" />
                              <span className="font-medium text-sm text-gray-700">Outside room footprint <span className="text-gray-400 font-normal">(Adds to total area)</span></span>
                            </label>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="bg-gray-900 text-white p-6 rounded-2xl flex flex-col md:flex-row gap-6 items-center shadow-lg mt-10">
                <div className="flex flex-col items-center md:items-start flex-1">
                  <span className="font-semibold text-xs text-gray-400 uppercase tracking-widest mb-1">Layout Area</span>
                  <p className="text-3xl font-bold text-[#22c55e]">{calculateFloorArea(activeFloor)} <span className="text-lg">SQ FT</span></p>
                  <p className="text-xs text-gray-500 mt-1">Internal room total</p>
                </div>
                <div className="hidden md:block w-px h-16 bg-gray-700"></div>
                <div className="flex flex-col items-center md:items-start flex-1">
                  <span className="font-semibold text-xs text-gray-400 uppercase tracking-widest mb-1">Adjusted Slab Area</span>
                  <p className="text-3xl font-bold text-white">
                    {Math.pow(Math.sqrt(calculateFloorArea(activeFloor)) + (Number(slabOverhang) || 0), 2).toFixed(2)} <span className="text-lg">SQ FT</span>
                  </p>
                  <p className="text-xs text-[#22c55e] mt-1">Includes custom {slabOverhang}ft overhang</p>
                </div>
              </div>

              <div className="flex gap-4 pt-6">
                <button onClick={() => { setErrorMsg(""); setCurrentStep(2); }} className="w-1/3 border border-gray-200 text-gray-600 p-4 font-semibold rounded-xl hover:bg-gray-50 transition-colors">Back</button>
                <button onClick={() => validateAndProceed(4)} className="w-2/3 bg-[#22c55e] text-white font-bold text-lg p-4 rounded-xl hover:bg-[#1ea950] transition-colors shadow-md">Continue to Openings</button>
              </div>
            </div>
          )}

          {/* --- STEP 4: OPENINGS --- */}
          {currentStep === 4 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl mx-auto">
              
              <div className="mb-8 border-b border-gray-100 pb-6 text-center">
                <h1 className="text-3xl font-bold text-gray-900 flex items-center justify-center gap-3">
                  <span className="text-3xl">🚪</span> Doors & Windows
                </h1>
              </div>

              {[{ title: '1. Main Door', data: [openings?.mainDoor || {}], key: 'mainDoor', isArray: false },
                { title: '2. Room Doors', data: openings?.roomDoors || [], key: 'roomDoors', isArray: true },
                { title: '3. Bathroom Doors', data: openings?.bathroomDoors || [], key: 'bathroomDoors', isArray: true },
                { title: '4. Windows', data: openings?.windows || [], key: 'windows', isArray: true },
                { title: '5. Ventilations', data: openings?.ventilations || [], key: 'ventilations', isArray: true }
              ].map((section) => (
                <div key={section.title} className="border border-gray-100 p-6 rounded-3xl bg-white shadow-sm">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="font-bold text-lg text-gray-900">{section.title} (Feet)</h2>
                    {section.isArray && (
                      <button type="button" onClick={() => addOpening(section.key)} className="text-sm font-semibold text-[#22c55e] bg-green-50 px-3 py-1.5 rounded-lg hover:bg-green-100 transition-colors">+ Add Item</button>
                    )}
                  </div>
                  <div className="space-y-4">
                    {section.data.map((item: any, i: number) => (
                      <div key={item?.id || i} className="grid grid-cols-3 gap-4">
                        <div>
                          <label className={labelStyle}>Quantity</label>
                          <input type="number" inputMode="decimal" min="0" className={inputStyle} value={item?.count || ''} onChange={(e) => updateOpening(section.key, section.isArray ? i : null, 'count', e.target.value)} />
                        </div>
                        <div>
                          <label className={labelStyle}>Height (ft)</label>
                          <input type="number" inputMode="decimal" min="0" className={inputStyle} value={item?.height || ''} onChange={(e) => updateOpening(section.key, section.isArray ? i : null, 'height', e.target.value)} />
                        </div>
                        <div>
                          <label className={labelStyle}>Width (ft)</label>
                          <input type="number" inputMode="decimal" min="0" className={inputStyle} value={item?.width || ''} onChange={(e) => updateOpening(section.key, section.isArray ? i : null, 'width', e.target.value)} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <div className="flex gap-4 pt-6">
                <button onClick={() => { setErrorMsg(""); setCurrentStep(3); }} className="w-1/3 border border-gray-200 text-gray-600 p-4 font-semibold rounded-xl hover:bg-gray-50 transition-colors">Back</button>
                <button onClick={() => validateAndProceed(5)} className="w-2/3 bg-gray-900 text-white font-bold text-lg p-4 rounded-xl hover:bg-[#22c55e] transition-colors shadow-md">Continue to Materials</button>
              </div>
            </div>
          )}

          {/* --- STEP 5: MATERIALS --- */}
          {currentStep === 5 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-3xl mx-auto">
              
              <div className="mb-8 border-b border-gray-100 pb-6 text-center">
                <h1 className="text-3xl font-bold text-gray-900 flex items-center justify-center gap-3">
                  <span className="text-3xl">🧱</span> Material Rates
                </h1>
                <p className="text-gray-500 font-medium mt-2">Enter local market prices to calculate total costs.</p>
              </div>

              <div className="border border-gray-100 p-6 rounded-3xl bg-white shadow-sm">
                <h2 className="font-bold text-lg text-gray-900 mb-6">1. TMT Bar Rate (/KG)</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                  {Object.keys(rates.tmt || {}).map((size) => (
                    <div key={size}>
                      <label className={labelStyle}>{size}</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">₹</span>
                        <input type="number" inputMode="decimal" min="0" className={`${inputStyle} pl-8`} value={(rates.tmt as any)[size]} onChange={(e) => setRates({ ...rates, tmt: { ...rates.tmt, [size]: e.target.value } })} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border border-gray-100 p-6 rounded-3xl bg-white shadow-sm">
                <h2 className="font-bold text-lg text-gray-900 mb-6">2. Core Materials</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {[
                    { label: 'Cement Rate (Bag)', key: 'cement' },
                    { label: 'Sand Rate (CFT)', key: 'sand' },
                    { label: 'Gravel Rate (CFT)', key: 'gravel' },
                    { label: 'Boulder Rate (CFT)', key: 'boulder' },
                    { label: 'Bricks Rate (Piece)', key: 'bricks' }
                  ].map(mat => (
                    <div key={mat.key} className={mat.key === 'bricks' ? "md:col-span-2 pt-4 border-t border-gray-100" : ""}>
                      <label className={labelStyle}>{mat.label}</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">₹</span>
                        <input type="number" inputMode="decimal" min="0" className={`${inputStyle} pl-8`} value={(rates as any)[mat.key]} onChange={(e) => setRates({ ...rates, [mat.key]: e.target.value })} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border border-gray-100 p-6 rounded-3xl bg-white shadow-sm">
                <h2 className="font-bold text-lg text-gray-900 mb-6">3. Windows & Doors</h2>
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={labelStyle}>Window Material</label>
                      <div className="relative">
                        <select className={selectStyle} value={rates.windowMaterial} onChange={(e) => setRates({ ...rates, windowMaterial: e.target.value })}>
                          <option value="Iron Fabrication">Iron Fabrication</option>
                          <option value="Wood">Wood</option>
                          <option value="uPVC">uPVC</option>
                          <option value="Aluminum Profile">Aluminum Profile</option>
                        </select>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">▼</div>
                      </div>
                    </div>
                    <div>
                      <label className={labelStyle}>Rate (Sq Ft)</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">₹</span>
                        <input type="number" inputMode="decimal" min="0" className={`${inputStyle} pl-8`} value={rates.windowRate} onChange={(e) => setRates({ ...rates, windowRate: e.target.value })} />
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-gray-100">
                    <div>
                      <label className={labelStyle}>Main Door Price</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#22c55e] font-bold">₹</span>
                        <input type="number" inputMode="decimal" min="0" className={`${inputStyle} pl-8 border-[#22c55e]/30`} value={rates.mainDoorPrice} onChange={(e) => setRates({ ...rates, mainDoorPrice: e.target.value })} />
                      </div>
                    </div>
                    <div>
                      <label className={labelStyle}>Room Door Price</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">₹</span>
                        <input type="number" inputMode="decimal" min="0" className={`${inputStyle} pl-8`} value={rates.roomDoorPrice} onChange={(e) => setRates({ ...rates, roomDoorPrice: e.target.value })} />
                      </div>
                    </div>
                    <div>
                      <label className={labelStyle}>Bathroom Door Price</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">₹</span>
                        <input type="number" inputMode="decimal" min="0" className={`${inputStyle} pl-8`} value={rates.bathroomDoorPrice} onChange={(e) => setRates({ ...rates, bathroomDoorPrice: e.target.value })} />
                      </div>
                    </div>
                    <div>
                      <label className={labelStyle}>Door Frame Price</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">₹</span>
                        <input type="number" inputMode="decimal" min="0" className={`${inputStyle} pl-8`} value={rates.doorFramePrice} onChange={(e) => setRates({ ...rates, doorFramePrice: e.target.value })} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button onClick={() => { setErrorMsg(""); setCurrentStep(4); }} className="w-1/3 border border-gray-200 text-gray-600 p-4 font-semibold rounded-xl hover:bg-gray-50 transition-colors">Back</button>
                <button onClick={() => validateAndProceed(6)} className="w-2/3 bg-[#22c55e] text-white font-bold text-lg p-4 rounded-xl hover:bg-[#1ea950] transition-colors shadow-md">Continue to Finishes</button>
              </div>
            </div>
          )}

          {/* --- STEP 6: TILES --- */}
          {currentStep === 6 && floorsData[activeFloor] && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl mx-auto">
              
              <div className="mb-8 border-b border-gray-100 pb-6 text-center">
                <h1 className="text-3xl font-bold text-gray-900 flex items-center justify-center gap-3">
                  <span className="text-3xl">✨</span> Flooring & Tiles
                </h1>
              </div>

              {[{ label: 'Hall', key: 'hall' }, { label: 'Kitchen & Dining', key: 'kitchenDining' }, { label: 'Foyer', key: 'foyer' }, ...(floorsData[activeFloor]?.bedrooms || []).map((_: any, i: number) => ({ label: `Bedroom ${i + 1}`, key: `bedroom_${i}` })), ...(floorsData[activeFloor]?.bathrooms || []).map((_: any, i: number) => ({ label: `Bathroom ${i + 1}`, key: `bathroom_${i}` })), { label: 'Bathroom Walls', key: 'bathroomWalls' }, { label: 'Internal Skirting (6in)', key: 'skirting' }].map((room) => (
                <div key={room.key} className="border border-gray-100 p-5 rounded-2xl bg-white shadow-sm flex flex-col md:flex-row md:items-center gap-4 hover:border-gray-200 transition-colors">
                  <h3 className="font-bold text-gray-700 w-40">{room.label}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1">
                    <div className="relative">
                      <select className={selectStyle} value={tiles[room.key]?.size || ''} onChange={(e) => updateTile(room.key, 'size', e.target.value)}>
                        <option value="">Select Size</option>
                        <option value="2x2">2x2 ft</option>
                        <option value="2x4">2x4 ft</option>
                        <option value="1x1">1x1 ft</option>
                        <option value="1x1.5">1x1.5 ft</option>
                        <option value="3x6">3x6 ft</option>
                      </select>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 text-sm">▼</div>
                    </div>
                    <div className="relative">
                      <select className={selectStyle} value={tiles[room.key]?.type || ''} onChange={(e) => updateTile(room.key, 'type', e.target.value)}>
                        <option value="">Select Type</option>
                        <option value="Nano">Nano</option>
                        <option value="Vitrified">Vitrified</option>
                        <option value="Ceramic">Ceramic</option>
                      </select>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 text-sm">▼</div>
                    </div>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">₹</span>
                      <input type="number" inputMode="decimal" min="0" placeholder="Price / Piece" className={`${inputStyle} pl-8 border-[#22c55e]/20 focus:border-[#22c55e]`} value={tiles[room.key]?.price || ''} onChange={(e) => updateTile(room.key, 'price', e.target.value)} />
                    </div>
                  </div>
                </div>
              ))}
              
              <div className="flex gap-4 pt-6">
                <button onClick={() => { setErrorMsg(""); setCurrentStep(5); }} className="w-1/3 border border-gray-200 text-gray-600 p-4 font-semibold rounded-xl hover:bg-gray-50 transition-colors">Back</button>
                <button onClick={() => validateAndProceed(7)} className="w-2/3 bg-gray-900 text-white font-bold text-lg p-4 rounded-xl hover:bg-[#22c55e] transition-colors shadow-md">Continue to Paint</button>
              </div>
            </div>
          )}

          {/* --- STEP 7: PAINT --- */}
          {currentStep === 7 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-2xl mx-auto">
              
              <div className="mb-8 border-b border-gray-100 pb-6 text-center">
                <h1 className="text-3xl font-bold text-gray-900 flex items-center justify-center gap-3">
                  <span className="text-3xl">🎨</span> Paint & Putty
                </h1>
              </div>

              <div className="border border-gray-100 p-6 rounded-3xl bg-white shadow-sm">
                <label className={labelStyle}>Putty (Rate per 40kg Bag)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">₹</span>
                  <input type="number" inputMode="decimal" min="0" placeholder="e.g., 850" className={`${inputStyle} pl-8`} value={paintData.puttyRate} onChange={(e) => setPaintData({ ...paintData, puttyRate: e.target.value })} />
                </div>
              </div>

              <div className="border border-gray-100 p-6 rounded-3xl bg-white shadow-sm space-y-6">
                <div>
                  <label className={labelStyle}>Paint Brand</label>
                  <input type="text" placeholder="e.g., Asian Paints, Berger" className={inputStyle} value={paintData.brand} onChange={(e) => setPaintData({ ...paintData, brand: e.target.value })} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                  <div>
                    <label className={labelStyle}>Interior Paint (Per Liter)</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">₹</span>
                      <input type="number" inputMode="decimal" min="0" className={`${inputStyle} pl-8`} value={paintData.interiorRate} onChange={(e) => setPaintData({ ...paintData, interiorRate: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <label className={labelStyle}>Exterior Paint (Per Liter)</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">₹</span>
                      <input type="number" inputMode="decimal" min="0" className={`${inputStyle} pl-8`} value={paintData.exteriorRate} onChange={(e) => setPaintData({ ...paintData, exteriorRate: e.target.value })} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button onClick={() => { setErrorMsg(""); setCurrentStep(6); }} className="w-1/3 border border-gray-200 text-gray-600 p-4 font-semibold rounded-xl hover:bg-gray-50 transition-colors">Back</button>
                <button onClick={() => validateAndProceed(8)} className="w-2/3 bg-[#22c55e] text-white font-bold text-lg p-4 rounded-xl hover:bg-[#1ea950] transition-colors shadow-md">Continue to Labor</button>
              </div>
            </div>
          )}

          {/* --- STEP 8: LABOR --- */}
          {currentStep === 8 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl mx-auto">
              
              <div className="mb-8 border-b border-gray-100 pb-6 text-center">
                <h1 className="text-3xl font-bold text-gray-900 flex items-center justify-center gap-3">
                  <span className="text-3xl">👷</span> Direct Labor Rates
                </h1>
                <p className="text-gray-500 font-medium mt-2">Enter the contractor/labor rates per square foot.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {['mason', 'painter', 'tiler'].map((type) => (
                  <div key={type} className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm hover:border-[#22c55e] transition-colors group">
                    <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center mb-4 group-hover:bg-green-50 transition-colors text-2xl">
                      {type === 'mason' ? '🧱' : type === 'painter' ? '🖌️' : '📐'}
                    </div>
                    <label className="font-bold text-gray-900 capitalize mb-3 block">{type} Rate</label>
                    <div className="flex border border-gray-200 bg-gray-50 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-[#22c55e]/30 focus-within:border-[#22c55e] transition-all">
                      <span className="flex items-center justify-center px-4 text-gray-400">₹</span>
                      <input type="number" inputMode="decimal" min="0" placeholder="0.00" className="flex-1 py-3 bg-transparent font-semibold text-gray-900 outline-none" value={(laborRates as any)[type]} onChange={(e) => setLaborRates({ ...laborRates, [type]: e.target.value })} />
                      <div className="flex items-center justify-center px-3 bg-gray-200 border-l border-gray-200">
                        <span className="font-bold text-gray-500 text-[10px] uppercase tracking-widest">SQ/FT</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-4 pt-8">
                <button onClick={() => { setErrorMsg(""); setCurrentStep(7); }} className="w-1/3 border border-gray-200 text-gray-600 p-4 font-semibold rounded-xl hover:bg-gray-50 transition-colors">Back</button>
                <button onClick={handleNextFloorCheck} className="w-2/3 bg-gray-900 text-white font-bold text-lg p-4 rounded-xl hover:bg-[#22c55e] transition-colors shadow-md flex items-center justify-center gap-2">
                  {activeFloor < totalFloorsCount - 1 ? "Next Floor Check" : <>Generate BOQ Report <span className="text-xl">✨</span></>}
                </button>
              </div>
            </div>
          )}

          {/* --- STEP 9: FINAL REPORT --- */}
          {currentStep === 9 && boqReport?.floorReports && (
            <div className="animate-in fade-in slide-in-from-bottom-6 duration-700 printable-boq">
              
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 border-b border-gray-100 pb-8 print:border-b-2 print:border-gray-300">
                <div className="flex items-center gap-4 text-left">
                  {userData?.avatar && userData.avatar.length > 5 ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={userData.avatar} alt="Logo" className="w-16 h-16 object-cover rounded-xl border border-gray-200 shadow-sm" />
                  ) : (
                    <span className="text-4xl bg-gray-50 p-3 rounded-xl border border-gray-100">{userData?.avatar || "🏢"}</span>
                  )}
                  <div>
                    <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight uppercase">{userData?.name || "OkiConstruct User"}</h1>
                    <p className="text-gray-500 font-bold tracking-widest text-xs uppercase mt-1">Official Master BOQ • 📞 {userData?.phone || "N/A"}</p>
                  </div>
                </div>
                <div className="mt-4 md:mt-0 text-left md:text-right">
                  <h2 className="text-xl font-bold text-gray-900">{projectName}</h2>
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mt-1">Date: {new Date().toLocaleDateString()}</p>
                </div>
              </div>

              {boqReport?.metrics && (
                <div className="mb-12 print:break-inside-avoid">
                  <h3 className="text-lg font-bold text-gray-900 mb-4 border-l-4 border-[#22c55e] pl-3">Project Measurement Summary</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                      <span className="text-xs font-bold uppercase text-gray-500 block mb-1">Built-Up Area</span>
                      <span className="text-xl font-black text-gray-900">{boqReport.metrics.m_builtUp || 0} <span className="text-sm">SQFT</span></span>
                    </div>
                    <div className="bg-green-50 p-4 rounded-2xl border border-green-100">
                      <span className="text-xs font-bold uppercase text-green-700 block mb-1">Slab Area (incl. {slabOverhang}ft)</span>
                      <span className="text-xl font-black text-[#15803d]">{Math.ceil(boqReport.metrics.m_slab || 0)} <span className="text-sm">SQFT</span></span>
                    </div>
                    <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
                      <span className="text-xs font-bold uppercase text-blue-700 block mb-1">Total Wall Area</span>
                      <span className="text-xl font-black text-blue-800">{Math.ceil(boqReport.metrics.m_wall || 0)} <span className="text-sm">SQFT</span></span>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                      <span className="text-xs font-bold uppercase text-gray-500 block mb-1">Total Openings (Doors+Win)</span>
                      <span className="text-xl font-black text-gray-900">{Math.ceil((boqReport.metrics.m_doors || 0) + (boqReport.metrics.m_windows || 0))} <span className="text-sm">SQFT</span></span>
                    </div>
                    <div className="bg-orange-50 md:col-span-2 p-4 rounded-2xl border border-orange-100">
                      <span className="text-xs font-bold uppercase text-orange-700 block mb-1">Painting Area (Walls x2 + Ceiling + 10%)</span>
                      <span className="text-xl font-black text-orange-800">{Math.ceil(boqReport.metrics.m_paint || 0)} <span className="text-sm">SQFT</span></span>
                    </div>
                  </div>
                </div>
              )}

              {boqReport?.floorReports?.map((floor: any, fIdx: number) => (
                <div key={fIdx} className="space-y-6 print:break-inside-avoid mb-12">
                  <h2 className="text-lg font-bold text-[#15803d] bg-[#22c55e]/10 inline-block px-4 py-2 rounded-xl border border-[#22c55e]/20 print:border-none print:px-0 print:bg-transparent print:text-black print:text-xl">
                    {floor.floorName}
                  </h2>
                  
                  {floor.sections?.map((section: any, idx: number) => (
                    <div key={idx} className="border border-gray-100 rounded-2xl overflow-hidden bg-white shadow-sm print:border-b print:rounded-none print:shadow-none mb-6">
                      <div className="bg-gray-50 p-4 border-b border-gray-100 print:bg-gray-100 print:p-2">
                        <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wider">{section.title}</h3>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[600px] print:min-w-full print:text-sm">
                          <thead>
                            <tr className="border-b border-gray-100 print:border-gray-300">
                              <th className="p-4 font-semibold text-xs text-gray-500 uppercase tracking-wider print:p-2">Material/Service</th>
                              <th className="p-4 font-semibold text-xs text-gray-500 uppercase tracking-wider text-center print:p-2">Unit</th>
                              <th className="p-4 font-semibold text-xs text-gray-500 uppercase tracking-wider text-center print:p-2">Qty</th>
                              <th className="p-4 font-semibold text-xs text-gray-500 uppercase tracking-wider text-right print:p-2">Rate</th>
                              <th className="p-4 font-semibold text-xs text-gray-500 uppercase tracking-wider text-right print:p-2">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {section.items?.map((item: any, i: number) => (
                              <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors print:border-gray-200">
                                <td className="p-4 font-semibold text-sm text-gray-900 print:p-2">{item?.name}</td>
                                <td className="p-4 text-center font-medium text-sm text-gray-500 print:p-2">{item?.unit}</td>
                                <td className="p-4 text-center font-bold text-sm text-[#22c55e] print:p-2 print:text-black">{item?.qty || 0}</td>
                                <td className="p-4 text-right font-medium text-sm text-gray-600 print:p-2">₹{item?.rate || 0}</td>
                                <td className="p-4 text-right font-bold text-sm text-gray-900 print:p-2">₹{Math.ceil((item?.qty || 0) * (item?.rate || 0)).toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-gray-50/50 print:bg-transparent">
                              <td colSpan={4} className="p-4 font-semibold text-xs text-gray-500 uppercase tracking-wider text-right print:p-2">Section Subtotal:</td>
                              <td className="p-4 font-bold text-base text-gray-900 text-right print:p-2">₹{(section?.sectionTotal || 0).toLocaleString()}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              
              <div className="bg-gray-900 text-white p-8 rounded-2xl text-center shadow-lg mt-12 print:shadow-none print:bg-white print:text-black print:border-2 print:border-black print:break-inside-avoid">
                <p className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-2 print:text-gray-600">Total Project Estimate</p>
                <h2 className="text-5xl md:text-6xl font-black text-[#22c55e] print:text-black">
                  ₹ {Math.ceil(boqReport?.grandTotal || 0).toLocaleString()}
                </h2>
              </div>

              <div className="flex flex-col md:flex-row gap-4 print:hidden mt-10">
                {!isSaved ? (
                  <>
                    <button onClick={() => setCurrentStep(8)} className="flex-1 border border-gray-200 text-gray-600 p-4 font-semibold rounded-xl hover:bg-gray-50 transition-colors">Edit Data</button>
                    <button onClick={() => window.print()} className="flex-[2] bg-white border border-gray-200 text-gray-900 p-4 font-bold rounded-xl hover:bg-gray-50 transition-colors shadow-sm flex items-center justify-center gap-2">Print / PDF</button>
                    <button onClick={saveEstimateToDatabase} disabled={isSaving} className="flex-[2] bg-[#22c55e] text-white p-4 font-bold rounded-xl hover:bg-[#1ea950] transition-colors shadow-md disabled:opacity-50">
                      {isSaving ? "Syncing..." : "Save to Workspace ☁️"}
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => window.print()} className="flex-[2] bg-white border border-gray-200 text-gray-900 p-4 font-bold rounded-xl hover:bg-gray-50 transition-colors shadow-sm">Print / PDF</button>
                    <button onClick={() => router.push('/')} className="flex-[2] bg-gray-900 text-white p-4 font-bold rounded-xl hover:bg-[#22c55e] transition-colors shadow-md">Exit to Home ➔</button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}