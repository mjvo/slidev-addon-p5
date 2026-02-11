/**
 * Iframe Message Handler - Manages parent-iframe communication
 *
 * Handles postMessage events from p5 sketches running in iframes:
 * - p5-iframe-ready: p5.js initialized
 * - p5-resize: canvas dimensions changed
 * - p5-error: error occurred in sketch
 * - p5-execution-complete: code execution finished
 *
 * Validates message origins against an allowed list for security.
 */

/**
 * Configuration for iframe message handlers
 */
interface ResizeData {
  width: number;
  height: number;
  sketchInstanceId?: string;
}

interface ErrorData {
  message?: string;
  stack?: string;
  sketchInstanceId?: string;
}

interface MessageHandlerConfig {
  onReady?: () => void;
  onResize?: (width: number, height: number, sketchInstanceId?: string) => void;
  onError?: (error: ErrorData) => void;
  onExecutionComplete?: () => void;
  // Optional list of allowed origins for messages (overrides default)
  allowedOrigins?: string[];
}

/**
 * Handles messages from p5 sketches in iframes
 *
 * Provides:
 * - Type-safe message routing via handlers map
 * - Origin validation for security
 * - Easy message type registration
 */
export class IframeMessageHandler {
  private handlers = new Map<string, (data: ResizeData | ErrorData | unknown) => void>();
  private allowedOrigins = [
    'http://localhost',
    'http://127.0.0.1',
    'http://localhost:5173',
    'http://localhost:3030',
    'http://localhost:8080',
  ];
  // Track the last applied resize to avoid redundant calls
  private lastResize?: { width: number; height: number };
  // Throttle window and state for resize events
  private throttleMs = 150;
  private lastResizeTime = 0;
  private pendingResize?: { width: number; height: number };
  private pendingTimeout?: number;

  /**
   * Create a new iframe message handler
   *
   * @param config - Configuration object with callback handlers
   *
   * @example
   * const handler = new IframeMessageHandler({
   *   onReady: () => console.log('p5 ready'),
   *   onResize: (w, h) => resizeCanvas(w, h),
   *   onError: (err) => showError(err),
   * });
   *
   * window.addEventListener('message', (event) => {
   *   handler.handle(event);
   * });
   */
  constructor(config: MessageHandlerConfig = {}) {
    if (config.allowedOrigins && Array.isArray(config.allowedOrigins) && config.allowedOrigins.length > 0) {
      this.allowedOrigins = config.allowedOrigins;
    }
    this.registerHandlers(config);
  }

  /**
   * Register message type handlers
   *
   * @private
   * @param config - Handler callbacks for each message type
   */
  private registerHandlers(config: MessageHandlerConfig): void {
    if (config.onReady) {
      this.handlers.set('p5-iframe-ready', config.onReady);
    }

    if (config.onExecutionComplete) {
      this.handlers.set('p5-execution-complete', config.onExecutionComplete);
    }

    if (config.onResize) {
      this.handlers.set('p5-resize', (data: ResizeData | unknown) => {
        const obj = data as Partial<ResizeData> | null;
        const w = obj?.width;
        const h = obj?.height;
        const sid = obj?.sketchInstanceId;
        if (typeof w === 'number' && typeof h === 'number') {
          // Drop duplicate resize events with identical dimensions
          if (this.lastResize && this.lastResize.width === w && this.lastResize.height === h) {
            return;
          }
          // Also ignore duplicates that match the currently pending resize
          if (this.pendingResize && this.pendingResize.width === w && this.pendingResize.height === h) {
            return;
          }

          const now = Date.now();
          const elapsed = now - this.lastResizeTime;

          const applyResize = (width: number, height: number) => {
            this.lastResize = { width, height };
            this.lastResizeTime = Date.now();
            config.onResize!(width, height, sid);
          };

          if (elapsed >= this.throttleMs) {
            // Apply immediately and clear any pending state
            if (this.pendingTimeout) {
              clearTimeout(this.pendingTimeout);
              this.pendingTimeout = undefined;
              this.pendingResize = undefined;
            }
            applyResize(w, h);
          } else {
            // Schedule trailing update with the latest dimensions
            this.pendingResize = { width: w, height: h };
            if (!this.pendingTimeout) {
              const wait = Math.max(0, this.throttleMs - elapsed);
              this.pendingTimeout = window.setTimeout(() => {
                if (this.pendingResize) {
                  applyResize(this.pendingResize.width, this.pendingResize.height);
                  this.pendingResize = undefined;
                }
                this.pendingTimeout = undefined;
              }, wait);
            }
          }
        }
      });
    }

    if (config.onError) {
      this.handlers.set('p5-error', (data: ErrorData | unknown) => {
        const obj = data as ErrorData | null;
        config.onError!(obj ?? { message: typeof data === 'string' ? String(data) : undefined });
      });
    }
  }

