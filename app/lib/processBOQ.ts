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
  masterSettings: AdminSettings
) => {
  const safeRates = rates || {};
  const overhang = Number(slabOverhang) || 0;

  // DYNAMIC MATERIAL WASTAGE FETCHERS
  const getWastage = (material: string, defaultVal: number) => {
    return 1 + ((masterSettings?.percentages?.wastage?.[material] ?? defaultVal) / 100);
  };

  // DYNAMIC CONCRETE CONSUMPTION ALLOWANCES (Buffers for spills, forms bulging, etc.)
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

  // The 'extraMultiplier' is now driven by your new Admin Consumption Metrics
  const calculateConcrete = (wetVolCft: number, ratio: any, extraMultiplier: number = 1) => {
    const dryVol = wetVolCft * 1.54 * extraMultiplier; // Standard Civil 1.54 Dry Volume Factor
    const totalParts = (ratio?.c || 1) + (ratio?.s || 2) + (ratio?.g || 4);
    return {
      cement: Math.ceil((((ratio?.c || 1) / totalParts) * dryVol / 1.25) * wCement),
      sand: Math.ceil((((ratio?.s || 2) / totalParts) * dryVol) * wSand),
      gravel: Math.ceil((((ratio?.g || 4) / totalParts) * dryVol) * wGravel)
    };
  };

  let profile = { main: { s: '16mm', c: 4 }, extra: null as { s: string, c: number } | null };
  if (totalFloorsCount >= 2 && totalFloorsCount <= 3) profile.extra = { s: '12mm', c: 2 };
  else if (totalFloorsCount >= 4 && totalFloorsCount <= 5) profile.extra = { s: '12mm', c: 4 };
  else if (totalFloorsCount >= 6 && totalFloorsCount <= 7) { profile.main = { s: '20mm', c: 4 }; profile.extra = { s: '16mm', c: 4 }; }
  else if (totalFloorsCount >= 8) { profile.main = { s: '20mm', c: 4 }; profile.extra = { s: '16mm', c: 6 }; }

  let m_builtUp = 0, m_slab = 0, m_wall = 0, m_doors = 0, m_windows = 0, m_paint = 0;

  const getRoomArea = (room: any) => (Number(room?.length) || 0) * (Number(room?.breadth) || 0);
  const getRoomPerimeter = (room: any) => ((Number(room?.length) || 0) + (Number(room?.breadth) || 0)) * 2;

  const floorReports = finalSnaps.map((snap: any, idx: number) => {
    const currentLayout = snap?.layout || {};
    const currentStructure = snap?.structure || {};
    const currentOpenings = snap?.openings || {};
    const currentTiles = snap?.tiles || {};
    const currentPaintData = snap?.paintData || {};
    const currentLaborRates = snap?.laborRates || {};
    const currentHasStairs = snap?.hasStairs || false;
    const currentStairsDim = snap?.stairsDim || { length: 0, width: 0 };

    const sections: any[] = [];
    let floorBaseCost = 0; 

    const staticRoomsArea = getRoomArea(currentLayout?.hall) + getRoomArea(currentLayout?.kitchenDining) + getRoomArea(currentLayout?.foyer);
    const dynamicBedroomsArea = (currentLayout?.bedrooms || []).reduce((sum: number, r: any) => sum + getRoomArea(r), 0);
    const dynamicBathsArea = (currentLayout?.bathrooms || []).reduce((sum: number, r: any) => sum + (r.isAttached && r.layoutType === 'inside' ? 0 : getRoomArea(r)), 0);
    const stairsArea = currentHasStairs ? (Number(currentStairsDim?.length) * Number(currentStairsDim?.width) || 0) : 0;
    const layoutArea = staticRoomsArea + dynamicBedroomsArea + dynamicBathsArea + stairsArea;

    const staticPeri = getRoomPerimeter(currentLayout?.hall) + getRoomPerimeter(currentLayout?.kitchenDining) + getRoomPerimeter(currentLayout?.foyer);
    const dynamicBedroomsPeri = (currentLayout?.bedrooms || []).reduce((sum: number, r: any) => sum + getRoomPerimeter(r), 0);
    const dynamicBathsPeri = (currentLayout?.bathrooms || []).reduce((sum: number, r: any) => sum + (r.isAttached && r.layoutType === 'inside' ? 0 : getRoomPerimeter(r)), 0);
    const layoutPerimeter = staticPeri + dynamicBedroomsPeri + dynamicBathsPeri;

    const baseSide = Math.sqrt(layoutArea) || 0;
    const slabSide = baseSide + overhang;
    const adjustedSlabArea = Math.pow(slabSide, 2);
    
    const plinthPerimeter = baseSide * 4;
    const roofPerimeter = slabSide * 4;

    const colCount = Number(currentStructure?.footing?.count) || Math.ceil(layoutArea / 100);
    const colHt = Number(currentStructure?.column?.height) || 10;
    const colBIn = Number(currentStructure?.column?.breadth) || 12;
    const colWIn = Number(currentStructure?.column?.width) || 12;
    const calculateRingFt = (l: number, w: number) => (((l - 3) + (w - 3)) * 2) / 12;

    const addSection = (title: string, items: any[]) => {
      const sectionTotal = items.reduce((sum, item) => sum + (Math.ceil((item.qty || 0) * (item.rate || 0))), 0);
      sections.push({ title, items, sectionTotal });
      floorBaseCost += sectionTotal;
    };

    if (idx === 0) {
      const fB = Number(currentStructure?.footing?.breadth) || 4; 
      const fW = Number(currentStructure?.footing?.width) || 4;
      const depth = Number(currentStructure?.footing?.depth) || 4;
      const pD = Number(currentStructure?.plinthBeam?.depth) || 12;
      const plW = Number(currentStructure?.plinthBeam?.width) || 12;
      
      const pitBoulderThicknessFt = 6 / 12; 
      const padThicknessFt = 5 / 12;     
      
      const gfPlinthBoulderCft = layoutArea * (9 / 12); 
      const gfFloorPccVol = layoutArea * (4 / 12);      
      
      const pitBoulderCft = colCount * (fB * fW * pitBoulderThicknessFt);
      const padVolume = colCount * (fB * fW * padThicknessFt);
      const padConc = calculateConcrete(padVolume, masterSettings?.ratios?.footing, getAllowance('footing', 5));

      const pitColumnHeight = Math.max(0, depth - pitBoulderThicknessFt - padThicknessFt);
      const pitColumnVolume = colCount * ((colBIn / 12) * (colWIn / 12) * pitColumnHeight);
      const starterConc = calculateConcrete(pitColumnVolume, masterSettings?.ratios?.column, getAllowance('column', 5));

      const floorPccConc = calculateConcrete(gfFloorPccVol, masterSettings?.ratios?.pcc, 1.0); // Flat allowance for floors

      const starterHt = 1 + depth + (pD / 12);
      const meshBarsL = (fW / 0.5) + 1;
      const meshBarsW = (fB / 0.5) + 1;
      const totalMeshFtPerFooting = (meshBarsL * fB) + (meshBarsW * fW);
      const grandTotalMeshFt = totalMeshFtPerFooting * colCount;
      const starterRingsQty = (starterHt * 12 / (masterSettings?.dimensions?.ringSpacing || 5)) * colCount;

      addSection("1. Foundation & Substructure", [
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

        { name: `Starter Main (${profile.main.s})`, qty: Math.ceil(getWeight(profile.main.s, starterHt * colCount * profile.main.c)), unit: "KG", rate: safeRates.tmt?.[profile.main.s] || 0 },
        { name: "Starter Rings (8mm)", qty: Math.ceil(getWeight('8mm', starterRingsQty * calculateRingFt(colBIn, colWIn))), unit: "KG", rate: safeRates.tmt?.['8mm'] || 0 }
      ]);

      const plConc = calculateConcrete(plinthPerimeter * (pD / 12 * plW / 12), masterSettings?.ratios?.plinthBeam, getAllowance('plinthBeam', 5));
      const plRings = (plinthPerimeter * 12) / (masterSettings?.dimensions?.ringSpacing || 5);

      addSection("2. Plinth Beams", [
        { name: "Cement", qty: plConc.cement, unit: "BAG", rate: safeRates.cement || 0 },
        { name: "Sand", qty: plConc.sand, unit: "CFT", rate: safeRates.sand || 0 },
        { name: "Gravel", qty: plConc.gravel, unit: "CFT", rate: safeRates.gravel || 0 },
        { name: `TMT Main (${profile.main.s})`, qty: Math.ceil(getWeight(profile.main.s, plinthPerimeter * profile.main.c)), unit: "KG", rate: safeRates.tmt?.[profile.main.s] || 0 },
        { name: "TMT Rings (8mm)", qty: Math.ceil(getWeight('8mm', plRings * calculateRingFt(pD, plW))), unit: "KG", rate: safeRates.tmt?.['8mm'] || 0 }
      ]);
    }

    const rD = Number(currentStructure?.roofBeam?.depth) || 12;
    const rW = Number(currentStructure?.roofBeam?.width) || 12;
    const roofConc = calculateConcrete(roofPerimeter * (rD / 12 * rW / 12), masterSettings?.ratios?.beam, getAllowance('roofBeam', 5));
    const roofRings = (roofPerimeter * 12) / (masterSettings?.dimensions?.ringSpacing || 5);

    addSection("3. Roof Beams", [
      { name: "Cement", qty: roofConc.cement, unit: "BAG", rate: safeRates.cement || 0 },
      { name: "Sand", qty: roofConc.sand, unit: "CFT", rate: safeRates.sand || 0 },
      { name: "Gravel", qty: roofConc.gravel, unit: "CFT", rate: safeRates.gravel || 0 },
      { name: `TMT Main (${profile.main.s})`, qty: Math.ceil(getWeight(profile.main.s, roofPerimeter * profile.main.c)), unit: "KG", rate: safeRates.tmt?.[profile.main.s] || 0 },
      { name: "TMT Rings (8mm)", qty: Math.ceil(getWeight('8mm', roofRings * calculateRingFt(rD, rW))), unit: "KG", rate: safeRates.tmt?.['8mm'] || 0 }
    ]);

    const colConc = calculateConcrete((colBIn / 12 * colWIn / 12 * colHt) * colCount, masterSettings?.ratios?.column, getAllowance('column', 5));
    const colRings = (colHt * 12 / (masterSettings?.dimensions?.ringSpacing || 5)) * colCount;

    addSection("4. Columns", [
      { name: "Cement", qty: colConc.cement, unit: "BAG", rate: safeRates.cement || 0 },
      { name: "Sand", qty: colConc.sand, unit: "CFT", rate: safeRates.sand || 0 },
      { name: "Gravel", qty: colConc.gravel, unit: "CFT", rate: safeRates.gravel || 0 },
      { name: `TMT Main (${profile.main.s})`, qty: Math.ceil(getWeight(profile.main.s, colCount * colHt * profile.main.c)), unit: "KG", rate: safeRates.tmt?.[profile.main.s] || 0 },
      { name: "TMT Rings (8mm)", qty: Math.ceil(getWeight('8mm', colRings * calculateRingFt(colBIn, colWIn))), unit: "KG", rate: safeRates.tmt?.['8mm'] || 0 }
    ]);

    const pieces = (slabSide * 12) / (masterSettings?.dimensions?.meshGap || 4);
    const totalSlabSteelFt = (pieces * slabSide) + (pieces * slabSide);

    const slabConc = calculateConcrete(adjustedSlabArea * ((masterSettings?.dimensions?.slabThickness || 5) / 12), masterSettings?.ratios?.slab, getAllowance('slab', 25));
    
    addSection("5. Roof Slab", [
      { name: "Cement", qty: slabConc.cement, unit: "BAG", rate: safeRates.cement || 0 },
      { name: "Sand", qty: slabConc.sand, unit: "CFT", rate: safeRates.sand || 0 },
      { name: "Gravel", qty: slabConc.gravel, unit: "CFT", rate: safeRates.gravel || 0 },
      { name: "TMT Slab (10mm)", qty: Math.ceil(getWeight('10mm', totalSlabSteelFt)), unit: "KG", rate: safeRates.tmt?.['10mm'] || 0 }
    ]);

    if (currentHasStairs && Number(currentStairsDim?.width) > 0 && Number(currentStairsDim?.length) > 3) {
      const sW = Number(currentStairsDim.width);
      const sL = Number(currentStairsDim.length);
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
    const mainDoorArea = Number(currentOpenings?.mainDoor?.height || 0) * Number(currentOpenings?.mainDoor?.width || 0) * Number(currentOpenings?.mainDoor?.count || 0);
    const roomDoorsArea = (currentOpenings?.roomDoors || []).reduce((sum: number, d: any) => sum + (Number(d?.height||0) * Number(d?.width||0) * Number(d?.count||0)), 0);
    const bathroomDoorsArea = (currentOpenings?.bathroomDoors || []).reduce((sum: number, d: any) => sum + (Number(d?.height||0) * Number(d?.width||0) * Number(d?.count||0)), 0);
    const windowsArea = (currentOpenings?.windows || []).reduce((sum: number, w: any) => sum + (Number(w?.height||0) * Number(w?.width||0) * Number(w?.count||0)), 0);
    const ventArea = (currentOpenings?.ventilations || []).reduce((sum: number, v: any) => sum + (Number(v?.height||0) * Number(v?.width||0) * Number(v?.count||0)), 0);
    
    const netWallArea = Math.max(0, grossWallArea - (mainDoorArea + roomDoorsArea + bathroomDoorsArea + windowsArea + ventArea));
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
    m_doors += (mainDoorArea + roomDoorsArea + bathroomDoorsArea);
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

    const doorsWindowsItems = [];
    if (Number(currentOpenings?.mainDoor?.count) > 0) doorsWindowsItems.push({ name: "Main Door", qty: Number(currentOpenings.mainDoor.count), unit: "NOS", rate: Number(safeRates.mainDoorPrice) || 0 });
    
    let roomDoorQty = (currentOpenings?.roomDoors || []).reduce((sum: number, d: any) => sum + Number(d?.count || 0), 0);
    if (roomDoorQty > 0) doorsWindowsItems.push({ name: "Room Doors", qty: roomDoorQty, unit: "NOS", rate: Number(safeRates.roomDoorPrice) || 0 });
    if (roomDoorQty > 0 && Number(safeRates.doorFramePrice) > 0) {
      doorsWindowsItems.push({ name: "Room Door Frames", qty: roomDoorQty, unit: "NOS", rate: Number(safeRates.doorFramePrice) });
    }

    let bathDoorQty = (currentOpenings?.bathroomDoors || []).reduce((sum: number, d: any) => sum + Number(d?.count || 0), 0);
    if (bathDoorQty > 0) doorsWindowsItems.push({ name: "Bathroom Doors", qty: bathDoorQty, unit: "NOS", rate: Number(safeRates.bathroomDoorPrice) || 0 });
    if (bathDoorQty > 0 && Number(safeRates.doorFramePrice) > 0) {
      doorsWindowsItems.push({ name: "Bathroom Door Frames", qty: bathDoorQty, unit: "NOS", rate: Number(safeRates.doorFramePrice) });
    }
    
    if (windowsArea > 0) doorsWindowsItems.push({ name: `Windows (${safeRates.windowMaterial || 'Standard'})`, qty: windowsArea, unit: "SQFT", rate: Number(safeRates.windowRate) || 0 });
    if (ventArea > 0) doorsWindowsItems.push({ name: "Ventilations", qty: ventArea, unit: "SQFT", rate: Number(safeRates.windowRate) || 0 });
    
    const dwSubtotal = doorsWindowsItems.reduce((acc, item) => acc + (item.qty * item.rate), 0);
    if (dwSubtotal > 0) {
      doorsWindowsItems.push({ name: "Hinges, Locks & Hardware", qty: 15, unit: "%", rate: (dwSubtotal / 100) });
    }

    if (doorsWindowsItems.length > 0) addSection("7. Doors & Windows", doorsWindowsItems);

    const tileItems: any[] = [];
    const rooms = [
      { key: 'hall', area: getRoomArea(currentLayout?.hall), label: 'Hall' },
      { key: 'kitchenDining', area: getRoomArea(currentLayout?.kitchenDining), label: 'Kitchen & Dining' },
      { key: 'foyer', area: getRoomArea(currentLayout?.foyer), label: 'Foyer' },
      ...(currentLayout?.bedrooms || []).map((r: any, i: number) => ({ key: `bedroom_${i}`, area: getRoomArea(r), label: `Bedroom ${i+1}` })),
      ...(currentLayout?.bathrooms || []).map((r: any, i: number) => ({ key: `bathroom_${i}`, area: getRoomArea(r), label: `Bathroom ${i+1}` })),
      { key: 'bathroomWalls', area: dynamicBathsPeri * colHt * 0.8, label: 'Bathroom Walls' },
      { key: 'skirting', area: layoutPerimeter * 0.5, label: 'Internal Skirting (6in)' }
    ];
    
    let totalTileArea = 0;
    rooms.forEach(r => {
      const t = currentTiles[r.key];
      if (t && Number(t.price) > 0 && r.area > 0) {
        if (!r.key.includes('bathroomWalls') && !r.key.includes('skirting')) {
           totalTileArea += r.area;
        }
        
        const sizeStr = t.size || '2x2';
        const [tl, tw] = sizeStr.split('x').map(Number);
        const sqftPerTile = (tl && tw) ? (tl * tw) : 4; 
        const pieces = Math.ceil((r.area / sqftPerTile) * wTiles);
        
        tileItems.push({ name: `${r.label} Tiles (${sizeStr}, ${t.type || 'Standard'})`, qty: pieces, unit: "PIECES", rate: Number(t.price) });
      }
    });

    if (totalTileArea > 0) {
        const beddingConc = calculateConcrete(totalTileArea * (masterSettings?.consumption?.tileBeddingCftPerSqft || 0.20), masterSettings?.ratios?.tileBedding);
        tileItems.push({ name: "Bedding Cement", qty: beddingConc.cement, unit: "BAG", rate: safeRates.cement || 0 });
        tileItems.push({ name: "Bedding Sand", qty: beddingConc.sand, unit: "CFT", rate: safeRates.sand || 0 });
    }
    if (tileItems.length > 0) addSection("8. Flooring & Tiles", tileItems);

    const puttyBags = Math.ceil((floorPaintArea / (masterSettings?.consumption?.puttyCoverage || 10)) / 40);
    const exteriorWallArea = roofPerimeter * colHt;

    addSection("9. Painting Material", [
      { name: "Wall Putty (40kg Bag)", qty: puttyBags, unit: "BAG", rate: Number(currentPaintData?.puttyRate) || 0 },
      { name: `Interior Paint (${currentPaintData?.brand || 'Standard'})`, qty: Math.ceil(floorPaintArea / (masterSettings?.consumption?.interiorPaintCoverage || 50)), unit: "LITER", rate: Number(currentPaintData?.interiorRate) || 0 },
      { name: `Exterior Paint (${currentPaintData?.brand || 'Standard'})`, qty: Math.ceil(exteriorWallArea / (masterSettings?.consumption?.exteriorPaintCoverage || 50)), unit: "LITER", rate: Number(currentPaintData?.exteriorRate) || 0 }
    ]);

    const masonQty = Math.ceil(adjustedSlabArea);
    const tileQty = Math.ceil(layoutArea);
    const painterQty = Math.ceil(floorPaintArea + exteriorWallArea);
    
    const masonRate = Number(currentLaborRates?.mason) || 0;
    const tilerRate = Number(currentLaborRates?.tiler) || 0;
    const painterRate = Number(currentLaborRates?.painter) || 0;

    const baseCostForPercentages = floorBaseCost + (masonQty * masonRate) + (tileQty * tilerRate) + (painterQty * painterRate);
    const percentageRateMultiplier = baseCostForPercentages / 100;

    addSection("10. Master Labor & Services", [
      { name: "Mason Labor", qty: masonQty, unit: "SQFT (SLAB)", rate: masonRate },
      { name: "Tile Labor", qty: tileQty, unit: "SQFT (FLOOR)", rate: tilerRate },
      { name: "Painter Labor", qty: painterQty, unit: "SQFT", rate: painterRate },
      { name: "Props & Shuttering Material", qty: Number(masterSettings?.percentages?.shuttering || 10), unit: "%", rate: percentageRateMultiplier },
      { name: "Electrical System", qty: Number(masterSettings?.percentages?.electrical || 12), unit: "%", rate: percentageRateMultiplier },
      { name: "Plumbing & Sanitary", qty: Number(masterSettings?.percentages?.plumbing || 8), unit: "%", rate: percentageRateMultiplier },
      { name: "Logistics & Transport", qty: Number(masterSettings?.percentages?.logistics || 8), unit: "%", rate: percentageRateMultiplier },
      { name: "Miscellaneous", qty: Number(masterSettings?.percentages?.misc || 5), unit: "%", rate: percentageRateMultiplier }
    ]);

    return { floorName: snap?.floorName || 'Floor', sections, layoutArea, adjustedSlabArea, floorTotal: floorBaseCost };
  });

  return {
    floorReports,
    grandTotal: floorReports.reduce((sum: number, f: any) => sum + f.floorTotal, 0),
    metrics: { m_builtUp, m_slab, m_wall, m_doors, m_windows, m_paint }
  };
};