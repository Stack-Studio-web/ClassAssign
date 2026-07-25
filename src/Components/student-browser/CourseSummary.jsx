import React, { useRef } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/Button";

function CourseCard({ course, active, showOwner, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-w-[200px] flex-col rounded-xl border p-4 text-left transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
        active
          ? "border-blue-500 bg-blue-50 shadow-sm ring-2 ring-blue-100"
          : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
      )}
      aria-pressed={active}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="rounded-md bg-blue-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
          {course.courseCode?.slice(0, 8) || "Course"}
        </span>
        <span className="text-lg font-bold text-blue-600">{course.count}</span>
      </div>
      <p className="mt-2 line-clamp-2 text-sm font-semibold text-gray-900">
        {course.courseName || course.courseCode}
      </p>
      <p className="mt-0.5 truncate text-xs text-gray-500">{course.courseCode}</p>
      {showOwner && course.ownerName && (
        <p className="mt-2 text-xs text-gray-400">Owner: {course.ownerName}</p>
      )}
    </button>
  );
}

export function CourseSummary({
  courses,
  activeCourseCode,
  onSelectCourse,
  showOwner = false,
  loading = false,
  className,
}) {
  const scrollRef = useRef(null);

  const scroll = (dir) => {
    scrollRef.current?.scrollBy({ left: dir * 240, behavior: "smooth" });
  };

  if (loading) {
    return (
      <section className={cn("rounded-2xl border border-gray-100 bg-white p-5 shadow-sm", className)}>
        <p className="text-sm text-gray-500">Loading course summary…</p>
      </section>
    );
  }

  if (!courses.length) {
    return null;
  }

  return (
    <section
      className={cn("rounded-2xl border border-gray-100 bg-white p-5 shadow-sm", className)}
      aria-label="Students per course"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-gray-900">Students per course</h2>
        <div className="flex gap-1">
          <Button variant="outline" size="icon" onClick={() => scroll(-1)} aria-label="Scroll courses left">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => scroll(1)} aria-label="Scroll courses right">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide"
        role="list"
      >
        {courses.map((course) => (
          <motion.div key={course.courseCode} role="listitem" className="shrink-0">
            <CourseCard
              course={course}
              active={activeCourseCode === course.courseCode}
              showOwner={showOwner}
              onClick={() => onSelectCourse(course.courseCode)}
            />
          </motion.div>
        ))}
      </div>
    </section>
  );
}
