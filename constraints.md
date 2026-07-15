# Hallora Seating Constraints Catalog

> Derived only from source references. Where behavior is **not** coded, it is marked **INFERRED / NOT IMPLEMENTED**.

---

## Priority legend

| Priority | Meaning |
|----------|---------|
| **P0** | Hard fail / gate — generation or save aborts |
| **P1** | Always enforced during placement (skip seat) |
| **P2** | Soft / optional / UI preference |
| **P3** | Post-process / persistence / reporting only |

---

## Constraint table

| ID | Constraint | Priority | Description | Implementation | OR-Tools equivalent |
|----|------------|----------|-------------|----------------|---------------------|
| C01 | Write-role gate | P0 | Only `admin` / `faculty_incharge` may generate or save | `hasWriteAccess` check in `handleGenerate` / `handleSave` — `Allotment.jsx:131`, `459–460`, `802–804`; `checkRole` on save — `seatingRoutes.js:23` | Preprocessing / auth (outside CP-SAT) |
| C02 | No past exam dates | P0 | Cannot generate for `examDate < today` | `Allotment.jsx:462–464` | Preprocessing |
| C03 | Exam fields required | P0 | Date, type, start, end required | Generate: `466–467`; Save API: `seatingRoutes.js:42–47` | Preprocessing |
| C04 | Timetable must yield courses | P0 | Empty timetable → cannot generate | `Allotment.jsx:469–470` | Preprocessing |
| C05 | At least one venue | P0 | Auto or manual list nonempty | Generate: `478–480`; Save: `seatingRoutes.js:50–56` | Domain must include ≥1 venue seats |
| C06 | Total capacity ≥ eligible students | P0 | Sum of `venue.capacity` must cover roster | `Allotment.jsx:563–571` | `∑ seats ≥ N` or Infeasible if seat count &lt; N |
| C07 | Venue physical dimensions | P0/P1 | Grid = `benchesRow` × `benchesCol`; slots/col = `benchConfig[c]` (default 2) | Grid init `574–581`; capacity formula `venue.js:44` | Seat inventory from rows×cols×slots; clamp to capacity |
| C08 | Per-bench seat capacity | P1 | Each column bench has `benchConfig[c]` slots | Loop `seatsInCol = benchConfig[c] \|\| 2` — `600–601`, `754–758` | Capacity per bench / ExactlyOne over seats |
| C09 | One student per seat slot | P1 | Occupied slot skipped | `cellStudents[s]` occupied → `continue` — `620–622` | `∑_s x[s,k] ≤ 1` |
| C10 | Each student assigned at most once | P1 | Students consumed via `studentIndex++` in course order | `625–663` | `∑_k x[s,k] = 1` (exactly one) |
| C11 | Student uniqueness globally | P1 | No re-pick of same student in loop | Same index cursor; roster lists disjoint by course key | ExactlyOne over seats |
| C12 | Course grouping key | P1 | Groups are `courseCode-department`; seat “course” stored as course code | Unique key `494`, stamp `courseDescription: courseCode` — `523–527` | Label / bool vars by course group |
| C13 | Largest-cohort-first ordering | P2 | Larger eligible groups seated before smaller | Sort `538–540` | Soft: preordering or priority weights (optional) |
| C14 | Vertical fill order | P2 | Traverse `c` → `s` → `r` (column-first vertical) | `599–607` | Not a CP constraint; optional search heuristic / branch order |
| C15 | Same-course adjacent on same bench forbidden | P1 | Seat `s` blocked if `s-1` same `courseDescription` | Rule 1 `627–630` | Forbid pairs on adjacent slots same course; or pair-penalty objective |
| C16 | Same-course adjacent across previous bench | P1 | First slot of bench vs last slot of left bench, same row | Rule 2 `632–642` | Edge-adjacency forbidden pairs |
| C17 | Same-course adjacent across next bench | P1 | Last slot of bench vs first slot of right bench, same row | Rule 3 `645–653` | Edge-adjacency forbidden pairs |
| C18 | Row-adjacent same course | — | Students in same column different rows **may** share course | No check in code | **NOT IMPLEMENTED** (by design of vertical fill) |
| C19 | Diagonal adjacency | — | Not checked | — | **NOT IMPLEMENTED** |
| C20 | Department mixing as explicit goal | — | Adjacency uses **course code**, not department string | Rules compare `courseDescription` | **INFERRED:** department often coincides with course groups in demos; production mixes by **course**, not dept field |
| C21 | Adjacency override allowed | P2 | If unplaced remain and toggle on, second pass ignores C15–C17 | `681–721` | Soften hard adjacency → objective penalties / optional bool flag |
| C22 | All eligible must be seated | P0 | Incomplete seating after (override) fails | `681–687`, `710–715` | Feasibility: all students assigned |
| C23 | Skip unused venues | P3 | Empty venues omitted from preview/save | `740–748` | Optional: unused rooms free in model |
| C24 | Manual venue selection | P2 | Manual mode uses `selectedVenues` order | `474–476` | Preprocessing: restrict venue set |
| C25 | Auto venue sort by capacity | P2 | Auto mode: larger halls first | `474–475` | Preprocessing / search order |
| C26 | Batch prefix exclusion | P0/pre | Exclude regs matching comma prefixes | `501–512` | Preprocessing |
| C27 | Ineligibility exclusion | P0/pre | Exclude regs in ineligible set | `515–521` | Preprocessing |
| C28 | Faculty AUTO round-robin | P2 | Assign available faculty cycling over non-empty rooms | `775–781` | Separate assignment problem / postprocess |
| C29 | Faculty MANUAL required on save | P0 | Every venue must have faculty selected | `806–808` | Preprocessing / UI |
| C30 | Faculty allocation quota | P0 | `max_classrooms` headroom | Client filter `726`; server SQL `seatingRoutes.js:95+` | Constraint or postprocess check |
| C31 | Faculty time conflict | P0 | No overlapping exam on same date | Client enrichment `363–413`; save loop `seatingRoutes.js:~89–146` | Preprocessing / separate model |
| C32 | Venue time conflict on save | P0 | Hall already booked for overlapping window | `Venue.isAvailable` — `seatingRoutes.js:60–87` | Preprocessing (sessions fixed before solve) |
| C33 | Empty cell encoding | P3 | Fully empty bench → `"Empty"` string | Format `752`; hydrate util `seatingLayout.js` | Serialization only |
| C34 | Persist layout compatibility | P3 | Cells `{ regn_no, course }` or null slots | Format `760–767`; flatten `seatingLayout.js:9–38` | Serialization contract |
| C35 | Session / exam metadata | P0 | Plan bound to date, session, type, times | Save payload + DB insert `SeatingPlan.js:57–63` | Preprocessing metadata |
| C36 | Owner / multi-tenant | P3 | Plans tagged with owner for HoD filters | `ownerFilter` + insert in `createPlan` | Persistence / auth |
| C37 | Reserved seats / buffers | — | No reserved or buffer seats in generator | — | **NOT IMPLEMENTED** |
| C38 | Accessibility seats | — | No accessibility rules | — | **NOT IMPLEMENTED** |
| C39 | Walking distance / door proximity | — | No distance objective | — | **NOT IMPLEMENTED** |
| C40 | Registration-number sort order | — | Students kept in fetch list order within course; not re-sorted by regn | Push order `523–527` | **INFERRED** list order = API order |
| C41 | Left/right only (no front/back) | P1 | Horizontal adjacency enforced; vertical not | Rules 1–3 vs C18 | Map only left–right edges |
| C42 | Duplicate plan / same hall overwrite | — | Soft conflict if venue session overlaps; no extra seat uniqueness beyond DB | Venue session booking | External to layout CP model |
| C43 | Server re-validation of adjacency | — | Save does **not** re-check adjacency or capacity | `seatingRoutes.js` save path | **NOT IMPLEMENTED** — trust client |
| C44 | Attendance compatibility | P3 | Attendance reads stored arrangements | `GET /attendance` `seatingRoutes.js:304+` | Keep layout schema |

