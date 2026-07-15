# Hallora Seating Algorithm — Analysis

> Source of truth: `src/pages/Allotment.jsx` `handleGenerate` (lines **454–799**).  
> Persistence: `backend/routes/seatingRoutes.js`, `backend/models/SeatingPlan.js`.  
> No code was changed for this document.

---

## 1. Algorithm class

| Attribute | Assessment |
|-----------|------------|
| Type | **Greedy constructive heuristic** (not ILP / CP / backtracking search) |
| Location | **Client-side** (browser) |
| Passes | Multi-pass by course group; optional residual override |
| Optimality | **No** proven optimum; local placement decisions only |
| Primary goal | Seat all eligible students while avoiding horizontal same-course adjacency |

---

## 2. Pseudocode

```text
FUNCTION handleGenerate():
  ASSERT role ∈ {admin, faculty_incharge}          # Allotment.jsx:459
  ASSERT examDate ≥ today                           # :462
  ASSERT exam fields & timetableCourses nonempty    # :466–470

  IF seatingMode = "auto":
    venuesToUse ← venues sorted by capacity DESC    # :474–475
  ELSE:
    venuesToUse ← selectedVenues                    # :476
  ASSERT venuesToUse nonempty                       # :478

  # --- Preprocessing: build eligible cohorts ---
  FOR each course IN timetableCourses:              # :491
    key ← courseCode + "-" + department
    eligible ← []
    FOR each student IN studentsByCourse[key]:
      IF regn starts with excluded batch prefix: SKIP   # :507–512
      IF regn IN ineligibleSet: SKIP                    # :515–521
      eligible.append(student with courseDescription=courseCode)

  sortedCourses ← cohorts sorted by |eligible| DESC # :538–540
  totalStudents ← sum sizes
  ASSERT totalStudents ≤ Σ venue.capacity           # :563–571

  # --- Init grids ---
  FOR each venue IN venuesToUse:                    # :574–581
    grid[r][c] ← null for r∈[0,rows), c∈[0,cols)
    benchConfig ← venue.benchConfig or [2]*cols

  # --- Pass A: adjacency-respecting vertical fill ---
  FOR each cohort IN sortedCourses:                 # :586
    studentIndex ← 0
    FOR each venueGrid IN venueGrids:               # :594  (label venueLoop)
      FOR c IN 0..cols-1:                           # column
        FOR s IN 0..seatsInCol-1:                   # seat within bench
          FOR r IN 0..rows-1:                       # vertical down
            IF studentIndex ≥ |cohort|: BREAK venueLoop
            IF grid[r][c][s] occupied: CONTINUE
            student ← cohort[studentIndex]
            IF AdjacentSameCourse(grid, r,c,s, student):  # Rules 1–3
              SKIP seat                             # do NOT advance index
            ELSE:
              ASSIGN grid[r][c][s] ← student
              studentIndex++

    IF studentIndex < |cohort|:                     # :677
      IF NOT allowAdjacentSeating: FAIL             # :681
      # Pass B: override — same traversal, ignore adjacency
      FOR each empty slot in same c,s,r order:      # :691–707
        place next student
      IF still unplaced: FAIL                       # :710
      ELSE mark adjacencyOverrideUsed               # :718

  # --- Postprocess ---
  availableFaculty ← faculty with canAllocate∧¬timeConflict  # :726
  FOR each venueGrid with ≥1 student:               # :736
    format cells → "Empty" or [{regn_no, course}|null]
    IF facultyMode = AUTO: assign next faculty round-robin  # :775
  setGeneratedSeating(venuesResult)                 # :797
```

### AdjacentSameCourse (Rules 1–3) — `Allotment.jsx:627–658`

```text
FUNCTION canPlace(student, r, c, s):
  # Rule 1: left seat on same bench
  IF s > 0 AND slot(s-1).courseDescription = student.courseDescription:
    RETURN false
  # Rule 2: left bench edge (this seat is first slot)
  IF s = 0 AND c > 0 AND lastSlot(prevBench).course = student.course:
    RETURN false
  # Rule 3: right bench edge (this seat is last slot)
  IF s = last AND c < cols-1 AND firstSlot(nextBench).course = student.course:
    RETURN false
  RETURN true
```

