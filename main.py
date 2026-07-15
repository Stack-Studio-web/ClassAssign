"""Thin FastAPI layer for the OR-Tools seating allotment prototype."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from models import SeatingRequest, SeatingResponse
from solver import generate_seating

app = FastAPI(
    title="Exam Seating Allotment (OR-Tools CP-SAT)",
    description=(
        "Standalone prototype replacing the legacy client-side greedy seating "
        "algorithm with a CP-SAT model. POST /generate-seating accepts venues + "
        "students (plus optional venue_fill_order and allow_adjacent_override) "
        "and returns a Hallora-compatible seating plan JSON."
    ),
    version="0.1.0",
)

# CORS open for local demo / Postman / curl from a browser page
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/generate-seating", response_model=SeatingResponse)
def generate_seating_endpoint(request: SeatingRequest) -> SeatingResponse:
    """
    Seat every student using the fewest venues possible (ordered by
    venue_fill_order among the min cover). Same-course horizontal adjacency
    is hard unless allow_adjacent_override relaxes it.
    """
    return generate_seating(request)
