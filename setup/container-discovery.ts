/**
 * Container Discovery - Finds P5Canvas component containers and iframes
 *
 * This module extracts the logic for locating where p5 sketches should be rendered:
 * - P5Canvas component iframe (preferred, provides coordinate system isolation)
 *
 * The addon is iframe-first; DOM-mode rendering/fallbacks have been removed.
 */

/**
 * Result of container search operation
 */
export interface ContainerSearchResult {
  /** The iframe element for isolated p5 execution (iframe mode) */
  iframeElement: HTMLIFrameElement | null;
  /** Whether this is a P5Canvas component container */
  isP5CanvasContainer: boolean;
}

/**
 * Find the appropriate p5 container for code execution
 *
 * Search strategy:
 * 1. Try to find via the active element (focused code editor)
 * 2. Fall back to searching the entire document for P5Canvas wrappers
 *
 * Prefers iframe mode (coordinate system isolation) over DOM mode.
 *
 * @param activeElement - The currently focused DOM element (usually code editor)
 * @returns Container search result with iframe element (if found)
 *
 * @example
 * const result = findP5Container(document.activeElement as HTMLElement);
 * if (result.iframeElement) {
 *   // Execute in iframe context
 * }
 */
export const findP5Container = (activeElement: HTMLElement | null): ContainerSearchResult => {
  const result: ContainerSearchResult = {
    iframeElement: null,
    isP5CanvasContainer: false,
  };

  // Strategy 1: Try to find via the currently focused element
  if (activeElement) {
    const wrapper = activeElement.closest('.p5-canvas-wrapper');
    if (wrapper) {
      // Check for iframe first
      const iframe = wrapper.querySelector('iframe.p5-canvas-iframe');
      if (iframe && iframe instanceof HTMLIFrameElement) {
        result.iframeElement = iframe;
        result.isP5CanvasContainer = true;
        return result;
      }

      // No iframe available in this wrapper — continue searching
    }
  }

  // Strategy 2: Search document for P5Canvas wrappers
  const p5CanvasWrappers = document.querySelectorAll('.p5-canvas-wrapper');

  for (let i = 0; i < p5CanvasWrappers.length; i++) {
    const wrapper = p5CanvasWrappers[i] as Element;
    // Check for iframe first
    const iframe = wrapper.querySelector('iframe.p5-canvas-iframe');
    if (iframe && iframe instanceof HTMLIFrameElement) {
      result.iframeElement = iframe;
      result.isP5CanvasContainer = true;
      return result;
    }
  }
  return result;
};
