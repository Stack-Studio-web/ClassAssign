# Exam Seating Allotment — OR-Tools CP-SAT Prototype

Standalone FastAPI service that replaces Hallora’s **client-side greedy** seating
algorithm (`Allotment.jsx` `handleGenerate`) with a **Google OR-Tools CP-SAT** model.

No existing frontend is modified. Feed venues + students in the request; get a
Hallora-compatible seating plan JSON back.

---

## Quick start

```bash
# From this directory (activate the venv if you use one)
pip install -r requirements.txt
uvicorn main:app --reload
```

API docs: http://127.0.0.1:8000/docs

### curl

```bash
curl -X POST http://127.0.0.1:8000/generate-seating ^
  -H "Content-Type: application/json" ^
  --data-binary "@sample_request.json"
```

### CLI smoke test (no HTTP)

```bash
python solver.py
```

### Sample payload

`sample_request.json` — 2 venues (Hall A = 18 seats, Hall B = 14 seats), 3 courses
(CS301×12, EC201×10, ME301×8 = **30 students**), `allow_adjacent_override: false`.

---

## What each CP-SAT rule encodes

| Rule | Constraint ID (see `constraints.md`) | CP-SAT encoding |
|------|--------------------------------------|-----------------|
| Capacity gate | C06 | Pre-check `sum(venue.capacity) >= N`; return `INFEASIBLE` without solving |
| One student / seat | C09 | `AddAtMostOne` over students for each seat |
| Each student seated once | C10 / C22 | `AddExactlyOne` over seats for each student |
| Course key | C12 | Adjacency uses `course_code` (not department) |
| Same-bench neighbor | C15 Rule 1 | Adjacent slots `(col, s-1)` / `(col, s)` same row |
| Cross-bench edge | C16–C17 Rules 2–3 | Last slot of bench `c` ↔ first slot of bench `c+1`, same row |
| No vertical/diagonal | C18 / C19 | Intentionally **not** constrained (legacy parity) |
| Override | C21 | If hard adj infeasible and flag is true → soft violation vars in objective |
| Skip unused halls | C23 | Venues with zero seated students omitted from `venues_used` |

**Adjacency model:** course-level indicator `y[course, seat]`, then for each
horizontal edge `(a, b)`:

- Hard: `AddAtMostOne(y[c,a], y[c,b])`
- Soft (override): `y[c,a] + y[c,b] <= 1 + violation`; minimize `Σ violations`

**Soft objective (upgrade over greedy):**

```text
minimize  100 * (# venues used)  +  10000 * (# adjacency violations)
```

Violations only appear when `allow_adjacent_override` forces the soft pass.
Venue packing encourages filling opened halls before spreading thin.

Solver time limit: **10 seconds**; returns best `FEASIBLE` solution if not proven
`OPTIMAL` in time.

---

## Response shape (legacy-compatible)

```json
{
  "status": "OPTIMAL | FEASIBLE | INFEASIBLE",
  "adjacency_violations": [
    {"venue_id": "...", "row": 0, "col": 1, "seat_index": 0, "course_code": "CS301"}
  ],
  "venues_used": [
    {
      "venue_id": "V001",
      "venue_name": "Hall A",
      "bench_config": [2, 2, 2],
      "seating_arrangement": [
        [["Empty" | [{"regn_no","course"}|null, ...], ...]]
      ]
    }
  ],
  "unseated_students": [],
  "message": "...",
  "solve_time_seconds": 0.12
}
```

Bench cells use `"Empty"` when the whole bench is vacant; otherwise a slot array
aligned to `bench_config[col]` (matches Hallora C33–C34).

---

## vs legacy greedy (what is now guaranteed)

| | Legacy JS greedy | This CP-SAT engine |
|--|------------------|--------------------|
| Search | Single-pass vertical fill (`c → s → r`); skip on conflict; **no backtrack** | Global search over all student↔seat assignments |
| Dead-ends | Can leave seats unused while later failing / needing override | If a adjacency-safe packing exists, CP-SAT can find it |
| Override | Second pass ignores adjacency for leftovers of a stuck cohort | Controlled soft penalties; violations listed for UI |
| Venue use | Incidental (fill halls in capacity order) | Explicit soft minimize of venues used |
| Optimality | None | `OPTIMAL` when proven within time limit |
| Where it runs | Browser UI thread | Backend service |

References for legacy behavior: `constraints.md`, `algorithm_flow.md`,
`algorithm_analysis.md`.

---

## Demo UI

```bash
# Terminal 1 — API
uvicorn main:app --reload

# Terminal 2 — React visualizer
cd frontend && npm install && npm run dev
```

See `frontend/README.md`.

## Project layout

```text
models.py            Pydantic request/response schemas
solver.py            Seat pool, adjacency graph, CP-SAT model, response formatter
main.py              FastAPI app — POST /generate-seating
sample_request.json  Worked demo payload (~30 students, 2 halls)
requirements.txt     ortools, fastapi, uvicorn, pydantic
frontend/            Vite + React seating grid demo
```

Auth, faculty assignment, exam date gates, and DB persistence stay **outside**
this prototype (C01–C05, C28–C32 in the constraint catalog).
