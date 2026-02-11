/**
 * Stop Button Controller - Manages p5 sketch loop control
 *
 * Encapsulates all stop button functionality including:
 * - Button creation and DOM insertion
 * - Click event handling
 * - Communication with p5 instance to call noLoop()
 * - Console logging of stop events
 */

/**
 * Manages the stop button lifecycle and interactions
 *
 * The stop button allows users to pause the p5 draw() loop.
 * It's created hidden and shown only when p5 code is executing.
 */
import { safeRemoveElement } from './p5-utils';

export class StopButtonController {
  private button: HTMLElement;
  private inserted: boolean = false;

  /**
   * Create a new stop button controller
   *
   * @param iframeWindow - The window context where p5 instance lives
   * @param appendLog - Callback to append messages to console output
   *
   * @example
   * const controller = new StopButtonController(
   *   iframeWindow,
   *   (msg) => console.log(msg)
   * );
   */
  constructor(
    private iframeWindow: Window,
    private appendLog: (msg: string) => void
  ) {
    this.button = this.createButton();
  }

  /**
   * Create the stop button element with styling and event handler
   *
   * @private
   * @returns The created button element
   */
  private createButton(): HTMLElement {
    const btn = document.createElement('button');
    btn.className = 'slidev-icon-btn w-8 h-8 max-h-full flex justify-center items-center p5-stop-btn';
    btn.title = 'Stop loop';
    btn.style.cssText = 'display: none;';

    // Use inline SVG from Carbon icons design system (outline version)
    // This matches the visual style of i-carbon:play without requiring UnoCSS generation
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 32 32');
    svg.setAttribute('width', '1em');
    svg.setAttribute('height', '1em');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    // Carbon icon: stop outline (square)
    svg.innerHTML = '<rect x="7" y="7" width="18" height="18" rx="1"/>';
    btn.appendChild(svg);

    btn.addEventListener('click', () => this.handleStop());
    return btn;
  }

  /**
   * Handle stop button click - calls p5's noLoop() and hides button
   *
   * @private
   */
  private handleStop(): void {
    try {
      const maybeP5 = (this.iframeWindow as unknown as { p5?: { instance?: { noLoop?: () => void } } }).p5;
      const instance = maybeP5?.instance;
      if (instance && typeof instance.noLoop === 'function') {
        instance.noLoop();
        this.appendLog('[p5] Loop stopped - draw() will not execute');
        this.button.style.display = 'none';
      }
    } catch (error: unknown) {
      const message = (error as { message?: unknown })?.message;
      this.appendLog('[p5 Error] Could not stop loop: ' + (typeof message === 'string' ? message : String(error)));
    }
  }

  /**
   * Insert the stop button next to the source play button
   *
   * Handles:
   * - Removing any previous stop button
   * - Inserting next to play button
   * - Showing the button
   * - Preventing duplicate insertions
   *
   * @param sourcePlayBtn - The play button to insert next to
   */
  insertNext(sourcePlayBtn: HTMLElement | null): void {
    if (!sourcePlayBtn?.parentElement || this.inserted) {
      return;
    }

    // Remove any existing stop button (check previous sibling since we insert to the left)
    const oldStop = sourcePlayBtn.previousElementSibling as Element | null;
    if (oldStop?.classList.contains('p5-stop-btn')) {
      safeRemoveElement(oldStop);
    }

    // Insert stop button to the left of play button (prevents UI jump when appearing)
    sourcePlayBtn.parentElement.insertBefore(this.button, sourcePlayBtn);
    this.button.style.display = '';
    this.inserted = true;
  }

  /**
   * Get the stop button element
   *
   * @returns The button element
   */
  getButton(): HTMLElement {
    return this.button;
  }
}
