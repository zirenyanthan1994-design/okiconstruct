"use client";
import { useState, useEffect } from 'react';
import { auth, db } from '../lib/firebase';
import { collection, addDoc, updateDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { generateProjectBOQ } from '../lib/processBOQ';

// 🟢 DEFINED GLOBALLY: Prevents fetch errors and crashes
const unitLabels: Record<string, string> = { feet: 'ft', meters: 'm', mm: 'mm', cm: 'cm', inches: 'in' };
const getLabel = (unit?: string) => unitLabels[unit || 'feet'] || 'ft';

// 🟢 DYNAMIC UI CONVERTER: Ensures the live blue box summary shows accurate SqFt regardless of unit chosen
const toFeetUI = (val: any, unitType: string = 'feet') => {
  const n = Number(val) || 0;
  if (unitType === 'meters') return n * 3.28084;
  if (unitType === 'mm') return n * 0.00328084;
  if (unitType === 'cm') return n * 0.0328084;
  if (unitType === 'inches') return n / 12;
  return n; 
};

export default function Estimator() {
  const [userData, setUserData] = useState<any>(null);
  const [existingProjectId, setExistingProjectId] = useState<string | null>(null);

  const [isFromCAD, setIsFromCAD] = useState(false);

  const [boqScope, setBoqScope] = useState<'full' | 'civil_only'>('full');
  const [units, setUnits] = useState({
    footing: 'feet', columnHeight: 'feet', columnDim: 'inches', 
    plinthBeam: 'inches', roofBeam: 'inches', layout: 'feet', openings: 'feet',
    boundaryLayout: 'feet'
  });

  const [siteDetails, setSiteDetails] = useState({ roadFacing: 'East', stairType: 'Internal', bhkType: '2BHK' });
  const [buildingType, setBuildingType] = useState<'residence' | 'apartment' | 'commercial' | 'boundary'>('residence');
  const [commercialGroundFloor, setCommercialGroundFloor] = useState(false);
  const [flatsCount, setFlatsCount] = useState("1");
  const [apartmentFlats, setApartmentFlats] = useState<any[]>([{ id: 1, type: '2BHK' }]);

  // Commercial Specific Configurations
  const [commChambersCount, setCommChambersCount] = useState(4);
  const [commBathType, setCommBathType] = useState('Shared Floor Bathrooms');
  const [commSharedBathCount, setCommSharedBathCount] = useState(2);
  const [commLayout, setCommLayout] = useState('Single Line');

  // Boundary Wall Specific Configurations
  const [boundaryData, setBoundaryData] = useState({
    northLength: '', southLength: '', eastLength: '', westLength: '',
    columnSpacing: '10', height: '6',
    wallType: 'Single Brick (5 Inch)', finish: 'Plaster Both Sides', topping: 'None'
  });

  const [apartmentData, setApartmentData] = useState({
    corridor: { hasCorridor: false, length: '', width: '' },
    lift: { hasLift: false, count: '1', length: '', width: '' }
  });

  const [projectName, setProjectName] = useState(""); 
  const [currentStep, setCurrentStep] = useState(1); 
  const [activeFloor, setActiveFloor] = useState(0);
  const [totalFloorsCount, setTotalFloorsCount] = useState(1);
  const [slabOverhang, setSlabOverhang] = useState("2"); 
  const [hasStairs, setHasStairs] = useState(true);
  const [stairsDim, setStairsDim] = useState({ length: '', width: '' });
  const [errorMsg, setErrorMsg] = useState("");
  
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const router = useRouter();

  // --- NEW FEATURES STATES ---
  const [letterheadImg, setLetterheadImg] = useState<string | null>(null);
  const [customTerms, setCustomTerms] = useState<string>("TERMS & CONDITIONS:\n1. Payment is due within 15 days of invoice generation.\n2. Estimate is valid for 30 days.\n3. Material rates are subject to market fluctuations.");
  const [customServices, setCustomServices] = useState<any[]>([]);

  const [structure, setStructure] = useState<any>({
    footing: { count: '', breadth: '', width: '', depth: '' },
    column: { height: '10', breadth: '', width: '', mainTmtSize: '', mainTmtCount: '', extraTmtSize: '', extraTmtCount: '', ringSize: '' },
    plinthBeam: { depth: '', width: '', mainTmtSize: '', mainTmtCount: '', extraTmtSize: '', extraTmtCount: '', ringSize: '' },
    roofBeam: { depth: '', width: '', mainTmtSize: '', mainTmtCount: '', extraTmtSize: '', extraTmtCount: '', ringSize: '' }
  });

  const [floorsData, setFloorsData] = useState<any[]>([]);
  const [openingsData, setOpeningsData] = useState<any[]>([]);
  const [rates, setRates] = useState<any>({
    tmt: { "8mm": '', "10mm": '', "12mm": '', "16mm": '', "20mm": '', "25mm": '' },
    cement: '', sand: '', gravel: '', boulder: '', bricks: '',
    windowMaterial: 'Aluminum Profile', windowRate: '',
    mainDoorPrice: '', roomDoorPrice: '', bathroomDoorPrice: '', doorFramePrice: '',
    toppingRate: '' 
  });

  const [tiles, setTiles] = useState<Record<string, any>>({});
  const [paintData, setPaintData] = useState<any>({ puttyRate: '', brand: '', interiorRate: '', exteriorRate: '' });
  const [laborRates, setLaborRates] = useState<any>({ mason: '', painter: '', tiler: '' });
  const [boqReport, setBoqReport] = useState<any>(null);

  const [premiumData, setPremiumData] = useState<any>({
    customFootingMesh: '10mm', customFootingThickness: 5,
    floorType: 'PCC', floorThickness: 4, floorRccMeshSize: '8mm',
    hasSillBeam: false, sillDepth: '', sillWidth: '',
    hasLintelBeam: false, lintelDepth: '', lintelWidth: '',
    isBasement: false, wallType: 'Brick', rccWallThickness: 6, rccWallMeshSize: '10mm',
    customSlabMesh: '10mm'
  });

  const [hiddenSections, setHiddenSections] = useState<Record<string, boolean>>({});

  const toggleSection = (fIdx: number, sIdx: number) => {
    const key = `f${fIdx}_s${sIdx}`;
    setHiddenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const getVisibleFloorTotal = (floor: any, fIdx: number) => {
    return floor.sections?.reduce((sum: number, section: any, sIdx: number) => {
      const isHidden = hiddenSections[`f${fIdx}_s${sIdx}`];
      return sum + (isHidden ? 0 : (section.sectionTotal || 0));
    }, 0) || 0;
  };

  const customServicesTotal = customServices.reduce((sum, item) => sum + ((Number(item.qty)||0) * (Number(item.rate)||0)), 0);

  const getVisibleGrandTotal = () => {
    const floorsTotal = boqReport?.floorReports?.reduce((sum: number, floor: any, fIdx: number) => {
      return sum + getVisibleFloorTotal(floor, fIdx);
    }, 0) || 0;
    return floorsTotal + (isPremium ? customServicesTotal : 0);
  };

  const isPremium = userData?.tier === 'premium' || userData?.planStatus === 'premium' || auth?.currentUser?.email?.toLowerCase() === 'okiconstruct2026@gmail.com';

  const handleLetterheadUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event: any) => setLetterheadImg(event.target.result);
    reader.readAsDataURL(file);
  };

  const addCustomService = () => setCustomServices([...customServices, { id: Date.now(), name: '', unit: '', qty: '', rate: '' }]);
  const updateCustomService = (index: number, field: string, value: string) => {
     const updated = [...customServices];
     updated[index][field] = value;
     setCustomServices(updated);
  };
  const removeCustomService = (index: number) => {
     const updated = [...customServices];
     updated.splice(index, 1);
     setCustomServices(updated);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const bridgeData = localStorage.getItem('oki_cad_bridge');
    if (bridgeData) {
      try {
        const cad = JSON.parse(bridgeData);
        setIsFromCAD(true);
        if (cad.projectName) setProjectName(cad.projectName);
        
        if (cad.typology === 'Private Residence') {
            setBuildingType('residence');
            setCommercialGroundFloor(false);
        } else if (cad.typology === 'Apartment Complex') {
            setBuildingType('apartment');
            setCommercialGroundFloor(false);
        } else if (cad.typology === 'Commercial') {
            setBuildingType('commercial');
            setCommercialGroundFloor(true);
            if (cad.commChambersCount) setCommChambersCount(cad.commChambersCount);
            if (cad.commBathType) setCommBathType(cad.commBathType);
            if (cad.commSharedBathCount) setCommSharedBathCount(cad.commSharedBathCount);
            if (cad.commercial_layout) setCommLayout(cad.commercial_layout);
        }

        if (cad.floors === 'Ground Floor Only') setTotalFloorsCount(1);
        else if (cad.floors === 'G + 1') setTotalFloorsCount(2);
        else if (cad.floors === 'G + 2') setTotalFloorsCount(3);
        else if (cad.floors === 'G + 3') setTotalFloorsCount(4);
        else if (cad.floors === 'G + 4') setTotalFloorsCount(5);

        setSiteDetails(prev => {
            let newStair = 'Internal';
            if (cad.staircase === 'No Stairs') newStair = 'None';
            else if (cad.staircase === 'External Stairs') newStair = 'External';
            return { ...prev, stairType: newStair, bhkType: cad.typology === 'Private Residence' ? `${cad.bhk}BHK` : prev.bhkType };
        });

        if (cad.staircase === 'No Stairs') setHasStairs(false);
        else { setHasStairs(true); if (cad.stairsDim) setStairsDim(cad.stairsDim); }

        if (cad.typology === 'Apartment Complex') {
          setFlatsCount(String(cad.aptFlatsCount || 1));
          if (cad.aptFlats) setApartmentFlats(cad.aptFlats);
          if (cad.externalCorridorWidth) {
              setApartmentData(prev => ({
                 ...prev, corridor: { hasCorridor: true, length: '30', width: cad.externalCorridorWidth } 
              }));
          }
        }

        if (cad.columnsCount || cad.footingsCount) {
            setStructure((prev: any) => ({
                ...prev,
                footing: { ...prev.footing, count: String(cad.columnsCount || cad.footingsCount) }
            }));
        }
        
        let mappedUnit = 'feet';
        if (cad.globalUnit === 'in') mappedUnit = 'inches';
        if (cad.globalUnit === 'mm') mappedUnit = 'mm';
        if (cad.globalUnit === 'cm') mappedUnit = 'cm';
        if (cad.globalUnit === 'mtr') mappedUnit = 'meters';
        setUnits(prev => ({ ...prev, layout: mappedUnit, openings: mappedUnit }));

      } catch (err) { console.error("Failed to parse CAD Bridge", err); }
    }
  }, []);

  const clearCadImport = () => {
    localStorage.removeItem('oki_cad_bridge');
    setIsFromCAD(false);
    window.location.reload();
  };

  useEffect(() => {
    const loadSession = async () => {
      const params = new URLSearchParams(window.location.search);
      const editId = params.get('edit');
      
      if (editId) {
        try {
          const docSnap = await getDoc(doc(db, "boq_projects", editId));
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.inputs) {
               setExistingProjectId(editId);
               setProjectName(data.projectName);
               setBuildingType(data.buildingType);
               setTotalFloorsCount(data.totalFloors);
               setSiteDetails(data.siteDetails);
               if (data.inputs.units) setUnits(prev => ({ ...prev, ...data.inputs.units }));
               setBoqScope(data.inputs.boqScope || 'full');
               setStructure(data.inputs.structure);
               setFloorsData(data.inputs.floorsData);
               setOpeningsData(data.inputs.openingsData);
               setRates(data.inputs.rates);
               setTiles(data.inputs.tiles);
               setPaintData(data.inputs.paintData);
               setLaborRates(data.inputs.laborRates);
               setApartmentData(data.inputs.apartmentData);
               setApartmentFlats(data.inputs.apartmentFlats || []);
               setFlatsCount(data.inputs.flatsCount || "1");
               setCommercialGroundFloor(data.inputs.commercialGroundFloor || false);
               setHasStairs(data.inputs.hasStairs);
               setStairsDim(data.inputs.stairsDim);
               setSlabOverhang(data.inputs.slabOverhang || "2");
               
               if (data.inputs.commChambersCount) setCommChambersCount(data.inputs.commChambersCount);
               if (data.inputs.commBathType) setCommBathType(data.inputs.commBathType);
               if (data.inputs.commSharedBathCount) setCommSharedBathCount(data.inputs.commSharedBathCount);
               if (data.inputs.commLayout) setCommLayout(data.inputs.commLayout);

               if (data.inputs.boundaryData) setBoundaryData(data.inputs.boundaryData);

               if (data.inputs.premiumData) setPremiumData(data.inputs.premiumData);
               if (data.inputs.hiddenSections) setHiddenSections(data.inputs.hiddenSections);
               if (data.inputs.customServices) setCustomServices(data.inputs.customServices);
               if (data.inputs.customTerms) setCustomTerms(data.inputs.customTerms);
               if (data.inputs.letterheadImg) setLetterheadImg(data.inputs.letterheadImg);
               setCurrentStep(1); 
            } else {
               alert("This BOQ was saved with an older version of the software and cannot be dynamically edited.");
            }
          }
        } catch (error) { console.error("Failed to load BOQ session:", error); }
      }
    };
    loadSession();
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        const docRef = doc(db, "users", currentUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) setUserData({ email: currentUser.email, ...docSnap.data() });
      }
    });
    return () => unsubscribe();
  }, []);

  const handleFlatsCountChange = (val: string) => {
    setFlatsCount(val);
    const count = parseInt(val) || 0;
    const newFlats = [];
    for(let i=0; i<count; i++) newFlats.push(apartmentFlats[i] || { id: i+1, type: '2BHK' });
    setApartmentFlats(newFlats);
  };

  const generateEmptyFlat = (flatId: number, type: string) => {
    const bhkCount = parseInt(type) || 1;
    return {
        id: flatId, type: type, 
        hall: { length: '', breadth: '' }, 
        kitchen: { length: '', breadth: '' },
        foyer: { length: '', breadth: '' },
        balcony: { length: '', breadth: '' },
        passage: { length: '', breadth: '' },
        porch: { length: '', breadth: '' },
        bedrooms: Array.from({length: bhkCount}).map((_, i) => ({ id: Date.now() + i, length: '', breadth: '' })),
        bathrooms: Array.from({length: bhkCount === 1 ? 1 : bhkCount}).map((_, i) => ({ id: Date.now() + 100 + i, length: '', breadth: '', isAttached: false, layoutType: 'outside', attachedTo: '' }))
    };
  };

  const handleSetupComplete = () => {
    if (!projectName.trim()) return setErrorMsg("Please provide a Project Name to begin.");

    if (buildingType === 'boundary') {
        const n = toFeetUI(boundaryData.northLength, units.boundaryLayout);
        const s = toFeetUI(boundaryData.southLength, units.boundaryLayout);
        const e = toFeetUI(boundaryData.eastLength, units.boundaryLayout);
        const w = toFeetUI(boundaryData.westLength, units.boundaryLayout);
        const totalPerimeter = n + s + e + w;
        
        if (totalPerimeter <= 0) {
            return setErrorMsg("Please enter valid boundary lengths.");
        }

        const spacing = toFeetUI(boundaryData.columnSpacing, units.boundaryLayout);
        const autoColCount = spacing > 0 ? Math.ceil(totalPerimeter / spacing) + 1 : 4; 

        setStructure((prev: any) => ({
            ...prev,
            footing: { ...prev.footing, count: String(autoColCount) }
        }));
        
        setErrorMsg(""); setCurrentStep(2); window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
    }

    if (!existingProjectId || floorsData.length !== totalFloorsCount) {
        const initialFloors = [];
        const initialOpenings = [];
        const bridgeData = isFromCAD ? JSON.parse(localStorage.getItem('oki_cad_bridge') || '{}') : null;

        let extraBeds: any[] = [];
        let extraBaths: any[] = [];
        let extraShops: any[] = [];

        if (bridgeData?.canvasRooms) {
            const manualRooms = bridgeData.canvasRooms.filter((r: any) => r.id.startsWith('manual_'));
            
            extraBeds = manualRooms
              .filter((r: any) => !r.id.includes('_bath_') && !r.id.includes('_chamber_') && !r.id.includes('_col_'))
              .map((b: any, idx: number) => ({ id: Date.now() + 500 + idx, length: String(b.widthFt || '0'), breadth: String(b.heightFt || '0') }));
            
            extraBaths = manualRooms
              .filter((r: any) => r.id.includes('_bath_'))
              .map((b: any, idx: number) => ({ id: Date.now() + 600 + idx, length: String(b.widthFt || '0'), breadth: String(b.heightFt || '0'), isAttached: false, layoutType: 'outside', attachedTo: '' }));
            
            extraShops = manualRooms
              .filter((r: any) => r.id.includes('_chamber_'))
              .map((b: any, idx: number) => ({ id: Date.now() + 700 + idx, length: String(b.widthFt || '0'), breadth: String(b.heightFt || '0') }));
        }

        for (let i = 0; i < totalFloorsCount; i++) {
            const floorName = i === 0 ? "Ground Floor" : i === 1 ? "1st Floor" : i === 2 ? "2nd Floor" : i === 3 ? "3rd Floor" : `${i}th Floor`;
            const isComm = buildingType === 'commercial' || (i === 0 && buildingType === 'apartment' && commercialGroundFloor);

            initialOpenings.push({
                mainDoor: { count: '1', height: '', width: '' }, roomDoors: [{ id: Date.now(), count: '', height: '', width: '' }],
                bathroomDoors: [{ id: Date.now() + 1, count: '', height: '', width: '' }], shutters: [{ id: Date.now() + 4, count: '', height: '', width: '' }],
                windows: [{ id: Date.now() + 2, count: '', height: '', width: '' }], ventilations: [{ id: Date.now() + 3, count: '', height: '', width: '' }]
            });

            if (buildingType === 'residence') {
                const bhkCount = parseInt(siteDetails.bhkType.charAt(0)) || 1;
                
                let mappedBedrooms = Array.from({length: bhkCount}).map((_, j) => ({ id: Date.now() + j, length: '', breadth: '' }));
                if (bridgeData?.bedrooms?.length > 0) {
                    mappedBedrooms = bridgeData.bedrooms.map((b: any, idx: number) => ({ id: Date.now() + idx, length: b.length || '0', breadth: b.breadth || '0' }));
                }
                mappedBedrooms = [...mappedBedrooms, ...extraBeds];

                let mappedBathrooms = Array.from({length: bhkCount === 1 ? 1 : bhkCount}).map((_, j) => ({ id: Date.now() + 100 + j, length: '', breadth: '', isAttached: false, layoutType: 'outside', attachedTo: '' }));
                if (bridgeData?.bathrooms?.length > 0) {
                    mappedBathrooms = bridgeData.bathrooms.map((b: any, idx: number) => ({ 
                        id: Date.now() + 100 + idx, 
                        length: b.length || '0', 
                        breadth: b.breadth || '0',
                        isAttached: b.type === 'attached',
                        layoutType: b.placement || 'outside',
                        attachedTo: b.attachedTo || ''
                    }));
                }
                mappedBathrooms = [...mappedBathrooms, ...extraBaths];

                initialFloors.push({
                    floorName, isCommercial: false, 
                    hall: bridgeData?.hall ? { length: bridgeData.hall.length || '0', breadth: bridgeData.hall.breadth || '0' } : { length: '', breadth: '' }, 
                    kitchenDining: bridgeData?.kitchen ? { length: bridgeData.kitchen.length || '0', breadth: bridgeData.kitchen.breadth || '0' } : { length: '', breadth: '' }, 
                    foyer: { length: '', breadth: '' },
                    balcony: { length: '', breadth: '' },
                    passage: { length: '', breadth: '' },
                    porch: { length: '', breadth: '' },
                    bedrooms: mappedBedrooms,
                    bathrooms: mappedBathrooms
                });
            } else if (buildingType === 'commercial' || isComm) {
                let shops = [];
                let washrooms = { count: String(commSharedBathCount || 2), length: '', breadth: '' };
                let passage = { length: '', breadth: '' };

                if (bridgeData?.typology === 'Commercial') {
                    for (let c = 0; c < Number(bridgeData.commChambersCount || 1); c++) {
                        shops.push({ id: Date.now() + c, length: bridgeData.commChambersDim?.length || '0', breadth: bridgeData.commChambersDim?.breadth || '0' });
                    }
                    const wCount = bridgeData.commBathType === 'Shared Floor Bathrooms' ? bridgeData.commSharedBathCount : bridgeData.commChambersCount;
                    washrooms = { count: String(wCount || '0'), length: bridgeData.commBathDim?.length || '0', breadth: bridgeData.commBathDim?.breadth || '0' };
                    if (bridgeData.commercial_layout === 'Clustered') {
                        passage = { length: bridgeData.passageWidth || '0', breadth: '10' }; // default representation
                    }
                } else {
                    for (let c = 0; c < commChambersCount; c++) {
                        shops.push({ id: Date.now() + c, length: '', breadth: '' });
                    }
                }
                shops = [...shops, ...extraShops];
                initialFloors.push({ floorName, isCommercial: true, shops, washrooms, passage });
            } else {
                // Apartment flats
                let flatsToUse = apartmentFlats.map(f => generateEmptyFlat(f.id, f.type));
                
                if (bridgeData?.aptFlats?.length > 0) {
                    flatsToUse = bridgeData.aptFlats.map((flat: any) => ({
                        id: flat.id,
                        type: `${flat.bhk}BHK`,
                        hall: { length: flat.hall?.length || '0', breadth: flat.hall?.breadth || '0' },
                        kitchen: { length: flat.kitchen?.length || '0', breadth: flat.kitchen?.breadth || '0' },
                        foyer: { length: '', breadth: '' },
                        balcony: { length: '', breadth: '' },
                        passage: { length: '', breadth: '' },
                        porch: { length: '', breadth: '' },
                        passageWidth: flat.passageWidth || '4',
                        bedrooms: [
                          ...(flat.bedrooms?.map((b: any, idx: number) => ({ id: Date.now() + idx, length: b.length || '0', breadth: b.breadth || '0' })) || []),
                          ...(flat.id === 1 ? extraBeds : []) 
                        ],
                        bathrooms: [
                          ...(flat.bathrooms?.map((b: any, idx: number) => ({
                              id: Date.now() + 100 + idx,
                              length: b.length || '0',
                              breadth: b.breadth || '0',
                              isAttached: b.type === 'attached',
                              layoutType: b.placement || 'outside',
                              attachedTo: b.attachedTo || ''
                          })) || []),
                          ...(flat.id === 1 ? extraBaths : [])
                        ]
                    }));
                }
                initialFloors.push({ floorName, isCommercial: false, flats: flatsToUse });
            }
        }
        setFloorsData(initialFloors);
        setOpeningsData(initialOpenings);
    }
    setErrorMsg(""); setCurrentStep(2); window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const updateFloorData = (roomType: string, index: number | null, field: string, value: string | boolean) => setFloorsData(prev => { const d = JSON.parse(JSON.stringify(prev)); if (!d[activeFloor]) return prev; if (index === null) d[activeFloor][roomType][field] = value; else d[activeFloor][roomType][index][field] = value; return d; });
  const updateFlatData = (fIdx: number, roomType: string, roomIndex: number | null, field: string, value: string | boolean) => setFloorsData(prev => { const d = JSON.parse(JSON.stringify(prev)); const flat = d[activeFloor].flats[fIdx]; if (roomIndex === null) flat[roomType][field] = value; else flat[roomType][roomIndex][field] = value; return d; });
  const addBedroom = () => setFloorsData(prev => { const d = JSON.parse(JSON.stringify(prev)); d[activeFloor].bedrooms.push({ id: Date.now(), length: '', breadth: '' }); return d; });
  const removeBedroom = (index: number) => setFloorsData(prev => { const d = JSON.parse(JSON.stringify(prev)); d[activeFloor].bedrooms.splice(index, 1); return d; });
  const addBathroom = () => setFloorsData(prev => { const d = JSON.parse(JSON.stringify(prev)); d[activeFloor].bathrooms.push({ id: Date.now() + 1, length: '', breadth: '', isAttached: false, layoutType: 'outside', attachedTo: '' }); return d; });
  const removeBathroom = (index: number) => setFloorsData(prev => { const d = JSON.parse(JSON.stringify(prev)); d[activeFloor].bathrooms.splice(index, 1); return d; });
  const addShop = () => setFloorsData(prev => { const d = JSON.parse(JSON.stringify(prev)); if (!Array.isArray(d[activeFloor].shops)) d[activeFloor].shops = []; d[activeFloor].shops.push({ id: Date.now(), length: '', breadth: '' }); return d; });
  const removeShop = (index: number) => setFloorsData(prev => { const d = JSON.parse(JSON.stringify(prev)); d[activeFloor].shops.splice(index, 1); return d; });
  const addFlatBedroom = (fIdx: number) => setFloorsData(prev => { const d = JSON.parse(JSON.stringify(prev)); d[activeFloor].flats[fIdx].bedrooms.push({ id: Date.now(), length: '', breadth: '' }); return d; });
  const removeFlatBedroom = (fIdx: number, bIdx: number) => setFloorsData(prev => { const d = JSON.parse(JSON.stringify(prev)); d[activeFloor].flats[fIdx].bedrooms.splice(bIdx, 1); return d; });
  const addFlatBathroom = (fIdx: number) => setFloorsData(prev => { const d = JSON.parse(JSON.stringify(prev)); d[activeFloor].flats[fIdx].bathrooms.push({ id: Date.now() + 1, length: '', breadth: '', isAttached: false, layoutType: 'outside', attachedTo: '' }); return d; });
  const removeFlatBathroom = (fIdx: number, bIdx: number) => setFloorsData(prev => { const d = JSON.parse(JSON.stringify(prev)); d[activeFloor].flats[fIdx].bathrooms.splice(bIdx, 1); return d; });

  const updateOpening = (key: string, index: number | null, field: string, value: string) => setOpeningsData(prev => { const d = JSON.parse(JSON.stringify(prev)); if (index === null) d[activeFloor][key][field] = value; else if(d[activeFloor][key] && d[activeFloor][key][index]) d[activeFloor][key][index][field] = value; return d; });
  const addOpening = (key: string) => setOpeningsData(prev => { const d = JSON.parse(JSON.stringify(prev)); d[activeFloor][key].push({ id: Date.now(), count: '', height: '', width: '' }); return d; });

  const getRoomArea = (room: any) => toFeetUI(room?.length || room?.width, units?.layout) * toFeetUI(room?.breadth || room?.width, units?.layout);
  const calculateFloorArea = (index: number) => {
    const f = floorsData[index];
    if (!f) return 0;
    let area = 0;
    if (buildingType === 'apartment') {
      if (f.isCommercial) {
        (f.shops || []).forEach((s: any) => area += getRoomArea(s));
        area += (Number(f.washrooms?.count || 0) * getRoomArea(f.washrooms));
        if (f.passage) area += getRoomArea(f.passage);
      } else {
        (f.flats || []).forEach((flat: any) => {
          area += getRoomArea(flat.hall) + getRoomArea(flat.kitchen);
          area += getRoomArea(flat.foyer) + getRoomArea(flat.balcony) + getRoomArea(flat.passage) + getRoomArea(flat.porch);
          (flat.bedrooms || []).forEach((b: any) => area += getRoomArea(b));
          (flat.bathrooms || []).forEach((b: any) => { if (!(b.isAttached && b.layoutType === 'inside')) area += getRoomArea(b); });
        });
      }
      if (apartmentData.corridor.hasCorridor) area += getRoomArea(apartmentData.corridor);
      if (hasStairs) area += getRoomArea(stairsDim);
      if (apartmentData.lift.hasLift) area += (Number(apartmentData.lift.count) * getRoomArea(apartmentData.lift));
    } else if (buildingType === 'commercial') {
      (f.shops || []).forEach((s: any) => area += getRoomArea(s));
      area += (Number(f.washrooms?.count || 0) * getRoomArea(f.washrooms));
      if (f.passage) area += getRoomArea(f.passage);
      if (hasStairs) area += getRoomArea(stairsDim);
    } else {
      area += getRoomArea(f.hall) + getRoomArea(f.kitchenDining) + getRoomArea(f.foyer) + getRoomArea(f.balcony) + getRoomArea(f.passage) + getRoomArea(f.porch);
      (f.bedrooms || []).forEach((b: any) => area += getRoomArea(b));
      (f.bathrooms || []).forEach((b: any) => { if (!(b.isAttached && b.layoutType === 'inside')) area += getRoomArea(b); });
      if (hasStairs) area += getRoomArea(stairsDim);
    }
    return area;
  };

  const calculateAdjustedSlabArea = (index: number) => {
    const grossArea = calculateFloorArea(index);
    let baseSlab = Math.pow(Math.sqrt(grossArea) + toFeetUI(slabOverhang, units?.layout), 2);
    if ((buildingType === 'apartment' || buildingType === 'commercial') && index < totalFloorsCount - 1) {
      let voidArea = 0;
      if (hasStairs) voidArea += getRoomArea(stairsDim);
      if (apartmentData.lift.hasLift) voidArea += (Number(apartmentData.lift.count) * getRoomArea(apartmentData.lift));
      baseSlab -= voidArea;
    }
    return Math.max(0, baseSlab);
  };

  const handleTransitionToUpperFlats = () => {
      setFloorsData(prev => { const d = JSON.parse(JSON.stringify(prev)); for (let i = 1; i < totalFloorsCount; i++) d[i].flats = apartmentFlats.map(f => generateEmptyFlat(f.id, f.type)); return d; });
      setActiveFloor(1); setCurrentStep(3); window.scrollTo(0,0);
  };

  const handleCopyChoice = (choice: 'yes' | 'no') => {
    if (choice === 'yes') {
      setFloorsData(prev => {
        const d = JSON.parse(JSON.stringify(prev));
        for(let i = activeFloor + 1; i < totalFloorsCount; i++) {
           d[i] = JSON.parse(JSON.stringify(d[activeFloor]));
           d[i].floorName = i === 1 ? "1st Floor" : i === 2 ? "2nd Floor" : i === 3 ? "3rd Floor" : `${i}th Floor`;
        }
        return d;
      });
      setOpeningsData(prev => {
        const d = JSON.parse(JSON.stringify(prev));
        for(let i = activeFloor + 1; i < totalFloorsCount; i++) d[i] = JSON.parse(JSON.stringify(d[activeFloor]));
        return d;
      });
      setActiveFloor(totalFloorsCount - 1); 
      setCurrentStep(5); 
    } else {
      setActiveFloor(activeFloor + 1); setCurrentStep(3);
    }
    window.scrollTo(0,0);
  };

  // 🟢 NEW: BOUNDARY VIRTUAL FLOOR TRICK ENGINE
  const handleBoundaryGenerateBOQ = () => {
    setErrorMsg("");
    if (!Number(laborRates.mason)) return setErrorMsg("Please enter Mason Labor Rate.");

    const n = toFeetUI(boundaryData.northLength, units.boundaryLayout);
    const s = toFeetUI(boundaryData.southLength, units.boundaryLayout);
    const e = toFeetUI(boundaryData.eastLength, units.boundaryLayout);
    const w = toFeetUI(boundaryData.westLength, units.boundaryLayout);
    const totalPerimeter = n + s + e + w;
    const wallHeight = toFeetUI(boundaryData.height, units.boundaryLayout);

    if (totalPerimeter <= 0) return setErrorMsg("Boundary perimeter cannot be zero.");

    // TRICK: Create a single massive virtual room with 0 area but the exact correct perimeter
    const virtualLength = totalPerimeter / 2;
    
    const virtualLayout = {
        hall: { length: '0', breadth: '0' },
        kitchenDining: { length: '0', breadth: '0' },
        foyer: { length: String(virtualLength), breadth: '0' }, // Perimeter = 2*(L+W) = totalPerimeter
        balcony: { length: '0', breadth: '0' },
        passage: { length: '0', breadth: '0' },
        porch: { length: '0', breadth: '0' },
        bedrooms: [],
        bathrooms: []
    };

    const virtualStructure = JSON.parse(JSON.stringify(structure));
    // Trick the engine's wall height formula
    virtualStructure.column.height = String(wallHeight);
    virtualStructure.roofBeam = { depth: '0', width: '0', mainTmtSize: '', mainTmtCount: '', extraTmtSize: '', extraTmtCount: '', ringSize: '' };

    const virtualOpenings = {
        mainDoor: { count: '0', height: '0', width: '0' },
        roomDoors: [], bathroomDoors: [], shutters: [], windows: [], ventilations: []
    };

    const boundaryFloor = {
      floorName: "Site Boundary & External Works",
      buildingType: 'residence', // Faked to trigger calculation
      layout: virtualLayout,
      structure: virtualStructure,
      openings: virtualOpenings,
      tiles: {},
      paintData: { puttyRate: '0', brand: '', interiorRate: '0', exteriorRate: '0' },
      laborRates: { mason: laborRates.mason, painter: '0', tiler: '0' },
      hasStairs: false,
      stairsDim: { length: '0', width: '0' },
      apartmentData: { corridor: { hasCorridor: false }, lift: { hasLift: false } }
    };

    let masterSettings: any = {
      ratios: { pcc: { c: 1, s: 3, g: 6 }, slab: { c: 1, s: 2, g: 4 }, footing: { c: 1, s: 2, g: 4 }, plinthBeam: { c: 1, s: 3, g: 4 }, beam: { c: 1, s: 3, g: 4 }, column: { c: 1, s: 3, g: 4 }, mortar: { c: 1, s: 4, g: 0 }, tileBedding: { c: 1, s: 4, g: 0 } },
      tmtSpecs: { '8mm': { length: 38, weight: 4.74 }, '10mm': { length: 38, weight: 7.40 }, '12mm': { length: 38, weight: 10.66 }, '16mm': { length: 38, weight: 18.96 }, '20mm': { length: 38, weight: 29.60 }, '25mm': { length: 38, weight: 46.20 } },
      dimensions: { slabThickness: 5, meshGap: 4, ringSpacing: 5 },
      percentages: { wastage: { cement: 10, sand: 10, gravel: 10, tmt: 10, bricks: 10, tiles: 10 }, concreteAllowances: { footing: 5, column: 5, plinthBeam: 5, roofBeam: 5, slab: 25 }, shuttering: 5, electrical: 12, plumbing: 8, misc: 5, logistics: 10, contingency: 5 },
      consumption: { puttyCoverage: 10, interiorPaintCoverage: 50, exteriorPaintCoverage: 50, bricksPerSqft: 5, plasterCftPerSqft: 0.10, brickJoiningCftPerSqft: 0.10, tileBeddingCftPerSqft: 0.20 }
    };

    try {
      const localKey = auth.currentUser?.uid ? `OkiConstruct_settings_${auth.currentUser.uid}` : null;
      const savedAdmin = localKey ? localStorage.getItem(localKey) : null;
      const customData = userData?.customFormulas || (savedAdmin ? JSON.parse(savedAdmin) : null);
      if (customData) {
         masterSettings = { ...masterSettings, ...customData };
      }
    } catch (err) {}

    try {
      // Create a virtual floor array for the engine
      const report = generateProjectBOQ([boundaryFloor], 1, "0", rates, masterSettings, units, 'civil_only', premiumData);
      
      // --- POST-PROCESSING FOR BOUNDARY ---
      if (report && report.floorReports && report.floorReports[0]) {
          report.floorReports[0].sections.forEach((section: any) => {
              const isMasonry = section.title.toLowerCase().includes('masonry') || section.title.toLowerCase().includes('plaster') || section.title.toLowerCase().includes('brick');
              
              if (isMasonry) {
                  // Handle Plaster Deductions
                  if (boundaryData.finish === 'No Plaster') {
                      section.items = section.items.filter((item: any) => !item.name.toLowerCase().includes('plaster') && !item.name.toLowerCase().includes('putty'));
                  } else if (boundaryData.finish === 'Plaster Inside Only') {
                      section.items.forEach((item: any) => {
                          if (item.name.toLowerCase().includes('plaster') || item.name.toLowerCase().includes('putty')) {
                              item.qty = Math.ceil(item.qty / 2);
                          }
                      });
                  }

                  // Handle Double Brick Wall
                  if (boundaryData.wallType === 'Double Brick (9 Inch)') {
                      section.items.forEach((item: any) => {
                          if (item.name.toLowerCase().includes('brick')) {
                              item.qty = Math.ceil(item.qty * 2);
                          }
                      });
                  }
                  
                  // Recalculate section subtotal
                  section.sectionTotal = section.items.reduce((sum: number, item: any) => sum + ((Number(item.qty) || 0) * (Number(item.rate) || 0)), 0);
              }
          });

          // Inject Boundary Topping if selected
          if (boundaryData.topping !== 'None' && rates.toppingRate) {
              report.floorReports[0].sections.push({
                  title: "External Works & Security",
                  items: [{
                      name: `Security Topping (${boundaryData.topping})`,
                      unit: 'RFT',
                      qty: Math.ceil(totalPerimeter),
                      rate: Number(rates.toppingRate)
                  }],
                  sectionTotal: Math.ceil(totalPerimeter) * Number(rates.toppingRate)
              });
          }
      }

      setBoqReport(report);
      setCurrentStep(9); 
    } catch (err) { console.error("Calculation Error:", err); }
  };

  const handleGenerateBOQ = () => {
    setErrorMsg("");
    if (!Number(laborRates.mason)) return setErrorMsg("Please enter Mason Labor Rate.");
    if (boqScope !== 'civil_only' && !Number(laborRates.painter)) return setErrorMsg("Please enter Painter Labor Rate.");

    const finalSnaps = floorsData.map((f, i) => {
        const layoutWithAreas = JSON.parse(JSON.stringify(f));

        if (buildingType === 'apartment' || buildingType === 'commercial') {
            let flattenedBedrooms: any[] = [];
            let flattenedBathrooms: any[] = [];
            let mainHall = { length: '0', breadth: '0' };
            let mainKitchen = { length: '0', breadth: '0' };

            if (f.isCommercial || buildingType === 'commercial') {
                f.shops?.forEach((s: any) => flattenedBedrooms.push({ length: s.length, breadth: s.breadth, name: 'Chamber' }));
                for (let w = 0; w < Number(f.washrooms?.count || 0); w++) {
                    flattenedBathrooms.push({ length: f.washrooms.length, breadth: f.washrooms.breadth, isAttached: false, layoutType: 'outside' });
                }
                if (f.passage && f.passage.length) {
                    flattenedBedrooms.push({ length: f.passage.length, breadth: f.passage.breadth, name: 'Passage' });
                }
            } else {
                f.flats?.forEach((flat: any, fIndex: number) => {
                    if (fIndex === 0) {
                        mainHall = { length: flat.hall.length, breadth: flat.hall.breadth };
                        mainKitchen = { length: flat.kitchen.length, breadth: flat.kitchen.breadth };
                    } else {
                        flattenedBedrooms.push({ length: flat.hall.length, breadth: flat.hall.breadth, name: 'Hall' });
                        flattenedBedrooms.push({ length: flat.kitchen.length, breadth: flat.kitchen.breadth, name: 'Kitchen' });
                    }
                    if(flat.foyer) flattenedBedrooms.push({ length: flat.foyer.length, breadth: flat.foyer.breadth, name: 'Foyer' });
                    if(flat.balcony) flattenedBedrooms.push({ length: flat.balcony.length, breadth: flat.balcony.breadth, name: 'Balcony' });
                    if(flat.passage) flattenedBedrooms.push({ length: flat.passage.length, breadth: flat.passage.breadth, name: 'Passage' });
                    if(flat.porch) flattenedBedrooms.push({ length: flat.porch.length, breadth: flat.porch.breadth, name: 'Porch' });

                    flat.bedrooms?.forEach((b: any) => flattenedBedrooms.push({ length: b.length, breadth: b.breadth, name: 'Bedroom' }));
                    flat.bathrooms?.forEach((b: any) => flattenedBathrooms.push({ ...b }));
                });
            }

            if (apartmentData.corridor.hasCorridor) flattenedBedrooms.push({ length: apartmentData.corridor.length, breadth: apartmentData.corridor.width, name: 'Corridor' });
            if (hasStairs) flattenedBedrooms.push({ length: stairsDim.length, breadth: stairsDim.width, name: 'Stairs' });
            if (apartmentData.lift.hasLift) {
                for (let l = 0; l < Number(apartmentData.lift.count || 1); l++) {
                    flattenedBedrooms.push({ length: apartmentData.lift.length, breadth: apartmentData.lift.width, name: 'Lift' });
                }
            }
            layoutWithAreas.hall = mainHall;
            layoutWithAreas.kitchenDining = mainKitchen;
            layoutWithAreas.foyer = { length: '0', breadth: '0' };
            layoutWithAreas.bedrooms = flattenedBedrooms;
            layoutWithAreas.bathrooms = flattenedBathrooms;
        } else {
            // Ensure properties exist for Residence calculation engine
            layoutWithAreas.foyer = f.foyer || { length: '0', breadth: '0' };
            layoutWithAreas.balcony = f.balcony || { length: '0', breadth: '0' };
            layoutWithAreas.passage = f.passage || { length: '0', breadth: '0' };
            layoutWithAreas.porch = f.porch || { length: '0', breadth: '0' };
        }

        const processedOpenings = JSON.parse(JSON.stringify(openingsData[i]));
        if ((buildingType === 'apartment' && f.isCommercial) || buildingType === 'commercial') {
            processedOpenings.roomDoors = processedOpenings.shutters;
        }

        return {
            floorName: f.floorName, layout: layoutWithAreas, buildingType, apartmentData: apartmentData,
            structure: structure, openings: processedOpenings, tiles: tiles, paintData: paintData,
            laborRates: laborRates, hasStairs, stairsDim: { ...stairsDim }
        };
    });
    
    let masterSettings: any = {
      ratios: { pcc: { c: 1, s: 3, g: 6 }, slab: { c: 1, s: 2, g: 4 }, footing: { c: 1, s: 2, g: 4 }, plinthBeam: { c: 1, s: 3, g: 4 }, beam: { c: 1, s: 3, g: 4 }, column: { c: 1, s: 3, g: 4 }, mortar: { c: 1, s: 4, g: 0 }, tileBedding: { c: 1, s: 4, g: 0 } },
      tmtSpecs: { '8mm': { length: 38, weight: 4.74 }, '10mm': { length: 38, weight: 7.40 }, '12mm': { length: 38, weight: 10.66 }, '16mm': { length: 38, weight: 18.96 }, '20mm': { length: 38, weight: 29.60 }, '25mm': { length: 38, weight: 46.20 } },
      dimensions: { slabThickness: 5, meshGap: 4, ringSpacing: 5 },
      percentages: { wastage: { cement: 10, sand: 10, gravel: 10, tmt: 10, bricks: 10, tiles: 10 }, concreteAllowances: { footing: 5, column: 5, plinthBeam: 5, roofBeam: 5, slab: 25 }, shuttering: 5, electrical: 12, plumbing: 8, misc: 5, logistics: 10, contingency: 5 },
      consumption: { puttyCoverage: 10, interiorPaintCoverage: 50, exteriorPaintCoverage: 50, bricksPerSqft: 5, plasterCftPerSqft: 0.10, brickJoiningCftPerSqft: 0.10, tileBeddingCftPerSqft: 0.20 }
    };

    try {
      const localKey = auth.currentUser?.uid ? `OkiConstruct_settings_${auth.currentUser.uid}` : null;
      const savedAdmin = localKey ? localStorage.getItem(localKey) : null;
      const customData = userData?.customFormulas || (savedAdmin ? JSON.parse(savedAdmin) : null);
      if (customData) {
        masterSettings = {
          ratios: { ...masterSettings.ratios, ...(customData.ratios || {}) }, tmtSpecs: { ...masterSettings.tmtSpecs, ...(customData.tmtSpecs || {}) },
          dimensions: { ...masterSettings.dimensions, ...(customData.dimensions || {}) },
          percentages: { 
            ...masterSettings.percentages, ...(customData.percentages || {}),
            wastage: { ...masterSettings.percentages.wastage, ...(customData.percentages?.wastage || {}) },
            concreteAllowances: { ...masterSettings.percentages.concreteAllowances, ...(customData.percentages?.concreteAllowances || {}) }
          },
          consumption: { ...masterSettings.consumption, ...(customData.consumption || {}) }
        };
      }
    } catch (err) { console.error("Settings Parsing Error", err); }

    try {
      const report = generateProjectBOQ(finalSnaps, totalFloorsCount, slabOverhang, rates, masterSettings, units, boqScope, premiumData);
      setBoqReport(report);
      setCurrentStep(9); 
    } catch (err) { console.error("Calculation Error:", err); }
  };
  
  const saveEstimateToDatabase = async () => {
    if (!auth.currentUser) return alert("Please log in from the Dashboard to save your estimates!");
    if (!boqReport) return alert("Error: BOQ Report is empty. Please generate the report first!");
    setIsSaving(true);
    
    try {
      const payload: any = {
        userId: auth.currentUser.uid, uid: auth.currentUser.uid, 
        projectName: (projectName || "OkiConstruct Build").trim(), 
        totalFloors: totalFloorsCount, siteDetails: siteDetails, buildingType: buildingType,
        grandTotal: getVisibleGrandTotal(),
        boqData: JSON.parse(JSON.stringify(boqReport)), 
        
        inputs: {
          units, boqScope, structure, floorsData, openingsData, rates, tiles, paintData, laborRates,
          apartmentData, apartmentFlats, flatsCount, commercialGroundFloor, hasStairs, stairsDim, slabOverhang,
          premiumData, hiddenSections,
          commChambersCount, commBathType, commSharedBathCount, commLayout,
          boundaryData: buildingType === 'boundary' ? boundaryData : null,
          customServices: isPremium ? customServices : [], 
          customTerms: isPremium ? customTerms : "", 
          letterheadImg: isPremium ? letterheadImg : null
        }
      };

      const cleanPayload = JSON.parse(JSON.stringify(payload)); 

      if (existingProjectId) {
         cleanPayload.updatedAt = serverTimestamp();
         await updateDoc(doc(db, "boq_projects", existingProjectId), cleanPayload);
         setIsSaved(true); 
         alert(`Success! Modifications to your BOQ have been saved to the cloud.\nProject ID: ${existingProjectId}`);
      } else {
         cleanPayload.createdAt = serverTimestamp();
         const docRef = await addDoc(collection(db, "boq_projects"), cleanPayload);
         setExistingProjectId(docRef.id);
         setIsSaved(true); 
         alert(`Success! Estimate securely saved to the cloud.\nProject ID: ${docRef.id}`);
      }
    } catch (error: any) { alert("Database Error: " + error.message); } 
    finally { setIsSaving(false); }
  };

  const updateTile = (roomKey: string, field: 'size' | 'type' | 'price', value: string) => setTiles(prev => ({ ...prev, [roomKey]: { ...(prev[roomKey] || { size: '', type: '', price: '' }), [field]: value } }));
  const validateAndProceed = (targetStep: number) => { setErrorMsg(""); setCurrentStep(targetStep); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const inputStyle = "w-full border border-gray-200 bg-gray-50 rounded-xl px-3 py-3 md:p-4 text-center md:text-left text-gray-900 font-medium focus:bg-white focus:ring-2 focus:ring-[#22c55e]/30 focus:border-[#22c55e] transition-all outline-none";
  const selectStyle = "w-full border border-gray-200 bg-gray-50 rounded-xl p-4 text-gray-900 font-medium focus:bg-white focus:ring-2 focus:ring-[#22c55e]/30 focus:border-[#22c55e] transition-all outline-none cursor-pointer appearance-none";
  const labelStyle = "text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block";
  const ErrorDisplay = () => errorMsg ? (<div className="bg-red-50 text-red-600 border border-red-200 rounded-xl p-4 mt-8 mb-4 font-medium flex items-center gap-3 animate-in slide-in-from-bottom-2 print:hidden"><span className="text-xl">⚠️</span> {errorMsg}</div>) : null;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans relative">
      
      {/* 🟢 NEW: Global Print CSS overrides browser headers/footers */}
      <style>{`
        @media print {
          @page { margin: 0.5cm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <main className="max-w-5xl mx-auto w-full p-4 md:p-8 mt-4 pb-24 print:p-0 print:mt-0 print:max-w-none relative z-10">

        {currentStep < 9 && (
          <div className="mb-10 animate-in fade-in duration-500 print:hidden">
            <div className="flex items-center justify-between text-[10px] md:text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
              <span className={currentStep >= 1 ? "text-[#22c55e]" : ""}>Setup</span>
              <span className={currentStep >= 2 ? "text-[#22c55e]" : ""}>Structure</span>
              {buildingType !== 'boundary' && <span className={currentStep >= 3 ? "text-[#22c55e]" : ""}>Layout</span>}
              {buildingType !== 'boundary' && <span className={currentStep >= 4 ? "text-[#22c55e]" : ""}>Openings</span>}
              <span className={currentStep >= 5 ? "text-[#22c55e]" : ""}>Pricing</span>
              {boqScope === 'full' && buildingType !== 'boundary' && <span className={currentStep >= 8 ? "text-[#22c55e]" : ""}>Review</span>}
            </div>
            <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
              <div className="bg-[#22c55e] h-full transition-all duration-700 ease-out rounded-full" style={{ width: `${((currentStep) / (buildingType === 'boundary' ? 3 : boqScope === 'civil_only' ? 5 : 8)) * 100}%` }}></div>
            </div>
          </div>
        )}

        <div className="bg-white border border-gray-100 rounded-3xl p-6 md:p-10 shadow-lg print:shadow-none print:border-none print:p-0">
          
          {/* --- STEP 1: SETUP & CONTEXT --- */}
          {currentStep === 1 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-2xl mx-auto">
              
              {isFromCAD && (
                <div className="mb-8 p-5 bg-green-50 border border-green-200 rounded-2xl flex flex-col md:flex-row justify-between items-center gap-4 shadow-sm">
                  <div>
                    <h3 className="font-bold text-green-900 flex items-center gap-2"><span className="text-xl">✨</span> Layout Auto-Imported</h3>
                    <p className="text-green-700 text-sm font-medium mt-1">Your floor plan dimensions have been successfully loaded from the CAD Engine.</p>
                  </div>
                  <button onClick={clearCadImport} className="text-xs font-bold bg-white text-green-700 border border-green-200 px-4 py-2.5 rounded-xl hover:bg-green-100 transition-colors shadow-sm whitespace-nowrap">
                    Clear & Start Blank Project
                  </button>
                </div>
              )}

              <div className="text-center mb-8">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">{isFromCAD ? 'CAD Import Successful ✨' : existingProjectId ? 'Editing Project Setup' : 'Project Setup & Context'}</h1>
                <p className="text-gray-500 font-medium">{isFromCAD ? "We've pre-filled your configuration based on your 2D layout." : "Define your project requirements and building scale."}</p>
              </div>

              <div className="space-y-6">
                <div>
                  <label className={labelStyle}>Project Name</label>
                  <input type="text" placeholder="e.g. Skyline Residence" className={inputStyle} value={projectName} onChange={e => setProjectName(e.target.value)} />
                </div>

                <div className="p-6 border border-gray-100 bg-gray-50/50 rounded-2xl">
                  
                  {buildingType !== 'boundary' && (
                    <div className="mb-8">
                      <label className={labelStyle}>BOQ Scope</label>
                      <div className="relative">
                        <select className={selectStyle} value={boqScope} onChange={e => setBoqScope(e.target.value as any)}>
                          <option value="full">Full Turnkey Project (Civil + Finishes)</option>
                          <option value="civil_only">Civil Structure Only</option>
                        </select>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 text-sm">▼</div>
                      </div>
                    </div>
                  )}

                  <label className="text-sm font-bold text-gray-900 mb-4 block">Building Typology</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    <button type="button" onClick={() => setBuildingType('residence')} className={`p-4 rounded-xl font-bold transition-all border ${buildingType === 'residence' ? 'bg-white border-[#22c55e] text-[#22c55e] shadow-sm ring-2 ring-[#22c55e]/20' : 'bg-transparent border-gray-200 text-gray-500 hover:bg-white'}`}>🏠 Residence</button>
                    <button type="button" onClick={() => { 
                        if(!isPremium) return alert("Apartment multi-unit generation is a Premium feature. Please upgrade your account from the Dashboard to unlock this capability.");
                        setBuildingType('apartment'); 
                      }} 
                      className={`p-4 rounded-xl font-bold transition-all border ${buildingType === 'apartment' ? 'bg-white border-[#22c55e] text-[#22c55e] shadow-sm ring-2 ring-[#22c55e]/20' : 'bg-transparent border-gray-200 text-gray-500 hover:bg-white'} ${!isPremium ? 'opacity-70' : ''}`}
                    >
                      🏢 Apartment {(!isPremium) && <span className="text-red-500 ml-1">🔒</span>}
                    </button>
                    <button type="button" onClick={() => { 
                        if(!isPremium) return alert("Commercial structure calculation is a Premium feature. Please upgrade your account from the Dashboard to unlock this capability.");
                        setBuildingType('commercial'); 
                      }} 
                      className={`p-4 rounded-xl font-bold transition-all border ${buildingType === 'commercial' ? 'bg-white border-[#22c55e] text-[#22c55e] shadow-sm ring-2 ring-[#22c55e]/20' : 'bg-transparent border-gray-200 text-gray-500 hover:bg-white'} ${!isPremium ? 'opacity-70' : ''}`}
                    >
                      🏬 Commercial {(!isPremium) && <span className="text-red-500 ml-1">🔒</span>}
                    </button>
                    <button type="button" onClick={() => { 
                        setBuildingType('boundary'); 
                      }} 
                      className={`p-4 rounded-xl font-bold transition-all border ${buildingType === 'boundary' ? 'bg-white border-[#22c55e] text-[#22c55e] shadow-sm ring-2 ring-[#22c55e]/20' : 'bg-transparent border-gray-200 text-gray-500 hover:bg-white'}`}
                    >
                      🧱 Boundary Wall
                    </button>
                  </div>

                  {buildingType !== 'boundary' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className={labelStyle}>Total Floors</label>
                        <div className="relative">
                          <select className={selectStyle} value={totalFloorsCount === 1 ? 'G' : `G+${totalFloorsCount - 1}`} onChange={(e) => {
                             if (!isPremium && e.target.value !== 'G') {
                               alert("Multi-Story calculation is a Premium feature. Please upgrade your account from the Dashboard to process multi-level buildings.");
                               return;
                             }
                             setTotalFloorsCount(e.target.value === 'G' ? 1 : parseInt(e.target.value.replace('G+', '')) + 1);
                          }}>
                            <option value="G">Ground Floor Only</option>
                            {Array.from({ length: 9 }, (_, i) => (
                               <option key={i + 1} value={`G+${i + 1}`}>G + {i + 1} Floor {(!isPremium) && '🔒'}</option>
                            ))}
                          </select>
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 text-sm">▼</div>
                        </div>
                      </div>
                      {buildingType === 'residence' && (
                        <div>
                          <label className={labelStyle}>Requirement</label>
                          <div className="relative">
                            <select className={selectStyle} value={siteDetails.bhkType} onChange={e => setSiteDetails({...siteDetails, bhkType: e.target.value})}>
                              <option value="1BHK">1 BHK</option><option value="2BHK">2 BHK</option><option value="3BHK">3 BHK</option><option value="4BHK">4 BHK</option>
                            </select>
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 text-sm">▼</div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* APARTMENT SETTINGS */}
                  {buildingType === 'apartment' && (
                    <div className="mt-6 p-5 bg-blue-50 border border-blue-100 rounded-2xl">
                      <label className="text-sm font-bold text-blue-900 mb-4 block">Floor Planning Configuration</label>
                      <div className="mb-6 bg-white p-4 rounded-xl border border-blue-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <span className="font-bold text-gray-700">Is the Ground Floor reserved for Commercial Shops?</span>
                        <div className="flex gap-2">
                            <button type="button" onClick={() => setCommercialGroundFloor(true)} className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${commercialGroundFloor ? 'bg-[#22c55e] text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>Yes</button>
                            <button type="button" onClick={() => setCommercialGroundFloor(false)} className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${!commercialGroundFloor ? 'bg-[#22c55e] text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>No</button>
                        </div>
                      </div>
                      {(!commercialGroundFloor) && (
                        <div className="bg-white p-5 rounded-xl border border-blue-100">
                            <label className={labelStyle}>Number of Flats Per Typical Floor</label>
                            <input type="number" min="1" className={`${inputStyle} mb-6`} value={flatsCount} onChange={(e) => handleFlatsCountChange(e.target.value)} />
                            {apartmentFlats.length > 0 && (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-100">
                                  {apartmentFlats.map((flat, i) => (
                                    <div key={i} className="flex items-center gap-4 bg-gray-50 p-3 rounded-xl border border-gray-100">
                                        <span className="font-bold text-gray-600 w-16">Flat {i+1}</span>
                                        <div className="relative flex-1">
                                          <select className={selectStyle} value={flat.type} onChange={(e) => { const newFlats = [...apartmentFlats]; newFlats[i].type = e.target.value; setApartmentFlats(newFlats); }}>
                                              <option value="1BHK">1 BHK</option><option value="2BHK">2 BHK</option><option value="3BHK">3 BHK</option><option value="4BHK">4 BHK</option>
                                          </select>
                                          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 text-sm">▼</div>
                                        </div>
                                    </div>
                                  ))}
                              </div>
                            )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* COMMERCIAL SETTINGS */}
                  {buildingType === 'commercial' && (
                    <div className="mt-6 p-5 bg-orange-50 border border-orange-100 rounded-2xl">
                      <label className="text-sm font-bold text-orange-900 mb-4 block">Commercial Configuration</label>
                      <div className="bg-white p-5 rounded-xl border border-orange-100 space-y-6">
                        <div>
                          <label className={labelStyle}>Chambers / Shops Per Floor</label>
                          <input type="number" min="1" className={inputStyle} value={commChambersCount} onChange={(e) => setCommChambersCount(parseInt(e.target.value) || 1)} />
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className={labelStyle}>Layout Style</label>
                            <select className={selectStyle} value={commLayout} onChange={(e) => setCommLayout(e.target.value)}>
                              <option value="Single Line">Single Line</option>
                              <option value="Clustered">Clustered</option>
                            </select>
                          </div>
                          <div>
                            <label className={labelStyle}>Bathroom Configuration</label>
                            <select className={selectStyle} value={commBathType} onChange={(e) => setCommBathType(e.target.value)}>
                              <option value="Shared Floor Bathrooms">Shared Floor Bathrooms</option>
                              <option value="Bathroom Per Chamber">Bathroom Per Chamber</option>
                            </select>
                          </div>
                        </div>

                        {commBathType === 'Shared Floor Bathrooms' && (
                          <div>
                            <label className={labelStyle}>Number of Shared Baths Per Floor</label>
                            <input type="number" min="1" className={inputStyle} value={commSharedBathCount} onChange={(e) => setCommSharedBathCount(parseInt(e.target.value) || 1)} />
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* BOUNDARY WALL SETTINGS */}
                  {buildingType === 'boundary' && (
                    <div className="mt-6 p-5 bg-stone-50 border border-stone-200 rounded-2xl">
                      <div className="flex justify-between items-center mb-4">
                        <label className="text-sm font-bold text-stone-900 block">Boundary Wall Specifications</label>
                        {isPremium && (
                          <select className="text-[10px] font-bold border border-[#22c55e]/50 rounded px-1 outline-none text-[#22c55e] bg-green-50 uppercase tracking-wider" value={units.boundaryLayout} onChange={(e) => setUnits({...units, boundaryLayout: e.target.value})}>
                            <option value="feet">Lengths in Feet (ft)</option><option value="meters">Lengths in Meters (m)</option>
                          </select>
                        )}
                      </div>
                      
                      <div className="bg-white p-5 rounded-xl border border-stone-200 space-y-6">
                        <div>
                          <label className={labelStyle}>Perimeter Dimensions ({getLabel(units.boundaryLayout)})</label>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                             <div><input type="number" placeholder="North Length" className={inputStyle} value={boundaryData.northLength} onChange={e => setBoundaryData({...boundaryData, northLength: e.target.value})} /><span className="text-[10px] font-bold text-gray-400 mt-1 block text-center">NORTH</span></div>
                             <div><input type="number" placeholder="South Length" className={inputStyle} value={boundaryData.southLength} onChange={e => setBoundaryData({...boundaryData, southLength: e.target.value})} /><span className="text-[10px] font-bold text-gray-400 mt-1 block text-center">SOUTH</span></div>
                             <div><input type="number" placeholder="East Length" className={inputStyle} value={boundaryData.eastLength} onChange={e => setBoundaryData({...boundaryData, eastLength: e.target.value})} /><span className="text-[10px] font-bold text-gray-400 mt-1 block text-center">EAST</span></div>
                             <div><input type="number" placeholder="West Length" className={inputStyle} value={boundaryData.westLength} onChange={e => setBoundaryData({...boundaryData, westLength: e.target.value})} /><span className="text-[10px] font-bold text-gray-400 mt-1 block text-center">WEST</span></div>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-gray-100 pt-4">
                          <div>
                            <label className={labelStyle}>Wall Height (Above Ground)</label>
                            <input type="number" className={inputStyle} placeholder="e.g. 6" value={boundaryData.height} onChange={e => setBoundaryData({...boundaryData, height: e.target.value})} />
                          </div>
                          <div>
                            <label className={labelStyle}>Column Spacing Dist.</label>
                            <input type="number" className={inputStyle} placeholder="e.g. 10" value={boundaryData.columnSpacing} onChange={e => setBoundaryData({...boundaryData, columnSpacing: e.target.value})} />
                          </div>
                          <div>
                            <label className={labelStyle}>Wall Type</label>
                            <select className={selectStyle} value={boundaryData.wallType} onChange={e => setBoundaryData({...boundaryData, wallType: e.target.value})}>
                              <option value="Single Brick (5 Inch)">Single Brick (5 Inch)</option>
                              <option value="Double Brick (9 Inch)">Double Brick (9 Inch)</option>
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-gray-100 pt-4">
                          <div>
                            <label className={labelStyle}>Plaster Finish</label>
                            <select className={selectStyle} value={boundaryData.finish} onChange={e => setBoundaryData({...boundaryData, finish: e.target.value})}>
                              <option value="Plaster Both Sides">Plaster Both Sides (In/Out)</option>
                              <option value="Plaster Inside Only">Plaster Inside Only</option>
                              <option value="No Plaster">No Plaster (Exposed Brick)</option>
                            </select>
                          </div>
                          <div>
                            <label className={labelStyle}>Security Topping Add-on</label>
                            <select className={selectStyle} value={boundaryData.topping} onChange={e => setBoundaryData({...boundaryData, topping: e.target.value})}>
                              <option value="None">None</option>
                              <option value="Barbed Wire (3 Lines)">Barbed Wire (3 Lines)</option>
                              <option value="Concertina Coil">Concertina Coil / Razor Wire</option>
                              <option value="Iron Spikes">Iron Spikes / Railing</option>
                            </select>
                          </div>
                        </div>

                      </div>
                    </div>
                  )}

                </div>

                {buildingType !== 'boundary' && (
                  <div className="p-5 border border-blue-100 bg-blue-50/50 rounded-2xl">
                    <label className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-3 block">Staircase Access</label>
                    <div className="flex flex-col md:flex-row gap-4">
                      <button type="button" onClick={() => { setSiteDetails({...siteDetails, stairType: 'None'}); setHasStairs(false); }} className={`flex-1 p-3 rounded-xl font-semibold transition-all border ${siteDetails.stairType === 'None' ? 'bg-white border-blue-500 text-blue-600 shadow-sm ring-2 ring-blue-500/20' : 'bg-transparent border-blue-200 text-gray-600 hover:bg-white'}`}>No Stairs</button>
                      <button type="button" onClick={() => { setSiteDetails({...siteDetails, stairType: 'Internal'}); setHasStairs(true); }} className={`flex-1 p-3 rounded-xl font-semibold transition-all border ${siteDetails.stairType === 'Internal' ? 'bg-white border-blue-500 text-blue-600 shadow-sm ring-2 ring-blue-500/20' : 'bg-transparent border-blue-200 text-gray-600 hover:bg-white'}`}>Internal Stairs</button>
                      <button type="button" onClick={() => { setSiteDetails({...siteDetails, stairType: 'External'}); setHasStairs(true); }} className={`flex-1 p-3 rounded-xl font-semibold transition-all border ${siteDetails.stairType === 'External' ? 'bg-white border-blue-500 text-blue-600 shadow-sm ring-2 ring-blue-500/20' : 'bg-transparent border-blue-200 text-gray-600 hover:bg-white'}`}>External Stairs</button>
                    </div>
                  </div>
                )}
              </div>

              {isPremium && buildingType !== 'boundary' && (
                <div className="mt-6 p-5 border border-[#22c55e]/30 bg-green-50/30 rounded-2xl">
                  <label className="flex items-center gap-3 cursor-pointer mb-4">
                    <input type="checkbox" checked={premiumData.isBasement} onChange={(e) => setPremiumData({...premiumData, isBasement: e.target.checked})} className="w-5 h-5 text-[#22c55e] rounded" />
                    <span className="font-bold text-gray-900">Include Basement Level <span className="text-[#22c55e] text-xs">★</span></span>
                  </label>
                  {premiumData.isBasement && (
                    <div className="pt-4 border-t border-green-100/50 space-y-4">
                      <label className={labelStyle}>Basement Wall Structure</label>
                      <div className="flex gap-4 mb-4">
                        <button type="button" onClick={() => setPremiumData({...premiumData, wallType: 'Brick'})} className={`flex-1 p-3 rounded-xl font-bold transition-all border ${premiumData.wallType === 'Brick' ? 'bg-white border-[#22c55e] text-[#22c55e] shadow-sm' : 'bg-transparent border-gray-200 text-gray-500'}`}>Standard Brick</button>
                        <button type="button" onClick={() => setPremiumData({...premiumData, wallType: 'RCC'})} className={`flex-1 p-3 rounded-xl font-bold transition-all border ${premiumData.wallType === 'RCC' ? 'bg-white border-[#22c55e] text-[#22c55e] shadow-sm' : 'bg-transparent border-gray-200 text-gray-500'}`}>RCC Retaining Walls</button>
                      </div>
                      {premiumData.wallType === 'RCC' && (
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className={labelStyle}>RCC Wall Thickness (Inches)</label>
                            <input type="number" className={inputStyle} value={premiumData.rccWallThickness} onChange={(e) => setPremiumData({...premiumData, rccWallThickness: e.target.value})} />
                          </div>
                          <div>
                            <label className={labelStyle}>Wall Mesh Size</label>
                            <select className={selectStyle} value={premiumData.rccWallMeshSize} onChange={(e) => setPremiumData({...premiumData, rccWallMeshSize: e.target.value})}>
                              <option value="8mm">8mm</option><option value="10mm">10mm</option><option value="12mm">12mm</option><option value="16mm">16mm</option>
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <ErrorDisplay />
              <button type="button" onClick={handleSetupComplete} className="w-full bg-gray-900 text-white font-bold text-lg p-4 rounded-xl mt-4 hover:bg-[#22c55e] transition-colors shadow-md">
                Continue to Structural Setup ➔
              </button>
            </div>
          )}

          {/* --- STEP 2: STRUCTURE --- */}
          {currentStep === 2 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-3xl mx-auto">
              
              <div className="mb-8 border-b border-gray-100 pb-6 text-center">
                <h1 className="text-3xl font-bold text-gray-900 flex items-center justify-center gap-3">
                  <span className="text-3xl">🏛️</span> Structural Elements
                </h1>
                {isFromCAD && <p className="text-[#22c55e] font-bold mt-2 text-sm uppercase tracking-wide">Layout Dimensions Auto-Synced from CAD!</p>}
                {buildingType === 'boundary' && <p className="text-[#22c55e] font-bold mt-2 text-sm uppercase tracking-wide">Boundary Wall Foundation Specs</p>}
              </div>

              <div className="border border-gray-200 p-6 rounded-3xl bg-white shadow-sm">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                    <span className="bg-green-100 text-[#22c55e] w-8 h-8 rounded-full flex items-center justify-center text-sm">1</span> Footing
                  </h2>
                </div>
                <div className="space-y-5">
                  <div>
                    <label className={labelStyle}>Number of footings</label>
                    {buildingType === 'boundary' && <span className="text-xs text-[#22c55e] mb-2 block font-medium">Auto-calculated based on perimeter & column spacing. You can modify it.</span>}
                    <input type="number" inputMode="decimal" min="0" placeholder="e.g., 12" className={`${inputStyle} ring-2 ring-blue-500/20`} value={structure.footing.count} onChange={(e) => setStructure({ ...structure, footing: { ...structure.footing, count: e.target.value } })} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="flex justify-between items-end mb-2">
                         <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-0">Breadth</label>
                         {isPremium ? (
                           <select className="text-[10px] font-bold border border-[#22c55e]/50 rounded px-1 outline-none text-[#22c55e] bg-green-50 uppercase tracking-wider" value={units.footing} onChange={(e) => setUnits({...units, footing: e.target.value})}>
                             <option value="feet">Feet</option><option value="meters">Meters</option><option value="inches">Inches</option><option value="cm">cm</option><option value="mm">mm</option>
                           </select>
                         ) : <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">(FT)</span>}
                      </div>
                      <input type="number" inputMode="decimal" min="0" placeholder="Breadth" className={inputStyle} value={structure.footing.breadth} onChange={(e) => setStructure({ ...structure, footing: { ...structure.footing, breadth: e.target.value } })} />
                    </div>
                    <div>
                      <div className="flex justify-between items-end mb-2">
                         <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-0">Width</label>
                         {isPremium ? (
                           <select className="text-[10px] font-bold border border-[#22c55e]/50 rounded px-1 outline-none text-[#22c55e] bg-green-50 uppercase tracking-wider" value={units.footing} onChange={(e) => setUnits({...units, footing: e.target.value})}>
                             <option value="feet">Feet</option><option value="meters">Meters</option><option value="inches">Inches</option><option value="cm">cm</option><option value="mm">mm</option>
                           </select>
                         ) : <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">(FT)</span>}
                      </div>
                      <input type="number" inputMode="decimal" min="0" placeholder="Width" className={inputStyle} value={structure.footing.width} onChange={(e) => setStructure({ ...structure, footing: { ...structure.footing, width: e.target.value } })} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between items-end mb-2">
                       <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-0">Depth</label>
                       {isPremium ? (
                         <select className="text-[10px] font-bold border border-[#22c55e]/50 rounded px-1 outline-none text-[#22c55e] bg-green-50 uppercase tracking-wider" value={units.footing} onChange={(e) => setUnits({...units, footing: e.target.value})}>
                           <option value="feet">Feet</option><option value="meters">Meters</option><option value="inches">Inches</option><option value="cm">cm</option><option value="mm">mm</option>
                         </select>
                       ) : <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">(FT)</span>}
                    </div>
                    <input type="number" inputMode="decimal" min="0" placeholder="Depth" className={inputStyle} value={structure.footing.depth} onChange={(e) => setStructure({ ...structure, footing: { ...structure.footing, depth: e.target.value } })} />
                  </div>

                  {isPremium && (
                    <div className="mt-4 p-4 border border-[#22c55e]/30 bg-green-50/30 rounded-2xl grid grid-cols-2 gap-4">
                      <div>
                        <label className={labelStyle}>Pad Thickness (Inches) <span className="text-[#22c55e]">★</span></label>
                        <input type="number" className={inputStyle} value={premiumData.customFootingThickness} onChange={(e) => setPremiumData({...premiumData, customFootingThickness: e.target.value})} />
                      </div>
                      <div>
                        <label className={labelStyle}>Footing Mesh Size <span className="text-[#22c55e]">★</span></label>
                        <select className={selectStyle} value={premiumData.customFootingMesh} onChange={(e) => setPremiumData({...premiumData, customFootingMesh: e.target.value})}>
                           <option value="10mm">10mm</option><option value="12mm">12mm</option><option value="16mm">16mm</option>
                        </select>
                      </div>
                    </div>
                  )}

                </div>
              </div>

              <div className="border border-gray-200 p-6 rounded-3xl bg-white shadow-sm relative overflow-hidden">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                    <span className="bg-green-100 text-[#22c55e] w-8 h-8 rounded-full flex items-center justify-center text-sm">2</span> Columns
                  </h2>
                </div>

                <div className="mb-5 bg-blue-50 border border-blue-100 p-4 rounded-xl flex items-center gap-4 shadow-inner">
                  <div className="bg-white p-2 rounded-lg shadow-sm"><span className="text-xl">🔗</span></div>
                  <div>
                    <span className="block text-xs font-bold text-blue-900 uppercase tracking-wider mb-0.5">Column Count Locked</span>
                    <span className="text-sm font-medium text-blue-700">Total columns are securely auto-synced to match your Foundation Footings count ({structure.footing.count || '0'}).</span>
                  </div>
                </div>

                <div className="space-y-5">
                  {buildingType !== 'boundary' && (
                    <div>
                      <div className="flex justify-between items-end mb-2">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-0">Height</label>
                        {isPremium ? (
                          <select className="text-[10px] font-bold border border-[#22c55e]/50 rounded px-1 outline-none text-[#22c55e] bg-green-50 uppercase tracking-wider" value={units.columnHeight} onChange={(e) => setUnits({...units, columnHeight: e.target.value})}>
                            <option value="feet">Feet</option><option value="meters">Meters</option><option value="inches">Inches</option><option value="cm">cm</option><option value="mm">mm</option>
                          </select>
                        ) : <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">(FT)</span>}
                      </div>
                      <input type="number" inputMode="decimal" min="0" placeholder="Height" className={inputStyle} value={structure.column.height} onChange={(e) => setStructure({ ...structure, column: { ...structure.column, height: e.target.value } })} />
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="flex justify-between items-end mb-2">
                         <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-0">Breadth</label>
                         {isPremium ? (
                           <select className="text-[10px] font-bold border border-[#22c55e]/50 rounded px-1 outline-none text-[#22c55e] bg-green-50 uppercase tracking-wider" value={units.columnDim} onChange={(e) => setUnits({...units, columnDim: e.target.value})}>
                             <option value="feet">Feet</option><option value="meters">Meters</option><option value="inches">Inches</option><option value="cm">cm</option><option value="mm">mm</option>
                           </select>
                         ) : <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">(IN)</span>}
                      </div>
                      <input type="number" inputMode="decimal" min="0" placeholder="Breadth" className={inputStyle} value={structure.column.breadth} onChange={(e) => setStructure({ ...structure, column: { ...structure.column, breadth: e.target.value } })} />
                    </div>
                    <div>
                      <div className="flex justify-between items-end mb-2">
                         <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-0">Width</label>
                         {isPremium ? (
                           <select className="text-[10px] font-bold border border-[#22c55e]/50 rounded px-1 outline-none text-[#22c55e] bg-green-50 uppercase tracking-wider" value={units.columnDim} onChange={(e) => setUnits({...units, columnDim: e.target.value})}>
                             <option value="feet">Feet</option><option value="meters">Meters</option><option value="inches">Inches</option><option value="cm">cm</option><option value="mm">mm</option>
                           </select>
                         ) : <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">(IN)</span>}
                      </div>
                      <input type="number" inputMode="decimal" min="0" placeholder="Width" className={inputStyle} value={structure.column.width} onChange={(e) => setStructure({ ...structure, column: { ...structure.column, width: e.target.value } })} />
                    </div>
                  </div>
                  
                  {isPremium && (
                    <div className="mt-4 p-4 border border-blue-100 bg-blue-50/50 rounded-2xl">
                      <span className="text-xs font-bold text-blue-600 uppercase tracking-wider block mb-3">Custom TMT Reinforcement <span className="text-blue-50 ml-1">★</span></span>
                      <p className="text-xs text-gray-500 mb-4 font-medium">Leave blank to let the engine auto-calculate based on floor count.</p>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                          <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase">Main Bar</label>
                            <select className={`${selectStyle} py-2 text-sm px-2`} value={structure.column.mainTmtSize || ''} onChange={(e) => setStructure({ ...structure, column: { ...structure.column, mainTmtSize: e.target.value } })}><option value="">Auto</option><option value="12mm">12mm</option><option value="16mm">16mm</option><option value="20mm">20mm</option><option value="25mm">25mm</option></select>
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase">Main Qty</label>
                            <input type="number" placeholder="Count" className={`${inputStyle} py-2 text-sm px-2`} value={structure.column.mainTmtCount || ''} onChange={(e) => setStructure({ ...structure, column: { ...structure.column, mainTmtCount: e.target.value } })} />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase">Extra Bar</label>
                            <select className={`${selectStyle} py-2 text-sm px-2`} value={structure.column.extraTmtSize || ''} onChange={(e) => setStructure({ ...structure, column: { ...structure.column, extraTmtSize: e.target.value } })}><option value="">None</option><option value="12mm">12mm</option><option value="16mm">16mm</option><option value="20mm">20mm</option><option value="25mm">25mm</option></select>
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase">Extra Qty</label>
                            <input type="number" placeholder="Count" className={`${inputStyle} py-2 text-sm px-2`} value={structure.column.extraTmtCount || ''} onChange={(e) => setStructure({ ...structure, column: { ...structure.column, extraTmtCount: e.target.value } })} />
                          </div>
                          <div className="col-span-2 md:col-span-1">
                            <label className="text-[10px] font-bold text-gray-500 uppercase">Rings</label>
                            <select className={`${selectStyle} py-2 text-sm px-2`} value={structure.column.ringSize || ''} onChange={(e) => setStructure({ ...structure, column: { ...structure.column, ringSize: e.target.value } })}><option value="">Auto</option><option value="8mm">8mm</option><option value="10mm">10mm</option><option value="12mm">12mm</option></select>
                          </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="border border-gray-200 p-6 rounded-3xl bg-white shadow-sm">
                <h2 className="font-bold text-lg text-gray-900 mb-6 flex items-center gap-2">
                  <span className="bg-green-100 text-[#22c55e] w-8 h-8 rounded-full flex items-center justify-center text-sm">3</span> Beams
                </h2>
                <div className="space-y-6">
                  
                  {/* Plinth Beam */}
                  <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                    <div className="flex justify-between items-center mb-3">
                       <span className="font-bold text-gray-700 block">Plinth Beam</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <div className="flex justify-between items-end mb-2">
                           <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-0">Depth</label>
                           {isPremium ? (
                             <select className="text-[10px] font-bold border border-[#22c55e]/50 rounded px-1 outline-none text-[#22c55e] bg-green-50 uppercase tracking-wider" value={units.plinthBeam} onChange={(e) => setUnits({...units, plinthBeam: e.target.value})}>
                               <option value="feet">Feet</option><option value="meters">Meters</option><option value="inches">Inches</option><option value="cm">cm</option><option value="mm">mm</option>
                             </select>
                           ) : <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">(IN)</span>}
                        </div>
                        <input type="number" inputMode="decimal" min="0" placeholder="Depth" className={inputStyle} value={structure.plinthBeam.depth} onChange={(e) => setStructure({ ...structure, plinthBeam: { ...structure.plinthBeam, depth: e.target.value } })} />
                      </div>
                      <div>
                        <div className="flex justify-between items-end mb-2">
                           <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-0">Width</label>
                           {isPremium ? (
                             <select className="text-[10px] font-bold border border-[#22c55e]/50 rounded px-1 outline-none text-[#22c55e] bg-green-50 uppercase tracking-wider" value={units.plinthBeam} onChange={(e) => setUnits({...units, plinthBeam: e.target.value})}>
                               <option value="feet">Feet</option><option value="meters">Meters</option><option value="inches">Inches</option><option value="cm">cm</option><option value="mm">mm</option>
                             </select>
                           ) : <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">(IN)</span>}
                        </div>
                        <input type="number" inputMode="decimal" min="0" placeholder="Width" className={inputStyle} value={structure.plinthBeam.width} onChange={(e) => setStructure({ ...structure, plinthBeam: { ...structure.plinthBeam, width: e.target.value } })} />
                      </div>
                    </div>
                    {isPremium && (
                      <div className="p-3 border border-blue-100 bg-blue-50/50 rounded-xl mt-4">
                        <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block mb-2">Override Plinth TMT <span className="text-blue-500">★</span></span>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            <div><label className="text-[9px] font-bold text-gray-500 uppercase">Main Size</label><select className={`${selectStyle} py-2 text-sm px-2`} value={structure.plinthBeam.mainTmtSize || ''} onChange={(e) => setStructure({ ...structure, plinthBeam: { ...structure.plinthBeam, mainTmtSize: e.target.value } })}><option value="">Auto</option><option value="12mm">12mm</option><option value="16mm">16mm</option><option value="20mm">20mm</option><option value="25mm">25mm</option></select></div>
                            <div><label className="text-[9px] font-bold text-gray-500 uppercase">Main Qty</label><input type="number" placeholder="Count" className={`${inputStyle} py-2 text-sm px-2`} value={structure.plinthBeam.mainTmtCount || ''} onChange={(e) => setStructure({ ...structure, plinthBeam: { ...structure.plinthBeam, mainTmtCount: e.target.value } })} /></div>
                            <div><label className="text-[9px] font-bold text-gray-500 uppercase">Extra Size</label><select className={`${selectStyle} py-2 text-sm px-2`} value={structure.plinthBeam.extraTmtSize || ''} onChange={(e) => setStructure({ ...structure, plinthBeam: { ...structure.plinthBeam, extraTmtSize: e.target.value } })}><option value="">None</option><option value="12mm">12mm</option><option value="16mm">16mm</option><option value="20mm">20mm</option><option value="25mm">25mm</option></select></div>
                            <div><label className="text-[9px] font-bold text-gray-500 uppercase">Extra Qty</label><input type="number" placeholder="Count" className={`${inputStyle} py-2 text-sm px-2`} value={structure.plinthBeam.extraTmtCount || ''} onChange={(e) => setStructure({ ...structure, plinthBeam: { ...structure.plinthBeam, extraTmtCount: e.target.value } })} /></div>
                            <div className="col-span-2 md:col-span-1"><label className="text-[9px] font-bold text-gray-500 uppercase">Rings</label><select className={`${selectStyle} py-2 text-sm px-2`} value={structure.plinthBeam.ringSize || ''} onChange={(e) => setStructure({ ...structure, plinthBeam: { ...structure.plinthBeam, ringSize: e.target.value } })}><option value="">Auto</option><option value="8mm">8mm</option><option value="10mm">10mm</option><option value="12mm">12mm</option></select></div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Roof Beam - Hidden for Boundary Wall */}
                  {buildingType !== 'boundary' && (
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                      <div className="flex justify-between items-center mb-3">
                         <span className="font-bold text-gray-700 block">Roof Beam</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <div className="flex justify-between items-end mb-2">
                             <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-0">Depth</label>
                             {isPremium ? (
                               <select className="text-[10px] font-bold border border-[#22c55e]/50 rounded px-1 outline-none text-[#22c55e] bg-green-50 uppercase tracking-wider" value={units.roofBeam} onChange={(e) => setUnits({...units, roofBeam: e.target.value})}>
                                 <option value="feet">Feet</option><option value="meters">Meters</option><option value="inches">Inches</option><option value="cm">cm</option><option value="mm">mm</option>
                               </select>
                             ) : <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">(IN)</span>}
                          </div>
                          <input type="number" inputMode="decimal" min="0" placeholder="Depth" className={inputStyle} value={structure.roofBeam.depth} onChange={(e) => setStructure({ ...structure, roofBeam: { ...structure.roofBeam, depth: e.target.value } })} />
                        </div>
                        <div>
                          <div className="flex justify-between items-end mb-2">
                             <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-0">Width</label>
                             {isPremium ? (
                               <select className="text-[10px] font-bold border border-[#22c55e]/50 rounded px-1 outline-none text-[#22c55e] bg-green-50 uppercase tracking-wider" value={units.roofBeam} onChange={(e) => setUnits({...units, roofBeam: e.target.value})}>
                                 <option value="feet">Feet</option><option value="meters">Meters</option><option value="inches">Inches</option><option value="cm">cm</option><option value="mm">mm</option>
                               </select>
                             ) : <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">(IN)</span>}
                          </div>
                          <input type="number" inputMode="decimal" min="0" placeholder="Width" className={inputStyle} value={structure.roofBeam.width} onChange={(e) => setStructure({ ...structure, roofBeam: { ...structure.roofBeam, width: e.target.value } })} />
                        </div>
                      </div>
                      {isPremium && (
                        <div className="p-3 border border-blue-100 bg-blue-50/50 rounded-xl mt-4">
                          <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block mb-2">Override Roof TMT <span className="text-blue-500">★</span></span>
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                              <div><label className="text-[9px] font-bold text-gray-500 uppercase">Main Size</label><select className={`${selectStyle} py-2 text-sm px-2`} value={structure.roofBeam.mainTmtSize || ''} onChange={(e) => setStructure({ ...structure, roofBeam: { ...structure.roofBeam, mainTmtSize: e.target.value } })}><option value="">Auto</option><option value="12mm">12mm</option><option value="16mm">16mm</option><option value="20mm">20mm</option><option value="25mm">25mm</option></select></div>
                              <div><label className="text-[9px] font-bold text-gray-500 uppercase">Main Qty</label><input type="number" placeholder="Count" className={`${inputStyle} py-2 text-sm px-2`} value={structure.roofBeam.mainTmtCount || ''} onChange={(e) => setStructure({ ...structure, roofBeam: { ...structure.roofBeam, mainTmtCount: e.target.value } })} /></div>
                              <div><label className="text-[9px] font-bold text-gray-500 uppercase">Extra Size</label><select className={`${selectStyle} py-2 text-sm px-2`} value={structure.roofBeam.extraTmtSize || ''} onChange={(e) => setStructure({ ...structure, roofBeam: { ...structure.roofBeam, extraTmtSize: e.target.value } })}><option value="">None</option><option value="12mm">12mm</option><option value="16mm">16mm</option><option value="20mm">20mm</option><option value="25mm">25mm</option></select></div>
                              <div><label className="text-[9px] font-bold text-gray-500 uppercase">Extra Qty</label><input type="number" placeholder="Count" className={`${inputStyle} py-2 text-sm px-2`} value={structure.roofBeam.extraTmtCount || ''} onChange={(e) => setStructure({ ...structure, roofBeam: { ...structure.roofBeam, extraTmtCount: e.target.value } })} /></div>
                              <div className="col-span-2 md:col-span-1"><label className="text-[9px] font-bold text-gray-500 uppercase">Rings</label><select className={`${selectStyle} py-2 text-sm px-2`} value={structure.roofBeam.ringSize || ''} onChange={(e) => setStructure({ ...structure, roofBeam: { ...structure.roofBeam, ringSize: e.target.value } })}><option value="">Auto</option><option value="8mm">8mm</option><option value="10mm">10mm</option><option value="12mm">12mm</option></select></div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* PREMIUM FEATURE: SILL & LINTEL BEAMS */}
                  {isPremium && buildingType !== 'boundary' && (
                    <div className="bg-green-50/30 p-4 rounded-2xl border border-[#22c55e]/30 space-y-4">
                       <span className="font-bold text-gray-700 block mb-2">Extra Beams (Premium) <span className="text-[#22c55e]">★</span></span>
                       
                       {/* Sill Beam */}
                       <label className="flex items-center gap-3 cursor-pointer">
                          <input type="checkbox" checked={premiumData.hasSillBeam} onChange={(e) => setPremiumData({...premiumData, hasSillBeam: e.target.checked})} className="w-5 h-5 text-[#22c55e] rounded" />
                          <span className="font-bold text-gray-700">Include Sill Beams (Under Windows)</span>
                       </label>
                       {premiumData.hasSillBeam && (
                         <div className="grid grid-cols-2 gap-4 pl-8 mb-4">
                           <div><label className={labelStyle}>Depth (in)</label><input type="number" className={inputStyle} value={premiumData.sillDepth} onChange={(e) => setPremiumData({...premiumData, sillDepth: e.target.value})} /></div>
                           <div><label className={labelStyle}>Width (in)</label><input type="number" className={inputStyle} value={premiumData.sillWidth} onChange={(e) => setPremiumData({...premiumData, sillWidth: e.target.value})} /></div>
                         </div>
                       )}

                       {/* Lintel Beam */}
                       <div className="pt-2 border-t border-green-200/50">
                         <label className="flex items-center gap-3 cursor-pointer mt-2">
                            <input type="checkbox" checked={premiumData.hasLintelBeam} onChange={(e) => setPremiumData({...premiumData, hasLintelBeam: e.target.checked})} className="w-5 h-5 text-[#22c55e] rounded" />
                            <span className="font-bold text-gray-700">Include Lintel Beams (Over Doors/Windows)</span>
                         </label>
                         {premiumData.hasLintelBeam && (
                           <div className="grid grid-cols-2 gap-4 pl-8 mt-4">
                             <div><label className={labelStyle}>Depth (in)</label><input type="number" className={inputStyle} value={premiumData.lintelDepth} onChange={(e) => setPremiumData({...premiumData, lintelDepth: e.target.value})} /></div>
                             <div><label className={labelStyle}>Width (in)</label><input type="number" className={inputStyle} value={premiumData.lintelWidth} onChange={(e) => setPremiumData({...premiumData, lintelWidth: e.target.value})} /></div>
                           </div>
                         )}
                       </div>
                    </div>
                  )}
                </div>
              </div>

              {/* PREMIUM FEATURE: BASE FLOORING & SLAB */}
              {isPremium && buildingType !== 'boundary' && (
                <div className="border border-gray-200 p-6 rounded-3xl bg-white shadow-sm mt-8">
                  <h2 className="font-bold text-lg text-gray-900 mb-6 flex items-center gap-2">
                    <span className="bg-green-100 text-[#22c55e] w-8 h-8 rounded-full flex items-center justify-center text-sm">4</span> Flooring & Roof Slab <span className="text-[#22c55e] ml-2">★</span>
                  </h2>
                  <div className="space-y-6">
                    
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                      <label className={labelStyle}>Ground/Basement Floor Casting Type</label>
                      <div className="flex gap-4 mb-4">
                        <button type="button" onClick={() => setPremiumData({...premiumData, floorType: 'PCC'})} className={`flex-1 p-3 rounded-xl font-bold transition-all border ${premiumData.floorType === 'PCC' ? 'bg-white border-[#22c55e] text-[#22c55e] shadow-sm' : 'bg-transparent border-gray-200 text-gray-500'}`}>Standard PCC</button>
                        <button type="button" onClick={() => setPremiumData({...premiumData, floorType: 'RCC'})} className={`flex-1 p-3 rounded-xl font-bold transition-all border ${premiumData.floorType === 'RCC' ? 'bg-white border-[#22c55e] text-[#22c55e] shadow-sm' : 'bg-transparent border-gray-200 text-gray-500'}`}>Heavy Duty RCC</button>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className={labelStyle}>Floor Thickness (Inches)</label>
                          <input type="number" className={inputStyle} value={premiumData.floorThickness} onChange={(e) => setPremiumData({...premiumData, floorThickness: e.target.value})} />
                        </div>
                        {premiumData.floorType === 'RCC' && (
                          <div>
                            <label className={labelStyle}>RCC Floor Mesh</label>
                            <select className={selectStyle} value={premiumData.floorRccMeshSize} onChange={(e) => setPremiumData({...premiumData, floorRccMeshSize: e.target.value})}>
                              <option value="8mm">8mm</option><option value="10mm">10mm</option><option value="12mm">12mm</option>
                            </select>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 grid grid-cols-2 gap-4">
                       <div>
                          <span className="font-bold text-gray-700 block">Suspended Roof Slab</span>
                          <p className="text-xs text-gray-500 mt-1">Override default 10mm mesh</p>
                       </div>
                       <div>
                          <label className={labelStyle}>Slab Mesh Size</label>
                          <select className={selectStyle} value={premiumData.customSlabMesh} onChange={(e) => setPremiumData({...premiumData, customSlabMesh: e.target.value})}>
                            <option value="8mm">8mm</option><option value="10mm">10mm</option><option value="12mm">12mm</option>
                          </select>
                       </div>
                    </div>

                  </div>
                </div>
              )}

              <ErrorDisplay />
              <div className="flex gap-4 pt-4">
                <button onClick={() => validateAndProceed(1)} className="w-1/3 border border-gray-200 text-gray-600 p-4 font-semibold rounded-xl hover:bg-gray-50 transition-colors">Back</button>
                <button 
                  onClick={() => {
                     setErrorMsg("");
                     if (buildingType === 'boundary') {
                         setCurrentStep(5); // Skip Layout and Openings for boundary wall
                     } else {
                         validateAndProceed(3);
                     }
                  }} 
                  className="w-2/3 bg-[#22c55e] text-white font-bold text-lg p-4 rounded-xl hover:bg-[#1ea950] transition-colors shadow-md flex items-center justify-center gap-2"
                >
                  Continue to {buildingType === 'boundary' ? 'Pricing' : 'Layout'} ➔
                </button>
              </div>
            </div>
          )}

          {/* --- STEP 3: LAYOUT --- */}
          {currentStep === 3 && floorsData[activeFloor] && (
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
                  {isPremium ? (
                    <select className="text-[10px] font-bold border border-[#22c55e]/50 rounded px-1 outline-none text-[#22c55e] bg-green-50 uppercase tracking-wider" value={units.layout} onChange={(e) => setUnits({...units, layout: e.target.value})}>
                      <option value="feet">Feet</option><option value="meters">Meters</option><option value="inches">Inches</option><option value="cm">cm</option><option value="mm">mm</option>
                    </select>
                  ) : <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pl-2 pr-3">FT</span>}
                </div>
              </div>
              
              {buildingType === 'apartment' || buildingType === 'commercial' ? (
                <div className="space-y-6">
                  {floorsData[activeFloor].isCommercial || buildingType === 'commercial' ? (
                    <div className="p-6 border-2 border-orange-200 bg-orange-50 rounded-3xl">
                      <h3 className="text-xl font-black text-orange-900 mb-6 border-b border-orange-200 pb-4">Commercial Space Configuration</h3>
                      
                      <div className="space-y-4 mb-8">
                        <div className="flex justify-between items-center">
                          <h4 className="font-bold text-orange-800">Shops / Chambers</h4>
                          <button onClick={addShop} className="text-sm font-semibold text-[#22c55e] bg-green-50 px-4 py-2 rounded-lg hover:bg-green-100 transition-colors">+ Add Chamber</button>
                        </div>
                        {floorsData[activeFloor]?.shops?.map((shop: any, sIdx: number) => (
                          <div key={shop.id || sIdx} className="flex flex-col md:flex-row gap-4 items-center p-4 border border-orange-100 bg-white rounded-xl shadow-sm">
                            <span className="text-sm font-bold text-gray-500 w-full md:w-24">Shop {sIdx + 1}</span>
                            <div className="flex gap-4 w-full items-center">
                              <div className="w-full">
                                <div className="flex justify-between items-end mb-1">
                                   <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-0">Length</label>
                                   {isPremium ? (
                                     <select className="text-[10px] font-bold border border-[#22c55e]/50 rounded px-1 outline-none text-[#22c55e] bg-green-50 uppercase tracking-wider" value={units.layout} onChange={(e) => setUnits({...units, layout: e.target.value})}>
                                       <option value="feet">Feet</option><option value="meters">Meters</option><option value="inches">Inches</option><option value="cm">cm</option><option value="mm">mm</option>
                                     </select>
                                   ) : <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">(FT)</span>}
                                </div>
                                <input type="number" inputMode="decimal" min="0" placeholder={`Length`} className={inputStyle} value={shop.length} onChange={(e) => updateFloorData('shops', sIdx, 'length', e.target.value)} />
                              </div>
                              <span className="font-bold text-gray-300 mt-4">×</span>
                              <div className="w-full">
                                <div className="flex justify-between items-end mb-1">
                                   <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-0">Breadth</label>
                                   {isPremium ? (
                                     <select className="text-[10px] font-bold border border-[#22c55e]/50 rounded px-1 outline-none text-[#22c55e] bg-green-50 uppercase tracking-wider" value={units.layout} onChange={(e) => setUnits({...units, layout: e.target.value})}>
                                       <option value="feet">Feet</option><option value="meters">Meters</option><option value="inches">Inches</option><option value="cm">cm</option><option value="mm">mm</option>
                                     </select>
                                   ) : <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">(FT)</span>}
                                </div>
                                <input type="number" inputMode="decimal" min="0" placeholder={`Breadth`} className={inputStyle} value={shop.breadth} onChange={(e) => updateFloorData('shops', sIdx, 'breadth', e.target.value)} />
                              </div>
                            </div>
                            <button onClick={() => removeShop(sIdx)} className="text-red-400 hover:text-red-600 bg-red-50 p-3 rounded-lg md:ml-auto mt-4 md:mt-0">🗑️</button>
                          </div>
                        ))}
                      </div>

                      <h4 className="font-bold text-orange-800 mb-3">Common Washrooms</h4>
                      <div className="bg-white p-4 rounded-xl border border-orange-100 grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                        <div><label className={labelStyle}>Count</label><input type="number" className={inputStyle} value={floorsData[activeFloor].washrooms.count} onChange={(e) => updateFloorData('washrooms', null, 'count', e.target.value)} /></div>
                        <div>
                          <div className="flex justify-between items-end mb-2">
                             <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-0">Length</label>
                             {isPremium ? (
                               <select className="text-[10px] font-bold border border-[#22c55e]/50 rounded px-1 outline-none text-[#22c55e] bg-green-50 uppercase tracking-wider" value={units.layout} onChange={(e) => setUnits({...units, layout: e.target.value})}>
                                 <option value="feet">Feet</option><option value="meters">Meters</option><option value="inches">Inches</option><option value="cm">cm</option><option value="mm">mm</option>
                               </select>
                             ) : <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">(FT)</span>}
                          </div>
                          <input type="number" className={inputStyle} value={floorsData[activeFloor].washrooms.length} onChange={(e) => updateFloorData('washrooms', null, 'length', e.target.value)} />
                        </div>
                        <div>
                          <div className="flex justify-between items-end mb-2">
                             <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-0">Breadth</label>
                             {isPremium ? (
                               <select className="text-[10px] font-bold border border-[#22c55e]/50 rounded px-1 outline-none text-[#22c55e] bg-green-50 uppercase tracking-wider" value={units.layout} onChange={(e) => setUnits({...units, layout: e.target.value})}>
                                 <option value="feet">Feet</option><option value="meters">Meters</option><option value="inches">Inches</option><option value="cm">cm</option><option value="mm">mm</option>
                               </select>
                             ) : <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">(FT)</span>}
                          </div>
                          <input type="number" className={inputStyle} value={floorsData[activeFloor].washrooms.breadth} onChange={(e) => updateFloorData('washrooms', null, 'breadth', e.target.value)} />
                        </div>
                      </div>

                      {floorsData[activeFloor].passage && (
                        <div className="bg-white p-4 rounded-xl border border-orange-100">
                          <h4 className="font-bold text-orange-800 mb-3">Main Corridor</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <div className="flex justify-between items-end mb-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-0">Total Length</label>
                                {isPremium ? (
                                  <select className="text-[10px] font-bold border border-[#22c55e]/50 rounded px-1 outline-none text-[#22c55e] bg-green-50 uppercase tracking-wider" value={units.layout} onChange={(e) => setUnits({...units, layout: e.target.value})}>
                                    <option value="feet">Feet</option><option value="meters">Meters</option><option value="inches">Inches</option><option value="cm">cm</option><option value="mm">mm</option>
                                  </select>
                                ) : <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">(FT)</span>}
                              </div>
                              <input type="number" className={inputStyle} value={floorsData[activeFloor].passage.length} onChange={(e) => updateFloorData('passage', null, 'length', e.target.value)} />
                            </div>
                            <div>
                              <div className="flex justify-between items-end mb-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-0">Width</label>
                                {isPremium ? (
                                  <select className="text-[10px] font-bold border border-[#22c55e]/50 rounded px-1 outline-none text-[#22c55e] bg-green-50 uppercase tracking-wider" value={units.layout} onChange={(e) => setUnits({...units, layout: e.target.value})}>
                                    <option value="feet">Feet</option><option value="meters">Meters</option><option value="inches">Inches</option><option value="cm">cm</option><option value="mm">mm</option>
                                  </select>
                                ) : <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">(FT)</span>}
                              </div>
                              <input type="number" className={inputStyle} value={floorsData[activeFloor].passage.breadth} onChange={(e) => updateFloorData('passage', null, 'breadth', e.target.value)} />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-8">
                      {floorsData[activeFloor]?.flats?.map((flat: any, fIdx: number) => (
                        <div key={flat.id} className="p-6 border-2 border-gray-200 bg-gray-50 rounded-3xl">
                            <h2 className="text-xl font-black text-gray-900 mb-6 border-b border-gray-200 pb-4">Flat {fIdx + 1} ({flat.type})</h2>
                            
                            <h3 className="font-bold text-gray-900 mb-4 text-sm uppercase tracking-wider">Main Living Areas</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                              <div className="p-5 border border-gray-100 bg-white rounded-2xl shadow-sm">
                                  <div className="flex justify-between items-end mb-2">
                                     <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-0">Hall/Living Room</label>
                                     {isPremium ? (
                                       <select className="text-[10px] font-bold border border-[#22c55e]/50 rounded px-1 outline-none text-[#22c55e] bg-green-50 uppercase tracking-wider" value={units.layout} onChange={(e) => setUnits({...units, layout: e.target.value})}>
                                         <option value="feet">Feet</option><option value="meters">Meters</option><option value="inches">Inches</option><option value="cm">cm</option><option value="mm">mm</option>
                                       </select>
                                     ) : <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">(FT)</span>}
                                  </div>
                                  <div className="flex gap-4 items-center mt-2">
                                    <input type="number" placeholder="Length" className={inputStyle} value={flat.hall.length} onChange={e => updateFlatData(fIdx, 'hall', null, 'length', e.target.value)} />
                                    <span className="font-bold text-gray-300">×</span>
                                    <input type="number" placeholder="Breadth" className={inputStyle} value={flat.hall.breadth} onChange={e => updateFlatData(fIdx, 'hall', null, 'breadth', e.target.value)} />
                                  </div>
                              </div>
                              <div className="p-5 border border-gray-100 bg-white rounded-2xl shadow-sm">
                                  <div className="flex justify-between items-end mb-2">
                                     <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-0">Kitchen</label>
                                     {isPremium ? (
                                       <select className="text-[10px] font-bold border border-[#22c55e]/50 rounded px-1 outline-none text-[#22c55e] bg-green-50 uppercase tracking-wider" value={units.layout} onChange={(e) => setUnits({...units, layout: e.target.value})}>
                                         <option value="feet">Feet</option><option value="meters">Meters</option><option value="inches">Inches</option><option value="cm">cm</option><option value="mm">mm</option>
                                       </select>
                                     ) : <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">(FT)</span>}
                                  </div>
                                  <div className="flex gap-4 items-center mt-2">
                                    <input type="number" placeholder="Length" className={inputStyle} value={flat.kitchen.length} onChange={e => updateFlatData(fIdx, 'kitchen', null, 'length', e.target.value)} />
                                    <span className="font-bold text-gray-300">×</span>
                                    <input type="number" placeholder="Breadth" className={inputStyle} value={flat.kitchen.breadth} onChange={e => updateFlatData(fIdx, 'kitchen', null, 'breadth', e.target.value)} />
                                  </div>
                              </div>
                            </div>

                            <h3 className="font-bold text-gray-900 mb-4 text-sm uppercase tracking-wider pt-2 border-t border-gray-200">Transition & Outdoor Spaces</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                              <div className="p-5 border border-gray-100 bg-white rounded-2xl shadow-sm">
                                  <div className="flex justify-between items-end mb-2">
                                     <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-0">Foyer</label>
                                     {isPremium ? (
                                       <select className="text-[10px] font-bold border border-[#22c55e]/50 rounded px-1 outline-none text-[#22c55e] bg-green-50 uppercase tracking-wider" value={units.layout} onChange={(e) => setUnits({...units, layout: e.target.value})}>
                                         <option value="feet">Feet</option><option value="meters">Meters</option><option value="inches">Inches</option><option value="cm">cm</option><option value="mm">mm</option>
                                       </select>
                                     ) : <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">(FT)</span>}
                                  </div>
                                  <div className="flex gap-4 items-center mt-2">
                                    <input type="number" placeholder="Length" className={inputStyle} value={flat.foyer?.length || ''} onChange={e => updateFlatData(fIdx, 'foyer', null, 'length', e.target.value)} />
                                    <span className="font-bold text-gray-300">×</span>
                                    <input type="number" placeholder="Breadth" className={inputStyle} value={flat.foyer?.breadth || ''} onChange={e => updateFlatData(fIdx, 'foyer', null, 'breadth', e.target.value)} />
                                  </div>
                              </div>
                              <div className="p-5 border border-gray-100 bg-white rounded-2xl shadow-sm">
                                  <div className="flex justify-between items-end mb-2">
                                     <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-0">Internal Passage</label>
                                     {isPremium ? (
                                       <select className="text-[10px] font-bold border border-[#22c55e]/50 rounded px-1 outline-none text-[#22c55e] bg-green-50 uppercase tracking-wider" value={units.layout} onChange={(e) => setUnits({...units, layout: e.target.value})}>
                                         <option value="feet">Feet</option><option value="meters">Meters</option><option value="inches">Inches</option><option value="cm">cm</option><option value="mm">mm</option>
                                       </select>
                                     ) : <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">(FT)</span>}
                                  </div>
                                  <div className="flex gap-4 items-center mt-2">
                                    <input type="number" placeholder="Length" className={inputStyle} value={flat.passage?.length || ''} onChange={e => updateFlatData(fIdx, 'passage', null, 'length', e.target.value)} />
                                    <span className="font-bold text-gray-300">×</span>
                                    <input type="number" placeholder="Breadth" className={inputStyle} value={flat.passage?.breadth || ''} onChange={e => updateFlatData(fIdx, 'passage', null, 'breadth', e.target.value)} />
                                  </div>
                              </div>
                              <div className="p-5 border border-gray-100 bg-white rounded-2xl shadow-sm">
                                  <div className="flex justify-between items-end mb-2">
                                     <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-0">Balcony</label>
                                     {isPremium ? (
                                       <select className="text-[10px] font-bold border border-[#22c55e]/50 rounded px-1 outline-none text-[#22c55e] bg-green-50 uppercase tracking-wider" value={units.layout} onChange={(e) => setUnits({...units, layout: e.target.value})}>
                                         <option value="feet">Feet</option><option value="meters">Meters</option><option value="inches">Inches</option><option value="cm">cm</option><option value="mm">mm</option>
                                       </select>
                                     ) : <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">(FT)</span>}
                                  </div>
                                  <div className="flex gap-4 items-center mt-2">
                                    <input type="number" placeholder="Length" className={inputStyle} value={flat.balcony?.length || ''} onChange={e => updateFlatData(fIdx, 'balcony', null, 'length', e.target.value)} />
                                    <span className="font-bold text-gray-300">×</span>
                                    <input type="number" placeholder="Breadth" className={inputStyle} value={flat.balcony?.breadth || ''} onChange={e => updateFlatData(fIdx, 'balcony', null, 'breadth', e.target.value)} />
                                  </div>
                              </div>
                              <div className="p-5 border border-gray-100 bg-white rounded-2xl shadow-sm">
                                  <div className="flex justify-between items-end mb-2">
                                     <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-0">Porch</label>
                                     {isPremium ? (
                                       <select className="text-[10px] font-bold border border-[#22c55e]/50 rounded px-1 outline-none text-[#22c55e] bg-green-50 uppercase tracking-wider" value={units.layout} onChange={(e) => setUnits({...units, layout: e.target.value})}>
                                         <option value="feet">Feet</option><option value="meters">Meters</option><option value="inches">Inches</option><option value="cm">cm</option><option value="mm">mm</option>
                                       </select>
                                     ) : <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">(FT)</span>}
                                  </div>
                                  <div className="flex gap-4 items-center mt-2">
                                    <input type="number" placeholder="Length" className={inputStyle} value={flat.porch?.length || ''} onChange={e => updateFlatData(fIdx, 'porch', null, 'length', e.target.value)} />
                                    <span className="font-bold text-gray-300">×</span>
                                    <input type="number" placeholder="Breadth" className={inputStyle} value={flat.porch?.breadth || ''} onChange={e => updateFlatData(fIdx, 'porch', null, 'breadth', e.target.value)} />
                                  </div>
                              </div>
                            </div>

                            <div className="space-y-4 mb-6 pt-2 border-t border-gray-200">
                              <div className="flex justify-between items-center">
                                <h3 className="font-bold text-gray-900 text-sm uppercase tracking-wider">Bedrooms</h3>
                                <button onClick={() => addFlatBedroom(fIdx)} className="text-sm font-semibold text-[#22c55e] bg-green-50 px-3 py-1.5 rounded-lg hover:bg-green-100 transition-colors">+ Add Room</button>
                              </div>
                              {flat.bedrooms.map((bed: any, bIdx: number) => (
                                  <div key={bed.id} className="flex flex-col md:flex-row gap-4 items-center p-4 border border-gray-100 bg-white rounded-xl">
                                    <span className="text-sm font-bold text-gray-500 w-full md:w-20">Bed {bIdx + 1}</span>
                                    <div className="flex gap-4 w-full">
                                        <div className="w-full">
                                          <div className="flex justify-between items-end mb-1">
                                             <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-0">Length</label>
                                             {isPremium ? (
                                               <select className="text-[10px] font-bold border border-[#22c55e]/50 rounded px-1 outline-none text-[#22c55e] bg-green-50 uppercase tracking-wider" value={units.layout} onChange={(e) => setUnits({...units, layout: e.target.value})}>
                                                 <option value="feet">Feet</option><option value="meters">Meters</option><option value="inches">Inches</option><option value="cm">cm</option><option value="mm">mm</option>
                                               </select>
                                             ) : <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">(FT)</span>}
                                          </div>
                                          <input type="number" placeholder="Length" className={inputStyle} value={bed.length} onChange={e => updateFlatData(fIdx, 'bedrooms', bIdx, 'length', e.target.value)} />
                                        </div>
                                        <div className="w-full">
                                          <div className="flex justify-between items-end mb-1">
                                             <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-0">Breadth</label>
                                             {isPremium ? (
                                               <select className="text-[10px] font-bold border border-[#22c55e]/50 rounded px-1 outline-none text-[#22c55e] bg-green-50 uppercase tracking-wider" value={units.layout} onChange={(e) => setUnits({...units, layout: e.target.value})}>
                                                 <option value="feet">Feet</option><option value="meters">Meters</option><option value="inches">Inches</option><option value="cm">cm</option><option value="mm">mm</option>
                                               </select>
                                             ) : <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">(FT)</span>}
                                          </div>
                                          <input type="number" placeholder="Breadth" className={inputStyle} value={bed.breadth} onChange={e => updateFlatData(fIdx, 'bedrooms', bIdx, 'breadth', e.target.value)} />
                                        </div>
                                    </div>
                                    <button onClick={() => removeFlatBedroom(fIdx, bIdx)} className="text-red-400 hover:text-red-600 bg-red-50 p-3 rounded-lg md:ml-auto mt-4 md:mt-0">🗑️</button>
                                  </div>
                              ))}
                            </div>

                            <div className="space-y-4 pt-2 border-t border-gray-200">
                              <div className="flex justify-between items-center">
                                <h3 className="font-bold text-gray-900 text-sm uppercase tracking-wider">Bathrooms</h3>
                                <button onClick={() => addFlatBathroom(fIdx)} className="text-sm font-semibold text-[#22c55e] bg-green-50 px-3 py-1.5 rounded-lg hover:bg-green-100 transition-colors">+ Add Bath</button>
                              </div>
                              {flat.bathrooms.map((bath: any, bIdx: number) => (
                                  <div key={bath.id} className="p-4 border border-gray-100 bg-white rounded-xl space-y-4 relative">
                                    <div className="flex flex-col md:flex-row gap-4 items-center pr-6">
                                        <span className="text-sm font-bold text-gray-500 w-full md:w-20">Bath {bIdx + 1}</span>
                                        <div className="flex gap-4 w-full items-center">
                                          <div className="w-full">
                                            <div className="flex justify-between items-end mb-1">
                                               <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-0">Length</label>
                                               {isPremium ? (
                                                 <select className="text-[10px] font-bold border border-[#22c55e]/50 rounded px-1 outline-none text-[#22c55e] bg-green-50 uppercase tracking-wider" value={units.layout} onChange={(e) => setUnits({...units, layout: e.target.value})}>
                                                   <option value="feet">Feet</option><option value="meters">Meters</option><option value="inches">Inches</option><option value="cm">cm</option><option value="mm">mm</option>
                                                 </select>
                                               ) : <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">(FT)</span>}
                                            </div>
                                            <input type="number" placeholder="Length" className={inputStyle} value={bath.length} onChange={e => updateFlatData(fIdx, 'bathrooms', bIdx, 'length', e.target.value)} />
                                          </div>
                                          <span className="font-bold text-gray-300 mt-4">×</span>
                                          <div className="w-full">
                                            <div className="flex justify-between items-end mb-1">
                                               <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-0">Breadth</label>
                                               {isPremium ? (
                                                 <select className="text-[10px] font-bold border border-[#22c55e]/50 rounded px-1 outline-none text-[#22c55e] bg-green-50 uppercase tracking-wider" value={units.layout} onChange={(e) => setUnits({...units, layout: e.target.value})}>
                                                   <option value="feet">Feet</option><option value="meters">Meters</option><option value="inches">Inches</option><option value="cm">cm</option><option value="mm">mm</option>
                                                 </select>
                                               ) : <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">(FT)</span>}
                                          </div>
                                            <input type="number" placeholder="Breadth" className={inputStyle} value={bath.breadth} onChange={e => updateFlatData(fIdx, 'bathrooms', bIdx, 'breadth', e.target.value)} />
                                          </div>
                                        </div>
                                        <button onClick={() => removeFlatBathroom(fIdx, bIdx)} className="text-red-400 hover:text-red-600 bg-red-50 p-3 rounded-lg md:ml-auto mt-4 md:mt-0">🗑️</button>
                                    </div>
                                    
                                    <div className="flex gap-4 md:pl-28">
                                        <button type="button" onClick={() => updateFlatData(fIdx, 'bathrooms', bIdx, 'isAttached', false)} className={`flex-1 p-2 text-sm rounded-lg font-bold transition-all border ${!bath.isAttached ? 'bg-gray-900 border-gray-900 text-white shadow-md' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>Common</button>
                                        <button type="button" onClick={() => updateFlatData(fIdx, 'bathrooms', bIdx, 'isAttached', true)} className={`flex-1 p-2 text-sm rounded-lg font-bold transition-all border ${bath.isAttached ? 'bg-gray-900 border-gray-900 text-white shadow-md' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>Attached</button>
                                    </div>

                                    {/* Advanced Flat Bathroom Settings */}
                                    {bath.isAttached && (
                                      <div className="mt-4 p-4 border border-gray-200 bg-gray-50 rounded-xl md:ml-28 space-y-4">
                                        <div>
                                          <label className="text-xs font-bold text-gray-500 uppercase block mb-3">Attached To</label>
                                          <div className="relative">
                                            <select className={selectStyle} value={bath.attachedTo || ''} onChange={e => updateFlatData(fIdx, 'bathrooms', bIdx, 'attachedTo', e.target.value)}>
                                              <option value="">Select Room</option>
                                              {flat.bedrooms.map((bed: any, bedIdx: number) => <option key={bed.id} value={bed.name || `Bedroom ${bedIdx + 1}`}>{bed.name || `Bedroom ${bedIdx + 1}`}</option>)}
                                            </select>
                                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 text-sm">▼</div>
                                          </div>
                                        </div>
                                        <div>
                                          <span className="text-xs font-bold text-gray-500 uppercase block mb-3">Layout Position</span>
                                          <div className="flex flex-col gap-3">
                                            <label className="flex items-center gap-3 cursor-pointer p-2 hover:bg-white rounded-lg transition-colors">
                                              <input type="radio" checked={bath.layoutType === 'inside'} onChange={() => updateFlatData(fIdx, 'bathrooms', bIdx, 'layoutType', 'inside')} className="w-4 h-4 text-[#22c55e]" />
                                              <span className="font-medium text-sm text-gray-700">Inside room footprint <span className="text-gray-400 font-normal">(Ignores extra area)</span></span>
                                            </label>
                                            <label className="flex items-center gap-3 cursor-pointer p-2 hover:bg-white rounded-lg transition-colors">
                                              <input type="radio" checked={bath.layoutType === 'outside' || !bath.layoutType} onChange={() => updateFlatData(fIdx, 'bathrooms', bIdx, 'layoutType', 'outside')} className="w-4 h-4 text-[#22c55e]" />
                                              <span className="font-medium text-sm text-gray-700">Outside room footprint <span className="text-gray-400 font-normal">(Adds to total area)</span></span>
                                            </label>
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                              ))}
                            </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {buildingType !== 'commercial' && (
                    <div className="p-6 border border-blue-100 bg-blue-50/50 rounded-2xl mt-8">
                      <h3 className="font-bold text-blue-900 mb-4">Vertical Circulation & Corridors</h3>
                      {hasStairs && (
                        <div className="mb-4 bg-white p-4 rounded-xl border border-blue-100">
                          <label className={labelStyle}>Staircase Area (Deducted from Slab Void)</label>
                          <div className="flex gap-4 items-center">
                            <div className="w-full">
                              <div className="flex justify-between items-end mb-1">
                                 <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-0">Length</label>
                                 {isPremium ? (
                                   <select className="text-[10px] font-bold border border-[#22c55e]/50 rounded px-1 outline-none text-[#22c55e] bg-green-50 uppercase tracking-wider" value={units.layout} onChange={(e) => setUnits({...units, layout: e.target.value})}>
                                     <option value="feet">Feet</option><option value="meters">Meters</option><option value="inches">Inches</option><option value="cm">cm</option><option value="mm">mm</option>
                                   </select>
                                 ) : <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">(FT)</span>}
                              </div>
                              <input type="number" placeholder="Length" className={inputStyle} value={stairsDim.length} onChange={(e) => setStairsDim({ ...stairsDim, length: e.target.value })} />
                            </div>
                            <span className="font-bold text-gray-400 mt-4">×</span>
                            <div className="w-full">
                              <div className="flex justify-between items-end mb-1">
                                 <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-0">Width</label>
                                 {isPremium ? (
                                   <select className="text-[10px] font-bold border border-[#22c55e]/50 rounded px-1 outline-none text-[#22c55e] bg-green-50 uppercase tracking-wider" value={units.layout} onChange={(e) => setUnits({...units, layout: e.target.value})}>
                                     <option value="feet">Feet</option><option value="meters">Meters</option><option value="inches">Inches</option><option value="cm">cm</option><option value="mm">mm</option>
                                   </select>
                                 ) : <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">(FT)</span>}
                              </div>
                              <input type="number" placeholder="Width" className={inputStyle} value={stairsDim.width} onChange={(e) => setStairsDim({ ...stairsDim, width: e.target.value })} />
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="mb-4 bg-white p-4 rounded-xl border border-blue-100">
                        <label className="flex items-center gap-3 cursor-pointer mb-3">
                          <input type="checkbox" checked={apartmentData.lift.hasLift} onChange={(e) => setApartmentData({...apartmentData, lift: {...apartmentData.lift, hasLift: e.target.checked}})} className="w-5 h-5 text-blue-600 rounded" />
                          <span className="font-bold text-gray-700">Include Elevator Shaft (Void)</span>
                        </label>
                        {apartmentData.lift.hasLift && (
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div><label className={labelStyle}>Count</label><input type="number" className={inputStyle} value={apartmentData.lift.count} onChange={(e) => setApartmentData({...apartmentData, lift: {...apartmentData.lift, count: e.target.value}})} /></div>
                            <div>
                              <div className="flex justify-between items-end mb-2">
                                 <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-0">Length</label>
                                 {isPremium ? (
                                   <select className="text-[10px] font-bold border border-[#22c55e]/50 rounded px-1 outline-none text-[#22c55e] bg-green-50 uppercase tracking-wider" value={units.layout} onChange={(e) => setUnits({...units, layout: e.target.value})}>
                                     <option value="feet">Feet</option><option value="meters">Meters</option><option value="inches">Inches</option><option value="cm">cm</option><option value="mm">mm</option>
                                   </select>
                                 ) : <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">(FT)</span>}
                              </div>
                              <input type="number" className={inputStyle} value={apartmentData.lift.length} onChange={(e) => setApartmentData({...apartmentData, lift: {...apartmentData.lift, length: e.target.value}})} />
                            </div>
                            <div>
                              <div className="flex justify-between items-end mb-2">
                                 <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-0">Width</label>
                                 {isPremium ? (
                                   <select className="text-[10px] font-bold border border-[#22c55e]/50 rounded px-1 outline-none text-[#22c55e] bg-green-50 uppercase tracking-wider" value={units.layout} onChange={(e) => setUnits({...units, layout: e.target.value})}>
                                     <option value="feet">Feet</option><option value="meters">Meters</option><option value="inches">Inches</option><option value="cm">cm</option><option value="mm">mm</option>
                                   </select>
                                 ) : <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">(FT)</span>}
                              </div>
                              <input type="number" className={inputStyle} value={apartmentData.lift.width} onChange={(e) => setApartmentData({...apartmentData, lift: {...apartmentData.lift, width: e.target.value}})} />
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="bg-white p-4 rounded-xl border border-blue-100">
                        <label className="flex items-center gap-3 cursor-pointer mb-3">
                          <input type="checkbox" checked={apartmentData.corridor.hasCorridor} onChange={(e) => setApartmentData({...apartmentData, corridor: {...apartmentData.corridor, hasCorridor: e.target.checked}})} className="w-5 h-5 text-blue-600 rounded" />
                          <span className="font-bold text-gray-700">Include Common Corridor</span>
                        </label>
                        {apartmentData.corridor.hasCorridor && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <div className="flex justify-between items-end mb-2">
                                 <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-0">Total Length</label>
                                 {isPremium ? (
                                   <select className="text-[10px] font-bold border border-[#22c55e]/50 rounded px-1 outline-none text-[#22c55e] bg-green-50 uppercase tracking-wider" value={units.layout} onChange={(e) => setUnits({...units, layout: e.target.value})}>
                                     <option value="feet">Feet</option><option value="meters">Meters</option><option value="inches">Inches</option><option value="cm">cm</option><option value="mm">mm</option>
                                   </select>
                                 ) : <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">(FT)</span>}
                              </div>
                              <input type="number" className={inputStyle} value={apartmentData.corridor.length} onChange={(e) => setApartmentData({...apartmentData, corridor: {...apartmentData.corridor, length: e.target.value}})} />
                            </div>
                            <div>
                              <div className="flex justify-between items-end mb-2">
                                 <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-0">Width</label>
                                 {isPremium ? (
                                   <select className="text-[10px] font-bold border border-[#22c55e]/50 rounded px-1 outline-none text-[#22c55e] bg-green-50 uppercase tracking-wider" value={units.layout} onChange={(e) => setUnits({...units, layout: e.target.value})}>
                                     <option value="feet">Feet</option><option value="meters">Meters</option><option value="inches">Inches</option><option value="cm">cm</option><option value="mm">mm</option>
                                   </select>
                                 ) : <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">(FT)</span>}
                              </div>
                              <input type="number" className={inputStyle} value={apartmentData.corridor.width} onChange={(e) => setApartmentData({...apartmentData, corridor: {...apartmentData.corridor, width: e.target.value}})} />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-8">
                  
                  <h3 className="font-bold text-gray-900 text-sm uppercase tracking-wider border-b border-gray-200 pb-2">Main Living Areas</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="p-5 border border-gray-100 bg-white rounded-2xl shadow-sm">
                        <div className="flex justify-between items-end mb-2">
                           <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-0">Hall/Living Room</label>
                           {isPremium ? (
                             <select className="text-[10px] font-bold border border-[#22c55e]/50 rounded px-1 outline-none text-[#22c55e] bg-green-50 uppercase tracking-wider" value={units.layout} onChange={(e) => setUnits({...units, layout: e.target.value})}>
                               <option value="feet">Feet</option><option value="meters">Meters</option><option value="inches">Inches</option><option value="cm">cm</option><option value="mm">mm</option>
                             </select>
                           ) : <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">(FT)</span>}
                        </div>
                        <div className="flex gap-4 items-center mt-2">
                          <input type="number" placeholder="Length" className={inputStyle} value={floorsData[activeFloor].hall?.length || ''} onChange={e => updateFloorData('hall', null, 'length', e.target.value)} />
                          <span className="font-bold text-gray-300">×</span>
                          <input type="number" placeholder="Breadth" className={inputStyle} value={floorsData[activeFloor].hall?.breadth || ''} onChange={e => updateFloorData('hall', null, 'breadth', e.target.value)} />
                        </div>
                    </div>
                    <div className="p-5 border border-gray-100 bg-white rounded-2xl shadow-sm">
                        <div className="flex justify-between items-end mb-2">
                           <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-0">Kitchen & Dining</label>
                           {isPremium ? (
                             <select className="text-[10px] font-bold border border-[#22c55e]/50 rounded px-1 outline-none text-[#22c55e] bg-green-50 uppercase tracking-wider" value={units.layout} onChange={(e) => setUnits({...units, layout: e.target.value})}>
                               <option value="feet">Feet</option><option value="meters">Meters</option><option value="inches">Inches</option><option value="cm">cm</option><option value="mm">mm</option>
                             </select>
                           ) : <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">(FT)</span>}
                        </div>
                        <div className="flex gap-4 items-center mt-2">
                          <input type="number" placeholder="Length" className={inputStyle} value={floorsData[activeFloor].kitchenDining?.length || ''} onChange={e => updateFloorData('kitchenDining', null, 'length', e.target.value)} />
                          <span className="font-bold text-gray-300">×</span>
                          <input type="number" placeholder="Breadth" className={inputStyle} value={floorsData[activeFloor].kitchenDining?.breadth || ''} onChange={e => updateFloorData('kitchenDining', null, 'breadth', e.target.value)} />
                        </div>
                    </div>
                  </div>

                  <h3 className="font-bold text-gray-900 text-sm uppercase tracking-wider border-b border-gray-200 pb-2">Transition & Outdoor Spaces</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="p-5 border border-gray-100 bg-white rounded-2xl shadow-sm">
                        <div className="flex justify-between items-end mb-2">
                           <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-0">Foyer</label>
                           {isPremium ? (
                             <select className="text-[10px] font-bold border border-[#22c55e]/50 rounded px-1 outline-none text-[#22c55e] bg-green-50 uppercase tracking-wider" value={units.layout} onChange={(e) => setUnits({...units, layout: e.target.value})}>
                               <option value="feet">Feet</option><option value="meters">Meters</option><option value="inches">Inches</option><option value="cm">cm</option><option value="mm">mm</option>
                             </select>
                           ) : <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">(FT)</span>}
                        </div>
                        <div className="flex gap-4 items-center mt-2">
                          <input type="number" placeholder="Length" className={inputStyle} value={floorsData[activeFloor].foyer?.length || ''} onChange={e => updateFloorData('foyer', null, 'length', e.target.value)} />
                          <span className="font-bold text-gray-300">×</span>
                          <input type="number" placeholder="Breadth" className={inputStyle} value={floorsData[activeFloor].foyer?.breadth || ''} onChange={e => updateFloorData('foyer', null, 'breadth', e.target.value)} />
                        </div>
                    </div>
                    <div className="p-5 border border-gray-100 bg-white rounded-2xl shadow-sm">
                        <div className="flex justify-between items-end mb-2">
                           <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-0">Internal Passage</label>
                           {isPremium ? (
                             <select className="text-[10px] font-bold border border-[#22c55e]/50 rounded px-1 outline-none text-[#22c55e] bg-green-50 uppercase tracking-wider" value={units.layout} onChange={(e) => setUnits({...units, layout: e.target.value})}>
                               <option value="feet">Feet</option><option value="meters">Meters</option><option value="inches">Inches</option><option value="cm">cm</option><option value="mm">mm</option>
                             </select>
                           ) : <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">(FT)</span>}
                        </div>
                        <div className="flex gap-4 items-center mt-2">
                          <input type="number" placeholder="Length" className={inputStyle} value={floorsData[activeFloor].passage?.length || ''} onChange={e => updateFloorData('passage', null, 'length', e.target.value)} />
                          <span className="font-bold text-gray-300">×</span>
                          <input type="number" placeholder="Breadth" className={inputStyle} value={floorsData[activeFloor].passage?.breadth || ''} onChange={e => updateFloorData('passage', null, 'breadth', e.target.value)} />
                        </div>
                    </div>
                    <div className="p-5 border border-gray-100 bg-white rounded-2xl shadow-sm">
                        <div className="flex justify-between items-end mb-2">
                           <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-0">Balcony</label>
                           {isPremium ? (
                             <select className="text-[10px] font-bold border border-[#22c55e]/50 rounded px-1 outline-none text-[#22c55e] bg-green-50 uppercase tracking-wider" value={units.layout} onChange={(e) => setUnits({...units, layout: e.target.value})}>
                               <option value="feet">Feet</option><option value="meters">Meters</option><option value="inches">Inches</option><option value="cm">cm</option><option value="mm">mm</option>
                             </select>
                           ) : <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">(FT)</span>}
                        </div>
                        <div className="flex gap-4 items-center mt-2">
                          <input type="number" placeholder="Length" className={inputStyle} value={floorsData[activeFloor].balcony?.length || ''} onChange={e => updateFloorData('balcony', null, 'length', e.target.value)} />
                          <span className="font-bold text-gray-300">×</span>
                          <input type="number" placeholder="Breadth" className={inputStyle} value={floorsData[activeFloor].balcony?.breadth || ''} onChange={e => updateFloorData('balcony', null, 'breadth', e.target.value)} />
                        </div>
                    </div>
                    <div className="p-5 border border-gray-100 bg-white rounded-2xl shadow-sm">
                        <div className="flex justify-between items-end mb-2">
                           <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-0">Porch</label>
                           {isPremium ? (
                             <select className="text-[10px] font-bold border border-[#22c55e]/50 rounded px-1 outline-none text-[#22c55e] bg-green-50 uppercase tracking-wider" value={units.layout} onChange={(e) => setUnits({...units, layout: e.target.value})}>
                               <option value="feet">Feet</option><option value="meters">Meters</option><option value="inches">Inches</option><option value="cm">cm</option><option value="mm">mm</option>
                             </select>
                           ) : <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">(FT)</span>}
                        </div>
                        <div className="flex gap-4 items-center mt-2">
                          <input type="number" placeholder="Length" className={inputStyle} value={floorsData[activeFloor].porch?.length || ''} onChange={e => updateFloorData('porch', null, 'length', e.target.value)} />
                          <span className="font-bold text-gray-300">×</span>
                          <input type="number" placeholder="Breadth" className={inputStyle} value={floorsData[activeFloor].porch?.breadth || ''} onChange={e => updateFloorData('porch', null, 'breadth', e.target.value)} />
                        </div>
                    </div>
                  </div>

                  <div className="space-y-4 pt-2 border-t border-gray-200">
                    <div className="flex justify-between items-center"><h3 className="font-bold text-gray-900 text-sm uppercase tracking-wider">Bedrooms</h3><button onClick={addBedroom} className="text-sm font-semibold text-[#22c55e] bg-green-50 px-4 py-2 rounded-lg hover:bg-green-100 transition-colors">+ Add Bedroom</button></div>
                    {floorsData[activeFloor].bedrooms?.map((room: any, i: number) => (
                        <div key={room.id} className="flex flex-col md:flex-row gap-4 items-center p-4 border border-gray-100 bg-white rounded-xl shadow-sm">
                          <span className="text-sm font-bold text-gray-500 w-full md:w-24">Bedroom {i + 1}</span>
                          <div className="flex gap-4 w-full items-center">
                              <div className="w-full">
                                <div className="flex justify-between items-end mb-1">
                                   <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-0">Length</label>
                                   {isPremium ? (
                                     <select className="text-[10px] font-bold border border-[#22c55e]/50 rounded px-1 outline-none text-[#22c55e] bg-green-50 uppercase tracking-wider" value={units.layout} onChange={(e) => setUnits({...units, layout: e.target.value})}>
                                       <option value="feet">Feet</option><option value="meters">Meters</option><option value="inches">Inches</option><option value="cm">cm</option><option value="mm">mm</option>
                                     </select>
                                   ) : <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">(FT)</span>}
                                </div>
                                <input type="number" placeholder="Length" className={inputStyle} value={room.length} onChange={(e) => updateFloorData('bedrooms', i, 'length', e.target.value)} />
                              </div>
                              <span className="font-bold text-gray-300 mt-4">×</span>
                              <div className="w-full">
                                <div className="flex justify-between items-end mb-1">
                                   <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-0">Breadth</label>
                                   {isPremium ? (
                                     <select className="text-[10px] font-bold border border-[#22c55e]/50 rounded px-1 outline-none text-[#22c55e] bg-green-50 uppercase tracking-wider" value={units.layout} onChange={(e) => setUnits({...units, layout: e.target.value})}>
                                       <option value="feet">Feet</option><option value="meters">Meters</option><option value="inches">Inches</option><option value="cm">cm</option><option value="mm">mm</option>
                                     </select>
                                   ) : <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">(FT)</span>}
                                </div>
                                <input type="number" placeholder="Breadth" className={inputStyle} value={room.breadth} onChange={(e) => updateFloorData('bedrooms', i, 'breadth', e.target.value)} />
                              </div>
                          </div>
                          <button onClick={() => removeBedroom(i)} className="text-red-400 hover:text-red-600 bg-red-50 p-3 rounded-lg md:ml-auto mt-4 md:mt-0">🗑️</button>
                        </div>
                    ))}
                  </div>
                  <div className="space-y-4 pt-2 border-t border-gray-200">
                    <div className="flex justify-between items-center"><h3 className="font-bold text-gray-900 text-sm uppercase tracking-wider">Bathrooms</h3><button onClick={addBathroom} className="text-sm font-semibold text-[#22c55e] bg-green-50 px-4 py-2 rounded-lg hover:bg-green-100 transition-colors">+ Add Bath</button></div>
                    {floorsData[activeFloor].bathrooms?.map((room: any, i: number) => (
                        <div key={room.id} className="p-5 border border-gray-100 bg-white rounded-xl shadow-sm space-y-4 relative">
                          {floorsData[activeFloor].bathrooms.length > 1 && <button onClick={() => removeBathroom(i)} className="absolute top-4 right-4 text-gray-400 hover:text-red-500">✕</button>}
                          <div className="flex flex-col md:flex-row gap-4 items-center pr-6">
                              <span className="text-sm font-bold text-gray-500 w-full md:w-24">Bath {i + 1}</span>
                              <div className="flex gap-4 w-full items-center">
                                <div className="w-full">
                                  <div className="flex justify-between items-end mb-1">
                                     <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-0">Length</label>
                                     {isPremium ? (
                                       <select className="text-[10px] font-bold border border-[#22c55e]/50 rounded px-1 outline-none text-[#22c55e] bg-green-50 uppercase tracking-wider" value={units.layout} onChange={(e) => setUnits({...units, layout: e.target.value})}>
                                         <option value="feet">Feet</option><option value="meters">Meters</option><option value="inches">Inches</option><option value="cm">cm</option><option value="mm">mm</option>
                                       </select>
                                     ) : <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">(FT)</span>}
                                  </div>
                                  <input type="number" placeholder="Length" className={inputStyle} value={room.length} onChange={(e) => updateFloorData('bathrooms', i, 'length', e.target.value)} />
                                </div>
                                <span className="font-bold text-gray-300 mt-4">×</span>
                                <div className="w-full">
                                  <div className="flex justify-between items-end mb-1">
                                     <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-0">Breadth</label>
                                     {isPremium ? (
                                       <select className="text-[10px] font-bold border border-[#22c55e]/50 rounded px-1 outline-none text-[#22c55e] bg-green-50 uppercase tracking-wider" value={units.layout} onChange={(e) => setUnits({...units, layout: e.target.value})}>
                                         <option value="feet">Feet</option><option value="meters">Meters</option><option value="inches">Inches</option><option value="cm">cm</option><option value="mm">mm</option>
                                       </select>
                                     ) : <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">(FT)</span>}
                                  </div>
                                  <input type="number" placeholder="Breadth" className={inputStyle} value={room.breadth} onChange={(e) => updateFloorData('bathrooms', i, 'breadth', e.target.value)} />
                                </div>
                              </div>
                          </div>
                          <div className="flex gap-4 md:pl-32">
                              <button type="button" onClick={() => updateFloorData('bathrooms', i, 'isAttached', false)} className={`flex-1 p-2.5 text-sm rounded-xl font-semibold transition-all border ${!room.isAttached ? 'bg-gray-900 border-gray-900 text-white shadow-md' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>Common</button>
                              <button type="button" onClick={() => updateFloorData('bathrooms', i, 'isAttached', true)} className={`flex-1 p-2.5 text-sm rounded-xl font-semibold transition-all border ${room.isAttached ? 'bg-gray-900 border-gray-900 text-white shadow-md' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>Attached</button>
                          </div>
                          {room.isAttached && (
                            <div className="mt-4 p-4 border border-gray-200 bg-gray-50 rounded-xl md:ml-32 space-y-4">
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
                                    <input type="radio" checked={room.layoutType === 'inside'} onChange={() => updateFloorData('bathrooms', i, 'layoutType', 'inside')} className="w-4 h-4 text-[#22c55e] focus:ring-[#22c55e]" />
                                    <span className="font-medium text-sm text-gray-700">Inside room footprint <span className="text-gray-400 font-normal">(Ignores extra area)</span></span>
                                  </label>
                                  <label className="flex items-center gap-3 cursor-pointer p-2 hover:bg-white rounded-lg transition-colors">
                                    <input type="radio" checked={room.layoutType === 'outside' || !room.layoutType} onChange={() => updateFloorData('bathrooms', i, 'layoutType', 'outside')} className="w-4 h-4 text-[#22c55e] focus:ring-[#22c55e]" />
                                    <span className="font-medium text-sm text-gray-700">Outside room footprint <span className="text-gray-400 font-normal">(Adds to total area)</span></span>
                                  </label>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-gray-900 text-white p-6 rounded-2xl flex flex-col md:flex-row gap-6 items-center shadow-lg mt-10">
                <div className="flex flex-col items-center md:items-start flex-1">
                  <span className="font-semibold text-xs text-gray-400 uppercase tracking-widest mb-1">Layout Area</span>
                  <p className="text-3xl font-bold text-[#22c55e]">{Math.ceil(calculateFloorArea(activeFloor))} <span className="text-lg">SQ FT</span></p>
                  <p className="text-xs text-gray-500 mt-1">Live calculation in feet</p>
                </div>
                <div className="hidden md:block w-px h-16 bg-gray-700"></div>
                <div className="flex flex-col items-center md:items-start flex-1">
                  <span className="font-semibold text-xs text-gray-400 uppercase tracking-widest mb-1">Adjusted Slab Area</span>
                  <p className="text-3xl font-bold text-white">
                    {Math.ceil(calculateAdjustedSlabArea(activeFloor))} <span className="text-lg">SQ FT</span>
                  </p>
                  <p className="text-xs text-[#22c55e] mt-1">Includes custom overhang & deductions</p>
                </div>
              </div>

              <ErrorDisplay />
              <div className="flex gap-4 pt-6">
                <button onClick={() => { 
                    setErrorMsg(""); 
                    if (activeFloor === 0) setCurrentStep(2); 
                    else { setActiveFloor(activeFloor - 1); setCurrentStep(4); }
                }} className="w-1/3 border border-gray-200 text-gray-600 p-4 font-semibold rounded-xl hover:bg-gray-50 transition-colors">Back</button>
                <button onClick={() => validateAndProceed(4)} className="w-2/3 bg-[#22c55e] text-white font-bold text-lg p-4 rounded-xl hover:bg-[#1ea950] transition-colors shadow-md">Continue to Openings</button>
              </div>
            </div>
          )}

          {/* --- STEP 4: OPENINGS --- */}
          {currentStep === 4 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl mx-auto">
              
              <div className="mb-8 border-b border-gray-100 pb-6 flex justify-between items-end">
                <div>
                  <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                    <span className="text-3xl">🚪</span> {floorsData[activeFloor]?.floorName} Openings
                  </h1>
                </div>
                {isPremium && (
                  <select className="text-xs font-bold border border-gray-200 rounded-xl p-2 outline-none text-[#22c55e] bg-green-50 shadow-sm" value={units.openings} onChange={(e) => setUnits({...units, openings: e.target.value})}>
                    <option value="feet">Openings in Feet (ft)</option><option value="meters">Openings in Meters (m)</option><option value="inches">Inches</option><option value="cm">Openings in cm</option><option value="mm">Openings in mm</option>
                  </select>
                )}
              </div>

              {(() => {
                const isCommercialFloor = buildingType === 'commercial' || (buildingType === 'apartment' && floorsData[activeFloor]?.isCommercial);

                const sections = isCommercialFloor ? [
                  { title: '1. Rolling Shutters (Shops)', data: openingsData[activeFloor]?.shutters || [], key: 'shutters', isArray: true },
                  { title: '2. Washroom Doors', data: openingsData[activeFloor]?.bathroomDoors || [], key: 'bathroomDoors', isArray: true },
                  { title: '3. Windows', data: openingsData[activeFloor]?.windows || [], key: 'windows', isArray: true },
                  { title: '4. Ventilations', data: openingsData[activeFloor]?.ventilations || [], key: 'ventilations', isArray: true }
                ] : [
                  { title: '1. Main Door(s)', data: [openingsData[activeFloor]?.mainDoor || {}], key: 'mainDoor', isArray: false },
                  { title: '2. Room Doors', data: openingsData[activeFloor]?.roomDoors || [], key: 'roomDoors', isArray: true },
                  { title: '3. Bathroom Doors', data: openingsData[activeFloor]?.bathroomDoors || [], key: 'bathroomDoors', isArray: true },
                  { title: '4. Windows', data: openingsData[activeFloor]?.windows || [], key: 'windows', isArray: true },
                  { title: '5. Ventilations', data: openingsData[activeFloor]?.ventilations || [], key: 'ventilations', isArray: true }
                ];

                return sections.map((section) => (
                  <div key={section.title} className="border border-gray-100 p-6 rounded-3xl bg-white shadow-sm">
                    <div className="flex justify-between items-center mb-6">
                      <h2 className="font-bold text-lg text-gray-900">{section.title}</h2>
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
                            <div className="flex justify-between items-end mb-2">
                               <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-0">Height</label>
                               <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">({getLabel(units?.openings)})</span>
                            </div>
                            <input type="number" inputMode="decimal" min="0" className={inputStyle} value={item?.height || ''} onChange={(e) => updateOpening(section.key, section.isArray ? i : null, 'height', e.target.value)} />
                          </div>
                          <div>
                            <div className="flex justify-between items-end mb-2">
                               <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-0">Width</label>
                               <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">({getLabel(units?.openings)})</span>
                            </div>
                            <input type="number" inputMode="decimal" min="0" className={inputStyle} value={item?.width || ''} onChange={(e) => updateOpening(section.key, section.isArray ? i : null, 'width', e.target.value)} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ));
              })()}

              <ErrorDisplay />

              {/* NEXT FLOOR COPY / FORWARDING LOGIC INTEGRATED HERE */}
              <div className="pt-8 mt-8 border-t border-gray-200">
                {activeFloor < totalFloorsCount - 1 ? (
                  activeFloor === 0 && commercialGroundFloor && buildingType === 'apartment' ? (
                    <div className="bg-orange-50 p-6 rounded-2xl border border-orange-200 text-center">
                        <h3 className="text-xl font-bold text-orange-900 mb-2">Ground Floor Complete</h3>
                        <p className="text-orange-800 mb-6">Before proceeding to the 1st Floor, please configure the standard Residential Flats for the upper floors.</p>
                        
                        <div className="bg-white p-5 rounded-xl border border-orange-100 text-left mb-6">
                            <label className={labelStyle}>Number of Flats Per Typical Floor</label>
                            <input type="number" min="1" className={`${inputStyle} mb-6`} value={flatsCount} onChange={(e) => handleFlatsCountChange(e.target.value)} />
                            {apartmentFlats.length > 0 && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-100">
                                    {apartmentFlats.map((flat, i) => (
                                        <div key={i} className="flex items-center gap-4 bg-gray-50 p-3 rounded-xl border border-gray-100">
                                            <span className="font-bold text-gray-600 w-16">Flat {i+1}</span>
                                            <div className="relative flex-1">
                                                <select className={selectStyle} value={flat.type} onChange={(e) => {
                                                    const newFlats = [...apartmentFlats];
                                                    newFlats[i].type = e.target.value;
                                                    setApartmentFlats(newFlats);
                                                }}>
                                                    <option value="1BHK">1 BHK</option>
                                                    <option value="2BHK">2 BHK</option>
                                                    <option value="3BHK">3 BHK</option>
                                                    <option value="4BHK">4 BHK</option>
                                                </select>
                                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 text-sm">▼</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        
                        <div className="flex gap-4">
                            <button onClick={() => setCurrentStep(3)} className="w-1/3 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 transition-colors">Back</button>
                            <button onClick={handleTransitionToUpperFlats} className="w-2/3 bg-orange-600 text-white font-bold text-lg p-4 rounded-xl hover:bg-orange-700 transition-colors shadow-md">Proceed to 1st Floor Layout ➔</button>
                        </div>
                    </div>
                  ) : (
                    <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100 text-center">
                        <h3 className="text-xl font-bold text-blue-900 mb-2">Next Floor Setup</h3>
                        <p className="text-blue-800 mb-6">Is the <strong>{activeFloor + 1 === 1 ? "1st Floor" : activeFloor + 1 === 2 ? "2nd Floor" : activeFloor + 1 === 3 ? "3rd Floor" : `${activeFloor + 1}th Floor`}</strong> layout completely identical to the {floorsData[activeFloor]?.floorName}?</p>
                        <div className="flex flex-col md:flex-row gap-4 justify-center">
                            <button onClick={() => handleCopyChoice('yes')} className="flex-1 bg-[#22c55e] text-white rounded-xl py-4 font-bold text-lg hover:bg-[#1ea950] transition-colors shadow-md">Yes, Copy to All Remaining</button>
                            <button onClick={() => handleCopyChoice('no')} className="flex-1 bg-white border border-blue-200 text-blue-900 rounded-xl py-4 font-bold text-lg hover:bg-blue-100 transition-colors">No, Configure Manually</button>
                        </div>
                    </div>
                  )
                ) : (
                  <div className="flex gap-4">
                    <button onClick={() => setCurrentStep(3)} className="w-1/3 border border-gray-200 text-gray-600 p-4 font-semibold rounded-xl hover:bg-gray-50 transition-colors">Back</button>
                    <button onClick={() => { setErrorMsg(""); setCurrentStep(5); window.scrollTo(0,0); }} className="w-2/3 bg-gray-900 text-white font-bold text-lg p-4 rounded-xl hover:bg-[#22c55e] transition-colors shadow-md">
                      Continue to {boqScope === 'civil_only' ? 'Core Materials' : 'Pricing'} ➔
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* --- STEP 5: MATERIALS PRICING --- */}
          {currentStep === 5 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-3xl mx-auto">
              
              <div className="mb-8 border-b border-gray-100 pb-6 text-center">
                <h1 className="text-3xl font-bold text-gray-900 flex items-center justify-center gap-3">
                  <span className="text-3xl">🧱</span> Core Material Rates
                </h1>
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

                  {/* Add Topping Rate for Boundary Wall if selected */}
                  {buildingType === 'boundary' && boundaryData.topping !== 'None' && (
                    <div className="md:col-span-2 pt-4 border-t border-gray-100">
                      <label className={labelStyle}>{boundaryData.topping} Rate (Per RFT)</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#22c55e] font-bold">₹</span>
                        <input type="number" inputMode="decimal" min="0" className={`${inputStyle} pl-8 border-[#22c55e]/30`} value={rates.toppingRate} onChange={(e) => setRates({ ...rates, toppingRate: e.target.value })} />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Only show Doors/Windows pricing if it's a Full Build and not a Boundary Wall */}
              {boqScope === 'full' && buildingType !== 'boundary' && (
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
              )}

              {/* BOUNDARY WALL LABOR */}
              {buildingType === 'boundary' && (
                <div className="border border-gray-100 p-6 rounded-3xl bg-white shadow-sm mt-6">
                  <h2 className="font-bold text-lg text-gray-900 mb-6">3. Labor Rate</h2>
                  <div>
                    <label className={labelStyle}>Mason Labor Rate (Per RFT of Wall)</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">₹</span>
                      <input type="number" inputMode="decimal" min="0" className={`${inputStyle} pl-8 border-[#22c55e]/30`} value={laborRates.mason} onChange={(e) => setLaborRates({ ...laborRates, mason: e.target.value })} />
                    </div>
                  </div>
                </div>
              )}

              {/* CIVIL ONLY: Show Mason Labor here and skip the rest */}
              {boqScope === 'civil_only' && buildingType !== 'boundary' && (
                <div className="border border-gray-100 p-6 rounded-3xl bg-white shadow-sm mt-6">
                  <h2 className="font-bold text-lg text-gray-900 mb-6">3. Labor Rate</h2>
                  <div>
                    <label className={labelStyle}>Mason Labor Rate (Per Sq.Ft of Slab)</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">₹</span>
                      <input type="number" inputMode="decimal" min="0" className={`${inputStyle} pl-8 border-[#22c55e]/30`} value={laborRates.mason} onChange={(e) => setLaborRates({ ...laborRates, mason: e.target.value })} />
                    </div>
                  </div>
                </div>
              )}

              <ErrorDisplay />
              <div className="flex gap-4 pt-4">
                <button onClick={() => { setErrorMsg(""); setCurrentStep(buildingType === 'boundary' ? 2 : 4); window.scrollTo(0,0); }} className="w-1/3 border border-gray-200 text-gray-600 p-4 font-semibold rounded-xl hover:bg-gray-50 transition-colors">Back</button>
                {boqScope === 'civil_only' || buildingType === 'boundary' ? (
                   <button onClick={buildingType === 'boundary' ? handleBoundaryGenerateBOQ : handleGenerateBOQ} className="w-2/3 bg-gray-900 text-white font-bold text-lg p-4 rounded-xl hover:bg-[#22c55e] transition-colors shadow-md">Generate {buildingType === 'boundary' ? 'Boundary' : 'Civil'} BOQ ✨</button>
                ) : (
                   <button onClick={() => validateAndProceed(6)} className="w-2/3 bg-[#22c55e] text-white font-bold text-lg p-4 rounded-xl hover:bg-[#1ea950] transition-colors shadow-md">Continue to Finishes</button>
                )}
              </div>
            </div>
          )}

          {/* --- STEP 6: TILES (Hidden if Civil Only or Boundary) --- */}
          {currentStep === 6 && boqScope === 'full' && buildingType !== 'boundary' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl mx-auto">
              
              <div className="mb-8 border-b border-gray-100 pb-6 text-center">
                <h1 className="text-3xl font-bold text-gray-900 flex items-center justify-center gap-3">
                  <span className="text-3xl">✨</span> Global Flooring & Tiles
                </h1>
              </div>

              {(() => {
                let tileRooms = [];
                if (buildingType === 'residence') {
                    tileRooms = [
                      { label: 'Hall', key: 'hall' }, { label: 'Kitchen & Dining', key: 'kitchenDining' }, 
                      { label: 'Foyer', key: 'foyer' }, { label: 'Balconies', key: 'balcony' },
                      { label: 'Passages', key: 'passage' }, { label: 'Porch / Parking', key: 'porch' },
                      { label: 'All Bedrooms', key: 'bedroom_0' }, { label: 'All Bathrooms', key: 'bathroom_0' }
                    ];
                } else if (buildingType === 'commercial') {
                    tileRooms.push({ label: 'Shop Chambers', key: 'commercialShops' });
                    tileRooms.push({ label: 'Commercial Washrooms', key: 'commercialWashrooms' });
                    if (commLayout === 'Clustered') tileRooms.push({ label: 'Main Corridor / Passage', key: 'passage' });
                } else {
                    if (commercialGroundFloor) {
                        tileRooms.push({ label: 'Shop Chambers', key: 'commercialShops' });
                        tileRooms.push({ label: 'Commercial Washrooms', key: 'commercialWashrooms' });
                    }
                    if (!commercialGroundFloor || totalFloorsCount > 1) {
                        tileRooms.push({ label: 'All Flat Halls', key: 'hall' });
                        tileRooms.push({ label: 'All Flat Kitchens', key: 'kitchenDining' });
                        tileRooms.push({ label: 'All Flat Foyers', key: 'foyer' });
                        tileRooms.push({ label: 'All Flat Balconies', key: 'balcony' });
                        tileRooms.push({ label: 'All Flat Passages', key: 'passage' });
                        tileRooms.push({ label: 'All Flat Bedrooms', key: 'bedroom_0' });
                        tileRooms.push({ label: 'All Flat Bathrooms', key: 'bathroom_0' });
                    }
                    if (apartmentData.corridor.hasCorridor) tileRooms.push({ label: 'Corridors', key: 'corridor' });
                }
                tileRooms.push({ label: 'Bathroom Walls', key: 'bathroomWalls' });
                tileRooms.push({ label: 'Internal Skirting (6in)', key: 'skirting' });

                return tileRooms.map((room) => (
                  <div key={room.key} className="border border-gray-100 p-5 rounded-2xl bg-white shadow-sm flex flex-col md:flex-row md:items-center gap-4 hover:border-gray-200 transition-colors">
                    <h3 className="font-bold text-gray-700 w-48">{room.label}</h3>
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
                ));
              })()}
              
              <ErrorDisplay />
              <div className="flex gap-4 pt-6">
                <button onClick={() => { setErrorMsg(""); setCurrentStep(5); }} className="w-1/3 border border-gray-200 text-gray-600 p-4 font-semibold rounded-xl hover:bg-gray-50 transition-colors">Back</button>
                <button onClick={() => validateAndProceed(7)} className="w-2/3 bg-gray-900 text-white font-bold text-lg p-4 rounded-xl hover:bg-[#22c55e] transition-colors shadow-md">Continue to Paint</button>
              </div>
            </div>
          )}

          {/* --- STEP 7: PAINT (Hidden if Civil Only or Boundary) --- */}
          {currentStep === 7 && boqScope === 'full' && buildingType !== 'boundary' && (
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

              <ErrorDisplay />
              <div className="flex gap-4 pt-4">
                <button onClick={() => { setErrorMsg(""); setCurrentStep(6); }} className="w-1/3 border border-gray-200 text-gray-600 p-4 font-semibold rounded-xl hover:bg-gray-50 transition-colors">Back</button>
                <button onClick={() => validateAndProceed(8)} className="w-2/3 bg-[#22c55e] text-white font-bold text-lg p-4 rounded-xl hover:bg-[#1ea950] transition-colors shadow-md">Continue to Labor</button>
              </div>
            </div>
          )}

          {/* --- STEP 8: LABOR (Hidden if Civil Only or Boundary) --- */}
          {currentStep === 8 && boqScope === 'full' && buildingType !== 'boundary' && (
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

              <ErrorDisplay />
              <div className="flex gap-4 pt-8">
                <button onClick={() => { setErrorMsg(""); setCurrentStep(7); }} className="w-1/3 border border-gray-200 text-gray-600 p-4 font-semibold rounded-xl hover:bg-gray-50 transition-colors">Back</button>
                <button onClick={handleGenerateBOQ} className="w-2/3 bg-gray-900 text-white font-bold text-lg p-4 rounded-xl hover:bg-[#22c55e] transition-colors shadow-md flex items-center justify-center gap-2">
                  Generate Full BOQ Report <span className="text-xl">✨</span>
                </button>
              </div>
            </div>
          )}

          {/* --- STEP 9: FINAL REPORT --- */}
          {currentStep === 9 && boqReport?.floorReports && (
            <div className="animate-in fade-in slide-in-from-bottom-6 duration-700 printable-boq">
              
              {/* 🟢 DYNAMIC LETTERHEAD HEADER */}
              <div className="flex flex-col mb-12 border-b border-gray-100 pb-8 print:border-b-2 print:border-gray-300 print:pb-4 relative group">
                {letterheadImg && isPremium ? (
                   <div className="w-full relative">
                     {/* eslint-disable-next-line @next/next/no-img-element */}
                     <img src={letterheadImg} alt="Company Letterhead" className="w-full max-h-48 object-contain print:object-cover" />
                     <button onClick={() => setLetterheadImg(null)} className="absolute top-2 right-2 bg-red-500 text-white px-2 py-1 rounded text-xs print:hidden hidden group-hover:block transition-all shadow-md">Remove Letterhead</button>
                   </div>
                ) : (
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center w-full relative">
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
                      <p className="text-xs font-bold text-[#22c55e] uppercase tracking-widest mt-1 mb-1">
                        {buildingType === 'boundary' ? 'Boundary Wall Build' : boqScope === 'civil_only' ? 'Civil Structure Only' : 'Full Turnkey Build'}
                      </p>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mt-1">Date: {new Date().toLocaleDateString()}</p>
                    </div>
                    
                    {/* PREMIUM LOCK: Letterhead Upload */}
                    {isPremium && (
                      <label className="absolute -top-4 -right-4 md:top-0 md:right-0 bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer border border-gray-200 hover:bg-gray-200 transition-colors shadow-sm print:hidden">
                        Upload Letterhead Banner
                        <input type="file" accept="image/*" onChange={handleLetterheadUpload} className="hidden" />
                      </label>
                    )}
                  </div>
                )}
              </div>

              {boqReport?.metrics && buildingType !== 'boundary' && (
                <div className="mb-12 print:break-inside-avoid">
                  <h3 className="text-lg font-bold text-gray-900 mb-4 border-l-4 border-[#22c55e] pl-3">Project Measurement Summary</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                      <span className="text-xs font-bold uppercase text-gray-500 block mb-1">Built-Up Area</span>
                      <span className="text-xl font-black text-gray-900">{boqReport.metrics.m_builtUp || 0} <span className="text-sm">SQFT</span></span>
                    </div>
                    <div className="bg-green-50 p-4 rounded-2xl border border-green-100">
                      <span className="text-xs font-bold uppercase text-green-700 block mb-1">Slab Area (incl. {slabOverhang}{getLabel(units?.layout)})</span>
                      <span className="text-xl font-black text-[#15803d]">{Math.ceil(boqReport.metrics.m_slab || 0)} <span className="text-sm">SQFT</span></span>
                    </div>
                    <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
                      <span className="text-xs font-bold uppercase text-blue-700 block mb-1">Total Wall Area</span>
                      <span className="text-xl font-black text-blue-800">{Math.ceil(boqReport.metrics.m_wall || 0)} <span className="text-sm">SQFT</span></span>
                    </div>
                    {boqScope === 'full' && (
                      <>
                        <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                          <span className="text-xs font-bold uppercase text-gray-500 block mb-1">Total Openings (Doors+Win)</span>
                          <span className="text-xl font-black text-gray-900">{Math.ceil((boqReport.metrics.m_doors || 0) + (boqReport.metrics.m_windows || 0))} <span className="text-sm">SQFT</span></span>
                        </div>
                        <div className="bg-orange-50 md:col-span-2 p-4 rounded-2xl border border-orange-100">
                          <span className="text-xs font-bold uppercase text-orange-700 block mb-1">Total Painting Area</span>
                          <span className="text-xl font-black text-orange-800">{Math.ceil(boqReport.metrics.m_paint || 0)} <span className="text-sm">SQFT</span></span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* FINAL REPORT MAP - WRAPS SECTIONS */}
              {boqReport.floorReports.map((floor: any, fIdx: number) => (
                <div key={fIdx} className="mb-10">
                  {floor.sections?.map((section: any, idx: number) => {
                    const isHidden = hiddenSections[`f${fIdx}_s${idx}`];
                    return (
                      <div key={idx} className={`border border-gray-100 rounded-2xl overflow-hidden bg-white shadow-sm print:border-b print:rounded-none print:shadow-none mb-6 ${isHidden ? 'opacity-70 print:hidden' : ''}`}>
                        <div className="bg-gray-50 p-4 border-b border-gray-100 print:bg-gray-100 print:p-2 flex justify-between items-center">
                          <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wider">{section.title}</h3>
                          
                          <button onClick={() => toggleSection(fIdx, idx)} className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors print:hidden ${isHidden ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`} title="Hide this section from the final bill and total calculation">
                            {isHidden ? '🚫 Hidden from Total' : '👁️ Visible'}
                          </button>
                        </div>

                        {!isHidden && (
                          <div className="w-full">
                            <table className="w-full text-left border-collapse print:text-sm">
                              <thead>
                                <tr className="border-b border-gray-100 print:border-gray-300">
                                  <th className="p-2 md:p-4 font-semibold text-[10px] md:text-xs text-gray-500 uppercase tracking-wider print:p-2">Material/Service</th>
                                  <th className="p-2 md:p-4 font-semibold text-[10px] md:text-xs text-gray-500 uppercase tracking-wider text-center print:p-2">Unit</th>
                                  <th className="p-2 md:p-4 font-semibold text-[10px] md:text-xs text-gray-500 uppercase tracking-wider text-center print:p-2">Qty</th>
                                  <th className="p-2 md:p-4 font-semibold text-[10px] md:text-xs text-gray-500 uppercase tracking-wider text-right print:p-2">Rate</th>
                                  <th className="p-2 md:p-4 font-semibold text-[10px] md:text-xs text-gray-500 uppercase tracking-wider text-right print:p-2">Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                {section.items?.map((item: any, i: number) => (
                                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors print:border-gray-200">
                                    <td className="p-2 md:p-4 font-semibold text-xs md:text-sm text-gray-900 print:p-2">{item?.name}</td>
                                    <td className="p-2 md:p-4 text-center font-medium text-xs md:text-sm text-gray-500 print:p-2">{item?.unit}</td>
                                    <td className="p-2 md:p-4 text-center font-bold text-xs md:text-sm text-[#22c55e] print:p-2 print:text-black">{item?.qty || 0}</td>
                                    <td className="p-2 md:p-4 text-right font-medium text-xs md:text-sm text-gray-600 print:p-2">₹{item?.rate || 0}</td>
                                    <td className="p-2 md:p-4 text-right font-bold text-xs md:text-sm text-gray-900 print:p-2">₹{Math.ceil((item?.qty || 0) * (item?.rate || 0)).toLocaleString()}</td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="bg-gray-50/50 print:bg-transparent">
                                  <td colSpan={4} className="p-2 md:p-4 font-semibold text-[10px] md:text-xs text-gray-500 uppercase tracking-wider text-right print:p-2">Section Subtotal:</td>
                                  <td className="p-2 md:p-4 font-bold text-sm md:text-base text-gray-900 text-right print:p-2">₹{(section?.sectionTotal || 0).toLocaleString()}</td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  
                  <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200 mt-4 flex flex-col md:flex-row justify-between md:items-center gap-2 print:bg-transparent print:border-black print:border-2">
                    <h3 className="font-bold text-gray-900 text-lg uppercase tracking-wider">{floor.floorName} Subtotal</h3>
                    <span className="text-2xl font-black text-[#15803d] print:text-black">₹{getVisibleFloorTotal(floor, fIdx).toLocaleString()}</span>
                  </div>
                </div>
              ))}

              {/* 🟢 PREMIUM LOCK: ADDITIONAL CUSTOM SERVICES BUILDER */}
              {isPremium && (
                <div className="border border-gray-100 rounded-2xl overflow-hidden bg-white shadow-sm print:border-b print:rounded-none print:shadow-none mb-6">
                  <div className="bg-gray-50 p-4 border-b border-gray-100 print:bg-gray-100 print:p-2 flex justify-between items-center">
                    <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wider">Additional Custom Services</h3>
                    <button onClick={addCustomService} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-[#22c55e] text-white hover:bg-[#1ea950] transition-colors print:hidden shadow-sm">
                      + Add Custom Service
                    </button>
                  </div>
                  
                  <div className="w-full">
                    <table className="w-full text-left border-collapse print:text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 print:border-gray-300">
                          <th className="p-2 md:p-4 font-semibold text-[10px] md:text-xs text-gray-500 uppercase tracking-wider print:p-2">Material/Service</th>
                          <th className="p-2 md:p-4 font-semibold text-[10px] md:text-xs text-gray-500 uppercase tracking-wider text-center print:p-2">Unit</th>
                          <th className="p-2 md:p-4 font-semibold text-[10px] md:text-xs text-gray-500 uppercase tracking-wider text-center print:p-2">Qty</th>
                          <th className="p-2 md:p-4 font-semibold text-[10px] md:text-xs text-gray-500 uppercase tracking-wider text-right print:p-2">Rate</th>
                          <th className="p-2 md:p-4 font-semibold text-[10px] md:text-xs text-gray-500 uppercase tracking-wider text-right print:p-2">Amount</th>
                          <th className="print:hidden w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {customServices.length === 0 && (
                          <tr className="print:hidden">
                            <td colSpan={6} className="p-6 text-center text-gray-400 font-medium text-sm">No custom services added. Click the button above to add one.</td>
                          </tr>
                        )}
                        {customServices.map((item, i) => (
                          <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors print:border-gray-200">
                            <td className="p-2 md:p-4">
                              <input type="text" placeholder="Service Name" className="w-full bg-transparent outline-none font-semibold text-xs md:text-sm text-gray-900 border-b border-dashed border-gray-300 focus:border-[#22c55e] print:border-none print:p-0" value={item.name} onChange={e => updateCustomService(i, 'name', e.target.value)} />
                            </td>
                            <td className="p-2 md:p-4">
                              <input type="text" placeholder="Unit" className="w-full text-center bg-transparent outline-none font-medium text-xs md:text-sm text-gray-500 border-b border-dashed border-gray-300 focus:border-[#22c55e] print:border-none print:p-0" value={item.unit} onChange={e => updateCustomService(i, 'unit', e.target.value)} />
                            </td>
                            <td className="p-2 md:p-4">
                              <input type="number" placeholder="0" className="w-full text-center bg-transparent outline-none font-bold text-xs md:text-sm text-[#22c55e] border-b border-dashed border-gray-300 focus:border-[#22c55e] print:border-none print:text-black print:p-0" value={item.qty} onChange={e => updateCustomService(i, 'qty', e.target.value)} />
                            </td>
                            <td className="p-2 md:p-4 relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 font-medium print:hidden">₹</span>
                              <input type="number" placeholder="0" className="w-full text-right bg-transparent outline-none font-medium text-xs md:text-sm text-gray-600 pl-6 border-b border-dashed border-gray-300 focus:border-[#22c55e] print:border-none print:pl-0 print:p-0" value={item.rate} onChange={e => updateCustomService(i, 'rate', e.target.value)} />
                            </td>
                            <td className="p-2 md:p-4 text-right font-bold text-xs md:text-sm text-gray-900 print:p-2">
                              ₹{Math.ceil((Number(item.qty) || 0) * (Number(item.rate) || 0)).toLocaleString()}
                            </td>
                            <td className="p-2 print:hidden text-center">
                              <button onClick={() => removeCustomService(i)} className="text-red-400 hover:text-red-600 font-bold p-2 bg-red-50 rounded-lg">✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      {customServices.length > 0 && (
                        <tfoot>
                          <tr className="bg-gray-50/50 print:bg-transparent">
                            <td colSpan={4} className="p-2 md:p-4 font-semibold text-[10px] md:text-xs text-gray-500 uppercase tracking-wider text-right print:p-2">Section Subtotal:</td>
                            <td className="p-2 md:p-4 font-bold text-sm md:text-base text-gray-900 text-right print:p-2">₹{customServicesTotal.toLocaleString()}</td>
                            <td className="print:hidden"></td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              )}

              <div className="bg-gray-900 text-white p-8 rounded-2xl text-center shadow-lg mt-12 print:shadow-none print:bg-white print:text-black print:border-2 print:border-black print:break-inside-avoid">
                <p className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-2 print:text-gray-600">Total Project Estimate</p>
                <h2 className="text-5xl md:text-6xl font-black text-[#22c55e] print:text-black">
                  ₹ {Math.ceil(getVisibleGrandTotal()).toLocaleString()}
                </h2>
              </div>

              {/* 🟢 PREMIUM LOCK: TERMS AND INSTRUCTIONS EDITOR */}
              {isPremium && (
                <div className="mt-8 print:mt-6 print:break-inside-avoid">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 block print:hidden">Terms, Guidelines & Instructions</label>
                  
                  {/* Acts as an editor on the screen */}
                  <textarea 
                     className="w-full bg-gray-50 p-4 rounded-xl border border-gray-200 outline-none text-sm text-gray-700 font-medium print:hidden"
                     rows={5}
                     value={customTerms}
                     onChange={(e) => setCustomTerms(e.target.value)}
                     placeholder="Enter terms, guidelines, or payment instructions here..."
                  ></textarea>

                  {/* 🟢 THE FIX: Renders as pure expanding text when printing, eliminating scrollbars! */}
                  <div className="hidden print:block w-full text-sm text-black whitespace-pre-wrap font-medium leading-relaxed">
                    {customTerms}
                  </div>
                </div>
              )}

              <ErrorDisplay />
              <div className="flex flex-col md:flex-row gap-4 print:hidden mt-10">
                {!isSaved ? (
                  <>
                    <button onClick={() => setCurrentStep(buildingType === 'boundary' ? 5 : boqScope === 'civil_only' ? 5 : 8)} className="flex-1 border border-gray-200 text-gray-600 p-4 font-semibold rounded-xl hover:bg-gray-50 transition-colors">Edit Data</button>
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