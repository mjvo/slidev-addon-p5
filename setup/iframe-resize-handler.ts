// Minimal handler for iframe resize messages with origin validation and throttling
// Used by both P5Canvas and P5Code (for resize only)


export interface IframeResizeHandlerOptions {
  allowedOrigins?: string[];
  onResize: (width: number, height: number, sketchId?: string) => void;
  throttleMs?: number;
  sketchInstanceId?: string;
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

  constructor(options: IframeResizeHandlerOptions) {
    this.allowedOrigins = options.allowedOrigins || [window.location.origin];
    this.onResize = options.onResize;
    this.throttleMs = options.throttleMs ?? 150;
    this.listener = this.handleMessage.bind(this);
    this.sketchInstanceId = options.sketchInstanceId;
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
    const { type, width, height, sketchInstanceId } = event.data || {};
    if (type !== 'p5-resize' || typeof width !== 'number' || typeof height !== 'number') return;
    // Only allow resize if sketchInstanceId matches (or not set)
    if (this.sketchInstanceId && sketchInstanceId && sketchInstanceId !== this.sketchInstanceId) {
      // eslint-disable-next-line no-console
      return;
    }
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
