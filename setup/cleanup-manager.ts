/**
 * Cleanup Manager - Centralizes observer-based cleanup logic
 *
 * Manages cleanup of p5 instances when:
 * - Sketches leave the viewport (IntersectionObserver)
 * - DOM nodes are removed (MutationObserver)
 *
 * Consolidates duplicated cleanup logic from iframe and DOM modes
 */

/**
 * Signature for cleanup callback functions
 */
type CleanupCallback = () => void;

/**
 * Manages cleanup observers for p5 sketches
 *
 * Provides unified API for:
 * - Visibility-based cleanup (when elements scroll out of view)
 * - Mutation-based cleanup (when DOM nodes are removed)
 */
export class CleanupManager {
  private observers: Array<IntersectionObserver | MutationObserver> = [];

  private removeObserver(observer: IntersectionObserver | MutationObserver): void {
    this.observers = this.observers.filter((obs) => obs !== observer);
  }

  /**
   * Start observing an element for visibility changes
   *
   * When the element scrolls out of view (not intersecting), triggers cleanup callback
   * and disconnects the observer.
   *
   * @param element - The element to observe (typically the canvas container or iframe)
   * @param callback - Function to call when element is no longer visible
   *
   * @example
   * const cleanup = new CleanupManager();
   * cleanup.observeVisibility(iframeElement, () => {
   *   p5Instance.remove();
   * });
   */
  observeVisibility(element: HTMLElement | null, callback: CleanupCallback): void {
    if (!element) {
      return;
    }

    let handled = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (handled) return;
        for (const entry of entries) {
          if (!entry.isIntersecting) {
            handled = true;
            try {
              callback();
            } finally {
              observer.disconnect();
              this.removeObserver(observer);
            }
            return;
          }
        }
      },
      { threshold: 0 }
    );

    observer.observe(element);
    this.observers.push(observer);
  }

  /**
   * Start observing a parent element for child removal
   *
   * When the target element (or its container) is removed from the DOM,
   * triggers cleanup callback and disconnects the observer.
   *
   * @param parent - The parent element to watch for changes
   * @param target - The target element being removed
   * @param callback - Function to call when target is removed
   *
   * @example
   * const cleanup = new CleanupManager();
   * cleanup.observeMutation(document.body, containerElement, () => {
   *   p5Instance.remove();
   * });
   */
  observeMutation(parent: HTMLElement | null, target: HTMLElement | null, callback: CleanupCallback): void {
    if (!parent || !target) {
      return;
    }

    let handled = false;
    const observer = new MutationObserver(() => {
      if (handled) return;
      if (!target.isConnected || !parent.contains(target)) {
        handled = true;
        try {
          callback();
        } finally {
          observer.disconnect();
          this.removeObserver(observer);
        }
      }
    });

    observer.observe(parent, { childList: true, subtree: true });
    this.observers.push(observer);
  }

  /**
   * Disconnect all observers managed by this instance
   *
   * Called during cleanup to prevent memory leaks and dangling observer references.
   */
  disconnectAll(): void {
    this.observers.forEach((obs) => {
      obs.disconnect();
    });
    this.observers = [];
  }
}
