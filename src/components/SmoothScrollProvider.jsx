import { useEffect } from "react";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

// Tuning: lower values feel smoother; higher values stop sooner.
const WHEEL_LERP = 0.14;
const TOUCH_LERP = 0.12;

// Quick disable: set false. Full removal: also remove this component from
// App.jsx, delete this file, and uninstall the `lenis` package.
const LENIS_ENABLED = true;

const smoothScrollSubscribers = new Set();

// Read-only integration point for storefront effects that need Lenis' actual
// scroll position. Subscribers never control or replace the Lenis instance.
export function subscribeToSmoothScroll(listener) {
  smoothScrollSubscribers.add(listener);
  return () => smoothScrollSubscribers.delete(listener);
}

const NATIVE_SCROLL_AREAS = [
  ".carousel-track",
  ".navbar-cats",
  ".quick-cats-scroll",
  ".shop-tags-strip",
  ".shop-filter-bar",
  ".cart-scroll",
  ".review-scroll",
  ".modal",
  ".mobile-drawer-viewport",
  ".search-results",
  "input",
  "textarea",
  "select",
  "[contenteditable='true']",
  "[data-native-scroll]",
].join(",");

/**
 * One storefront-wide Lenis instance. It changes only scroll interpolation;
 * it never transforms page content. Keyboard scrolling stays native, nested
 * horizontal controls opt out, and multi-touch is left to browser pinch zoom.
 */
export default function SmoothScrollProvider() {
  useEffect(() => {
    const reducedMotion = window.matchMedia(REDUCED_MOTION);
    let disposed = false;
    let lenis = null;
    let bodyObserver = null;
    let animationFrame = 0;
    let detachScrollSubscriber = null;

    const shouldActivate = () => LENIS_ENABLED && !reducedMotion.matches;
    const bodyIsLocked = () =>
      document.body.style.overflow === "hidden" ||
      getComputedStyle(document.body).overflow === "hidden";

    const animate = (time) => {
      lenis?.raf(time);
      animationFrame = requestAnimationFrame(animate);
    };

    const startAnimationLoop = () => {
      if (!animationFrame) animationFrame = requestAnimationFrame(animate);
    };

    const stopAnimationLoop = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    };

    const syncScrollLock = () => {
      if (!lenis) return;
      if (bodyIsLocked()) {
        lenis.stop();
        return;
      }
      lenis.resize();
      lenis.scrollTo(window.scrollY, { immediate: true, force: true });
      lenis.start();
    };

    const stopCurrentMotion = () => {
      lenis?.scrollTo(window.scrollY, { immediate: true, force: true });
    };

    const destroy = () => {
      bodyObserver?.disconnect();
      bodyObserver = null;
      detachScrollSubscriber?.();
      detachScrollSubscriber = null;
      window.removeEventListener("popstate", stopCurrentMotion);
      stopAnimationLoop();
      lenis?.destroy();
      lenis = null;
    };

    const activate = async () => {
      if (!shouldActivate() || lenis) return;
      const { default: Lenis } = await import("lenis");
      if (disposed || !shouldActivate() || lenis) return;

      lenis = new Lenis({
        autoRaf: false,
        lerp: WHEEL_LERP,
        smoothWheel: true,
        syncTouch: true,
        syncTouchLerp: TOUCH_LERP,
        touchInertiaExponent: 1.5,
        touchMultiplier: 1,
        wheelMultiplier: 1,
        gestureOrientation: "vertical",
        overscroll: false,
        respectReducedMotion: true,
        stopInertiaOnNavigate: true,
        prevent: (node) => node.matches?.(NATIVE_SCROLL_AREAS) ?? false,
        virtualScroll: ({ deltaX, deltaY, event }) => {
          if ("touches" in event && event.touches.length > 1) return false;
          return !event.shiftKey && Math.abs(deltaY) >= Math.abs(deltaX);
        },
      });

      const notifySubscribers = (scrollState) => {
        smoothScrollSubscribers.forEach((listener) => listener(scrollState));
      };
      lenis.on("scroll", notifySubscribers);
      detachScrollSubscriber = () => lenis?.off("scroll", notifySubscribers);

      bodyObserver = new MutationObserver(syncScrollLock);
      bodyObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ["class", "style"],
      });
      window.addEventListener("popstate", stopCurrentMotion);
      startAnimationLoop();
      syncScrollLock();
    };

    const handleMotionPreference = () => {
      if (shouldActivate()) activate();
      else destroy();
    };

    reducedMotion.addEventListener("change", handleMotionPreference);
    activate();

    return () => {
      disposed = true;
      reducedMotion.removeEventListener("change", handleMotionPreference);
      destroy();
    };
  }, []);

  return null;
}