---

## 3. Optimization strategy (what it actually optimizes)

| Concern | Optimized? | How |
|---------|------------|-----|
| Seat all students | **Yes (hard)** | Capacity gate + fail if unplaced |
| Same-course horizontal adjacency | **Yes (hard, then optional soft)** | Skip seats; override pass |
| Course cohort priority | **Partially** | Larger groups first (`538–540`) |
| Hall utilization balance | **Weak / incidental** | Auto sort large halls first; fill venues in that order within a course pass — not global load balancing |
| Bench utilization | **Incidental** | Fills vertically; may leave holes when skipping conflicts |
| Department mixing | **Not explicit** | Side-effect of seating different courses after each other + adjacency |
| Conflict count minimization | **Local only** | Never revisits / swaps earlier seating |
| Walking distance | **No** | — |
| Even room fill | **No** | Later courses inherit leftover seats; large early courses may dominate first halls |
| Faculty fairness | **Weak** | Round-robin over non-empty rooms only (`775–781`) |

**Conclusion:** The algorithm is **constraint-satisfying with a fixed fill order**, not a multi-objective optimizer.

---

## 4. Decision tree — why A vs B

### 4.1 Why Student A before Student B?

1. Students are partitioned by ``courseCode-department``.  
2. Cohorts with **more eligible students** are processed first (`538–540`).  
3. Within a cohort, order is **list order** from API fetch (`studentsByCourse`) after filters — **no sort by regnNo** in `handleGenerate`.  
4. The next student is always `students[studentIndex]` — first-fit next, never “best student for seat.”

**There is no scoring of candidates.** Decision = traversal order only.

### 4.2 Why Venue A before Venue B?

| Mode | Rule | Lines |
|------|------|-------|
| Auto | Higher `capacity` first | `474–475` |
| Manual | Checkbox selection order (`selectedVenues`) | `476`, `443–451` |

Within a course pass, venues are scanned in `venuesToUse` / `venueGrids` order until the cohort is exhausted (`594`).

### 4.3 Why Bench / seat position?

Fixed nested loops (`600–607`):

1. Column `c` (left → right)  
2. Seat index `s` within bench (A1 then A2…)  
3. Row `r` (top → bottom) — **vertical strips**

A seat is taken if empty and adjacency OK; otherwise the algorithm **leaves studentIndex unchanged** and tries the next seat in the triple nest. If the nest ends with students left, override or fail.

### 4.4 Why skip a seat instead of placing elsewhere?

Because the search is **single-pass greedy**: it does not backtrack to free a previous seat for a better arrangement. Skipping advances the seat cursor, not the student cursor.

---

## 5. Complexity analysis

Let:

- \(N\) = eligible students  
- \(C\) = number of course–department cohorts  
- \(V\) = venues used  
- \(R, K\) = max rows, cols  
- \(S\) = max seats per bench (`benchConfig`)  
- \(M = V \cdot R \cdot K \cdot S\) ≈ total seat slots  

### Time

| Phase | Bound | Notes |
|-------|-------|-------|
| Filtering | \(O(N)\) | Per student checks |
| Sort cohorts | \(O(C \log C)\) | |
| Pass A fill | \(O(C \cdot M)\) worst | Each cohort may scan all seats; adjacency is \(O(1)\) |
| Override Pass B | \(O(C \cdot M)\) | Same loops |
| Faculty + format | \(O(M)\) | |

**Worst case:** \(O(C \cdot M)\) ≈ \(O(N \cdot M)\) if many tiny cohorts each rescanning halls.  
**Typical:** Fewer cohorts; early large courses fill most seats so later passes scan more occupied skips → still \(O(C\cdot M)\).

Adjacency checks are **O(1)** per seat attempt (local neighbors only).

### Space

