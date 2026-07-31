import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { registerDialogImpl, unregisterDialogImpl } from "../lib/dialogBridge";

const ConfirmContext = createContext(null);

function GlobeIcon() {
  return (
    <svg
      className="h-4 w-4 shrink-0 text-white/90"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.8 4 6 4 9s-1.5 6.2-4 9M12 3c-2.5 2.8-4 6-4 9s1.5 6.2 4 9" />
    </svg>
  );
}

function normalizeOptions(input) {
  if (typeof input === "string") return { message: input };
  return input || {};
}

function DialogShell({ origin, title, message, body, actions, onBackdropClick }) {
  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.55)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onBackdropClick?.();
      }}
    >
      <div
        className="w-full max-w-[420px]"
        style={{
          backgroundColor: "#3b3b4d",
          borderRadius: "12px",
          boxShadow: "0 12px 40px rgba(0, 0, 0, 0.5)",
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        aria-describedby="app-dialog-message"
      >
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-center gap-2 mb-4">
            <GlobeIcon />
            <span className="text-[13px] text-white/90 font-normal">{origin}</span>
          </div>

          {title ? (
            <p
              id="app-dialog-title"
              className="text-[15px] font-medium text-white mb-1.5 leading-snug"
            >
              {title}
            </p>
          ) : null}

          <p
            id="app-dialog-message"
            className={`text-white leading-relaxed whitespace-pre-wrap ${
              title ? "text-[15px] text-white/85" : "text-[16px]"
            }`}
          >
            {message}
          </p>

          {body}
        </div>

        {actions}
      </div>
    </div>
  );
}

function DialogButtons({ cancelLabel, confirmLabel, onCancel, onConfirm, confirmRef }) {
  return (
    <div className="flex justify-end gap-2.5 px-5 pb-5">
      <button
        ref={confirmRef}
        type="button"
        autoFocus
        className="min-w-[72px] px-5 py-2 text-[14px] font-semibold rounded-lg transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
        style={{ backgroundColor: "#00d1ff", color: "#0a0a0a" }}
        onClick={onConfirm}
      >
        {confirmLabel}
      </button>
      <button
        type="button"
        className="min-w-[72px] px-5 py-2 text-[14px] font-medium rounded-lg text-white transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
        style={{ backgroundColor: "#4a4a5e" }}
        onClick={onCancel}
      >
        {cancelLabel}
      </button>
    </div>
  );
}

