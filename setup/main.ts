import { defineAppSetup } from '@slidev/types'

export default defineAppSetup(({ app: _app, router: _router }) => {
  // Load p5.js from CDN if not already loaded
  if (typeof window !== 'undefined' && !window.p5) {
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/p5@2.2.0/lib/p5.min.js'
    script.async = false
    script.onerror = (error) => {
      console.error('[p5 addon] Failed to load p5.js', error)
    }
    document.head.appendChild(script)
  }
})
