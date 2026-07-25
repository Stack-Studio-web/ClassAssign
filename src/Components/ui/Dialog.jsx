import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "./Button";

export function Dialog({ open, onOpenChange, children }) {
  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9990] flex items-center justify-center p-4"
      role="presentation"
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={() => onOpenChange?.(false)}
        aria-hidden
      />
      <div className="relative z-10 w-full max-w-lg">{children}</div>
    </div>,
    document.body
  );
}

export function DialogContent({ className, children, onClose, title, description }) {
  const ref = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "dialog-title" : undefined}
      aria-describedby={description ? "dialog-desc" : undefined}
      className={cn(
        "rounded-2xl border border-gray-100 bg-white shadow-xl outline-none",
        className
      )}
    >
      {children}
    </div>
  );
}

export function DialogHeader({ title, description, onClose }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
      <div>
        {title && (
          <h2 id="dialog-title" className="text-lg font-bold text-gray-900">
            {title}
          </h2>
        )}
        {description && (
          <p id="dialog-desc" className="mt-1 text-sm text-gray-500">
            {description}
          </p>
        )}
      </div>
      {onClose && (
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close dialog">
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

export function DialogFooter({ className, children }) {
  return (
    <div className={cn("flex flex-wrap justify-end gap-2 border-t border-gray-100 px-6 py-4", className)}>
      {children}
    </div>
  );
}
