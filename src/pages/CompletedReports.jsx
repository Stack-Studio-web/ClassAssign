import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../lib/api";
import {
  CalendarIcon,
  MapPinIcon,
  PrinterIcon,
  UserIcon,
  CheckCircleIcon,
  ArrowLeftIcon,
} from "@heroicons/react/24/outline";
import PrintLayout from "./PrintLayout";

export default function CompletedReports() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const componentRef = useRef();

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      setLoading(true);
      const res = await api.get("/seating", { params: { status: "completed" } });
      setPlans(Array.isArray(res.data) ? res.data : []);
      setError(null);
    } catch (err) {
      if (err.response?.status === 401) {
        navigate("/login");
        return;
      }
      setError("Failed to load completed reports.");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "—";
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handlePrintSingle = () => {
    if (!componentRef.current) return;
    const printWindow = window.open("", "", "height=600,width=800");
    printWindow.document.write(
      "<html><head><title>Seating Plan</title><style>body { font-family: Arial; } table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid black; padding: 10px; }</style></head><body></body></html>"
    );
    printWindow.document.close();
    printWindow.document.body.appendChild(componentRef.current.cloneNode(true));
    printWindow.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <p className="text-gray-500">Loading completed reports…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  if (selectedPlan) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 md:px-8 py-6">
        <div className="flex flex-wrap gap-3 mb-6">
          <button
            type="button"
            onClick={() => setSelectedPlan(null)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium"
          >
            ← Back to list
          </button>
          <button
            type="button"
            onClick={handlePrintSingle}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white font-medium"
          >
            <PrinterIcon className="h-5 w-5" />
            Print This Plan
          </button>
        </div>
        <div className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
          <CheckCircleIcon className="h-4 w-4" />
          Completed report
        </div>
        <div ref={componentRef} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <PrintLayout selectedPlan={selectedPlan} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 font-[Inter,sans-serif]">
      <div className="px-4 md:px-8 py-4 md:py-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800">Completed Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Archived seating plans marked completed after the exam.
          </p>
        </div>
        <Link
          to="/report"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-50"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Active Reports
        </Link>
      </div>

      <div className="px-4 md:px-8 pb-8 space-y-4">
        {plans.length === 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center text-gray-500">
            No completed reports yet. Mark plans as completed from{" "}
            <Link to="/report" className="text-blue-600 font-semibold">
              Reports
            </Link>
            .
          </div>
        )}

        {plans.map((plan) => {
          const planId = plan.uuid;
          const venuesText =
            (plan.venuesUsed || [])
              .map((v) => v.venueName ?? v.venue_name ?? "—")
              .join(", ") || "—";
          return (
            <button
              key={planId}
              type="button"
              onClick={() => setSelectedPlan(plan)}
              className="w-full text-left bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  <CheckCircleIcon className="h-3.5 w-3.5" />
                  Completed
                </span>
                {plan.completedAt && (
                  <span className="text-xs text-gray-500">
                    Marked {formatDate(plan.completedAt)}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-700">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarIcon className="h-4 w-4 text-gray-400" />
                  <strong>Date:</strong>{" "}
                  {plan.examDate ? new Date(plan.examDate).toLocaleDateString() : "—"}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <UserIcon className="h-4 w-4 text-gray-400" />
                  <strong>Session:</strong> {plan.examSession ?? "—"}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <MapPinIcon className="h-4 w-4 text-gray-400" />
                  <strong>Venues:</strong> {venuesText}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
