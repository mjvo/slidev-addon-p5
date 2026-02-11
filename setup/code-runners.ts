// Helper to get the closest parent with a data-p5code-id attribute
function findClosestP5CodeIdElement(el: HTMLElement | null): HTMLElement | null {
  while (el) {
    if (el.hasAttribute && el.hasAttribute('data-p5code-id')) return el;
    el = el.parentElement;
  }
  return null;
}
// Public runner types exported for tests and downstream typing
export interface ExecuteInIframeResult {
  success: boolean;
  error?: string;
  element?: HTMLElement;
  stopButtonController?: StopButtonController;
}

export type JsRunnerCtx = Parameters<NonNullable<RunnerType['js']>>[1];

export type IframeElementLike = HTMLIFrameElement & { __messageHandler?: { reset?: () => void } };
import { defineCodeRunnersSetup } from "@slidev/types";
import { transpileGlobalToInstance } from "./p5-transpile";
// loop-protect is used to instrument user code to guard against infinite loops
// We `require` it dynamically to avoid bundler/top-level import issues in some Slidev setups.
/* eslint-disable @typescript-eslint/no-var-requires */
let loopProtect: ((code: string, opts?: Record<string, unknown>) => string) | undefined
try {
  const maybeRequire = (globalThis as { require?: (id: string) => unknown }).require
  const lp = typeof maybeRequire === 'function' ? maybeRequire('loop-protect') : undefined
  if (typeof lp === 'function') loopProtect = lp as (code: string, opts?: Record<string, unknown>) => string
} catch (e) {
  void 0
}
/* eslint-enable @typescript-eslint/no-var-requires */
import type { P5Instance } from '../types'
import { findSourcePlayButton } from "./play-button-finder";
import { findP5Container } from "./container-discovery";
import { getConsoleWrapperScript } from "./console-wrapper";
import { StopButtonController } from "./stop-button-controller";
import { CleanupManager } from "./cleanup-manager";
import { ErrorLineMapper } from "./error-line-mapper";
import { /* initializeP5Addon, getP5Addon */ } from "./types";
// Local helper types to avoid `any` in a few cast sites
type IframeWindowWithAddon = Window & { __p5Addon?: Record<string, unknown>; p5?: { instance?: P5Instance } };
type ParentWithP5ResizeHooks = HTMLElement & {
  __p5_onResize?: (detail: unknown) => void;
  onP5IframeResize?: (detail: unknown) => void;
  dispatchP5Resize?: (detail: unknown) => void;
};
import { safeRemoveP5 } from './p5-utils';

// Minimal, local runner interface that captures the shape we use from Slidev's
// runner object. This tightens typing compared to `any` while remaining
// resilient if @slidev/types changes; prefer importing the richer types from
// `@slidev/types` when available in the environment.
// Derive the runner parameter type from `defineCodeRunnersSetup` so we
// use the canonical shape provided by `@slidev/types` without hardcoding
// a type name that might drift. This yields the exact runner parameter
// type used by the setup callback.
type RunnerType = Parameters<Parameters<typeof defineCodeRunnersSetup>[0]>[0];

/**
 * Tracks p5 instances for cleanup when sketches are removed from DOM
 * Maps container HTMLElement → p5 instance for lifecycle management
 */
// Reuse shared safe removal helper from p5-utils

/**
 * Schedule fallback resize messages for iframe if internal resize didn't fire quickly
 *
 * When iframe's MutationObserver detects canvas, it posts resize messages.
 * If that times out, this fallback ensures the parent gets a resize message.
 *
 * Timing: First attempt at 250ms (after throttle window + buffer), second at 900ms.
 * These delays are carefully chosen to minimize redundant calls while ensuring coverage.
 * The IframeMessageHandler throttles to 150ms and deduplicates identical dimensions,
 * so even if both iframe and fallback fire, we coalesce efficiently.
 *
 * @param iframeWindow - The iframe's contentWindow
 * @param iframeElement - The iframe DOM element (used to route message to its parent)
 * @param delays - Millisecond delays to attempt resize checks [250, 900]
 */
