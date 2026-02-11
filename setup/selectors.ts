/**
 * DOM selectors and CSS class names used throughout the addon
 * Centralized to reduce duplication and prevent typos
 */

export const SELECTORS = {
  // P5Canvas component structure
  P5_CANVAS_WRAPPER: '.p5-canvas-wrapper',
  P5_CANVAS_IFRAME: 'iframe.p5-canvas-iframe',
  P5_CANVAS_CONTAINER: '.p5-canvas-container > div',
  P5_CONTAINER_ID: 'p5-container',

  // Monaco editor and Slidev integration
  PLAY_BUTTON: 'button.slidev-icon-btn[title="Run code"]',
  CODE_CONTAINER_INPUT: '.slidev-code-runner-input',
  CODE_CONTAINER_WRAPPER: '.slidev-code-runner-container',
  
  // Stop button
  STOP_BUTTON_CLASS: 'p5-stop-btn',
} as const;

/**
 * Message types for iframe communication
 */
export const IFRAME_MESSAGE_TYPES = {
  READY: 'p5-iframe-ready',
  EXECUTION_COMPLETE: 'p5-execution-complete',
  RESIZE: 'p5-resize',
  ERROR: 'p5-error',
} as const;

/**
 * Helper to check if an element matches the play button selector
 * @param elem The element to check
 * @returns True if element matches the play button selector
 */
export const isPlayButton = (elem: Element): boolean => {
  return elem.matches(SELECTORS.PLAY_BUTTON);
};

/**
 * Helper to find code container from an element
 * @param elem The element to search from
 * @returns The closest code container, or null if not found
 */
export const findCodeContainer = (elem: HTMLElement): HTMLElement | null => {
  return (
    elem.closest(SELECTORS.CODE_CONTAINER_INPUT) ||
    elem.closest(SELECTORS.CODE_CONTAINER_WRAPPER)
  ) as HTMLElement | null;
};
