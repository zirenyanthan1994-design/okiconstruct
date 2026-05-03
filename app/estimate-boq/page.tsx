"use client";
import { useState, useEffect } from 'react';

// --- NEW CLOUD ENGINE IMPORTS ---
import { auth, db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { useRouter } from 'next/navigation';

export default function Estimator() {
  // ==========================================
  // PART 1: STATE MANAGEMENT
  // ==========================================
  const [currentStep, setCurrentStep] = useState(1);
  const [activeFloor, setActiveFloor] = useState(0);
  const [totalFloorsCount, setTotalFloorsCount] = useState(1);
  const [isAskingCopy, setIsAskingCopy] = useState(false);
  
  // Snapshot Memory Array for Multi-Floor independent calculations
  const [floorSnapshots, setFloorSnapshots] = useState<any[]>([]);

  const [hasStairs, setHasStairs] = useState(false);
  const [stairsDim, setStairsDim] = useState({ l: '', w: '' });
  const [errorMsg, setErrorMsg] = useState("");
  
  // --- CLOUD SAVE LOGIC ---
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const router = useRouter();

  const saveEstimateToDatabase = async () => {
    if (!auth.currentUser) return alert("Please log in from the Dashboard to save your estimates!");
    if (!boqReport) return alert("Error: BOQ Report is empty. Please generate the report first!");
    
    setIsSaving(true);
    try {
      const cleanData = JSON.parse(JSON.stringify(boqReport));
      const payload = {
        userId: auth.currentUser.uid,
        projectName: "OkiConstruct Build - " + new Date().toLocaleDateString(),
        totalFloors: totalFloorsCount,
        grandTotal: boqReport.grandTotal || 0,
        boqData: cleanData, 
        createdAt: serverTimestamp(),
      };
      const docRef = await addDoc(collection(db, "boq_projects"), payload);
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
    column: { height: '', l: '', w: '' },
    plinthBeam: { l: '', w: '' },
    roofBeam: { l: '', w: '' }
  });

  const [floorsData, setFloorsData] = useState([
    {
      floorName: "Ground Floor",
      hall: { l: '', w: '' }, kitchen: { l: '', w: '' }, dining: { l: '', w: '' }, foyer: { l: '', w: '' },
      bedrooms: [{ id: Date.now(), l: '', w: '' }],
      bathrooms: [{ id: Date.now() + 1, l: '', w: '', isAttached: false }],
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
    mainDoorPrice: '', internalDoorPrice: ''
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

    if (currentStep === 2) {
      const f = floorsData[activeFloor];
      if (!isVal(f.hall.l) || !isVal(f.hall.w) || !isVal(f.kitchen.l) || !isVal(f.kitchen.w)) isValid = false;
      f.bedrooms.forEach(b => { if (!isVal(b.l) || !isVal(b.w)) isValid = false; });
      f.bathrooms.forEach(b => { if (!isVal(b.l) || !isVal(b.w)) isValid = false; });
      if (hasStairs && (!isVal(stairsDim.l) || !isVal(stairsDim.w))) isValid = false;
      if (!isValid) return setErrorMsg("Missing Data: Please fill in all room dimensions with valid numbers.");
    }

    if (currentStep === 3) {
      if (!isVal(structure.column.height) || !isVal(structure.column.l) || !isVal(structure.column.w)) isValid = false;
      if (!isVal(structure.roofBeam.l) || !isVal(structure.roofBeam.w)) isValid = false;
      if (activeFloor === 0) {
        if (!isVal(structure.footing.count) || !isVal(structure.footing.l) || !isVal(structure.footing.w) || !isVal(structure.footing.depth)) isValid = false;
        if (!isVal(structure.plinthBeam.l) || !isVal(structure.plinthBeam.w)) isValid = false;
      }
      if (!isValid) return setErrorMsg("Missing Data: Please ensure all structural dimensions are filled out.");
    }

    if (currentStep === 5) {
      if (!isVal(rates.cement) || !isVal(rates.bricks) || !isVal(rates.sand) || !isVal(rates.tmt['10mm'])) {
        return setErrorMsg("Missing Data: Material rates cannot be empty. Please enter prices.");
      }
    }

    setCurrentStep(targetStep);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNextFloorCheck = () => {
    setErrorMsg("");
    if (!Number(laborRates.mason) || !Number(laborRates.painter)) {
      return setErrorMsg("Missing Data: Please enter primary Labor Rates (Mason/Painter).");
    }

    if (activeFloor < totalFloorsCount - 1) {
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
        bathrooms: [{ id: Date.now() + 1, l: '', w: '', isAttached: false }],
        slabArea: ''
      }]);
      setActiveFloor(nextIdx);
      setIsAskingCopy(false);
      setCurrentStep(2);
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
    newData[activeFloor].bathrooms.push({ id: Date.now() + 1, l: '', w: '', isAttached: false });
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
    const dynamicBaths = f.bathrooms.reduce((sum, r) => sum + getRoomArea(r), 0);
    const stairsArea = hasStairs ? (Number(stairsDim.l) * Number(stairsDim.w) || 0) : 0;
    return staticRooms + dynamicBedrooms + dynamicBaths + stairsArea;
  };

  const calculateTotalPerimeter = (index: number) => {
    const f = floorsData[index];
    const staticPeri = getRoomPerimeter(f.hall) + getRoomPerimeter(f.kitchen) + getRoomPerimeter(f.dining) + getRoomPerimeter(f.foyer);
    const dynamicBedrooms = f.bedrooms.reduce((sum, r) => sum + getRoomPerimeter(r), 0);
    const dynamicBaths = f.bathrooms.reduce((sum, r) => sum + getRoomPerimeter(r), 0);
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
        dimensions: { slabThickness: 5, meshGap: 4, slabOverhang: 3, ringSpacing: 5 },
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

      // --- SNAPSHOT MAPPING ---
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
        const dynamicBathsArea = currentLayout.bathrooms.reduce((sum: number, r: any) => sum + getRoomArea(r), 0);
        const stairsArea = currentHasStairs ? (Number(currentStairsDim.l) * Number(currentStairsDim.w) || 0) : 0;
        const layoutArea = staticRoomsArea + dynamicBedroomsArea + dynamicBathsArea + stairsArea;

        const staticPeri = getRoomPerimeter(currentLayout.hall) + getRoomPerimeter(currentLayout.kitchen) + getRoomPerimeter(currentLayout.dining) + getRoomPerimeter(currentLayout.foyer);
        const dynamicBedroomsPeri = currentLayout.bedrooms.reduce((sum: number, r: any) => sum + getRoomPerimeter(r), 0);
        const dynamicBathsPeri = currentLayout.bathrooms.reduce((sum: number, r: any) => sum + getRoomPerimeter(r), 0);
        const layoutPerimeter = staticPeri + dynamicBedroomsPeri + dynamicBathsPeri;

        const baseSide = Math.sqrt(layoutArea);
        const slabSideL = baseSide + masterSettings.dimensions.slabOverhang;
        const slabSideW = baseSide;

        const adjustedSlabArea = slabSideL * slabSideW;
        const plinthPerimeter = baseSide * 4;
        const roofPerimeter = (slabSideL + slabSideW) * 2;

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

          const footingItems = [
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
          ];
          if (profile.extra) footingItems.push({ name: `Starter Extra (${profile.extra.s})`, qty: Math.ceil(getWeight(profile.extra.s, starterHt * colCount * profile.extra.c, standardWFactor)), unit: "KG", rate: safeRates.tmt[profile.extra.s] || 0 });
          addSection("1. Footing & Foundation", footingItems);

          const plL = Number(currentStructure.plinthBeam.l) || 12;
          const plW = Number(currentStructure.plinthBeam.w) || 12;
          const plConc = calculateConcrete(plinthPerimeter * (plL / 12 * plW / 12), masterSettings.ratios.plinthBeam);
          const plRings = (plinthPerimeter * 12) / masterSettings.dimensions.ringSpacing;

          const plinthItems = [
            { name: "Cement", qty: plConc.cement, unit: "BAG", rate: safeRates.cement || 0 },
            { name: "Sand", qty: plConc.sand, unit: "CFT", rate: safeRates.sand || 0 },
            { name: "Gravel", qty: plConc.gravel, unit: "CFT", rate: safeRates.gravel || 0 },
            { name: `TMT Main (${profile.main.s})`, qty: Math.ceil(getWeight(profile.main.s, plinthPerimeter * profile.main.c, standardWFactor)), unit: "KG", rate: safeRates.tmt[profile.main.s] || 0 },
            { name: "TMT Rings (8mm)", qty: Math.ceil(getWeight('8mm', plRings * calculateRingFt(plL, plW), standardWFactor)), unit: "KG", rate: safeRates.tmt['8mm'] || 0 }
          ];
          if (profile.extra) plinthItems.push({ name: `TMT Extra (${profile.extra.s})`, qty: Math.ceil(getWeight(profile.extra.s, plinthPerimeter * profile.extra.c, standardWFactor)), unit: "KG", rate: safeRates.tmt[profile.extra.s] || 0 });
          addSection("2. Plinth Beams", plinthItems);
        }

        const rL = Number(currentStructure.roofBeam.l) || 12;
        const rW = Number(currentStructure.roofBeam.w) || 12;
        const roofConc = calculateConcrete(roofPerimeter * (rL / 12 * rW / 12), masterSettings.ratios.beam);
        const roofRings = (roofPerimeter * 12) / masterSettings.dimensions.ringSpacing;

        const roofItems = [
          { name: "Cement", qty: roofConc.cement, unit: "BAG", rate: safeRates.cement || 0 },
          { name: "Sand", qty: roofConc.sand, unit: "CFT", rate: safeRates.sand || 0 },
          { name: "Gravel", qty: roofConc.gravel, unit: "CFT", rate: safeRates.gravel || 0 },
          { name: `TMT Main (${profile.main.s})`, qty: Math.ceil(getWeight(profile.main.s, roofPerimeter * profile.main.c, standardWFactor)), unit: "KG", rate: safeRates.tmt[profile.main.s] || 0 },
          { name: "TMT Rings (8mm)", qty: Math.ceil(getWeight('8mm', roofRings * calculateRingFt(rL, rW), standardWFactor)), unit: "KG", rate: safeRates.tmt['8mm'] || 0 }
        ];
        if (profile.extra) roofItems.push({ name: `TMT Extra (${profile.extra.s})`, qty: Math.ceil(getWeight(profile.extra.s, roofPerimeter * profile.extra.c, standardWFactor)), unit: "KG", rate: safeRates.tmt[profile.extra.s] || 0 });
        addSection("3. Roof Beams", roofItems);

        const colConc = calculateConcrete((colLIn / 12 * colWIn / 12 * colHt) * colCount, masterSettings.ratios.column);
        const colRings = (colHt * 12 / masterSettings.dimensions.ringSpacing) * colCount;

        const colItems = [
          { name: "Cement", qty: colConc.cement, unit: "BAG", rate: safeRates.cement || 0 },
          { name: "Sand", qty: colConc.sand, unit: "CFT", rate: safeRates.sand || 0 },
          { name: "Gravel", qty: colConc.gravel, unit: "CFT", rate: safeRates.gravel || 0 },
          { name: `TMT Main (${profile.main.s})`, qty: Math.ceil(getWeight(profile.main.s, colCount * colHt * profile.main.c, standardWFactor)), unit: "KG", rate: safeRates.tmt[profile.main.s] || 0 },
          { name: "TMT Rings (8mm)", qty: Math.ceil(getWeight('8mm', colRings * calculateRingFt(colLIn, colWIn), standardWFactor)), unit: "KG", rate: safeRates.tmt['8mm'] || 0 }
        ];
        if (profile.extra) colItems.push({ name: `TMT Extra (${profile.extra.s})`, qty: Math.ceil(getWeight(profile.extra.s, colCount * colHt * profile.extra.c, standardWFactor)), unit: "KG", rate: safeRates.tmt[profile.extra.s] || 0 });
        addSection("4. Columns", colItems);

        const piecesL = (slabSideL * 12) / masterSettings.dimensions.meshGap;
        const piecesW = (slabSideW * 12) / masterSettings.dimensions.meshGap;
        const totalSlabSteelFt = (piecesL * slabSideW) + (piecesW * slabSideL);

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

          const stairsItems = [
            { name: "Stair Cement", qty: stairsConc.cement, unit: "BAG", rate: safeRates.cement || 0 },
            { name: "Stair Sand", qty: stairsConc.sand, unit: "CFT", rate: safeRates.sand || 0 },
            { name: "Stair Gravel", qty: stairsConc.gravel, unit: "CFT", rate: safeRates.gravel || 0 },
            { name: "Stair Mesh (10mm)", qty: Math.ceil(getWeight('10mm', stairSteelFt, standardWFactor)), unit: "KG", rate: safeRates.tmt['10mm'] || 0 }
          ];
          addSection("Staircase Structure", stairsItems);
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

        addSection("6. Masonry, Joining & Plastering", [
          { name: "Bricks (Accurate Area)", qty: estimatedBricks, unit: "NOS", rate: safeRates.bricks || 0 },
          { name: "Mortar/Plaster Cement", qty: masonryConc.cement, unit: "BAG", rate: safeRates.cement || 0 },
          { name: "Mortar/Plaster Sand", qty: masonryConc.sand, unit: "CFT", rate: safeRates.sand || 0 }
        ]);

        const doorsWindowsItems = [];
        if (Number(currentOpenings.mainDoor.count) > 0) doorsWindowsItems.push({ name: "Main Door", qty: Number(currentOpenings.mainDoor.count), unit: "NOS", rate: Number(rates.mainDoorPrice) || 0 });
        let internalDoorQty = currentOpenings.doors.reduce((sum: number, d: any) => sum + Number(d.count || 0), 0);
        if (internalDoorQty > 0) doorsWindowsItems.push({ name: "Internal Doors", qty: internalDoorQty, unit: "NOS", rate: Number(rates.internalDoorPrice) || 0 });
        if (windowsArea > 0) doorsWindowsItems.push({ name: `Windows (${rates.windowMaterial})`, qty: windowsArea, unit: "SQFT", rate: Number(rates.windowRate) || 0 });
        if (ventArea > 0) doorsWindowsItems.push({ name: "Ventilations", qty: ventArea, unit: "SQFT", rate: Number(rates.windowRate) || 0 });
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

        const puttyBags = Math.ceil(((netWallArea * 2) / masterSettings.consumption.puttyCoverage) / 40);
        const exteriorWallArea = roofPerimeter * colHt;

        addSection("9. Painting Material", [
          { name: "Wall Putty (40kg Bag)", qty: puttyBags, unit: "BAG", rate: Number(currentPaintData.puttyRate) || 0 },
          { name: `Interior Paint (${currentPaintData.brand || 'Standard'})`, qty: Math.ceil(netWallArea / 100), unit: "LITER", rate: Number(currentPaintData.interiorRate) || 0 },
          { name: `Exterior Paint (${currentPaintData.brand || 'Standard'})`, qty: Math.ceil(exteriorWallArea / 60), unit: "LITER", rate: Number(currentPaintData.exteriorRate) || 0 }
        ]);

        const percentageRateMultiplier = (floorBaseCost + (adjustedSlabArea * Number(currentLaborRates.mason || 0)) + (layoutArea * Number(currentLaborRates.tiler || 0)) + ((netWallArea + exteriorWallArea) * Number(currentLaborRates.painter || 0))) / 100;

        addSection("10. Master Labor & Services", [
          { name: "Mason Labor", qty: adjustedSlabArea, unit: "SQFT (SLAB)", rate: Number(currentLaborRates.mason) || 0 },
          { name: "Tile Labor", qty: layoutArea, unit: "SQFT (FLOOR)", rate: Number(currentLaborRates.tiler) || 0 },
          { name: "Painter Labor", qty: netWallArea + exteriorWallArea, unit: "SQFT (WALL)", rate: Number(currentLaborRates.painter) || 0 },
          { name: "Electrical System (Admin Set)", qty: Number(masterSettings.percentages.electrical || 8), unit: "%", rate: Math.ceil(percentageRateMultiplier) },
          { name: "Plumbing & Sanitary (Admin Set)", qty: Number(masterSettings.percentages.plumbing || 6), unit: "%", rate: Math.ceil(percentageRateMultiplier) },
          { name: "Miscellaneous (Admin Set)", qty: Number(masterSettings.percentages.misc || 3), unit: "%", rate: Math.ceil(percentageRateMultiplier) },
          { name: "Logistics & Transport (Admin Set)", qty: Number(masterSettings.percentages.logistics || 15), unit: "%", rate: Math.ceil(percentageRateMultiplier) },
          { name: "Contingencies (Admin Set)", qty: Number(masterSettings.percentages.contingency || 5), unit: "%", rate: Math.ceil(percentageRateMultiplier) }
        ]);

        return { floorName: snap.floorName, sections, layoutArea, adjustedSlabArea, floorTotal: floorBaseCost };
      });

      setBoqReport({
        floorReports,
        grandTotal: floorReports.reduce((sum: number, f: any) => sum + f.floorTotal, 0)
      });
      setCurrentStep(9);
    } catch (err) {
      console.error("Calculation Error:", err);
    }
  };

  // ==========================================
  // PART 5: FULL RENDER UI
  // ==========================================
  return (
    <main className="max-w-4xl mx-auto p-4 md:p-6 mt-10 pb-20 print:p-0 print:mt-0 print:max-w-none">
      <div className="bg-white border-4 border-black p-6 md:p-10 shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] print:shadow-none print:border-none print:p-0 text-black">
        
        <h1 className="text-3xl font-black text-black mb-4 uppercase inline-block border-b-8 border-[#22c55e] pb-2 print:hidden">
          {currentStep === 1 && "Foundation Design"}
          {currentStep === 2 && floorsData[activeFloor].floorName}
          {currentStep === 3 && "Structural Elements"}
          {currentStep === 4 && "Windows & Doors"}
          {currentStep === 5 && "Material Rates"}
          {currentStep === 6 && "Floor Tiles Setup"}
          {currentStep === 7 && "Painting & Putty"}
          {currentStep === 8 && "Labor & Services"}
          {currentStep === 9 && (
            <div className="flex flex-col">
              <span>OkiConstruct Sectional BOQ</span>
              <span className="text-sm font-bold text-gray-500 tracking-widest mt-1">SMART BOQ & EXPENSE TRACKING</span>
            </div>
          )}
        </h1>

        {errorMsg && (
           <div className="bg-red-600 text-white p-4 mb-6 border-4 border-black font-black uppercase text-center animate-pulse shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] print:hidden">
              {errorMsg}
           </div>
        )}

        {/* --- STEP 1 --- */}
        {currentStep === 1 && (
          <div className="space-y-8 mt-6">
            <label className="block text-2xl font-black text-black">Foundation Load (Total Floors)</label>
            <select className="w-full border-4 border-black p-4 text-xl font-black" onChange={(e) => {
              const count = e.target.value === 'G' ? 1 : parseInt(e.target.value.replace('G+', '')) + 1;
              setTotalFloorsCount(count);
              
              // NEW LOGIC: Automatically set hasStairs to true for multi-story buildings!
              if (count > 1) {
                  setHasStairs(true);
              } else {
                  setHasStairs(false); // Reset if they go back to Ground Only
              }
            }}>
              <option value="G">Ground Floor Only</option>
              {Array.from({ length: 9 }, (_, i) => (
                <option key={i + 1} value={`G+${i + 1}`}>G + {i + 1} Floor</option>
              ))}
            </select>
            
            {/* ONLY show this question if they selected "Ground Floor Only" */}
            {totalFloorsCount === 1 && (
              <div className="p-6 border-4 border-black bg-gray-50">
                <span className="text-xl font-black uppercase block mb-4 italic">is there a stairs provission?</span>
                <select className="w-full border-4 border-black p-4 text-lg font-black bg-white" value={hasStairs ? "yes" : "no"} onChange={(e) => setHasStairs(e.target.value === "yes")}>
                  <option value="no">NO</option>
                  <option value="yes">YES</option>
                </select>
              </div>
            )}
            <button onClick={() => validateAndProceed(2)} className="w-full bg-[#22c55e] text-white font-black text-2xl p-6 border-4 border-black hover:bg-black transition-all">Begin Measurement</button>
          </div>
        )}

        {/* --- COPY LAYOUT PROMPT --- */}
        {isAskingCopy && (
          <div className="space-y-8 mt-6 py-10 text-center">
            <h2 className="text-3xl font-black uppercase italic mb-6">
              is the {activeFloor === 0 ? "1st Floor" : `${activeFloor + 1}th Floor`} layout same as {floorsData[activeFloor].floorName}?
            </h2>
            <div className="flex gap-6 justify-center">
              <button onClick={() => handleCopyChoice('yes')} className="bg-black text-[#22c55e] border-4 border-black px-10 py-4 font-black text-2xl uppercase">Yes</button>
              <button onClick={() => handleCopyChoice('no')} className="bg-white text-black border-4 border-black px-10 py-4 font-black text-2xl uppercase">No</button>
            </div>
          </div>
        )}

        {/* --- STEP 2 --- */}
        {currentStep === 2 && !isAskingCopy && (
          <div className="space-y-8 mt-6 flex flex-col">
            
            {/* STAIRS PROVISION (Only shown if hasStairs is true) */}
            {hasStairs && (
                <div className="p-6 border-4 border-black bg-gray-50 mb-4">
                  <span className="text-xs font-black uppercase text-gray-500 italic block mb-2">Dimensions of Stairs Area (ft)</span>
                  <div className="flex gap-4 items-center">
                    <input type="number" inputMode="decimal" min="0" placeholder="Length" className="w-1/2 border-2 border-black p-2 font-bold bg-white" value={stairsDim.l} onChange={(e) => setStairsDim({ ...stairsDim, l: e.target.value })} />
                    <span className="font-black text-[#22c55e]">×</span>
                    <input type="number" inputMode="decimal" min="0" placeholder="Width" className="w-1/2 border-2 border-black p-2 font-bold bg-white" value={stairsDim.w} onChange={(e) => setStairsDim({ ...stairsDim, w: e.target.value })} />
                  </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {['hall', 'kitchen', 'dining', 'foyer'].map((roomKey) => (
                <div key={roomKey} className="p-4 border-4 border-black bg-gray-50">
                  <span className="text-xs font-black uppercase text-gray-500">
                    {roomKey === 'hall' ? 'Hall/Living Room' : roomKey} Dimensions (ft)
                  </span>
                  <div className="flex gap-4 items-center mt-2">
                    <input type="number" inputMode="decimal" min="0" placeholder="L" className="w-1/2 border-2 border-black p-2 font-bold" value={(floorsData[activeFloor] as any)[roomKey].l} onChange={(e) => { const d = [...floorsData]; (d[activeFloor] as any)[roomKey].l = e.target.value; setFloorsData(d); }} />
                    <span className="font-black">×</span>
                    <input type="number" inputMode="decimal" min="0" placeholder="W" className="w-1/2 border-2 border-black p-2 font-bold" value={(floorsData[activeFloor] as any)[roomKey].w} onChange={(e) => { const d = [...floorsData]; (d[activeFloor] as any)[roomKey].w = e.target.value; setFloorsData(d); }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-4">
              <h3 className="font-black text-xl uppercase underline decoration-8 decoration-[#22c55e]">Bedrooms</h3>
              {floorsData[activeFloor].bedrooms.map((room, i) => (
                <div key={room.id} className="flex gap-4 items-center p-4 border-4 border-black bg-white">
                  <span className="text-sm font-black w-32 uppercase text-gray-500">Bedroom {i + 1}</span>
                  <input type="number" inputMode="decimal" min="0" placeholder="L" className="w-full border-2 border-black p-2 font-bold" value={room.l} onChange={(e) => { const d = [...floorsData]; d[activeFloor].bedrooms[i].l = e.target.value; setFloorsData(d); }} />
                  <input type="number" inputMode="decimal" min="0" placeholder="W" className="w-full border-2 border-black p-2 font-bold" value={room.w} onChange={(e) => { const d = [...floorsData]; d[activeFloor].bedrooms[i].w = e.target.value; setFloorsData(d); }} />
                </div>
              ))}
              <button onClick={addBedroom} className="font-black bg-black text-white px-4 py-2 uppercase text-sm">+ Add Bedroom</button>
            </div>

            <div className="space-y-4">
              <h3 className="font-black text-xl uppercase underline decoration-8 decoration-[#22c55e]">Bathrooms</h3>
              {floorsData[activeFloor].bathrooms.map((room, i) => (
                <div key={room.id} className="p-4 border-4 border-black space-y-4 bg-white">
                  <div className="flex gap-4 items-center">
                    <span className="text-sm font-black w-32 uppercase text-gray-500">Bath {i + 1}</span>
                    <input type="number" inputMode="decimal" min="0" placeholder="L" className="w-full border-2 border-black p-2 font-bold" value={room.l} onChange={(e) => { const d = [...floorsData]; d[activeFloor].bathrooms[i].l = e.target.value; setFloorsData(d); }} />
                    <input type="number" inputMode="decimal" min="0" placeholder="W" className="w-full border-2 border-black p-2 font-bold" value={room.w} onChange={(e) => { const d = [...floorsData]; d[activeFloor].bathrooms[i].w = e.target.value; setFloorsData(d); }} />
                  </div>
                  <div className="flex gap-4">
                    <button type="button" onClick={() => { const d = [...floorsData]; d[activeFloor].bathrooms[i].isAttached = false; setFloorsData(d); }} className={`flex-1 p-3 font-black border-4 border-black transition-all ${!room.isAttached ? 'bg-black text-white shadow-[4px_4px_0px_0px_rgba(34,197,94,1)]' : 'bg-white text-black'}`}>COMMON</button>
                    <button type="button" onClick={() => { const d = [...floorsData]; d[activeFloor].bathrooms[i].isAttached = true; setFloorsData(d); }} className={`flex-1 p-3 font-black border-4 border-black transition-all ${room.isAttached ? 'bg-black text-white shadow-[4px_4px_0px_0px_rgba(34,197,94,1)]' : 'bg-white text-black'}`}>ATTACHED</button>
                  </div>
                </div>
              ))}
              <button onClick={addBathroom} className="font-black bg-black text-white px-4 py-2 uppercase text-sm">+ Add Bathroom</button>
            </div>

            <div className="bg-black text-white p-6 grid grid-cols-2 gap-4 border-4 border-black shadow-[6px_6px_0px_0px_rgba(34,197,94,1)] mt-8">
              <div className="flex flex-col">
                <span className="font-black uppercase text-xs text-gray-400 mb-1">Layout Area:</span>
                <p className="text-2xl font-black text-[#22c55e]">{calculateFloorArea(activeFloor)} SQ FT</p>
                <p className="text-[10px] text-gray-500 italic mt-1">(Internal room total)</p>
              </div>
              <div className="flex flex-col border-l-2 border-gray-700 pl-4">
                <span className="font-black uppercase text-xs text-gray-400 mb-1">Adjusted Slab Area:</span>
                <p className="text-2xl font-black text-white">
                  {((Math.sqrt(calculateFloorArea(activeFloor)) + 3) * Math.sqrt(calculateFloorArea(activeFloor))).toFixed(2)} SQ FT
                </p>
                <p className="text-[10px] text-[#22c55e] font-bold mt-1">(Includes +3ft on 2 sides)</p>
              </div>
            </div>

            <div className="flex gap-4 mt-8">
              <button onClick={() => { setErrorMsg(""); setCurrentStep(1); }} className="w-1/3 border-4 border-black p-4 font-black uppercase">Back</button>
              <button onClick={() => validateAndProceed(3)} className="w-2/3 bg-[#22c55e] text-white font-black text-2xl p-6 border-4 border-black hover:bg-black transition-all">Continue</button>
            </div>
          </div>
        )}

        {/* --- STEP 3 --- */}
        {currentStep === 3 && !isAskingCopy && (
          <div className="space-y-10 mt-6">
            {activeFloor === 0 && (
              <div className="border-4 border-black p-6 bg-gray-50">
                <h2 className="font-black text-2xl text-[#22c55e] mb-6 uppercase italic">1. Footing (Ground Only)</h2>
                <div className="space-y-6">
                  <input type="number" inputMode="decimal" min="0" placeholder="Quantity" className="w-full border-4 border-black p-4 font-black text-xl" value={structure.footing.count} onChange={(e) => setStructure({ ...structure, footing: { ...structure.footing, count: e.target.value } })} />
                  <div className="flex gap-4 items-center">
                    <input type="number" inputMode="decimal" min="0" placeholder="L (Feet)" className="w-1/2 border-4 border-black p-4 font-black" value={structure.footing.l} onChange={(e) => setStructure({ ...structure, footing: { ...structure.footing, l: e.target.value } })} />
                    <input type="number" inputMode="decimal" min="0" placeholder="W (Feet)" className="w-1/2 border-4 border-black p-4 font-black" value={structure.footing.w} onChange={(e) => setStructure({ ...structure, footing: { ...structure.footing, w: e.target.value } })} />
                  </div>
                  <input type="number" inputMode="decimal" min="0" placeholder="Depth (Feet)" className="w-full border-4 border-black p-4 font-black" value={structure.footing.depth} onChange={(e) => setStructure({ ...structure, footing: { ...structure.footing, depth: e.target.value } })} />
                </div>
              </div>
            )}
            <div className="border-4 border-black p-6 bg-white">
              <h2 className="font-black text-2xl text-[#22c55e] mb-6 uppercase italic">{activeFloor === 0 ? '2.' : '1.'} Column</h2>
              <input type="number" inputMode="decimal" min="0" placeholder="Height (Feet)" className="w-full border-4 border-black p-4 font-black mb-4" value={structure.column.height} onChange={(e) => setStructure({ ...structure, column: { ...structure.column, height: e.target.value } })} />
              <div className="flex gap-4">
                <input type="number" inputMode="decimal" min="0" placeholder="L (Inches)" className="w-1/2 border-4 border-black p-4 font-black" value={structure.column.l} onChange={(e) => setStructure({ ...structure, column: { ...structure.column, l: e.target.value } })} />
                <input type="number" inputMode="decimal" min="0" placeholder="W (Inches)" className="w-1/2 border-4 border-black p-4 font-black" value={structure.column.w} onChange={(e) => setStructure({ ...structure, column: { ...structure.column, w: e.target.value } })} />
              </div>
            </div>
            <div className="border-4 border-black p-6 bg-gray-50">
              <h2 className="font-black text-2xl text-[#22c55e] mb-6 uppercase italic">{activeFloor === 0 ? '3.' : '2.'} BEAMS (IN INCHES)</h2>
              <div className="space-y-6">
                {activeFloor === 0 && (
                  <div>
                    <span className="text-[10px] font-black uppercase text-gray-500">Plinth Beam</span>
                    <div className="flex gap-4 mt-2">
                      <input type="number" inputMode="decimal" min="0" placeholder="Length" className="w-1/2 border-4 border-black p-4 font-black" value={structure.plinthBeam.l} onChange={(e) => setStructure({ ...structure, plinthBeam: { ...structure.plinthBeam, l: e.target.value } })} />
                      <input type="number" inputMode="decimal" min="0" placeholder="Width" className="w-1/2 border-4 border-black p-4 font-black" value={structure.plinthBeam.w} onChange={(e) => setStructure({ ...structure, plinthBeam: { ...structure.plinthBeam, w: e.target.value } })} />
                    </div>
                  </div>
                )}
                <div>
                  <span className="text-[10px] font-black uppercase text-gray-500">Roof Beam</span>
                  <div className="flex gap-4 mt-2">
                    <input type="number" inputMode="decimal" min="0" placeholder="Length" className="w-1/2 border-4 border-black p-4 font-black" value={structure.roofBeam.l} onChange={(e) => setStructure({ ...structure, roofBeam: { ...structure.roofBeam, l: e.target.value } })} />
                    <input type="number" inputMode="decimal" min="0" placeholder="Width" className="w-1/2 border-4 border-black p-4 font-black" value={structure.roofBeam.w} onChange={(e) => setStructure({ ...structure, roofBeam: { ...structure.roofBeam, w: e.target.value } })} />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-4">
              <button onClick={() => { setErrorMsg(""); setCurrentStep(2); }} className="w-1/3 border-4 border-black p-4 font-black uppercase">Back</button>
              <button onClick={() => validateAndProceed(4)} className="w-2/3 bg-[#22c55e] text-white font-black text-2xl p-6 border-4 border-black">Continue</button>
            </div>
          </div>
        )}

        {/* --- STEP 4 --- */}
        {currentStep === 4 && (
          <div className="space-y-10 mt-6">
            <div className="border-4 border-black p-6 bg-gray-50">
              <h2 className="font-black text-2xl text-[#22c55e] mb-6 uppercase italic">1. Main Door (Feet)</h2>
              <div className="flex gap-4">
                <input type="number" inputMode="decimal" min="0" placeholder="Quantity" className="w-1/3 border-4 border-black p-4 font-black" value={openings.mainDoor.count} onChange={(e) => setOpenings({ ...openings, mainDoor: { ...openings.mainDoor, count: e.target.value } })} />
                <input type="number" inputMode="decimal" min="0" placeholder="Height" className="w-1/3 border-4 border-black p-4 font-black" value={openings.mainDoor.h} onChange={(e) => setOpenings({ ...openings, mainDoor: { ...openings.mainDoor, h: e.target.value } })} />
                <input type="number" inputMode="decimal" min="0" placeholder="Width" className="w-1/3 border-4 border-black p-4 font-black" value={openings.mainDoor.w} onChange={(e) => setOpenings({ ...openings, mainDoor: { ...openings.mainDoor, w: e.target.value } })} />
              </div>
            </div>
            <div className="border-4 border-black p-6 bg-white"><h2 className="font-black text-2xl text-[#22c55e] mb-6 uppercase italic">2. Internal Doors</h2>{openings.doors.map((door, i) => (<div key={door.id} className="grid grid-cols-3 gap-4 mb-4 pb-4 border-b-2 border-black"><div><span className="text-[10px] font-black uppercase">Quantity</span><input type="number" inputMode="decimal" min="0" className="w-full border-4 border-black p-2 font-black" value={door.count} onChange={(e) => { const d = [...openings.doors]; d[i].count = e.target.value; setOpenings({ ...openings, doors: d }) }} /></div><div><span className="text-[10px] font-black uppercase">Height (Feet)</span><input type="number" inputMode="decimal" min="0" className="w-full border-4 border-black p-2 font-black" value={door.h} onChange={(e) => { const d = [...openings.doors]; d[i].h = e.target.value; setOpenings({ ...openings, doors: d }) }} /></div><div><span className="text-[10px] font-black uppercase">Width (Feet)</span><input type="number" inputMode="decimal" min="0" className="w-full border-4 border-black p-2 font-black" value={door.w} onChange={(e) => { const d = [...openings.doors]; d[i].w = e.target.value; setOpenings({ ...openings, doors: d }) }} /></div></div>))}</div>
            <div className="border-4 border-black p-6 bg-gray-50"><h2 className="font-black text-2xl text-[#22c55e] mb-6 uppercase italic">3. Windows</h2>{openings.windows.map((win, i) => (<div key={win.id} className="grid grid-cols-3 gap-4 mb-4 pb-4 border-b-2 border-black"><div><span className="text-[10px] font-black uppercase">Quantity</span><input type="number" inputMode="decimal" min="0" className="w-full border-4 border-black p-2 font-black" value={win.count} onChange={(e) => { const w = [...openings.windows]; w[i].count = e.target.value; setOpenings({ ...openings, windows: w }) }} /></div><div><span className="text-[10px] font-black uppercase">Height (Feet)</span><input type="number" inputMode="decimal" min="0" className="w-full border-4 border-black p-2 font-black" value={win.h} onChange={(e) => { const w = [...openings.windows]; w[i].h = e.target.value; setOpenings({ ...openings, windows: w }) }} /></div><div><span className="text-[10px] font-black uppercase">Width (Feet)</span><input type="number" inputMode="decimal" min="0" className="w-full border-4 border-black p-2 font-black" value={win.w} onChange={(e) => { const w = [...openings.windows]; w[i].w = e.target.value; setOpenings({ ...openings, windows: w }) }} /></div></div>))}</div>
            <div className="border-4 border-black p-6 bg-white"><h2 className="font-black text-2xl text-[#22c55e] mb-6 uppercase italic">4. Ventilations</h2>{openings.ventilations.map((vent, i) => (<div key={vent.id} className="grid grid-cols-3 gap-4 mb-4 pb-4 border-b-2 border-black"><div><span className="text-[10px] font-black uppercase">Quantity</span><input type="number" inputMode="decimal" min="0" className="w-full border-4 border-black p-2 font-black" value={vent.count} onChange={(e) => { const v = [...openings.ventilations]; v[i].count = e.target.value; setOpenings({ ...openings, ventilations: v }) }} /></div><div><span className="text-[10px] font-black uppercase">Height (Feet)</span><input type="number" inputMode="decimal" min="0" className="w-full border-4 border-black p-2 font-black" value={vent.h} onChange={(e) => { const v = [...openings.ventilations]; v[i].h = e.target.value; setOpenings({ ...openings, ventilations: v }) }} /></div><div><span className="text-[10px] font-black uppercase">Width (Feet)</span><input type="number" inputMode="decimal" min="0" className="w-full border-4 border-black p-2 font-black" value={vent.w} onChange={(e) => { const v = [...openings.ventilations]; v[i].w = e.target.value; setOpenings({ ...openings, ventilations: v }) }} /></div></div>))}</div>
            <div className="flex gap-4">
              <button onClick={() => { setErrorMsg(""); setCurrentStep(3); }} className="w-1/3 border-4 border-black p-4 font-black uppercase">Back</button>
              <button onClick={() => validateAndProceed(5)} className="w-2/3 bg-[#22c55e] text-white font-black text-2xl p-6 border-4 border-black">Continue</button>
            </div>
          </div>
        )}

        {/* --- STEP 5 --- */}
        {currentStep === 5 && (
          <div className="space-y-10 mt-6">
            <div className="border-4 border-black p-6 bg-gray-50"><h2 className="font-black text-2xl text-[#22c55e] mb-6 uppercase italic">1. TMT Bar Rate (/KG)</h2><div className="grid grid-cols-3 gap-4">{Object.keys(rates.tmt).map((size) => (<div key={size}><span className="text-[10px] font-black uppercase">{size}</span><input type="number" inputMode="decimal" min="0" className="w-full border-4 border-black p-2 font-black" value={(rates.tmt as any)[size]} onChange={(e) => setRates({ ...rates, tmt: { ...rates.tmt, [size]: e.target.value } })} /></div>))}</div></div>
            <div className="border-4 border-black p-6 bg-white">
              <h2 className="font-black text-2xl text-[#22c55e] mb-6 uppercase italic">2. Materials</h2>
              <div className="grid grid-cols-2 gap-6">
                <div><span className="text-[10px] font-black uppercase">Cement</span><input type="number" inputMode="decimal" min="0" className="w-full border-4 border-black p-2 font-black" value={rates.cement} onChange={(e) => setRates({ ...rates, cement: e.target.value })} /></div>
                <div><span className="text-[10px] font-black uppercase">Sand</span><input type="number" inputMode="decimal" min="0" className="w-full border-4 border-black p-2 font-black" value={rates.sand} onChange={(e) => setRates({ ...rates, sand: e.target.value })} /></div>
                <div><span className="text-[10px] font-black uppercase">Gravel</span><input type="number" inputMode="decimal" min="0" className="w-full border-4 border-black p-2 font-black" value={rates.gravel} onChange={(e) => setRates({ ...rates, gravel: e.target.value })} /></div>
                <div><span className="text-[10px] font-black uppercase">Boulder</span><input type="number" inputMode="decimal" min="0" className="w-full border-4 border-black p-2 font-black" value={rates.boulder} onChange={(e) => setRates({ ...rates, boulder: e.target.value })} /></div>
                <div className="col-span-2 border-t-2 border-black pt-4">
                  <span className="text-[10px] font-black uppercase text-[#22c55e]">Bricks Rate (/NOS)</span>
                  <input type="number" inputMode="decimal" min="0" className="w-full border-4 border-black p-2 font-black" value={rates.bricks} onChange={(e) => setRates({ ...rates, bricks: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="border-4 border-black p-6 bg-gray-50"><h2 className="font-black text-2xl text-[#22c55e] mb-6 uppercase italic">3. Window Spec</h2><select className="w-full border-4 border-black p-4 font-black mb-4" value={rates.windowMaterial} onChange={(e) => setRates({ ...rates, windowMaterial: e.target.value })}><option value="Iron Fabrication">Iron</option><option value="Wood">Wood</option><option value="uPVC">uPVC</option><option value="Aluminum Profile">Aluminum</option></select><input type="number" inputMode="decimal" min="0" placeholder="Sq Ft Rate" className="w-full border-4 border-black p-4 font-black" value={rates.windowRate} onChange={(e) => setRates({ ...rates, windowRate: e.target.value })} /></div>
            <div className="border-4 border-black p-6 bg-white"><h2 className="font-black text-2xl text-[#22c55e] mb-6 uppercase italic">4. Doors</h2><div className="space-y-4"><input type="number" inputMode="decimal" min="0" placeholder="Main Door Price" className="w-full border-4 border-black p-4 font-black text-[#22c55e]" value={rates.mainDoorPrice} onChange={(e) => setRates({ ...rates, mainDoorPrice: e.target.value })} /><input type="number" inputMode="decimal" min="0" placeholder="Internal Door Price" className="w-full border-4 border-black p-4 font-black" value={rates.internalDoorPrice} onChange={(e) => setRates({ ...rates, internalDoorPrice: e.target.value })} /></div></div>
            <div className="flex gap-4">
              <button onClick={() => { setErrorMsg(""); setCurrentStep(4); }} className="w-1/3 border-4 border-black p-4 font-black uppercase">Back</button>
              <button onClick={() => validateAndProceed(6)} className="w-2/3 bg-[#22c55e] text-white font-black text-2xl p-6 border-4 border-black">Continue</button>
            </div>
          </div>
        )}

        {/* --- STEP 6 --- */}
        {currentStep === 6 && (
          <div className="space-y-10 mt-6">
            {[{ label: 'Hall', key: 'hall' }, { label: 'Kitchen', key: 'kitchen' }, { label: 'Dining', key: 'dining' }, { label: 'Foyer', key: 'foyer' }, ...floorsData[activeFloor].bedrooms.map((_, i) => ({ label: `Bedroom ${i + 1}`, key: `bedroom_${i}` })), ...floorsData[activeFloor].bathrooms.map((_, i) => ({ label: `Bathroom ${i + 1}`, key: `bathroom_${i}` }))].map((room) => (
              <div key={room.key} className="border-4 border-black p-6 bg-white">
                <h3 className="font-black text-2xl text-[#22c55e] mb-6 uppercase italic">{room.label} Tiles</h3>
                <div className="grid grid-cols-3 gap-6">
                  <select className="border-4 border-black p-4 font-black" value={tiles[room.key]?.size || ''} onChange={(e) => updateTile(room.key, 'size', e.target.value)}>
                    <option value="">Select Size</option>
                    <option value="2x2">2x2</option>
                    <option value="2x4">2x4</option>
                    <option value="1x1">1x1</option>
                    <option value="1x1.5">1x1.5</option>
                    <option value="3x6">3x6</option>
                  </select>
                  <select className="border-4 border-black p-4 font-black" value={tiles[room.key]?.type || ''} onChange={(e) => updateTile(room.key, 'type', e.target.value)}>
                    <option value="">Select Type</option>
                    <option value="Nano">Nano</option>
                    <option value="Vitrified">Vitrified</option>
                    <option value="Ceramic">Ceramic</option>
                  </select>
                  <input type="number" inputMode="decimal" min="0" placeholder="Price" className="border-4 border-black p-4 font-black text-[#22c55e]" value={tiles[room.key]?.price || ''} onChange={(e) => updateTile(room.key, 'price', e.target.value)} />
                </div>
              </div>
            ))}
            <div className="flex gap-4">
              <button onClick={() => { setErrorMsg(""); setCurrentStep(5); }} className="w-1/3 border-4 border-black p-4 font-black uppercase">Back</button>
              <button onClick={() => validateAndProceed(7)} className="w-2/3 bg-[#22c55e] text-white p-6 border-4 border-black font-black uppercase text-2xl">Continue</button>
            </div>
          </div>
        )}

        {/* --- STEP 7 --- */}
        {currentStep === 7 && (
          <div className="space-y-10 mt-6">
            <div className="border-4 border-black p-6 bg-gray-50"><h2 className="font-black text-2xl text-[#22c55e] mb-6 uppercase italic">1. Putty</h2><input type="number" inputMode="decimal" min="0" placeholder="Rate per 40kg Bag" className="w-full border-4 border-black p-4 font-black text-xl" value={paintData.puttyRate} onChange={(e) => setPaintData({ ...paintData, puttyRate: e.target.value })} /></div>
            <div className="border-4 border-black p-6 bg-white"><h2 className="font-black text-2xl text-[#22c55e] mb-6 uppercase italic">2. Paint Brand</h2><div className="space-y-6"><input type="text" className="w-full border-4 border-black p-4 font-black text-xl" placeholder="Brand" value={paintData.brand} onChange={(e) => setPaintData({ ...paintData, brand: e.target.value })} /><div className="grid grid-cols-2 gap-6"><div><span className="text-[10px] font-black uppercase">Interior paint per liter</span><input type="number" inputMode="decimal" min="0" className="w-full border-4 border-black p-4 font-black text-[#22c55e]" value={paintData.interiorRate} onChange={(e) => setPaintData({ ...paintData, interiorRate: e.target.value })} /></div><div><span className="text-[10px] font-black uppercase">External paint per liter</span><input type="number" inputMode="decimal" min="0" className="w-full border-4 border-black p-4 font-black text-[#22c55e]" value={paintData.exteriorRate} onChange={(e) => setPaintData({ ...paintData, exteriorRate: e.target.value })} /></div></div></div></div>
            <div className="flex gap-4">
              <button onClick={() => { setErrorMsg(""); setCurrentStep(6); }} className="w-1/3 border-4 border-black p-4 font-black uppercase">Back</button>
              <button onClick={() => validateAndProceed(8)} className="w-2/3 bg-[#22c55e] text-white font-black text-2xl p-6 border-4 border-black">Continue</button>
            </div>
          </div>
        )}

        {/* --- STEP 8 --- */}
        {currentStep === 8 && (
          <div className="space-y-10 mt-6">
            <div className="border-4 border-black p-6 bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
              <h2 className="font-black text-2xl text-[#22c55e] mb-4 uppercase italic underline decoration-black decoration-4">Direct Labor Rates (Sq Ft)</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-2">
                {['mason', 'painter', 'tiler'].map((type) => (
                  <div key={type} className="flex flex-col gap-2">
                    <span className="text-xs font-black uppercase text-black tracking-widest">{type} Rate</span>
                    <div className="flex border-4 border-black h-14 bg-white overflow-hidden">
                      <input type="number" inputMode="decimal" min="0" placeholder="0.00" className="flex-1 p-3 font-black text-xl outline-none focus:bg-gray-50 transition-colors" value={(laborRates as any)[type]} onChange={(e) => setLaborRates({ ...laborRates, [type]: e.target.value })} />
                      <div className="flex items-center justify-center px-2 bg-black border-l-4 border-black min-w-[70px]">
                        <span className="font-black text-white text-[10px] uppercase">SQ/FT</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-4">
              <button onClick={() => { setErrorMsg(""); setCurrentStep(7); }} className="w-1/3 border-4 border-black p-4 font-black uppercase hover:bg-gray-100 transition-all">Back</button>
              <button onClick={handleNextFloorCheck} className="w-2/3 bg-black text-[#22c55e] p-6 border-4 border-black font-black uppercase text-2xl hover:bg-[#22c55e] hover:text-white transition-all shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
                {activeFloor < totalFloorsCount - 1 ? "Next Floor Check" : "Generate Sectional BOQ"}
              </button>
            </div>
          </div>
        )}

        {/* --- STEP 9 --- */}
        {currentStep === 9 && boqReport?.floorReports && (
          <div className="space-y-12 mt-6 animate-in slide-in-from-bottom-6 printable-boq">
            
            {boqReport.floorReports?.map((floor: any, fIdx: number) => (
              <div key={fIdx} className="space-y-6 print:break-inside-avoid print:mb-12">
                <h2 className="text-3xl font-black uppercase italic bg-[#22c55e] text-black inline-block px-4 py-2 border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] print:shadow-none print:border-b-4 print:bg-white print:px-0">
                  {floor.floorName}
                </h2>
                {floor.sections?.map((section: any, idx: number) => (
                  <div key={idx} className="border-4 border-black bg-white mb-8 print:border-2 print:mb-4">
                    <div className="bg-black p-4 border-b-4 border-black print:bg-gray-200 print:border-b-2">
                      <h3 className="text-[#22c55e] font-black uppercase tracking-widest print:text-black">{section.title}</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse min-w-[600px] print:min-w-full print:text-xs">
                        <thead>
                          <tr className="bg-gray-100 border-b-4 border-black print:border-b-2">
                            <th className="p-4 font-black text-sm uppercase border-r-4 border-black print:p-2 print:border-r-2">Material/Service</th>
                            <th className="p-4 font-black text-sm uppercase border-r-4 border-black text-center print:p-2 print:border-r-2">Unit</th>
                            <th className="p-4 font-black text-sm uppercase border-r-4 border-black text-center print:p-2 print:border-r-2">Qty</th>
                            <th className="p-4 font-black text-sm uppercase border-r-4 border-black text-right print:p-2 print:border-r-2">Rate</th>
                            <th className="p-4 font-black text-sm uppercase text-right print:p-2">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {section.items?.map((item: any, i: number) => (
                            <tr key={i} className="border-b-2 border-black hover:bg-gray-50 transition-colors print:border-b">
                              <td className="p-4 font-bold text-sm uppercase border-r-4 border-black print:p-2 print:border-r-2">{item.name}</td>
                              <td className="p-4 text-center font-bold text-sm border-r-4 border-black print:p-2 print:border-r-2">{item.unit}</td>
                              <td className="p-4 text-center font-black text-lg border-r-4 border-black text-[#22c55e] print:p-2 print:border-r-2 print:text-black">{item.qty || 0}</td>
                              <td className="p-4 text-right font-bold text-sm border-r-4 border-black print:p-2 print:border-r-2">{item.rate || 0}</td>
                              <td className="p-4 text-right font-black text-lg print:p-2">₹{Math.ceil((item.qty || 0) * (item.rate || 0)).toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-[#22c55e]/20 border-t-4 border-black print:bg-transparent print:border-t-2">
                            <td colSpan={4} className="p-4 font-black text-sm uppercase text-right border-r-4 border-black print:p-2 print:border-r-2">Section Subtotal:</td>
                            <td className="p-4 font-black text-xl text-right print:p-2">₹{section.sectionTotal.toLocaleString()}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            ))}
            
            <div className="bg-black text-white p-8 border-4 border-black text-center shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] mt-12 print:shadow-none print:bg-white print:text-black print:border-4 print:break-inside-avoid">
              <p className="text-sm font-black uppercase text-gray-500 mb-2 print:text-black">Total Project Estimate</p>
              <h2 className="text-6xl font-black text-[#22c55e] print:text-black">₹ {Math.ceil(boqReport.grandTotal || 0).toLocaleString()}</h2>
            </div>

            {/* --- ACTION BUTTONS --- */}
            <div className="flex flex-col md:flex-row gap-4 print:hidden mt-8">
              {!isSaved ? (
                <>
                  <button onClick={() => setCurrentStep(8)} className="flex-1 border-4 border-black p-4 font-black uppercase hover:bg-black hover:text-white transition-all">
                    Back
                  </button>
                  <button onClick={() => window.print()} className="flex-[2] bg-[#22c55e] text-black border-4 border-black p-4 font-black uppercase text-xl hover:translate-y-1 transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none">
                    Download PDF / Print
                  </button>
                  <button 
                    onClick={saveEstimateToDatabase} 
                    disabled={isSaving} 
                    className="flex-[2] bg-black text-white border-4 border-black p-4 font-black uppercase text-xl hover:text-[#22c55e] transition-all shadow-[4px_4px_0px_0px_rgba(34,197,94,1)] disabled:opacity-50 hover:translate-y-1 hover:shadow-none"
                  >
                    {isSaving ? "Syncing..." : "Save to Cloud"}
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => window.print()} className="flex-1 border-4 border-black p-4 font-black uppercase hover:bg-black hover:text-white transition-all">
                    Download PDF / Print
                  </button>
                  <button 
                    onClick={() => router.push('/dashboard')} 
                    className="flex-[2] bg-[#22c55e] text-black border-4 border-black p-4 font-black uppercase text-xl hover:translate-y-1 transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none"
                  >
                    Exit to Dashboard ➔
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}