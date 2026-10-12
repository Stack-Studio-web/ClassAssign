import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  FACULTY_DEPARTMENTS,
  departmentLabelForCode,
  filterFacultyDepartments,
} from "../lib/facultyDepartments";

/**
 * Searchable department dropdown for Faculty Import / edit.
 * Value stored/emitted is the department code (or "").
 */
export default function FacultyDepartmentSelect({
  value = "",
  onChange,
  disabled = false,
  required = false,
  id: idProp,
  placeholder = "Search department name or code…",
  className = "",
}) {
  const autoId = useId();
  const id = idProp || autoId;
  const listId = `${id}-list`;
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedLabel = value ? departmentLabelForCode(value) : "";

  useEffect(() => {
    if (!open) {
      setQuery(selectedLabel);
    }
  }, [selectedLabel, open]);

  useEffect(() => {
    const onDoc = (e) => {
      if (!rootRef.current?.contains(e.target)) {
        setOpen(false);
        setQuery(selectedLabel);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [selectedLabel]);

  const options = useMemo(
    () => (open ? filterFacultyDepartments(query) : FACULTY_DEPARTMENTS),
    [open, query]
  );

  const selectDept = (dept) => {
    onChange?.(dept.code);
    setQuery(dept.label);
    setOpen(false);
  };

  const clear = () => {
    onChange?.("");
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-required={required || undefined}
        disabled={disabled}
        value={open ? query : selectedLabel || query}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          // Typing clears a committed selection until user picks again
          if (value) onChange?.("");
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            setQuery(selectedLabel);
          }
          if (e.key === "Enter" && options.length === 1) {
            e.preventDefault();
            selectDept(options[0]);
          }
        }}
        className="w-full h-12 px-4 pr-20 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all disabled:bg-gray-100 disabled:cursor-not-allowed bg-white text-sm"
      />
      <div className="absolute inset-y-0 right-2 flex items-center gap-1">
        {value ? (
          <button
            type="button"
            tabIndex={-1}
            disabled={disabled}
            onClick={clear}
            className="text-xs text-gray-500 hover:text-gray-800 px-1.5 py-1 rounded"
            aria-label="Clear department"
          >
            Clear
          </button>
        ) : null}
        <span className="text-gray-400 text-xs pointer-events-none px-1" aria-hidden>
          ▾
        </span>
      </div>

      {open && !disabled && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-gray-200 bg-white shadow-lg py-1"
        >
          {options.length === 0 ? (
            <li className="px-4 py-3 text-sm text-gray-500">No matching department</li>
          ) : (
            options.map((dept) => (
              <li key={dept.code} role="option" aria-selected={dept.code === value}>
                <button
                  type="button"
                  className={`w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 ${
                    dept.code === value ? "bg-blue-50 text-blue-800 font-medium" : "text-gray-800"
                  }`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectDept(dept)}
                >
                  {dept.label}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
