export const UI_CONFIG = {
  stopButton: {
    title: 'Stop loop',
    className: 'slidev-icon-btn w-8 h-8 max-h-full flex justify-center items-center p5-stop-btn',
  },
} as const

export const TIMING_CONFIG = {
  DEBOUNCE_MS: 100,
  POLL_MS: 500,
  OBSERVER_THRESHOLD: 0,
  loopGuardTimeoutMs: 100,
} as const

export const SECURITY_CONFIG = {
  iframeAllow: 'camera; microphone; autoplay; display-capture',
  allowedOrigins: [
    'http://localhost',
    'http://127.0.0.1',
    'http://localhost:5173',
    'http://localhost:3030',
    'http://localhost:8080',
  ],
} as const
