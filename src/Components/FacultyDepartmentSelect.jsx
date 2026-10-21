import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  FACULTY_DEPARTMENTS,
  departmentLabelForCode,
  filterFacultyDepartments,
} from "../lib/facultyDepartments";

/**
 * Searchable department dropdown for Faculty Import / edit.
 * Value stored/emitted is the department code (or "").
 *
 * @param {Array<{code:string,label?:string,name?:string}>|null} [options]
 *   When provided, use these instead of the static facultyDepartments.json list.
 */
export default function FacultyDepartmentSelect({
  value = "",
  onChange,
  disabled = false,
  required = false,
  id: idProp,
  placeholder = "Search department name or code…",
  className = "",
  options: optionsProp = null,
}) {
  const autoId = useId();
  const id = idProp || autoId;
  const listId = `${id}-list`;
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const catalog = useMemo(() => {
    if (!Array.isArray(optionsProp)) return FACULTY_DEPARTMENTS;
    return optionsProp.map((d) => {
      const code = String(d.code || d.department || "").trim().toUpperCase();
      const name = d.name || d.label || code;
      const label = d.label || (d.name ? `${d.name} (${code})` : code);
      return { code, name, label };
    }).filter((d) => d.code);
  }, [optionsProp]);

  const labelFor = (code) => {
    if (!code) return "";
    const hit = catalog.find((d) => d.code === String(code).trim().toUpperCase());
    if (hit) return hit.label;
    return departmentLabelForCode(code) || String(code);
  };

  const selectedLabel = value ? labelFor(value) : "";

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

  const options = useMemo(() => {
    if (!open) return catalog;
    if (!Array.isArray(optionsProp)) return filterFacultyDepartments(query);
    const q = String(query || "").trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter(
      (d) =>
        d.code.toLowerCase().includes(q) ||
        String(d.name || "").toLowerCase().includes(q) ||
        String(d.label || "").toLowerCase().includes(q)
    );
  }, [open, query, catalog, optionsProp]);

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
