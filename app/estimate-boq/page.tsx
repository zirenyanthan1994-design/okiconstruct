"use client";
import { useState, useEffect } from 'react';

// --- CLOUD ENGINE IMPORTS ---
import { auth, db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, doc, getDoc, query, where, getDocs } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import Navbar from '../components/Navbar';

export default function Estimator() {
  // ==========================================
  // PART 1: STATE MANAGEMENT
  // ==========================================
  const [userData, setUserData] = useState<any>(null);
  const [projectName, setProjectName] = useState(""); 
  const [currentStep, setCurrentStep] = useState(0); 
  const [activeFloor, setActiveFloor] = useState(0);
  const [totalFloorsCount, setTotalFloorsCount] = useState(1);
  const [isAskingCopy, setIsAskingCopy] = useState(false);
  
  const [slabOverhang, setSlabOverhang] = useState("2"); 
  const [copyColumnHeight, setCopyColumnHeight] = useState("10");
  const [floorSnapshots, setFloorSnapshots] = useState<any[]>([]);

  const [hasStairs, setHasStairs] = useState(false);
  const [stairsDim, setStairsDim] = useState({ l: '', w: '' });
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
      
      // --- NEW VALIDATION: Prevent Duplicate Project Names ---
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
        grandTotal: boqReport.grandTotal || 0,
        boqData: cleanData, 
        createdAt: serverTimestamp(),
      };
      await addDoc(collection(db, "boq_projects"), payload);
      setIsSaved(true); 
      alert("Success! Estimate securely saved to the cloud.");
    } catch (error: any) {
      alert("Database Error: " + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const [structure, setStructure] = useState({
    footing: { count: '', l: '', w: '', depth: '' },
    column: { height: '10', l: '', w: '' },
    plinthBeam: { l: '', w: '' },
    roofBeam: { l: '', w: '' }
  });

  const [floorsData, setFloorsData] = useState([
    {
      floorName: "Ground Floor",
      hall: { l: '', w: '' }, kitchen: { l: '', w: '' }, dining: { l: '', w: '' }, foyer: { l: '', w: '' },
      bedrooms: [{ id: Date.now(), l: '', w: '' }],
      bathrooms: [{ id: Date.now() + 1, l: '', w: '', isAttached: false, layoutType: 'outside' }],
      slabArea: ''
    }
  ]);

  const [openings, setOpenings] = useState({
    mainDoor: { count: '1', h: '', w: '' },
    doors: [{ id: Date.now(), count: '', h: '', w: '' }],
    windows: [{ id: Date.now() + 1, count: '', h: '', w: '' }],
    ventilations: [{ id: Date.now() + 2, count: '', h: '', w: '' }]
  });

  const [rates, setRates] = useState({
    tmt: { "8mm": '', "10mm": '', "12mm": '', "16mm": '', "20mm": '', "25mm": '' },
    cement: '', sand: '', gravel: '', boulder: '', bricks: '',
    windowMaterial: 'Aluminum Profile', windowRate: '',
    mainDoorPrice: '', internalDoorPrice: '', doorFramePrice: '' 
  });

  const [tiles, setTiles] = useState<Record<string, { size: string; type: string; price: string }>>({});
  const [paintData, setPaintData] = useState({ puttyRate: '', brand: '', interiorRate: '', exteriorRate: '' });
  const [laborRates, setLaborRates] = useState({ mason: '', painter: '', tiler: '' });
  const [boqReport, setBoqReport] = useState<any>(null);

  // ==========================================
  // PART 2: THE VALIDATION GATEKEEPER
  // ==========================================
  const validateAndProceed = (targetStep: number) => {
    setErrorMsg("");
    let isValid = true;
    const isVal = (v: any) => Number(v) > 0;

    // Structure Validation (Now Step 2)
    if (currentStep === 2) {
      if (!isVal(structure.column.height) || !isVal(structure.column.l) || !isVal(structure.column.w)) isValid = false;
      if (!isVal(structure.roofBeam.l) || !isVal(structure.roofBeam.w)) isValid = false;
      if (activeFloor === 0) {
        if (!isVal(structure.footing.count) || !isVal(structure.footing.l) || !isVal(structure.footing.w) || !isVal(structure.footing.depth)) isValid = false;
        if (!isVal(structure.plinthBeam.l) || !isVal(structure.plinthBeam.w)) isValid = false;
      }
      if (!isValid) return setErrorMsg("Please ensure all structural dimensions are filled out.");
    }

    // Layout Validation (Now Step 3)
    if (currentStep === 3) {
      const f = floorsData[activeFloor];
      if (!isVal(f.hall.l) || !isVal(f.hall.w) || !isVal(f.kitchen.l) || !isVal(f.kitchen.w)) isValid = false;
      f.bedrooms.forEach(b => { if (!isVal(b.l) || !isVal(b.w)) isValid = false; });
      f.bathrooms.forEach(b => { if (!isVal(b.l) || !isVal(b.w)) isValid = false; });
      if (hasStairs && (!isVal(stairsDim.l) || !isVal(stairsDim.w))) isValid = false;
      if (!isValid) return setErrorMsg("Please fill in all room dimensions with valid numbers.");
    }

    // Material Rates Validation
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

  // ==========================================
  // PART 3: SNAPSHOT & COPY ENGINE
  // ==========================================
  const buildCurrentSnapshot = (floorIndex: number) => {
    return {
      floorName: floorsData[floorIndex].floorName,
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
    processBOQ(finalSnaps);
  };

  const handleCopyChoice = (choice: 'yes' | 'no') => {
    if (choice === 'yes') {
      executeProcessBOQ('copy-all');
    } else {
      setFloorSnapshots(prev => [...prev, buildCurrentSnapshot(activeFloor)]);
      const nextIdx = activeFloor + 1;
      const floorLabel = nextIdx === 1 ? "1st Floor" : nextIdx === 2 ? "2nd Floor" : nextIdx === 3 ? "3rd Floor" : `${nextIdx}th Floor`;

      setFloorsData(prev => [...prev, {
        floorName: floorLabel,
        hall: { l: '', w: '' }, kitchen: { l: '', w: '' }, dining: { l: '', w: '' }, foyer: { l: '', w: '' },
        bedrooms: [{ id: Date.now(), l: '', w: '' }],
        bathrooms: [{ id: Date.now() + 1, l: '', w: '', isAttached: false, layoutType: 'outside' }],
        slabArea: ''
      }]);
      setActiveFloor(nextIdx);
      setIsAskingCopy(false);
      
      setStructure({...structure, column: {...structure.column, height: copyColumnHeight}});
      setCurrentStep(2); // Goes back to Structure for the new floor
      window.scrollTo(0,0);
    }
  };

  const addBedroom = () => {
    const newData = [...floorsData];
    newData[activeFloor].bedrooms.push({ id: Date.now(), l: '', w: '' });
    setFloorsData(newData);
  };

  const addBathroom = () => {
    const newData = [...floorsData];
    newData[activeFloor].bathrooms.push({ id: Date.now() + 1, l: '', w: '', isAttached: false, layoutType: 'outside' });
    setFloorsData(newData);
  };

  const updateTile = (roomKey: string, field: 'size' | 'type' | 'price', value: string) => {
    setTiles(prev => ({ ...prev, [roomKey]: { ...(prev[roomKey] || { size: '', type: '', price: '' }), [field]: value } }));
  };

  const getRoomArea = (room: { l: string; w: string }) => (Number(room.l) || 0) * (Number(room.w) || 0);
  const getRoomPerimeter = (room: { l: string; w: string }) => ((Number(room.l) || 0) + (Number(room.w) || 0)) * 2;

  const calculateFloorArea = (index: number) => {
    const f = floorsData[index];
    const staticRooms = getRoomArea(f.hall) + getRoomArea(f.kitchen) + getRoomArea(f.dining) + getRoomArea(f.foyer);
    const dynamicBedrooms = f.bedrooms.reduce((sum, r) => sum + getRoomArea(r), 0);
    const dynamicBaths = f.bathrooms.reduce((sum, r) => sum + (r.isAttached && r.layoutType === 'inside' ? 0 : getRoomArea(r)), 0);
    const stairsArea = hasStairs ? (Number(stairsDim.l) * Number(stairsDim.w) || 0) : 0;
    return staticRooms + dynamicBedrooms + dynamicBaths + stairsArea;
  };

  const calculateTotalPerimeter = (index: number) => {
    const f = floorsData[index];
    const staticPeri = getRoomPerimeter(f.hall) + getRoomPerimeter(f.kitchen) + getRoomPerimeter(f.dining) + getRoomPerimeter(f.foyer);
    const dynamicBedrooms = f.bedrooms.reduce((sum, r) => sum + getRoomPerimeter(r), 0);
    const dynamicBaths = f.bathrooms.reduce((sum, r) => sum + (r.isAttached && r.layoutType === 'inside' ? 0 : getRoomPerimeter(r)), 0);
    return staticPeri + dynamicBedrooms + dynamicBaths;
  };

  // ==========================================
  // PART 4: MASTER CALCULATION ENGINE
  // ==========================================
  const processBOQ = (finalSnaps: any[]) => {
    try {
      const defaultSettings = {
        ratios: { pcc: { c: 1, s: 3, g: 6 }, slab: { c: 1, s: 2, g: 4 }, footing: { c: 1, s: 2, g: 4 }, plinthBeam: { c: 1, s: 2, g: 4 }, beam: { c: 1, s: 1.5, g: 3 }, column: { c: 1, s: 1.5, g: 3 }, mortar: { c: 1, s: 4, g: 0 }, tileBedding: { c: 1, s: 4, g: 0 } },
        tmtSpecs: { '8mm': { length: 40, weight: 4.74 }, '10mm': { length: 40, weight: 7.40 }, '12mm': { length: 40, weight: 10.66 }, '16mm': { length: 40, weight: 18.96 }, '20mm': { length: 40, weight: 29.60 }, '25mm': { length: 40, weight: 46.20 } },
        dimensions: { slabThickness: 5, meshGap: 4, ringSpacing: 5 },
        percentages: { materialWastage: 7, slabExtraConcrete: 30, electrical: 8, plumbing: 6, misc: 3, logistics: 15, contingency: 5 }, 
        consumption: { puttyCoverage: 10, bricksPerSqft: 5, plasterCftPerSqft: 0.08, brickJoiningCftPerSqft: 0.05, tileBeddingCftPerSqft: 0.15 } 
      };

      let masterSettings = defaultSettings;
      const savedAdmin = localStorage.getItem("OkiConstruct_settings");
      if (savedAdmin) {
        const parsed = JSON.parse(savedAdmin);
        masterSettings = {
          ratios: { ...defaultSettings.ratios, ...(parsed.ratios || {}) },
          tmtSpecs: { ...defaultSettings.tmtSpecs, ...(parsed.tmtSpecs || {}) },
          dimensions: { ...defaultSettings.dimensions, ...(parsed.dimensions || {}) },
          percentages: { ...defaultSettings.percentages, ...(parsed.percentages || {}) },
          consumption: { ...defaultSettings.consumption, ...(parsed.consumption || {}) }
        };
      }

      const safeRates = rates as any;
      const getWeight = (size: string, totalFeet: number, wFactor: number) => {
        const spec = (masterSettings.tmtSpecs as any)[size];
        return spec ? (totalFeet / spec.length) * spec.weight * wFactor : 0;
      };

      const calculateConcrete = (wetVolCft: number, ratio: any, customWastage?: number) => {
        const wastageFactor = customWastage ? (1 + (customWastage / 100)) : (1 + (masterSettings.percentages.materialWastage / 100));
        const dryVol = wetVolCft * 1.54;
        const totalParts = ratio.c + ratio.s + ratio.g;
        return {
          cement: Math.ceil(((ratio.c / totalParts) * dryVol / 1.25) * wastageFactor),
          sand: Math.ceil((ratio.s / totalParts) * dryVol * wastageFactor),
          gravel: Math.ceil((ratio.g / totalParts) * dryVol * wastageFactor)
        };
      };

      let profile = { main: { s: '16mm', c: 4 }, extra: null as { s: string, c: number } | null };
      if (totalFloorsCount >= 2 && totalFloorsCount <= 3) profile.extra = { s: '12mm', c: 2 };
      else if (totalFloorsCount >= 4 && totalFloorsCount <= 5) profile.extra = { s: '12mm', c: 4 };
      else if (totalFloorsCount >= 6 && totalFloorsCount <= 7) { profile.main = { s: '20mm', c: 4 }; profile.extra = { s: '16mm', c: 4 }; }
      else if (totalFloorsCount >= 8) { profile.main = { s: '20mm', c: 4 }; profile.extra = { s: '16mm', c: 6 }; }

      const standardWFactor = 1 + (masterSettings.percentages.materialWastage / 100);

      let m_builtUp = 0, m_slab = 0, m_wall = 0, m_doors = 0, m_windows = 0, m_paint = 0;

      const floorReports = finalSnaps.map((snap: any, idx: number) => {
        const currentLayout = snap.layout;
        const currentStructure = snap.structure;
        const currentOpenings = snap.openings;
        const currentTiles = snap.tiles;
        const currentPaintData = snap.paintData;
        const currentLaborRates = snap.laborRates;
        const currentHasStairs = snap.hasStairs;
        const currentStairsDim = snap.stairsDim;

        const sections: any[] = [];
        let floorBaseCost = 0; 

        const staticRoomsArea = getRoomArea(currentLayout.hall) + getRoomArea(currentLayout.kitchen) + getRoomArea(currentLayout.dining) + getRoomArea(currentLayout.foyer);
        const dynamicBedroomsArea = currentLayout.bedrooms.reduce((sum: number, r: any) => sum + getRoomArea(r), 0);
        const dynamicBathsArea = currentLayout.bathrooms.reduce((sum: number, r: any) => sum + (r.isAttached && r.layoutType === 'inside' ? 0 : getRoomArea(r)), 0);
        const stairsArea = currentHasStairs ? (Number(currentStairsDim.l) * Number(currentStairsDim.w) || 0) : 0;
        const layoutArea = staticRoomsArea + dynamicBedroomsArea + dynamicBathsArea + stairsArea;

        const staticPeri = getRoomPerimeter(currentLayout.hall) + getRoomPerimeter(currentLayout.kitchen) + getRoomPerimeter(currentLayout.dining) + getRoomPerimeter(currentLayout.foyer);
        const dynamicBedroomsPeri = currentLayout.bedrooms.reduce((sum: number, r: any) => sum + getRoomPerimeter(r), 0);
        const dynamicBathsPeri = currentLayout.bathrooms.reduce((sum: number, r: any) => sum + (r.isAttached && r.layoutType === 'inside' ? 0 : getRoomPerimeter(r)), 0);
        const layoutPerimeter = staticPeri + dynamicBedroomsPeri + dynamicBathsPeri;

        const overhang = Number(slabOverhang) || 0;
        const baseSide = Math.sqrt(layoutArea);
        const slabSide = baseSide + overhang;
        const adjustedSlabArea = Math.pow(slabSide, 2);
        
        const plinthPerimeter = baseSide * 4;
        const roofPerimeter = slabSide * 4;

        const colCount = Number(currentStructure.footing.count) || Math.ceil(layoutArea / 100);
        const colHt = Number(currentStructure.column.height) || 10;
        const colLIn = Number(currentStructure.column.l) || 12;
        const colWIn = Number(currentStructure.column.w) || 12;
        const calculateRingFt = (l: number, w: number) => (((l - 3) + (w - 3)) * 2) / 12;

        const addSection = (title: string, items: any[]) => {
          const sectionTotal = items.reduce((sum, item) => sum + (Math.ceil((item.qty || 0) * (item.rate || 0))), 0);
          sections.push({ title, items, sectionTotal });
          floorBaseCost += sectionTotal;
        };

        if (idx === 0) {
          const fL = Number(currentStructure.footing.l) || 4;
          const fW = Number(currentStructure.footing.w) || 4;
          const depth = Number(currentStructure.footing.depth) || 4;
          
          const boulderCft = colCount * (fL * fW * (6/12));
          const pccConc = calculateConcrete(colCount * (fL * fW * (2/12)), masterSettings.ratios.pcc);
          const footingConc = calculateConcrete(colCount * (fL * fW * depth), masterSettings.ratios.footing);
          const starterHt = 1 + depth + (Number(currentStructure.plinthBeam.l) / 12);

          const meshBarsL = (fW / 0.5) + 1;
          const meshBarsW = (fL / 0.5) + 1;
          const totalMeshFtPerFooting = (meshBarsL * fL) + (meshBarsW * fW);
          const grandTotalMeshFt = totalMeshFtPerFooting * colCount;
          const starterRingsQty = (starterHt * 12 / masterSettings.dimensions.ringSpacing) * colCount;

          addSection("1. Footing & Foundation", [
            { name: "Boulder Fill (6in)", qty: Math.ceil(boulderCft), unit: "CFT", rate: safeRates.boulder || 0 },
            { name: "PCC Cement", qty: pccConc.cement, unit: "BAG", rate: safeRates.cement || 0 },
            { name: "PCC Sand", qty: pccConc.sand, unit: "CFT", rate: safeRates.sand || 0 },
            { name: "PCC Gravel", qty: pccConc.gravel, unit: "CFT", rate: safeRates.gravel || 0 },
            { name: "Footing Cement", qty: footingConc.cement, unit: "BAG", rate: safeRates.cement || 0 },
            { name: "Footing Sand", qty: footingConc.sand, unit: "CFT", rate: safeRates.sand || 0 },
            { name: "Footing Gravel", qty: footingConc.gravel, unit: "CFT", rate: safeRates.gravel || 0 },
            { name: "TMT Jali/Mesh (10mm)", qty: Math.ceil(getWeight('10mm', grandTotalMeshFt, standardWFactor)), unit: "KG", rate: safeRates.tmt['10mm'] || 0 },
            { name: `Starter Main (${profile.main.s})`, qty: Math.ceil(getWeight(profile.main.s, starterHt * colCount * profile.main.c, standardWFactor)), unit: "KG", rate: safeRates.tmt[profile.main.s] || 0 },
            { name: "Starter Rings (8mm)", qty: Math.ceil(getWeight('8mm', starterRingsQty * calculateRingFt(colLIn, colWIn), standardWFactor)), unit: "KG", rate: safeRates.tmt['8mm'] || 0 }
          ]);

          const plL = Number(currentStructure.plinthBeam.l) || 12;
          const plW = Number(currentStructure.plinthBeam.w) || 12;
          const plConc = calculateConcrete(plinthPerimeter * (plL / 12 * plW / 12), masterSettings.ratios.plinthBeam);
          const plRings = (plinthPerimeter * 12) / masterSettings.dimensions.ringSpacing;

          addSection("2. Plinth Beams", [
            { name: "Cement", qty: plConc.cement, unit: "BAG", rate: safeRates.cement || 0 },
            { name: "Sand", qty: plConc.sand, unit: "CFT", rate: safeRates.sand || 0 },
            { name: "Gravel", qty: plConc.gravel, unit: "CFT", rate: safeRates.gravel || 0 },
            { name: `TMT Main (${profile.main.s})`, qty: Math.ceil(getWeight(profile.main.s, plinthPerimeter * profile.main.c, standardWFactor)), unit: "KG", rate: safeRates.tmt[profile.main.s] || 0 },
            { name: "TMT Rings (8mm)", qty: Math.ceil(getWeight('8mm', plRings * calculateRingFt(plL, plW), standardWFactor)), unit: "KG", rate: safeRates.tmt['8mm'] || 0 }
          ]);
        }

        const rL = Number(currentStructure.roofBeam.l) || 12;
        const rW = Number(currentStructure.roofBeam.w) || 12;
        const roofConc = calculateConcrete(roofPerimeter * (rL / 12 * rW / 12), masterSettings.ratios.beam);
        const roofRings = (roofPerimeter * 12) / masterSettings.dimensions.ringSpacing;

        addSection("3. Roof Beams", [
          { name: "Cement", qty: roofConc.cement, unit: "BAG", rate: safeRates.cement || 0 },
          { name: "Sand", qty: roofConc.sand, unit: "CFT", rate: safeRates.sand || 0 },
          { name: "Gravel", qty: roofConc.gravel, unit: "CFT", rate: safeRates.gravel || 0 },
          { name: `TMT Main (${profile.main.s})`, qty: Math.ceil(getWeight(profile.main.s, roofPerimeter * profile.main.c, standardWFactor)), unit: "KG", rate: safeRates.tmt[profile.main.s] || 0 },
          { name: "TMT Rings (8mm)", qty: Math.ceil(getWeight('8mm', roofRings * calculateRingFt(rL, rW), standardWFactor)), unit: "KG", rate: safeRates.tmt['8mm'] || 0 }
        ]);

        const colConc = calculateConcrete((colLIn / 12 * colWIn / 12 * colHt) * colCount, masterSettings.ratios.column);
        const colRings = (colHt * 12 / masterSettings.dimensions.ringSpacing) * colCount;

        addSection("4. Columns", [
          { name: "Cement", qty: colConc.cement, unit: "BAG", rate: safeRates.cement || 0 },
          { name: "Sand", qty: colConc.sand, unit: "CFT", rate: safeRates.sand || 0 },
          { name: "Gravel", qty: colConc.gravel, unit: "CFT", rate: safeRates.gravel || 0 },
          { name: `TMT Main (${profile.main.s})`, qty: Math.ceil(getWeight(profile.main.s, colCount * colHt * profile.main.c, standardWFactor)), unit: "KG", rate: safeRates.tmt[profile.main.s] || 0 },
          { name: "TMT Rings (8mm)", qty: Math.ceil(getWeight('8mm', colRings * calculateRingFt(colLIn, colWIn), standardWFactor)), unit: "KG", rate: safeRates.tmt['8mm'] || 0 }
        ]);

        const pieces = (slabSide * 12) / masterSettings.dimensions.meshGap;
        const totalSlabSteelFt = (pieces * slabSide) + (pieces * slabSide);

        const slabConc = calculateConcrete(adjustedSlabArea * (masterSettings.dimensions.slabThickness / 12), masterSettings.ratios.slab, masterSettings.percentages.slabExtraConcrete);
        
        addSection("5. Roof Slab", [
          { name: "Cement", qty: slabConc.cement, unit: "BAG", rate: safeRates.cement || 0 },
          { name: "Sand", qty: slabConc.sand, unit: "CFT", rate: safeRates.sand || 0 },
          { name: "Gravel", qty: slabConc.gravel, unit: "CFT", rate: safeRates.gravel || 0 },
          { name: "TMT Slab (10mm)", qty: Math.ceil(getWeight('10mm', totalSlabSteelFt, standardWFactor)), unit: "KG", rate: safeRates.tmt['10mm'] || 0 }
        ]);

        if (currentHasStairs && Number(currentStairsDim.w) > 0 && Number(currentStairsDim.l) > 3) {
          const sW = Number(currentStairsDim.w);
          const sL = Number(currentStairsDim.l);
          const flightWidth = sW / 2;
          const landingL = 3;
          const flightHeight = colHt / 2;
          const riserFt = 5 / 12; 

          const stepsPerFlight = Math.ceil(flightHeight / riserFt);
          const flightHorizontalLength = sL - landingL;
          const treadFt = flightHorizontalLength / (stepsPerFlight - 1);
          const inclinedLength = Math.sqrt(Math.pow(flightHorizontalLength, 2) + Math.pow(flightHeight, 2));
          const slabThickFt = masterSettings.dimensions.slabThickness / 12;

          const totalStairsCft = (sW * landingL * slabThickFt) + (2 * (inclinedLength * flightWidth * slabThickFt)) + (2 * (stepsPerFlight * (0.5 * riserFt * treadFt * flightWidth)));
          const stairsConc = calculateConcrete(totalStairsCft, masterSettings.ratios.slab, masterSettings.percentages.slabExtraConcrete);

          const totalStairArea = (sW * landingL) + (2 * (inclinedLength * flightWidth));
          const stairSteelFt = totalStairArea * 2 * (12 / masterSettings.dimensions.meshGap);

          addSection("Staircase Structure", [
            { name: "Stair Cement", qty: stairsConc.cement, unit: "BAG", rate: safeRates.cement || 0 },
            { name: "Stair Sand", qty: stairsConc.sand, unit: "CFT", rate: safeRates.sand || 0 },
            { name: "Stair Gravel", qty: stairsConc.gravel, unit: "CFT", rate: safeRates.gravel || 0 },
            { name: "Stair Mesh (10mm)", qty: Math.ceil(getWeight('10mm', stairSteelFt, standardWFactor)), unit: "KG", rate: safeRates.tmt['10mm'] || 0 }
          ]);
        }

        const grossWallArea = layoutPerimeter * colHt;
        const mainDoorArea = Number(currentOpenings.mainDoor.h || 0) * Number(currentOpenings.mainDoor.w || 0) * Number(currentOpenings.mainDoor.count || 0);
        const internalDoorsArea = currentOpenings.doors.reduce((sum: number, d: any) => sum + (Number(d.h||0) * Number(d.w||0) * Number(d.count||0)), 0);
        const windowsArea = currentOpenings.windows.reduce((sum: number, w: any) => sum + (Number(w.h||0) * Number(w.w||0) * Number(w.count||0)), 0);
        const ventArea = currentOpenings.ventilations.reduce((sum: number, v: any) => sum + (Number(v.h||0) * Number(v.w||0) * Number(v.count||0)), 0);
        
        const netWallArea = Math.max(0, grossWallArea - (mainDoorArea + internalDoorsArea + windowsArea + ventArea));
        const estimatedBricks = Math.ceil(netWallArea * masterSettings.consumption.bricksPerSqft);
        const totalMortarVolCft = (netWallArea * masterSettings.consumption.plasterCftPerSqft * 2) + (netWallArea * (masterSettings.consumption.brickJoiningCftPerSqft || 0.05));
        const masonryConc = calculateConcrete(totalMortarVolCft, masterSettings.ratios.mortar);

        const floorPaintArea = ((netWallArea * 2) + layoutArea) * 1.10;

        m_builtUp += layoutArea;
        m_slab += adjustedSlabArea;
        m_wall += netWallArea;
        m_doors += (mainDoorArea + internalDoorsArea);
        m_windows += (windowsArea + ventArea);
        m_paint += floorPaintArea;

        addSection("6. Masonry, Joining & Plastering", [
          { name: "Bricks (Accurate Area)", qty: estimatedBricks, unit: "NOS", rate: safeRates.bricks || 0 },
          { name: "Mortar/Plaster Cement", qty: masonryConc.cement, unit: "BAG", rate: safeRates.cement || 0 },
          { name: "Mortar/Plaster Sand", qty: masonryConc.sand, unit: "CFT", rate: safeRates.sand || 0 }
        ]);

        const doorsWindowsItems = [];
        if (Number(currentOpenings.mainDoor.count) > 0) doorsWindowsItems.push({ name: "Main Door", qty: Number(currentOpenings.mainDoor.count), unit: "NOS", rate: Number(safeRates.mainDoorPrice) || 0 });
        
        let internalDoorQty = currentOpenings.doors.reduce((sum: number, d: any) => sum + Number(d.count || 0), 0);
        if (internalDoorQty > 0) doorsWindowsItems.push({ name: "Internal Doors", qty: internalDoorQty, unit: "NOS", rate: Number(safeRates.internalDoorPrice) || 0 });
        
        // --- NEW LOGIC: Add Door Frames ---
        if (internalDoorQty > 0 && Number(safeRates.doorFramePrice) > 0) {
          doorsWindowsItems.push({ name: "Internal Door Frames", qty: internalDoorQty, unit: "NOS", rate: Number(safeRates.doorFramePrice) });
        }
        
        if (windowsArea > 0) doorsWindowsItems.push({ name: `Windows (${safeRates.windowMaterial})`, qty: windowsArea, unit: "SQFT", rate: Number(safeRates.windowRate) || 0 });
        if (ventArea > 0) doorsWindowsItems.push({ name: "Ventilations", qty: ventArea, unit: "SQFT", rate: Number(safeRates.windowRate) || 0 });
        if (doorsWindowsItems.length > 0) addSection("7. Doors & Windows", doorsWindowsItems);

        const tileItems = [];
        const rooms = [
          { key: 'hall', area: getRoomArea(currentLayout.hall), label: 'Hall' },
          { key: 'kitchen', area: getRoomArea(currentLayout.kitchen), label: 'Kitchen' },
          { key: 'dining', area: getRoomArea(currentLayout.dining), label: 'Dining' },
          { key: 'foyer', area: getRoomArea(currentLayout.foyer), label: 'Foyer' },
          ...currentLayout.bedrooms.map((r: any, i: number) => ({ key: `bedroom_${i}`, area: getRoomArea(r), label: `Bedroom ${i+1}` })),
          ...currentLayout.bathrooms.map((r: any, i: number) => ({ key: `bathroom_${i}`, area: getRoomArea(r), label: `Bathroom ${i+1}` }))
        ];
        
        let totalTileArea = 0;
        rooms.forEach(r => {
          const t = currentTiles[r.key];
          if (t && Number(t.price) > 0 && r.area > 0) {
            totalTileArea += r.area;
            tileItems.push({ name: `${r.label} Tiles (${t.type || 'Standard'})`, qty: r.area, unit: "SQFT", rate: Number(t.price) });
          }
        });

        if (totalTileArea > 0) {
            const beddingConc = calculateConcrete(totalTileArea * masterSettings.consumption.tileBeddingCftPerSqft, masterSettings.ratios.tileBedding);
            tileItems.push({ name: "Bedding Cement", qty: beddingConc.cement, unit: "BAG", rate: safeRates.cement || 0 });
            tileItems.push({ name: "Bedding Sand", qty: beddingConc.sand, unit: "CFT", rate: safeRates.sand || 0 });
        }
        if (tileItems.length > 0) addSection("8. Flooring & Tiles", tileItems);

        const puttyBags = Math.ceil((floorPaintArea / masterSettings.consumption.puttyCoverage) / 40);
        const exteriorWallArea = roofPerimeter * colHt;

        addSection("9. Painting Material", [
          { name: "Wall Putty (40kg Bag)", qty: puttyBags, unit: "BAG", rate: Number(currentPaintData.puttyRate) || 0 },
          { name: `Interior Paint (${currentPaintData.brand || 'Standard'})`, qty: Math.ceil(floorPaintArea / 100), unit: "LITER", rate: Number(currentPaintData.interiorRate) || 0 },
          { name: `Exterior Paint (${currentPaintData.brand || 'Standard'})`, qty: Math.ceil(exteriorWallArea / 60), unit: "LITER", rate: Number(currentPaintData.exteriorRate) || 0 }
        ]);

        const percentageRateMultiplier = (floorBaseCost + (adjustedSlabArea * Number(currentLaborRates.mason || 0)) + (layoutArea * Number(currentLaborRates.tiler || 0)) + ((netWallArea + exteriorWallArea) * Number(currentLaborRates.painter || 0))) / 100;

        addSection("10. Master Labor & Services", [
          { name: "Mason Labor", qty: Math.ceil(adjustedSlabArea), unit: "SQFT (SLAB)", rate: Number(currentLaborRates.mason) || 0 },
          { name: "Tile Labor", qty: Math.ceil(layoutArea), unit: "SQFT (FLOOR)", rate: Number(currentLaborRates.tiler) || 0 },
          { name: "Painter Labor", qty: Math.ceil(floorPaintArea + exteriorWallArea), unit: "SQFT", rate: Number(currentLaborRates.painter) || 0 },
          { name: "Electrical System", qty: Number(masterSettings.percentages.electrical || 8), unit: "%", rate: Math.ceil(percentageRateMultiplier) },
          { name: "Plumbing & Sanitary", qty: Number(masterSettings.percentages.plumbing || 6), unit: "%", rate: Math.ceil(percentageRateMultiplier) },
          { name: "Miscellaneous", qty: Number(masterSettings.percentages.misc || 3), unit: "%", rate: Math.ceil(percentageRateMultiplier) }
        ]);

        return { floorName: snap.floorName, sections, layoutArea, adjustedSlabArea, floorTotal: floorBaseCost };
      });

      setBoqReport({
        floorReports,
        grandTotal: floorReports.reduce((sum: number, f: any) => sum + f.floorTotal, 0),
        metrics: { m_builtUp, m_slab, m_wall, m_doors, m_windows, m_paint }
      });
      setCurrentStep(9);
    } catch (err) {
      console.error("Calculation Error:", err);
    }
  };

  // ==========================================
  // PART 5: PREMIUM RENDER UI
  // ==========================================
  
  const inputStyle = "w-full border border-gray-200 bg-gray-50 rounded-xl p-4 text-gray-900 font-medium focus:bg-white focus:ring-2 focus:ring-[#22c55e]/30 focus:border-[#22c55e] transition-all outline-none";
  const selectStyle = "w-full border border-gray-200 bg-gray-50 rounded-xl p-4 text-gray-900 font-medium focus:bg-white focus:ring-2 focus:ring-[#22c55e]/30 focus:border-[#22c55e] transition-all outline-none cursor-pointer appearance-none";
  const labelStyle = "text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block";
  
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      <Navbar />
      <main className="max-w-5xl mx-auto w-full p-4 md:p-8 mt-4 pb-24 print:p-0 print:mt-0 print:max-w-none">
        
        {currentStep < 9 && (
          <div className="mb-10 animate-in fade-in duration-500 print:hidden">
            <div className="flex items-center justify-between text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
              <span className={currentStep >= 0 ? "text-[#22c55e]" : ""}>Setup</span>
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

          {currentStep === 0 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="text-center max-w-lg mx-auto mb-10">
                <div className="w-16 h-16 bg-green-50 text-[#22c55e] rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl">📝</div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Name Your Project</h1>
                <p className="text-gray-500 font-medium">Give this estimate a clear name so you can easily track it in your expenses later.</p>
              </div>

              <div className="max-w-xl mx-auto">
                <label className={labelStyle}>Project Name</label>
                <input 
                  type="text" 
                  placeholder="e.g., Skyline Villa Construction" 
                  className={inputStyle} 
                  value={projectName} 
                  onChange={(e) => setProjectName(e.target.value)} 
                />
                
                <button 
                  onClick={() => {
                    if (!projectName.trim()) return setErrorMsg("Please enter a project name to continue.");
                    setErrorMsg("");
                    setCurrentStep(1);
                  }} 
                  className="w-full bg-gray-900 text-white font-semibold text-lg p-4 rounded-xl mt-8 hover:bg-[#22c55e] transition-colors shadow-md flex items-center justify-center gap-2"
                >
                  Start Estimate <span className="text-xl">➔</span>
                </button>
              </div>
            </div>
          )}

          {currentStep === 1 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-2xl mx-auto">
              <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                  <span className="text-3xl">🏗️</span> Foundation Design
                </h1>
                <p className="text-gray-500 font-medium mt-2">Select the total structural load for your building.</p>
              </div>

              <div>
                <label className={labelStyle}>Total Floors</label>
                <div className="relative">
                  <select className={selectStyle} onChange={(e) => {
                    const count = e.target.value === 'G' ? 1 : parseInt(e.target.value.replace('G+', '')) + 1;
                    setTotalFloorsCount(count);
                    setHasStairs(count > 1);
                  }}>
                    <option value="G">Ground Floor Only</option>
                    {Array.from({ length: 9 }, (_, i) => (
                      <option key={i + 1} value={`G+${i + 1}`}>G + {i + 1} Floor</option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">▼</div>
                </div>
              </div>
              
              {totalFloorsCount === 1 && (
                <div className="p-6 border border-gray-100 bg-gray-50 rounded-2xl">
                  <label className={labelStyle}>Is there a stairs provision?</label>
                  <div className="flex gap-4 mt-3">
                    <button onClick={() => setHasStairs(false)} className={`flex-1 p-3 rounded-xl font-semibold transition-all border ${!hasStairs ? 'bg-white border-[#22c55e] text-[#22c55e] shadow-sm ring-2 ring-[#22c55e]/20' : 'bg-transparent border-gray-200 text-gray-600 hover:bg-white'}`}>No Stairs</button>
                    <button onClick={() => setHasStairs(true)} className={`flex-1 p-3 rounded-xl font-semibold transition-all border ${hasStairs ? 'bg-white border-[#22c55e] text-[#22c55e] shadow-sm ring-2 ring-[#22c55e]/20' : 'bg-transparent border-gray-200 text-gray-600 hover:bg-white'}`}>Yes, include</button>
                  </div>
                </div>
              )}

              <div className="flex gap-4 pt-4">
                <button onClick={() => setCurrentStep(0)} className="w-1/3 border border-gray-200 text-gray-600 font-semibold rounded-xl hover:bg-gray-50 transition-colors">Back</button>
                <button onClick={() => validateAndProceed(2)} className="w-2/3 bg-gray-900 text-white font-semibold text-lg p-4 rounded-xl hover:bg-[#22c55e] transition-colors shadow-md">Begin Measurement</button>
              </div>
            </div>
          )}

          {isAskingCopy && (
            <div className="space-y-8 py-16 text-center animate-in fade-in duration-500 max-w-lg mx-auto">
              <div className="w-20 h-20 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-6 text-4xl">📋</div>
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
                Is the {activeFloor === 0 ? "1st Floor" : `${activeFloor + 1}th Floor`} layout the same as {floorsData[activeFloor].floorName}?
              </h2>
              <p className="text-gray-500 font-medium mb-4">Save time by duplicating the entire layout and measurements.</p>
              
              <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 mt-6 text-left">
                <label className={labelStyle}>What is the column height for this floor? (Feet)</label>
                <input type="number" inputMode="decimal" className={inputStyle} value={copyColumnHeight} onChange={(e) => setCopyColumnHeight(e.target.value)} />
                <p className="text-xs text-gray-500 mt-2 font-medium">We will recalculate the wall area and painting costs automatically.</p>
              </div>

              <div className="flex flex-col md:flex-row gap-4 justify-center mt-8">
                <button onClick={() => handleCopyChoice('yes')} className="flex-1 bg-[#22c55e] text-white rounded-xl py-4 font-bold text-lg hover:bg-[#1ea950] transition-colors shadow-md">Yes, Copy Layout</button>
                <button onClick={() => handleCopyChoice('no')} className="flex-1 bg-white border border-gray-200 text-gray-700 rounded-xl py-4 font-bold text-lg hover:bg-gray-50 transition-colors">No, It's Different</button>
              </div>
            </div>
          )}

          {/* --- STEP 2 (NEW): STRUCTURE --- */}
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
                        <label className={labelStyle}>Length (Feet)</label>
                        <input type="number" inputMode="decimal" min="0" placeholder="L" className={inputStyle} value={structure.footing.l} onChange={(e) => setStructure({ ...structure, footing: { ...structure.footing, l: e.target.value } })} />
                      </div>
                      <div>
                        <label className={labelStyle}>Width (Feet)</label>
                        <input type="number" inputMode="decimal" min="0" placeholder="W" className={inputStyle} value={structure.footing.w} onChange={(e) => setStructure({ ...structure, footing: { ...structure.footing, w: e.target.value } })} />
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
                      <label className={labelStyle}>Length (Inches)</label>
                      <input type="number" inputMode="decimal" min="0" placeholder="e.g., 12" className={inputStyle} value={structure.column.l} onChange={(e) => setStructure({ ...structure, column: { ...structure.column, l: e.target.value } })} />
                    </div>
                    <div>
                      <label className={labelStyle}>Width (Inches)</label>
                      <input type="number" inputMode="decimal" min="0" placeholder="e.g., 12" className={inputStyle} value={structure.column.w} onChange={(e) => setStructure({ ...structure, column: { ...structure.column, w: e.target.value } })} />
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
                        <input type="number" inputMode="decimal" min="0" placeholder="Length" className={inputStyle} value={structure.plinthBeam.l} onChange={(e) => setStructure({ ...structure, plinthBeam: { ...structure.plinthBeam, l: e.target.value } })} />
                        <input type="number" inputMode="decimal" min="0" placeholder="Width" className={inputStyle} value={structure.plinthBeam.w} onChange={(e) => setStructure({ ...structure, plinthBeam: { ...structure.plinthBeam, w: e.target.value } })} />
                      </div>
                    </div>
                  )}
                  <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                    <span className="font-bold text-gray-700 block mb-3">Roof Beam</span>
                    <div className="grid grid-cols-2 gap-4">
                      <input type="number" inputMode="decimal" min="0" placeholder="Length" className={inputStyle} value={structure.roofBeam.l} onChange={(e) => setStructure({ ...structure, roofBeam: { ...structure.roofBeam, l: e.target.value } })} />
                      <input type="number" inputMode="decimal" min="0" placeholder="Width" className={inputStyle} value={structure.roofBeam.w} onChange={(e) => setStructure({ ...structure, roofBeam: { ...structure.roofBeam, w: e.target.value } })} />
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

          {/* --- STEP 3 (NEW): LAYOUT --- */}
          {currentStep === 3 && !isAskingCopy && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              
              <div className="mb-8 border-b border-gray-100 pb-6 flex justify-between items-end">
                <div>
                  <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                    <span className="text-3xl">📏</span> {floorsData[activeFloor].floorName} Layout
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
                      <input type="number" inputMode="decimal" min="0" placeholder="Length" className={inputStyle} value={stairsDim.l} onChange={(e) => setStairsDim({ ...stairsDim, l: e.target.value })} />
                      <span className="font-bold text-gray-400">×</span>
                      <input type="number" inputMode="decimal" min="0" placeholder="Width" className={inputStyle} value={stairsDim.w} onChange={(e) => setStairsDim({ ...stairsDim, w: e.target.value })} />
                    </div>
                  </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {['hall', 'kitchen', 'dining', 'foyer'].map((roomKey) => (
                  <div key={roomKey} className="p-5 border border-gray-100 bg-white rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                    <label className={labelStyle}>
                      {roomKey === 'hall' ? 'Hall/Living Room' : roomKey} (ft)
                    </label>
                    <div className="flex gap-4 items-center mt-2">
                      <input type="number" inputMode="decimal" min="0" placeholder="Length" className={inputStyle} value={(floorsData[activeFloor] as any)[roomKey].l} onChange={(e) => { const d = [...floorsData]; (d[activeFloor] as any)[roomKey].l = e.target.value; setFloorsData(d); }} />
                      <span className="font-bold text-gray-300">×</span>
                      <input type="number" inputMode="decimal" min="0" placeholder="Width" className={inputStyle} value={(floorsData[activeFloor] as any)[roomKey].w} onChange={(e) => { const d = [...floorsData]; (d[activeFloor] as any)[roomKey].w = e.target.value; setFloorsData(d); }} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-4 pt-6 border-t border-gray-100">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-lg text-gray-900">Bedrooms (FT)</h3>
                  <button onClick={addBedroom} className="text-sm font-semibold text-[#22c55e] bg-green-50 px-4 py-2 rounded-lg hover:bg-green-100 transition-colors">+ Add Room</button>
                </div>
                {floorsData[activeFloor].bedrooms.map((room, i) => (
                  <div key={room.id} className="flex flex-col md:flex-row gap-4 items-center p-5 border border-gray-100 bg-white rounded-2xl shadow-sm">
                    <span className="text-sm font-bold text-gray-500 md:w-32">Bedroom {i + 1}</span>
                    <div className="flex gap-4 w-full items-center">
                      <input type="number" inputMode="decimal" min="0" placeholder="Length" className={inputStyle} value={room.l} onChange={(e) => { const d = [...floorsData]; d[activeFloor].bedrooms[i].l = e.target.value; setFloorsData(d); }} />
                      <span className="font-bold text-gray-300">×</span>
                      <input type="number" inputMode="decimal" min="0" placeholder="Width" className={inputStyle} value={room.w} onChange={(e) => { const d = [...floorsData]; d[activeFloor].bedrooms[i].w = e.target.value; setFloorsData(d); }} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-4 pt-6 border-t border-gray-100">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-lg text-gray-900">Bathrooms (FT)</h3>
                  <button onClick={addBathroom} className="text-sm font-semibold text-[#22c55e] bg-green-50 px-4 py-2 rounded-lg hover:bg-green-100 transition-colors">+ Add Bath</button>
                </div>
                {floorsData[activeFloor].bathrooms.map((room, i) => (
                  <div key={room.id} className="p-5 border border-gray-100 bg-white rounded-2xl shadow-sm space-y-4">
                    <div className="flex flex-col md:flex-row gap-4 items-center">
                      <span className="text-sm font-bold text-gray-500 md:w-32">Bathroom {i + 1}</span>
                      <div className="flex gap-4 w-full items-center">
                        <input type="number" inputMode="decimal" min="0" placeholder="Length" className={inputStyle} value={room.l} onChange={(e) => { const d = [...floorsData]; d[activeFloor].bathrooms[i].l = e.target.value; setFloorsData(d); }} />
                        <span className="font-bold text-gray-300">×</span>
                        <input type="number" inputMode="decimal" min="0" placeholder="Width" className={inputStyle} value={room.w} onChange={(e) => { const d = [...floorsData]; d[activeFloor].bathrooms[i].w = e.target.value; setFloorsData(d); }} />
                      </div>
                    </div>
                    
                    <div className="flex gap-4 md:pl-36">
                      <button type="button" onClick={() => { const d = [...floorsData]; d[activeFloor].bathrooms[i].isAttached = false; setFloorsData(d); }} className={`flex-1 p-2.5 text-sm rounded-xl font-semibold transition-all border ${!room.isAttached ? 'bg-gray-900 border-gray-900 text-white shadow-md' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>Common</button>
                      <button type="button" onClick={() => { const d = [...floorsData]; d[activeFloor].bathrooms[i].isAttached = true; setFloorsData(d); }} className={`flex-1 p-2.5 text-sm rounded-xl font-semibold transition-all border ${room.isAttached ? 'bg-gray-900 border-gray-900 text-white shadow-md' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>Attached</button>
                    </div>
                    
                    {room.isAttached && (
                      <div className="mt-4 p-4 border border-gray-200 bg-gray-50 rounded-xl md:ml-36">
                        <span className="text-xs font-bold text-gray-500 uppercase block mb-3">Layout Position</span>
                        <div className="flex flex-col gap-3">
                          <label className="flex items-center gap-3 cursor-pointer p-2 hover:bg-white rounded-lg transition-colors">
                            <input type="radio" name={`layout-${room.id}`} checked={room.layoutType === 'inside'} onChange={() => { const d = [...floorsData]; d[activeFloor].bathrooms[i].layoutType = 'inside'; setFloorsData(d); }} className="w-4 h-4 text-[#22c55e] focus:ring-[#22c55e]" />
                            <span className="font-medium text-sm text-gray-700">Inside room footprint <span className="text-gray-400 font-normal">(Ignores extra area)</span></span>
                          </label>
                          <label className="flex items-center gap-3 cursor-pointer p-2 hover:bg-white rounded-lg transition-colors">
                            <input type="radio" name={`layout-${room.id}`} checked={room.layoutType === 'outside' || !room.layoutType} onChange={() => { const d = [...floorsData]; d[activeFloor].bathrooms[i].layoutType = 'outside'; setFloorsData(d); }} className="w-4 h-4 text-[#22c55e] focus:ring-[#22c55e]" />
                            <span className="font-medium text-sm text-gray-700">Outside room footprint <span className="text-gray-400 font-normal">(Adds to total area)</span></span>
                          </label>
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

              {[{ title: '1. Main Door', data: [openings.mainDoor], key: 'mainDoor', isArray: false },
                { title: '2. Internal Doors', data: openings.doors, key: 'doors', isArray: true },
                { title: '3. Windows', data: openings.windows, key: 'windows', isArray: true },
                { title: '4. Ventilations', data: openings.ventilations, key: 'ventilations', isArray: true }
              ].map((section) => (
                <div key={section.title} className="border border-gray-100 p-6 rounded-3xl bg-white shadow-sm">
                  <h2 className="font-bold text-lg text-gray-900 mb-6">{section.title} (Feet)</h2>
                  <div className="space-y-4">
                    {section.data.map((item: any, i: number) => (
                      <div key={item.id || 'main'} className="grid grid-cols-3 gap-4">
                        <div>
                          <label className={labelStyle}>Quantity</label>
                          <input type="number" inputMode="decimal" min="0" className={inputStyle} value={item.count} onChange={(e) => { 
                            if (!section.isArray) { setOpenings({ ...openings, mainDoor: { ...openings.mainDoor, count: e.target.value } }); }
                            else { const d = [...(openings as any)[section.key]]; d[i].count = e.target.value; setOpenings({ ...openings, [section.key]: d }); }
                          }} />
                        </div>
                        <div>
                          <label className={labelStyle}>Height (ft)</label>
                          <input type="number" inputMode="decimal" min="0" className={inputStyle} value={item.h} onChange={(e) => { 
                            if (!section.isArray) { setOpenings({ ...openings, mainDoor: { ...openings.mainDoor, h: e.target.value } }); }
                            else { const d = [...(openings as any)[section.key]]; d[i].h = e.target.value; setOpenings({ ...openings, [section.key]: d }); }
                          }} />
                        </div>
                        <div>
                          <label className={labelStyle}>Width (ft)</label>
                          <input type="number" inputMode="decimal" min="0" className={inputStyle} value={item.w} onChange={(e) => { 
                            if (!section.isArray) { setOpenings({ ...openings, mainDoor: { ...openings.mainDoor, w: e.target.value } }); }
                            else { const d = [...(openings as any)[section.key]]; d[i].w = e.target.value; setOpenings({ ...openings, [section.key]: d }); }
                          }} />
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
                  {Object.keys(rates.tmt).map((size) => (
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
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-gray-100">
                    <div>
                      <label className={labelStyle}>Main Door Price</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#22c55e] font-bold">₹</span>
                        <input type="number" inputMode="decimal" min="0" className={`${inputStyle} pl-8 border-[#22c55e]/30`} value={rates.mainDoorPrice} onChange={(e) => setRates({ ...rates, mainDoorPrice: e.target.value })} />
                      </div>
                    </div>
                    <div>
                      <label className={labelStyle}>Internal Door Price</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">₹</span>
                        <input type="number" inputMode="decimal" min="0" className={`${inputStyle} pl-8`} value={rates.internalDoorPrice} onChange={(e) => setRates({ ...rates, internalDoorPrice: e.target.value })} />
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
          {currentStep === 6 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl mx-auto">
              
              <div className="mb-8 border-b border-gray-100 pb-6 text-center">
                <h1 className="text-3xl font-bold text-gray-900 flex items-center justify-center gap-3">
                  <span className="text-3xl">✨</span> Flooring & Tiles
                </h1>
              </div>

              {[{ label: 'Hall', key: 'hall' }, { label: 'Kitchen', key: 'kitchen' }, { label: 'Dining', key: 'dining' }, { label: 'Foyer', key: 'foyer' }, ...floorsData[activeFloor].bedrooms.map((_, i) => ({ label: `Bedroom ${i + 1}`, key: `bedroom_${i}` })), ...floorsData[activeFloor].bathrooms.map((_, i) => ({ label: `Bathroom ${i + 1}`, key: `bathroom_${i}` }))].map((room) => (
                <div key={room.key} className="border border-gray-100 p-5 rounded-2xl bg-white shadow-sm flex flex-col md:flex-row md:items-center gap-4 hover:border-gray-200 transition-colors">
                  <h3 className="font-bold text-gray-700 w-32">{room.label}</h3>
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
                      <input type="number" inputMode="decimal" min="0" placeholder="Price" className={`${inputStyle} pl-8 border-[#22c55e]/20 focus:border-[#22c55e]`} value={tiles[room.key]?.price || ''} onChange={(e) => updateTile(room.key, 'price', e.target.value)} />
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

              {boqReport.metrics && (
                <div className="mb-12 print:break-inside-avoid">
                  <h3 className="text-lg font-bold text-gray-900 mb-4 border-l-4 border-[#22c55e] pl-3">Project Measurement Summary</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                      <span className="text-xs font-bold uppercase text-gray-500 block mb-1">Built-Up Area</span>
                      <span className="text-xl font-black text-gray-900">{boqReport.metrics.m_builtUp} <span className="text-sm">SQFT</span></span>
                    </div>
                    <div className="bg-green-50 p-4 rounded-2xl border border-green-100">
                      <span className="text-xs font-bold uppercase text-green-700 block mb-1">Slab Area (incl. {slabOverhang}ft)</span>
                      <span className="text-xl font-black text-[#15803d]">{Math.ceil(boqReport.metrics.m_slab)} <span className="text-sm">SQFT</span></span>
                    </div>
                    <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
                      <span className="text-xs font-bold uppercase text-blue-700 block mb-1">Total Wall Area</span>
                      <span className="text-xl font-black text-blue-800">{Math.ceil(boqReport.metrics.m_wall)} <span className="text-sm">SQFT</span></span>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                      <span className="text-xs font-bold uppercase text-gray-500 block mb-1">Total Openings (Doors+Win)</span>
                      <span className="text-xl font-black text-gray-900">{boqReport.metrics.m_doors + boqReport.metrics.m_windows} <span className="text-sm">SQFT</span></span>
                    </div>
                    <div className="bg-orange-50 md:col-span-2 p-4 rounded-2xl border border-orange-100">
                      <span className="text-xs font-bold uppercase text-orange-700 block mb-1">Painting Area (Walls x2 + Ceiling + 10%)</span>
                      <span className="text-xl font-black text-orange-800">{Math.ceil(boqReport.metrics.m_paint)} <span className="text-sm">SQFT</span></span>
                    </div>
                  </div>
                </div>
              )}

              {boqReport.floorReports?.map((floor: any, fIdx: number) => (
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
                                <td className="p-4 font-semibold text-sm text-gray-900 print:p-2">{item.name}</td>
                                <td className="p-4 text-center font-medium text-sm text-gray-500 print:p-2">{item.unit}</td>
                                <td className="p-4 text-center font-bold text-sm text-[#22c55e] print:p-2 print:text-black">{item.qty || 0}</td>
                                <td className="p-4 text-right font-medium text-sm text-gray-600 print:p-2">₹{item.rate || 0}</td>
                                <td className="p-4 text-right font-bold text-sm text-gray-900 print:p-2">₹{Math.ceil((item.qty || 0) * (item.rate || 0)).toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-gray-50/50 print:bg-transparent">
                              <td colSpan={4} className="p-4 font-semibold text-xs text-gray-500 uppercase tracking-wider text-right print:p-2">Section Subtotal:</td>
                              <td className="p-4 font-bold text-base text-gray-900 text-right print:p-2">₹{section.sectionTotal.toLocaleString()}</td>
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
                  ₹ {Math.ceil(boqReport.grandTotal || 0).toLocaleString()}
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