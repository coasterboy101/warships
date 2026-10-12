import { useEffect, useRef, type RefObject } from 'react';

/** Raw device state. Mouse coordinates are client (window) pixels. */
export interface PointerState {
  keys: Set<string>;
  mouseX: number;
  mouseY: number;
  mouseDown: boolean;
}

const PREVENT_DEFAULT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

/** Tracks keyboard and left-mouse state in a ref (no re-renders). */
export function useInput(): RefObject<PointerState> {
  const ref = useRef<PointerState>({ keys: new Set(), mouseX: 0, mouseY: 0, mouseDown: false });

  useEffect(() => {
    const s = ref.current;

    const onKeyDown = (e: KeyboardEvent) => {
      if (PREVENT_DEFAULT.has(e.code)) e.preventDefault();
      s.keys.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      s.keys.delete(e.code);
    };
    const onMove = (e: PointerEvent) => {
      s.mouseX = e.clientX;
      s.mouseY = e.clientY;
    };
    const onDown = (e: PointerEvent) => {
      if (e.button === 0) s.mouseDown = true;
    };
    const onUp = (e: PointerEvent) => {
      if (e.button === 0) s.mouseDown = false;
    };
    const onBlur = () => {
      s.keys.clear();
      s.mouseDown = false;
    };
    const onContextMenu = (e: Event) => {
      e.preventDefault();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('blur', onBlur);
    window.addEventListener('contextmenu', onContextMenu);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('contextmenu', onContextMenu);
    };
  }, []);

  return ref;
}
