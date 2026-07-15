"""
Exam seating allotment engine — Google OR-Tools CP-SAT.

Maps Hallora constraints from constraints.md into CP-SAT:
  C06  capacity gate (preprocess)
  C09  one student per seat
  C10  each student exactly one seat
  C12  course grouping by course_code (adjacency key)
  C15–C17 horizontal same-course adjacency (hard, or soft under override C21)
  C18/C19 vertical same-course NOT hard-forbidden (matches legacy)
  C22  all eligible students must be seated
  C23  skip unused venues in output

Attendance-friendly extras (soft + post-process):
  Prefer same department stacked vertically (one behind another).
  Within each department/course seat set, place roll numbers sequentially
  down columns (column-major), not randomly.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence, Tuple

from ortools.sat.python import cp_model

from models import (
    AdjacencyViolation,
    SeatOccupant,
    SeatingRequest,
    SeatingResponse,
    Student,
    Venue,
    VenueSeating,
)

# Soft objective weights (explainable, intentionally simple for the demo).
# Seat venue-order preference packs preferred halls first but still opens more
# when adjacency needs spillover (e.g. one large same-course cohort).
# Violations dominate when override is active.
WEIGHT_SEAT_VENUE_ORD = 3
WEIGHT_VENUE_OPEN = 50
WEIGHT_ADJ_VIOLATION = 10_000
WEIGHT_VERT_DEPT_MATCH = 8

SOLVER_TIME_LIMIT_SECONDS = 30.0


@dataclass(frozen=True)
class Seat:
    """One physical seat slot in the global seat pool."""

    index: int
    venue_id: str
    venue_name: str
    venue_ord: int
    row: int
    col: int
    seat_index: int  # slot s within the bench (0 .. bench_config[col]-1)


def _build_seats(venues: Sequence[Venue]) -> List[Seat]:
    seats: List[Seat] = []
    idx = 0
    for v_ord, venue in enumerate(venues):
        for r in range(venue.benches_row):
            for c in range(venue.benches_col):
                for s in range(venue.bench_config[c]):
                    seats.append(
                        Seat(
                            index=idx,
                            venue_id=venue.venue_id,
                            venue_name=venue.venue_name,
                            venue_ord=v_ord,
                            row=r,
                            col=c,
                            seat_index=s,
                        )
                    )
                    idx += 1
    return seats


def _adjacent_pairs(seats: Sequence[Seat], venues: Sequence[Venue]) -> List[Tuple[int, int]]:
    """
    Horizontal adjacency ONLY, within a single venue (C15–C17, C41).

    Rule 1: same bench consecutive slots (s-1, s)
    Rule 2/3: last slot of bench c vs first slot of bench c+1, same row
              (edge-adjacent across neighboring benches)
    """
    by_key: Dict[Tuple[str, int, int, int], int] = {
        (s.venue_id, s.row, s.col, s.seat_index): s.index for s in seats
    }
    venue_by_id = {v.venue_id: v for v in venues}
    pairs: List[Tuple[int, int]] = []
    seen: set[Tuple[int, int]] = set()

    def add_pair(a: int, b: int) -> None:
        edge = (min(a, b), max(a, b))
        if edge not in seen:
            seen.add(edge)
            pairs.append(edge)

    for seat in seats:
        venue = venue_by_id[seat.venue_id]
        # Rule 1: same-bench adjacent slot (s-1, s)
        if seat.seat_index > 0:
            left = by_key.get(
                (seat.venue_id, seat.row, seat.col, seat.seat_index - 1)
            )
            if left is not None:
                add_pair(left, seat.index)

        # Rule 2/3: edge across neighboring benches, same row
        # Last slot of col c is adjacent to first slot of col c+1
        last_slot = venue.bench_config[seat.col] - 1
        if seat.seat_index == last_slot and seat.col + 1 < venue.benches_col:
            right = by_key.get((seat.venue_id, seat.row, seat.col + 1, 0))
            if right is not None:
                add_pair(seat.index, right)

    return pairs


def _vertical_pairs(seats: Sequence[Seat]) -> List[Tuple[int, int]]:
    """
    Immediate front/back neighbors in the same seat column.

    Same venue, same bench column, same slot on the bench, consecutive rows:
    (row r, row r+1). Returned as (front/upper, behind/lower).
    """
    by_key: Dict[Tuple[str, int, int, int], int] = {
        (s.venue_id, s.row, s.col, s.seat_index): s.index for s in seats
    }
    pairs: List[Tuple[int, int]] = []
    for seat in seats:
        behind = by_key.get(
            (seat.venue_id, seat.row + 1, seat.col, seat.seat_index)
        )
        if behind is not None:
            pairs.append((seat.index, behind))
    return pairs


def _attendance_reorder(
    students: Sequence[Student],
    seats: Sequence[Seat],
    assignment: Dict[int, int],
) -> Dict[int, int]:
    """
    Within each (department, course) group, reassign roll-sorted students to that
    group's seats in column-major order so roll numbers run sequentially down columns.

    Preserves which seats belong to which course/department, so hard horizontal
    adjacency from CP-SAT is unchanged — only who sits where inside the group.
    """
    groups: Dict[Tuple[str, str], List[Tuple[int, int]]] = defaultdict(list)
    for stu_i, seat_i in assignment.items():
        stu = students[stu_i]
        groups[(stu.department, stu.course_code)].append((stu_i, seat_i))

    ordered: Dict[int, int] = {}
    for pairs in groups.values():
        stu_indices = [stu_i for stu_i, _ in pairs]
        seat_indices = [seat_i for _, seat_i in pairs]
        stu_indices.sort(key=lambda i: students[i].regn_no)
        # Column-major: fill down a seat column, then next column (attendance walk)
        seat_indices.sort(
            key=lambda j: (
                seats[j].venue_ord,
                seats[j].col,
                seats[j].seat_index,
                seats[j].row,
            )
        )
        for stu_i, seat_i in zip(stu_indices, seat_indices):
            ordered[stu_i] = seat_i
    return ordered


def _status_name(status: int) -> str:
    if status == cp_model.OPTIMAL:
        return "OPTIMAL"
    if status == cp_model.FEASIBLE:
        return "FEASIBLE"
    return "INFEASIBLE"


def _format_venues(
    venues: Sequence[Venue],
    seats: Sequence[Seat],
    students: Sequence[Student],
    assignment: Dict[int, int],
) -> List[VenueSeating]:
    """Build legacy seating_arrangement grids; skip venues with zero seated students (C23)."""
    # seat_index -> student
    seat_to_student: Dict[int, Student] = {
        seat_i: students[stu_i] for stu_i, seat_i in assignment.items()
    }

    used: List[VenueSeating] = []
    for venue in venues:
        venue_seats = [s for s in seats if s.venue_id == venue.venue_id]
        if not any(s.index in seat_to_student for s in venue_seats):
            continue

        arrangement: List[List] = []
        for r in range(venue.benches_row):
            row_cells: List = []
            for c in range(venue.benches_col):
                slots: List[Optional[SeatOccupant]] = []
                any_filled = False
                for s in range(venue.bench_config[c]):
                    # Find the seat object for (r, c, s)
                    match = next(
                        (
                            seat
                            for seat in venue_seats
                            if seat.row == r and seat.col == c and seat.seat_index == s
                        ),
                        None,
                    )
                    if match is not None and match.index in seat_to_student:
                        stu = seat_to_student[match.index]
                        slots.append(
                            SeatOccupant(regn_no=stu.regn_no, course=stu.course_code)
                        )
                        any_filled = True
                    else:
                        slots.append(None)
                # C33: fully empty bench → "Empty" string
                row_cells.append(slots if any_filled else "Empty")
            arrangement.append(row_cells)

        used.append(
            VenueSeating(
                venue_id=venue.venue_id,
                venue_name=venue.venue_name,
                bench_config=list(venue.bench_config),
                seating_arrangement=arrangement,
            )
        )
    return used


def _extract_violations(
    seats: Sequence[Seat],
    students: Sequence[Student],
    assignment: Dict[int, int],
    courses: Sequence[str],
    adj_pairs: Sequence[Tuple[int, int]],
    soft_viol_vars: Dict[Tuple[str, int, int], cp_model.IntVar],
    solver: cp_model.CpSolver,
) -> List[AdjacencyViolation]:
    """Report seat endpoints of soft adjacency conflicts that fired."""
    if not soft_viol_vars:
        return []

    seat_course: Dict[int, str] = {}
    for stu_i, seat_i in assignment.items():
        seat_course[seat_i] = students[stu_i].course_code

    violations: List[AdjacencyViolation] = []
    for (course, a, b), var in soft_viol_vars.items():
        if solver.Value(var) != 1:
            continue
        # Both ends share this course (by construction of the soft constraint)
        for seat_i in (a, b):
            seat = seats[seat_i]
            if seat_course.get(seat_i) == course:
                violations.append(
                    AdjacencyViolation(
                        venue_id=seat.venue_id,
                        row=seat.row,
                        col=seat.col,
                        seat_index=seat.seat_index,
                        course_code=course,
                    )
                )
    # Stable, unique rows for UI flagging
    dedup = {(v.venue_id, v.row, v.col, v.seat_index, v.course_code): v for v in violations}
    return list(dedup.values())


def _solve_cpsat(
    students: Sequence[Student],
    seats: Sequence[Seat],
    venues: Sequence[Venue],
    adj_pairs: Sequence[Tuple[int, int]],
    vert_pairs: Sequence[Tuple[int, int]],
    *,
    soft_adjacency: bool,
    time_limit: float,
) -> Tuple[int, Optional[Dict[int, int]], List[AdjacencyViolation], float]:
    """
    Build and solve one CP-SAT model.

    Returns (status, assignment stu_i→seat_i, violations, wall_time).
    """
    model = cp_model.CpModel()
    n_stu = len(students)
    n_seat = len(seats)

    courses = sorted({s.course_code for s in students})
    course_to_students: Dict[str, List[int]] = defaultdict(list)
    for i, stu in enumerate(students):
        course_to_students[stu.course_code].append(i)

    departments = sorted({s.department for s in students})
    dept_to_students: Dict[str, List[int]] = defaultdict(list)
    for i, stu in enumerate(students):
        dept_to_students[stu.department].append(i)

    # --- Decision vars: x[student, seat] ---
    x: Dict[Tuple[int, int], cp_model.IntVar] = {}
    for i in range(n_stu):
        for j in range(n_seat):
            x[i, j] = model.NewBoolVar(f"x_s{i}_k{j}")

    # C10 / C22: each student assigned to exactly one seat
    for i in range(n_stu):
        model.AddExactlyOne(x[i, j] for j in range(n_seat))

    # C09: each seat holds at most one student
    for j in range(n_seat):
        model.AddAtMostOne(x[i, j] for i in range(n_stu))

    # Course-level occupancy indicators y[course, seat]
    # Efficient adjacency modeling (avoids per-student-pair blow-up).
    y: Dict[Tuple[str, int], cp_model.IntVar] = {}
    for course in courses:
        members = course_to_students[course]
        for j in range(n_seat):
            y[course, j] = model.NewBoolVar(f"y_{course}_k{j}")
            # y == 1 iff some student of this course sits here
            # (at most one student per seat ⇒ equality with the sum of binaries)
            model.Add(sum(x[i, j] for i in members) == y[course, j])

    # Department occupancy for vertical attendance stacking (optional soft)
    use_vert_soft = n_stu * n_seat <= 120_000
    z: Dict[Tuple[str, int], cp_model.IntVar] = {}
    if use_vert_soft:
        for dept in departments:
            members = dept_to_students[dept]
            for j in range(n_seat):
                z[dept, j] = model.NewBoolVar(f"z_{dept}_k{j}")
                model.Add(sum(x[i, j] for i in members) == z[dept, j])

    # C15–C17 adjacency on course indicators
    soft_viol: Dict[Tuple[str, int, int], cp_model.IntVar] = {}
    for a, b in adj_pairs:
        for course in courses:
            if soft_adjacency:
                # Soft: allow both seats same course; count each breach
                v = model.NewBoolVar(f"viol_{course}_{a}_{b}")
                soft_viol[course, a, b] = v
                # y_a + y_b <= 1 + v  ⇒  if both occupied by course, v must be 1
                model.Add(y[course, a] + y[course, b] <= 1 + v)
            else:
                # Hard: forbid same course on horizontally adjacent seats
                # Rule 1/2/3 encoded via precomputed adj_pairs
                model.AddAtMostOne(y[course, a], y[course, b])

    # Soft: same department one behind another (vertical pairs) for easy attendance
    vert_match: List[cp_model.IntVar] = []
    if use_vert_soft:
        for a, b in vert_pairs:
            for dept in departments:
                both = model.NewBoolVar(f"vert_{dept}_{a}_{b}")
                model.AddBoolAnd([z[dept, a], z[dept, b]]).OnlyEnforceIf(both)
                model.AddBoolOr(
                    [z[dept, a].Not(), z[dept, b].Not()]
                ).OnlyEnforceIf(both.Not())
                vert_match.append(both)

    # Soft: prefer earlier venues in fill order (venue_ord), then fewer opened halls.
    # Graduated open-cost (ord+1) means hall 2 opens readily when hall 1 cannot
    # absorb more same-course students under adjacency — unlike a flat "min venues"
    # objective that burns the time budget trying to force a single hall.
    venue_ids = [v.venue_id for v in venues]
    seats_by_venue: Dict[str, List[int]] = defaultdict(list)
    venue_ord_by_id = {v.venue_id: i for i, v in enumerate(venues)}
    for seat in seats:
        seats_by_venue[seat.venue_id].append(seat.index)

    venue_used: Dict[str, cp_model.IntVar] = {}
    for vid in venue_ids:
        vu = model.NewBoolVar(f"venue_used_{vid}")
        venue_used[vid] = vu
        for j in seats_by_venue[vid]:
            occupied = model.NewBoolVar(f"occ_{vid}_k{j}")
            model.Add(sum(x[i, j] for i in range(n_stu)) == occupied)
            model.AddImplication(occupied, vu)

    obj_terms = []
    # Prefer seats in preferred (low venue_ord) halls
    for i in range(n_stu):
        for j in range(n_seat):
            ord_ = seats[j].venue_ord
            if ord_ > 0:
                obj_terms.append(WEIGHT_SEAT_VENUE_ORD * ord_ * x[i, j])
    # Graduated open cost: later halls cost more to open, but opening is allowed
    for vid in venue_ids:
        ord_ = venue_ord_by_id[vid]
        obj_terms.append(WEIGHT_VENUE_OPEN * (ord_ + 1) * venue_used[vid])
    if soft_adjacency:
        obj_terms.extend(WEIGHT_ADJ_VIOLATION * v for v in soft_viol.values())
    if use_vert_soft:
        obj_terms.extend(-WEIGHT_VERT_DEPT_MATCH * m for m in vert_match)
    model.Minimize(sum(obj_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit
    solver.parameters.num_search_workers = 8

    status = solver.Solve(model)
    wall = solver.WallTime()

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return status, None, [], wall

    assignment: Dict[int, int] = {}
    for i in range(n_stu):
        for j in range(n_seat):
            if solver.Value(x[i, j]) == 1:
                assignment[i] = j
                break

    # Roll numbers sequential down columns within each department/course seat set
    assignment = _attendance_reorder(students, seats, assignment)

    violations = _extract_violations(
        seats, students, assignment, courses, adj_pairs, soft_viol, solver
    )
    return status, assignment, violations, wall


def _sort_venues_by_capacity(
    venues: Sequence[Venue],
    fill_order: str,
) -> List[Venue]:
    """C25: high_to_low = larger halls first; low_to_high = smaller first."""
    reverse = fill_order != "low_to_high"
    return sorted(venues, key=lambda v: (v.capacity, v.venue_id), reverse=reverse)


def _adjacency_safe_capacity(venue: Venue) -> int:
    """
    Upper bound on seats usable by a single course under hard horizontal adjacency.
    Each row is a path of Σ bench_config seats → max independent set = ceil(n/2).
    """
    seats_per_row = sum(venue.bench_config)
    return venue.benches_row * ((seats_per_row + 1) // 2)


def _min_venue_cover(
    venues: Sequence[Venue],
    n_students: int,
    fill_order: str,
) -> List[Venue]:
    """
    Choose the fewest halls that can seat n_students under worst-case
    (single-course) adjacency-safe capacity. Prefer largest halls so count is minimal,
    then re-order the chosen set by the user's fill_order preference.
    """
    if not venues or n_students <= 0:
        return []

    by_safe = sorted(
        venues,
        key=lambda v: (_adjacency_safe_capacity(v), v.capacity, v.venue_id),
        reverse=True,
    )
    chosen: List[Venue] = []
    safe_sum = 0
    for v in by_safe:
        chosen.append(v)
        safe_sum += _adjacency_safe_capacity(v)
        if safe_sum >= n_students:
            break

    if safe_sum < n_students:
        chosen = list(venues)

    return _sort_venues_by_capacity(chosen, fill_order)


def _horizontal_neighbors(
    venue: Venue, row: int, col: int, seat_index: int
) -> List[Tuple[int, int, int]]:
    """Left/right neighbors for C15–C17 on the same row."""
    neighbors: List[Tuple[int, int, int]] = []
    if seat_index > 0:
        neighbors.append((row, col, seat_index - 1))
    if seat_index + 1 < venue.bench_config[col]:
        neighbors.append((row, col, seat_index + 1))
    if seat_index == 0 and col > 0:
        left_col = col - 1
        neighbors.append((row, left_col, venue.bench_config[left_col] - 1))
    last = venue.bench_config[col] - 1
    if seat_index == last and col + 1 < venue.benches_col:
        neighbors.append((row, col + 1, 0))
    return neighbors


def _column_major_slots(venue: Venue) -> List[Tuple[int, int, int]]:
    """C14: traverse bench column → slot → row (fill down a stack, then next)."""
    slots: List[Tuple[int, int, int]] = []
    for c in range(venue.benches_col):
        for s in range(venue.bench_config[c]):
            for r in range(venue.benches_row):
                slots.append((r, c, s))
    return slots


def _greedy_fill_venue(
    venue: Venue,
    remaining: Sequence[Student],
    *,
    enforce_adjacency: bool,
) -> Tuple[List[Student], VenueSeating, List[Student], List[AdjacencyViolation]]:
    """
    Hallora-style dense placer: walk seats column-major, place the earliest
    remaining student who does not create a same-course horizontal neighbor.

    A seat stays empty only when nobody left can sit there — packs each hall
    to true adjacency density (no random CP-SAT gaps).
    """
    grid: Dict[Tuple[int, int, int], Optional[Student]] = {
        (r, c, s): None
        for r in range(venue.benches_row)
        for c in range(venue.benches_col)
        for s in range(venue.bench_config[c])
    }
    leftover = list(remaining)
    placed: List[Student] = []
    violations: List[AdjacencyViolation] = []

    def course_at(pos: Tuple[int, int, int]) -> Optional[str]:
        stu = grid.get(pos)
        return stu.course_code if stu is not None else None

    def conflicts(course: str, r: int, c: int, s: int) -> bool:
        if not enforce_adjacency:
            return False
        for nr, nc, ns in _horizontal_neighbors(venue, r, c, s):
            other = course_at((nr, nc, ns))
            if other is not None and other == course:
                return True
        return False

    for r, c, s in _column_major_slots(venue):
        if not leftover:
            break
        pick_i = None
        for i, stu in enumerate(leftover):
            if not conflicts(stu.course_code, r, c, s):
                pick_i = i
                break
        if pick_i is None:
            continue
        stu = leftover.pop(pick_i)
        grid[(r, c, s)] = stu
        placed.append(stu)
        if not enforce_adjacency:
            for nr, nc, ns in _horizontal_neighbors(venue, r, c, s):
                other = course_at((nr, nc, ns))
                if other is not None and other == stu.course_code:
                    violations.append(
                        AdjacencyViolation(
                            venue_id=venue.venue_id,
                            row=r,
                            col=c,
                            seat_index=s,
                            course_code=stu.course_code,
                        )
                    )
                    break

    arrangement: List[List] = []
    for r in range(venue.benches_row):
        row_cells: List = []
        for c in range(venue.benches_col):
            slots: List[Optional[SeatOccupant]] = []
            any_filled = False
            for s in range(venue.bench_config[c]):
                stu = grid[(r, c, s)]
                if stu is None:
                    slots.append(None)
                else:
                    slots.append(
                        SeatOccupant(regn_no=stu.regn_no, course=stu.course_code)
                    )
                    any_filled = True
            row_cells.append(slots if any_filled else "Empty")
        arrangement.append(row_cells)

    seating = VenueSeating(
        venue_id=venue.venue_id,
        venue_name=venue.venue_name,
        bench_config=list(venue.bench_config),
        seating_arrangement=arrangement,
    )
    dedup = {
        (v.venue_id, v.row, v.col, v.seat_index, v.course_code): v for v in violations
    }
    return placed, seating, leftover, list(dedup.values())


def generate_seating(
    request: SeatingRequest,
    time_limit: float = SOLVER_TIME_LIMIT_SECONDS,
) -> SeatingResponse:
    """
    Minimum venues + dense Hallora greedy fill (C14–C17).

    CP-SAT soft packing left random gaps and spilled into extra halls;
    column-major greedy packs each opened hall to adjacency density, then stops.
    """
    _ = time_limit
    students = list(request.students)
    fill_order = request.venue_fill_order
    all_venues = list(request.venues)

    total_capacity = sum(v.capacity for v in all_venues)
    n_students = len(students)

    if total_capacity < n_students:
        return SeatingResponse(
            status="INFEASIBLE",
            adjacency_violations=[],
            venues_used=[],
            unseated_students=[s.regn_no for s in students],
            message=(
                f"Insufficient capacity: {total_capacity} seats for "
                f"{n_students} students (mirrors legacy sum(venue.capacity) gate)."
            ),
        )

    remaining = sorted(
        students,
        key=lambda s: (s.department, s.course_code, s.regn_no),
    )
    venues_used: List[VenueSeating] = []
    all_violations: List[AdjacencyViolation] = []
    used_soft = False

    order_label = (
        "largest->smallest" if fill_order == "high_to_low" else "smallest->largest"
    )

    pool = _min_venue_cover(all_venues, n_students, fill_order)
    pool_ids = {v.venue_id for v in pool}
    spillover = [
        v
        for v in _sort_venues_by_capacity(all_venues, "high_to_low")
        if v.venue_id not in pool_ids
    ]
    venue_queue = list(pool) + spillover

    for venue in venue_queue:
        if not remaining:
            break
        placed, seating, remaining, _ = _greedy_fill_venue(
            venue, remaining, enforce_adjacency=True
        )
        if placed:
            venues_used.append(seating)

    if remaining and request.allow_adjacent_override:
        used_soft = True
        open_ids = {v.venue_id for v in venues_used}
        refreshed: List[VenueSeating] = []
        for vs in venues_used:
            venue = next(v for v in all_venues if v.venue_id == vs.venue_id)
            seated_here: List[Student] = []
            for row in vs.seating_arrangement:
                for cell in row:
                    if cell == "Empty":
                        continue
                    for occ in cell:
                        if occ is None:
                            continue
                        dept = next(
                            (s.department for s in students if s.regn_no == occ.regn_no),
                            "",
                        )
                        seated_here.append(
                            Student(
                                regn_no=occ.regn_no,
                                course_code=occ.course,
                                department=dept,
                            )
                        )
            merged = seated_here + remaining
            _placed, seating, remaining, viols = _greedy_fill_venue(
                venue, merged, enforce_adjacency=False
            )
            refreshed.append(seating)
            all_violations.extend(viols)
        venues_used = refreshed

        for venue in venue_queue:
            if not remaining:
                break
            if venue.venue_id in open_ids:
                continue
            placed, seating, remaining, viols = _greedy_fill_venue(
                venue, remaining, enforce_adjacency=False
            )
            if placed:
                venues_used.append(seating)
                all_violations.extend(viols)

    if remaining:
        return SeatingResponse(
            status="INFEASIBLE",
            adjacency_violations=[],
            venues_used=venues_used,
            unseated_students=[s.regn_no for s in remaining],
            message=(
                f"Could not seat {len(remaining)} student(s) with minimum-venue packing "
                f"under horizontal same-course adjacency (fill order {order_label}). "
                + (
                    "Add more venues or enable allow_adjacent_override."
                    if not request.allow_adjacent_override
                    else "Even with adjacency relaxed, remaining students do not fit."
                )
            ),
            solve_time_seconds=0.0,
        )

    msg = (
        f"Seating found using minimum {len(venues_used)} venue(s) "
        f"(fill order {order_label}); hard horizontal adjacency respected; "
        "column-major fill with sequential rolls for attendance."
    )
    if used_soft:
        msg = (
            f"Seated using minimum {len(venues_used)} venue(s) "
            f"(fill order {order_label}) with soft adjacency "
            f"penalties ({len(all_violations)} flagged seat(s))."
        )

    return SeatingResponse(
        status="OPTIMAL",
        adjacency_violations=all_violations,
        venues_used=venues_used,
        unseated_students=[],
        message=msg,
        solve_time_seconds=0.0,
    )


if __name__ == "__main__":
    import json
    from pathlib import Path as _Path

    sample = _Path(__file__).with_name("sample_request.json")
    if sample.exists():
        payload = json.loads(sample.read_text(encoding="utf-8"))
        req = SeatingRequest.model_validate(payload)
        result = generate_seating(req)
        print(result.model_dump_json(indent=2))
    else:
        print("No sample_request.json found — start the API via uvicorn main:app")
