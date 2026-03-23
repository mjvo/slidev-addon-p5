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

export type IframeElementLike = HTMLIFrameElement & {
  __messageHandler?: { reset?: () => void };
  __cleanupManager?: { disconnectAll?: () => void };
};
import { defineCodeRunnersSetup } from "@slidev/types";
import * as acorn from "acorn";
import { transpileGlobalToInstance } from "./p5-transpile";
import p5Main from "./p5-main";
import { instrumentLoops } from "./loop-guard";
import { TIMING_CONFIG } from "./config";
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
import { resetIframeToBaseHtml, safeRemoveP5, stopP5SoundPlayback } from './p5-utils';

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

const disconnectIframeCleanupManager = (iframeElement: IframeElementLike): void => {
  const manager = iframeElement.__cleanupManager;
  if (!manager) return;
  try {
    if (typeof manager.disconnectAll === 'function') {
      manager.disconnectAll();
    }
  } catch (e) {
    // ignore teardown errors
  } finally {
    delete iframeElement.__cleanupManager;
  }
};

type AstNode = {
  type: string;
  [key: string]: unknown;
};

type AstProgramNode = AstNode & {
  type: 'Program';
  body: AstNode[];
};

const P5_LIFECYCLE_NAMES = new Set<string>([
  ...p5Main.functions,
  'windowResized',
  'mouseMoved',
  'mouseDragged',
  'mousePressed',
  'mouseReleased',
  'mouseClicked',
  'doubleClicked',
  'mouseWheel',
  'keyPressed',
  'keyReleased',
  'keyTyped',
  'touchStarted',
  'touchMoved',
  'touchEnded',
]);

const P5_SIGNATURE_CALL_NAMES = new Set<string>([
  'createCanvas',
  'resizeCanvas',
  'noCanvas',
  'createGraphics',
  'createFramebuffer',
  'createCapture',
  'createVideo',
  'createAudio',
  'createImage',
  'loadImage',
  'saveCanvas',
  'pixelDensity',
  'frameRate',
  'noLoop',
  'loop',
]);

const P5_IFRAME_READY_TIMEOUT_MS = 8000;
const P5_IFRAME_READY_POLL_MS = 50;

const looksLikeP5ByRegex = (code: string): boolean =>
  /\b(function\s+setup|const\s+setup|let\s+setup|var\s+setup|setup\s*=)/i.test(code);

const isAstNode = (value: unknown): value is AstNode =>
  typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string';

const isIdentifierNode = (value: unknown): value is AstNode & { type: 'Identifier'; name: string } =>
  isAstNode(value) && value.type === 'Identifier' && typeof (value as { name?: unknown }).name === 'string';

const isFunctionLikeNode = (value: unknown): boolean =>
  isAstNode(value) && (value.type === 'FunctionExpression' || value.type === 'ArrowFunctionExpression');

const getAstNodeArray = (value: unknown): AstNode[] => {
  if (!Array.isArray(value)) return [];
  return value.filter(isAstNode);
};

const parseProgramForDetection = (code: string): AstProgramNode | null => {
  for (const sourceType of ['script', 'module'] as const) {
    try {
      const parsed = acorn.parse(code, {
        ecmaVersion: 'latest',
        sourceType,
        allowHashBang: true,
      }) as unknown;
      if (isAstNode(parsed) && parsed.type === 'Program') {
        const body = getAstNodeArray((parsed as { body?: unknown }).body);
        (parsed as AstProgramNode).body = body;
        return parsed as AstProgramNode;
      }
    } catch (e) {
      void e;
    }
  }
  return null;
};

