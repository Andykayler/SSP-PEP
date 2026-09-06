// src/components/ui/format.js
// Formatting helpers used across the module pages.
//
// Kept out of ModuleKit.jsx because that file exports React components, and a
// module mixing components with plain values breaks Fast Refresh — the whole
// file reloads instead of the component hot-swapping.

/** Tone names the kit understands, in increasing order of alarm. */
export const TONES = ["neutral", "primary", "success", "warning", "danger"];

/** Money, the way a Malawian school office writes it. */
export function money(n) {
  return `MK ${Number(n || 0).toLocaleString("en-MW", { maximumFractionDigits: 0 })}`;
}
