// app/lib/processBOQ.ts

export interface AdminSettings {
  ratios: any;
  tmtSpecs: any;
  dimensions: any;
  percentages: any;
  consumption: any;
}

export const generateProjectBOQ = (
  finalSnaps: any[], 
  totalFloorsCount: number, 
  slabOverhang: string | number, 
  rates: any, 
  masterSettings: AdminSettings,
  globalUnit: string = 'feet',
  boqScope: string = 'full'
) => {
  const safeRates = rates || {};
  
  // 🟢 NEW: Mathematical Engine dynamically translates user-selected units into feet for core processing
  const toFeet = (val: any) => {
    const n = Number(val) || 0;
    if (globalUnit === 'meters') return n * 3.28084;
    if (globalUnit === 'mm') return n * 0.00328084;
    if (globalUnit === 'inches') return n / 12;
    return n;
  };

  const overhang = toFeet(slabOverhang);

  const getWastage = (material: string, defaultVal: number) => {
    return 1 + ((masterSettings?.percentages?.wastage?.[material] ?? defaultVal) / 100);
  };

  const getAllowance = (element: string, defaultVal: number) => {
    return 1 + ((masterSettings?.percentages?.concreteAllowances?.[element] ?? defaultVal) / 100);
  };

  const wCement = getWastage('cement', 12);
  const wSand = getWastage('sand', 15);
  const wGravel = getWastage('gravel', 10);
  const wTMT = getWastage('tmt', 10);
  const wBricks = getWastage('bricks', 12);
  const wTiles = getWastage('tiles', 10);

  const getWeight = (size: string, totalFeet: number) => {
    const spec = masterSettings?.tmtSpecs?.[size];
    return spec ? (totalFeet / spec.length) * spec.weight * wTMT : 0;
  };

  const calculateConcrete = (wetVolCft: number, ratio: any, extraMultiplier: number = 1) => {
    const dryVol = wetVolCft * 1.54 * extraMultiplier; 
    const totalParts = (ratio?.c || 1) + (ratio?.s || 2) + (ratio?.g || 4);
    return {
      cement: Math.ceil((((ratio?.c || 1) / totalParts) * dryVol / 1.25) * wCement),
      sand: Math.ceil((((ratio?.s || 2) / totalParts) * dryVol) * wSand),
      gravel: Math.ceil((((ratio?.g || 4) / totalParts) * dryVol) * wGravel)
    };
  };

  // Base Auto-Calculation Profile
  let profile = { main: { s: '16mm', c: 4 }, extra: null as { s: string, c: number } | null };
  if (totalFloorsCount >= 2 && totalFloorsCount <= 3) profile.extra = { s: '12mm', c: 2 };
  else if (totalFloorsCount >= 4 && totalFloorsCount <= 5) profile.extra = { s: '12mm', c: 4 };
  else if (totalFloorsCount >= 6 && totalFloorsCount <= 7) { profile.main = { s: '20mm', c: 4 }; profile.extra = { s: '16mm', c: 4 }; }
  else if (totalFloorsCount >= 8) { profile.main = { s: '20mm', c: 4 }; profile.extra = { s: '16mm', c: 6 }; }

  let m_builtUp = 0, m_slab = 0, m_wall = 0, m_doors = 0, m_windows = 0, m_paint = 0;

  // Uses unified toFeet to ensure layout math is flawlessly aligned with SqFt standards
  const getRoomArea = (room: any) => toFeet(room?.length || room?.width) * toFeet(room?.breadth || room?.width);
  const getRoomPerimeter = (room: any) => (toFeet(room?.length || room?.width) + toFeet(room?.breadth || room?.width)) * 2;

  const floorReports = finalSnaps.map((snap: any, idx: number) => {
    const currentLayout = snap?.layout || {};
    const currentStructure = snap?.structure || {};
    const currentOpenings = snap?.openings || {};
    const currentTiles = snap?.tiles || {};
    const currentPaintData = snap?.paintData || {};
    const currentLaborRates = snap?.laborRates || {};
    const currentHasStairs = snap?.hasStairs || false;
    const currentStairsDim = snap?.stairsDim || { length: 0, width: 0 };
    const buildingType = snap?.buildingType || 'residence';

    // 🟢 NEW: Advanced Premium TMT Parsing Algorithm
    const parseTmt = (structPath: any, baseProfile: any) => {
      const mainSize = structPath?.mainTmtSize || baseProfile.main.s;
      const mainCount = Number(structPath?.mainTmtCount) || baseProfile.main.c;
      const extraSize = structPath?.extraTmtSize || baseProfile.extra?.s || null;
      const extraCount = Number(structPath?.extraTmtCount) || baseProfile.extra?.c || 0;
      const ringSize = structPath?.ringSize || '8mm';
      return { mainSize, mainCount, extraSize, extraCount, ringSize };
    };

    const colTmt = parseTmt(currentStructure?.column, profile);
    const pbTmt = parseTmt(currentStructure?.plinthBeam, profile);
    const rbTmt = parseTmt(currentStructure?.roofBeam, profile);

    const sections: any[] = [];
    let floorBaseCost = 0; 

    let layoutArea = 0;
    let layoutPerimeter = 0;
    let totalBathsPeri = 0;

    const tileAreas: Record<string, number> = {
      hall: 0, kitchenDining: 0, foyer: 0, commercialShops: 0, commercialWashrooms: 0, corridor: 0,
      bathroomWalls: 0, skirting: 0
    };

    if (buildingType === 'apartment') {
      if (currentLayout.isCommercial) {
        const shopsArray = Array.isArray(currentLayout.shops) ? currentLayout.shops : [];
        shopsArray.forEach((shop: any) => {
            const sArea = getRoomArea(shop);
            const sPeri = getRoomPerimeter(shop);
            layoutArea += sArea;
            layoutPerimeter += sPeri;
            tileAreas.commercialShops = (tileAreas.commercialShops || 0) + sArea;
        });

        const washCount = Number(currentLayout.washrooms?.count) || 0;
        const wArea = getRoomArea(currentLayout.washrooms) * washCount;
        const wPeri = getRoomPerimeter(currentLayout.washrooms) * washCount;
        
        layoutArea += wArea;
        layoutPerimeter += wPeri;
        totalBathsPeri += wPeri;
        tileAreas.commercialWashrooms = (tileAreas.commercialWashrooms || 0) + wArea;
      } else {
        (currentLayout.flats || []).forEach((flat: any) => {
          const fHallArea = getRoomArea(flat.hall);
          const fKitchenArea = getRoomArea(flat.kitchen);
          layoutArea += fHallArea + fKitchenArea;
          layoutPerimeter += getRoomPerimeter(flat.hall) + getRoomPerimeter(flat.kitchen);
          
          tileAreas.hall += fHallArea;
          tileAreas.kitchenDining += fKitchenArea;

          (flat.bedrooms || []).forEach((b: any, i: number) => {
            layoutArea += getRoomArea(b);
            layoutPerimeter += getRoomPerimeter(b);
            tileAreas[`bedroom_${i}`] = (tileAreas[`bedroom_${i}`] || 0) + getRoomArea(b);
          });

          (flat.bathrooms || []).forEach((b: any, i: number) => {
            if (!(b.isAttached && b.layoutType === 'inside')) layoutArea += getRoomArea(b);
            layoutPerimeter += getRoomPerimeter(b);
            totalBathsPeri += getRoomPerimeter(b);
            tileAreas[`bathroom_${i}`] = (tileAreas[`bathroom_${i}`] || 0) + getRoomArea(b);
          });
        });
      }

      if (snap.apartmentData?.corridor?.hasCorridor) {
        layoutArea += getRoomArea(snap.apartmentData.corridor);
        layoutPerimeter += getRoomPerimeter(snap.apartmentData.corridor);
        tileAreas.corridor = getRoomArea(snap.apartmentData.corridor);
      }
      if (currentHasStairs) {
        layoutArea += getRoomArea(currentStairsDim);
        layoutPerimeter += getRoomPerimeter(currentStairsDim);
      }
      if (snap.apartmentData?.lift?.hasLift) {
        const liftCount = Number(snap.apartmentData.lift.count) || 1;
        layoutArea += getRoomArea(snap.apartmentData.lift) * liftCount;
        layoutPerimeter += getRoomPerimeter(snap.apartmentData.lift) * liftCount;
      }
    } else {
      const staticRoomsArea = getRoomArea(currentLayout?.hall) + getRoomArea(currentLayout?.kitchenDining) + getRoomArea(currentLayout?.foyer);
      const dynamicBedroomsArea = (currentLayout?.bedrooms || []).reduce((sum: number, r: any) => sum + getRoomArea(r), 0);
      const dynamicBathsArea = (currentLayout?.bathrooms || []).reduce((sum: number, r: any) => sum + (r.isAttached && r.layoutType === 'inside' ? 0 : getRoomArea(r)), 0);
      const stairsArea = currentHasStairs ? getRoomArea(currentStairsDim) : 0;
      layoutArea = staticRoomsArea + dynamicBedroomsArea + dynamicBathsArea + stairsArea;

      const staticPeri = getRoomPerimeter(currentLayout?.hall) + getRoomPerimeter(currentLayout?.kitchenDining) + getRoomPerimeter(currentLayout?.foyer);
      const dynamicBedroomsPeri = (currentLayout?.bedrooms || []).reduce((sum: number, r: any) => sum + getRoomPerimeter(r), 0);
      const dynamicBathsPeri = (currentLayout?.bathrooms || []).reduce((sum: number, r: any) => sum + (r.isAttached && r.layoutType === 'inside' ? 0 : getRoomPerimeter(r)), 0);
      const stairsPeri = currentHasStairs ? getRoomPerimeter(currentStairsDim) : 0;
      layoutPerimeter = staticPeri + dynamicBedroomsPeri + dynamicBathsPeri + stairsPeri;

      totalBathsPeri = (currentLayout?.bathrooms || []).reduce((sum: number, r: any) => sum + getRoomPerimeter(r), 0);
      
      tileAreas.hall = getRoomArea(currentLayout?.hall);
      tileAreas.kitchenDining = getRoomArea(currentLayout?.kitchenDining);
      tileAreas.foyer = getRoomArea(currentLayout?.foyer);
      (currentLayout?.bedrooms || []).forEach((b: any, i: number) => tileAreas[`bedroom_${i}`] = getRoomArea(b));
      (currentLayout?.bathrooms || []).forEach((b: any, i: number) => tileAreas[`bathroom_${i}`] = getRoomArea(b));
    }

    const baseSide = Math.sqrt(layoutArea) || 0;
    const slabSide = baseSide + overhang;
    let adjustedSlabArea = Math.pow(slabSide, 2);
    
    if (buildingType === 'apartment' && idx < totalFloorsCount - 1) {
        let voidArea = 0;
        if (currentHasStairs) voidArea += getRoomArea(currentStairsDim);
        if (snap.apartmentData?.lift?.hasLift) {
             voidArea += getRoomArea(snap.apartmentData.lift) * (Number(snap.apartmentData.lift.count) || 1);
        }
        adjustedSlabArea = Math.max(0, adjustedSlabArea - voidArea);
    }
    
    const plinthPerimeter = baseSide * 4;
    const roofPerimeter = slabSide * 4;

    const colCount = Number(currentStructure?.footing?.count) || Math.ceil(layoutArea / 100);
    
    // Normalized to feet via dynamic structural parser
    const colHt = toFeet(currentStructure?.column?.height || (globalUnit==='feet'?10:0));
    const colB = toFeet(currentStructure?.column?.breadth || (globalUnit==='inches'?12:1));
    const colW = toFeet(currentStructure?.column?.width || (globalUnit==='inches'?12:1));
    const calculateRingFt = (bFt: number, wFt: number) => (((bFt - 0.25) + (wFt - 0.25)) * 2); 

    const addSection = (title: string, rawItems: any[]) => {
      const items = rawItems.filter(item => item && (Number(item.qty) > 0) && (Number(item.rate) > 0));
      if (items.length === 0) return; 

      const sectionTotal = items.reduce((sum, item) => sum + (Math.ceil(Number(item.qty) * Number(item.rate))), 0);
      sections.push({ title, items, sectionTotal });
      floorBaseCost += sectionTotal;
    };

    if (idx === 0) {
      const fB = toFeet(currentStructure?.footing?.breadth || (globalUnit==='feet'?4:0)); 
      const fW = toFeet(currentStructure?.footing?.width || (globalUnit==='feet'?4:0));
      const depth = toFeet(currentStructure?.footing?.depth || (globalUnit==='feet'?4:0));
      const pD = toFeet(currentStructure?.plinthBeam?.depth || (globalUnit==='inches'?12:1));
      const plW = toFeet(currentStructure?.plinthBeam?.width || (globalUnit==='inches'?12:1));
      
      const pitBoulderThicknessFt = 6 / 12; 
      const padThicknessFt = 5 / 12;     
      
      const gfPlinthBoulderCft = layoutArea * (9 / 12); 
      const gfFloorPccVol = layoutArea * (4 / 12);      
      
      const pitBoulderCft = colCount * (fB * fW * pitBoulderThicknessFt);
      const padVolume = colCount * (fB * fW * padThicknessFt);
      const padConc = calculateConcrete(padVolume, masterSettings?.ratios?.footing, getAllowance('footing', 5));

      const pitColumnHeight = Math.max(0, depth - pitBoulderThicknessFt - padThicknessFt);
      const pitColumnVolume = colCount * (colB * colW * pitColumnHeight);
      const starterConc = calculateConcrete(pitColumnVolume, masterSettings?.ratios?.column, getAllowance('column', 5));

      const floorPccConc = calculateConcrete(gfFloorPccVol, masterSettings?.ratios?.pcc, 1.0); 

      const starterHt = 1 + depth + pD;
      const meshBarsL = (fW / 0.5) + 1;
      const meshBarsW = (fB / 0.5) + 1;
      const totalMeshFtPerFooting = (meshBarsL * fB) + (meshBarsW * fW);
      const grandTotalMeshFt = totalMeshFtPerFooting * colCount;
      const starterRingsQty = (starterHt / (masterSettings?.dimensions?.ringSpacing / 12 || 0.416)) * colCount;

      const starterItems = [
        { name: "Boulder Fill (Footing Base)", qty: Math.ceil(pitBoulderCft), unit: "CFT", rate: safeRates.boulder || 0 },
        { name: "Boulder Fill (Plinth Area)", qty: Math.ceil(gfPlinthBoulderCft), unit: "CFT", rate: safeRates.boulder || 0 },
        { name: "Footing Pad Cement (5in)", qty: padConc.cement, unit: "BAG", rate: safeRates.cement || 0 },
        { name: "Footing Pad Sand", qty: padConc.sand, unit: "CFT", rate: safeRates.sand || 0 },
        { name: "Footing Pad Gravel", qty: padConc.gravel, unit: "CFT", rate: safeRates.gravel || 0 },
        { name: "Footing Pad TMT Jali/Mesh (10mm)", qty: Math.ceil(getWeight('10mm', grandTotalMeshFt / 2)), unit: "KG", rate: safeRates.tmt?.['10mm'] || 0 },
        { name: "Footing Pad TMT Jali/Mesh (12mm)", qty: Math.ceil(getWeight('12mm', grandTotalMeshFt / 2)), unit: "KG", rate: safeRates.tmt?.['12mm'] || 0 },
        { name: "Column Starter Cement", qty: starterConc.cement, unit: "BAG", rate: safeRates.cement || 0 },
        { name: "Column Starter Sand", qty: starterConc.sand, unit: "CFT", rate: safeRates.sand || 0 },
        { name: "Column Starter Gravel", qty: starterConc.gravel, unit: "CFT", rate: safeRates.gravel || 0 },
        { name: "GF Floor PCC Cement (4in)", qty: floorPccConc.cement, unit: "BAG", rate: safeRates.cement || 0 },
        { name: "GF Floor PCC Sand", qty: floorPccConc.sand, unit: "CFT", rate: safeRates.sand || 0 },
        { name: "GF Floor PCC Gravel", qty: floorPccConc.gravel, unit: "CFT", rate: safeRates.gravel || 0 },
        { name: `Starter Main (${colTmt.mainSize})`, qty: Math.ceil(getWeight(colTmt.mainSize, starterHt * colCount * colTmt.mainCount)), unit: "KG", rate: safeRates.tmt?.[colTmt.mainSize] || 0 }
      ];

      if (colTmt.extraSize && colTmt.extraCount > 0) {
        starterItems.push({ name: `Starter Extra (${colTmt.extraSize})`, qty: Math.ceil(getWeight(colTmt.extraSize, starterHt * colCount * colTmt.extraCount)), unit: "KG", rate: safeRates.tmt?.[colTmt.extraSize] || 0 });
      }
      starterItems.push({ name: `Starter Rings (${colTmt.ringSize})`, qty: Math.ceil(getWeight(colTmt.ringSize, starterRingsQty * calculateRingFt(colB, colW))), unit: "KG", rate: safeRates.tmt?.[colTmt.ringSize] || 0 });
      
      addSection("1. Foundation & Substructure", starterItems);

      const plConc = calculateConcrete(plinthPerimeter * (pD * plW), masterSettings?.ratios?.plinthBeam, getAllowance('plinthBeam', 5));
      const plRings = plinthPerimeter / (masterSettings?.dimensions?.ringSpacing / 12 || 0.416);

      const plinthItems = [
        { name: "Cement", qty: plConc.cement, unit: "BAG", rate: safeRates.cement || 0 },
        { name: "Sand", qty: plConc.sand, unit: "CFT", rate: safeRates.sand || 0 },
        { name: "Gravel", qty: plConc.gravel, unit: "CFT", rate: safeRates.gravel || 0 },
        { name: `TMT Main (${pbTmt.mainSize})`, qty: Math.ceil(getWeight(pbTmt.mainSize, plinthPerimeter * pbTmt.mainCount)), unit: "KG", rate: safeRates.tmt?.[pbTmt.mainSize] || 0 }
      ];
      if (pbTmt.extraSize && pbTmt.extraCount > 0) {
         plinthItems.push({ name: `TMT Extra (${pbTmt.extraSize})`, qty: Math.ceil(getWeight(pbTmt.extraSize, plinthPerimeter * pbTmt.extraCount)), unit: "KG", rate: safeRates.tmt?.[pbTmt.extraSize] || 0 });
      }
      plinthItems.push({ name: `TMT Rings (${pbTmt.ringSize})`, qty: Math.ceil(getWeight(pbTmt.ringSize, plRings * calculateRingFt(pD, plW))), unit: "KG", rate: safeRates.tmt?.[pbTmt.ringSize] || 0 });

      addSection("2. Plinth Beams", plinthItems);
    }

    const rD = toFeet(currentStructure?.roofBeam?.depth || (globalUnit==='inches'?12:1));
    const rW = toFeet(currentStructure?.roofBeam?.width || (globalUnit==='inches'?12:1));
    const roofConc = calculateConcrete(roofPerimeter * (rD * rW), masterSettings?.ratios?.beam, getAllowance('roofBeam', 5));
    const roofRings = roofPerimeter / (masterSettings?.dimensions?.ringSpacing / 12 || 0.416);

    const roofItems = [
      { name: "Cement", qty: roofConc.cement, unit: "BAG", rate: safeRates.cement || 0 },
      { name: "Sand", qty: roofConc.sand, unit: "CFT", rate: safeRates.sand || 0 },
      { name: "Gravel", qty: roofConc.gravel, unit: "CFT", rate: safeRates.gravel || 0 },
      { name: `TMT Main (${rbTmt.mainSize})`, qty: Math.ceil(getWeight(rbTmt.mainSize, roofPerimeter * rbTmt.mainCount)), unit: "KG", rate: safeRates.tmt?.[rbTmt.mainSize] || 0 }
    ];
    if (rbTmt.extraSize && rbTmt.extraCount > 0) {
      roofItems.push({ name: `TMT Extra (${rbTmt.extraSize})`, qty: Math.ceil(getWeight(rbTmt.extraSize, roofPerimeter * rbTmt.extraCount)), unit: "KG", rate: safeRates.tmt?.[rbTmt.extraSize] || 0 });
    }
    roofItems.push({ name: `TMT Rings (${rbTmt.ringSize})`, qty: Math.ceil(getWeight(rbTmt.ringSize, roofRings * calculateRingFt(rD, rW))), unit: "KG", rate: safeRates.tmt?.[rbTmt.ringSize] || 0 });
    addSection("3. Roof Beams", roofItems);

    const colConc = calculateConcrete((colB * colW * colHt) * colCount, masterSettings?.ratios?.column, getAllowance('column', 5));
    const colRings = (colHt / (masterSettings?.dimensions?.ringSpacing / 12 || 0.416)) * colCount;

    const colItems = [
      { name: "Cement", qty: colConc.cement, unit: "BAG", rate: safeRates.cement || 0 },
      { name: "Sand", qty: colConc.sand, unit: "CFT", rate: safeRates.sand || 0 },
      { name: "Gravel", qty: colConc.gravel, unit: "CFT", rate: safeRates.gravel || 0 },
      { name: `TMT Main (${colTmt.mainSize})`, qty: Math.ceil(getWeight(colTmt.mainSize, colCount * colHt * colTmt.mainCount)), unit: "KG", rate: safeRates.tmt?.[colTmt.mainSize] || 0 }
    ];
    if (colTmt.extraSize && colTmt.extraCount > 0) {
      colItems.push({ name: `TMT Extra (${colTmt.extraSize})`, qty: Math.ceil(getWeight(colTmt.extraSize, colCount * colHt * colTmt.extraCount)), unit: "KG", rate: safeRates.tmt?.[colTmt.extraSize] || 0 });
    }
    colItems.push({ name: `TMT Rings (${colTmt.ringSize})`, qty: Math.ceil(getWeight(colTmt.ringSize, colRings * calculateRingFt(colB, colW))), unit: "KG", rate: safeRates.tmt?.[colTmt.ringSize] || 0 });
    addSection("4. Columns", colItems);

    const pieces = (slabSide * 12) / (masterSettings?.dimensions?.meshGap || 4);
    const totalSlabSteelFt = (pieces * slabSide) + (pieces * slabSide);

    const slabConc = calculateConcrete(adjustedSlabArea * ((masterSettings?.dimensions?.slabThickness || 5) / 12), masterSettings?.ratios?.slab, getAllowance('slab', 25));
    
    addSection("5. Roof Slab", [
      { name: "Cement", qty: slabConc.cement, unit: "BAG", rate: safeRates.cement || 0 },
      { name: "Sand", qty: slabConc.sand, unit: "CFT", rate: safeRates.sand || 0 },
      { name: "Gravel", qty: slabConc.gravel, unit: "CFT", rate: safeRates.gravel || 0 },
      { name: "TMT Slab (10mm)", qty: Math.ceil(getWeight('10mm', totalSlabSteelFt)), unit: "KG", rate: safeRates.tmt?.['10mm'] || 0 }
    ]);

    if (currentHasStairs && toFeet(currentStairsDim?.width) > 0 && toFeet(currentStairsDim?.length) > 3) {
      const sW = toFeet(currentStairsDim.width);
      const sL = toFeet(currentStairsDim.length);
      const flightWidth = sW / 2;
      const landingL = 3;
      const flightHeight = colHt / 2;
      const riserFt = 5 / 12; 

      const stepsPerFlight = Math.ceil(flightHeight / riserFt);
      const flightHorizontalLength = sL - landingL;
      const treadFt = flightHorizontalLength / (stepsPerFlight - 1);
      const inclinedLength = Math.sqrt(Math.pow(flightHorizontalLength, 2) + Math.pow(flightHeight, 2));
      const slabThickFt = (masterSettings?.dimensions?.slabThickness || 5) / 12;

      const totalStairsCft = (sW * landingL * slabThickFt) + (2 * (inclinedLength * flightWidth * slabThickFt)) + (2 * (stepsPerFlight * (0.5 * riserFt * treadFt * flightWidth)));
      const stairsConc = calculateConcrete(totalStairsCft, masterSettings?.ratios?.slab, getAllowance('slab', 25));

      const totalStairArea = (sW * landingL) + (2 * (inclinedLength * flightWidth));
      const stairSteelFt = totalStairArea * 2 * (12 / (masterSettings?.dimensions?.meshGap || 4));

      addSection("Staircase Structure", [
        { name: "Stair Cement", qty: stairsConc.cement, unit: "BAG", rate: safeRates.cement || 0 },
        { name: "Stair Sand", qty: stairsConc.sand, unit: "CFT", rate: safeRates.sand || 0 },
        { name: "Stair Gravel", qty: stairsConc.gravel, unit: "CFT", rate: safeRates.gravel || 0 },
        { name: "Stair Mesh (10mm)", qty: Math.ceil(getWeight('10mm', stairSteelFt)), unit: "KG", rate: safeRates.tmt?.['10mm'] || 0 }
      ]);
    }

    const grossWallArea = layoutPerimeter * colHt;
    const mainDoorArea = toFeet(currentOpenings?.mainDoor?.height) * toFeet(currentOpenings?.mainDoor?.width) * Number(currentOpenings?.mainDoor?.count || 0);
    const roomDoorsArea = (currentOpenings?.roomDoors || []).reduce((sum: number, d: any) => sum + (toFeet(d?.height) * toFeet(d?.width) * Number(d?.count||0)), 0);
    const bathroomDoorsArea = (currentOpenings?.bathroomDoors || []).reduce((sum: number, d: any) => sum + (toFeet(d?.height) * toFeet(d?.width) * Number(d?.count||0)), 0);
    const shutterArea = (currentOpenings?.shutters || []).reduce((sum: number, d: any) => sum + (toFeet(d?.height) * toFeet(d?.width) * Number(d?.count||0)), 0);
    const windowsArea = (currentOpenings?.windows || []).reduce((sum: number, w: any) => sum + (toFeet(w?.height) * toFeet(w?.width) * Number(w?.count||0)), 0);
    const ventArea = (currentOpenings?.ventilations || []).reduce((sum: number, v: any) => sum + (toFeet(v?.height) * toFeet(v?.width) * Number(v?.count||0)), 0);
    
    const netWallArea = Math.max(0, grossWallArea - (mainDoorArea + roomDoorsArea + bathroomDoorsArea + shutterArea + windowsArea + ventArea));
    const estimatedBricks = Math.ceil(netWallArea * (masterSettings?.consumption?.bricksPerSqft || 5) * wBricks);
    
    const joiningVol = netWallArea * (masterSettings?.consumption?.brickJoiningCftPerSqft || 0.10);
    const plasterVol = netWallArea * (masterSettings?.consumption?.plasterCftPerSqft || 0.10) * 2; 
    const joiningConc = calculateConcrete(joiningVol, masterSettings?.ratios?.mortar);
    const plasterConc = calculateConcrete(plasterVol, masterSettings?.ratios?.mortar);

    const ceilingPlasterVol = layoutArea * (masterSettings?.consumption?.plasterCftPerSqft || 0.10);
    const ceilingPlasterConc = calculateConcrete(ceilingPlasterVol, masterSettings?.ratios?.mortar);

    const floorPaintArea = ((netWallArea * 2) + layoutArea) * 1.10;

    m_builtUp += layoutArea;
    m_slab += adjustedSlabArea;
    m_wall += netWallArea;
    m_doors += (mainDoorArea + roomDoorsArea + bathroomDoorsArea + shutterArea);
    m_windows += (windowsArea + ventArea);
    m_paint += floorPaintArea;

    addSection("6. Masonry, Joining & Plastering", [
      { name: "Bricks ", qty: estimatedBricks, unit: "NOS", rate: safeRates.bricks || 0 },
      { name: "Cement for Brick Joining", qty: joiningConc.cement, unit: "BAG", rate: safeRates.cement || 0 },
      { name: "Sand for Brick Joining", qty: joiningConc.sand, unit: "CFT", rate: safeRates.sand || 0 },
      { name: "Cement for Wall Plaster", qty: plasterConc.cement, unit: "BAG", rate: safeRates.cement || 0 },
      { name: "Sand for Wall Plaster", qty: plasterConc.sand, unit: "CFT", rate: safeRates.sand || 0 },
      { name: "Cement for Ceiling Plaster", qty: ceilingPlasterConc.cement, unit: "BAG", rate: safeRates.cement || 0 },
      { name: "Sand for Ceiling Plaster", qty: ceilingPlasterConc.sand, unit: "CFT", rate: safeRates.sand || 0 }
    ]);

    if (boqScope !== 'civil_only') {
      const doorsWindowsItems = [];
      if (Number(currentOpenings?.mainDoor?.count) > 0) doorsWindowsItems.push({ name: "Main Door", qty: Number(currentOpenings.mainDoor.count), unit: "NOS", rate: Number(safeRates.mainDoorPrice) || 0 });
      
      let shutterQty = (currentOpenings?.shutters || []).reduce((sum: number, d: any) => sum + Number(d?.count || 0), 0);
      if (shutterQty > 0) doorsWindowsItems.push({ name: "Rolling Shutters", qty: shutterArea, unit: "SQFT", rate: Number(safeRates.windowRate) || Number(safeRates.roomDoorPrice) || 0 });

      let roomDoorQty = (currentOpenings?.roomDoors || []).reduce((sum: number, d: any) => sum + Number(d?.count || 0), 0);
      if (roomDoorQty > 0) doorsWindowsItems.push({ name: "Room Doors", qty: roomDoorQty, unit: "NOS", rate: Number(safeRates.roomDoorPrice) || 0 });
      if (roomDoorQty > 0 && Number(safeRates.doorFramePrice) > 0) doorsWindowsItems.push({ name: "Room Door Frames", qty: roomDoorQty, unit: "NOS", rate: Number(safeRates.doorFramePrice) });

      let bathDoorQty = (currentOpenings?.bathroomDoors || []).reduce((sum: number, d: any) => sum + Number(d?.count || 0), 0);
      if (bathDoorQty > 0) doorsWindowsItems.push({ name: "Bathroom Doors", qty: bathDoorQty, unit: "NOS", rate: Number(safeRates.bathroomDoorPrice) || 0 });
      if (bathDoorQty > 0 && Number(safeRates.doorFramePrice) > 0) doorsWindowsItems.push({ name: "Bathroom Door Frames", qty: bathDoorQty, unit: "NOS", rate: Number(safeRates.doorFramePrice) });
      
      if (windowsArea > 0) doorsWindowsItems.push({ name: `Windows (${safeRates.windowMaterial || 'Standard'})`, qty: windowsArea, unit: "SQFT", rate: Number(safeRates.windowRate) || 0 });
      if (ventArea > 0) doorsWindowsItems.push({ name: "Ventilations", qty: ventArea, unit: "SQFT", rate: Number(safeRates.windowRate) || 0 });
      
      const dwSubtotal = doorsWindowsItems.reduce((acc, item) => acc + (item.qty * item.rate), 0);
      if (dwSubtotal > 0) doorsWindowsItems.push({ name: "Hinges, Locks & Hardware", qty: 15, unit: "%", rate: (dwSubtotal / 100) });
      
      addSection("7. Doors & Windows", doorsWindowsItems);

      const tileItems: any[] = [];
      tileAreas.bathroomWalls = totalBathsPeri * colHt * 0.8;
      tileAreas.skirting = layoutPerimeter * 0.5;

      let totalTileArea = 0;
      Object.keys(currentTiles).forEach(key => {
        const t = currentTiles[key];
        const area = tileAreas[key] || 0;
        if (t && Number(t.price) > 0 && area > 0) {
          if (!key.includes('bathroomWalls') && !key.includes('skirting')) totalTileArea += area;
          const sizeStr = t.size || '2x2';
          const [tl, tw] = sizeStr.split('x').map(Number);
          const sqftPerTile = (tl && tw) ? (tl * tw) : 4; 
          const pieces = Math.ceil((area / sqftPerTile) * wTiles);
          const friendlyLabel = { hall: 'Hall', kitchenDining: 'Kitchen/Dining', foyer: 'Foyer', commercialShops: 'Shop Chambers', commercialWashrooms: 'Washrooms', corridor: 'Corridor', bathroomWalls: 'Bathroom Walls', skirting: 'Internal Skirting' }[key] || key.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
          tileItems.push({ name: `${friendlyLabel} Tiles (${sizeStr}, ${t.type || 'Standard'})`, qty: pieces, unit: "PIECES", rate: Number(t.price) });
        }
      });

      if (totalTileArea > 0) {
          const beddingConc = calculateConcrete(totalTileArea * (masterSettings?.consumption?.tileBeddingCftPerSqft || 0.20), masterSettings?.ratios?.tileBedding);
          tileItems.push({ name: "Bedding Cement", qty: beddingConc.cement, unit: "BAG", rate: safeRates.cement || 0 });
          tileItems.push({ name: "Bedding Sand", qty: beddingConc.sand, unit: "CFT", rate: safeRates.sand || 0 });
      }
      addSection("8. Flooring & Tiles", tileItems);

      const puttyBags = Math.ceil((floorPaintArea / (masterSettings?.consumption?.puttyCoverage || 10)) / 40);
      const exteriorWallArea = roofPerimeter * colHt;

      addSection("9. Painting Material", [
        { name: "Wall Putty (40kg Bag)", qty: puttyBags, unit: "BAG", rate: Number(currentPaintData?.puttyRate) || 0 },
        { name: `Interior Paint (${currentPaintData?.brand || 'Standard'})`, qty: Math.ceil(floorPaintArea / (masterSettings?.consumption?.interiorPaintCoverage || 50)), unit: "LITER", rate: Number(currentPaintData?.interiorRate) || 0 },
        { name: `Exterior Paint (${currentPaintData?.brand || 'Standard'})`, qty: Math.ceil(exteriorWallArea / (masterSettings?.consumption?.exteriorPaintCoverage || 50)), unit: "LITER", rate: Number(currentPaintData?.exteriorRate) || 0 }
      ]);
    }

    const masonQty = Math.ceil(adjustedSlabArea);
    const tileQty = Math.ceil(layoutArea);
    const exteriorWallAreaCalc = roofPerimeter * colHt;
    const painterQty = Math.ceil(floorPaintArea + exteriorWallAreaCalc);
    
    const masonRate = Number(currentLaborRates?.mason) || 0;
    const tilerRate = Number(currentLaborRates?.tiler) || 0;
    const painterRate = Number(currentLaborRates?.painter) || 0;

    const baseCostForPercentages = floorBaseCost + (masonQty * masonRate) + (boqScope !== 'civil_only' ? (tileQty * tilerRate) + (painterQty * painterRate) : 0);
    const percentageRateMultiplier = baseCostForPercentages / 100;

    const laborItems = [];
    laborItems.push({ name: "Mason Labor", qty: masonQty, unit: "SQFT (SLAB)", rate: masonRate });
    if (boqScope !== 'civil_only') {
      laborItems.push({ name: "Tile Labor", qty: tileQty, unit: "SQFT (FLOOR)", rate: tilerRate });
      laborItems.push({ name: "Painter Labor", qty: painterQty, unit: "SQFT", rate: painterRate });
    }
    laborItems.push({ name: "Props & Shuttering Material", qty: Number(masterSettings?.percentages?.shuttering || 10), unit: "%", rate: percentageRateMultiplier });
    
    if (boqScope !== 'civil_only') {
      laborItems.push({ name: "Electrical System", qty: Number(masterSettings?.percentages?.electrical || 12), unit: "%", rate: percentageRateMultiplier });
      laborItems.push({ name: "Plumbing & Sanitary", qty: Number(masterSettings?.percentages?.plumbing || 8), unit: "%", rate: percentageRateMultiplier });
    }
    
    laborItems.push({ name: "Logistics & Transport", qty: Number(masterSettings?.percentages?.logistics || 8), unit: "%", rate: percentageRateMultiplier });
    laborItems.push({ name: "Miscellaneous", qty: Number(masterSettings?.percentages?.misc || 5), unit: "%", rate: percentageRateMultiplier });

    addSection("Master Labor & Services", laborItems);

    return { floorName: snap?.floorName || 'Floor', sections, layoutArea, adjustedSlabArea, floorTotal: floorBaseCost };
  });

  return {
    floorReports,
    grandTotal: floorReports.reduce((sum: number, f: any) => sum + f.floorTotal, 0),
    metrics: { m_builtUp, m_slab, m_wall, m_doors, m_windows, m_paint }
  };
};