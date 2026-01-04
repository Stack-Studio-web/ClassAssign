import React, { useEffect, useState } from "react";
import axios from "axios";

/* ================= CONFIG ================= */
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = [
  "08:00", "09:00", "10:00", "11:00",
  "12:00", "13:00", "14:00", "15:00",
  "16:00", "17:00"
];

/* ================= HELPERS ================= */
const getWeekStart = (date) => {
  const d = new Date(date);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return d;
};

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const sameDate = (a, b) =>
  new Date(a).toDateString() === new Date(b).toDateString();

const timeToRow = (time) => parseInt(time.split(":")[0]) - 8;

/* ================= TIMETABLE ================= */
const Timetable = ({ plans, weekStart, onSelect }) => {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[900px] bg-white rounded-xl shadow border">

        <div className="grid grid-cols-[70px_repeat(6,1fr)]">

          {/* Time column */}
          <div className="bg-gray-50 border-r">
            <div className="h-12 border-b"></div>
            {HOURS.map(h => (
              <div key={h} className="h-20 text-xs text-center pt-2 border-b">
                {h}
              </div>
            ))}
          </div>

          {/* Days */}
          {DAYS.map((day, index) => {
            const date = addDays(weekStart, index);

            return (
              <div key={day} className="relative border-r">
                <div className="h-12 text-center font-semibold border-b bg-gray-100">
                  {day}
                  <div className="text-xs text-gray-500">
                    {date.getDate()}
                  </div>
                </div>

                {HOURS.map(h => (
                  <div key={h} className="h-20 border-b"></div>
                ))}

                {/* Exams */}
                {plans
                  .filter(p => sameDate(p.examDate, date))
                  .map(plan => {
                    const top = timeToRow(plan.examStartTime) * 80 + 48;
                    const height =
                      (timeToRow(plan.examEndTime) -
                        timeToRow(plan.examStartTime)) * 80;

                    return (
                      <div
                        key={plan._id}
                        onClick={() => onSelect(plan)}
                        className={`absolute left-2 right-2 rounded-lg p-2 text-xs cursor-pointer shadow-md
                          ${plan.examSession === "FN"
                            ? "bg-emerald-400 text-white"
                            : "bg-indigo-400 text-white"}`}
                        style={{ top, height }}
                      >
                        <p className="font-bold">{plan.examCode}</p>
                        <p className="opacity-90">{plan.examType}</p>
                        <p className="text-[10px]">
                          {plan.examStartTime} – {plan.examEndTime}
                        </p>
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/* ================= DASHBOARD ================= */
const Dashboard = () => {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(getWeekStart(new Date()));
  const [selectedPlan, setSelectedPlan] = useState(null);

  useEffect(() => {
    axios
      .get("http://localhost:5000/api/seating")
      .then(res => setPlans(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-center mt-10">Loading timetable…</div>;
  }

  /* ================= EXAM DETAILS ================= */
  if (selectedPlan) {
    return (
      <div className="p-6 max-w-xl mx-auto">
        <button
          onClick={() => setSelectedPlan(null)}
          className="mb-4 text-blue-600 font-semibold"
        >
          ← Back to Timetable
        </button>

        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="text-2xl font-bold mb-2">
            {selectedPlan.examType}
          </h2>

          <p className="text-gray-600 mb-1">
            <b>Code:</b> {selectedPlan.examCode}
          </p>
          <p className="text-gray-600 mb-1">
            <b>Date:</b> {new Date(selectedPlan.examDate).toDateString()}
          </p>
          <p className="text-gray-600 mb-1">
            <b>Session:</b> {selectedPlan.examSession}
          </p>
          <p className="text-gray-600 mb-3">
            <b>Time:</b> {selectedPlan.examStartTime} – {selectedPlan.examEndTime}
          </p>

          <p className="text-gray-600">
            <b>Venues:</b>{" "}
            {selectedPlan.venuesUsed.map(v => v.venueName).join(", ")}
          </p>
        </div>
      </div>
    );
  }

  /* ================= MAIN ================= */
  return (
    <div className="p-4 md:p-8 bg-gray-100 min-h-screen">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
          <h1 className="text-3xl font-bold mb-4 md:mb-0">
            Exam Timetable
          </h1>

          {/* Week selector */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setWeekStart(addDays(weekStart, -7))}
              className="px-3 py-2 bg-white rounded shadow hover:bg-gray-50"
            >
              ← Prev
            </button>

            <span className="font-semibold">
              {weekStart.toDateString()} –{" "}
              {addDays(weekStart, 5).toDateString()}
            </span>

            <button
              onClick={() => setWeekStart(addDays(weekStart, 7))}
              className="px-3 py-2 bg-white rounded shadow hover:bg-gray-50"
            >
              Next →
            </button>
          </div>
        </div>

        {/* Timetable */}
        <Timetable
          plans={plans}
          weekStart={weekStart}
          onSelect={setSelectedPlan}
        />

        {/* Mobile hint */}
        <p className="mt-4 text-sm text-gray-500 text-center md:hidden">
          📱 Swipe horizontally to view full timetable
        </p>

      </div>
    </div>
  );
};

export default Dashboard;
