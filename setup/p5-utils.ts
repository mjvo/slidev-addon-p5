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
