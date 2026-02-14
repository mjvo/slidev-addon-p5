// Minimal handler for iframe resize messages with origin validation and throttling
// Used by both P5Canvas and P5Code (for resize only)


export interface IframeResizeHandlerOptions {
  allowedOrigins?: string[];
  onResize: (width: number, height: number, sketchId?: string) => void;
  throttleMs?: number;
  sketchInstanceId?: string;
  expectedSource?: MessageEventSource | null | (() => MessageEventSource | null);
  requireSketchInstanceId?: boolean;
}


export class IframeResizeHandler {
  private allowedOrigins: string[];
  private onResize: (width: number, height: number, sketchId?: string) => void;
  private throttleMs: number;
  private lastResizeTime = 0;
  private pendingResize: { width: number; height: number; sketchId?: string } | null = null;
  private pendingTimeout: number | null = null;
  private listener: (event: MessageEvent) => void;
  private sketchInstanceId?: string;
  private expectedSource?: MessageEventSource | null | (() => MessageEventSource | null);
  private requireSketchInstanceId = false;

  constructor(options: IframeResizeHandlerOptions) {
    this.allowedOrigins = options.allowedOrigins || [window.location.origin];
    this.onResize = options.onResize;
    this.throttleMs = options.throttleMs ?? 150;
    this.listener = this.handleMessage.bind(this);
    this.sketchInstanceId = options.sketchInstanceId;
    this.expectedSource = options.expectedSource;
    this.requireSketchInstanceId = Boolean(options.requireSketchInstanceId);
  }

  private resolveExpectedSource(): MessageEventSource | null {
    if (typeof this.expectedSource === 'function') {
      return this.expectedSource();
    }
    return this.expectedSource ?? null;
  }

  start() {
    window.addEventListener('message', this.listener);
  }

  stop() {
    window.removeEventListener('message', this.listener);
    if (this.pendingTimeout) {
      clearTimeout(this.pendingTimeout);
      this.pendingTimeout = null;
    }
  }

  private handleMessage(event: MessageEvent) {
    if (!this.allowedOrigins.includes(event.origin)) return;
    const expectedSource = this.resolveExpectedSource();
    if (expectedSource && event.source !== expectedSource) return;
    const data = event.data as { type?: unknown; width?: unknown; height?: unknown; sketchInstanceId?: unknown } | null;
    const type = data?.type;
    const width = data?.width;
    const height = data?.height;
    const sketchInstanceId = typeof data?.sketchInstanceId === 'string' ? data.sketchInstanceId : undefined;
    if (type !== 'p5-resize' || typeof width !== 'number' || typeof height !== 'number') return;
    if (this.requireSketchInstanceId && !sketchInstanceId) return;
    if (this.sketchInstanceId && sketchInstanceId !== this.sketchInstanceId) return;
    const now = Date.now();
    if (now - this.lastResizeTime >= this.throttleMs) {
      this.onResize(width, height, sketchInstanceId);
      this.lastResizeTime = now;
    } else {
      this.pendingResize = { width, height, sketchId: sketchInstanceId };
      if (!this.pendingTimeout) {
        this.pendingTimeout = window.setTimeout(() => {
          if (this.pendingResize) {
            this.onResize(this.pendingResize.width, this.pendingResize.height, this.pendingResize.sketchId);
            this.lastResizeTime = Date.now();
            this.pendingResize = null;
          }
          this.pendingTimeout = null;
        }, this.throttleMs - (now - this.lastResizeTime));
      }
    }
  }
}
