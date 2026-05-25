// Svelte 5 action: trigger a callback after the user holds pointer down
// on the node for `delay` ms without moving more than `tolerance` px.
//
// Usage in a Svelte 5 component:
//   <div use:longPress={{ onTrigger: handleLongPress }}>...</div>
//
// Click suppression: once the long-press timer fires, the trailing
// `click` event that the browser dispatches on the next pointerup is
// swallowed. Without this, a stationary long-press would both fire
// `onTrigger` AND, on release, fire a click that the inner button's
// onclick handler interprets as a normal tap — opening the folder /
// popping an edit dialog right after the user just entered jiggle.
// The eater is a one-shot capture-phase listener on `node`, so it
// runs before the inner button's bubble-phase onclick and stops the
// event there. It auto-disarms on the next pointerdown so a real tap
// after a drag-canceled long-press still works.

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
  let consumeNextClick = false;

  function clear() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    activeEvent = null;
  }

  function onClick(e: MouseEvent) {
    if (!consumeNextClick) return;
    consumeNextClick = false;
    // stopImmediatePropagation also stops same-target same-phase
    // listeners — the inner button's bubble-phase onclick won't fire.
    e.stopImmediatePropagation();
    e.preventDefault();
  }

  function onPointerDown(e: PointerEvent) {
    // A new gesture starts. Drop any leftover suppression flag from a
    // previous long-press whose trailing click never materialised
    // (e.g. drag took over and the browser canceled the click).
    consumeNextClick = false;
    activeEvent = e;
    startX = e.clientX;
    startY = e.clientY;
    timer = setTimeout(() => {
      if (activeEvent) {
        consumeNextClick = true;
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
  node.addEventListener('click', onClick, { capture: true });
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
      node.removeEventListener('click', onClick, { capture: true });
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
    }
  };
}