const getAssignedIdentifierName = (left: unknown): string | null => {
  if (isIdentifierNode(left)) {
    return left.name;
  }
  if (!isAstNode(left) || left.type !== 'MemberExpression') {
    return null;
  }
  const object = (left as { object?: unknown }).object;
  const property = (left as { property?: unknown }).property;
  const computed = Boolean((left as { computed?: unknown }).computed);
  if (
    !computed &&
    isIdentifierNode(object) &&
    isIdentifierNode(property) &&
    (object.name === 'window' || object.name === 'globalThis' || object.name === 'self')
  ) {
    return property.name;
  }
  return null;
};

const hasTopLevelP5LifecycleHook = (program: AstProgramNode): boolean => {
  for (const statement of getAstNodeArray(program.body)) {
    if (statement.type === 'FunctionDeclaration') {
      const functionId = (statement as { id?: unknown }).id;
      if (isIdentifierNode(functionId) && P5_LIFECYCLE_NAMES.has(functionId.name)) {
        return true;
      }
      continue;
    }

    if (statement.type === 'VariableDeclaration') {
      const declarations = getAstNodeArray((statement as { declarations?: unknown }).declarations);
      for (const declaration of declarations) {
        const id = (declaration as { id?: unknown }).id;
        const init = (declaration as { init?: unknown }).init;
        if (isIdentifierNode(id) && P5_LIFECYCLE_NAMES.has(id.name) && isFunctionLikeNode(init)) {
          return true;
        }
      }
      continue;
    }

    if (statement.type === 'ExpressionStatement') {
      const expression = (statement as { expression?: unknown }).expression;
      if (!isAstNode(expression) || expression.type !== 'AssignmentExpression') {
        continue;
      }
      const operator = (expression as { operator?: unknown }).operator;
      const assignedName = getAssignedIdentifierName((expression as { left?: unknown }).left);
      const right = (expression as { right?: unknown }).right;
      if (operator === '=' && assignedName && P5_LIFECYCLE_NAMES.has(assignedName) && isFunctionLikeNode(right)) {
        return true;
      }
    }
  }

  return false;
};

const walkAst = (node: unknown, visit: (node: AstNode) => void): void => {
  if (!isAstNode(node)) return;
  visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const child of value) {
        walkAst(child, visit);
      }
    } else if (value && typeof value === 'object') {
      walkAst(value, visit);
    }
  }
};

const getP5SignalData = (program: AstProgramNode): { hasP5Constructor: boolean; signatureCalls: Set<string> } => {
  let hasP5Constructor = false;
  const signatureCalls = new Set<string>();

  walkAst(program, (node) => {
    if (node.type === 'NewExpression') {
      const callee = (node as { callee?: unknown }).callee;
      if (isIdentifierNode(callee) && callee.name === 'p5') {
        hasP5Constructor = true;
      }
      if (isAstNode(callee) && callee.type === 'MemberExpression') {
        const object = (callee as { object?: unknown }).object;
        const property = (callee as { property?: unknown }).property;
        const computed = Boolean((callee as { computed?: unknown }).computed);
        if (!computed && isIdentifierNode(object) && object.name === 'p5' && isIdentifierNode(property)) {
          hasP5Constructor = true;
        }
      }
      return;
    }

    if (node.type === 'CallExpression') {
      const callee = (node as { callee?: unknown }).callee;
      if (isIdentifierNode(callee) && P5_SIGNATURE_CALL_NAMES.has(callee.name)) {
        signatureCalls.add(callee.name);
      }
    }
  });

  return { hasP5Constructor, signatureCalls };
};

const isLikelyP5Sketch = (code: string): boolean => {
  const program = parseProgramForDetection(code);
  if (!program) {
    return looksLikeP5ByRegex(code);
  }

  if (hasTopLevelP5LifecycleHook(program)) {
    return true;
  }

  const { hasP5Constructor, signatureCalls } = getP5SignalData(program);
  return hasP5Constructor || signatureCalls.size > 0;
};

