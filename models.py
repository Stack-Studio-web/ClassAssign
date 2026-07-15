"""Pydantic request/response schemas for the seating allotment prototype."""

from __future__ import annotations

from typing import Any, List, Literal, Optional, Union

from pydantic import BaseModel, Field, field_validator, model_validator


class Venue(BaseModel):
    venue_id: str
    venue_name: str
    benches_row: int = Field(..., ge=1, description="Number of bench rows")
    benches_col: int = Field(..., ge=1, description="Number of bench columns")
    bench_config: List[int] = Field(
        ...,
        min_length=1,
        description="Seats per bench column; length must equal benches_col",
    )

    @model_validator(mode="after")
    def validate_bench_geometry(self) -> "Venue":
        if len(self.bench_config) != self.benches_col:
            raise ValueError(
                f"bench_config length ({len(self.bench_config)}) "
                f"must equal benches_col ({self.benches_col})"
            )
        if any(slots < 1 for slots in self.bench_config):
            raise ValueError("each bench_config entry must be >= 1")
        return self

    @property
    def capacity(self) -> int:
        return self.benches_row * sum(self.bench_config)


class Student(BaseModel):
    regn_no: str
    course_code: str
    department: str


class SeatingRequest(BaseModel):
    venues: List[Venue] = Field(..., min_length=1)
    students: List[Student] = Field(..., min_length=1)
    allow_adjacent_override: bool = False
    # C25: open / fill halls by capacity order (legacy auto mode = high_to_low)
    venue_fill_order: Literal["high_to_low", "low_to_high"] = "high_to_low"

    @field_validator("students")
    @classmethod
    def unique_regn_nos(cls, students: List[Student]) -> List[Student]:
        regns = [s.regn_no for s in students]
        if len(regns) != len(set(regns)):
            raise ValueError("student regn_no values must be unique")
        return students


class AdjacencyViolation(BaseModel):
    venue_id: str
    row: int
    col: int
    seat_index: int
    course_code: str


class SeatOccupant(BaseModel):
    regn_no: str
    course: str


# Bench cell: fully empty string, or slot list with occupants / null gaps
BenchCell = Union[Literal["Empty"], List[Optional[SeatOccupant]]]


class VenueSeating(BaseModel):
    venue_id: str
    venue_name: str
    bench_config: List[int]
    seating_arrangement: List[List[Any]]  # BenchCell per (row, col)


class SeatingResponse(BaseModel):
    status: Literal["OPTIMAL", "FEASIBLE", "INFEASIBLE"]
    adjacency_violations: List[AdjacencyViolation] = Field(default_factory=list)
    venues_used: List[VenueSeating] = Field(default_factory=list)
    unseated_students: List[str] = Field(default_factory=list)
    message: Optional[str] = None
    solve_time_seconds: Optional[float] = None
