/**
 * Type definitions for p5 addon globals
 * Provides TypeScript interfaces for window.__p5Addon namespace
 */

/**
 * Global namespace for p5 addon functionality
 * Consolidates all __p5* variables into a single object to prevent global namespace pollution
 */
export interface P5AddonGlobals {
  // Console and logging
  appendLog?: (msg: string) => void;
  logs?: string[];
  originalLog?: typeof console.log;
  originalError?: typeof console.error;
  originalWarn?: typeof console.warn;

  // Stop button management
  insertStopButton?: (btn: HTMLElement) => void;
  sourcePlayButton?: HTMLElement | null;

  // Lifecycle callbacks
  onReady?: () => void;
}

/**
 * Declare global Window interface to include __p5Addon, p5, and eval
 */
declare global {
  interface Window {
    __p5Addon: P5AddonGlobals;
    
    // p5.js instance when in global mode
    // In instance mode (used by this addon), p5 is accessed via variable
    p5?: unknown;

    // Standard JavaScript eval function
    // Redeclared here for clarity (already exists on Window, but TypeScript sometimes needs explicit declaration)
    eval: (code: string) => unknown;
  }
}

/**
 * Initialize the global p5 addon namespace if it doesn't exist
 */
export const initializeP5Addon = (): P5AddonGlobals => {
  if (!window.__p5Addon) {
    window.__p5Addon = {};
  }
  return window.__p5Addon;
};

/**
 * Get the p5 addon namespace, initializing if needed
 */
export const getP5Addon = (): P5AddonGlobals => {
  return initializeP5Addon();
};

/**
 * Clear the p5 addon namespace (useful for cleanup between slide transitions)
 */
export const clearP5Addon = (): void => {
  if (window.__p5Addon) {
    window.__p5Addon = {};
  }
};