const waitForIframeP5Library = async (
  iframeElement: HTMLIFrameElement,
  timeoutMs: number = P5_IFRAME_READY_TIMEOUT_MS,
  pollMs: number = P5_IFRAME_READY_POLL_MS
): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const iframeWindow = iframeElement.contentWindow as (Window & { p5?: unknown }) | null;
    if (iframeWindow && typeof iframeWindow.p5 !== 'undefined') {
      return true;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, pollMs));
  }
  return false;
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
          stopP5SoundPlayback(iframeWindow);
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
export {
  executeInIframeContext,
  formatErrorWithLineMapping,
  scheduleFallbackResize,
  findClosestP5CodeIdElement,
  isLikelyP5Sketch,
};

export default defineCodeRunnersSetup((runner: RunnerType) => {
  // Preserve Slidev's original JS runner before this setup mutates the shared map.
  const defaultJsRunner = runner?.js ?? runner?.javascript;
  const customJs: NonNullable<RunnerType['js']> = async (code: string, ctx: unknown) => {
    // Detect p5.js code using AST signals (with regex fallback on parse failures).
    const looksLikeP5 = isLikelyP5Sketch(code);
    
    // Track transpiled code for error mapping
    let transpiled: string | null = null;
    
    if (!looksLikeP5) {
      // Not p5 code - fall back to default JavaScript execution via runner
      if (defaultJsRunner) {
        return defaultJsRunner(code, ctx as unknown as JsRunnerCtx);
      }
      return {
        text: 'Error: No default JavaScript runner is available for non-p5 code. This addon only executes p5 sketches.',
      };
    }
    
    // p5.js code detected - transpile and execute
    // Note: addon is iframe-first; DOM fallback has been removed.
    try {
      // **CRITICAL**: Capture the play button BEFORE p5 execution
      const sourcePlayButton = findSourcePlayButton(document.activeElement as HTMLElement);
      // Instrument user code to guard against infinite loops.
      const codeToTranspile = instrumentLoops(code, {
        timeoutMs: TIMING_CONFIG.loopGuardTimeoutMs,
        sketchId: `runner-${Date.now()}`,
      })

      // Transpile global mode to instance mode
      transpiled = transpileGlobalToInstance(codeToTranspile);
      if (!transpiled) {
        return { text: 'Error: Failed to transpile p5.js code. Please check syntax.' };
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
        await resetIframeToBaseHtml(iframeElement as IframeElementLike);
        // Give the iframe a moment to initialize if needed
        if (typeof (iframeElement.contentWindow as unknown as { p5?: unknown }).p5 === 'undefined') {
          const p5Loaded = await waitForIframeP5Library(iframeElement);
          if (!p5Loaded) {
            return { text: 'Error: p5.js not yet loaded in iframe. Please wait a moment and try again.' };
          }
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
        // Replace any previous observer set for this iframe before registering new ones.
        const trackedIframe = iframeElement as IframeElementLike;
        disconnectIframeCleanupManager(trackedIframe);
        const cleanupManager = new CleanupManager();
        trackedIframe.__cleanupManager = cleanupManager;
        let cleanedUp = false;
        const performRunCleanup = () => {
          if (cleanedUp) return;
          cleanedUp = true;
          try {
            const iw = iframeElement.contentWindow as IframeWindowWithAddon | null;
            stopP5SoundPlayback(iw);
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
            void resetIframeToBaseHtml(trackedIframe);
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
          } finally {
            try {
              cleanupManager.disconnectAll();
            } catch (e) {
              // ignore teardown errors
            }
            if (trackedIframe.__cleanupManager === cleanupManager) {
              delete trackedIframe.__cleanupManager;
            }
          }
        };
        // Set up cleanup when iframe leaves viewport
        cleanupManager.observeVisibility(iframeElement, performRunCleanup);
        // Also clean up if iframe is removed from DOM
        const mutationParent = (iframeElement.ownerDocument?.body || document.body) as HTMLElement | null;
        cleanupManager.observeMutation(mutationParent, iframeElement, performRunCleanup);
        
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
