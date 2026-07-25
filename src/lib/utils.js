/** @param {...import('clsx').ClassValue} inputs */
export function cn(...inputs) {
  return inputs.filter(Boolean).join(" ");
}