| Structure | Bound |
|-----------|-------|
| Grids | \(O(M)\) references |
| Student lists | \(O(N)\) |
| Preview/save JSON | \(O(M)\) |
| Browser heap | Entire arrangement held in React state |

### Scalability & bottlenecks

| Bottleneck | Location | Effect |
|------------|----------|--------|
| Nested seat scans per cohort | `586–672` | Slow for many courses × large halls (usually still OK in browser for exam sizes) |
| N sequential student API calls | `265–284` | Network latency before generate |
| Client-only generation | Allotment | Large N freezes UI thread (no Web Worker) |
| No server re-solve | save-plan | Cannot regenerate consistently on server |
| Greedy holes | Skip without backtrack | Can force override or capacity waste while seats remain non-adjacent |

**Database** is not on the hot path for *generation*; it matters on *save* (transaction + multi-insert) and *read* (hydrate).

---

## 6. Data model relationships

```text
ExamSlot (date, session, start, end, type)
    │
    ├── TimetableCourse* (courseCode, department, examType)
    │         │
    │         └── Student* (regnNo, name, …)  [filtered by batch + ineligibility]
    │
    └── Venue* (benchesRow, benchesCol, benchConfig[], capacity)
              │
              └── Bench at (row, col)
                        │
                        └── Seat slots [0 .. benchConfig[col]-1]
                                  │
                                  └── Occupant? { regn_no, course }

Faculty ──(AUTO round-robin / MANUAL)──► Venue (non-empty only)
```

### Seat cell after format (`750–768`)

```text
seatingArrangement[row][col] =
    "Empty"
  | [ { regn_no, course } | null , ... ]   // length = benchConfig[col]
```

---

## 7. Weaknesses

1. **No global optimality** — earlier cohorts dominate good seats; later cohorts get leftovers.  
2. **Backtracking absent** — skipped seats may cause failure even when a different assignment exists.  
3. **Holes from skips** — refusing a seat without placing anyone leaves gaps that later courses may or may not use.  
4. **Course ≠ department** — anti-cheat key is course code; same department different courses may sit adjacent (often desired).  
5. **No vertical anti-cheat** — same course may sit front/back in a column (vertical fill encourages this).  
6. **Capacity vs geometry drift** — gate uses `capacity` field; fill uses grid math.  
7. **Trust client layouts** — server does not verify adjacency or that all students appear once.  
8. **Override is coarse** — once triggered for a cohort, remaining placements ignore adjacency entirely for those leftovers.  
9. **UI-thread compute** — large exams block the main thread.  
10. **Faculty assignment decoupled** — not part of seating quality metric.

---

## 8. Worked micro-example (decision illustration)

Assume one venue, 2 rows, 2 cols, `benchConfig=[2,2]`, courses CS (3 students) then EC (1).

Fill order of seats:  
`(c0,s0,r0), (c0,s0,r1), (c0,s1,r0), (c0,s1,r1), (c1,s0,r0), …`

CS students place along column 0 vertical first.  
When placing CS on `(c0,s1,*)`, Rule 1 blocks if `(c0,s0,*)` already has CS → algorithm skips those seats until a non-adjacent slot exists (often later columns), **without** moving the earlier CS students.

This is why large single-course sittings strain adjacency: vertical same-course stacks are fine, but **horizontal** neighbors of same course are rejected.

---

## 9. Reimplementation checklist

An engineer reimplementing Hallora behavior must reproduce:

1. Prefilters (batch, ineligibility, role, date)  
2. Cohort sort by size desc  
3. Capacity gate on `venue.capacity`  
4. Exact nest order `c → s → r`  
5. Three horizontal adjacency predicates on `courseDescription`  
6. Optional override second pass  
7. Drop empty venues  
8. Cell format `{regn_no,course}` / `"Empty"`  
9. AUTO faculty round-robin over remaining venues  
10. Save contract identical to `handleSave` payload  

Anything beyond that (global mixing objectives, row separation, true optimality) is **not** current Hallora behavior.
