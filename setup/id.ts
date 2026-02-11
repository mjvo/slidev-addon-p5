/**
 * ID helpers
 *
 * Prefer native crypto.randomUUID when available to avoid extra deps.
 * Fallback to a small, reasonably unique ID for older environments.
 */
export const createSketchId = (): string => {
  try {
    const g = typeof globalThis !== 'undefined' ? globalThis : undefined;
    const cryptoObj = g && typeof g === 'object' ? (g as { crypto?: Crypto }).crypto : undefined;
    if (cryptoObj?.randomUUID) {
      return cryptoObj.randomUUID();
    }
  } catch (e) {
    // ignore and fall back
  }
  // Fallback: timestamp + random suffix
  return `p5-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};
