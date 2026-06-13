// app/lib/processBOQ.ts

export interface AdminSettings {
  ratios: any;
  tmtSpecs: any;
  dimensions: any;
  percentages: any;
  consumption: any;
  premiumDefaults?: any; 
}

export interface PremiumFloorInputs {
  customFootingMesh?: string;
  customFootingThickness?: number;
  floorType?: 'PCC' | 'RCC';
  floorThickness?: number;
  floorRccMeshSize?: string;
  hasSillBeam?: boolean;
  sillDepth?: number;
  sillWidth?: number;
  hasLintelBeam?: boolean;
  lintelDepth?: number;
  lintelWidth?: number;
  isBasement?: boolean;
  wallType?: 'Brick' | 'RCC';
  rccWallThickness?: number;
  rccWallMeshSize?: string;
  customSlabMesh?: string;
}

export const generateProjectBOQ = (
  finalSnaps: any[], 
  totalFloorsCount: number, 
  slabOverhang: string | number, 
  rates: any, 
  masterSettings: AdminSettings,
  units: Record<string, string> = {},
  boqScope: string = 'full',
  premiumData?: PremiumFloorInputs 
) => {
  const safeRates = rates || {};
  
  // Mathematical Engine dynamically translates user-selected units into feet for core processing
  const toFeet = (val: any, unitType: string = 'feet') => {
    const n = Number(val) || 0;
    if (unitType === 'meters') return n * 3.28084;
    if (unitType === 'mm') return n * 0.00328084;
    if (unitType === 'cm') return n * 0.0328084;
    if (unitType === 'inches') return n / 12;
    return n; 
  };

  const overhang = toFeet(slabOverhang, units.layout);

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

  const getRoomArea = (room: any) => toFeet(room?.length || room?.width, units.layout) * toFeet(room?.breadth || room?.width, units.layout);
  const getRoomPerimeter = (room: any) => (toFeet(room?.length || room?.width, units.layout) + toFeet(room?.breadth || room?.width, units.layout)) * 2;

  const floorReports = finalSnaps.map((snap: any, idx: number) => {
    const sections: any[] = [];
    let floorBaseCost = 0; 

    const addSection = (title: string, rawItems: any[]) => {
      const items = rawItems.filter(item => item && (Number(item.qty) > 0) && (Number(item.rate) > 0));
      if (items.length === 0) return; 

      const sectionTotal = items.reduce((sum, item) => sum + (Math.ceil(Number(item.qty) * Number(item.rate))), 0);
      sections.push({ title, items, sectionTotal });
      floorBaseCost += sectionTotal;
    };

    const currentStructure = snap?.structure || {};
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
    const tbTmt = parseTmt(currentStructure?.tieBeam, profile);
    const rbTmt = parseTmt(currentStructure?.roofBeam, profile);
    
    const calculateRingFt = (bFt: number, wFt: number) => (((bFt - 0.25) + (wFt - 0.25)) * 2); 

    // =========================================================================================
    // NATIVE BOUNDARY WALL ENGINE BYPASS
    // =========================================================================================
    if (snap?.buildingType === 'boundary' || snap?.boundaryData?.totalPerimeter > 0) {
        const bData = snap.boundaryData;
        const perimeter = Number(bData.totalPerimeter) || 0;
        const wallHeight = Number(bData.wallHeight) || 6;
        const colCount = Number(currentStructure?.footing?.count) || Math.ceil(perimeter / 10) + 1;
        
        const fB = toFeet(currentStructure?.footing?.breadth, units.boundaryLayout); 
        const fW = toFeet(currentStructure?.footing?.width, units.boundaryLayout);
        const depth = toFeet(currentStructure?.footing?.depth, units.boundaryLayout);
        
        const colHt = wallHeight + depth; // Total column height from footing to top
        const colB = toFeet(currentStructure?.column?.breadth, units.columnDim);
        const colW = toFeet(currentStructure?.column?.width, units.columnDim);

        // 1. Foundation & Columns
        const padThicknessFt = (premiumData?.customFootingThickness || masterSettings?.premiumDefaults?.footingThickness || 5) / 12;
        const footingMesh = premiumData?.customFootingMesh || masterSettings?.premiumDefaults?.footingMesh || '10mm';
        
        const padVolume = colCount * (fB * fW * padThicknessFt);
        const padConc = calculateConcrete(padVolume, masterSettings?.ratios?.footing, getAllowance('footing', 5));
        const pitColumnHeight = Math.max(0, depth - padThicknessFt);
        const starterConc = calculateConcrete(colCount * (colB * colW * pitColumnHeight), masterSettings?.ratios?.column, getAllowance('column', 5));
        const aboveGroundConc = calculateConcrete(colCount * (colB * colW * wallHeight), masterSettings?.ratios?.column, getAllowance('column', 5));

        const totalMeshFt = ((fW / 0.5 + 1) * fB + (fB / 0.5 + 1) * fW) * colCount;
        const colRings = (colHt / (masterSettings?.dimensions?.ringSpacing / 12 || 0.416)) * colCount;

        addSection("1. Foundation & Substructure", [
            { name: `Footing Pad Cement (${padThicknessFt * 12}in)`, qty: padConc.cement, unit: "BAG", rate: safeRates.cement || 0 },
            { name: "Footing Pad Sand", qty: padConc.sand, unit: "CFT", rate: safeRates.sand || 0 },
            { name: "Footing Pad Gravel", qty: padConc.gravel, unit: "CFT", rate: safeRates.gravel || 0 },
            { name: `Footing Pad TMT Mesh (${footingMesh})`, qty: Math.ceil(getWeight(footingMesh, totalMeshFt)), unit: "KG", rate: safeRates.tmt?.[footingMesh] || 0 },
            { name: "Sub-ground Column Cement", qty: starterConc.cement, unit: "BAG", rate: safeRates.cement || 0 },
            { name: "Sub-ground Column Sand", qty: starterConc.sand, unit: "CFT", rate: safeRates.sand || 0 },
            { name: "Sub-ground Column Gravel", qty: starterConc.gravel, unit: "CFT", rate: safeRates.gravel || 0 },
            { name: `Column Main TMT (${colTmt.mainSize})`, qty: Math.ceil(getWeight(colTmt.mainSize, colHt * colCount * colTmt.mainCount)), unit: "KG", rate: safeRates.tmt?.[colTmt.mainSize] || 0 },
            { name: `Column Rings (${colTmt.ringSize})`, qty: Math.ceil(getWeight(colTmt.ringSize, colRings * calculateRingFt(colB, colW))), unit: "KG", rate: safeRates.tmt?.[colTmt.ringSize] || 0 }
        ]);

        // 1B. Tie Beam
        if (currentStructure?.tieBeam?.hasTieBeam) {
            const tD = toFeet(currentStructure?.tieBeam?.depth, units.tieBeam || 'inches');
            const tW = toFeet(currentStructure?.tieBeam?.width, units.tieBeam || 'inches');
            const tbConc = calculateConcrete(perimeter * (tD * tW), masterSettings?.ratios?.plinthBeam, getAllowance('plinthBeam', 5));
            const tbRings = perimeter / (masterSettings?.dimensions?.ringSpacing / 12 || 0.416);
            
            const tbItems = [
                { name: "Cement", qty: tbConc.cement, unit: "BAG", rate: safeRates.cement || 0 },
                { name: "Sand", qty: tbConc.sand, unit: "CFT", rate: safeRates.sand || 0 },
                { name: "Gravel", qty: tbConc.gravel, unit: "CFT", rate: safeRates.gravel || 0 },
                { name: `TMT Main (${tbTmt.mainSize})`, qty: Math.ceil(getWeight(tbTmt.mainSize, perimeter * tbTmt.mainCount)), unit: "KG", rate: safeRates.tmt?.[tbTmt.mainSize] || 0 },
                { name: `TMT Rings (${tbTmt.ringSize})`, qty: Math.ceil(getWeight(tbTmt.ringSize, tbRings * calculateRingFt(tD, tW))), unit: "KG", rate: safeRates.tmt?.[tbTmt.ringSize] || 0 }
            ];
            addSection("1B. Tie Beams (Foundation)", tbItems);
        }

        // 2. Plinth Beam
        const pD = toFeet(currentStructure?.plinthBeam?.depth, units.plinthBeam);
        const plW = toFeet(currentStructure?.plinthBeam?.width, units.plinthBeam);
        const plConc = calculateConcrete(perimeter * (pD * plW), masterSettings?.ratios?.plinthBeam, getAllowance('plinthBeam', 5));
        const plRings = perimeter / (masterSettings?.dimensions?.ringSpacing / 12 || 0.416);
        
        addSection("2. Plinth Beams", [
            { name: "Cement", qty: plConc.cement, unit: "BAG", rate: safeRates.cement || 0 },
            { name: "Sand", qty: plConc.sand, unit: "CFT", rate: safeRates.sand || 0 },
            { name: "Gravel", qty: plConc.gravel, unit: "CFT", rate: safeRates.gravel || 0 },
            { name: `TMT Main (${pbTmt.mainSize})`, qty: Math.ceil(getWeight(pbTmt.mainSize, perimeter * pbTmt.mainCount)), unit: "KG", rate: safeRates.tmt?.[pbTmt.mainSize] || 0 },
            { name: `TMT Rings (${pbTmt.ringSize})`, qty: Math.ceil(getWeight(pbTmt.ringSize, plRings * calculateRingFt(pD, plW))), unit: "KG", rate: safeRates.tmt?.[pbTmt.ringSize] || 0 }
        ]);

        // 3. Columns Above Ground
        addSection("3. Columns (Above Ground)", [
            { name: "Cement", qty: aboveGroundConc.cement, unit: "BAG", rate: safeRates.cement || 0 },
            { name: "Sand", qty: aboveGroundConc.sand, unit: "CFT", rate: safeRates.sand || 0 },
            { name: "Gravel", qty: aboveGroundConc.gravel, unit: "CFT", rate: safeRates.gravel || 0 }
        ]);

        // 4. Brickwork & Masonry
        const netWallArea = perimeter * wallHeight;
        let brickMultiplier = bData.wallType === 'Double Brick (9 Inch)' ? 10 : 5;
        const estimatedBricks = Math.ceil(netWallArea * brickMultiplier * wBricks);
        const joiningVol = netWallArea * (masterSettings?.consumption?.brickJoiningCftPerSqft || 0.10) * (brickMultiplier / 5);
        const joiningConc = calculateConcrete(joiningVol, masterSettings?.ratios?.mortar);

        const masonryItems = [
            { name: `Bricks (${bData.wallType})`, qty: estimatedBricks, unit: "NOS", rate: safeRates.bricks || 0 },
            { name: "Cement for Brick Joining", qty: joiningConc.cement, unit: "BAG", rate: safeRates.cement || 0 },
            { name: "Sand for Brick Joining", qty: joiningConc.sand, unit: "CFT", rate: safeRates.sand || 0 }
        ];

        // Plastering logic
        if (bData.finish !== 'No Plaster') {
            const plasterMultiplier = bData.finish === 'Plaster Both Sides' ? 2 : 1;
            const plasterVol = netWallArea * (masterSettings?.consumption?.plasterCftPerSqft || 0.10) * plasterMultiplier;
            const plasterConc = calculateConcrete(plasterVol, masterSettings?.ratios?.mortar);
            masonryItems.push(
                { name: `Cement for Wall Plaster (${bData.finish})`, qty: plasterConc.cement, unit: "BAG", rate: safeRates.cement || 0 },
                { name: `Sand for Wall Plaster (${bData.finish})`, qty: plasterConc.sand, unit: "CFT", rate: safeRates.sand || 0 }
            );
        }
        addSection("4. Masonry & Plastering", masonryItems);

        // 5. Toppings
        if (bData.topping && bData.topping !== 'None' && safeRates.toppingRate) {
            addSection("5. Security Topping", [
                { name: `Boundary Topping (${bData.topping})`, qty: Math.ceil(perimeter), unit: "RFT", rate: Number(safeRates.toppingRate) }
            ]);
        }

        // 6. Labor
        addSection("Master Labor & Services", [
            { name: "Mason Labor (Perimeter)", qty: Math.ceil(perimeter), unit: "RFT", rate: Number(snap?.laborRates?.mason) || 0 }
        ]);

        m_builtUp += 0;
        m_slab += 0;
        m_wall += netWallArea;

        return { floorName: snap?.floorName || 'Boundary Wall Estimate', sections, layoutArea: 0, adjustedSlabArea: 0, floorTotal: floorBaseCost };
    }
    // =========================================================================================

    // --- STANDARD RESIDENCE / APARTMENT / COMMERCIAL LOGIC ---
    const currentLayout = snap?.layout || {};
    const currentOpenings = snap?.openings || {};
    const currentTiles = snap?.tiles || {};
    const currentPaintData = snap?.paintData || {};
    const currentLaborRates = snap?.laborRates || {};
    const currentHasStairs = snap?.hasStairs || false;
    const currentStairsDim = snap?.stairsDim || { length: 0, width: 0 };
    const buildingType = snap?.buildingType || 'residence';

    let layoutArea = 0; // Enclosed rooms taking roof load
    let cantileverArea = 0; // Open spaces (Balcony/Porch)
    let layoutPerimeter = 0;
    let totalBathsPeri = 0;

    const tileAreas: Record<string, number> = {
      hall: 0, kitchenDining: 0, foyer: 0, balcony: 0, passage: 0, porch: 0,
      commercialShops: 0, commercialWashrooms: 0, corridor: 0, bathroomWalls: 0, skirting: 0
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
        
        if (currentLayout.passage) {
            const pArea = getRoomArea(currentLayout.passage);
            layoutArea += pArea;
            layoutPerimeter += getRoomPerimeter(currentLayout.passage);
            tileAreas.passage = (tileAreas.passage || 0) + pArea;
        }
      } else {
        (currentLayout.flats || []).forEach((flat: any) => {
          const fHallArea = getRoomArea(flat.hall);
          const fKitchenArea = getRoomArea(flat.kitchen);
          const fFoyerArea = getRoomArea(flat.foyer);
          const fPassageArea = getRoomArea(flat.passage);
          const fBalconyArea = getRoomArea(flat.balcony);
          const fPorchArea = getRoomArea(flat.porch);

          layoutArea += fHallArea + fKitchenArea + fFoyerArea + fPassageArea;
          cantileverArea += fBalconyArea + fPorchArea;

          layoutPerimeter += getRoomPerimeter(flat.hall) + getRoomPerimeter(flat.kitchen) + getRoomPerimeter(flat.foyer) + getRoomPerimeter(flat.passage);
          layoutPerimeter += getRoomPerimeter(flat.balcony) + getRoomPerimeter(flat.porch);
          
          tileAreas.hall += fHallArea;
          tileAreas.kitchenDining += fKitchenArea;
          tileAreas.foyer += fFoyerArea;
          tileAreas.passage += fPassageArea;
          tileAreas.balcony += fBalconyArea;
          tileAreas.porch += fPorchArea;

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
      const staticRoomsArea = getRoomArea(currentLayout?.hall) + getRoomArea(currentLayout?.kitchenDining) + getRoomArea(currentLayout?.foyer) + getRoomArea(currentLayout?.passage);
      const openRoomsArea = getRoomArea(currentLayout?.balcony) + getRoomArea(currentLayout?.porch);
      const dynamicBedroomsArea = (currentLayout?.bedrooms || []).reduce((sum: number, r: any) => sum + getRoomArea(r), 0);
      const dynamicBathsArea = (currentLayout?.bathrooms || []).reduce((sum: number, r: any) => sum + (r.isAttached && r.layoutType === 'inside' ? 0 : getRoomArea(r)), 0);
      const stairsArea = currentHasStairs ? getRoomArea(currentStairsDim) : 0;
      
      layoutArea = staticRoomsArea + dynamicBedroomsArea + dynamicBathsArea + stairsArea;
      cantileverArea = openRoomsArea;

      const staticPeri = getRoomPerimeter(currentLayout?.hall) + getRoomPerimeter(currentLayout?.kitchenDining) + getRoomPerimeter(currentLayout?.foyer) + getRoomPerimeter(currentLayout?.passage);
      const openPeri = getRoomPerimeter(currentLayout?.balcony) + getRoomPerimeter(currentLayout?.porch);
      const dynamicBedroomsPeri = (currentLayout?.bedrooms || []).reduce((sum: number, r: any) => sum + getRoomPerimeter(r), 0);
      const dynamicBathsPeri = (currentLayout?.bathrooms || []).reduce((sum: number, r: any) => sum + (r.isAttached && r.layoutType === 'inside' ? 0 : getRoomPerimeter(r)), 0);
      const stairsPeri = currentHasStairs ? getRoomPerimeter(currentStairsDim) : 0;
      
      layoutPerimeter = staticPeri + openPeri + dynamicBedroomsPeri + dynamicBathsPeri + stairsPeri;

      totalBathsPeri = (currentLayout?.bathrooms || []).reduce((sum: number, r: any) => sum + getRoomPerimeter(r), 0);
      
      tileAreas.hall = getRoomArea(currentLayout?.hall);
      tileAreas.kitchenDining = getRoomArea(currentLayout?.kitchenDining);
      tileAreas.foyer = getRoomArea(currentLayout?.foyer);
      tileAreas.passage = getRoomArea(currentLayout?.passage);
      tileAreas.balcony = getRoomArea(currentLayout?.balcony);
      tileAreas.porch = getRoomArea(currentLayout?.porch);
      (currentLayout?.bedrooms || []).forEach((b: any, i: number) => tileAreas[`bedroom_${i}`] = getRoomArea(b));
      (currentLayout?.bathrooms || []).forEach((b: any, i: number) => tileAreas[`bathroom_${i}`] = getRoomArea(b));
    }

    const baseSide = Math.sqrt(layoutArea + cantileverArea) || 0;
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

    const colCount = Number(currentStructure?.footing?.count) || Math.ceil((layoutArea + cantileverArea) / 100);
    
    const colHt = toFeet(currentStructure?.column?.height, units.columnHeight);
    const colB = toFeet(currentStructure?.column?.breadth, units.columnDim);
    const colW = toFeet(currentStructure?.column?.width, units.columnDim);

    if (idx === 0) {
      const fB = toFeet(currentStructure?.footing?.breadth, units.footing); 
      const fW = toFeet(currentStructure?.footing?.width, units.footing);
      const depth = toFeet(currentStructure?.footing?.depth, units.footing);
      const pD = toFeet(currentStructure?.plinthBeam?.depth, units.plinthBeam);
      const plW = toFeet(currentStructure?.plinthBeam?.width, units.plinthBeam);
      
      const pitBoulderThicknessFt = 6 / 12; 
      
      const padThicknessFt = (premiumData?.customFootingThickness || masterSettings?.premiumDefaults?.footingThickness || 5) / 12;
      const footingMesh = premiumData?.customFootingMesh || masterSettings?.premiumDefaults?.footingMesh || '10mm';
      
      const floorThickInches = premiumData?.floorThickness || masterSettings?.premiumDefaults?.floorThickness || 4;
      const floorThickFt = floorThickInches / 12;
      const isRccFloor = premiumData?.floorType === 'RCC';
      const floorRccMesh = premiumData?.floorRccMeshSize || masterSettings?.premiumDefaults?.floorRccMesh || '8mm';
      const floorNamePrefix = premiumData?.isBasement ? "Basement" : "GF";
      
      const gfPlinthBoulderCft = (layoutArea + cantileverArea) * (9 / 12); 
      const floorVol = (layoutArea + cantileverArea) * floorThickFt;      
      
      const pitBoulderCft = colCount * (fB * fW * pitBoulderThicknessFt);
      const padVolume = colCount * (fB * fW * padThicknessFt);
      const padConc = calculateConcrete(padVolume, masterSettings?.ratios?.footing, getAllowance('footing', 5));

      const pitColumnHeight = Math.max(0, depth - pitBoulderThicknessFt - padThicknessFt);
      const pitColumnVolume = colCount * (colB * colW * pitColumnHeight);
      const starterConc = calculateConcrete(pitColumnVolume, masterSettings?.ratios?.column, getAllowance('column', 5));

      const floorRatio = isRccFloor ? masterSettings?.ratios?.slab : masterSettings?.ratios?.pcc;
      const floorConc = calculateConcrete(floorVol, floorRatio, 1.0); 

      const starterHt = 1 + depth + pD;
      const meshBarsL = (fW / 0.5) + 1;
      const meshBarsW = (fB / 0.5) + 1;
      const grandTotalMeshFt = ((meshBarsL * fB) + (meshBarsW * fW)) * colCount;
      const starterRingsQty = (starterHt / (masterSettings?.dimensions?.ringSpacing / 12 || 0.416)) * colCount;

      const starterItems = [
        { name: "Boulder Fill (Footing Base)", qty: Math.ceil(pitBoulderCft), unit: "CFT", rate: safeRates.boulder || 0 },
        { name: "Boulder Fill (Plinth Area)", qty: Math.ceil(gfPlinthBoulderCft), unit: "CFT", rate: safeRates.boulder || 0 },
        { name: `Footing Pad Cement (${premiumData?.customFootingThickness || masterSettings?.premiumDefaults?.footingThickness || 5}in)`, qty: padConc.cement, unit: "BAG", rate: safeRates.cement || 0 },
        { name: "Footing Pad Sand", qty: padConc.sand, unit: "CFT", rate: safeRates.sand || 0 },
        { name: "Footing Pad Gravel", qty: padConc.gravel, unit: "CFT", rate: safeRates.gravel || 0 },
        { name: `Footing Pad TMT Mesh (${footingMesh})`, qty: Math.ceil(getWeight(footingMesh, grandTotalMeshFt)), unit: "KG", rate: safeRates.tmt?.[footingMesh] || 0 },
        { name: "Column Starter Cement", qty: starterConc.cement, unit: "BAG", rate: safeRates.cement || 0 },
        { name: "Column Starter Sand", qty: starterConc.sand, unit: "CFT", rate: safeRates.sand || 0 },
        { name: "Column Starter Gravel", qty: starterConc.gravel, unit: "CFT", rate: safeRates.gravel || 0 },
        { name: `${floorNamePrefix} Floor ${isRccFloor ? 'RCC' : 'PCC'} Cement (${floorThickInches}in)`, qty: floorConc.cement, unit: "BAG", rate: safeRates.cement || 0 },
        { name: `${floorNamePrefix} Floor ${isRccFloor ? 'RCC' : 'PCC'} Sand`, qty: floorConc.sand, unit: "CFT", rate: safeRates.sand || 0 },
        { name: `${floorNamePrefix} Floor ${isRccFloor ? 'RCC' : 'PCC'} Gravel`, qty: floorConc.gravel, unit: "CFT", rate: safeRates.gravel || 0 }
      ];

      if (isRccFloor) {
        const floorMeshPieces = (baseSide * 12) / (masterSettings?.dimensions?.meshGap || 4);
        const floorMeshFt = (floorMeshPieces * baseSide) * 2; 
        starterItems.push({ name: `${floorNamePrefix} Floor RCC Mesh (${floorRccMesh})`, qty: Math.ceil(getWeight(floorRccMesh, floorMeshFt)), unit: "KG", rate: safeRates.tmt?.[floorRccMesh] || 0 });
      }

      starterItems.push(
        { name: `Starter Main (${colTmt.mainSize})`, qty: Math.ceil(getWeight(colTmt.mainSize, starterHt * colCount * colTmt.mainCount)), unit: "KG", rate: safeRates.tmt?.[colTmt.mainSize] || 0 }
      );

      if (colTmt.extraSize && colTmt.extraCount > 0) {
        starterItems.push({ name: `Starter Extra (${colTmt.extraSize})`, qty: Math.ceil(getWeight(colTmt.extraSize, starterHt * colCount * colTmt.extraCount)), unit: "KG", rate: safeRates.tmt?.[colTmt.extraSize] || 0 });
      }
      starterItems.push({ name: `Starter Rings (${colTmt.ringSize})`, qty: Math.ceil(getWeight(colTmt.ringSize, starterRingsQty * calculateRingFt(colB, colW))), unit: "KG", rate: safeRates.tmt?.[colTmt.ringSize] || 0 });
      
      addSection("1. Foundation & Substructure", starterItems);

      // --- TIE BEAM (Foundation Level) ---
      if (currentStructure?.tieBeam?.hasTieBeam) {
        const tD = toFeet(currentStructure?.tieBeam?.depth, units.tieBeam || 'inches');
        const tW = toFeet(currentStructure?.tieBeam?.width, units.tieBeam || 'inches');
        
        const tbConc = calculateConcrete(plinthPerimeter * (tD * tW), masterSettings?.ratios?.plinthBeam, getAllowance('plinthBeam', 5));
        const tbRings = plinthPerimeter / (masterSettings?.dimensions?.ringSpacing / 12 || 0.416);

        const tbItems = [
          { name: "Cement", qty: tbConc.cement, unit: "BAG", rate: safeRates.cement || 0 },
          { name: "Sand", qty: tbConc.sand, unit: "CFT", rate: safeRates.sand || 0 },
          { name: "Gravel", qty: tbConc.gravel, unit: "CFT", rate: safeRates.gravel || 0 },
          { name: `TMT Main (${tbTmt.mainSize})`, qty: Math.ceil(getWeight(tbTmt.mainSize, plinthPerimeter * tbTmt.mainCount)), unit: "KG", rate: safeRates.tmt?.[tbTmt.mainSize] || 0 }
        ];
        if (tbTmt.extraSize && tbTmt.extraCount > 0) {
           tbItems.push({ name: `TMT Extra (${tbTmt.extraSize})`, qty: Math.ceil(getWeight(tbTmt.extraSize, plinthPerimeter * tbTmt.extraCount)), unit: "KG", rate: safeRates.tmt?.[tbTmt.extraSize] || 0 });
        }
        tbItems.push({ name: `TMT Rings (${tbTmt.ringSize})`, qty: Math.ceil(getWeight(tbTmt.ringSize, tbRings * calculateRingFt(tD, tW))), unit: "KG", rate: safeRates.tmt?.[tbTmt.ringSize] || 0 });

        addSection("1B. Tie Beams (Foundation)", tbItems);
      }

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

    const rD = toFeet(currentStructure?.roofBeam?.depth, units.roofBeam);
    const rW = toFeet(currentStructure?.roofBeam?.width, units.roofBeam);
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

    if (premiumData?.hasSillBeam) {
      const sD = (premiumData.sillDepth || masterSettings?.premiumDefaults?.sillDepth || 4) / 12; 
      const sW = (premiumData.sillWidth || masterSettings?.premiumDefaults?.sillWidth || 9) / 12;
      const sillConc = calculateConcrete(layoutPerimeter * (sD * sW), masterSettings?.ratios?.plinthBeam, getAllowance('plinthBeam', 5));
      const sillRings = layoutPerimeter / (masterSettings?.dimensions?.ringSpacing / 12 || 0.416);

      addSection("4A. Sill Beams (Premium)", [
        { name: "Cement", qty: sillConc.cement, unit: "BAG", rate: safeRates.cement || 0 },
        { name: "Sand", qty: sillConc.sand, unit: "CFT", rate: safeRates.sand || 0 },
        { name: "Gravel", qty: sillConc.gravel, unit: "CFT", rate: safeRates.gravel || 0 },
        { name: `TMT Main (${pbTmt.mainSize})`, qty: Math.ceil(getWeight(pbTmt.mainSize, layoutPerimeter * pbTmt.mainCount)), unit: "KG", rate: safeRates.tmt?.[pbTmt.mainSize] || 0 },
        { name: `TMT Rings (${pbTmt.ringSize})`, qty: Math.ceil(getWeight(pbTmt.ringSize, sillRings * calculateRingFt(sD, sW))), unit: "KG", rate: safeRates.tmt?.[pbTmt.ringSize] || 0 }
      ]);
    }

    if (premiumData?.hasLintelBeam) {
      const lD = (premiumData.lintelDepth || masterSettings?.premiumDefaults?.lintelDepth || 6) / 12; 
      const lW = (premiumData.lintelWidth || masterSettings?.premiumDefaults?.lintelWidth || 9) / 12;
      const lintelConc = calculateConcrete(layoutPerimeter * (lD * lW), masterSettings?.ratios?.plinthBeam, getAllowance('plinthBeam', 5));
      const lintelRings = layoutPerimeter / (masterSettings?.dimensions?.ringSpacing / 12 || 0.416);

      addSection("4B. Lintel Beams (Premium)", [
        { name: "Cement", qty: lintelConc.cement, unit: "BAG", rate: safeRates.cement || 0 },
        { name: "Sand", qty: lintelConc.sand, unit: "CFT", rate: safeRates.sand || 0 },
        { name: "Gravel", qty: lintelConc.gravel, unit: "CFT", rate: safeRates.gravel || 0 },
        { name: `TMT Main (${pbTmt.mainSize})`, qty: Math.ceil(getWeight(pbTmt.mainSize, layoutPerimeter * pbTmt.mainCount)), unit: "KG", rate: safeRates.tmt?.[pbTmt.mainSize] || 0 },
        { name: `TMT Rings (${pbTmt.ringSize})`, qty: Math.ceil(getWeight(pbTmt.ringSize, lintelRings * calculateRingFt(lD, lW))), unit: "KG", rate: safeRates.tmt?.[pbTmt.ringSize] || 0 }
      ]);
    }

    const pieces = (slabSide * 12) / (masterSettings?.dimensions?.meshGap || 4);
    const totalSlabSteelFt = (pieces * slabSide) + (pieces * slabSide);
    const slabConc = calculateConcrete(adjustedSlabArea * ((masterSettings?.dimensions?.slabThickness || 5) / 12), masterSettings?.ratios?.slab, getAllowance('slab', 25));
    
    const slabMesh = premiumData?.customSlabMesh || masterSettings?.premiumDefaults?.slabMesh || '10mm';
    
    addSection("5. Roof Slab", [
      { name: "Cement", qty: slabConc.cement, unit: "BAG", rate: safeRates.cement || 0 },
      { name: "Sand", qty: slabConc.sand, unit: "CFT", rate: safeRates.sand || 0 },
      { name: "Gravel", qty: slabConc.gravel, unit: "CFT", rate: safeRates.gravel || 0 },
      { name: `TMT Slab (${slabMesh})`, qty: Math.ceil(getWeight(slabMesh, totalSlabSteelFt)), unit: "KG", rate: safeRates.tmt?.[slabMesh] || 0 }
    ]);

    if (currentHasStairs && toFeet(currentStairsDim?.width, units.layout) > 0 && toFeet(currentStairsDim?.length, units.layout) > 3) {
      const sW = toFeet(currentStairsDim.width, units.layout);
      const sL = toFeet(currentStairsDim.length, units.layout);
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
    const mainDoorArea = toFeet(currentOpenings?.mainDoor?.height, units.openings) * toFeet(currentOpenings?.mainDoor?.width, units.openings) * Number(currentOpenings?.mainDoor?.count || 0);
    const roomDoorsArea = (currentOpenings?.roomDoors || []).reduce((sum: number, d: any) => sum + (toFeet(d?.height, units.openings) * toFeet(d?.width, units.openings) * Number(d?.count||0)), 0);
    const bathroomDoorsArea = (currentOpenings?.bathroomDoors || []).reduce((sum: number, d: any) => sum + (toFeet(d?.height, units.openings) * toFeet(d?.width, units.openings) * Number(d?.count||0)), 0);
    const shutterArea = (currentOpenings?.shutters || []).reduce((sum: number, d: any) => sum + (toFeet(d?.height, units.openings) * toFeet(d?.width, units.openings) * Number(d?.count||0)), 0);
    const windowsArea = (currentOpenings?.windows || []).reduce((sum: number, w: any) => sum + (toFeet(w?.height, units.openings) * toFeet(w?.width, units.openings) * Number(w?.count||0)), 0);
    const ventArea = (currentOpenings?.ventilations || []).reduce((sum: number, v: any) => sum + (toFeet(v?.height, units.openings) * toFeet(v?.width, units.openings) * Number(v?.count||0)), 0);
    
    const netWallArea = Math.max(0, grossWallArea - (mainDoorArea + roomDoorsArea + bathroomDoorsArea + shutterArea + windowsArea + ventArea));
    
    const isRccWall = premiumData?.wallType === 'RCC';
    const rccWallThickFt = (premiumData?.rccWallThickness || masterSettings?.premiumDefaults?.rccWallThickness || 6) / 12; 
    const wallMesh = premiumData?.rccWallMeshSize || masterSettings?.premiumDefaults?.rccWallMesh || '10mm';
    
    let masonryItems = [];
    
    if (isRccWall) {
      const rccWallVol = netWallArea * rccWallThickFt;
      const rccWallConc = calculateConcrete(rccWallVol, masterSettings?.ratios?.column, getAllowance('column', 5));
      
      const wallMeshPiecesH = (netWallArea / colHt) / (masterSettings?.dimensions?.meshGap / 12 || 0.33);
      const wallMeshPiecesV = colHt / (masterSettings?.dimensions?.meshGap / 12 || 0.33);
      const totalWallMeshFt = ((wallMeshPiecesH * colHt) + (wallMeshPiecesV * (netWallArea / colHt))) * 2; 

      masonryItems = [
        { name: `RCC Wall Cement (${premiumData?.rccWallThickness || masterSettings?.premiumDefaults?.rccWallThickness || 6}in)`, qty: rccWallConc.cement, unit: "BAG", rate: safeRates.cement || 0 },
        { name: "RCC Wall Sand", qty: rccWallConc.sand, unit: "CFT", rate: safeRates.sand || 0 },
        { name: "RCC Wall Gravel", qty: rccWallConc.gravel, unit: "CFT", rate: safeRates.gravel || 0 },
        { name: `RCC Wall Mesh (${wallMesh})`, qty: Math.ceil(getWeight(wallMesh, totalWallMeshFt)), unit: "KG", rate: safeRates.tmt?.[wallMesh] || 0 }
      ];
    } else {
      const estimatedBricks = Math.ceil(netWallArea * (masterSettings?.consumption?.bricksPerSqft || 5) * wBricks);
      const joiningVol = netWallArea * (masterSettings?.consumption?.brickJoiningCftPerSqft || 0.10);
      const joiningConc = calculateConcrete(joiningVol, masterSettings?.ratios?.mortar);
      
      masonryItems = [
        { name: "Bricks", qty: estimatedBricks, unit: "NOS", rate: safeRates.bricks || 0 },
        { name: "Cement for Brick Joining", qty: joiningConc.cement, unit: "BAG", rate: safeRates.cement || 0 },
        { name: "Sand for Brick Joining", qty: joiningConc.sand, unit: "CFT", rate: safeRates.sand || 0 }
      ];
    }

    const plasterVol = netWallArea * (masterSettings?.consumption?.plasterCftPerSqft || 0.10) * 2; 
    const plasterConc = calculateConcrete(plasterVol, masterSettings?.ratios?.mortar);
    const ceilingPlasterVol = (layoutArea + cantileverArea) * (masterSettings?.consumption?.plasterCftPerSqft || 0.10);
    const ceilingPlasterConc = calculateConcrete(ceilingPlasterVol, masterSettings?.ratios?.mortar);

    const floorPaintArea = ((netWallArea * 2) + layoutArea + cantileverArea) * 1.10;

    m_builtUp += layoutArea + cantileverArea;
    m_slab += adjustedSlabArea;
    m_wall += netWallArea;
    m_doors += (mainDoorArea + roomDoorsArea + bathroomDoorsArea + shutterArea);
    m_windows += (windowsArea + ventArea);
    m_paint += floorPaintArea;

    masonryItems.push(
      { name: "Cement for Wall Plaster", qty: plasterConc.cement, unit: "BAG", rate: safeRates.cement || 0 },
      { name: "Sand for Wall Plaster", qty: plasterConc.sand, unit: "CFT", rate: safeRates.sand || 0 },
      { name: "Cement for Ceiling Plaster", qty: ceilingPlasterConc.cement, unit: "BAG", rate: safeRates.cement || 0 },
      { name: "Sand for Ceiling Plaster", qty: ceilingPlasterConc.sand, unit: "CFT", rate: safeRates.sand || 0 }
    );

    addSection(isRccWall ? "6. RCC Walls & Plastering" : "6. Masonry, Joining & Plastering", masonryItems);

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
          const friendlyLabel = { hall: 'Hall', kitchenDining: 'Kitchen/Dining', foyer: 'Foyer', balcony: 'Balcony', passage: 'Passage', porch: 'Porch', commercialShops: 'Shop Chambers', commercialWashrooms: 'Washrooms', corridor: 'Corridor', bathroomWalls: 'Bathroom Walls', skirting: 'Internal Skirting' }[key] || key.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
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
    const tileQty = Math.ceil(layoutArea + cantileverArea);
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

    return { floorName: snap?.floorName || 'Floor', sections, layoutArea: (layoutArea + cantileverArea), adjustedSlabArea, floorTotal: floorBaseCost };
  });

  return {
    floorReports,
    grandTotal: floorReports.reduce((sum: number, f: any) => sum + f.floorTotal, 0),
    metrics: { m_builtUp, m_slab, m_wall, m_doors, m_windows, m_paint }
  };
};