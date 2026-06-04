"use client";
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';

const CanvasEditor = dynamic(() => import('./CanvasEditor'), { 
  ssr: false, 
  loading: () => <div className="p-10 text-center font-bold text-gray-500 bg-white rounded-xl shadow-sm border border-gray-200">Loading Workspace...</div>
});

interface CanvasRoom { id: string; name: string; widthFt: number; heightFt: number; x: number; y: number; }
interface RoomDim { length: string; breadth: string; }
interface Bedroom extends RoomDim { id: number; name: string; }
interface Bathroom extends RoomDim { id: number; type: 'common' | 'attached'; attachedTo: string; placement: 'inside' | 'outside'; }

interface FlatConfig {
  id: number;
  bhk: number;
  hall: RoomDim;
  kitchen: RoomDim;
  passageWidth: string;
  bedrooms: Bedroom[];
  bathrooms: Bathroom[];
}

// --- EXTRACTED COMPONENTS ---
const ToggleBtn = ({ label, active, onClick }: { label: string, active: boolean, onClick: () => void }) => (
  <button type="button" onClick={onClick} className={`py-3 px-6 rounded-lg text-sm font-semibold transition-all w-full ${active ? 'bg-blue-50 border-2 border-blue-600 text-blue-700' : 'bg-white border-2 border-gray-200 text-gray-600 hover:border-blue-300'}`}>
    {label}
  </button>
);

// 🛠️ THE FIX: Redesigned NumberInput completely bypasses native mobile arrows
const NumberInput = ({ value, onChange, unit, placeholder }: { value: string, onChange: (v: string) => void, unit: string, placeholder: string }) => {
  return (
    <div className="relative flex-1 flex items-center border border-gray-300 rounded-lg focus-within:border-blue-500 overflow-hidden bg-white transition-colors">
      <input 
        type="text" 
        inputMode="decimal"
        value={value} 
        onChange={e => onChange(e.target.value.replace(/[^0-9.]/g, ''))} 
        className="w-full py-2.5 pl-2 pr-[60px] sm:pr-[68px] text-center font-black text-gray-900 focus:outline-none bg-transparent" 
        placeholder={placeholder} 
      />
      <div className="absolute right-0 flex h-full">
        <div className="flex flex-col border-l border-r border-gray-200 bg-gray-50 w-6 sm:w-7">
          <button type="button" tabIndex={-1} onClick={() => onChange(String((parseFloat(value) || 0) + 1))} className="flex-1 flex items-center justify-center hover:bg-gray-200 text-gray-500 border-b border-gray-200 transition-colors">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 15l7-7 7 7" /></svg>
          </button>
          <button type="button" tabIndex={-1} onClick={() => onChange(String(Math.max(0, (parseFloat(value) || 0) - 1)))} className="flex-1 flex items-center justify-center hover:bg-gray-200 text-gray-500 transition-colors">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>
          </button>
        </div>
        <div className="flex items-center justify-center px-1.5 sm:px-2.5 bg-blue-50 min-w-[30px] sm:min-w-[38px]">
          <span className="text-[9px] sm:text-[10px] font-black text-blue-600 uppercase tracking-wider">{unit}</span>
        </div>
      </div>
    </div>
  );
};

