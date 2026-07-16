/**
 * Minimal className combiner. Filters falsy values and joins with a space.
 * Avoids a runtime dependency on clsx/tailwind-merge for the scaffold.
 */
export type ClassValue = string | number | false | null | undefined;

export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(" ");
}
