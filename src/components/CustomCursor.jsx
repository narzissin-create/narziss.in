import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

const colorCanvas = document.createElement("canvas");
colorCanvas.width = 1;
colorCanvas.height = 1;
const colorContext = colorCanvas.getContext("2d", { willReadFrequently: true });
const parsedColorCache = new Map();

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function splitTopLevel(value, separator = ",") {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
    else if (character === separator && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts.filter(Boolean);
}

function splitWhitespace(value) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index <= value.length; index += 1) {
    const character = value[index];
    if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
    if ((index === value.length || /\s/.test(character)) && depth === 0) {
      if (value.slice(start, index).trim()) parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  return parts;
}

function parseCssColor(value) {
  if (!value || value === "transparent") return [0, 0, 0, 0];
  if (parsedColorCache.has(value)) return parsedColorCache.get(value);
  const previous = colorContext.fillStyle;
  colorContext.fillStyle = "#010203";
  colorContext.fillStyle = value;
  const accepted = colorContext.fillStyle !== "#010203" || value.toLowerCase() === "#010203";
  if (!accepted) {
    colorContext.fillStyle = previous;
    parsedColorCache.set(value, null);
    return null;
  }
  colorContext.clearRect(0, 0, 1, 1);
  colorContext.fillRect(0, 0, 1, 1);
  const pixel = [...colorContext.getImageData(0, 0, 1, 1).data];
  pixel[3] /= 255;
  colorContext.fillStyle = previous;
  parsedColorCache.set(value, pixel);
  return pixel;
}

function over(top, bottom) {
  const alpha = top[3] + bottom[3] * (1 - top[3]);
  if (alpha <= 0) return [0, 0, 0, 0];
  return [
    (top[0] * top[3] + bottom[0] * bottom[3] * (1 - top[3])) / alpha,
    (top[1] * top[3] + bottom[1] * bottom[3] * (1 - top[3])) / alpha,
    (top[2] * top[3] + bottom[2] * bottom[3] * (1 - top[3])) / alpha,
    alpha,
  ];
}

function parseColorStop(value) {
  const parts = splitWhitespace(value);
  for (let end = parts.length; end > 0; end -= 1) {
    const color = parseCssColor(parts.slice(0, end).join(" "));
    if (!color) continue;
    const positionValue = parts[end];
    let position = null;
    if (positionValue?.endsWith("%")) position = Number.parseFloat(positionValue) / 100;
    return { color, position: Number.isFinite(position) ? position : null };
  }
  return null;
}

function normalizeStops(stops) {
  if (!stops.length) return stops;
  if (stops[0].position == null) stops[0].position = 0;
  if (stops.at(-1).position == null) stops.at(-1).position = 1;
  let anchor = 0;
  for (let index = 1; index < stops.length; index += 1) {
    if (stops[index].position == null) continue;
    const start = stops[anchor].position;
    const span = index - anchor;
    for (let fill = anchor + 1; fill < index; fill += 1) {
      stops[fill].position = start + ((stops[index].position - start) * (fill - anchor)) / span;
    }
    anchor = index;
  }
  return stops;
}

function interpolateStops(stops, progress) {
  const value = clamp(progress);
  const rightIndex = stops.findIndex((stop) => stop.position >= value);
  if (rightIndex <= 0) return stops[0].color;
  if (rightIndex < 0) return stops.at(-1).color;
  const left = stops[rightIndex - 1];
  const right = stops[rightIndex];
  const distance = right.position - left.position;
  const amount = distance > 0 ? (value - left.position) / distance : 0;
  return left.color.map((channel, index) => channel + (right.color[index] - channel) * amount);
}

function gradientProgress(type, prelude, rect, x, y) {
  const localX = x - rect.left - rect.width / 2;
  const localY = y - rect.top - rect.height / 2;
  if (type === "radial") {
    const radiusX = Math.max(rect.width / 2, 1);
    const radiusY = Math.max(rect.height / 2, 1);
    return Math.sqrt((localX / radiusX) ** 2 + (localY / radiusY) ** 2);
  }
  if (type === "conic") {
    return (Math.atan2(localX, -localY) + Math.PI * 2) % (Math.PI * 2) / (Math.PI * 2);
  }
  let vectorX = 0;
  let vectorY = 1;
  const direction = prelude?.toLowerCase();
  if (direction?.startsWith("to ")) {
    vectorX = direction.includes("right") ? 1 : direction.includes("left") ? -1 : 0;
    vectorY = direction.includes("bottom") ? 1 : direction.includes("top") ? -1 : 0;
    const length = Math.hypot(vectorX, vectorY) || 1;
    vectorX /= length;
    vectorY /= length;
  } else if (direction?.endsWith("deg")) {
    const radians = Number.parseFloat(direction) * Math.PI / 180;
    vectorX = Math.sin(radians);
    vectorY = -Math.cos(radians);
  }
  const extent = Math.abs(vectorX) * rect.width / 2 + Math.abs(vectorY) * rect.height / 2 || 1;
  return (localX * vectorX + localY * vectorY + extent) / (2 * extent);
}

function sampleGradient(value, rect, x, y) {
  const match = value.match(/^(repeating-)?(linear|radial|conic)-gradient\((.*)\)$/i);
  if (!match) return null;
  const type = match[2].toLowerCase();
  const parts = splitTopLevel(match[3]);
  let prelude = null;
  if (parts.length && !parseColorStop(parts[0])) prelude = parts.shift();
  const stops = normalizeStops(parts.map(parseColorStop).filter(Boolean));
  if (stops.length < 2) return null;
  let progress = gradientProgress(type, prelude, rect, x, y);
  if (match[1]) progress -= Math.floor(progress);
  return interpolateStops(stops, progress);
}

function parsePosition(value) {
  const parts = value.trim().split(/\s+/);
  const convert = (part, fallback) => {
    if (!part) return fallback;
    if (part === "left" || part === "top") return 0;
    if (part === "center") return 0.5;
    if (part === "right" || part === "bottom") return 1;
    if (part.endsWith("%")) return Number.parseFloat(part) / 100;
    return fallback;
  };
  return [convert(parts[0], 0.5), convert(parts[1], 0.5)];
}

function mapImagePoint(rect, naturalWidth, naturalHeight, x, y, fit, position) {
  let renderedWidth = naturalWidth;
  let renderedHeight = naturalHeight;
  const contain = Math.min(rect.width / naturalWidth, rect.height / naturalHeight);
  const cover = Math.max(rect.width / naturalWidth, rect.height / naturalHeight);
  if (fit === "fill") {
    renderedWidth = rect.width;
    renderedHeight = rect.height;
  } else if (fit === "cover") {
    renderedWidth *= cover;
    renderedHeight *= cover;
  } else if (fit === "contain") {
    renderedWidth *= contain;
    renderedHeight *= contain;
  } else if (fit === "scale-down") {
    const scale = Math.min(1, contain);
    renderedWidth *= scale;
    renderedHeight *= scale;
  }
  const [positionX, positionY] = parsePosition(position || "50% 50%");
  const offsetX = (rect.width - renderedWidth) * positionX;
  const offsetY = (rect.height - renderedHeight) * positionY;
  const imageX = x - rect.left - offsetX;
  const imageY = y - rect.top - offsetY;
  if (imageX < 0 || imageY < 0 || imageX > renderedWidth || imageY > renderedHeight) return null;
  return [imageX / renderedWidth * naturalWidth, imageY / renderedHeight * naturalHeight];
}

function luminance(color) {
  const channels = color.slice(0, 3).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function createContrastSampler(onAssetReady) {
  const elementImageCache = new WeakMap();
  const backgroundImageCache = new Map();

  const canvasForImage = (image, cache, key, source) => {
    const existing = cache.get(key);
    if (existing?.source === source && existing.status !== "loading") return existing;
    const width = image.naturalWidth || image.videoWidth;
    const height = image.naturalHeight || image.videoHeight;
    if (!width || !height) return { status: "loading", source };
    const scale = Math.min(1, 512 / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    try {
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      context.getImageData(0, 0, 1, 1);
      const record = { status: "ready", source, canvas, context, width, height };
      cache.set(key, record);
      return record;
    } catch {
      const record = { status: "unsupported", source };
      cache.set(key, record);
      return record;
    }
  };

  const readCanvasPixel = (record, point) => {
    if (!point || record.status !== "ready") return null;
    const x = clamp(point[0] / record.width, 0, 0.999999);
    const y = clamp(point[1] / record.height, 0, 0.999999);
    const pixel = [...record.context.getImageData(
      Math.floor(x * record.canvas.width),
      Math.floor(y * record.canvas.height),
      1,
      1,
    ).data];
    pixel[3] /= 255;
    return pixel;
  };

  const sampleElementImage = (element, rect, x, y) => {
    if (!element.complete) return { unsupported: true };
    const record = canvasForImage(element, elementImageCache, element, element.currentSrc || element.src);
    if (record.status !== "ready") return { unsupported: true };
    const style = getComputedStyle(element);
    const point = mapImagePoint(
      rect,
      record.width,
      record.height,
      x,
      y,
      style.objectFit || "fill",
      style.objectPosition,
    );
    return { color: point ? readCanvasPixel(record, point) : [0, 0, 0, 0] };
  };

  const backgroundRecord = (url) => {
    if (backgroundImageCache.has(url)) return backgroundImageCache.get(url);
    const record = { status: "loading", source: url };
    backgroundImageCache.set(url, record);
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const ready = canvasForImage(image, backgroundImageCache, url, url);
      backgroundImageCache.set(url, ready);
      onAssetReady?.();
    };
    image.onerror = () => {
      backgroundImageCache.set(url, { status: "unsupported", source: url });
      onAssetReady?.();
    };
    image.src = url;
    return record;
  };

  const sampleBackgroundUrl = (layer, element, rect, x, y) => {
    const url = layer.match(/^url\(["']?(.*?)["']?\)$/i)?.[1];
    if (!url) return { unsupported: true };
    const record = backgroundRecord(url);
    if (record.status !== "ready") return { unsupported: true };
    const style = getComputedStyle(element);
    const size = style.backgroundSize.split(",")[0].trim();
    const fit = size === "cover" || size === "contain" ? size : "fill";
    const point = mapImagePoint(
      rect,
      record.width,
      record.height,
      x,
      y,
      fit,
      style.backgroundPosition.split(",")[0],
    );
    return { color: point ? readCanvasPixel(record, point) : [0, 0, 0, 0] };
  };

  const sampleElement = (element, x, y) => {
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return { color: [0, 0, 0, 0] };
    const style = getComputedStyle(element);
    let combined = parseCssColor(style.backgroundColor) || [0, 0, 0, 0];

    if (element instanceof HTMLImageElement) {
      const imageLayer = sampleElementImage(element, rect, x, y);
      if (imageLayer.unsupported) return imageLayer;
      combined = over(imageLayer.color, combined);
    } else if (element instanceof HTMLCanvasElement || element instanceof HTMLVideoElement) {
      return { unsupported: true };
    }

    if (style.backgroundImage !== "none") {
      const layers = splitTopLevel(style.backgroundImage).reverse();
      for (const layer of layers) {
        const gradient = sampleGradient(layer, rect, x, y);
        const sampled = gradient ? { color: gradient } : sampleBackgroundUrl(layer, element, rect, x, y);
        if (sampled.unsupported) return sampled;
        combined = over(sampled.color, combined);
      }
    }
    return { color: combined };
  };

  return {
    sample(x, y) {
      try {
        const elements = document.elementsFromPoint(x, y)
          .filter((element) => !element.closest?.("[data-narziss-cursor]"));
        let visible = [0, 0, 0, 0];
        for (const element of elements) {
          const layer = sampleElement(element, x, y);
          if (layer.unsupported) return null;
          visible = over(visible, layer.color);
          if (visible[3] >= 0.995) break;
        }
        if (visible[3] < 0.8) return null;
        return { color: visible, luminance: luminance(visible) };
      } catch {
        return null;
      }
    },
    destroy() {
      backgroundImageCache.clear();
      parsedColorCache.clear();
    },
  };
}

// Set false for a quick disable. To remove completely, delete this file and
// remove the single CustomCursor import/mount from App.jsx.
const CURSOR_ENABLED = true;
const ELIGIBLE_POINTER = "(hover: hover) and (pointer: fine)";
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const INTERACTIVE = "a[href], button, [role='button'], summary, label[for], input[type='button'], input[type='submit'], input[type='checkbox'], input[type='radio'], select";
const EDITABLE = "input:not([type='button']):not([type='submit']):not([type='checkbox']):not([type='radio']), textarea, [contenteditable='true']";

// Cursor dimensions and hover growth can be adjusted here without touching
// storefront styles or elements.
const CURSOR_STYLES = `
.narziss-custom-cursor {
  color: #313131;
  height: 24px;
  left: 0;
  opacity: 0;
  pointer-events: none;
  position: fixed;
  top: 0;
  width: 24px;
  z-index: 2147483647;
}
.narziss-custom-cursor.is-visible:not(.is-over-editable) { opacity: 1; }
.narziss-custom-cursor-ring,
.narziss-custom-cursor-dot {
  left: 50%;
  pointer-events: none;
  position: absolute;
  top: 50%;
}
.narziss-custom-cursor-ring {
  border: 1px solid currentColor;
  border-radius: 50%;
  height: 24px;
  margin: -12px 0 0 -12px;
  transition: transform 160ms ease-out;
  width: 24px;
}
.narziss-custom-cursor-dot {
  background: currentColor;
  border-radius: 50%;
  height: 4px;
  margin: -2px 0 0 -2px;
  width: 4px;
}
.narziss-custom-cursor.is-interactive .narziss-custom-cursor-ring { transform: scale(1.3); }
@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference) {
  html.narziss-cursor-active body,
  html.narziss-cursor-active body * { cursor: none !important; }
  html.narziss-cursor-active input:not([type="button"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]),
  html.narziss-cursor-active textarea,
  html.narziss-cursor-active [contenteditable="true"],
  html.narziss-cursor-active [contenteditable="true"] * { cursor: text !important; }
}`;

/**
 * Permanent storefront cursor. Position updates are direct; contrast reads are
 * throttled and cached. No storefront element is written to or transformed.
 */
export default function CustomCursor() {
  const cursorRef = useRef(null);

  useEffect(() => {
    if (!CURSOR_ENABLED || !cursorRef.current) return undefined;
    const pointerQuery = window.matchMedia(ELIGIBLE_POINTER);
    const motionQuery = window.matchMedia(REDUCED_MOTION);
    let cleanupActive = null;

    const deactivate = () => {
      cleanupActive?.();
      cleanupActive = null;
      document.documentElement.classList.remove("narziss-cursor-active");
      cursorRef.current?.classList.remove("is-visible", "is-interactive");
    };

    const activate = () => {
      deactivate();
      if (!pointerQuery.matches || motionQuery.matches) return;
      const cursor = cursorRef.current;
      const controller = new AbortController();
      let contrastFrame = 0;
      let lastContrastTime = 0;
      let pointerX = 0;
      let pointerY = 0;
      let hasPointer = false;
      let selectedColor = null;
      let failed = false;

      const restoreNative = () => {
        document.documentElement.classList.remove("narziss-cursor-active");
        cursor.classList.remove("is-visible", "is-interactive");
      };

      const failSafe = () => {
        if (failed) return;
        failed = true;
        cancelAnimationFrame(contrastFrame);
        controller.abort();
        restoreNative();
      };

      let scheduleContrast;
      let sampler;
      try {
        sampler = createContrastSampler(() => scheduleContrast?.());
      } catch {
        restoreNative();
        return;
      }

      const updateContrast = (time) => {
        contrastFrame = 0;
        if (!hasPointer || failed) return;
        if (time - lastContrastTime < 32) {
          contrastFrame = requestAnimationFrame(updateContrast);
          return;
        }
        lastContrastTime = time;
        const result = sampler.sample(pointerX, pointerY);
        if (!result) {
          restoreNative();
          return;
        }

        // Hysteresis prevents flicker around the light/dark crossover.
        if (selectedColor === "white" && result.luminance > 0.28) selectedColor = "charcoal";
        else if (selectedColor === "charcoal" && result.luminance < 0.22) selectedColor = "white";
        else if (!selectedColor) selectedColor = result.luminance < 0.25 ? "white" : "charcoal";
        cursor.style.color = selectedColor === "white" ? "#FFFFFF" : "#313131";
        document.documentElement.classList.add("narziss-cursor-active");
        cursor.classList.add("is-visible");
      };

      scheduleContrast = () => {
        if (!contrastFrame && !failed) contrastFrame = requestAnimationFrame(updateContrast);
      };

      const onPointerMove = (event) => {
        try {
          pointerX = event.clientX;
          pointerY = event.clientY;
          hasPointer = true;
          cursor.style.transform = `translate3d(${pointerX - 12}px, ${pointerY - 12}px, 0)`;
          const target = document.elementFromPoint(pointerX, pointerY);
          const editable = target?.closest?.(EDITABLE);
          cursor.classList.toggle("is-interactive", !editable && Boolean(target?.closest?.(INTERACTIVE)));
          cursor.classList.toggle("is-over-editable", Boolean(editable));
          scheduleContrast();
        } catch {
          failSafe();
        }
      };

      const onPointerLeave = () => {
        hasPointer = false;
        restoreNative();
      };

      const onScroll = () => scheduleContrast();
      window.addEventListener("pointermove", onPointerMove, { passive: true, signal: controller.signal });
      window.addEventListener("scroll", onScroll, { passive: true, capture: true, signal: controller.signal });
      window.addEventListener("blur", onPointerLeave, { signal: controller.signal });
      document.addEventListener("mouseleave", onPointerLeave, { signal: controller.signal });

      cleanupActive = () => {
        controller.abort();
        cancelAnimationFrame(contrastFrame);
        sampler.destroy();
        restoreNative();
      };
    };

    const handleEligibilityChange = () => activate();
    pointerQuery.addEventListener("change", handleEligibilityChange);
    motionQuery.addEventListener("change", handleEligibilityChange);
    activate();

    return () => {
      pointerQuery.removeEventListener("change", handleEligibilityChange);
      motionQuery.removeEventListener("change", handleEligibilityChange);
      deactivate();
    };
  }, []);

  if (!CURSOR_ENABLED) return null;
  return createPortal(
    <>
      <style data-narziss-cursor-styles>{CURSOR_STYLES}</style>
      <div ref={cursorRef} className="narziss-custom-cursor" data-narziss-cursor aria-hidden="true">
        <span className="narziss-custom-cursor-ring" />
        <span className="narziss-custom-cursor-dot" />
      </div>
    </>,
    document.body,
  );
}