export function ConfirmProvider({ children }) {
  const [confirmState, setConfirmState] = useState(null);
  const [promptState, setPromptState] = useState(null);
  const confirmResolverRef = useRef(null);
  const promptResolverRef = useRef(null);
  const confirmBtnRef = useRef(null);
  const promptInputRef = useRef(null);

  const origin =
    typeof window !== "undefined" ? window.location.host || "Hallora" : "Hallora";

  const closeConfirm = useCallback((result) => {
    setConfirmState(null);
    confirmResolverRef.current?.(result);
    confirmResolverRef.current = null;
  }, []);

  const closePrompt = useCallback((result) => {
    setPromptState(null);
    promptResolverRef.current?.(result);
    promptResolverRef.current = null;
  }, []);

  const showConfirm = useCallback((input) => {
    const opts = normalizeOptions(input);
    const {
      title,
      message = "",
      confirmLabel = "OK",
      cancelLabel = "Cancel",
    } = opts;

    return new Promise((resolve) => {
      confirmResolverRef.current = resolve;
      setPromptState(null);
      setConfirmState({ title, message, confirmLabel, cancelLabel });
    });
  }, []);

  const showPrompt = useCallback((input) => {
    const opts = normalizeOptions(input);
    const {
      title,
      message = "",
      confirmLabel = "OK",
      cancelLabel = "Cancel",
      defaultValue = "",
      placeholder = "",
      inputType = "text",
    } = opts;

    return new Promise((resolve) => {
      promptResolverRef.current = resolve;
      setConfirmState(null);
      setPromptState({
        title,
        message,
        confirmLabel,
        cancelLabel,
        defaultValue,
        placeholder,
        inputType,
        value: defaultValue,
      });
    });
  }, []);

  useEffect(() => {
    if (confirmState) {
      const t = setTimeout(() => confirmBtnRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [confirmState]);

  useEffect(() => {
    if (promptState) {
      const t = setTimeout(() => promptInputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [promptState]);

  useEffect(() => {
    if (!confirmState && !promptState) return undefined;

    const onKey = (e) => {
      if (e.key === "Escape") {
        if (confirmState) closeConfirm(false);
        if (promptState) closePrompt(null);
      }
      if (e.key === "Enter" && confirmState && !promptState) {
        e.preventDefault();
        closeConfirm(true);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmState, promptState, closeConfirm, closePrompt]);

  const handlePromptSubmit = () => {
    if (!promptState) return;
    closePrompt(promptState.value ?? "");
  };

  useEffect(() => {
    registerDialogImpl(showConfirm, showPrompt);

    const blockNativeConfirm = (message) => {
      console.warn(
        "[ClassAssign] Native window.confirm() was blocked. Use showConfirm from useConfirm() instead.",
        message
      );
      void showConfirm(String(message ?? ""));
      return false;
    };

    const blockNativePrompt = (message, defaultValue) => {
      console.warn(
        "[ClassAssign] Native window.prompt() was blocked. Use showPrompt from usePrompt() instead.",
        message
      );
      void showPrompt({ message: String(message ?? ""), defaultValue: defaultValue ?? "" });
      return null;
    };

    const nativeConfirm = window.confirm.bind(window);
    const nativePrompt = window.prompt.bind(window);

    window.confirm = blockNativeConfirm;
    window.prompt = blockNativePrompt;

    return () => {
      unregisterDialogImpl();
      window.confirm = nativeConfirm;
      window.prompt = nativePrompt;
    };
  }, [showConfirm, showPrompt]);

  return (
    <ConfirmContext.Provider value={{ confirm: showConfirm, prompt: showPrompt }}>
      {children}

      {confirmState && (
        <DialogShell
          origin={origin}
          title={confirmState.title}
          message={confirmState.message}
          onBackdropClick={() => closeConfirm(false)}
          actions={
            <DialogButtons
              confirmRef={confirmBtnRef}
              cancelLabel={confirmState.cancelLabel}
              confirmLabel={confirmState.confirmLabel}
              onConfirm={() => closeConfirm(true)}
              onCancel={() => closeConfirm(false)}
            />
          }
        />
      )}

      {promptState && (
        <DialogShell
          origin={origin}
          title={promptState.title}
          message={promptState.message}
          onBackdropClick={() => closePrompt(null)}
          body={
            <input
              ref={promptInputRef}
              type={promptState.inputType}
              value={promptState.value}
              placeholder={promptState.placeholder}
              className="mt-4 w-full px-3 py-2.5 rounded-lg text-[15px] text-white placeholder:text-white/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
              style={{
                backgroundColor: "#2a2a32",
                border: "1px solid #4A4A55",
              }}
              onChange={(e) =>
                setPromptState((prev) => ({ ...prev, value: e.target.value }))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handlePromptSubmit();
                }
              }}
            />
          }
          actions={
            <DialogButtons
              cancelLabel={promptState.cancelLabel}
              confirmLabel={promptState.confirmLabel}
              onConfirm={handlePromptSubmit}
              onCancel={() => closePrompt(null)}
            />
          }
        />
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx.confirm;
}

/** Prefer assigning to `showConfirm` — never name the variable `confirm` (Firefox global collision). */
export function useShowConfirm() {
  return useConfirm();
}

export function usePrompt() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("usePrompt must be used within ConfirmProvider");
  return ctx.prompt;
}