---

## Constraint detail notes

### Anti-cheating adjacency (C15–C17)

Adjacency is defined on **course code** (`courseDescription` stamped as `courseCode` at `Allotment.jsx:525`), **not** on department for the check itself (department is still attached to the student object at `526`).

Horizontal neighborhood only:

```text
… [Bench c-1 last slot] | [Bench c first slot] … [Bench c last slot] | [Bench c+1 first slot] …
        Rule 2 checks ←――――――――――――――――――――――→ Rule 3 checks
Within bench: slot s vs slot s-1  (Rule 1)
```

### Capacity (C06 vs C07)

- **Gate uses** stored `venue.capacity` (`563–571`).  
- **Grid seats use** `benchesRow × Σ benchConfig[c]`.  
- Stored capacity is computed at create as `benchesRow * sum(benchConfig)` (`venue.js:44`).  
- If capacity ever drifts from geometry, the gate and actual seat count can disagree — **risk**.

### Override (C21)

Override is **not** a global “allow cheating” for the first pass — it only runs for remaining students of a course that failed the adjacency pass (`677–721`).

---

## Priority summary for OR-Tools

| Must stay hard | Should become soft / objective | Stay outside solver |
|----------------|--------------------------------|---------------------|
| C06, C08–C11, C22 | C13, C14, C15–C17 (or hard), C21 | C01–C05, C26–C27, C28–C32, C35–C36 |
| Layout schema C33–C34, C44 | C25 venue order | Auth, timeslots |

---

## Confirmed absences

The following appear in many seating systems but **are not present** in Hallora’s generator:

- Front/back (row) same-course separation  
- Explicit department-pair mixing objective  
- Reserved / buffer / accessibility seats  
- Distance-to-door optimization  
- Server-side regeneration or adjudication of layouts  

Any migration that “adds” these is a **product change**, not a port of current behavior.
