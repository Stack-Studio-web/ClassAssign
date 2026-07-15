# OR-Tools Seating Demo (frontend)

Minimal React + Vite UI for the CP-SAT seating backend.

**Requires the FastAPI backend running separately on port 8000**
(`uvicorn main:app --reload` from the repo root).

## Run

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 — then click **Generate Seating** (sample Hall A/B + 30 students are preloaded).

API base URL: `src/config.js` → `http://localhost:8000`
