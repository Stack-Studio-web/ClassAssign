import { useCallback, useEffect, useState } from "react";
import api from "../lib/api";

export const DEFAULT_EXPORT_HEADER = Object.freeze({
  logo: "KCT",
  department: "DEPARTMENT OF CSE, IT, AIDS, MCA",
  program1: "BE CSE - B.Tech IT - B.Tech AI&DS",
  program2: "M.Tech DS - M.E CSE (Cyber Security)",
  sfsLine1: "SCHOOL OF FOUNDATIONAL SCIENCES",
  sfsLine2: "AY 2026-2027 ODD SEM ( SA1 OR SA2)",
  isSfs: false,
});

/**
 * Per-user export header settings (logo / department / programs / SFS lines)
 * backed by GET/PUT /api/hall-header.
 */
export function useExportHeaderSettings({ autoLoad = true } = {}) {
  const [logoType, setLogoType] = useState(DEFAULT_EXPORT_HEADER.logo);
  const [departmentLine, setDepartmentLine] = useState(
    DEFAULT_EXPORT_HEADER.department
  );
  const [programmeLine1, setProgrammeLine1] = useState(
    DEFAULT_EXPORT_HEADER.program1
  );
  const [programmeLine2, setProgrammeLine2] = useState(
    DEFAULT_EXPORT_HEADER.program2
  );
  const [sfsLine1, setSfsLine1] = useState(DEFAULT_EXPORT_HEADER.sfsLine1);
  const [sfsLine2, setSfsLine2] = useState(DEFAULT_EXPORT_HEADER.sfsLine2);
  const [isSfs, setIsSfs] = useState(DEFAULT_EXPORT_HEADER.isSfs);
  const [hydrated, setHydrated] = useState(!autoLoad);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [error, setError] = useState("");

  const applyConfig = useCallback((cfg) => {
    if (!cfg || typeof cfg !== "object") return;
    if (cfg.logo != null) {
      setLogoType(
        String(cfg.logo).toUpperCase() === "KSI" ? "KSI" : "KCT"
      );
    }
    if (cfg.department != null) setDepartmentLine(String(cfg.department));
    if (cfg.program1 != null) setProgrammeLine1(String(cfg.program1));
    if (cfg.program2 != null) setProgrammeLine2(String(cfg.program2));
    if (cfg.sfsLine1 != null) setSfsLine1(String(cfg.sfsLine1));
    if (cfg.sfsLine2 != null) setSfsLine2(String(cfg.sfsLine2));
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await api.get("/hall-header");
      applyConfig(res.data?.data || res.data);
      setError("");
    } catch (err) {
      console.warn("Export header settings load:", err?.message || err);
      setError(err?.response?.data?.message || err?.message || "");
    } finally {
      setHydrated(true);
    }
  }, [applyConfig]);

  useEffect(() => {
    if (!autoLoad) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get("/hall-header");
        if (cancelled) return;
        applyConfig(res.data?.data || res.data);
        setError("");
      } catch (err) {
        if (!cancelled) {
          console.warn("Export header settings load:", err?.message || err);
        }
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [autoLoad, applyConfig]);

  const save = useCallback(async () => {
    setSaving(true);
    setSaveMsg("");
    setError("");
    try {
      const res = await api.put("/hall-header", {
        logo: logoType,
        department: departmentLine,
        program1: programmeLine1,
        program2: programmeLine2,
        sfsLine1,
        sfsLine2,
      });
      applyConfig(res.data?.data || res.data);
      setSaveMsg("Saved");
      setTimeout(() => setSaveMsg(""), 2000);
      return true;
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          err?.response?.data?.error ||
          err?.message ||
          "Failed to save"
      );
      return false;
    } finally {
      setSaving(false);
    }
  }, [
    logoType,
    departmentLine,
    programmeLine1,
    programmeLine2,
    sfsLine1,
    sfsLine2,
    applyConfig,
  ]);

  return {
    logoType,
    setLogoType,
    departmentLine,
    setDepartmentLine,
    programmeLine1,
    setProgrammeLine1,
    programmeLine2,
    setProgrammeLine2,
    sfsLine1,
    setSfsLine1,
    sfsLine2,
    setSfsLine2,
    isSfs,
    setIsSfs,
    hydrated,
    saving,
    saveMsg,
    error,
    load,
    save,
    headerOptions: {
      logoType,
      departmentLine,
      programmeLine1,
      programmeLine2,
      sfsLine1,
      sfsLine2,
      isSfs,
    },
  };
}