  /**
   * Check if origin is in the allowed list
   *
   * Validates exact match or port variations (e.g., localhost:5173)
   * Uses strict comparison to prevent origin spoofing attacks like:
   * - http://localhost-attacker.com (would match with .includes())
   * - http://127.0.0.1.attacker.com (would match with .includes())
   *
   * @param origin - The origin string to validate
   * @returns True if origin is allowed
   *
   * @private
   */
  private isOriginAllowed(origin: string): boolean {
    // Exact match (e.g., 'http://localhost' === 'http://localhost')
    if (this.allowedOrigins.includes(origin)) {
      return true;
    }

    // Port variation match (e.g., 'http://localhost:5173')
    // Must start with allowed origin followed immediately by ':'
    return this.allowedOrigins.some((allowed) => {
      if (origin.startsWith(allowed + ':')) {
        // Additional check: ensure the character after allowed origin is ':'
        // This prevents matching 'http://localhost-attacker.com'
        const remainder = origin.substring(allowed.length);
        return remainder.startsWith(':') && /^:\d+$/.test(remainder);
      }
      return false;
    });
  }

  /**
   * Handle a message event from an iframe
   *
   * Validates origin, extracts message type, and routes to appropriate handler.
   *
   * @param event - The MessageEvent from the iframe
   *
   * @example
   * window.addEventListener('message', (event) => {
   *   handler.handle(event);
   * });
   */
  handle(event: MessageEvent): void {
    // Validate origin for security
    if (!this.isOriginAllowed(event.origin)) {
      console.warn('[p5 addon] Blocked message from untrusted origin:', event.origin);
      return;
    }

    // Basic shape validation: require an object with a string `type` field
    const data = event.data;
    if (!data || typeof data !== 'object' || typeof data.type !== 'string') {
      // Ignore non-structured postMessage events without spamming the console.
      return;
    }

    const type = data.type;

    // Only route known/registered message types
    if (!this.handlers.has(type)) {
      // Unknown message types are expected from other scripts; keep debug-level.
      // eslint-disable-next-line no-console
      console.debug('[p5 addon] Unregistered message type:', type, 'from', event.origin);
      return;
    }

    const handler = this.handlers.get(type)!;

    // Clone data to avoid prototype pollution and remove unexpected prototypes
    let safeData: ResizeData | ErrorData | unknown;
    try {
      // Prefer structuredClone when available
      const cloneFn = (globalThis as { structuredClone?: <T>(value: T) => T }).structuredClone;
      safeData = typeof cloneFn === 'function' ? cloneFn(data) : JSON.parse(JSON.stringify(data));
    } catch (err) {
      console.warn('[p5 addon] Failed to clone message data, ignoring.', err);
      return;
    }

    try {
      handler(safeData);
    } catch (error) {
      console.error('[p5 addon] Error handling message:', type, error);
    }
  }

  /**
   * Register a new message type handler
   *
   * Allows dynamic handler registration after construction.
   *
   * @param messageType - The message type to handle
   * @param callback - The callback function for this message type
   */
  registerHandler(messageType: string, callback: (data: unknown) => void): void {
    this.handlers.set(messageType, callback);
  }

  /**
   * Add an allowed origin to the security whitelist
   *
   * @param origin - Origin to allow (e.g., 'http://localhost:8888')
   */
  addAllowedOrigin(origin: string): void {
    if (!this.allowedOrigins.includes(origin)) {
      this.allowedOrigins.push(origin);
    }
  }

  /**
   * Reset the resize deduplication state
   * 
   * Call this before executing new code to ensure resize events are processed
   * even if canvas dimensions match previous execution.
   * 
   * Clears:
   * - lastResize: Previous applied dimensions
   * - pendingResize: Scheduled trailing update
   * - pendingTimeout: Active throttle timer
   */
  reset(): void {
    this.lastResize = undefined;
    this.pendingResize = undefined;
    if (this.pendingTimeout) {
      clearTimeout(this.pendingTimeout);
      this.pendingTimeout = undefined;
    }
  }
}