const scheduleFallbackResize = (
  iframeWindow: Window | null,
  iframeElement: IframeElementLike,
  delays: number[] = [250, 900]
): void => {
  if (!iframeWindow) return;

  const sendResize = () => {
    const canvas = iframeWindow.document.querySelector('canvas') as HTMLCanvasElement | null;
    if (canvas) {
      const width = canvas.offsetWidth + 4;
      const height = canvas.offsetHeight + 4;
      
      // Send message directly to iframe's parent (not broadcast to all windows)
      // This prevents cross-talk between multiple P5Canvas components on same page
      if (iframeElement.parentElement) {
        try {
          // Create the event using the iframe element's owner document if possible.
          // Some DOM implementations (jsdom) throw a HierarchyRequestError when
          // dispatching events created in a different document. Creating the
          // event from the target's document avoids that.
          let ev: Event | null = null;
          const ownerDoc = iframeElement.ownerDocument || document;
          try {
            const ctor = ownerDoc.defaultView?.CustomEvent as typeof CustomEvent | undefined;
            if (typeof ctor === 'function') {
              ev = new ctor('p5-iframe-resize', { detail: { type: 'p5-resize', width, height }, bubbles: false, cancelable: false });
            }
          } catch (e) {
            // ignore and try createEvent below
          }
          if (!ev) {
            try {
              const ce = ownerDoc.createEvent('CustomEvent') as CustomEvent;
              // initCustomEvent is widely supported in older/dom emulations
              ce.initCustomEvent('p5-iframe-resize', false, false, { type: 'p5-resize', width, height });
              ev = ce;
            } catch (e) {
              // Last resort: create a plain Event and attach detail property
              try {
                ev = ownerDoc.createEvent('Event');
                ev.initEvent('p5-iframe-resize', false, false);
                (ev as Event & { detail?: unknown }).detail = { type: 'p5-resize', width, height };
              } catch (e) {
                ev = null;
              }
            }
          }

          if (ev) {
            try {
              iframeElement.parentElement.dispatchEvent(ev);
            } catch (e) {
              // Some DOM emulations (jsdom) raise cross-document errors; try a
              // direct callback fallback on the parent element so tests can
              // reliably observe resize without depending on CustomEvent wiring.
              try {
                const detail = (ev instanceof CustomEvent ? ev.detail : (ev as Event & { detail?: unknown }).detail) || { type: 'p5-resize', width, height };
                // Common fallback hooks for test environments
                const parent = iframeElement.parentElement as ParentWithP5ResizeHooks | null;
                if (parent && typeof parent.__p5_onResize === 'function') {
                  parent.__p5_onResize(detail);
                } else if (parent && typeof parent.onP5IframeResize === 'function') {
                  parent.onP5IframeResize(detail);
                } else if (parent && typeof parent.dispatchP5Resize === 'function') {
                  parent.dispatchP5Resize(detail);
                }
              } catch (ee) {
                // swallow any fallback errors
              }
            }
          }
        } catch (e) {
          // Silently ignore any cross-document or dispatch errors in test environments
        }
      }
    }
  };

  delays.forEach((delay) => setTimeout(sendResize, delay));
};

/**
 * Format error message with line number mapping
 * Maps error line numbers from transpiled code back to source code
 *
 * @param error - The error object
 * @param sourceCode - Original source code
 * @param transpiledCode - Transpiled code
 * @param consoleWrapperLinesCount - Number of console wrapper lines injected
 * @returns Formatted error message with mapped line numbers
 */
