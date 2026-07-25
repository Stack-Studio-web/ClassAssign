import React from "react";
import { cn } from "../../lib/utils";

const variants = {
  default: "bg-blue-600 text-white hover:bg-blue-700 shadow-sm",
  outline: "border border-gray-200 bg-white text-gray-800 hover:bg-gray-50",
  ghost: "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
  destructive: "bg-red-600 text-white hover:bg-red-700",
  secondary: "bg-gray-100 text-gray-900 hover:bg-gray-200",
};

const sizes = {
  default: "h-10 px-4 py-2 text-sm",
  sm: "h-8 px-3 text-xs",
  lg: "h-11 px-6 text-sm",
  icon: "h-9 w-9 p-0",
};

export function Button({
  className,
  variant = "default",
  size = "default",
  disabled,
  type = "button",
  children,
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-50",
        variants[variant] ?? variants.default,
        sizes[size] ?? sizes.default,
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
