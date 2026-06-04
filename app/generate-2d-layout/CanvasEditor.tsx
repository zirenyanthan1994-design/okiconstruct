"use client";
import React, { useState, useEffect, useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import { Stage, Layer, Rect, Text, Group, Transformer, Line, Arc, Circle, Path } from 'react-konva';

const SCALE = 10;

interface CADElement {
  id: string;
  type: 'window' | 'door' | 'main-door' | 'bed' | 'kitchen' | 'wc' | 'shower' | 'sofa' | 'stairs';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

interface CanvasRoom {
  id: string;
  name: string;
  widthFt: number;
  heightFt: number;
  x: number;
  y: number;
  rotation?: number;
  elements?: CADElement[];
}

interface CanvasEditorProps {
  initialRooms: CanvasRoom[];
  entranceType?: string;
  wallThickness?: string;
}

const getDistance = (p1: { x: number; y: number }, p2: { x: number; y: number }) => {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
};

const getAngle = (p1: { x: number; y: number }, p2: { x: number; y: number }) => {
  return (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI;
};

const CanvasEditor = forwardRef(({
  initialRooms,
  entranceType,
  wallThickness = 'Single Brick (5")'
}: CanvasEditorProps, ref) => {
  const [rooms, setRooms] = useState<CanvasRoom[]>([]);
  const [history, setHistory] = useState<CanvasRoom[][]>([]);
  const [selectedId, selectShape] = useState<string | null>(null);
  
  const [stageSize, setStageSize] = useState({ width: 1000, height: 600 });

  const trRef = useRef<any>(null);
  const stageRef = useRef<any>(null);

  const lastDistRef = useRef<number>(0);
  const lastAngleRef = useRef<number>(0);
  const isTransformingRef = useRef<boolean>(false);

  // EXPOSE DOWNLOAD METHODS TO PARENT UI
  useImperativeHandle(ref, () => ({
    downloadImage: () => {
      selectShape(null); 
      setTimeout(() => {
        if (!stageRef.current) return;
        // HIGH RES EXPORT (pixelRatio 4 creates a 5MB+ image)
        const uri = stageRef.current.toDataURL({ pixelRatio: 4, mimeType: 'image/jpeg', quality: 1 });
        const link = document.createElement('a');
        link.download = 'OkiConstruct_Blueprint_HighRes.jpg';
        link.href = uri;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }, 150);
    },
    downloadCAD: () => {
      let dxf = "0\nSECTION\n2\nENTITIES\n";
      rooms.forEach(r => {
        const x = r.x;
        const y = -r.y; 
        const w = r.widthFt * SCALE;
        const h = r.heightFt * SCALE;

        dxf += `0\nLWPOLYLINE\n8\n0\n90\n4\n70\n1\n`;
        dxf += `10\n${x}\n20\n${y}\n`;
        dxf += `10\n${x+w}\n20\n${y}\n`;
        dxf += `10\n${x+w}\n20\n${y-h}\n`;
        dxf += `10\n${x}\n20\n${y-h}\n`;
      });
      dxf += "0\nENDSEC\n0\nEOF\n";
      
      const blob = new Blob([dxf], { type: 'application/dxf' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'OkiConstruct_CAD_Layout.dxf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }));

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setStageSize({
        width: window.innerWidth > 1200 ? 1200 : window.innerWidth,
        height: window.innerHeight > 800 ? 600 : window.innerHeight * 0.65
      });
    }
  }, []);

  const commitHistory = (currentRooms: CanvasRoom[]) => {
    setHistory((prev) => [...prev, currentRooms]);
  };

  const handleUndo = () => {
    if (history.length > 0) {
      const prev = history[history.length - 1];
      setRooms(prev);
      setHistory(history.slice(0, -1));
      selectShape(null);
    }
  };

  const gridPattern = useMemo(() => {
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = 10;
      canvas.height = 10;
      const context = canvas.getContext('2d');
      if (context) {
        context.strokeStyle = '#e2e8f0';
        context.lineWidth = 0.5;
        context.beginPath();
        context.moveTo(0, 0);
        context.lineTo(10, 0);
        context.lineTo(10, 10);
        context.stroke();
      }
      return canvas as unknown as HTMLImageElement;
    }
    return undefined;
  }, []);

  useEffect(() => {
    if (!initialRooms || initialRooms.length === 0) return;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    initialRooms.forEach((r) => {
      if (r.x < minX) minX = r.x;
      if (r.y < minY) minY = r.y;
      if (r.x + r.widthFt * SCALE > maxX) maxX = r.x + r.widthFt * SCALE;
      if (r.y + r.heightFt * SCALE > maxY) maxY = r.y + r.heightFt * SCALE;
    });

    const mainSpine =
      initialRooms.find((r) => r.name.toLowerCase().includes('main corridor') || (r.name.toLowerCase().includes('passage') && !r.name.toLowerCase().includes('flat'))) ||
      initialRooms.find((r) => r.name.toLowerCase().includes('hall') && !r.name.toLowerCase().includes('flat'));

    let mainDoorPlaced = false;
    const isApartment = initialRooms.some(r => r.name.toLowerCase() === 'main corridor');

    const populatedRooms = initialRooms.map((room) => {
      const w = room.widthFt * SCALE;
      const h = room.heightFt * SCALE;
      const name = room.name.toLowerCase();
      const elements: CADElement[] = [];
      const TOL = 5;

      const extWalls: string[] = [];
      if (Math.abs(room.y - minY) < TOL) extWalls.push('top');
      if (Math.abs(room.y + h - maxY) < TOL) extWalls.push('bot');
      if (Math.abs(room.x - minX) < TOL) extWalls.push('left');
      if (Math.abs(room.x + w - maxX) < TOL) extWalls.push('right');

      if (!name.includes('passage') && !name.includes('corridor') && !name.includes('stair') && !name.includes('bathroom')) {
        if (name.includes('hall')) {
          let placed = 0;
          if (extWalls.includes('top') && placed < 2) { elements.push({ id: room.id + '-win-t', type: 'window', x: w / 2 - 20, y: -4, width: 40, height: 8, rotation: 0 }); placed++; }
          if (extWalls.includes('bot') && placed < 2) { elements.push({ id: room.id + '-win-b', type: 'window', x: w / 2 - 20, y: h - 4, width: 40, height: 8, rotation: 0 }); placed++; }
          if (extWalls.includes('left') && placed < 2) { elements.push({ id: room.id + '-win-l', type: 'window', x: -4, y: h / 2 - 20, width: 8, height: 40, rotation: 0 }); placed++; }
          if (extWalls.includes('right') && placed < 2) { elements.push({ id: room.id + '-win-r', type: 'window', x: w - 4, y: h / 2 - 20, width: 8, height: 40, rotation: 0 }); placed++; }

        } else {
          if (extWalls.length > 0) {
            extWalls.forEach((wall) => {
              if (wall === 'top') elements.push({ id: room.id + '-win-t', type: 'window', x: w / 2 - 20, y: -4, width: 40, height: 8, rotation: 0 });
              else if (wall === 'bot') elements.push({ id: room.id + '-win-b', type: 'window', x: w / 2 - 20, y: h - 4, width: 40, height: 8, rotation: 0 });
              else if (wall === 'left') elements.push({ id: room.id + '-win-l', type: 'window', x: -4, y: h / 2 - 20, width: 8, height: 40, rotation: 0 });
              else if (wall === 'right') elements.push({ id: room.id + '-win-r', type: 'window', x: w - 4, y: h / 2 - 20, width: 8, height: 40, rotation: 0 });
            });
          }
        }
      }

      if (!isApartment && !mainDoorPlaced) {
        const isHallEntrance = entranceType === 'Hall / Living Room';
        const isPassageEntrance = entranceType === 'Separate Passage';

        const isTarget = 
          (isHallEntrance && (name === 'hall / living' || (name.includes('passage') && !name.includes('flat')))) ||
          (isPassageEntrance && name.includes('passage') && !name.includes('flat'));

        if (isTarget) {
          if (Math.abs(room.y + h - maxY) < TOL) {
            elements.push({ id: room.id + '-main', type: 'main-door', x: w / 2 - 20, y: h - 4, width: 40, height: 40, rotation: 0 });
            mainDoorPlaced = true;
          } else if (Math.abs(room.y - minY) < TOL) {
            elements.push({ id: room.id + '-main', type: 'main-door', x: w / 2 - 20, y: 0, width: 40, height: 40, rotation: 180 });
            mainDoorPlaced = true;
          }
        }
      }

      let activeSpine = mainSpine;
      const flatMatch = name.match(/flat \d+/);
      let isFlatSpine = false;
      
      if (flatMatch) {
          if (name.includes('hall') || name.includes('passage')) {
              activeSpine = mainSpine; 
              isFlatSpine = true;     
          } else {
              activeSpine = initialRooms.find(r => r.name.toLowerCase().includes(flatMatch[0]) && r.name.toLowerCase().includes('passage')) ||
                            initialRooms.find(r => r.name.toLowerCase().includes(flatMatch[0]) && r.name.toLowerCase().includes('hall'));
          }
      }

      const isSingleLineChamber = name.includes('chamber') && !mainSpine;

      if (isSingleLineChamber) {
          if (extWalls.includes('bot')) {
              elements.push({ id: room.id + '-front-door', type: 'door', x: w / 2 - 15, y: h, width: 30, height: 30, rotation: 270 });
          } else if (extWalls.includes('top')) {
              elements.push({ id: room.id + '-front-door', type: 'door', x: w / 2 - 15, y: 0, width: 30, height: 30, rotation: 90 });
          }
      } 
      else {
        const isValidDoorTarget = (!name.includes('passage') && !name.includes('corridor') && !name.includes('stair')) || isFlatSpine;

        if (isValidDoorTarget && activeSpine && activeSpine.id !== room.id) {
          if (!(entranceType === 'Hall / Living Room' && name === 'hall / living')) {
            const px = activeSpine.x;
            const py = activeSpine.y;
            const pw = activeSpine.widthFt * SCALE;
            const ph = activeSpine.heightFt * SCALE;
            
            if (Math.abs(room.x + w - px) < TOL) {
              elements.push({ id: room.id + '-door', type: 'door', x: w, y: h / 2 - 15, width: 30, height: 30, rotation: 180 });
            } else if (Math.abs(room.x - (px + pw)) < TOL) {
              elements.push({ id: room.id + '-door', type: 'door', x: 0, y: h / 2 + 15, width: 30, height: 30, rotation: 0 });
            } else if (Math.abs(room.y + h - py) < TOL) {
              elements.push({ id: room.id + '-door', type: 'door', x: w / 2 + 15, y: h, width: 30, height: 30, rotation: 270 });
            } else if (Math.abs(room.y - (py + ph)) < TOL) {
              elements.push({ id: room.id + '-door', type: 'door', x: w / 2 - 15, y: 0, width: 30, height: 30, rotation: 90 });
            }
          }
        }
      }

      if (name.includes('bedroom')) {
        elements.push({ id: room.id + '-bed', type: 'bed', x: 10, y: 10, width: 60, height: 65, rotation: 0 });
      }
      if (name.includes('kitchen')) {
        elements.push({ id: room.id + '-kit', type: 'kitchen', x: 5, y: 5, width: 80, height: 60, rotation: 0 });
      }
      if (name.includes('bathroom')) {
        elements.push({ id: room.id + '-wc', type: 'wc', x: w - 25, y: 5, width: 20, height: 30, rotation: 0 });
        if (w > 50 && h > 50) {
          elements.push({ id: room.id + '-shw', type: 'shower', x: 5, y: 5, width: 30, height: 30, rotation: 0 });
        }
      }
      if (name.includes('hall') && !name.includes('flat')) {
        elements.push({ id: room.id + '-sofa', type: 'sofa', x: 10, y: h - 40, width: 60, height: 30, rotation: 0 });
      }
      if (name.includes('stair')) {
        elements.push({ id: room.id + '-stairs', type: 'stairs', x: 5, y: 5, width: w - 10, height: h - 10, rotation: 0 });
      }

      return { ...room, rotation: 0, elements };
    });

    setRooms(populatedRooms);
    setHistory([]);
    
    if (stageRef.current) {
        stageRef.current.position({ x: 50, y: 50 });
        stageRef.current.scale({ x: 1, y: 1 });
        stageRef.current.batchDraw();
    }
  }, [initialRooms, entranceType]);

  const selectedElement = rooms.flatMap((r) => r.elements || []).find((e) => e.id === selectedId);
  const selectedRoomId = rooms.find((r) => r.elements?.some((e) => e.id === selectedId))?.id;

  let toolbarStyle: React.CSSProperties = { display: 'none' };
  if (selectedElement && selectedRoomId && stageRef.current) {
    const parentRoom = rooms.find((r) => r.id === selectedRoomId);
    if (parentRoom) {
      const stage = stageRef.current;
      const screenX = (parentRoom.x + selectedElement.x) * stage.scaleX() + stage.x();
      const screenY = (parentRoom.y + selectedElement.y) * stage.scaleY() + stage.y();
      toolbarStyle = {
        position: 'absolute',
        left: `${screenX + 30}px`,
        top: `${screenY - 45}px`,
        zIndex: 50,
      };
    }
  }

  const handleDuplicate = () => {
    if (!selectedElement || !selectedRoomId) return;
    commitHistory(rooms);
    setRooms(
      rooms.map((r) =>
        r.id === selectedRoomId
          ? {
              ...r,
              elements: [
                ...(r.elements || []),
                {
                  ...selectedElement,
                  id: selectedElement.id + '-copy-' + Date.now(),
                  x: selectedElement.x + 20,
                  y: selectedElement.y + 20,
                },
              ],
            }
          : r
      )
    );
  };

  const handleDeleteElement = () => {
    if (!selectedId) return;
    commitHistory(rooms);
    setRooms(
      rooms.map((room) => ({
        ...room,
        elements: room.elements?.filter((el) => el.id !== selectedId),
      }))
    );
    selectShape(null);
  };

  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const scaleBy = 1.05;
    const stage = stageRef.current;
    if (!stage) return;
    
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    const newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;

    stage.scale({ x: newScale, y: newScale });
    stage.position({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
    stage.batchDraw();
  };

  const handleTouchMove = (e: any) => {
    const stage = stageRef.current;
    if (!stage) return;

    const touch1 = e.evt.touches[0];
    const touch2 = e.evt.touches[1];

    if (touch1 && touch2) {
      if (stage.isDragging()) stage.stopDrag();

      const p1 = { x: touch1.clientX, y: touch1.clientY };
      const p2 = { x: touch2.clientX, y: touch2.clientY };

      if (!isTransformingRef.current) {
        isTransformingRef.current = true;
        lastDistRef.current = getDistance(p1, p2);
        lastAngleRef.current = getAngle(p1, p2) - stage.rotation();
        return;
      }

      const dist = getDistance(p1, p2);
      const newScale = stage.scaleX() * (dist / lastDistRef.current);
      const boundedScale = Math.max(0.2, Math.min(newScale, 5));

      const angle = getAngle(p1, p2);
      const newRotation = angle - lastAngleRef.current;

      const pointer = stage.getPointerPosition() || { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      const stageX = stage.x();
      const stageY = stage.y();

      const mousePointTo = {
        x: (pointer.x - stageX) / stage.scaleX(),
        y: (pointer.y - stageY) / stage.scaleY(),
      };

      stage.scale({ x: boundedScale, y: boundedScale });
      stage.rotation(newRotation);

      const newPos = {
        x: pointer.x - mousePointTo.x * boundedScale,
        y: pointer.y - mousePointTo.y * boundedScale,
      };
      stage.position(newPos);

      lastDistRef.current = dist;
      stage.batchDraw();
    }
  };

  const handleTouchEnd = () => {
    isTransformingRef.current = false;
  };

  const checkDeselect = (e: any) => {
    if (e.target === e.target.getStage() || e.target.attrs.id === 'grid-bg') {
      selectShape(null);
    }
  };

  const handleSelect = (e: any, id: string) => {
    e.cancelBubble = true;
    selectShape(id);
  };

  const handleDragEnd = (e: any, id: string, roomId?: string) => {
    e.cancelBubble = true;
    commitHistory(rooms);
    const node = e.target;

    if (roomId) {
      setRooms(
        rooms.map((r) =>
          r.id === roomId
            ? {
                ...r,
                elements: r.elements?.map((el) =>
                  el.id === id ? { ...el, x: node.x(), y: node.y() } : el
                ),
              }
            : r
        )
      );
    } else {
      const snapX = Math.round(node.x() / SCALE) * SCALE;
      const snapY = Math.round(node.y() / SCALE) * SCALE;
      node.position({ x: snapX, y: snapY });
      setRooms(
        rooms.map((room) =>
          room.id === id ? { ...room, x: snapX, y: snapY } : room
        )
      );
    }
  };

  const handleTransformEnd = (e: any, id: string, roomId?: string) => {
    e.cancelBubble = true;
    commitHistory(rooms);
    const node = e.target;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    const rotation = node.rotation();
    
    node.scaleX(1);
    node.scaleY(1);

    if (roomId) {
      setRooms(
        rooms.map((r) =>
          r.id === roomId
            ? {
                ...r,
                elements: r.elements?.map((el) =>
                  el.id === id
                    ? {
                        ...el,
                        x: node.x(),
                        y: node.y(),
                        width: node.width() * scaleX,
                        height: node.height() * scaleY,
                        rotation: rotation,
                      }
                    : el
                ),
              }
            : r
        )
      );
    } else {
      const snapX = Math.round(node.x() / SCALE) * SCALE;
      const snapY = Math.round(node.y() / SCALE) * SCALE;
      const newWidth = Math.round((node.width() * scaleX) / SCALE) * SCALE;
      const newHeight = Math.round((node.height() * scaleY) / SCALE) * SCALE;

      setRooms(
        rooms.map((room) =>
          room.id === id
            ? {
                ...room,
                x: snapX,
                y: snapY,
                widthFt: newWidth / SCALE,
                heightFt: newHeight / SCALE,
                rotation: rotation,
              }
            : room
        )
      );
    }
  };

  // ------------------------------------------------------------------
  // 📏 ADVANCED WALL THICKNESS CALCULATION ALGORITHM
  // Scans layout to count vertical and horizontal walls accurately.
  // ------------------------------------------------------------------
  let currentMinX = Infinity;
  let currentMinY = Infinity;
  let currentMaxX = -Infinity;
  let currentMaxY = -Infinity;
  const uniqueX = new Set<number>();
  const uniqueY = new Set<number>();

  rooms.forEach((r) => {
    if (r.x < currentMinX) currentMinX = r.x;
    if (r.y < currentMinY) currentMinY = r.y;
    
    const w = r.widthFt * SCALE;
    const h = r.heightFt * SCALE;
    
    // Track unique wall coordinates (rounded to handle floating point tolerance)
    uniqueX.add(Math.round(r.x / 5) * 5);
    uniqueX.add(Math.round((r.x + w) / 5) * 5);
    uniqueY.add(Math.round(r.y / 5) * 5);
    uniqueY.add(Math.round((r.y + h) / 5) * 5);

    const rad = (r.rotation || 0) * (Math.PI / 180);
    const pts = [
        { x: r.x, y: r.y },
        { x: r.x + w * Math.cos(rad) - 0 * Math.sin(rad), y: r.y + w * Math.sin(rad) + 0 * Math.cos(rad) },
        { x: r.x + 0 * Math.cos(rad) - h * Math.sin(rad), y: r.y + 0 * Math.sin(rad) + h * Math.cos(rad) },
        { x: r.x + w * Math.cos(rad) - h * Math.sin(rad), y: r.y + w * Math.sin(rad) + h * Math.cos(rad) }
    ];
    
    pts.forEach(p => {
        if (p.x < currentMinX) currentMinX = p.x;
        if (p.y < currentMinY) currentMinY = p.y;
        if (p.x > currentMaxX) currentMaxX = p.x;
        if (p.y > currentMaxY) currentMaxY = p.y;
    });
  });

  const internalWidthFt = (currentMaxX - currentMinX) / SCALE;
  const internalHeightFt = (currentMaxY - currentMinY) / SCALE;

  // Multiply wall count by thickness (5" or 9")
  const wallThickInches = wallThickness.includes('Double') ? 9 : 5;
  const addedWidthFt = (uniqueX.size * wallThickInches) / 12;
  const addedHeightFt = (uniqueY.size * wallThickInches) / 12;

  const trueTotalWidthFt = (internalWidthFt + addedWidthFt).toFixed(1);
  const trueTotalHeightFt = (internalHeightFt + addedHeightFt).toFixed(1);

  const uniqueCorners: { x: number; y: number }[] = [];
  rooms.forEach((r) => {
    if (!r.name.toLowerCase().includes('bathroom')) {
      const w = r.widthFt * SCALE;
      const h = r.heightFt * SCALE;
      const rad = (r.rotation || 0) * (Math.PI / 180);

      const getRotatedPoint = (px: number, py: number) => ({
        x: r.x + px * Math.cos(rad) - py * Math.sin(rad),
        y: r.y + px * Math.sin(rad) + py * Math.cos(rad)
      });

      const pts = [
        getRotatedPoint(0, 0),
        getRotatedPoint(w, 0),
        getRotatedPoint(0, h),
        getRotatedPoint(w, h),
      ];

      pts.forEach((p) => {
        if (!uniqueCorners.some((uc) => Math.abs(uc.x - p.x) < 5 && Math.abs(uc.y - p.y) < 5)) {
          uniqueCorners.push(p);
        }
      });
    }
  });

  useEffect(() => {
    if (selectedId && trRef.current && stageRef.current) {
      const node = stageRef.current.findOne(`#${selectedId}`);
      if (node) {
        trRef.current.nodes([node]);
        trRef.current.getLayer().batchDraw();
      }
    }
  }, [selectedId, rooms]);

  const renderMergedWall = () => {
    if (entranceType !== 'Hall / Living Room') return null;
    const hall = rooms.find((r) => r.name.toLowerCase() === 'hall / living');
    const passage = rooms.find((r) => r.name.toLowerCase() === 'main passage');
    if (!hall || !passage) return null;

    const hRect = { x: hall.x, y: hall.y, w: hall.widthFt * SCALE, h: hall.heightFt * SCALE };
    const pRect = { x: passage.x, y: passage.y, w: passage.widthFt * SCALE, h: passage.heightFt * SCALE };
    const TOL = 5;
    let points: number[] = [];

    if (Math.abs(hRect.x - (pRect.x + pRect.w)) < TOL) {
      const y1 = Math.max(hRect.y, pRect.y);
      const y2 = Math.min(hRect.y + hRect.h, pRect.y + pRect.h);
      points = [hRect.x, y1 + 2, hRect.x, y2 - 2];
    } else if (Math.abs(hRect.x + hRect.w - pRect.x) < TOL) {
      const y1 = Math.max(hRect.y, pRect.y);
      const y2 = Math.min(hRect.y + hRect.h, pRect.y + pRect.h);
      points = [pRect.x, y1 + 2, pRect.x, y2 - 2];
    } else if (Math.abs(hRect.y - (pRect.y + pRect.h)) < TOL) {
      const x1 = Math.max(hRect.x, pRect.x);
      const x2 = Math.min(hRect.x + hRect.w, pRect.x + pRect.w);
      points = [x1 + 2, hRect.y, x2 - 2, hRect.y];
    } else if (Math.abs(hRect.y + hRect.h - pRect.y) < TOL) {
      const x1 = Math.max(hRect.x, pRect.x);
      const x2 = Math.min(hRect.x + hRect.w, pRect.x + pRect.w);
      points = [x1 + 2, pRect.y, x2 - 2, pRect.y];
    }

    if (points.length === 4) {
      return <Line points={points} stroke="#f1f5f9" strokeWidth={10} />;
    }
    return null;
  };

  const renderHitbox = (el: CADElement) => {
    let hitX = 0;
    let hitY = 0;
    let hitW = el.width;
    let hitH = el.height;
    if (el.type === 'door') { hitY = -el.width; hitH = el.width; }
    if (el.type === 'main-door') { hitY = -el.width / 1.5; hitH = el.width / 1.5; }
    return <Rect x={hitX} y={hitY} width={hitW} height={hitH} fill="rgba(0,0,0,0.01)" />;
  };

  const renderElement = (el: CADElement) => {
    const stroke = '#334155';
    switch (el.type) {
      case 'window':
        return <Rect width={el.width} height={el.height} fill="#e0f2fe" stroke="#0ea5e9" strokeWidth={1.5} perfectDrawEnabled={false} />;
      case 'door':
        return (
          <Group>
            <Line points={[0, 0, el.width, 0]} stroke={stroke} strokeWidth={2} perfectDrawEnabled={false} />
            <Arc x={0} y={0} innerRadius={el.width} outerRadius={el.width} angle={90} rotation={0} stroke={stroke} strokeWidth={1} dash={[4, 4]} perfectDrawEnabled={false} />
          </Group>
        );
      case 'main-door':
        return (
          <Group>
            <Line points={[0, 0, 0, -el.width / 1.5]} stroke="#0f172a" strokeWidth={3} perfectDrawEnabled={false} />
            <Arc x={0} y={0} innerRadius={el.width / 1.5} outerRadius={el.width / 1.5} angle={90} rotation={270} stroke="#0f172a" strokeWidth={2} perfectDrawEnabled={false} />
            <Line points={[el.width, 0, el.width, -el.width / 1.5]} stroke="#0f172a" strokeWidth={3} perfectDrawEnabled={false} />
            <Arc x={el.width} y={0} innerRadius={el.width / 1.5} outerRadius={el.width / 1.5} angle={90} rotation={180} stroke="#0f172a" strokeWidth={2} perfectDrawEnabled={false} />
          </Group>
        );
      case 'bed':
        return (
          <Group>
            <Rect width={el.width} height={el.height} stroke={stroke} strokeWidth={1.5} cornerRadius={3} perfectDrawEnabled={false} />
            <Rect x={5} y={5} width={el.width / 2.5} height={12} stroke={stroke} strokeWidth={1} cornerRadius={2} perfectDrawEnabled={false} />
            <Rect x={el.width / 2 + 3} y={5} width={el.width / 2.5} height={12} stroke={stroke} strokeWidth={1} cornerRadius={2} perfectDrawEnabled={false} />
            <Line points={[0, 25, el.width, 25]} stroke={stroke} strokeWidth={1} perfectDrawEnabled={false} />
          </Group>
        );
      case 'wc':
        return (
          <Group>
            <Rect width={el.width} height={el.height / 3} stroke={stroke} strokeWidth={1} perfectDrawEnabled={false} />
            <Circle x={el.width / 2} y={el.height / 1.5} radius={el.width / 2.5} stroke={stroke} strokeWidth={1} perfectDrawEnabled={false} />
          </Group>
        );
      case 'shower':
        return (
          <Group>
            <Rect width={el.width} height={el.height} stroke={stroke} strokeWidth={1} perfectDrawEnabled={false} />
            <Line points={[0, 0, el.width, el.height]} stroke={stroke} strokeWidth={1} opacity={0.3} perfectDrawEnabled={false} />
            <Line points={[el.width, 0, 0, el.height]} stroke={stroke} strokeWidth={1} opacity={0.3} perfectDrawEnabled={false} />
          </Group>
        );
      case 'sofa':
        return (
          <Group>
            <Rect width={el.width} height={el.height} stroke={stroke} strokeWidth={1.5} cornerRadius={2} perfectDrawEnabled={false} />
            <Line points={[el.width / 3, 0, el.width / 3, el.height]} stroke={stroke} strokeWidth={1} perfectDrawEnabled={false} />
            <Line points={[(el.width / 3) * 2, 0, (el.width / 3) * 2, el.height]} stroke={stroke} strokeWidth={1} perfectDrawEnabled={false} />
          </Group>
        );
      case 'kitchen':
        return (
          <Group>
            <Rect width={el.width} height={el.height / 3} stroke={stroke} strokeWidth={1} fill="#f8fafc" perfectDrawEnabled={false} />
            <Rect x={el.width - el.width / 4} y={0} width={el.width / 4} height={el.height} stroke={stroke} strokeWidth={1} fill="#f8fafc" perfectDrawEnabled={false} />
            <Circle x={el.width / 2} y={el.height / 6} radius={5} stroke={stroke} strokeWidth={1} perfectDrawEnabled={false} />
            <Circle x={el.width / 2 + 15} y={el.height / 6} radius={5} stroke={stroke} strokeWidth={1} perfectDrawEnabled={false} />
          </Group>
        );
      case 'stairs':
        const isHorizontal = el.width > el.height;
        const stepLines = [];
        const stepCount = Math.floor((isHorizontal ? el.width : el.height) / 10);
        
        for (let i = 0; i <= stepCount; i++) {
          if (isHorizontal) {
            stepLines.push(<Line key={i} points={[i * 10, 0, i * 10, el.height]} stroke={stroke} strokeWidth={1} perfectDrawEnabled={false} />);
          } else {
            stepLines.push(<Line key={i} points={[0, i * 10, el.width, i * 10]} stroke={stroke} strokeWidth={1} perfectDrawEnabled={false} />);
          }
        }
        const arrowY = el.height / 2;
        const arrowX = el.width / 2;
        
        return (
          <Group>
            <Rect width={el.width} height={el.height} stroke={stroke} strokeWidth={1} perfectDrawEnabled={false} />
            {stepLines}
            {isHorizontal ? (
              <Group>
                <Line points={[10, arrowY, el.width - 10, arrowY]} stroke="#000" strokeWidth={2} perfectDrawEnabled={false} />
                <Path data={`M ${el.width - 15} ${arrowY - 5} L ${el.width - 5} ${arrowY} L ${el.width - 15} ${arrowY + 5}`} fill="#000" perfectDrawEnabled={false} />
              </Group>
            ) : (
              <Group>
                <Line points={[arrowX, el.height - 10, arrowX, 10]} stroke="#000" strokeWidth={2} perfectDrawEnabled={false} />
                <Path data={`M ${arrowX - 5} 15 L ${arrowX} 5 L ${arrowX + 5} 15`} fill="#000" perfectDrawEnabled={false} />
              </Group>
            )}
          </Group>
        );
      default:
        return null;
    }
  };

  return (
    <div className="relative w-full border-2 border-gray-300 rounded-lg overflow-hidden bg-white shadow-sm">
      <button
        onClick={handleUndo}
        disabled={history.length === 0}
        className={`absolute top-4 left-4 z-20 px-4 py-2 font-bold text-sm rounded shadow transition-all ${
          history.length > 0 ? 'bg-white text-gray-800 hover:bg-gray-100' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
        }`}
      >
        ↩ Undo
      </button>

      {selectedElement && (
        <div
          style={toolbarStyle}
          className="absolute z-20 bg-white border border-gray-200 shadow-xl rounded-lg p-1.5 flex items-center space-x-1"
        >
          <span className="text-[10px] font-bold text-gray-500 py-1 px-2 border-r border-gray-200 uppercase tracking-wide">
            {selectedElement.type}
          </span>
          <button onClick={handleDuplicate} className="text-[10px] font-bold bg-blue-50 text-blue-600 px-2 py-1 rounded hover:bg-blue-100 transition-colors">📋 Copy</button>
          <button onClick={handleDeleteElement} className="text-[10px] font-bold bg-red-50 text-red-600 px-2 py-1 rounded hover:bg-red-100 transition-colors">🗑 Delete</button>
        </div>
      )}

      <div 
        tabIndex={0} 
        className="w-full relative overflow-hidden cursor-crosshair focus:outline-none bg-gray-50"
        style={{ height: stageSize.height }}
      >
        <Stage
          width={stageSize.width}
          height={stageSize.height}
          onMouseDown={checkDeselect}
          onTouchStart={checkDeselect}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onWheel={handleWheel}
          draggable={!selectedId && !isTransformingRef.current}
          ref={stageRef}
        >
          <Layer>
            <Rect id="grid-bg" x={-2000} y={-2000} width={8000} height={8000} fillPatternImage={gridPattern} listening={false} perfectDrawEnabled={false} />

            {/* OVERALL EXTERIOR DIMENSIONS ON ALL 4 SIDES */}
            {rooms.length > 0 && currentMinX !== Infinity && (
              <Group listening={false}>
                {/* TOP */}
                <Line points={[currentMinX, currentMinY - 20, currentMaxX, currentMinY - 20]} stroke="#dc2626" strokeWidth={1.5} perfectDrawEnabled={false} />
                <Text text={`TOTAL WIDTH: ${trueTotalWidthFt}'`} x={currentMinX + (currentMaxX - currentMinX) / 2 - 45} y={currentMinY - 35} fontSize={12} fontStyle="bold" fill="#dc2626" />
                
                {/* BOTTOM */}
                <Line points={[currentMinX, currentMaxY + 20, currentMaxX, currentMaxY + 20]} stroke="#dc2626" strokeWidth={1.5} perfectDrawEnabled={false} />
                <Text text={`TOTAL WIDTH: ${trueTotalWidthFt}'`} x={currentMinX + (currentMaxX - currentMinX) / 2 - 45} y={currentMaxY + 25} fontSize={12} fontStyle="bold" fill="#dc2626" />
                
                {/* LEFT */}
                <Line points={[currentMinX - 20, currentMinY, currentMinX - 20, currentMaxY]} stroke="#dc2626" strokeWidth={1.5} perfectDrawEnabled={false} />
                <Text text={`TOTAL LENGTH: ${trueTotalHeightFt}'`} x={currentMinX - 35} y={currentMinY + (currentMaxY - currentMinY) / 2 + 45} rotation={270} fontSize={12} fontStyle="bold" fill="#dc2626" />
                
                {/* RIGHT */}
                <Line points={[currentMaxX + 20, currentMinY, currentMaxX + 20, currentMaxY]} stroke="#dc2626" strokeWidth={1.5} perfectDrawEnabled={false} />
                <Text text={`TOTAL LENGTH: ${trueTotalHeightFt}'`} x={currentMaxX + 35} y={currentMinY + (currentMaxY - currentMinY) / 2 - 45} rotation={90} fontSize={12} fontStyle="bold" fill="#dc2626" />
              </Group>
            )}

            {/* ROOM BACKGROUNDS & WALLS */}
            {rooms.map((room) => {
              const w = room.widthFt * SCALE;
              const h = room.heightFt * SCALE;
              const extThick = wallThickness.includes('Double') ? 7.5 : 4.1;
              const intThick = 4.1;

              const isMinX = Math.abs(room.x - currentMinX) < 1;
              const isMaxX = Math.abs(room.x + w - currentMaxX) < 1;
              const isMinY = Math.abs(room.y - currentMinY) < 1;
              const isMaxY = Math.abs(room.y + h - currentMaxY) < 1;

              const dimColor = '#2563eb';
              const isPassage = room.name.toLowerCase().includes('passage') || room.name.toLowerCase().includes('corridor');
              const isBathroom = room.name.toLowerCase().includes('bathroom');
              const labelFontSize = isBathroom ? 7 : 11;

              const isSelected = selectedId === room.id;

              return (
                <Group
                  key={room.id}
                  id={room.id}
                  x={room.x}
                  y={room.y}
                  rotation={room.rotation || 0}
                  draggable
                  dragBoundFunc={(pos) => ({ x: Math.round(pos.x / SCALE) * SCALE, y: Math.round(pos.y / SCALE) * SCALE })}
                  onMouseDown={(e) => handleSelect(e, room.id)}
                  onTouchStart={(e) => handleSelect(e, room.id)}
                  onDragEnd={(e) => handleDragEnd(e, room.id)}
                  onTransformEnd={(e) => handleTransformEnd(e, room.id)}
                >
                  <Rect width={w} height={h} fill={isSelected ? '#e0f2fe' : '#ffffff'} opacity={0.95} perfectDrawEnabled={false} />
                  {isSelected && <Rect width={w} height={h} stroke="#0ea5e9" strokeWidth={4} listening={false} perfectDrawEnabled={false} />}

                  <Line points={[0, 0, w, 0]} stroke="#0f172a" strokeWidth={isMinY ? extThick : intThick} perfectDrawEnabled={false} />
                  <Line points={[0, h, w, h]} stroke="#0f172a" strokeWidth={isMaxY ? extThick : intThick} perfectDrawEnabled={false} />
                  <Line points={[0, 0, 0, h]} stroke="#0f172a" strokeWidth={isMinX ? extThick : intThick} perfectDrawEnabled={false} />
                  <Line points={[w, 0, w, h]} stroke="#0f172a" strokeWidth={isMaxX ? extThick : intThick} perfectDrawEnabled={false} />

                  <Group opacity={0.9} listening={false}>
                    <Line points={[15, 15, w - 15, 15]} stroke={dimColor} strokeWidth={0.5} perfectDrawEnabled={false} />
                    <Text text={`${Math.round(room.widthFt)}'`} x={0} y={17} width={w} align="center" fontSize={9} fontStyle="bold" fill={dimColor} />
                    <Line points={[15, h - 15, w - 15, h - 15]} stroke={dimColor} strokeWidth={0.5} perfectDrawEnabled={false} />
                    <Text text={`${Math.round(room.widthFt)}'`} x={0} y={h - 26} width={w} align="center" fontSize={9} fontStyle="bold" fill={dimColor} />
                    <Line points={[15, 15, 15, h - 15]} stroke={dimColor} strokeWidth={0.5} perfectDrawEnabled={false} />
                    <Text text={`${Math.round(room.heightFt)}'`} x={26} y={h} width={h} align="center" fontSize={9} fontStyle="bold" fill={dimColor} rotation={270} />
                    <Line points={[w - 15, 15, w - 15, h - 15]} stroke={dimColor} strokeWidth={0.5} perfectDrawEnabled={false} />
                    <Text text={`${Math.round(room.heightFt)}'`} x={w - 17} y={h} width={h} align="center" fontSize={9} fontStyle="bold" fill={dimColor} rotation={270} />
                  </Group>

                  <Group
                    x={isPassage ? w / 2 : 0}
                    y={isPassage ? h / 2 : h / 2 - 15}
                    rotation={isPassage ? 90 : 0}
                    offsetX={isPassage ? h / 2 : 0}
                    offsetY={isPassage ? 15 : 0}
                    listening={false}
                  >
                    <Text text={room.name.toUpperCase()} width={isPassage ? h : w} align="center" fontSize={labelFontSize} fontStyle="bold" fill="#0f172a" opacity={0.8} />
                    <Text text={`${Math.round(room.widthFt)}' x ${Math.round(room.heightFt)}'`} width={isPassage ? h : w} y={12} align="center" fontSize={isBathroom ? 6 : 9} fill="#16a34a" fontStyle="bold" />
                  </Group>
                </Group>
              );
            })}

            {renderMergedWall()}

            {uniqueCorners.map((c, i) => (
              <Rect key={`col-${i}`} x={c.x - 6} y={c.y - 6} width={12} height={12} fill="#0f172a" perfectDrawEnabled={false} />
            ))}

            {rooms.map((room) => (
              <Group key={room.id + '-elements'} x={room.x} y={room.y} rotation={room.rotation || 0}>
                {room.elements?.map((el) => (
                  <Group
                    key={el.id}
                    id={el.id}
                    x={el.x}
                    y={el.y}
                    width={el.width}
                    height={el.height}
                    rotation={el.rotation || 0}
                    draggable
                    onMouseDown={(e) => handleSelect(e, el.id)}
                    onTouchStart={(e) => handleSelect(e, el.id)}
                    onDragEnd={(e) => handleDragEnd(e, el.id, room.id)}
                    onTransformEnd={(e) => handleTransformEnd(e, el.id, room.id)}
                  >
                    {renderHitbox(el)}
                    {renderElement(el)}
                  </Group>
                ))}
              </Group>
            ))}

            {selectedId && (
              <Transformer
                ref={trRef}
                rotateEnabled={true}
                boundBoxFunc={(oldBox, newBox) => {
                  if (newBox.width < 10 || newBox.height < 10) return oldBox;
                  return newBox;
                }}
                borderStroke="#16a34a"
                anchorStroke="#16a34a"
                anchorFill="#ffffff"
                anchorSize={8}
              />
            )}
          </Layer>
        </Stage>
      </div>
    </div>
  );
});

CanvasEditor.displayName = 'CanvasEditor';
export default CanvasEditor;