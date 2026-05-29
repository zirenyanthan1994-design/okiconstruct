"use client";
import React, { useState, useMemo } from 'react';

export default function SunlightSimulator() {
  const [timeOfDay, setTimeOfDay] = useState(12); // 6:00 to 18:00
  const [plotFacing, setPlotFacing] = useState('East');

  // --- SVG CANVAS SETTINGS ---
  const CANVAS_SIZE = 800;
  const CENTER = CANVAS_SIZE / 2;
  const BUILDING_W = 160;
  const BUILDING_L = 220;
  const SUN_ARC_RADIUS = 300;

  // --- TRIGONOMETRY ENGINE ---
  const { sunX, sunY, shadowDx, shadowDy, rotation } = useMemo(() => {
    // 1. Time to Angle (6am = 0 radians, 12pm = PI/2, 6pm = PI)
    const timeRatio = (timeOfDay - 6) / 12;
    const sunAngleRad = timeRatio * Math.PI;

    // 2. Sun Position (Assuming North is UP, East is RIGHT)
    // Sun rises in East (+X), sets in West (-X), arcs through North (-Y in SVG space)
    const sX = CENTER + SUN_ARC_RADIUS * Math.cos(sunAngleRad);
    const sY = CENTER - SUN_ARC_RADIUS * Math.sin(sunAngleRad);

    // 3. Shadow Projection (Cast exactly opposite the sun)
    // Shadow is longest at dawn/dusk, and practically zero at noon.
    const shadowLengthMultiplier = Math.abs(12 - timeOfDay) / 6; // 0 to 1
    const maxShadowLength = 250;
    const currentShadowLength = shadowLengthMultiplier * maxShadowLength;
    
    const shadowAngleRad = sunAngleRad + Math.PI; // Opposite direction
    const sDx = currentShadowLength * Math.cos(shadowAngleRad);
    const sDy = -currentShadowLength * Math.sin(shadowAngleRad);

    // 4. Plot Rotation (Rotate the compass based on user selection)
    let rot = 0;
    if (plotFacing === 'North') rot = 0;
    if (plotFacing === 'East') rot = -90;
    if (plotFacing === 'South') rot = 180;
    if (plotFacing === 'West') rot = 90;

    return { sunX: sX, sunY: sY, shadowDx: sDx, shadowDy: sDy, rotation: rot };
  }, [timeOfDay, plotFacing]);

  // Formatting time for the UI
  const formatTime = (decimalTime: number) => {
    const hours = Math.floor(decimalTime);
    const mins = Math.round((decimalTime - hours) * 60);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
    return `${displayHours}:${mins.toString().padStart(2, '0')} ${ampm}`;
  };

  const inputStyle = "w-full border border-gray-200 bg-white rounded-xl p-4 text-gray-900 font-medium focus:ring-2 focus:ring-[#22c55e]/30 focus:border-[#22c55e] transition-all outline-none cursor-pointer appearance-none";

  return (
    <div className="w-full bg-[#0a192f] rounded-3xl p-6 md:p-10 shadow-2xl border border-gray-800 flex flex-col lg:flex-row gap-8">
      
      {/* LEFT: CONTROLS */}
      <div className="lg:w-1/3 flex flex-col justify-center space-y-8 bg-white/5 p-6 rounded-2xl border border-white/10">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-widest uppercase flex items-center gap-3">
            <span className="text-[#22c55e]">☀️</span> Solar Study
          </h2>
          <p className="text-blue-400 font-mono mt-2 text-sm">Analyze natural lighting and Vastu alignments.</p>
        </div>

        <div>
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 block">Plot Facing Direction</label>
          <div className="relative">
            <select className={inputStyle} value={plotFacing} onChange={(e) => setPlotFacing(e.target.value)}>
              <option value="North">North Facing (Vastu)</option>
              <option value="East">East Facing (Vastu)</option>
              <option value="South">South Facing</option>
              <option value="West">West Facing</option>
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 text-sm">▼</div>
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-3">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Time of Day</label>
            <span className="text-[#22c55e] font-bold font-mono bg-[#22c55e]/10 px-3 py-1 rounded-lg">
              {formatTime(timeOfDay)}
            </span>
          </div>
          <input 
            type="range" 
            min="6" max="18" step="0.25" 
            value={timeOfDay} 
            onChange={(e) => setTimeOfDay(Number(e.target.value))}
            className="w-full accent-[#22c55e] h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-gray-500 font-bold uppercase mt-2">
            <span>6:00 AM</span>
            <span>Noon</span>
            <span>6:00 PM</span>
          </div>
        </div>
      </div>

      {/* RIGHT: THE SVG ENGINE */}
      <div className="lg:w-2/3 flex justify-center items-center overflow-hidden bg-[#0f172a] rounded-2xl border border-blue-900/30 relative min-h-[400px]">
        
        {/* Dynamic Canvas */}
        <svg 
          viewBox="0 0 800 800" 
          className="w-full h-full max-w-[600px] max-h-[600px]"
          style={{ transition: 'transform 0.5s ease' }}
        >
          {/* Base Grid */}
          <defs>
            <pattern id="solar-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="800" height="800" fill="url(#solar-grid)" />

          {/* Rotatable World (Plot & Compass) */}
          <g transform={`rotate(${rotation} ${CENTER} ${CENTER})`} style={{ transition: 'transform 0.8s cubic-bezier(0.4, 0, 0.2, 1)' }}>
            
            {/* Plot Boundary */}
            <rect 
              x={CENTER - BUILDING_W/2 - 60} 
              y={CENTER - BUILDING_L/2 - 60} 
              width={BUILDING_W + 120} 
              height={BUILDING_L + 120} 
              fill="none" stroke="#334155" strokeWidth="2" strokeDasharray="10,10" 
            />

            {/* Road Indicator (Always at the "Front" of the Plot based on rotation) */}
            <rect 
              x={CENTER - BUILDING_W/2 - 80} 
              y={CENTER + BUILDING_L/2 + 60} 
              width={BUILDING_W + 160} 
              height="40" 
              fill="#1e293b" 
            />
            <text x={CENTER} y={CENTER + BUILDING_L/2 + 85} fill="#475569" textAnchor="middle" className="font-bold text-sm tracking-widest">
              MAIN ROAD ({plotFacing})
            </text>

            {/* Compass Markers (Fixed relative to the plot) */}
            <text x={CENTER} y="40" fill="#94a3b8" textAnchor="middle" className="font-black text-xl">N</text>
            <text x={CENTER} y="780" fill="#94a3b8" textAnchor="middle" className="font-black text-xl">S</text>
            <text x="780" y={CENTER+5} fill="#94a3b8" textAnchor="end" className="font-black text-xl">E</text>
            <text x="20" y={CENTER+5} fill="#94a3b8" textAnchor="start" className="font-black text-xl">W</text>

            {/* The Dynamic Shadow Polygon */}
            <polygon 
              points={`
                ${CENTER - BUILDING_W/2},${CENTER - BUILDING_L/2}
                ${CENTER + BUILDING_W/2},${CENTER - BUILDING_L/2}
                ${CENTER + BUILDING_W/2 + shadowDx},${CENTER - BUILDING_L/2 + shadowDy}
                ${CENTER - BUILDING_W/2 + shadowDx},${CENTER + BUILDING_L/2 + shadowDy}
                ${CENTER - BUILDING_W/2},${CENTER + BUILDING_L/2}
              `}
              fill="#000000" 
              opacity="0.5"
              style={{ transition: 'all 0.1s linear' }}
            />

            {/* The Main Building Footprint */}
            <rect 
              x={CENTER - BUILDING_W/2} 
              y={CENTER - BUILDING_L/2} 
              width={BUILDING_W} 
              height={BUILDING_L} 
              fill="#cbd5e1" 
              stroke="#f8fafc" 
              strokeWidth="4" 
            />
            <text x={CENTER} y={CENTER} fill="#334155" textAnchor="middle" className="font-bold tracking-widest uppercase">
              BUILDING
            </text>
            
            {/* Front Entrance Marker */}
            <rect 
              x={CENTER - 20} 
              y={CENTER + BUILDING_L/2 - 10} 
              width="40" 
              height="20" 
              fill="#22c55e" 
            />
          </g>

          {/* FIXED OVERLAY: The Sun and its Path */}
          {/* The Sun always moves E -> N -> W visually, independent of plot rotation */}
          <path 
            d={`M ${CENTER + SUN_ARC_RADIUS} ${CENTER} A ${SUN_ARC_RADIUS} ${SUN_ARC_RADIUS} 0 0 0 ${CENTER - SUN_ARC_RADIUS} ${CENTER}`} 
            fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="5,5" opacity="0.3"
          />
          
          <circle 
            cx={sunX} cy={sunY} r="15" 
            fill="#f59e0b" 
            className="drop-shadow-[0_0_15px_rgba(245,158,11,0.8)]"
            style={{ transition: 'all 0.1s linear' }}
          />
          <circle 
            cx={sunX} cy={sunY} r="25" 
            fill="#f59e0b" opacity="0.2"
            style={{ transition: 'all 0.1s linear' }}
          />

        </svg>
      </div>

    </div>
  );
}