const formatErrorWithLineMapping = (
  error: unknown,
  sourceCode: string,
  transpiledCode: string,
  consoleWrapperLinesCount: number = 0
): string => {
  const errObj = (error as { message?: unknown; stack?: unknown } | null) ?? null;
  const errorMessage = typeof errObj?.message === 'string' ? errObj.message : String(error ?? 'Unknown error');
  const errorStack = typeof errObj?.stack === 'string' ? errObj.stack : '';
  const fullError = `${errorMessage}\n\n${errorStack}`;

  try {
    const mapper = new ErrorLineMapper(sourceCode, transpiledCode, consoleWrapperLinesCount);
    const mappedError = mapper.mapErrorMessage(fullError);
    return mappedError;
  } catch (e) {
    // If mapping fails, return original error
    return fullError;
  }
};

/**
 * Execute p5 code in iframe context
 * 
 * Runs transpiled p5.js instance mode code inside an iframe window,
 * sets up console capture, creates stop button controller, and schedules
 * fallback resize messages.
 * 
 * @param iframe - The iframe element to execute code in
 * @param transpiled - Transpiled p5.js code (instance mode)
 * @returns Promise resolving to:
 *   - success: Whether execution succeeded
 *   - error: Error message if execution failed
 *   - element: HTMLElement for console log output (if successful)
 *   - stopButtonController: Controller for managing stop button lifecycle (if successful)
 */
