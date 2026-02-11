/**
 * Play Button Finder - Locates the source play button for code execution
 *
 * This module extracts the logic for finding the Monaco/Slidev "Run code" button
 * which is captured BEFORE p5 execution to avoid DOM changes during code running.
 */

/**
 * Find the source play button by walking up from the active element
 * Falls back to searching from the code container if needed
 *
 * @param activeElement - The currently focused DOM element (usually the code editor)
 * @returns The play button element, or null if not found
 *
 * @example
 * const btn = findSourcePlayButton(document.activeElement as HTMLElement);
 * if (btn) {
 *   // Use button reference to insert stop button next to it
 * }
 */
export const findSourcePlayButton = (activeElement: HTMLElement | null): HTMLElement | null => {
  if (!activeElement) {
    return null;
  }

  // Strategy 1: Walk up from active element to find a play button
  let current: HTMLElement | null = activeElement;
  while (current) {
    const playBtn = current.querySelector('button.slidev-icon-btn[title="Run code"]');
    if (playBtn) {
      return playBtn as HTMLElement;
    }
    current = current.parentElement;
  }

  // Strategy 2: Find from the code runner container
  const codeContainer =
    activeElement.closest('.slidev-code-runner-input') ||
    activeElement.closest('.slidev-code-runner-container');

  if (codeContainer) {
    const playBtn = codeContainer.querySelector('button.slidev-icon-btn[title="Run code"]');
    if (playBtn) {
      return playBtn as HTMLElement;
    }
  }

  return null;
};
