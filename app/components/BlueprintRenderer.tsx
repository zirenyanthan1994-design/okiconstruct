"use client";
import React, { useMemo, useState, useEffect, useRef } from 'react';

// --- STRICT TYPESCRIPT INTERFACES ---
interface RoomDimensions { l: string | number; w: string | number; }
interface SiteDetails {
  projectName: string; northSide: string | number; southSide: string | number;
  eastSide: string | number; westSide: string | number; roadFacing: string;
  stairType: string; bhkType: string;
}
interface RoomLayout {
  hall: RoomDimensions; kitchen: RoomDimensions; dining?: RoomDimensions;
  stairsDim: RoomDimensions; bedrooms: any[]; bathrooms: any[];
}
interface BlueprintProps { siteDetails: SiteDetails; roomLayout: RoomLayout; conceptType: 'A' | 'B' | 'C'; }

// UPGRADED: PackableRoom now supports isAttachedBath natively
interface PackableRoom {
  id: string; name: string; l: number; w: number; color: string;
  x: number; y: number; isAttachedBath?: boolean;
}

export default function BlueprintRenderer({ siteDetails, roomLayout, conceptType }: BlueprintProps) {
  // --- VIEWPORT & CAD STATES ---
  const [viewMode, setViewMode] = useState<'2D_CAD' | '3D_MODEL'>('2D_CAD');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [globalRotation, setGlobalRotation] = useState(0);

  // --- INTERACTIVE DRAG/PAN STATES ---
  const [rooms, setRooms] = useState<PackableRoom[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  const [dragAction, setDragAction] = useState<{ type: 'move' | 'n' | 's' | 'e' | 'w'; startX: number; startY: number; origRoom: PackableRoom } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // --- 3D STATES ---
  const [rot3D, setRot3D] = useState({ x: 60, z: 45 });
  const [is3DDragging, setIs3DDragging] = useState(false);
  const [last3DMouse, setLast3DMouse] = useState({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLDivElement>(null);

  const CANVAS_SIZE = 800;
  const SETBACK = 5; 
  const WALL_HEIGHT_FT = 10; 

  const { projectName, northSide, southSide, eastSide, westSide, roadFacing, stairType, bhkType } = siteDetails;
  const pL = Math.max(Number(eastSide) || 60, Number(westSide) || 60);
  const pW = Math.max(Number(northSide) || 40, Number(southSide) || 40);

  const scale = useMemo(() => {
    const maxDimension = Math.max(pL, pW);
    return (CANVAS_SIZE * 0.8) / maxDimension; 
  }, [pL, pW]);

  const svgW = pW * scale;
  const svgL = pL * scale;

  // --- ALGORITHM: INITIAL GENERATION ---
  const initialLayout = useMemo(() => {
    const getNum = (val: any) => Number(val) || 0;
    const SYSTEM_FOYER_WIDTH = 6; 
    let leftQ: any[] = []; let rightQ: any[] = [];

    if (conceptType === 'A' || conceptType === 'B') {
      leftQ.push({ id: 'hall', name: 'Living Area', data: roomLayout.hall, color: '#00ffff' }); 
      rightQ.push({ id: 'kitchen', name: 'Kitchen', data: roomLayout.kitchen, color: '#ffaa00' }); 
      if (roomLayout.dining && getNum(roomLayout.dining.l) > 0) rightQ.push({ id: 'dining', name: 'Dining', data: roomLayout.dining, color: '#00ff88' }); 
    } else {
      rightQ.push({ id: 'hall', name: 'Living Area', data: roomLayout.hall, color: '#00ffff' });
      leftQ.push({ id: 'kitchen', name: 'Kitchen', data: roomLayout.kitchen, color: '#ffaa00' });
      if (roomLayout.dining && getNum(roomLayout.dining.l) > 0) leftQ.push({ id: 'dining', name: 'Dining', data: roomLayout.dining, color: '#00ff88' });
    }

    const sL = getNum(roomLayout.stairsDim?.l); const sW = getNum(roomLayout.stairsDim?.w);
    if (sL > 0 && sW > 0) {
      if (stairType === 'External') {
        if (leftQ.length < rightQ.length) leftQ.unshift({ id: 'stairs', name: 'Stairs', data: { l: sL, w: sW }, color: '#ff00ff' }); 
        else rightQ.unshift({ id: 'stairs', name: 'Stairs', data: { l: sL, w: sW }, color: '#ff00ff' });
      } else {
        if (leftQ.some(r => r.id === 'hall')) leftQ.push({ id: 'stairs', name: 'Stairs', data: { l: sL, w: sW }, color: '#ff00ff' });
        else rightQ.push({ id: 'stairs', name: 'Stairs', data: { l: sL, w: sW }, color: '#ff00ff' });
      }
    }

    roomLayout.bedrooms.forEach((b, i) => {
      const bedData = { id: `bed_${i}`, name: b.name || `Bedroom ${i+1}`, data: b, color: '#8888ff' }; 
      if (i % 2 === 0) leftQ.push(bedData); else rightQ.push(bedData);
    });

    let maxLeftW = 0; let maxRightW = 0;
    leftQ.forEach(item => { const w = getNum(item.data.w); if (w > maxLeftW) maxLeftW = w; });
    rightQ.forEach(item => { const w = getNum(item.data.w); if (w > maxRightW) maxRightW = w; });

    const foyerX = maxLeftW; 
    let blocks: PackableRoom[] = [];
    let leftY = 0; let rightY = 0;

    leftQ.forEach(item => {
      let l = getNum(item.data.l); let w = getNum(item.data.w);
      if (l > 0 && w > 0) {
        let itemX = foyerX - w;
        if (item.id === 'stairs') itemX = foyerX - maxLeftW; 
        blocks.push({ id: item.id, name: item.name, color: item.color, x: itemX, y: leftY, l, w });
        leftY += l;
      }
    });

    rightQ.forEach(item => {
      let l = getNum(item.data.l); let w = getNum(item.data.w);
      if (l > 0 && w > 0) {
        let itemX = foyerX + SYSTEM_FOYER_WIDTH;
        if (item.id === 'stairs') itemX = foyerX + SYSTEM_FOYER_WIDTH + maxRightW - w; 
        blocks.push({ id: item.id, name: item.name, color: item.color, x: itemX, y: rightY, l, w });
        rightY += l;
      }
    });

    const foyerL = Math.max(leftY, rightY); 
    if (foyerL > 0) blocks.push({ id: 'foyer', name: 'Corridor', color: '#aaaaaa', x: foyerX, y: 0, w: SYSTEM_FOYER_WIDTH, l: foyerL });

    let terminalY = foyerL;
    roomLayout.bathrooms.filter(b => !b.isAttached).forEach((b, i) => {
      let l = getNum(b.l); let w = getNum(b.w);
      if (l > 0 && w > 0) {
        blocks.push({ id: `cbath_${i}`, name: `Common Bath`, color: '#ff4444', x: foyerX + (SYSTEM_FOYER_WIDTH/2) - (w/2), y: terminalY, l, w });
        terminalY += l; 
      }
    });

    // UPGRADE: ATTACHED BATHS ARE NOW FIRST-CLASS ENTITIES
    let attachedBathsBlocks: PackableRoom[] = [];
    blocks.forEach(block => {
      if (block.id.startsWith('bed_')) {
        const attached = roomLayout.bathrooms.filter(b => b.isAttached && b.attachedTo === block.name);
        attached.forEach((b, bIdx) => {
           const bW = getNum(b.w); const bL = getNum(b.l);
           if(bW > 0 && bL > 0) {
              attachedBathsBlocks.push({
                 id: `${block.id}_att_${bIdx}`,
                 name: 'Att. Bath',
                 color: '#ff4444',
                 x: block.x + block.w - bW, // Start at bottom-right of parent bedroom
                 y: block.y + block.l - bL,
                 w: bW,
                 l: bL,
                 isAttachedBath: true
              });
           }
        });
      }
    });
    // Push them into the main blocks array so they are fully interactive
    blocks.push(...attachedBathsBlocks);

    if (blocks.length > 0) {
        let minX = Math.min(...blocks.map(b => b.x)); let maxX = Math.max(...blocks.map(b => b.x + b.w));
        let minY = Math.min(...blocks.map(b => b.y)); let maxY = Math.max(...blocks.map(b => b.y + b.l));
        const offsetX = (pW / 2) - (minX + (maxX - minX) / 2);
        const offsetY = (pL / 2) - (minY + (maxY - minY) / 2);
        blocks.forEach(b => { b.x += offsetX; b.y += offsetY; });
    }
    return blocks;
  }, [roomLayout, pW, pL, conceptType, stairType]);

  useEffect(() => { setRooms(initialLayout); }, [initialLayout]);

  const roadFacingRotation = useMemo(() => {
    if (roadFacing === 'East') return 90; 
    if (roadFacing === 'South') return 180;
    if (roadFacing === 'West') return 270; 
    return 0;
  }, [roadFacing]);

  const totalRotation = (roadFacingRotation + globalRotation) % 360;

  // --- 2D CAD MOUSE INTERACTIONS ---

  const handleWheel = (e: React.WheelEvent) => {
    if (viewMode !== '2D_CAD') return;
    e.preventDefault();
    setZoom(z => Math.max(0.2, Math.min(5, z - e.deltaY * 0.001)));
  };

  const handleBgPointerDown = (e: React.PointerEvent) => {
    setSelectedId(null); 
    setIsPanning(true);
    setPanStart({ x: e.clientX, y: e.clientY });
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const handleRoomPointerDown = (e: React.PointerEvent, id: string, action: 'move'|'n'|'s'|'e'|'w') => {
    e.stopPropagation(); 
    e.preventDefault();
    const room = rooms.find(r => r.id === id);
    if (!room) return;
    setSelectedId(id);
    setDragAction({ type: action, startX: e.clientX, startY: e.clientY, origRoom: { ...room } });
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isPanning) {
      setPan(p => ({ x: p.x + (e.clientX - panStart.x), y: p.y + (e.clientY - panStart.y) }));
      setPanStart({ x: e.clientX, y: e.clientY });
      return;
    }

    if (dragAction && selectedId) {
      const dx = (e.clientX - dragAction.startX) / (scale * zoom);
      const dy = (e.clientY - dragAction.startY) / (scale * zoom);
      
      let rDx = dx; let rDy = dy;
      if (totalRotation === 90 || totalRotation === -270) { rDx = dy; rDy = -dx; }
      else if (Math.abs(totalRotation) === 180) { rDx = -dx; rDy = -dy; }
      else if (totalRotation === 270 || totalRotation === -90) { rDx = -dy; rDy = dx; }

      setRooms(prev => prev.map(room => {
        if (room.id !== selectedId) return room;
        let newRoom = { ...dragAction.origRoom };
        
        if (dragAction.type === 'move') {
          newRoom.x += rDx; newRoom.y += rDy;
        } else if (dragAction.type === 'e') {
          newRoom.w = Math.max(2, newRoom.w + rDx);
        } else if (dragAction.type === 'w') {
          const diff = Math.min(newRoom.w - 2, rDx);
          newRoom.x += diff; newRoom.w -= diff;
        } else if (dragAction.type === 's') {
          newRoom.l = Math.max(2, newRoom.l + rDy);
        } else if (dragAction.type === 'n') {
          const diff = Math.min(newRoom.l - 2, rDy);
          newRoom.y += diff; newRoom.l -= diff;
        }
        
        newRoom.x = Math.round(newRoom.x * 2) / 2; newRoom.y = Math.round(newRoom.y * 2) / 2;
        newRoom.w = Math.round(newRoom.w * 2) / 2; newRoom.l = Math.round(newRoom.l * 2) / 2;
        
        return newRoom;
      }));
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isPanning) setIsPanning(false);
    if (dragAction) setDragAction(null);
    (e.target as Element).releasePointerCapture(e.pointerId);
  };

  const rotateRoom = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    setRooms(prev => prev.map(room => {
      if (room.id !== id) return room;
      return { ...room, l: room.w, w: room.l }; 
    }));
  };

  // --- 3D MOUSE INTERACTIONS ---
  const handle3DDown = (e: React.MouseEvent) => { setIs3DDragging(true); setLast3DMouse({ x: e.clientX, y: e.clientY }); };
  const handle3DMove = (e: React.MouseEvent) => {
    if (!is3DDragging || viewMode !== '3D_MODEL') return;
    setRot3D(prev => ({
      x: Math.max(20, Math.min(85, prev.x - (e.clientY - last3DMouse.y) * 0.5)), 
      z: prev.z + (e.clientX - last3DMouse.x) * 0.5
    }));
    setLast3DMouse({ x: e.clientX, y: e.clientY });
  };
  const handle3DUp = () => setIs3DDragging(false);

  return (
    <div className="w-full bg-[#050505] rounded-3xl p-6 md:p-10 shadow-2xl border border-gray-800 relative overflow-hidden font-mono">
      
      {/* HEADER & CONTROLS */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-gray-800 pb-6 mb-8 relative z-10 print:border-black print:pb-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-white tracking-widest uppercase print:text-black flex items-center gap-3">
            <span className="text-[#00ffff] animate-pulse">■</span> {bhkType} Architecture
          </h2>
          <p className="text-gray-500 mt-2 text-xs uppercase tracking-widest print:text-gray-600">
            {projectName || "Untitled"} // {pW}'x{pL}' PLOT // CONCEPT {conceptType}
          </p>
        </div>
        
        <div className="mt-4 md:mt-0 flex gap-2 p-1 bg-gray-900 rounded-lg border border-gray-800 print:hidden">
          <button onClick={() => setViewMode('2D_CAD')} className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-md transition-all ${viewMode === '2D_CAD' ? 'bg-[#00ffff] text-black shadow-[0_0_10px_rgba(0,255,255,0.3)]' : 'text-gray-500 hover:text-white'}`}>
            2D Interactive
          </button>
          <button onClick={() => setViewMode('3D_MODEL')} className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-md transition-all flex items-center gap-2 ${viewMode === '3D_MODEL' ? 'bg-[#ffaa00] text-black shadow-[0_0_10px_rgba(255,170,0,0.3)]' : 'text-gray-500 hover:text-white'}`}>
            3D Viewer
          </button>
        </div>
      </div>

      <div 
        ref={canvasRef}
        className={`w-full overflow-hidden custom-scrollbar bg-[#020202] rounded-xl border border-gray-800 relative ${viewMode === '3D_MODEL' ? 'cursor-move' : isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
        style={{ height: '600px' }}
        onWheel={handleWheel}
        onMouseDown={viewMode === '3D_MODEL' ? handle3DDown : undefined}
        onMouseMove={viewMode === '3D_MODEL' ? handle3DMove : undefined}
        onMouseUp={viewMode === '3D_MODEL' ? handle3DUp : undefined}
        onMouseLeave={viewMode === '3D_MODEL' ? handle3DUp : undefined}
      >
        
        {viewMode === '2D_CAD' ? (
          
          <div className="w-full h-full relative" style={{ backgroundImage: `radial-gradient(rgba(255,255,255,0.1) 1px, transparent 1px)`, backgroundSize: `${20 * zoom}px ${20 * zoom}px`, backgroundPosition: `${pan.x}px ${pan.y}px` }}>
            
            {/* TOOLBAR */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-[#111]/90 backdrop-blur-md border border-gray-700 p-2 rounded-xl shadow-2xl print:hidden">
               <button onClick={() => setZoom(z => Math.max(0.2, z - 0.2))} className="w-8 h-8 flex justify-center items-center rounded hover:bg-white/10 text-gray-400 hover:text-white font-bold">-</button>
               <span className="text-[10px] font-bold text-[#00ffff] px-2 w-12 text-center">{Math.round(zoom * 100)}%</span>
               <button onClick={() => setZoom(z => Math.min(5, z + 0.2))} className="w-8 h-8 flex justify-center items-center rounded hover:bg-white/10 text-gray-400 hover:text-white font-bold">+</button>
               <div className="w-px h-6 bg-gray-700 mx-1"></div>
               <button onClick={() => setGlobalRotation(r => r - 90)} className="w-8 h-8 flex justify-center items-center rounded hover:bg-white/10 text-gray-400 hover:text-white font-bold text-lg">↺</button>
               <button onClick={() => setGlobalRotation(r => r + 90)} className="w-8 h-8 flex justify-center items-center rounded hover:bg-white/10 text-gray-400 hover:text-white font-bold text-lg">↻</button>
               <div className="w-px h-6 bg-gray-700 mx-1"></div>
               <button onClick={() => { setZoom(1); setPan({x:0, y:0}); setGlobalRotation(0); }} className="px-3 h-8 flex justify-center items-center rounded hover:bg-white/10 text-gray-400 hover:text-white text-[10px] font-bold uppercase tracking-widest">Reset</button>
            </div>

            {/* INSTRUCTIONS */}
            <div className="absolute top-4 left-4 pointer-events-none z-20">
               <span className="bg-black/80 text-[#00ffff] px-3 py-1.5 rounded border border-[#00ffff]/30 text-[10px] tracking-widest uppercase shadow-lg">
                 Drag Background to Pan • Scroll to Zoom
               </span>
            </div>

            {/* INTERACTIVE SVG */}
            <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0', width: '100%', height: '100%' }}>
              <svg 
                width={svgW + 200} height={svgL + 200} className="drop-shadow-2xl overflow-visible print:shadow-none print:bg-white"
                onPointerDown={handleBgPointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp}
              >
                <defs>
                  <pattern id="cadHatch" width="8" height="8" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse"><line x1="0" y1="0" x2="0" y2="8" stroke="currentColor" strokeWidth="1" strokeOpacity="0.3" /></pattern>
                  <pattern id="cadFoyer" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="5" cy="5" r="1" fill="#aaaaaa" opacity="0.3"/></pattern>
                </defs>

                <g transform={`translate(${100}, ${100})`}>
                  <rect x="0" y="0" width={svgW} height={svgL} fill="transparent" stroke="#333" strokeWidth="2" className="print:stroke-black pointer-events-none" />
                  <text x="0" y="-10" fill="#555" className="text-xs print:fill-black pointer-events-none">PLOT BOUNDARY ({pW}' W)</text>

                  <g className="pointer-events-none">
                    {roadFacing === 'East' && <rect x={svgW} y="0" width="10" height={svgL} fill="#222" />}
                    {roadFacing === 'West' && <rect x="-10" y="0" width="10" height={svgL} fill="#222" />}
                    {roadFacing === 'North' && <rect x="0" y="-10" width={svgW} height="10" fill="#222" />}
                    {roadFacing === 'South' && <rect x="0" y={svgL} width={svgW} height="10" fill="#222" />}
                    <text x={roadFacing === 'East' ? svgW + 15 : roadFacing === 'West' ? -20 : svgW/2} y={roadFacing === 'North' ? -20 : roadFacing === 'South' ? svgL + 25 : svgL/2} fill="#777" className="font-bold text-[10px] tracking-widest print:fill-black" textAnchor="middle" transform={roadFacing === 'East' || roadFacing === 'West' ? `rotate(-90 ${roadFacing === 'East' ? svgW + 15 : -20} ${svgL/2})` : ""}>
                      {roadFacing.toUpperCase()} ROAD
                    </text>
                  </g>

                  <g transform={`rotate(${totalRotation} ${svgW/2} ${svgL/2})`} style={{ transition: dragAction ? 'none' : 'transform 0.5s ease' }}>
                    <rect x={SETBACK * scale} y={SETBACK * scale} width={(pW - SETBACK*2) * scale} height={(pL - SETBACK*2) * scale} fill="none" stroke="#ff4444" strokeWidth="1" strokeDasharray="4,4" opacity="0.3" className="print:stroke-gray-400 pointer-events-none" />

                    {rooms.map((room) => {
                      const isSelected = selectedId === room.id;
                      const isFoyer = room.id === 'foyer';
                      const isAttBath = room.isAttachedBath;
                      const rx = room.x * scale; const ry = room.y * scale;
                      const rw = room.w * scale; const rl = room.l * scale;

                      // Visual styling adjustments for Attached Baths
                      const fillPattern = isFoyer ? "url(#cadFoyer)" : isAttBath ? "#111" : "url(#cadHatch)";
                      const fillOpacity = isSelected ? "0.2" : isAttBath ? "0.1" : "0.05";
                      const textClass = `font-bold uppercase tracking-widest pointer-events-none ${isAttBath ? 'text-[7px]' : 'text-[10px]'}`;

                      return (
                        <g key={room.id} style={{ color: room.color }} onClick={(e) => e.stopPropagation()}>
                          
                          {/* DRAGGABLE BODY */}
                          <g onPointerDown={(e) => handleRoomPointerDown(e, room.id, 'move')} style={{ cursor: 'move' }}>
                            <rect x={rx} y={ry} width={rw} height={rl} fill={fillPattern} stroke={room.color} strokeWidth={isSelected ? "3" : "2"} opacity={isSelected ? 1 : 0.8} />
                            <rect x={rx} y={ry} width={rw} height={rl} fill={room.color} opacity={fillOpacity} />
                            <text x={rx + rw/2} y={ry + rl/2 - (isAttBath ? 2 : 4)} fill={room.color} textAnchor="middle" className={textClass}>{room.name}</text>
                            <text x={rx + rw/2} y={ry + rl/2 + (isAttBath ? 6 : 8)} fill={isSelected ? "#fff" : "#777"} textAnchor="middle" className={`pointer-events-none font-bold ${isAttBath ? 'text-[6px]' : 'text-[9px]'}`}>{room.w}' x {room.l}'</text>
                          </g>

                          {/* RESIZE WALL HANDLES & ROTATION */}
                          {isSelected && (
                            <g>
                              <rect onPointerDown={(e) => handleRoomPointerDown(e, room.id, 'n')} x={rx} y={ry - 6} width={rw} height="12" fill="transparent" stroke={room.color} strokeWidth="2" strokeDasharray="4,4" style={{ cursor: 'ns-resize' }} className="hover:fill-white/20 transition-all" />
                              <rect onPointerDown={(e) => handleRoomPointerDown(e, room.id, 's')} x={rx} y={ry + rl - 6} width={rw} height="12" fill="transparent" stroke={room.color} strokeWidth="2" strokeDasharray="4,4" style={{ cursor: 'ns-resize' }} className="hover:fill-white/20 transition-all" />
                              <rect onPointerDown={(e) => handleRoomPointerDown(e, room.id, 'w')} x={rx - 6} y={ry} width="12" height={rl} fill="transparent" stroke={room.color} strokeWidth="2" strokeDasharray="4,4" style={{ cursor: 'ew-resize' }} className="hover:fill-white/20 transition-all" />
                              <rect onPointerDown={(e) => handleRoomPointerDown(e, room.id, 'e')} x={rx + rw - 6} y={ry} width="12" height={rl} fill="transparent" stroke={room.color} strokeWidth="2" strokeDasharray="4,4" style={{ cursor: 'ew-resize' }} className="hover:fill-white/20 transition-all" />
                              
                              {/* ROTATE BUTTON */}
                              <g onPointerDown={(e) => { e.preventDefault(); rotateRoom(e, room.id); }} style={{ cursor: 'pointer' }} className="hover:opacity-80">
                                 <rect x={rx + rw - 15} y={ry - 25} width="30" height="20" rx="4" fill="#111" stroke={room.color} strokeWidth="1.5" />
                                 <text x={rx + rw} y={ry - 12} fill={room.color} textAnchor="middle" className="font-bold text-[10px]">⟳</text>
                              </g>
                            </g>
                          )}
                        </g>
                      );
                    })}
                  </g>
                </g>
              </svg>
            </div>
          </div>

        ) : (

          /* ======================================= */
          /* PREMIUM 3D VIEW                         */
          /* ======================================= */
          <div className="w-full h-full flex justify-center items-center overflow-hidden" style={{ perspective: '1400px', background: 'radial-gradient(circle at center, #1a1a1a 0%, #000000 100%)' }}>
            <div 
              style={{
                position: 'relative', width: svgW, height: svgL,
                transformStyle: 'preserve-3d', transform: `rotateX(${rot3D.x}deg) rotateZ(${rot3D.z}deg)`,
                transition: is3DDragging ? 'none' : 'transform 0.3s ease-out'
              }}
            >
              {/* Glowing Base Platform */}
              <div style={{ position: 'absolute', inset: -40, background: 'rgba(0, 255, 255, 0.02)', border: '1px solid rgba(0, 255, 255, 0.1)', boxShadow: '0 0 50px rgba(0,255,255,0.1)', transform: 'translateZ(-2px)' }}></div>
              <div style={{ position: 'absolute', inset: -20, background: '#0a0a0a', backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '20px 20px', border: '1px solid #333', transform: 'translateZ(-1px)' }}></div>
              <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translate(-50%, 20px) rotateX(-90deg) translateZ(10px)', color: '#444', fontSize: '1rem', fontWeight: 'bold', letterSpacing: '10px' }}>MAIN ROAD</div>

              <div style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d', transform: `rotateZ(${totalRotation}deg)` }}>
                {rooms.map((room, idx) => {
                  const rw = room.w * scale; const rl = room.l * scale; const h = WALL_HEIGHT_FT * scale;
                  const isStair = room.id === 'stairs';
                  const wallStyle = { backgroundColor: room.color, backgroundImage: 'linear-gradient(to bottom, rgba(255,255,255,0.3) 0%, rgba(0,0,0,0.5) 100%)', opacity: 0.85, border: `1px solid rgba(0,0,0,0.5)` };
                  
                  return (
                    <div key={idx} style={{ position: 'absolute', left: room.x * scale, top: room.y * scale, width: rw, height: rl, transformStyle: 'preserve-3d' }}>
                      
                      {/* Floor & Label */}
                      <div style={{ position: 'absolute', inset: 0, backgroundColor: room.color, opacity: 0.15, border: `1px solid ${room.color}`, boxShadow: `inset 0 0 20px ${room.color}` }}></div>
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: 'translateZ(1px)' }}>
                        <span style={{ color: '#fff', fontSize: '10px', fontWeight: 'bold', textShadow: `0 0 5px ${room.color}, 0 0 10px #000` }}>{room.name}</span>
                      </div>

                      {/* 3D Walls with Lighting Simulation */}
                      {!isStair && (
                        <>
                          <div style={{ position: 'absolute', top: 0, left: 0, width: rw, height: h, transformOrigin: 'top', transform: 'rotateX(-90deg)', ...wallStyle }}></div>
                          <div style={{ position: 'absolute', bottom: 0, left: 0, width: rw, height: h, transformOrigin: 'bottom', transform: 'rotateX(90deg)', ...wallStyle }}></div>
                          <div style={{ position: 'absolute', top: 0, right: 0, width: h, height: rl, transformOrigin: 'right', transform: 'rotateY(90deg)', ...wallStyle }}></div>
                          <div style={{ position: 'absolute', top: 0, left: 0, width: h, height: rl, transformOrigin: 'left', transform: 'rotateY(-90deg)', ...wallStyle }}></div>
                        </>
                      )}

                      {/* Stairs Vis */}
                      {isStair && (
                         <div style={{ position: 'absolute', inset: 0, transform: `translateZ(${h/2}px)`, background: `repeating-linear-gradient(0deg, transparent, transparent 5px, ${room.color} 5px, ${room.color} 10px)`, opacity: 0.5 }}></div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            
            <div className="absolute bottom-6 left-0 w-full text-center pointer-events-none">
              <span className="bg-[#ffaa00]/10 text-[#ffaa00] px-6 py-3 rounded-full text-[10px] tracking-widest font-bold backdrop-blur-md border border-[#ffaa00]/30 shadow-[0_0_20px_rgba(255,170,0,0.2)]">
                CLICK & DRAG TO ROTATE MODEL
              </span>
            </div>
          </div>
        )}

      </div>
      
      {/* CAD Legend */}
      <div className="mt-6 flex flex-wrap justify-center gap-6 text-[10px] uppercase tracking-widest print:hidden">
        <div className="flex items-center gap-2"><span className="w-3 h-3 border border-[#aaaaaa] bg-[#aaaaaa]/20"></span> <span className="text-[#aaaaaa]">Circulation</span></div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 border border-[#00ffff] bg-[#00ffff]/20"></span> <span className="text-[#00ffff]">Living</span></div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 border border-[#ffaa00] bg-[#ffaa00]/20"></span> <span className="text-[#ffaa00]">Kitchen</span></div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 border border-[#8888ff] bg-[#8888ff]/20"></span> <span className="text-[#8888ff]">Bedrooms</span></div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 border border-[#ff4444] bg-[#ff4444]/20"></span> <span className="text-[#ff4444]">Baths</span></div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 border border-[#ff00ff] bg-[#ff00ff]/20"></span> <span className="text-[#ff00ff]">Stairs</span></div>
      </div>

    </div>
  );
}