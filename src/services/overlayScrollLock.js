let lockCount = 0;
let previousBodyOverflow = "";

// Shared by overlapping storefront overlays so a drawer-to-modal handoff never
// briefly unlocks the page (or restarts Lenis) between the two lifecycles.
export function acquireOverlayScrollLock() {
  if (typeof document === "undefined") return () => {};
  if (lockCount === 0) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  lockCount += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) document.body.style.overflow = previousBodyOverflow;
  };
}
