/**
 * Console Wrapper - Captures and bridges console output from p5 sketches
 *
 * This module provides console wrapping functionality for iframe mode:
 * - Iframe mode: JavaScript code injected into iframe context
 *
 * Console output is captured to display in the Monaco code runner's output panel
 * instead of the browser console, giving users immediate feedback.
 */

/**
 * Create the console wrapper JavaScript code for iframe execution
 *
 * This code is injected into the iframe to override console.log/error/warn methods
 * and forward output to the parent window via callbacks.
 *
 * The code assumes these are available in the iframe context:
 * - window.__p5Addon.logs: string[] array to store log messages
 * - window.__p5Addon.appendLog: function to forward logs to parent
 * - window.__p5Addon.originalLog/Error/Warn: original console methods
 *
 * @returns JavaScript code string that wraps console methods
 *
 * @example
 * const wrapper = getConsoleWrapperScript();
 * const fullCode = `
 *   ${wrapper}
 *   // User's p5 code here
 * `;
 * iframeWindow.eval(fullCode);
 */
export const getConsoleWrapperScript = (): string => {
  return `
// Wrap console with direct function definitions
window.console.log = function(...args) {
  try {
    const message = args.map(arg => {
      if (typeof arg === 'object') {
        try { return JSON.stringify(arg); }
        catch { return String(arg); }
      }
      return String(arg);
    }).join(' ');
    window.__p5Addon.logs.push(message);
    if (typeof window.__p5Addon.appendLog === 'function') {
      window.__p5Addon.appendLog(message);
    }
    window.__p5Addon.originalLog(...args);
  } catch (e) {
    window.__p5Addon.originalLog('[p5 Console Bridge Error]', e);
  }
};

window.console.error = function(...args) {
  try {
    const message = 'Error: ' + args.map(arg => {
      if (typeof arg === 'object') {
        try { return JSON.stringify(arg); }
        catch { return String(arg); }
      }
      return String(arg);
    }).join(' ');
    window.__p5Addon.logs.push(message);
    if (typeof window.__p5Addon.appendLog === 'function') {
      window.__p5Addon.appendLog(message);
    }
    window.__p5Addon.originalError(...args);
  } catch (e) {
    window.__p5Addon.originalLog('[p5 Console Bridge Error]', e);
  }
};

window.console.warn = function(...args) {
  try {
    const message = 'Warning: ' + args.map(arg => {
      if (typeof arg === 'object') {
        try { return JSON.stringify(arg); }
        catch { return String(arg); }
      }
      return String(arg);
    }).join(' ');
    window.__p5Addon.logs.push(message);
    if (typeof window.__p5Addon.appendLog === 'function') {
      window.__p5Addon.appendLog(message);
    }
    window.__p5Addon.originalWarn(...args);
  } catch (e) {
    window.__p5Addon.originalLog('[p5 Console Bridge Error]', e);
  }
};
  `;
};
// DOM console wrapper removed — addon is iframe-first. Use `getConsoleWrapperScript`
// for iframe-based console capture. If you need a DOM-based wrapper in future,
// reintroduce it here with the same `restore()` / `getLogs()` API shape.

