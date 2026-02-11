/**
 * TypeScript interfaces and types for slidev-addon-p5
 * Provides type safety and documentation across the addon
 */

/**
 * Console logging wrapper interface
 * Used to capture and manage console output from p5 sketches
 */
export interface ConsoleWrapper {
  restore(): void;
  getLogs(): string[];
}

/**
 * Result of executing p5 code in iframe or DOM context
 */
export interface ExecutionResult {
  success: boolean;
  error?: string;
  element?: HTMLElement;
}

/**
 * Result of searching for a p5 container (iframe or DOM)
 */
export interface ContainerSearchResult {
  iframeElement: HTMLIFrameElement | null;
  isP5CanvasContainer: boolean;
}

/**
 * p5.js instance interface - subset of important methods
 * Type-safe wrapper around p5 instance
 */
export interface P5Instance {
  remove(): void;
  draw?(): void;
  setup?(): void;
  redraw?(): void;
  noLoop?(): void;
  loop?(): void;
  isLooping?(): boolean;
  // Add more p5 methods as needed
  [key: string]: unknown; // Allow other p5 properties
}

/**
 * Branded type for HTML elements that are p5 containers
 * Used with WeakMap to ensure only valid containers are used as keys
 */
export type P5ContainerElement = HTMLElement & { readonly __p5ContainerBrand?: true };

/**
 * Message sent from iframe to parent window
 */
export interface IframeMessage {
  type: 'p5-iframe-ready' | 'p5-execution-complete' | 'p5-resize' | 'p5-error';
  data?: unknown;
  width?: number;
  height?: number;
}

/**
 * Configuration for code runner execution
 */
export interface CodeRunnerConfig {
  displayOnly?: boolean;
  sideBySide?: boolean;
}

/**
 * Helper to cast HTMLElement to P5ContainerElement with validation
 * @param elem The HTML element to cast
 * @returns The element typed as a P5ContainerElement
 */
export const toP5ContainerElement = (elem: HTMLElement): P5ContainerElement => {
  return elem as P5ContainerElement;
};
