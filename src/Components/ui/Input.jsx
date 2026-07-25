import React from "react";
import { cn } from "../../lib/utils";

export const Input = React.forwardRef(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "flex h-10 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm",
        "placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
});

export function Label({ className, children, ...props }) {
  return (
    <label
      className={cn("text-sm font-semibold text-gray-700", className)}
      {...props}
    >
      {children}
    </label>
  );
}
