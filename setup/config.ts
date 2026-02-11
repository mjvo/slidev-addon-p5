/**
 * Centralized configuration for slidev-addon-p5
 * All magic values and settings in one place for easy maintenance
 */

export const ADDON_CONFIG = {
  // p5.js library configuration
  p5: {
    version: '2.2.0',
    getCdnUrl: () => 'https://cdn.jsdelivr.net/npm/p5@2.2.0/lib/p5.min.js',
  },

  // UI configuration
  ui: {
    stopButton: {
      emoji: '⏸',
      fallbackText: '[Stop]', // For accessibility
      title: 'Stop loop',
      className: 'slidev-icon-btn w-8 h-8 max-h-full flex justify-center items-center p5-stop-btn',
    },
  },

  // Timing and animation configuration
  timing: {
    DEBOUNCE_MS: 100, // Debounce delay for resize events
    POLL_MS: 500, // Polling interval for canvas size changes
    OBSERVER_THRESHOLD: 0, // IntersectionObserver threshold
  },

  // Logging configuration
  logging: {
    prefix: '[p5 addon]',
    messageTypes: {
      ERROR: '[p5 Error]',
      INFO: '[p5]',
      BRIDGE_ERROR: '[p5 Console Bridge Error]',
    },
  },

  // Security configuration
  security: {
    allowedOrigins: [
      'http://localhost',
      'http://127.0.0.1',
      'http://localhost:5173', // Vite dev server
      'http://localhost:3030',
      'http://localhost:8080',
    ],
  },
} as const;

// Export individual configs for convenience
export const P5_CONFIG = ADDON_CONFIG.p5;
export const UI_CONFIG = ADDON_CONFIG.ui;
export const TIMING_CONFIG = ADDON_CONFIG.timing;
export const LOGGING_CONFIG = ADDON_CONFIG.logging;
export const SECURITY_CONFIG = ADDON_CONFIG.security;
