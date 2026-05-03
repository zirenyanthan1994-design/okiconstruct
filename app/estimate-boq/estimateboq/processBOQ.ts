// app/estimate-boq/estimateboq/processBOQ.ts

// --- 1. DEDUCTION LOGIC (Step 4 Subtractions) ---
export const calculateOpeningDeductions = (openings: any) => {
    const doorArea = openings.doors.reduce(
      (acc: number, d: any) => acc + (Number(d.h) * Number(d.w) * Number(d.count)), 
      0
    );
    const winArea = openings.windows.reduce(
      (acc: number, w: any) => acc + (Number(w.h) * Number(w.w) * Number(w.count)), 
      0
    );
    const ventArea = openings.ventilations.reduce(
      (acc: number, v: any) => acc + (Number(v.h) * Number(v.w) * Number(v.count)), 
      0
    );
    const mainDoorArea = Number(openings.mainDoor.h) * Number(openings.mainDoor.w);
    return doorArea + winArea + ventArea + mainDoorArea;
  };
  
  // --- 2. CONCRETE VOLUMETRIC ENGINE (Standard 1.25 CFT/bag) ---
  export const calculateConcreteVolume = (l: number, w: number, t: number, ratio: any) => {
    const wetVolume = l * w * t;
    const dryVolume = wetVolume * 1.54; 
    const ratioSum = Number(ratio.c) + Number(ratio.s) + Number(ratio.g);
    const cementBags = ((Number(ratio.c) / ratioSum) * dryVolume) / 1.25;
    const sandCFT = (Number(ratio.s) / ratioSum) * dryVolume;
    const gravelCFT = (Number(ratio.g) / ratioSum) * dryVolume;
    return {
      cement: Math.ceil(cementBags),
      sand: Number(sandCFT.toFixed(2)),
      gravel: Number(gravelCFT.toFixed(2))
    };
  };
  
  // --- 3. PARAMETRIC TMT WEIGHT ENGINE ---
  export const calculateColumnTMT = (dims: any, adminTMT: any) => {
    const totalRunningLength = 
      (Number(dims.footingDepth) || 0) + 1 + (Number(dims.plinthH) || 0) + Number(dims.columnH) + 3;
    const totalWeight = (totalRunningLength / Number(adminTMT.length)) * Number(adminTMT.weight);
    return Number(totalWeight.toFixed(2));
  };
  
  // --- 4. SLAB MESH TMT LOGIC ---
  export const calculateSlabMesh = (area: number, meshGapInches: number, adminTMT: any) => {
    const side = Math.sqrt(area);
    const gapFt = meshGapInches / 12;
    const barsCount = Math.floor(side / gapFt) + 1;
    const totalLength = barsCount * side * 2; 
    const totalWeight = (totalLength / Number(adminTMT.length)) * Number(adminTMT.weight);
    return Number(totalWeight.toFixed(2));
  };
  
  // --- 5. MAIN PROJECT PROCESSOR ---
  export const generateProjectBOQ = (projectData: any, adminPortal: any) => {
    const { floorsData, structure, openings } = projectData;
    const deductions = calculateOpeningDeductions(openings);
  
    return floorsData.map((floor: any, idx: number) => {
      const isGround = idx === 0;
      const floorArea = floor.calculatedArea || 1000; // Fallback for testing
  
      const columnSteel = calculateColumnTMT(
        { 
          footingDepth: isGround ? structure.footing.depth : 0, 
          plinthH: isGround ? structure.plinthBeam.l : 0, // Using provided beam dimensions
          columnH: structure.column.height 
        },
        adminPortal.tmtSpecs['12mm']
      );
  
      const slabConcrete = calculateConcreteVolume(
        floorArea, 1, (adminPortal.slabThickness / 12), adminPortal.ratios.slab
      );
      
      const slabSteel = calculateSlabMesh(floorArea, adminPortal.meshGap, adminPortal.tmtSpecs['10mm']);
  
      return {
        floorName: floor.floorName,
        deductions,
        columns: { columnSteel },
        slab: { concrete: slabConcrete, steel: slabSteel }
      };
    });
  };