const DimensionInput = ({ label, val, unit, onChange }: { label: string, val: RoomDim, unit: string, onChange: (v: RoomDim) => void }) => (
  <div className="mb-4 w-full">
    {label && <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">{label}</label>}
    <div className="flex items-center space-x-3">
      <NumberInput value={val.length} onChange={(v) => onChange({...val, length: v})} unit={unit} placeholder="Length" />
      <span className="text-gray-400 font-bold text-lg">×</span>
      <NumberInput value={val.breadth} onChange={(v) => onChange({...val, breadth: v})} unit={unit} placeholder="Breadth" />
    </div>
  </div>
);

const SingleDimensionInput = ({ label, value, unit, onChange }: { label: string, value: string, unit: string, onChange: (v: string) => void }) => (
  <div className="mb-4 w-full">
    {label && <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">{label}</label>}
    <NumberInput value={value} onChange={onChange} unit={unit} placeholder="Width" />
  </div>
);

// --- MAIN APPLICATION COMPONENT ---

export default function LayoutGenerator() {
  const [isPremium] = useState(false); // Make sure to sync this dynamically with Firebase later!
  const [generationCount, setGenerationCount] = useState(0);
  const [savedProjectsDb, setSavedProjectsDb] = useState<string[]>([]);
  const [isSaved, setIsSaved] = useState(false);
  
  // 🧱 NEW WALL STATE: Tracks which limit they hit
  const [limitError, setLimitError] = useState<'PROJECT' | 'LAYOUT' | null>(null);

  // Hidden AI Preferences Profile State
  const [aiPreferences, setAiPreferences] = useState({
    openConceptKitchen: 0.50,
    rearPrivacyBathrooms: 0.50,
    centralCirculation: 0.50
  });
  
  const [projectName, setProjectName] = useState('');
  const [typology, setTypology] = useState('Private Residence');
  const [floors, setFloors] = useState('Ground Floor Only');
  const [bhk, setBhk] = useState(2);
  const [globalUnit, setGlobalUnit] = useState('ft'); 
  const [staircase, setStaircase] = useState('Internal Stairs');
  const [entranceType, setEntranceType] = useState('Hall / Living Room');
  const [wallThickness, setWallThickness] = useState('Single Brick (5")');
  const [autoFillGaps, setAutoFillGaps] = useState(true);

  // SHARED
  const [stairsDim, setStairsDim] = useState<RoomDim>({ length: '12', breadth: '8' });
  const [passageWidth, setPassageWidth] = useState('4');

  // PRIVATE RESIDENCE STATE
  const [hall, setHall] = useState<RoomDim>({ length: '14', breadth: '14' });
  const [kitchen, setKitchen] = useState<RoomDim>({ length: '14', breadth: '14' });
  const [bedrooms, setBedrooms] = useState<Bedroom[]>([
    { id: 1, name: 'Bedroom 1 (Master)', length: '14', breadth: '12' },
    { id: 2, name: 'Bedroom 2', length: '12', breadth: '12' }
  ]);
  const [bathrooms, setBathrooms] = useState<Bathroom[]>([
    { id: 1, type: 'attached', attachedTo: 'Bedroom 1 (Master)', placement: 'outside', length: '6', breadth: '4' },
    { id: 2, type: 'common', attachedTo: '', placement: 'outside', length: '6', breadth: '4' }
  ]);

  // APARTMENT COMPLEX STATE
  const [aptFlatsCount, setAptFlatsCount] = useState(2);
  const [aptLayout, setAptLayout] = useState('Single Line');
  const [aptFrontEntrance, setAptFrontEntrance] = useState('Yes');
  const [aptStairCount, setAptStairCount] = useState(1);
  const [aptStairPlacement, setAptStairPlacement] = useState('Middle');
  const [externalCorridorWidth, setExternalCorridorWidth] = useState('6');
  const [aptFlats, setAptFlats] = useState<FlatConfig[]>([]);

  // COMMERCIAL STATE
  const [commChambersCount, setCommChambersCount] = useState(4);
  const [commChambersDim, setCommChambersDim] = useState<RoomDim>({ length: '15', breadth: '15' });
  const [commBathType, setCommBathType] = useState('Shared Floor Bathrooms');
  const [commSharedBathCount, setCommSharedBathCount] = useState(2);
  const [commBathDim, setCommBathDim] = useState<RoomDim>({ length: '8', breadth: '6' });
  const [commLayout, setCommLayout] = useState('Single Line');
  const [commStairPlace, setCommStairPlace] = useState('Edge');

  const [canvasRooms, setCanvasRooms] = useState<CanvasRoom[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  
  const [isNavigating, setIsNavigating] = useState(false);

  useEffect(() => {
    const savedPrefs = localStorage.getItem('oki_ai_prefs');
    if (savedPrefs) {
      setAiPreferences(JSON.parse(savedPrefs));
    }
  }, []);

  useEffect(() => {
    if (typology === 'Private Residence') {
      const newBedrooms: Bedroom[] = [];
      for (let i = 1; i <= bhk; i++) {
        newBedrooms.push({
          id: i,
          name: i === 1 ? 'Bedroom 1 (Master)' : `Bedroom ${i}`,
          length: bedrooms[i - 1]?.length || '12',
          breadth: bedrooms[i - 1]?.breadth || '12'
        });
      }
      setBedrooms(newBedrooms);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bhk, typology]);

  useEffect(() => {
    if (typology === 'Apartment Complex') {
      const newFlats: FlatConfig[] = [];
      for (let i = 1; i <= aptFlatsCount; i++) {
        const existing = aptFlats.find(f => f.id === i);
        if (existing) {
            newFlats.push(existing);
        } else {
            newFlats.push({
                id: i, bhk: 1, hall: { length: '12', breadth: '12' }, kitchen: { length: '8', breadth: '8' },
                passageWidth: '4',
                bedrooms: [{ id: 1, name: 'Bedroom 1', length: '12', breadth: '10' }],
                bathrooms: [{ id: 1, type: 'common', attachedTo: '', placement: 'outside', length: '6', breadth: '4' }]
            });
        }
      }
      setAptFlats(newFlats);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aptFlatsCount, typology]);

  const updateFlatBhk = (flatId: number, newBhk: number) => {
      setAptFlats(aptFlats.map(f => {
          if (f.id !== flatId) return f;
          const newBeds = [];
          for (let i = 1; i <= newBhk; i++) newBeds.push({ id: i, name: `Bedroom ${i}`, length: '12', breadth: '10' });
          return { ...f, bhk: newBhk, bedrooms: newBeds };
      }));
  };

  const addBathroom = () => setBathrooms([...bathrooms, { id: bathrooms.length + 1, type: 'common', attachedTo: '', placement: 'outside', length: '6', breadth: '4' }]);
  const removeBathroom = (id: number) => setBathrooms(bathrooms.filter(b => b.id !== id));

  const handleSaveLayout = () => {
    if (!projectName.trim()) {
        setErrorMessage('Please enter a Project Name before saving.');
        window.scrollTo({ top: 0, behavior: 'smooth' }); return;
    }
    
    // 🛑 1-PROJECT WALL
    if (!isPremium && savedProjectsDb.length >= 1 && !savedProjectsDb.includes(projectName.trim().toLowerCase())) {
        setLimitError('PROJECT');
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); return;
    }
    
    if (!savedProjectsDb.includes(projectName.trim().toLowerCase())) {
        setSavedProjectsDb([...savedProjectsDb, projectName.trim().toLowerCase()]);
    }

    const newPrefs = { ...aiPreferences };
    if (aptStairPlacement === 'Edge' || commStairPlace === 'Edge') {
        newPrefs.centralCirculation = Math.max(0.1, newPrefs.centralCirculation - 0.1); 
    } else {
        newPrefs.centralCirculation = Math.min(0.9, newPrefs.centralCirculation + 0.1); 
    }
    newPrefs.rearPrivacyBathrooms = Math.min(0.95, newPrefs.rearPrivacyBathrooms + 0.05);

    setAiPreferences(newPrefs);
    localStorage.setItem('oki_ai_prefs', JSON.stringify(newPrefs)); 
    
    setIsSaved(true);
    setErrorMessage('');
    setLimitError(null);
  };

  const handleGenerateCAD = async () => {
    if (!projectName.trim()) {
      setErrorMessage('Please enter a Project Name to continue.');
      window.scrollTo({ top: 0, behavior: 'smooth' }); return;
    }

    const projNameClean = projectName.trim().toLowerCase();

    if (savedProjectsDb.includes(projNameClean) && !isSaved) {
        setErrorMessage(`There is already a project created under the name "${projectName}". Please choose a different name.`);
        window.scrollTo({ top: 0, behavior: 'smooth' }); return;
    }

    // 🛑 1-PROJECT WALL
    if (!isPremium && savedProjectsDb.length >= 1 && !savedProjectsDb.includes(projNameClean)) {
        setLimitError('PROJECT');
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); return;
    }

    // 🛑 3-LAYOUT WALL
    if (!isPremium && generationCount >= 3) {
        setLimitError('LAYOUT');
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); return;
    }

    if (typology === 'Commercial' && staircase === 'No Stairs') {
        setErrorMessage('A Staircase is mandatory for Commercial layouts.');
        window.scrollTo({ top: 0, behavior: 'smooth' }); return;
    }

    setIsProcessing(true);
    setErrorMessage('');
    setLimitError(null);
    
    const compiledRooms: any[] = [];
    
    if (typology === 'Private Residence') {
        compiledRooms.push({ id: 'hall', name: 'Hall / Living', w: parseFloat(hall.length) || 14, h: parseFloat(hall.breadth) || 14, type: 'hall' });
        compiledRooms.push({ id: 'kitchen', name: 'Kitchen & Dining', w: parseFloat(kitchen.length) || 14, h: parseFloat(kitchen.breadth) || 14, type: 'kitchen' });
        compiledRooms.push({ id: 'passage_1', name: 'Main Passage', w: parseFloat(passageWidth) || 4, h: 10, type: 'passage' });
        
        if (staircase !== 'No Stairs') {
          compiledRooms.push({ id: 'stairs', name: 'Staircase', w: parseFloat(stairsDim.length) || 12, h: parseFloat(stairsDim.breadth) || 8, type: 'stairs', placement: staircase === 'External Stairs' ? 'outside' : 'inside' });
        }

        bedrooms.forEach((bed) => {
          compiledRooms.push({ id: `bed_${bed.id}`, name: bed.name, w: parseFloat(bed.length) || 12, h: parseFloat(bed.breadth) || 12, type: 'bedroom' });
        });

        bathrooms.forEach((bath) => {
          compiledRooms.push({
            id: `bath_${bath.id}`,
            name: `Bathroom ${bath.id} ${bath.type === 'attached' ? '(Att.)' : '(Com.)'}`,
            w: parseFloat(bath.length) || 6,
            h: parseFloat(bath.breadth) || 4,
            type: 'bathroom',
            attached_to: bath.type === 'attached' ? bath.attachedTo : null,
            placement: bath.placement
          });
        });
    } 
    else if (typology === 'Apartment Complex') {
        compiledRooms.push({ id: 'main_corridor', name: 'Main Corridor', w: parseFloat(externalCorridorWidth) || 6, h: 10, type: 'main_corridor' });
        compiledRooms.push({ id: 'stairs', name: 'Staircase 1', w: parseFloat(stairsDim.length) || 12, h: parseFloat(stairsDim.breadth) || 8, type: 'stairs', placement: aptStairPlacement === 'Edge' ? 'outside' : 'inside' });
        
        if (aptLayout === 'Single Line' && aptFlatsCount >= 3 && aptStairCount === 2) {
            compiledRooms.push({ id: 'stairs_2', name: 'Staircase 2', w: parseFloat(stairsDim.length) || 12, h: parseFloat(stairsDim.breadth) || 8, type: 'stairs', placement: aptStairPlacement === 'Edge' ? 'outside' : 'inside' });
        }

        aptFlats.forEach(flat => {
            const fId = `flat_${flat.id}`;
            compiledRooms.push({ id: `${fId}_hall`, name: `Flat ${flat.id} - Hall`, w: parseFloat(flat.hall.length) || 12, h: parseFloat(flat.hall.breadth) || 12, type: 'flat_hall', parent_id: fId });
            compiledRooms.push({ id: `${fId}_kitchen`, name: `Flat ${flat.id} - Kitchen`, w: parseFloat(flat.kitchen.length) || 8, h: parseFloat(flat.kitchen.breadth) || 8, type: 'kitchen', parent_id: fId });
            compiledRooms.push({ id: `${fId}_passage`, name: `Flat ${flat.id} - Passage`, w: parseFloat(flat.passageWidth) || 4, h: 10, type: 'flat_passage', parent_id: fId });
            
            flat.bedrooms.forEach(bed => compiledRooms.push({ id: `${fId}_bed_${bed.id}`, name: `Flat ${flat.id} - ${bed.name}`, w: parseFloat(bed.length) || 12, h: parseFloat(bed.breadth) || 10, type: 'bedroom', parent_id: fId }));
            
            flat.bathrooms.forEach(bath => {
                compiledRooms.push({ 
                    id: `${fId}_bath_${bath.id}`, 
                    name: `Flat ${flat.id} - Bath ${bath.id}`, 
                    w: parseFloat(bath.length) || 6, 
                    h: parseFloat(bath.breadth) || 4, 
                    type: 'bathroom', 
                    parent_id: fId, 
                    attached_to: bath.type === 'attached' ? `Flat ${flat.id} - ${bath.attachedTo}` : null,
                    placement: bath.placement 
                });
            });
        });
    }
    else if (typology === 'Commercial') {
        if (commLayout === 'Clustered') {
            compiledRooms.push({ id: 'passage_1', name: 'Main Corridor', w: parseFloat(passageWidth) || 6, h: 10, type: 'passage' });
        }
        compiledRooms.push({ id: 'stairs', name: 'Staircase', w: parseFloat(stairsDim.length) || 12, h: parseFloat(stairsDim.breadth) || 8, type: 'stairs', placement: commStairPlace === 'External' ? 'outside' : 'inside' });
        
        for (let i = 1; i <= commChambersCount; i++) {
            compiledRooms.push({ id: `chamber_${i}`, name: `Chamber ${i}`, w: parseFloat(commChambersDim.length) || 15, h: parseFloat(commChambersDim.breadth) || 15, type: 'chamber' });
            if (commBathType === 'Bathroom Per Chamber') {
                compiledRooms.push({ id: `chamber_${i}_bath`, name: `Bath (Ch. ${i})`, w: parseFloat(commBathDim.length) || 6, h: parseFloat(commBathDim.breadth) || 4, type: 'bathroom', attached_to: `Chamber ${i}`, placement: 'outside' });
            }
        }

        if (commBathType === 'Shared Floor Bathrooms') {
            for (let i = 1; i <= commSharedBathCount; i++) {
                compiledRooms.push({ id: `shared_bath_${i}`, name: `Shared Bath ${i}`, w: parseFloat(commBathDim.length) || 8, h: parseFloat(commBathDim.breadth) || 6, type: 'bathroom', placement: 'outside' });
            }
        }
    }

    const payload = { 
      global_unit: globalUnit, 
      entrance_type: entranceType, 
      typology: typology,
      commercial_layout: commLayout,
      commercial_stair: commStairPlace,
      apt_layout: aptLayout,
      apt_front_entrance: aptFrontEntrance,
      apt_stair_count: aptStairCount,
      apt_stair_placement: aptStairPlacement,
      external_corridor_width: externalCorridorWidth,
      ai_preferences: aiPreferences, 
      auto_fill_gaps: autoFillGaps, 
      rooms: compiledRooms 
    };

    try {
     const response = await fetch('https://okiconstruct.onrender.com/api/layout/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setCanvasRooms(data.rooms);
        setGenerationCount(prev => prev + 1);
        setIsSaved(false); 
      } else {
        setErrorMessage(data.detail || "The CAD Engine failed to solve the layout geometry.");
      }
    } catch (error) {
      console.error("Microservice Connection Failed:", error);
      setErrorMessage("Could not connect to the Python CAD Engine. Ensure Uvicorn is running on port 8000.");
    } finally {
      setIsProcessing(false);
    }
  };

  const isLocked = !isPremium && isSaved;

  return (
    <div className="min-h-screen bg-gray-50 pb-10 font-sans">
      <div className="max-w-4xl mx-auto space-y-8 mt-8 px-4">
        
        <fieldset disabled={isLocked} className={`space-y-8 min-w-0 p-0 m-0 border-0 ${isLocked ? 'opacity-80' : ''}`}>
          
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900">Project Setup & Context</h2>
              <p className="text-gray-500 text-sm mt-1">Define your project requirements and building scale.</p>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2 uppercase">Project Name <span className="text-red-500">*</span></label>
                <input type="text" value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="e.g. Skyline Residence" className={`w-full p-3 border rounded-lg focus:outline-none focus:border-blue-500 text-gray-800 ${errorMessage && !projectName.trim() ? 'border-red-500 bg-red-50' : 'border-gray-300'}`} />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2 uppercase">Building Typology</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <ToggleBtn label="Private Residence" active={typology === 'Private Residence'} onClick={() => setTypology('Private Residence')} />
                  <ToggleBtn label="Apartment Complex" active={typology === 'Apartment Complex'} onClick={() => setTypology('Apartment Complex')} />
                  <ToggleBtn label="Commercial" active={typology === 'Commercial'} onClick={() => setTypology('Commercial')} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-2 uppercase">Total Floors</label>
                  <select value={floors} onChange={e => setFloors(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 bg-white text-gray-800">
                    <option>Ground Floor Only</option><option>G + 1</option><option>G + 2</option><option>G + 3</option><option>G + 4</option>
                  </select>
                </div>
                
                {typology === 'Private Residence' && (
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-2 uppercase">Requirement</label>
                      <select value={bhk} onChange={e => setBhk(parseInt(e.target.value))} className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 bg-white text-gray-800">
                        <option value={1}>1 BHK</option><option value={2}>2 BHK</option><option value={3}>3 BHK</option><option value={4}>4 BHK</option>
                      </select>
                    </div>
                )}
                {typology === 'Apartment Complex' && (
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-2 uppercase">Flats Per Floor</label>
                      <NumberInput value={String(aptFlatsCount)} onChange={v => setAptFlatsCount(Math.max(1, parseInt(v) || 1))} unit="Flats" placeholder="1" />
                    </div>
                )}
                {typology === 'Commercial' && (
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-2 uppercase">Chambers Per Floor</label>
                      <NumberInput value={String(commChambersCount)} onChange={v => setCommChambersCount(Math.max(1, parseInt(v) || 1))} unit="Chamber" placeholder="4" />
                    </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-2 uppercase">Global Unit</label>
                  <select value={globalUnit} onChange={e => setGlobalUnit(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 bg-white text-blue-700 font-bold">
                    <option value="ft">Feet (ft)</option><option value="in">Inches (in)</option><option value="mm">Millimeters (mm)</option><option value="cm">Centimeters (cm)</option><option value="mtr">Meters (m)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-2 uppercase">External Wall Thickness</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <ToggleBtn label="Single Brick (5&quot;)" active={wallThickness === 'Single Brick (5")'} onClick={() => setWallThickness('Single Brick (5")')} />
                    <ToggleBtn label="Double Brick (9&quot;)" active={wallThickness === 'Double Brick (9")'} onClick={() => setWallThickness('Double Brick (9")')} />
                  </div>
                </div>

                {typology === 'Apartment Complex' && (
                  <div className="grid grid-cols-3 gap-2">
                      <div>
                          <label className="block text-xs font-bold text-gray-500 mb-2 uppercase">Apartment Layout</label>
                          <select value={aptLayout} onChange={e => setAptLayout(e.target.value)} className="w-full p-3 text-sm border rounded-lg focus:outline-none focus:border-blue-500 bg-white text-gray-800">
                            <option>Single Line</option><option>Clustered</option>
                          </select>
                      </div>
                      {aptLayout === 'Single Line' && (
                          <div>
                              <label className="block text-xs font-bold text-gray-500 mb-2 uppercase">Entrance From Front?</label>
                              <select value={aptFrontEntrance} onChange={e => setAptFrontEntrance(e.target.value)} className="w-full p-3 text-sm border rounded-lg focus:outline-none focus:border-blue-500 bg-white text-gray-800">
                              <option>Yes</option><option>No</option>
                              </select>
                          </div>
                      )}
                      <div>
                          <label className="block text-xs font-bold text-gray-500 mb-2 uppercase">Stair Location</label>
                          <select value={aptStairPlacement} onChange={e => setAptStairPlacement(e.target.value)} className="w-full p-3 text-sm border rounded-lg focus:outline-none focus:border-blue-500 bg-white text-gray-800">
                              <option value="Middle">Middle of Building</option>
                              <option value="Edge">Edge of Building</option>
                          </select>
                      </div>
                  </div>
                )}
                
                {typology === 'Commercial' && (
                  <div className="grid grid-cols-2 gap-2">
                      <div>
                          <label className="block text-xs font-bold text-gray-500 mb-2 uppercase">Layout Style</label>
                          <select value={commLayout} onChange={e => setCommLayout(e.target.value)} className="w-full p-3 text-sm border rounded-lg focus:outline-none focus:border-blue-500 bg-white text-gray-800">
                            <option>Single Line</option><option>Clustered</option>
                          </select>
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-gray-500 mb-2 uppercase">Stair Location</label>
                          <select value={commStairPlace} onChange={e => setCommStairPlace(e.target.value)} className="w-full p-3 text-sm border rounded-lg focus:outline-none focus:border-blue-500 bg-white text-gray-800">
                            {commLayout === 'Single Line' ? <><option>Middle</option><option>Edge</option></> : <><option>Internal</option><option>External</option></>}
                          </select>
                      </div>
                  </div>
                )}

                {typology === 'Private Residence' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-2 uppercase">Staircase Access</label>
                      <select value={staircase} onChange={e => setStaircase(e.target.value)} className="w-full p-3 text-sm border rounded-lg focus:outline-none focus:border-blue-500 bg-white text-gray-800">
                        <option>No Stairs</option><option>Internal Stairs</option><option>External Stairs</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-2 uppercase">Main Entrance</label>
                      <select value={entranceType} onChange={e => setEntranceType(e.target.value)} className="w-full p-3 text-sm border rounded-lg focus:outline-none focus:border-blue-500 bg-white text-gray-800">
                        <option>Hall / Living Room</option><option>Separate Passage</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {typology === 'Apartment Complex' && aptLayout === 'Single Line' && aptFrontEntrance === 'No' && aptFlatsCount >= 3 && (
                  <div className="mt-4">
                      <label className="block text-xs font-bold text-gray-500 mb-2 uppercase">Number of Stairs Required</label>
                      <select value={aptStairCount} onChange={e => setAptStairCount(parseInt(e.target.value))} className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 bg-white text-gray-800">
                          <option value={1}>1 Staircase</option><option value={2}>2 Staircases</option>
                      </select>
                  </div>
              )}

              <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl mt-6 flex items-start gap-3">
                  <input 
                    type="checkbox" 
                    id="autoFill" 
                    className="mt-1 w-5 h-5 text-blue-600 rounded cursor-pointer" 
                    checked={autoFillGaps} 
                    onChange={e => setAutoFillGaps(e.target.checked)} 
                  />
                  <label htmlFor="autoFill" className="cursor-pointer">
                    <span className="font-bold text-blue-900 block">Auto-Fill Architectural Gaps (Recommended)</span>
                    <span className="text-sm text-blue-700">Allow the AI to slightly flex room dimensions within 15% tolerance to perfectly snap walls flush and avoid unnecessary gaps.</span>
                  </label>
              </div>

            </div>
          </div>

          {typology === 'Private Residence' && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
                <h2 className="text-xl font-bold text-gray-900 mb-6 border-b border-gray-100 pb-4">Internal Dimensions</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                  <DimensionInput label="Hall / Living Room" val={hall} unit={globalUnit} onChange={setHall} />
                  <DimensionInput label="Kitchen & Dining" val={kitchen} unit={globalUnit} onChange={setKitchen} />
                  {staircase !== 'No Stairs' && <DimensionInput label="Staircase Provision" val={stairsDim} unit={globalUnit} onChange={setStairsDim} />}
                  <SingleDimensionInput label="Main Passage Width" value={passageWidth} unit={globalUnit} onChange={setPassageWidth} />
                </div>

                <div className="mb-8">
                  <h3 className="text-lg font-bold text-gray-800 mb-4 border-b border-gray-100 pb-2">Bedrooms</h3>
                  <div className="space-y-4">
                    {bedrooms.map((bed, index) => (
                      <div key={bed.id} className="flex flex-col sm:flex-row sm:items-center sm:space-x-4">
                        <div className="w-full sm:w-1/3"><span className="text-sm font-bold text-gray-700">{bed.name}</span></div>
                        <div className="flex-1 mt-2 sm:mt-0">
                          <DimensionInput label="" val={bed} unit={globalUnit} onChange={(newVal) => { const u = [...bedrooms]; u[index] = { ...u[index], ...newVal }; setBedrooms(u); }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-2">
                    <h3 className="text-lg font-bold text-gray-800">Bathrooms</h3>
                    <button type="button" onClick={addBathroom} className="text-xs font-bold text-blue-600 uppercase">+ Add Bath</button>
                  </div>
                  <div className="space-y-6">
                    {bathrooms.map((bath, index) => (
                      <div key={bath.id} className="p-4 border border-gray-100 rounded-xl bg-gray-50 relative">
                        {bathrooms.length > 1 && <button type="button" onClick={() => removeBathroom(bath.id)} className="absolute top-4 right-4 text-gray-400 hover:text-red-500">✕</button>}
                        <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 mb-4 pr-6">
                          <div className="w-full sm:w-1/3"><span className="text-sm font-bold text-gray-700">Bathroom {bath.id}</span></div>
                          <div className="flex-1 mt-2 sm:mt-0"><DimensionInput label="" val={bath} unit={globalUnit} onChange={(newVal) => { const u = [...bathrooms]; u[index] = { ...u[index], ...newVal }; setBathrooms(u); }} /></div>
                        </div>
                        <div className="flex rounded-lg overflow-hidden border border-gray-300 mb-4">
                          <button type="button" onClick={() => { const u = [...bathrooms]; u[index].type = 'common'; u[index].attachedTo = ''; setBathrooms(u); }} className={`flex-1 py-2 text-sm font-bold ${bath.type === 'common' ? 'bg-[#0f172a] text-white' : 'bg-white text-gray-500'}`}>Common</button>
                          <button type="button" onClick={() => { const u = [...bathrooms]; u[index].type = 'attached'; u[index].attachedTo = bedrooms[0].name; setBathrooms(u); }} className={`flex-1 py-2 text-sm font-bold border-l border-gray-300 ${bath.type === 'attached' ? 'bg-[#0f172a] text-white' : 'bg-white text-gray-500'}`}>Attached</button>
                        </div>
                        {bath.type === 'attached' && (
                          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200">
                            <div>
                              <label className="block text-xs font-bold text-gray-500 mb-2 uppercase">Attach To</label>
                              <select value={bath.attachedTo} onChange={(e) => { const u = [...bathrooms]; u[index].attachedTo = e.target.value; setBathrooms(u); }} className="w-full p-2 text-sm border rounded-lg bg-white">
                                {bedrooms.map(bed => (<option key={bed.id} value={bed.name}>{bed.name}</option>))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-gray-500 mb-2 uppercase">Placement</label>
                              <select value={bath.placement} onChange={(e) => { const u = [...bathrooms]; u[index].placement = e.target.value as any; setBathrooms(u); }} className="w-full p-2 text-sm border rounded-lg bg-white text-blue-700 font-bold">
                                <option value="outside">Outside Perimeter</option><option value="inside">Inside Perimeter</option>
                              </select>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
          )}

          {typology === 'Apartment Complex' && (
               <div className="space-y-8">
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
                      <h2 className="text-xl font-bold text-gray-900 mb-2">Main Structural Core</h2>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                          <SingleDimensionInput label="External Corridor Width" value={externalCorridorWidth} unit={globalUnit} onChange={setExternalCorridorWidth} />
                          <DimensionInput label="Staircase Dimension (Landing matches Corridor)" val={stairsDim} unit={globalUnit} onChange={setStairsDim} />
                      </div>
                  </div>

                  {aptFlats.map(flat => (
                      <div key={flat.id} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                          <div className="bg-[#0f172a] text-white p-4 flex justify-between items-center">
                              <h3 className="font-bold text-lg">Flat {flat.id} Requirements</h3>
                              <select value={flat.bhk} onChange={e => updateFlatBhk(flat.id, parseInt(e.target.value))} className="p-1.5 text-sm rounded bg-white text-gray-900 font-bold">
                                  <option value={1}>1 BHK</option><option value={2}>2 BHK</option><option value={3}>3 BHK</option>
                              </select>
                          </div>
                          <div className="p-8">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                                  <DimensionInput label="Hall" val={flat.hall} unit={globalUnit} onChange={val => setAptFlats(aptFlats.map(f => f.id === flat.id ? { ...f, hall: val } : f))} />
                                  <DimensionInput label="Kitchen" val={flat.kitchen} unit={globalUnit} onChange={val => setAptFlats(aptFlats.map(f => f.id === flat.id ? { ...f, kitchen: val } : f))} />
                                  <SingleDimensionInput label="Internal Flat Passage Width" value={flat.passageWidth} unit={globalUnit} onChange={val => setAptFlats(aptFlats.map(f => f.id === flat.id ? { ...f, passageWidth: val } : f))} />
                              </div>
                              
                              <h4 className="text-sm font-bold text-gray-800 mb-4 border-b pb-2">Bedrooms</h4>
                              <div className="grid grid-cols-1 gap-4 mb-6">
                                  {flat.bedrooms.map((bed, bIdx) => (
                                      <div key={bed.id} className="flex items-center space-x-4">
                                          <span className="text-xs font-bold text-gray-500 w-24">{bed.name}</span>
                                          <div className="flex-1"><DimensionInput label="" val={bed} unit={globalUnit} onChange={val => {
                                              const newBeds = [...flat.bedrooms]; newBeds[bIdx] = val as Bedroom;
                                              setAptFlats(aptFlats.map(f => f.id === flat.id ? { ...f, bedrooms: newBeds } : f));
                                          }} /></div>
                                      </div>
                                  ))}
                              </div>

                              <div className="flex justify-between items-center mb-4 border-b pb-2">
                                  <h4 className="text-sm font-bold text-gray-800">Bathrooms</h4>
                                  <button type="button" onClick={() => {
                                      const newBath: Bathroom = { id: flat.bathrooms.length + 1, type: 'common', attachedTo: '', placement: 'outside', length: '6', breadth: '4' };
                                      const newBaths = [...flat.bathrooms, newBath];
                                      setAptFlats(aptFlats.map(f => f.id === flat.id ? { ...f, bathrooms: newBaths } : f));
                                  }} className="text-xs font-bold text-blue-600 uppercase">+ Add Bath</button>
                              </div>
                              <div className="grid grid-cols-1 gap-4">
                                  {flat.bathrooms.map((bath, bIdx) => (
                                      <div key={bath.id} className="p-4 border border-gray-100 rounded-xl bg-gray-50 relative">
                                          {flat.bathrooms.length > 1 && <button type="button" onClick={() => {
                                              const newBaths = flat.bathrooms.filter(b => b.id !== bath.id);
                                              setAptFlats(aptFlats.map(f => f.id === flat.id ? { ...f, bathrooms: newBaths } : f));
                                          }} className="absolute top-4 right-4 text-gray-400 hover:text-red-500">✕</button>}
                                          
                                          <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 mb-4 pr-6">
                                              <span className="text-xs font-bold text-gray-500 w-24">Bath {bath.id}</span>
                                              <div className="flex-1"><DimensionInput label="" val={bath} unit={globalUnit} onChange={val => {
                                                  const newBaths = [...flat.bathrooms]; newBaths[bIdx] = { ...newBaths[bIdx], ...val } as Bathroom;
                                                  setAptFlats(aptFlats.map(f => f.id === flat.id ? { ...f, bathrooms: newBaths } : f));
                                              }} /></div>
                                          </div>

                                          <div className="flex rounded-lg overflow-hidden border border-gray-300 mb-4">
                                              <button type="button" onClick={() => {
                                                  const newBaths = [...flat.bathrooms]; newBaths[bIdx].type = 'common'; newBaths[bIdx].attachedTo = '';
                                                  setAptFlats(aptFlats.map(f => f.id === flat.id ? { ...f, bathrooms: newBaths } : f));
                                              }} className={`flex-1 py-2 text-sm font-bold ${bath.type === 'common' ? 'bg-[#0f172a] text-white' : 'bg-white text-gray-500'}`}>Common</button>
                                              <button type="button" onClick={() => {
                                                  const newBaths = [...flat.bathrooms]; newBaths[bIdx].type = 'attached'; newBaths[bIdx].attachedTo = flat.bedrooms[0]?.name || '';
                                                  setAptFlats(aptFlats.map(f => f.id === flat.id ? { ...f, bathrooms: newBaths } : f));
                                              }} className={`flex-1 py-2 text-sm font-bold border-l border-gray-300 ${bath.type === 'attached' ? 'bg-[#0f172a] text-white' : 'bg-white text-gray-500'}`}>Attached</button>
                                          </div>

                                          {bath.type === 'attached' && (
                                              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200">
                                                  <div>
                                                      <label className="block text-xs font-bold text-gray-500 mb-2 uppercase">Attach To</label>
                                                      <select value={bath.attachedTo} onChange={e => {
                                                          const newBaths = [...flat.bathrooms]; newBaths[bIdx].attachedTo = e.target.value;
                                                          setAptFlats(aptFlats.map(f => f.id === flat.id ? { ...f, bathrooms: newBaths } : f));
                                                      }} className="w-full p-2 text-sm border rounded-lg bg-white">
                                                          {flat.bedrooms.map(bed => <option key={bed.id} value={bed.name}>{bed.name}</option>)}
                                                      </select>
                                                  </div>
                                                  <div>
                                                      <label className="block text-xs font-bold text-gray-500 mb-2 uppercase">Placement</label>
                                                      <select value={bath.placement} onChange={e => {
                                                          const newBaths = [...flat.bathrooms]; newBaths[bIdx].placement = e.target.value as 'outside' | 'inside';
                                                          setAptFlats(aptFlats.map(f => f.id === flat.id ? { ...f, bathrooms: newBaths } : f));
                                                      }} className="w-full p-2 text-sm border rounded-lg bg-white text-blue-700 font-bold">
                                                          <option value="outside">Outside Perimeter</option>
                                                          <option value="inside">Inside Perimeter</option>
                                                      </select>
                                                  </div>
                                              </div>
                                          )}
                                      </div>
                                  ))}
                              </div>
                          </div>
                      </div>
                  ))}
               </div>
          )}

          {typology === 'Commercial' && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
                <h2 className="text-xl font-bold text-gray-900 mb-6 border-b border-gray-100 pb-4">Commercial Space Settings</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    {commLayout === 'Clustered' && (
                        <SingleDimensionInput label="Main Corridor Width" value={passageWidth} unit={globalUnit} onChange={setPassageWidth} />
                    )}
                    <DimensionInput label="Staircase Provision (Mandatory)" val={stairsDim} unit={globalUnit} onChange={setStairsDim} />
                </div>

                <div className="mb-8 border-t border-gray-100 pt-6">
                   <label className="block text-xs font-bold text-gray-500 mb-4 uppercase">Chamber Settings</label>
                   <DimensionInput label="Standard Chamber Dimensions" val={commChambersDim} unit={globalUnit} onChange={setCommChambersDim} />
                   <p className="text-xs text-gray-400 mt-2">Applies to all {commChambersCount} commercial chambers.</p>
                </div>

                <div className="mb-8 border-t border-gray-100 pt-6">
                   <label className="block text-xs font-bold text-gray-500 mb-4 uppercase">Bathroom Facilities</label>
                   <div className="flex rounded-lg overflow-hidden border border-gray-300 mb-6">
                      <button type="button" onClick={() => setCommBathType('Shared Floor Bathrooms')} className={`flex-1 py-3 text-sm font-bold ${commBathType === 'Shared Floor Bathrooms' ? 'bg-[#0f172a] text-white' : 'bg-white text-gray-500'}`}>Shared Floor Bathrooms</button>
                      <button type="button" onClick={() => setCommBathType('Bathroom Per Chamber')} className={`flex-1 py-3 text-sm font-bold border-l border-gray-300 ${commBathType === 'Bathroom Per Chamber' ? 'bg-[#0f172a] text-white' : 'bg-white text-gray-500'}`}>Bathroom Per Chamber</button>
                   </div>

                   {commBathType === 'Shared Floor Bathrooms' ? (
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="w-full">
                              <label className="block text-xs font-bold text-gray-500 mb-2 uppercase">Number of Shared Baths</label>
                              <input type="number" value={commSharedBathCount} onChange={e => setCommSharedBathCount(parseInt(e.target.value) || 1)} className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 text-gray-800" />
                          </div>
                          <DimensionInput label="Shared Bath Dimension" val={commBathDim} unit={globalUnit} onChange={setCommBathDim} />
                       </div>
                   ) : (
                       <DimensionInput label="Attached Bath Dimension (For Each Chamber)" val={commBathDim} unit={globalUnit} onChange={setCommBathDim} />
                   )}
                </div>
              </div>
          )}

        </fieldset>

        {errorMessage && <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-600 font-bold text-sm text-center">{errorMessage}</div>}

        {/* 🛑 PAY-AS-YOU-GO WALLS UI */}
        {limitError === 'PROJECT' && (
          <div className="bg-purple-50 border border-purple-200 rounded-2xl p-6 text-center mb-6 shadow-sm animate-in fade-in slide-in-from-bottom-4">
            <div className="text-3xl mb-2">🏢</div>
            <h3 className="text-lg font-black text-gray-900 mb-2">Project Limit Reached</h3>
            <p className="text-sm font-medium text-gray-600 mb-4">Free users can only create 1 project workspace. You need a new workspace to save this layout.</p>
            <Link href="/upgrade" className="inline-block bg-purple-600 text-white font-bold px-6 py-3 rounded-xl shadow-md hover:bg-purple-700 transition-all">Unlock New Project Workspace ➔</Link>
          </div>
        )}

        {limitError === 'LAYOUT' && (
          <div className="bg-[#22c55e]/10 border border-[#22c55e]/30 rounded-2xl p-6 text-center mb-6 shadow-sm animate-in fade-in slide-in-from-bottom-4">
            <div className="text-3xl mb-2">📐</div>
            <h3 className="text-lg font-black text-gray-900 mb-2">Generation Limit Reached</h3>
            <p className="text-sm font-medium text-gray-600 mb-4">You have used your 3 free layout generations for this project.</p>
            <Link href="/upgrade" className="inline-block bg-[#22c55e] text-white font-bold px-6 py-3 rounded-xl shadow-md hover:bg-[#1ea950] transition-all">Unlock Unlimited Layouts ➔</Link>
          </div>
        )}

        {/* Hides the generate button if a limit is hit */}
        {!limitError && (
          <button 
            onClick={handleGenerateCAD} 
            disabled={isProcessing || isLocked} 
            className={`w-full font-bold py-4 rounded-xl transition-all shadow-md text-lg ${(isProcessing || isLocked) ? 'bg-gray-400 text-white cursor-not-allowed' : 'bg-[#0f172a] hover:bg-black text-white hover:shadow-lg'}`}
          >
            {isProcessing ? "Generating AI powered 2D layout..." : "Calculate & Render Blueprint"}
          </button>
        )}

        {canvasRooms.length > 0 && (
          <div className="mt-8 space-y-6">
            <div className={`bg-white rounded-2xl shadow-sm border border-gray-200 p-8 ${isLocked ? 'pointer-events-none opacity-90' : ''}`}>
              <h2 className="text-xl font-bold text-gray-900 mb-6 text-center border-b border-gray-100 pb-4">Calculated Structural Layout</h2>
              <CanvasEditor initialRooms={canvasRooms} entranceType={entranceType} wallThickness={wallThickness} />
            </div>

            <div className="flex flex-col sm:flex-row gap-4 w-full bg-white p-4 border border-gray-200 rounded-xl shadow-sm">
              {!isSaved ? (
                <button
                  onClick={handleSaveLayout}
                  className="w-full bg-blue-600 text-white text-sm font-bold py-4 px-8 rounded-lg shadow hover:bg-blue-700 transition-all uppercase tracking-wide"
                >
                  💾 Save Layout & Export
                </button>
              ) : (
                <>
                  {/* Note: The Download buttons were moved natively into CanvasEditor.tsx in the last update for performance! */}
                  
                  <button 
                    onClick={() => {
                      setIsNavigating(true);
                      const cadData = {
                        isFromCAD: true,
                        projectName, typology, floors, bhk, globalUnit, staircase, entranceType, wallThickness,
                        stairsDim, passageWidth, hall, kitchen, bedrooms, bathrooms,
                        aptFlatsCount, aptLayout, aptFrontEntrance, aptStairCount, aptStairPlacement, externalCorridorWidth, aptFlats,
                        commChambersCount, commChambersDim, commBathType, commSharedBathCount, commBathDim, commLayout, commStairPlace
                      };
                      
                      localStorage.setItem('oki_cad_bridge', JSON.stringify(cadData));
                      
                      setTimeout(() => {
                        window.location.href = '/estimate-boq';
                      }, 800);
                    }} 
                    disabled={isNavigating}
                    className={`flex-1 sm:flex-[2] text-white text-sm font-bold py-3 px-8 rounded-lg shadow transition-all flex items-center justify-center ${isNavigating ? 'bg-gray-600 cursor-not-allowed' : 'bg-[#0f172a] hover:bg-black'}`}
                  >
                    <span className="mr-2">{isNavigating ? '⏳' : '📊'}</span> 
                    {isNavigating ? 'Loading...' : 'Proceed To Estimate BOQ'}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}