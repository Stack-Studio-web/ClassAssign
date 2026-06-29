import { createContext, useCallback, useContext, useState } from "react";

const ToastContext = createContext(null);

let toastId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((type, message, title, duration = 5000) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, type, message, title }]);
    if (duration > 0) {
      setTimeout(() => dismiss(id), duration);
    }
    return id;
  }, [dismiss]);

  const toast = {
    success: (message, title = "Success") => push("success", message, title),
    error: (message, title = "Error") => push("error", message, title, 7000),
    info: (message, title = "Info") => push("info", message, title),
    warning: (message, title = "Warning") => push("warning", message, title),
    dismiss,
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-md w-full pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="alert"
            className={`pointer-events-auto rounded-lg shadow-lg border px-4 py-3 text-sm animate-in fade-in slide-in-from-top-2 ${
              t.type === "success"
                ? "bg-green-50 border-green-200 text-green-900"
                : t.type === "error"
                  ? "bg-red-50 border-red-200 text-red-900"
                  : t.type === "warning"
                    ? "bg-amber-50 border-amber-200 text-amber-900"
                    : "bg-blue-50 border-blue-200 text-blue-900"
            }`}
          >
            <div className="flex justify-between gap-3">
              <div>
                <p className="font-semibold">{t.title}</p>
                <p className="mt-0.5 whitespace-pre-wrap">{t.message}</p>
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="text-current opacity-60 hover:opacity-100 shrink-0"
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
