from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from ortools.sat.python import cp_model
import ezdxf
import os
import random

app = FastAPI(title="OkiConstruct Advanced CAD Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class RoomDef(BaseModel):
    id: str
    name: str
    w: float
    h: float
    type: str
    attached_to: Optional[str] = None
    placement: Optional[str] = 'outside'
    parent_id: Optional[str] = None

class FloorPlanRequest(BaseModel):
    global_unit: str
    entrance_type: str = 'Hall / Living Room'
    typology: str = 'Private Residence'
    
    commercial_layout: Optional[str] = 'Single Line'
    commercial_stair: Optional[str] = 'Edge'
    
    apt_layout: Optional[str] = 'Single Line'
    apt_front_entrance: Optional[str] = 'Yes'
    apt_stair_count: Optional[int] = 1
    apt_stair_placement: Optional[str] = 'Middle'
    external_corridor_width: Optional[str] = '6'
    
    ai_preferences: Optional[Dict[str, Any]] = None
    auto_fill_gaps: Optional[bool] = False 
    
    rooms: List[RoomDef]

@app.post("/api/layout/generate")
async def generate_layout(plan: FloorPlanRequest):
    random.seed()
    
    ai_prefs = plan.ai_preferences or {}
    ai_kitchen = float(ai_prefs.get('openConceptKitchen', 0.5))
    ai_bath = float(ai_prefs.get('rearPrivacyBathrooms', 0.5))
    ai_circ = float(ai_prefs.get('centralCirculation', 0.5))
    
    apt_stair_pos = plan.apt_stair_placement.lower()
    if apt_stair_pos == 'edge':
        edge_weights = [1.0 - ai_circ, ai_circ]
        edge_choice = random.choices(['left', 'right'], weights=edge_weights, k=1)[0]
    else:
        edge_choice = 'middle'

    model = cp_model.CpModel()

    unit = plan.global_unit.lower()
    if unit == 'mm': scale_factor = 1
    elif unit == 'cm': scale_factor = 10
    elif unit == 'in': scale_factor = 25
    elif unit == 'ft': scale_factor = 300
    elif unit == 'mtr': scale_factor = 1000
    else: scale_factor = 300

    max_boundary = 100000
    door_allowance = int(3 * scale_factor)

    x_vars, y_vars, w_vars, h_vars = {}, {}, {}, {}
    structural_x_intervals, structural_y_intervals = [], []

    structural_rooms = [r for r in plan.rooms if not (r.type == 'bathroom' and r.placement == 'inside')]
    internal_rooms = [r for r in plan.rooms if (r.type == 'bathroom' and r.placement == 'inside')]

    passage_room = next((r for r in structural_rooms if r.type == 'passage'), None)
    passage_id = passage_room.id if passage_room else None
    
    main_corridor_room = next((r for r in structural_rooms if r.type == 'main_corridor'), None)
    main_corridor_id = main_corridor_room.id if main_corridor_room else None
    
    stair_room = next((r for r in structural_rooms if r.type == 'stairs'), None)
    stair_2_room = next((r for r in structural_rooms if r.id == 'stairs_2'), None)
    hall_room = next((r for r in structural_rooms if r.type == 'hall'), None)

    for room in plan.rooms:
        x_vars[room.id] = model.NewIntVar(0, max_boundary, f'x_{room.id}')
        y_vars[room.id] = model.NewIntVar(0, max_boundary, f'y_{room.id}')

        model.AddModuloEquality(0, x_vars[room.id], 10)
        model.AddModuloEquality(0, y_vars[room.id], 10)

        if room.type in ['passage', 'main_corridor', 'flat_passage']:
            if plan.typology == 'Apartment Complex' and plan.apt_layout == 'Single Line' and room.type == 'main_corridor':
                w_var = model.NewIntVar(int(10 * scale_factor), max_boundary, f'w_{room.id}')
                h_fixed = int(room.w * scale_factor) 
                w_vars[room.id] = w_var
                h_vars[room.id] = h_fixed
                end_x = model.NewIntVar(0, max_boundary * 2, f'end_x_{room.id}')
                model.Add(end_x == x_vars[room.id] + w_var)
                x_int = model.NewIntervalVar(x_vars[room.id], w_var, end_x, f'x_int_{room.id}')
                y_int = model.NewFixedSizeIntervalVar(y_vars[room.id], h_fixed, f'y_int_{room.id}')
            elif plan.typology == 'Apartment Complex' and plan.apt_layout == 'Clustered' and room.type == 'flat_passage':
                w_var = model.NewIntVar(int(10 * scale_factor), max_boundary, f'w_{room.id}')
                h_fixed = int(room.w * scale_factor)
                w_vars[room.id] = w_var
                h_vars[room.id] = h_fixed
                end_x = model.NewIntVar(0, max_boundary * 2, f'end_x_{room.id}')
                model.Add(end_x == x_vars[room.id] + w_var)
                x_int = model.NewIntervalVar(x_vars[room.id], w_var, end_x, f'x_int_{room.id}')
                y_int = model.NewFixedSizeIntervalVar(y_vars[room.id], h_fixed, f'y_int_{room.id}')
            else:
                pw = int(room.w * scale_factor)
                ph = model.NewIntVar(int(10 * scale_factor), max_boundary, 'ph')
                w_vars[room.id] = pw
                h_vars[room.id] = ph
                x_int = model.NewFixedSizeIntervalVar(x_vars[room.id], pw, f'x_int_{room.id}')
                end_y = model.NewIntVar(0, max_boundary * 2, f'end_y_{room.id}')
                model.Add(end_y == y_vars[room.id] + ph)
                y_int = model.NewIntervalVar(y_vars[room.id], ph, end_y, f'y_int_{room.id}')
        else:
            if room.type == 'stairs':
                short_side = min(int(room.w * scale_factor), int(room.h * scale_factor))
                long_side = max(int(room.w * scale_factor), int(room.h * scale_factor))
                
                if room.placement == 'outside':
                    if random.choice([True, False]): w_vars[room.id], h_vars[room.id] = short_side, long_side
                    else: w_vars[room.id], h_vars[room.id] = long_side, short_side
                else:
                    is_horiz_corridor = True
                    if plan.typology == 'Private Residence': is_horiz_corridor = False
                    elif plan.typology == 'Apartment Complex' and plan.apt_layout == 'Clustered': is_horiz_corridor = False
                    elif plan.typology == 'Commercial' and plan.commercial_layout == 'Clustered': is_horiz_corridor = False
                    
                    if plan.typology == 'Apartment Complex' and plan.apt_layout == 'Single Line':
                        if apt_stair_pos == 'middle': w_vars[room.id], h_vars[room.id] = short_side, long_side
                        else:
                            if random.choice([True, False]): w_vars[room.id], h_vars[room.id] = short_side, long_side
                            else: w_vars[room.id], h_vars[room.id] = long_side, short_side
                    else:
                        w_vars[room.id] = short_side if is_horiz_corridor else long_side
                        h_vars[room.id] = long_side if is_horiz_corridor else short_side
                        
                x_int = model.NewFixedSizeIntervalVar(x_vars[room.id], w_vars[room.id], f'x_int_{room.id}')
                y_int = model.NewFixedSizeIntervalVar(y_vars[room.id], h_vars[room.id], f'y_int_{room.id}')
            else:
                base_w = int(room.w * scale_factor)
                base_h = int(room.h * scale_factor)
                
                if plan.auto_fill_gaps:
                    max_w_flex = int(base_w * 1.15) 
                    max_h_flex = int(base_h * 1.15)
                    
                    w_vars[room.id] = model.NewIntVar(base_w, max_w_flex, f'w_{room.id}')
                    h_vars[room.id] = model.NewIntVar(base_h, max_h_flex, f'h_{room.id}')
                    
                    end_x = model.NewIntVar(0, max_boundary * 2, f'end_x_{room.id}')
                    model.Add(end_x == x_vars[room.id] + w_vars[room.id])
                    x_int = model.NewIntervalVar(x_vars[room.id], w_vars[room.id], end_x, f'x_int_{room.id}')
                    
                    end_y = model.NewIntVar(0, max_boundary * 2, f'end_y_{room.id}')
                    model.Add(end_y == y_vars[room.id] + h_vars[room.id])
                    y_int = model.NewIntervalVar(y_vars[room.id], h_vars[room.id], end_y, f'y_int_{room.id}')
                else:
                    w_vars[room.id] = base_w
                    h_vars[room.id] = base_h
                    x_int = model.NewFixedSizeIntervalVar(x_vars[room.id], base_w, f'x_int_{room.id}')
                    y_int = model.NewFixedSizeIntervalVar(y_vars[room.id], base_h, f'y_int_{room.id}')

        if any(r.id == room.id for r in structural_rooms):
            structural_x_intervals.append(x_int)
            structural_y_intervals.append(y_int)

    model.AddNoOverlap2D(structural_x_intervals, structural_y_intervals)

    for int_room in internal_rooms:
        target_bed = next((r for r in structural_rooms if r.name == int_room.attached_to and r.parent_id == int_room.parent_id), None)
        if not target_bed:
            target_bed = next((r for r in structural_rooms if int_room.attached_to and int_room.attached_to in r.name), None)
            
        if target_bed:
            bx, by = x_vars[int_room.id], y_vars[int_room.id]
            bw, bh = w_vars[int_room.id], h_vars[int_room.id]
            tx, ty = x_vars[target_bed.id], y_vars[target_bed.id]
            tw, th = w_vars[target_bed.id], h_vars[target_bed.id]
            model.Add(bx >= tx)
            model.Add(by >= ty)
            model.Add(bx + bw <= tx + tw)
            model.Add(by + bh <= ty + th)

    min_x = model.NewIntVar(0, max_boundary, 'min_x')
    max_x = model.NewIntVar(0, max_boundary, 'max_x')
    min_y = model.NewIntVar(0, max_boundary, 'min_y')
    max_y = model.NewIntVar(0, max_boundary, 'max_y')

    model.AddMinEquality(min_x, [x_vars[r.id] for r in structural_rooms])
    model.AddMaxEquality(max_x, [x_vars[r.id] + (w_vars[r.id] if not isinstance(w_vars[r.id], cp_model.IntVar) else w_vars[r.id]) for r in structural_rooms])
    model.AddMinEquality(min_y, [y_vars[r.id] for r in structural_rooms if r.type not in ['passage', 'main_corridor', 'flat_passage']])
    model.AddMaxEquality(max_y, [y_vars[r.id] + (h_vars[r.id] if not isinstance(h_vars[r.id], cp_model.IntVar) else h_vars[r.id]) for r in structural_rooms if r.type not in ['passage', 'main_corridor', 'flat_passage']])

    def enforce_adjacency(room_a_id, room_b_id):
        xa, ya = x_vars[room_a_id], y_vars[room_a_id]
        wa, ha = w_vars[room_a_id], h_vars[room_a_id]
        xb, yb = x_vars[room_b_id], y_vars[room_b_id]
        wb, hb = w_vars[room_b_id], h_vars[room_b_id]
        left, right = model.NewBoolVar(f'{room_a_id}_l_{room_b_id}'), model.NewBoolVar(f'{room_a_id}_r_{room_b_id}')
        top, bottom = model.NewBoolVar(f'{room_a_id}_t_{room_b_id}'), model.NewBoolVar(f'{room_a_id}_b_{room_b_id}')
        model.Add(xa + wa == xb).OnlyEnforceIf(left)
        model.Add(ya <= yb + hb - door_allowance).OnlyEnforceIf(left)
        model.Add(ya + ha >= yb + door_allowance).OnlyEnforceIf(left)
        model.Add(xa == xb + wb).OnlyEnforceIf(right)
        model.Add(ya <= yb + hb - door_allowance).OnlyEnforceIf(right)
        model.Add(ya + ha >= yb + door_allowance).OnlyEnforceIf(right)
        model.Add(ya + ha == yb).OnlyEnforceIf(top)
        model.Add(xa <= xb + wb - door_allowance).OnlyEnforceIf(top)
        model.Add(xa + wa >= xb + door_allowance).OnlyEnforceIf(top)
        model.Add(ya == yb + hb).OnlyEnforceIf(bottom)
        model.Add(xa <= xb + wb - door_allowance).OnlyEnforceIf(bottom)
        model.Add(xa + wa >= xb + door_allowance).OnlyEnforceIf(bottom)
        model.AddBoolOr([left, right, top, bottom])

    # =========================================================================
    # PRIVATE RESIDENCE
    # =========================================================================
    if plan.typology == 'Private Residence':
        all_bathrooms = [r for r in plan.rooms if r.type == 'bathroom']
        for room in all_bathrooms:
            on_l, on_r = model.NewBoolVar(f'{room.id}_ext_l'), model.NewBoolVar(f'{room.id}_ext_r')
            on_t, on_b = model.NewBoolVar(f'{room.id}_ext_t'), model.NewBoolVar(f'{room.id}_ext_b')
            model.Add(x_vars[room.id] == min_x).OnlyEnforceIf(on_l)
            model.Add(x_vars[room.id] + w_vars[room.id] == max_x).OnlyEnforceIf(on_r)
            model.Add(y_vars[room.id] == min_y).OnlyEnforceIf(on_t)
            model.Add(y_vars[room.id] + h_vars[room.id] == max_y).OnlyEnforceIf(on_b)
            model.AddBoolOr([on_l, on_r, on_t, on_b])

        if hall_room:
            if plan.entrance_type == 'Hall / Living Room':
                model.Add(y_vars[hall_room.id] + h_vars[hall_room.id] == max_y)
            else:
                model.Add(y_vars[hall_room.id] + h_vars[hall_room.id] <= max_y - int(4 * scale_factor))

        hall_is_left = True
        if hall_room and passage_id: 
            enforce_adjacency(hall_room.id, passage_id)
            hall_is_left = random.choice([True, False])
            if hall_is_left: model.Add(x_vars[hall_room.id] + w_vars[hall_room.id] <= x_vars[passage_id])
            else: model.Add(x_vars[hall_room.id] >= x_vars[passage_id] + w_vars[passage_id])
                
        pr_bedrooms = [r for r in structural_rooms if r.type == 'bedroom']
        random.shuffle(pr_bedrooms)
        bed_side_map = {}
        start_side = random.choice(['left', 'right'])
        
        for i, r in enumerate(pr_bedrooms):
            if start_side == 'left': bed_side_map[r.id] = 'left' if i % 2 == 0 else 'right'
            else: bed_side_map[r.id] = 'right' if i % 2 == 0 else 'left'

        for room in structural_rooms:
            if room.type == 'kitchen':
                if hall_room and passage_id:
                    k_weights = [1.0 - ai_kitchen, ai_kitchen]
                    k_style = random.choices(['behind_hall', 'opposite_hall'], weights=k_weights, k=1)[0]
                    
                    if k_style == 'behind_hall': enforce_adjacency(room.id, hall_room.id)
                    else:
                        enforce_adjacency(room.id, passage_id)
                        if hall_is_left: model.Add(x_vars[room.id] >= x_vars[passage_id] + w_vars[passage_id])
                        else: model.Add(x_vars[room.id] + w_vars[room.id] <= x_vars[passage_id])
                elif hall_room: enforce_adjacency(room.id, hall_room.id)
                elif passage_id: enforce_adjacency(room.id, passage_id)
            
            elif room.type == 'bedroom' and passage_id: 
                enforce_adjacency(room.id, passage_id)
                bed_side = bed_side_map.get(room.id, 'any')
                if bed_side == 'left': model.Add(x_vars[room.id] + w_vars[room.id] <= x_vars[passage_id])
                elif bed_side == 'right': model.Add(x_vars[room.id] >= x_vars[passage_id] + w_vars[passage_id])
            
            elif room.type == 'bathroom' and room.placement == 'outside':
                if room.attached_to:
                    target = next((r.id for r in structural_rooms if r.name == room.attached_to), None)
                    if target: enforce_adjacency(room.id, target)
                elif passage_id: 
                    enforce_adjacency(room.id, passage_id)
                    cb_weights = [1.0 - ai_bath, ai_bath]
                    cb_style = random.choices(['side', 'back_edge'], weights=cb_weights, k=1)[0]
                    
                    if cb_style == 'back_edge': model.Add(y_vars[room.id] == min_y)
                    else:
                        cb_side = random.choice(['left', 'right'])
                        if cb_side == 'left': model.Add(x_vars[room.id] + w_vars[room.id] <= x_vars[passage_id])
                        else: model.Add(x_vars[room.id] >= x_vars[passage_id] + w_vars[passage_id])

        if stair_room:
            if stair_room.placement == 'outside':
                on_l, on_r = model.NewBoolVar('st_ext_l'), model.NewBoolVar('st_ext_r')
                on_t, on_b = model.NewBoolVar('st_ext_t'), model.NewBoolVar('st_ext_b')
                model.Add(x_vars[stair_room.id] == min_x).OnlyEnforceIf(on_l)
                model.Add(x_vars[stair_room.id] + w_vars[stair_room.id] == max_x).OnlyEnforceIf(on_r)
                model.Add(y_vars[stair_room.id] == min_y).OnlyEnforceIf(on_t)
                model.Add(y_vars[stair_room.id] + h_vars[stair_room.id] == max_y).OnlyEnforceIf(on_b)
                model.AddBoolOr([on_l, on_r, on_t, on_b])
                if hall_room and passage_id:
                    if random.choice([True, False]): enforce_adjacency(stair_room.id, hall_room.id)
                    else: enforce_adjacency(stair_room.id, passage_id)
                elif passage_id: enforce_adjacency(stair_room.id, passage_id)
                elif hall_room: enforce_adjacency(stair_room.id, hall_room.id)
            else:
                if hall_room and passage_id:
                    if random.choice([True, False]): enforce_adjacency(stair_room.id, hall_room.id)
                    else: enforce_adjacency(stair_room.id, passage_id)
                elif passage_id: enforce_adjacency(stair_room.id, passage_id)

    # =========================================================================
    # APARTMENT COMPLEX
    # =========================================================================
    elif plan.typology == 'Apartment Complex':
        flat_ids = sorted(list(set([r.parent_id for r in structural_rooms if r.parent_id and r.parent_id.startswith('flat_')])))
        flat_blocks = []
        is_bottom = (plan.apt_front_entrance == 'Yes')

        flat_side_map = {}
        if plan.apt_layout == 'Clustered':
            for i, f_id in enumerate(flat_ids):
                flat_side_map[f_id] = 'left' if i % 2 == 0 else 'right'

        for f_id in flat_ids:
            f_rooms = [r for r in structural_rooms if r.parent_id == f_id]
            f_passage = next((r for r in f_rooms if r.type == 'flat_passage'), None)
            f_hall = next((r for r in f_rooms if r.type == 'flat_hall'), None)
            f_spine = f_passage if f_passage else f_hall
            
            f_min_x = model.NewIntVar(0, max_boundary, f'f_min_x_{f_id}')
            f_max_x = model.NewIntVar(0, max_boundary, f'f_max_x_{f_id}')
            f_min_y = model.NewIntVar(0, max_boundary, f'f_min_y_{f_id}')
            f_max_y = model.NewIntVar(0, max_boundary, f'f_max_y_{f_id}')
            
            model.AddMinEquality(f_min_x, [x_vars[r.id] for r in f_rooms])
            model.AddMaxEquality(f_max_x, [x_vars[r.id] + (w_vars[r.id] if not isinstance(w_vars[r.id], cp_model.IntVar) else w_vars[r.id]) for r in f_rooms])
            model.AddMinEquality(f_min_y, [y_vars[r.id] for r in f_rooms])
            model.AddMaxEquality(f_max_y, [y_vars[r.id] + (h_vars[r.id] if not isinstance(h_vars[r.id], cp_model.IntVar) else h_vars[r.id]) for r in f_rooms])

            if f_spine:
                core_rooms = [r for r in f_rooms if r.id != f_spine.id and not (r.type == 'bathroom' and r.attached_to)]
                random.shuffle(core_rooms)
                room_sides = {}

                if plan.apt_layout == 'Single Line':
                    if f_passage:
                        model.Add(y_vars[f_passage.id] == f_min_y)
                        model.Add(y_vars[f_passage.id] + h_vars[f_passage.id] == f_max_y)
                        
                    left_rooms, right_rooms = [], []
                    for i, r in enumerate(core_rooms):
                        if i % 2 == 0: left_rooms.append(r)
                        else: right_rooms.append(r)
                        
                    if f_hall and f_hall.id != f_spine.id:
                        if f_hall in left_rooms:
                            left_rooms.remove(f_hall)
                            if is_bottom: left_rooms.append(f_hall) 
                            else: left_rooms.insert(0, f_hall)      
                        if f_hall in right_rooms:
                            right_rooms.remove(f_hall)
                            if is_bottom: right_rooms.append(f_hall)
                            else: right_rooms.insert(0, f_hall)

                    left_baths = [r for r in left_rooms if r.type == 'bathroom']
                    for b in left_baths:
                        left_rooms.remove(b)
                        if is_bottom: left_rooms.insert(0, b) 
                        else: left_rooms.append(b)            

                    right_baths = [r for r in right_rooms if r.type == 'bathroom']
                    for b in right_baths:
                        right_rooms.remove(b)
                        if is_bottom: right_rooms.insert(0, b)
                        else: right_rooms.append(b)
                    
                    for i, r in enumerate(left_rooms):
                        model.Add(x_vars[r.id] + w_vars[r.id] == x_vars[f_spine.id])
                        room_sides[r.id] = 'left'
                    
                    if is_bottom:
                        for i in range(len(left_rooms)-1, -1, -1):
                            r = left_rooms[i]
                            if i == len(left_rooms) - 1: model.Add(y_vars[r.id] + h_vars[r.id] == f_max_y) 
                            else: model.Add(y_vars[r.id] + h_vars[r.id] == y_vars[left_rooms[i+1].id]) 
                    else:
                        for i in range(len(left_rooms)):
                            r = left_rooms[i]
                            if i == 0: model.Add(y_vars[r.id] == f_min_y) 
                            else: model.Add(y_vars[left_rooms[i-1].id] + h_vars[left_rooms[i-1].id] == y_vars[r.id]) 

                    for i, r in enumerate(right_rooms):
                        model.Add(x_vars[r.id] == x_vars[f_spine.id] + w_vars[f_spine.id])
                        room_sides[r.id] = 'right'

                    if is_bottom:
                        for i in range(len(right_rooms)-1, -1, -1):
                            r = right_rooms[i]
                            if i == len(right_rooms) - 1: model.Add(y_vars[r.id] + h_vars[r.id] == f_max_y)
                            else: model.Add(y_vars[r.id] + h_vars[r.id] == y_vars[right_rooms[i+1].id])
                    else:
                        for i in range(len(right_rooms)):
                            r = right_rooms[i]
                            if i == 0: model.Add(y_vars[r.id] == f_min_y)
                            else: model.Add(y_vars[right_rooms[i-1].id] + h_vars[right_rooms[i-1].id] == y_vars[r.id])

                    attached_baths = [r for r in f_rooms if r.type == 'bathroom' and r.attached_to]
                    for bath in attached_baths:
                        target = next((tr for tr in f_rooms if tr.name == bath.attached_to or (bath.attached_to and bath.attached_to in tr.name)), None)
                        if target:
                            t_side = room_sides.get(target.id, 'left')
                            if t_side == 'left': model.Add(x_vars[bath.id] + w_vars[bath.id] == x_vars[target.id])
                            else: model.Add(x_vars[bath.id] == x_vars[target.id] + w_vars[target.id])
                            model.Add(y_vars[bath.id] >= y_vars[target.id])
                            model.Add(y_vars[bath.id] + h_vars[bath.id] <= y_vars[target.id] + h_vars[target.id])

                elif plan.apt_layout == 'Clustered':
                    side = flat_side_map[f_id]
                    
                    top_rooms, bottom_rooms = [], []
                    for i, r in enumerate(core_rooms):
                        if i % 2 == 0: top_rooms.append(r)
                        else: bottom_rooms.append(r)

                    if f_hall and f_hall.id != f_spine.id:
                        if f_hall in top_rooms:
                            top_rooms.remove(f_hall)
                            top_rooms.insert(0, f_hall)
                        if f_hall in bottom_rooms:
                            bottom_rooms.remove(f_hall)
                            bottom_rooms.insert(0, f_hall)

                    top_baths = [r for r in top_rooms if r.type == 'bathroom']
                    for b in top_baths:
                        top_rooms.remove(b)
                        top_rooms.append(b)

                    bottom_baths = [r for r in bottom_rooms if r.type == 'bathroom']
                    for b in bottom_baths:
                        bottom_rooms.remove(b)
                        bottom_rooms.append(b)

                    if side == 'left':
                        if main_corridor_id:
                            model.Add(x_vars[f_spine.id] + w_vars[f_spine.id] == x_vars[main_corridor_id])
                        if f_passage:
                            model.Add(x_vars[f_spine.id] == f_min_x) 

                        for i, r in enumerate(top_rooms):
                            model.Add(y_vars[r.id] + h_vars[r.id] == y_vars[f_spine.id])
                            room_sides[r.id] = 'top'
                            if main_corridor_id:
                                if i == 0: model.Add(x_vars[r.id] + w_vars[r.id] == x_vars[main_corridor_id])
                                else: model.Add(x_vars[r.id] + w_vars[r.id] == x_vars[top_rooms[i-1].id])

                        for i, r in enumerate(bottom_rooms):
                            model.Add(y_vars[r.id] == y_vars[f_spine.id] + h_vars[f_spine.id])
                            room_sides[r.id] = 'bottom'
                            if main_corridor_id:
                                if i == 0: model.Add(x_vars[r.id] + w_vars[r.id] == x_vars[main_corridor_id])
                                else: model.Add(x_vars[r.id] + w_vars[r.id] == x_vars[bottom_rooms[i-1].id])
                    
                    else: # side == 'right'
                        if main_corridor_id:
                            model.Add(x_vars[f_spine.id] == x_vars[main_corridor_id] + w_vars[main_corridor_id])
                        if f_passage:
                            model.Add(x_vars[f_spine.id] + w_vars[f_spine.id] == f_max_x)

                        for i, r in enumerate(top_rooms):
                            model.Add(y_vars[r.id] + h_vars[r.id] == y_vars[f_spine.id])
                            room_sides[r.id] = 'top'
                            if main_corridor_id:
                                if i == 0: model.Add(x_vars[r.id] == x_vars[main_corridor_id] + w_vars[main_corridor_id])
                                else: model.Add(x_vars[r.id] == x_vars[top_rooms[i-1].id] + w_vars[top_rooms[i-1].id])

                        for i, r in enumerate(bottom_rooms):
                            model.Add(y_vars[r.id] == y_vars[f_spine.id] + h_vars[f_spine.id])
                            room_sides[r.id] = 'bottom'
                            if main_corridor_id:
                                if i == 0: model.Add(x_vars[r.id] == x_vars[main_corridor_id] + w_vars[main_corridor_id])
                                else: model.Add(x_vars[r.id] == x_vars[bottom_rooms[i-1].id] + w_vars[bottom_rooms[i-1].id])

                    # ---------------------------------------------------------
                    # 🟢 THE FIX: Push attached bathrooms away from corridor walls
                    # ---------------------------------------------------------
                    attached_baths = [r for r in f_rooms if r.type == 'bathroom' and r.attached_to]
                    for bath in attached_baths:
                        target = next((tr for tr in f_rooms if tr.name == bath.attached_to or (bath.attached_to and bath.attached_to in tr.name)), None)
                        if target:
                            t_side = room_sides.get(target.id, 'top')
                            if t_side == 'top':
                                model.Add(y_vars[bath.id] + h_vars[bath.id] == y_vars[target.id])
                            else:
                                model.Add(y_vars[bath.id] == y_vars[target.id] + h_vars[target.id])
                            
                            model.Add(y_vars[bath.id] >= y_vars[target.id])
                            model.Add(y_vars[bath.id] + h_vars[bath.id] <= y_vars[target.id] + h_vars[target.id])
                            
                            # Lock strictly to far outer edges instead of sliding horizontally near hallway
                            if side == 'left':
                                model.Add(x_vars[bath.id] == x_vars[target.id])
                            else:
                                model.Add(x_vars[bath.id] + w_vars[bath.id] == x_vars[target.id] + w_vars[target.id])

            flat_blocks.append({'type': 'flat', 'id': f_id, 'min_x': f_min_x, 'max_x': f_max_x, 'min_y': f_min_y, 'max_y': f_max_y, 'spine': f_spine})

        # MACRO SEQUENCING
        if main_corridor_id:
            random.shuffle(flat_blocks)
            sequence_items = []
            
            if plan.apt_layout == 'Single Line':
                mid_idx = len(flat_blocks) // 2
                for i, fb in enumerate(flat_blocks):
                    if apt_stair_pos == 'edge' and edge_choice == 'left' and i == 0 and stair_room and stair_room.placement != 'outside':
                        sequence_items.append({'type': 'stair', 'id': stair_room.id, 'min_x': x_vars[stair_room.id], 'max_x': x_vars[stair_room.id] + w_vars[stair_room.id]})
                    if apt_stair_pos == 'middle' and i == mid_idx and stair_room and stair_room.placement != 'outside':
                        sequence_items.append({'type': 'stair', 'id': stair_room.id, 'min_x': x_vars[stair_room.id], 'max_x': x_vars[stair_room.id] + w_vars[stair_room.id]})
                        
                    sequence_items.append({'type': 'flat', 'id': fb['id'], 'min_x': fb['min_x'], 'max_x': fb['max_x']})

                    if apt_stair_pos == 'edge' and edge_choice == 'right' and i == len(flat_blocks) - 1 and stair_room and stair_room.placement != 'outside':
                        sequence_items.append({'type': 'stair', 'id': stair_room.id, 'min_x': x_vars[stair_room.id], 'max_x': x_vars[stair_room.id] + w_vars[stair_room.id]})
                        
                if stair_2_room and stair_2_room.placement != 'outside':
                    sequence_items.append({'type': 'stair', 'id': stair_2_room.id, 'min_x': x_vars[stair_2_room.id], 'max_x': x_vars[stair_2_room.id] + w_vars[stair_2_room.id]})

                for i in range(len(sequence_items) - 1):
                    model.Add(sequence_items[i]['max_x'] == sequence_items[i+1]['min_x'])

                model.Add(x_vars[main_corridor_id] <= sequence_items[0]['min_x'])
                model.Add(x_vars[main_corridor_id] + w_vars[main_corridor_id] >= sequence_items[-1]['max_x'])

                if is_bottom:
                    for item in sequence_items:
                        if item['type'] == 'flat':
                            f_rooms = [r for r in structural_rooms if r.parent_id == item['id']]
                            f_max_y_var = next((r['max_y'] for r in flat_blocks if r['id'] == item['id']), None)
                            if f_max_y_var is None:
                                f_max_y_var = model.NewIntVar(0, max_boundary, f'f_max_y_{item["id"]}_temp')
                                model.AddMaxEquality(f_max_y_var, [y_vars[r.id] + (h_vars[r.id] if not isinstance(h_vars[r.id], cp_model.IntVar) else h_vars[r.id]) for r in f_rooms])
                            model.Add(f_max_y_var == y_vars[main_corridor_id])
                        else:
                            model.Add(y_vars[item['id']] + h_vars[item['id']] == y_vars[main_corridor_id])
                else:
                    for item in sequence_items:
                        if item['type'] == 'flat':
                            f_rooms = [r for r in structural_rooms if r.parent_id == item['id']]
                            f_min_y_var = next((r['min_y'] for r in flat_blocks if r['id'] == item['id']), None)
                            if f_min_y_var is None:
                                f_min_y_var = model.NewIntVar(0, max_boundary, f'f_min_y_{item["id"]}_temp')
                                model.AddMinEquality(f_min_y_var, [y_vars[r.id] for r in f_rooms])
                            model.Add(f_min_y_var == y_vars[main_corridor_id] + h_vars[main_corridor_id])
                        else:
                            model.Add(y_vars[item['id']] == y_vars[main_corridor_id] + h_vars[main_corridor_id])

            elif plan.apt_layout == 'Clustered':
                left_blocks = [b for b in flat_blocks if flat_side_map[b['id']] == 'left']
                right_blocks = [b for b in flat_blocks if flat_side_map[b['id']] == 'right']

                if stair_room and stair_room.placement != 'outside':
                    stair_item = {'type': 'stair', 'id': stair_room.id}
                    if apt_stair_pos == 'middle':
                        left_blocks.insert(len(left_blocks) // 2, stair_item)
                    elif apt_stair_pos == 'edge':
                        if edge_choice == 'left':
                            model.Add(y_vars[stair_room.id] + h_vars[stair_room.id] == y_vars[main_corridor_id])
                            model.Add(x_vars[stair_room.id] == x_vars[main_corridor_id])
                        else:
                            model.Add(y_vars[stair_room.id] == y_vars[main_corridor_id] + h_vars[main_corridor_id])
                            model.Add(x_vars[stair_room.id] == x_vars[main_corridor_id])

                for i, item in enumerate(left_blocks):
                    if item.get('type') == 'stair':
                        model.Add(x_vars[item['id']] + w_vars[item['id']] == x_vars[main_corridor_id])
                        curr_y = y_vars[item['id']]
                    else:
                        model.Add(item['max_x'] == x_vars[main_corridor_id])
                        if item['spine']: model.Add(x_vars[item['spine'].id] + w_vars[item['spine'].id] == x_vars[main_corridor_id])
                        curr_y = item['min_y']

                    if i == 0: model.Add(curr_y == y_vars[main_corridor_id])
                    else:
                        prev_item = left_blocks[i-1]
                        prev_max_y = prev_item['max_y'] if prev_item.get('type') == 'flat' else y_vars[prev_item['id']] + h_vars[prev_item['id']]
                        model.Add(curr_y == prev_max_y)

                for i, item in enumerate(right_blocks):
                    if item.get('type') == 'stair':
                        model.Add(x_vars[item['id']] == x_vars[main_corridor_id] + w_vars[main_corridor_id])
                        curr_y = y_vars[item['id']]
                    else:
                        model.Add(item['min_x'] == x_vars[main_corridor_id] + w_vars[main_corridor_id])
                        if item['spine']: model.Add(x_vars[item['spine'].id] == x_vars[main_corridor_id] + w_vars[main_corridor_id])
                        curr_y = item['min_y']

                    if i == 0: model.Add(curr_y == y_vars[main_corridor_id])
                    else:
                        prev_item = right_blocks[i-1]
                        prev_max_y = prev_item['max_y'] if prev_item.get('type') == 'flat' else y_vars[prev_item['id']] + h_vars[prev_item['id']]
                        model.Add(curr_y == prev_max_y)

                left_max_y = left_blocks[-1]['max_y'] if left_blocks and left_blocks[-1].get('type') == 'flat' else y_vars[left_blocks[-1]['id']] + h_vars[left_blocks[-1]['id']] if left_blocks else y_vars[main_corridor_id]
                right_max_y = right_blocks[-1]['max_y'] if right_blocks and right_blocks[-1].get('type') == 'flat' else y_vars[right_blocks[-1]['id']] + h_vars[right_blocks[-1]['id']] if right_blocks else y_vars[main_corridor_id]

                corridor_max = model.NewIntVar(0, max_boundary, 'corridor_max')
                model.AddMaxEquality(corridor_max, [left_max_y, right_max_y])
                model.Add(y_vars[main_corridor_id] + h_vars[main_corridor_id] == corridor_max)

            if stair_room and stair_room.placement == 'outside':
                enforce_adjacency(stair_room.id, main_corridor_id)
                on_l, on_r, on_t, on_b = model.NewBoolVar('sl'), model.NewBoolVar('sr'), model.NewBoolVar('st'), model.NewBoolVar('sb')
                model.Add(x_vars[stair_room.id] == min_x).OnlyEnforceIf(on_l)
                model.Add(x_vars[stair_room.id] + w_vars[stair_room.id] == max_x).OnlyEnforceIf(on_r)
                model.Add(y_vars[stair_room.id] == min_y).OnlyEnforceIf(on_t)
                model.Add(y_vars[stair_room.id] + h_vars[stair_room.id] == max_y).OnlyEnforceIf(on_b)
                model.AddBoolOr([on_l, on_r, on_t, on_b])

    elif plan.typology == 'Commercial':
        chambers = [r for r in structural_rooms if r.type == 'chamber']
        if plan.commercial_layout == 'Single Line' and len(chambers) > 0:
            base_y = y_vars[chambers[0].id]
            for i in range(len(chambers)):
                model.Add(y_vars[chambers[i].id] == base_y)
                if i > 0: enforce_adjacency(chambers[i-1].id, chambers[i].id)
            if stair_room and plan.commercial_stair == 'Edge':
                enforce_adjacency(stair_room.id, chambers[0].id)
                model.Add(y_vars[stair_room.id] == base_y)
        elif plan.commercial_layout == 'Clustered' and passage_id:
            for chamber in chambers: enforce_adjacency(chamber.id, passage_id)
            if stair_room: enforce_adjacency(stair_room.id, passage_id)

    for room in structural_rooms:
        if room.type == 'passage' and plan.typology in ['Private Residence', 'Commercial']:
            if not (plan.typology == 'Commercial' and plan.commercial_layout == 'Single Line'):
                model.Add(y_vars[room.id] == min_y)
                model.Add(y_vars[room.id] + h_vars[room.id] == max_y)

    sum_x = sum(x_vars[room.id] for room in structural_rooms)
    gravity_pull = sum_x
    
    if plan.typology == 'Apartment Complex':
        for room in structural_rooms:
            if room.parent_id and room.parent_id.startswith('flat_'):
                if plan.apt_layout == 'Single Line':
                    if plan.apt_front_entrance == 'Yes': 
                        gravity_pull -= y_vars[room.id] * 5
                        if room.type == 'flat_hall': gravity_pull -= y_vars[room.id] * 20
                        if room.type == 'kitchen': gravity_pull -= y_vars[room.id] * int(ai_kitchen * 40) 
                        if room.type == 'bathroom': gravity_pull += y_vars[room.id] * int(ai_bath * 40) 
                    else: 
                        gravity_pull += y_vars[room.id] * 5
                        if room.type == 'flat_hall': gravity_pull += y_vars[room.id] * 20
                        if room.type == 'kitchen': gravity_pull += y_vars[room.id] * int(ai_kitchen * 40)
                        if room.type == 'bathroom': gravity_pull -= y_vars[room.id] * int(ai_bath * 40) 
                elif plan.apt_layout == 'Clustered':
                    side = flat_side_map.get(room.parent_id, 'left')
                    if side == 'left': gravity_pull -= x_vars[room.id] * 10
                    else: gravity_pull += x_vars[room.id] * 10
    else:
        gravity_pull += sum(y_vars[room.id] for room in structural_rooms)

    model.Minimize(((max_x - min_x) + (max_y - min_y)) * 10000 + gravity_pull)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 120.0
    solver.parameters.random_seed = random.randint(1, 10000)
    
    status = solver.Solve(model)

    if status in [cp_model.OPTIMAL, cp_model.FEASIBLE]:
        raw_rooms = []
        min_x_val, min_y_val = float('inf'), float('inf')
        max_x_val, max_y_val = float('-inf'), float('-inf')

        for room in plan.rooms:
            rx = solver.Value(x_vars[room.id]) / scale_factor
            ry = solver.Value(y_vars[room.id]) / scale_factor
            
            w_val = w_vars[room.id] if isinstance(w_vars[room.id], int) else w_vars[room.id]
            h_val = h_vars[room.id] if isinstance(h_vars[room.id], int) else h_vars[room.id]
            rw = solver.Value(w_val) / scale_factor if isinstance(w_val, cp_model.IntVar) else w_val / scale_factor
            rh = solver.Value(h_val) / scale_factor if isinstance(h_val, cp_model.IntVar) else h_val / scale_factor

            raw_rooms.append({"id": room.id, "name": room.name, "w": rw, "h": rh, "x": rx, "y": ry})

            if rx < min_x_val: min_x_val = rx
            if ry < min_y_val: min_y_val = ry
            if rx + rw > max_x_val: max_x_val = rx + rw
            if ry + rh > max_y_val: max_y_val = rh + rh

        try:
            doc = ezdxf.new('R2010')
            msp = doc.modelspace()
            for r in raw_rooms:
                px, py, pw, ph = r["x"], r["y"], r["w"], r["h"]
                msp.add_lwpolyline([(px, py), (px + pw, py), (px + pw, py + ph), (px, py + ph)], close=True)
                msp.add_text(r["name"].upper(), dxfattribs={'height': max(1.0, ph / 5)}).set_placement((px + pw / 4, py + ph / 2))
            os.makedirs("output_blueprints", exist_ok=True)
            doc.saveas("output_blueprints/dynamic_layout.dxf")
        except Exception:
            pass

        PIXELS_PER_UNIT = 10
        offset_x = (800 / 2) - (((max_x_val - min_x_val) * PIXELS_PER_UNIT) / 2)
        offset_y = (600 / 2) - (((max_y_val - min_y_val) * PIXELS_PER_UNIT) / 2)

        returned_rooms = []
        for r in raw_rooms:
            returned_rooms.append({
                "id": r["id"], "name": r["name"], "widthFt": r["w"], "heightFt": r["h"],
                "x": ((r["x"] - min_x_val) * PIXELS_PER_UNIT) + offset_x,
                "y": ((r["y"] - min_y_val) * PIXELS_PER_UNIT) + offset_y
            })

        return {"success": True, "rooms": returned_rooms}
    else:
        raise HTTPException(status_code=500, detail="Solver timed out. Try simpler dimensions.")