const executeInIframeContext = async (
  iframe: IframeElementLike,
  transpiled: string
): Promise<ExecuteInIframeResult> => {
  const iframeWindow = iframe.contentWindow;
  const iwWindow = iframeWindow as IframeWindowWithAddon;
  if (!iframeWindow) {
    return { success: false, error: 'Cannot access iframe window' };
  }

  try {
    // Check if p5 is available in iframe
    if (typeof (iframeWindow as unknown as { p5?: unknown }).p5 === 'undefined') {
      return { success: false, error: 'p5.js not loaded in iframe' };
    }

    // Clear logs from previous execution
    if (!iwWindow.__p5Addon) {
      iwWindow.__p5Addon = {};
    }
    if (!iwWindow.__p5Addon.logs) {
      (iwWindow.__p5Addon.logs as unknown[] | undefined) = [];
    } else {
      (iwWindow.__p5Addon.logs as unknown[]).length = 0; // Clear without reassigning
    }

    // Get or create p5 container in iframe
    let container = iframeWindow.document.getElementById('p5-container');
    if (!container) {
      container = iframeWindow.document.createElement('div');
      container.id = 'p5-container';
      iframeWindow.document.body.appendChild(container);
    } else {
      // Clear previous p5 instance if it exists
          if (iwWindow.p5 && (iwWindow.p5.instance as unknown)) {
        try {
          safeRemoveP5(iwWindow.p5.instance);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
      // Clear container
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
    }

    // Live log sink: create early so it can be used in callbacks
    const logContainer = document.createElement('pre');
    logContainer.style.cssText = 'max-height: 10em; overflow: auto; margin: 0; white-space: pre-wrap;';
    // logContainer.style.cssText = 'max-height: 10em; overflow: auto; margin: 0; padding: 0.25rem 0.5rem; background: #111; color: #eee; border-radius: 6px; white-space: pre-wrap;';

    const appendLog = (msg: string) => {
      if (logContainer.textContent && logContainer.textContent.length > 0) {
        logContainer.textContent += '\n';
      }
      logContainer.textContent += msg;
      logContainer.scrollTop = logContainer.scrollHeight;
    };

    // Create stop button controller for this execution
    const stopButtonController = new StopButtonController(iframeWindow, appendLog);

    // Expose function that iframe can call to insert button in parent DOM
    if (!window.__p5Addon) window.__p5Addon = {};
    window.__p5Addon.insertStopButton = (sourcePlayBtn: HTMLElement) => {
      try {
        stopButtonController.insertNext(sourcePlayBtn);
      } catch (e) {
        // swallow insertion errors in non-browser/test environments
      }
    };

    // Register callback BEFORE p5 code executes
    if (!iframeWindow.__p5Addon) iframeWindow.__p5Addon = {};
    iframeWindow.__p5Addon.onReady = () => {
      const sourcePlayBtn = iframeWindow.__p5Addon.sourcePlayButton;

      // Call parent window's function to insert button
      if (window.__p5Addon?.insertStopButton && sourcePlayBtn) {
        try {
          // Prevent cross-document insertion errors in test environments
          // by ensuring the source element belongs to the same document as the
          // parent. If it does not, attempt to find a stable fallback or
          // simply skip inserting the stop button.
          const ownerDoc = sourcePlayBtn.ownerDocument;
          if (!ownerDoc || ownerDoc === document) {
            window.__p5Addon.insertStopButton(sourcePlayBtn);
          } else {
            // If sourcePlayBtn is from a different document (iframe), try
            // to use its identifying attributes to find a matching element
            // in the parent document. This keeps unit tests and cross-doc
            // environments safe.
            try {
              const maybeId = sourcePlayBtn.getAttribute('data-p5code-id');
              if (maybeId) {
                const parentEl = document.querySelector(`[data-p5code-id="${maybeId}"]`) as HTMLElement | null;
                if (parentEl) window.__p5Addon.insertStopButton(parentEl);
              }
            } catch (e) {
              // ignore and skip insertion in this environment
            }
          }
        } catch (e) {
          // Swallow insertion errors in test environments (jsdom cross-document)
        }
      }
    };

    // Expose sink to iframe so its console wrappers can stream logs
    iframeWindow.__p5Addon.appendLog = appendLog;
    // Get console wrapper code
    const consoleWrapperCode = getConsoleWrapperScript();
    const wrappedCode = `
      ${consoleWrapperCode}
      
      ${transpiled}
    `;

    // Execute code in iframe context with p5 instance using a blob-injected script
    try {
      const scriptContent = `
        (function() {
          if (!window.__p5Addon) window.__p5Addon = {};
          window.__p5Addon.originalLog = window.__p5Addon.originalLog || window.console.log.bind(console);
          window.__p5Addon.originalError = window.__p5Addon.originalError || window.console.error.bind(console);
          window.__p5Addon.originalWarn = window.__p5Addon.originalWarn || window.console.warn.bind(console);
          window.__p5Addon.appendLog = window.__p5Addon.appendLog || function() {};
          let p5Instance;
          p5Instance = new window.p5((p) => {
            const _p = p;
            ${wrappedCode}
          }, 'p5-container');
          window.p5.instance = p5Instance;
          if (typeof window.__p5Addon.onReady === 'function') window.__p5Addon.onReady();
        })();
      `;

      const blob = new Blob([scriptContent], { type: 'text/javascript' });
      const url = URL.createObjectURL(blob);
      const scriptEl = iframeWindow.document.createElement('script');
      scriptEl.src = url;
      const appendPromise = new Promise<void>((resolve, reject) => {
        scriptEl.onload = () => {
          try { URL.revokeObjectURL(url); } catch (e) { void 0 }
          resolve();
        };
        scriptEl.onerror = () => {
          try { URL.revokeObjectURL(url); } catch (e) { void 0 }
          reject(new Error('Error loading injected p5 script'));
        };
      });
      iframeWindow.document.body.appendChild(scriptEl);
      await appendPromise;
    } catch (e) {
      // If injection fails, surface an error
      return { success: false, error: String(e) };
    }

    // Focus the canvas inside the iframe for immediate keyboard/mouse capture
    try {
      const canvas = iframeWindow.document.querySelector('canvas') as HTMLCanvasElement | null;
      if (canvas) {
        if (!canvas.hasAttribute('tabindex')) {
          canvas.setAttribute('tabindex', '0');
        }
        (canvas as HTMLElement).focus?.();
      }
    } catch (e) {
      // ignore focus errors in non-browser/test environments
    }

    // Fallback: if the iframe's internal resize script doesn't fire quickly,
    // measure the canvas and send a resize message from the parent.
    // This ensures the iframe element resizes even if mutation observer timing varies.
    try {
      scheduleFallbackResize(iframeWindow, iframe);
    } catch (e) {
      // ignore scheduling errors in non-browser/test environments
    }

    // Return the live log element and stop button controller
    return {
      success: true,
      element: logContainer,
      stopButtonController,
    };
  } catch (error: unknown) {
    const errorMessage = formatErrorWithLineMapping(error, transpiled, transpiled, 0);
    return {
      success: false,
      error: errorMessage,
    };
  }
};

// Export helpers for unit testing
export { executeInIframeContext, formatErrorWithLineMapping, scheduleFallbackResize, findClosestP5CodeIdElement };

export default defineCodeRunnersSetup((runner: RunnerType) => {
  const customJs: NonNullable<RunnerType['js']> = async (code: string, ctx: unknown) => {
    // Detect p5.js code by looking for setup() function
    const looksLikeP5 = /\b(function\s+setup|const\s+setup|let\s+setup|setup\s*=)/i.test(code);
    
    // Track transpiled code for error mapping
    let transpiled: string | null = null;
    
    if (!looksLikeP5) {
      // Not p5 code - fall back to default JavaScript execution via runner
      if (runner && runner.js) {
        return runner.js(code, ctx as unknown as JsRunnerCtx);
      }
      // Fallback if no default runner
      const logs: string[] = [];
      const originalLog = console.log;
      const originalError = console.error;
      const originalWarn = console.warn;
      try {
        console.log = (...args) => { logs.push(args.join(' ')); originalLog(...args); };
        console.error = (...args) => { logs.push('Error: ' + args.join(' ')); originalError(...args); };
        console.warn = (...args) => { logs.push('Warning: ' + args.join(' ')); originalWarn(...args); };

        const result = eval(code);
        if (result !== undefined) {
          logs.push(String(result));
        }
        return { text: logs.join('\n') || 'Code executed successfully' };
      } catch (error: unknown) {
        const msg = (error as { message?: unknown } | null)?.message;
        return { text: `Error: ${typeof msg === 'string' ? msg : String(error)}` };
      } finally {
        console.log = originalLog;
        console.error = originalError;
        console.warn = originalWarn;
      }
    }
    
    // p5.js code detected - transpile and execute
    // Note: addon is iframe-first; DOM fallback has been removed.
    try {
      // **CRITICAL**: Capture the play button BEFORE p5 execution
      const sourcePlayButton = findSourcePlayButton(document.activeElement as HTMLElement);
      // Instrument user code with loop-protect (if available) to guard infinite loops
      let codeToTranspile = code
      try {
        if (loopProtect) {
          // Provide a simple id so errors can be correlated if needed
          codeToTranspile = loopProtect(code, { id: `lp-${Date.now()}` })
        }
      } catch (e) {
        void 0
      }

      // Transpile global mode to instance mode
      transpiled = transpileGlobalToInstance(codeToTranspile);
      if (!transpiled) {
        return { text: 'Error: Failed to transpile p5.js code. Please check syntax.' };
      }
      // Check if p5.js is loaded
      if (typeof window.p5 === 'undefined') {
        return { 
          text: 'Error: p5.js library not loaded. Add this to your slides.md headmatter:\n\n---\nhead: |\n  <script src="https://cdn.jsdelivr.net/npm/p5@2.2.0/lib/p5.min.js"></script>\n---' 
        };
      }
      // Try to find P5Canvas/P5Code wrapper and use its container or iframe
      // Try to find the correct P5Code iframe by UUID, prioritizing Monaco context if available
      let iframeElement: HTMLIFrameElement | null = null;
      let codeId = null;
      // Always use the closest data-p5code-id to the play/run button or code block
      const playBtn = document.activeElement as HTMLElement | null;
      if (playBtn && playBtn.closest) {
        const codeIdEl = playBtn.closest('[data-p5code-id]') as HTMLElement | null;
        if (codeIdEl) {
          codeId = codeIdEl.getAttribute('data-p5code-id');
          iframeElement = document.querySelector(`iframe[data-p5code-id="${codeId}"]`);
        }
      }
      // Fallback: try the old method (active element ancestry)
      if (!iframeElement) {
        const codeIdEl = findClosestP5CodeIdElement(document.activeElement as HTMLElement | null);
        if (codeIdEl) {
          codeId = codeIdEl.getAttribute('data-p5code-id');
          iframeElement = document.querySelector(`iframe[data-p5code-id="${codeId}"]`);
        }
      }
      // GUARD: If we still have no codeId or iframe, refuse to run silently
      if (!codeId || !iframeElement) {
        return { text: '' };
      }
      // Try a final discovery for iframe if we still don't have one
      if (!iframeElement) {
        const containerResult = findP5Container(document.activeElement as HTMLElement);
        iframeElement = containerResult.iframeElement;
      }
      // If still no iframe, refuse to run
      if (!iframeElement) {
        return { text: '' };
      }
      // If iframe is present, execute code in iframe context
      if (iframeElement && iframeElement.contentWindow) {
        // Give the iframe a moment to initialize if needed
        if (typeof (iframeElement.contentWindow as unknown as { p5?: unknown }).p5 === 'undefined') {
          return { text: 'Error: p5.js not yet loaded in iframe. Please wait a moment and try again.' };
        }
        // Reset resize deduplication state before each execution
        // This ensures resize events are processed even if canvas dimensions match previous execution
        const handler = (iframeElement as unknown as { __messageHandler?: { reset?: () => void } }).__messageHandler;
        if (handler && typeof handler.reset === 'function') {
          handler.reset();
        }
        // Expose the source play button reference BEFORE executing
        const iw = iframeElement.contentWindow as IframeWindowWithAddon;
        if (!iw.__p5Addon) iw.__p5Addon = {};
        iw.__p5Addon.sourcePlayButton = sourcePlayButton;
        // Execute in iframe context
        const iframeResult = await executeInIframeContext(iframeElement, transpiled);
        if (!iframeResult.success) {
          return { text: `Error in iframe: ${iframeResult.error}` };
        }
        // Extract stop button controller and log element for cleanup
        const stopButtonController = iframeResult.stopButtonController;
        const logElement = iframeResult.element;
        // Set up cleanup when iframe leaves viewport
        const cleanupManager = new CleanupManager();
        cleanupManager.observeVisibility(iframeElement, () => {
          try {
            const iw = iframeElement.contentWindow as IframeWindowWithAddon | null;
            if (iw?.p5?.instance) {
              safeRemoveP5(iw.p5.instance);
            }
            // Clear iframe content
            const container = iframeElement.contentWindow?.document.getElementById('p5-container');
            if (container) {
              while (container.firstChild) {
                container.removeChild(container.firstChild);
              }
            }
            // Hide stop button when leaving slide
            if (stopButtonController) {
              const stopBtn = stopButtonController.getButton();
              if (stopBtn && stopBtn.parentElement) {
                stopBtn.style.display = 'none';
              }
            }
            // Clear console output when leaving slide
            if (logElement && logElement.textContent) {
              logElement.textContent = '';
            }
          } catch (e) {
            // Silently handle cleanup errors
          }
        });
        
        // Also clean up if iframe is removed from DOM
        cleanupManager.observeMutation(document.body, iframeElement, () => {
          try {
            const iw = iframeElement.contentWindow as IframeWindowWithAddon | null;
            if (iw?.p5?.instance) {
              safeRemoveP5(iw.p5.instance);
            }
          } catch (e) {
            // Silently handle cleanup errors
          }
        });
        
        if (iframeResult.element) {
          return { element: iframeResult.element };
        }
        return { text: 'Sketch loaded successfully' };
      }
      
      // DOM fallback removed: require an iframe to run p5 sketches.
      return { text: 'Error: No iframe found for p5 execution. Ensure a P5Canvas/P5Code iframe is present.' };
    } catch (error: unknown) {
      const mappedError = formatErrorWithLineMapping(error, code, transpiled || code, 0);
      return { text: mappedError };
    }
  };
  
  return {
    ...runner,
    js: customJs,
    javascript: customJs,
  };
});
