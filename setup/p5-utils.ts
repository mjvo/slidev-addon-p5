/**
 * p5-utils.ts
 *
 * Small runtime helpers for safe/idempotent removal of p5 instances and
 * DOM elements. These guards prevent double-removal, swallow errors during
 * teardown, and reduce cross-realm Symbol issues by using simple properties.
 */

export const safeRemoveP5 = (instance: unknown) => {
  if (!instance) return;
  try {
    const inst = instance as { remove?: () => void; __p5AddonRemoved?: boolean };
    if (inst.__p5AddonRemoved) return;
  } catch (e) {
    // ignore access issues
  }

  try {
    const inst = instance as { remove?: () => void };
    if (typeof inst.remove === 'function') {
      inst.remove();
    }
  } catch (e) {
    // ignore removal errors
  }

  try {
    const inst = instance as { __p5AddonRemoved?: boolean };
    inst.__p5AddonRemoved = true;
  } catch (e) {
    // ignore
  }
};

export type BaseHtmlIframe = HTMLIFrameElement & { __baseHtml?: string };

/**
 * Reset iframe to stored bootstrap HTML via srcdoc.
 *
 * Using srcdoc creates a fresh browsing context, which is safer than document.write
 * for repeated teardown/restart cycles (avoids script-scope redeclaration issues).
 */
export const resetIframeToBaseHtml = async (
  iframe: BaseHtmlIframe | null | undefined,
  timeoutMs: number = 4000
): Promise<boolean> => {
  if (!iframe || typeof iframe.__baseHtml !== 'string' || !iframe.__baseHtml) {
    return false;
  }

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      try { iframe.removeEventListener('load', onLoad); } catch (e) { void 0 }
      try { clearTimeout(timer); } catch (e) { void 0 }
      resolve(ok);
    };

    const onLoad = () => done(true);
    const timer = setTimeout(() => done(false), timeoutMs);

    try {
      iframe.addEventListener('load', onLoad, { once: true });
      iframe.srcdoc = iframe.__baseHtml as string;
    } catch (e) {
      done(false);
    }
  });
};

/**
 * Stop/disconnect active p5.sound sources in an iframe window.
 *
 * Returns the number of sound objects we attempted to stop/disconnect.
 * This is best-effort and intentionally swallows runtime errors during teardown.
 */
export const stopP5SoundPlayback = (iframeWindow: Window | null | undefined): number => {
  if (!iframeWindow) return 0;

  let stopCount = 0;
  const visited = new Set<unknown>();
  const maybeWindow = iframeWindow as Window & {
    p5?: {
      soundOut?: { soundArray?: unknown[] };
      instance?: { soundOut?: { soundArray?: unknown[] } };
      prototype?: { soundOut?: { soundArray?: unknown[] } };
    };
    __p5Addon?: {
      instance?: { soundOut?: { soundArray?: unknown[] } };
    };
    soundOut?: { soundArray?: unknown[] };
  };

  const soundArrays: unknown[] = [];
  try {
    if (Array.isArray(maybeWindow.p5?.soundOut?.soundArray)) {
      soundArrays.push(maybeWindow.p5.soundOut.soundArray);
    }
  } catch (e) {
    // ignore
  }
  try {
    if (Array.isArray(maybeWindow.soundOut?.soundArray)) {
      soundArrays.push(maybeWindow.soundOut.soundArray);
    }
  } catch (e) {
    // ignore
  }
  try {
    if (Array.isArray(maybeWindow.p5?.instance?.soundOut?.soundArray)) {
      soundArrays.push(maybeWindow.p5.instance.soundOut.soundArray);
    }
  } catch (e) {
    // ignore
  }
  try {
    if (Array.isArray(maybeWindow.p5?.prototype?.soundOut?.soundArray)) {
      soundArrays.push(maybeWindow.p5.prototype.soundOut.soundArray);
    }
  } catch (e) {
    // ignore
  }
  try {
    if (Array.isArray(maybeWindow.__p5Addon?.instance?.soundOut?.soundArray)) {
      soundArrays.push(maybeWindow.__p5Addon.instance.soundOut.soundArray);
    }
  } catch (e) {
    // ignore
  }

  for (const arr of soundArrays) {
    if (!Array.isArray(arr)) continue;
    for (const soundObj of arr) {
      if (!soundObj || visited.has(soundObj)) continue;
      visited.add(soundObj);

      try {
        const s = soundObj as { stop?: () => void };
        if (typeof s.stop === 'function') {
          s.stop();
          stopCount += 1;
        }
      } catch (e) {
        // ignore per-source stop failures
      }

      try {
        const s = soundObj as { disconnect?: () => void };
        if (typeof s.disconnect === 'function') {
          s.disconnect();
        }
      } catch (e) {
        // ignore per-source disconnect failures
      }
    }
  }

  return stopCount;
};

export const safeRemoveElement = (el: Element | null) => {
  if (!el) return;
  try {
    const node = el as Element & { __removed?: boolean };
    if (node.__removed) return;
  } catch (e) {
    // ignore
  }

  try {
    const node = el as Element & { remove?: () => void };
    if (typeof node.remove === 'function') {
      node.remove();
    }
  } catch (e) {
    // ignore
  }

  try {
    const node = el as Element & { __removed?: boolean };
    node.__removed = true;
  } catch (e) {
    // ignore
  }
};
