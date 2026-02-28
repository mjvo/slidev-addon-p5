import { defineAppSetup } from '@slidev/types'
import { getP5LoadUrl, getP5SoundLoadUrl } from './p5-version-manager'

const loadScript = (src: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.async = false
    script.onload = () => resolve()
    script.onerror = (error) => reject(error)
    document.head.appendChild(script)
  })
}

export default defineAppSetup(async ({ app: _app, router: _router }) => {
  if (typeof window === 'undefined') return

  try {
    if (!window.p5) {
      await loadScript(getP5LoadUrl())
    }

    const p5SoundUrl = getP5SoundLoadUrl()
    const hasP5Sound = typeof (window as Window & { p5?: { SoundFile?: unknown } }).p5?.SoundFile === 'function'
    if (p5SoundUrl && !hasP5Sound) {
      await loadScript(p5SoundUrl)
    }
  } catch (error) {
    console.error('[p5 addon] Failed to load p5 dependencies', error)
  }
})
