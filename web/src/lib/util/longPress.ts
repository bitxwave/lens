// Svelte 5 action: trigger a callback after the user holds pointer down
// on the node for `delay` ms without moving more than `tolerance` px.
//
// Usage in a Svelte 5 component:
//   <div use:longPress={{ onTrigger: handleLongPress }}>...</div>

export interface LongPressOptions {
  onTrigger: (e: PointerEvent) => void;
  delay?: number;
  tolerance?: number;
}

export function longPress(node: HTMLElement, options: LongPressOptions) {
  let opts = options;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let startX = 0;
  let startY = 0;
  let activeEvent: PointerEvent | null = null;

  function clear() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    activeEvent = null;
  }

  function onPointerDown(e: PointerEvent) {
    activeEvent = e;
    startX = e.clientX;
    startY = e.clientY;
    timer = setTimeout(() => {
      if (activeEvent) {
        opts.onTrigger(activeEvent);
      }
      timer = null;
    }, opts.delay ?? 600);
  }

  function onPointerMove(e: PointerEvent) {
    if (!timer) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const tolerance = opts.tolerance ?? 5;
    if (Math.hypot(dx, dy) > tolerance) {
      clear();
    }
  }

  function onPointerUp() {
    clear();
  }

  function onPointerCancel() {
    clear();
  }

  node.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerCancel);

  return {
    update(next: LongPressOptions) {
      opts = next;
    },
    destroy() {
      clear();
      node.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
    }
  };
}
