import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "../services/api";
import { subscribeToSmoothScroll } from "./SmoothScrollProvider";
import "./CardHero.css";
import { replaceBroadShopDestination } from "../services/storefrontRoutes";

// Set this to false to keep the plain #F5E6CC hero background. Removing the
// architecture markup and asset is otherwise independent of the card hero.
export const HERO_ARCHITECTURAL_BACKGROUND_ENABLED = true;

const HERO_ARCHITECTURE_WEBP = "/assets/hero-architecture.webp";
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

const LAPTOP_ROLES = {
  1: ["c"],
  2: ["c", "d"],
  3: ["b", "c", "d"],
  4: ["b", "c", "d", "e"],
  5: ["a", "b", "c", "d", "e"],
};

const COMPACT_ROLES = {
  1: ["c"],
  2: ["c", "d"],
  3: ["b", "c", "d"],
};

function hasOrder(card) {
  return card.order_index !== null && card.order_index !== undefined && card.order_index !== "";
}

function stableCardSort(left, right) {
  const leftOrdered = hasOrder(left);
  const rightOrdered = hasOrder(right);
  if (leftOrdered !== rightOrdered) return leftOrdered ? -1 : 1;
  if (leftOrdered && Number(left.order_index) !== Number(right.order_index)) {
    return Number(left.order_index) - Number(right.order_index);
  }
  const leftCreated = Date.parse(left.created_at || "") || 0;
  const rightCreated = Date.parse(right.created_at || "") || 0;
  if (leftCreated !== rightCreated) return leftCreated - rightCreated;
  return String(left.id ?? "").localeCompare(String(right.id ?? ""));
}

function useCompactCards() {
  const [compact, setCompact] = useState(() =>
    window.matchMedia("(max-width: 1023px)").matches,
  );

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => setCompact(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return compact;
}

function Card({ card, role, visible = true, suppressClickRef }) {
  const target = replaceBroadShopDestination(typeof card.target_url === "string" ? card.target_url.trim() : "");
  const safeTarget = target.startsWith("/") || /^https?:\/\//i.test(target) ? target : "";
  const content = (
    <img
      src={card.image_url}
      alt={card.title || "Narziss product card"}
      draggable="false"
      onError={(event) => {
        event.currentTarget.closest(".product-hero-card")?.classList.add("has-image-error");
      }}
    />
  );
  const className = `product-hero-card product-hero-card--${role}${safeTarget ? " is-linked" : ""}`;
  const interactionProps = {
    "data-hero-visible": visible ? "true" : "false",
    "aria-hidden": visible ? undefined : true,
    inert: visible ? undefined : true,
    onClickCapture: (event) => {
      if (suppressClickRef?.current) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
  };

  if (!safeTarget) {
    return <div className={className} {...interactionProps}>{content}</div>;
  }
  if (safeTarget.startsWith("/")) {
    return (
      <Link className={className} to={safeTarget} aria-label={`Open ${card.title || "featured product"}`} {...interactionProps}>
        {content}
      </Link>
    );
  }
  return (
    <a className={className} href={safeTarget} aria-label={`Open ${card.title || "featured product"}`} {...interactionProps}>
      {content}
    </a>
  );
}

export default function CardHero() {
  const [cards, setCards] = useState(null);
  const [ready, setReady] = useState(false);
  const [revealReady, setRevealReady] = useState(false);
  const [architectureImageFailed, setArchitectureImageFailed] = useState(false);
  const [compactWindowStart, setCompactWindowStart] = useState(0);
  const [compactEntranceComplete, setCompactEntranceComplete] = useState(false);
  const compact = useCompactCards();
  const frames = useRef([]);
  const heroRef = useRef(null);
  const compactInitializedRef = useRef(false);
  const gestureRef = useRef(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    let active = true;
    api.getBanners()
      .then((records) => {
        if (active) setCards(Array.isArray(records) ? records : []);
      })
      .catch(() => {
        if (active) setCards([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    frames.current.forEach(cancelAnimationFrame);
    frames.current = [];
    if (cards === null) return;
    setReady(false);
    const first = requestAnimationFrame(() => {
      const second = requestAnimationFrame(() => setReady(true));
      frames.current = [second];
    });
    frames.current = [first];
    return () => {
      frames.current.forEach(cancelAnimationFrame);
      frames.current = [];
    };
  }, [cards, compact]);

  const featuredCards = useMemo(() => {
    if (!cards) return [];
    return cards
      .filter((card) => card?.active !== false && typeof card?.image_url === "string" && card.image_url)
      .sort(stableCardSort)
      .slice(0, 5);
  }, [cards]);

  useEffect(() => {
    if (!compact) {
      compactInitializedRef.current = false;
      setCompactEntranceComplete(false);
      return undefined;
    }
    if (!featuredCards.length) return undefined;
    const maximumStart = Math.max(0, featuredCards.length - 3);
    if (!compactInitializedRef.current) {
      setCompactWindowStart(Math.min(maximumStart, Math.ceil(maximumStart / 2)));
      compactInitializedRef.current = true;
    } else {
      setCompactWindowStart((current) => Math.min(maximumStart, current));
    }
    setCompactEntranceComplete(false);
    const reducedMotion = window.matchMedia(REDUCED_MOTION).matches;
    const timer = window.setTimeout(() => setCompactEntranceComplete(true), reducedMotion ? 0 : 2350);
    return () => window.clearTimeout(timer);
  }, [compact, featuredCards.length]);

  const roles = compact
    ? featuredCards.length <= 3
      ? COMPACT_ROLES[featuredCards.length] || []
      : featuredCards.map((_, index) => {
          if (index < compactWindowStart) return "off-left";
          if (index > compactWindowStart + 2) return "off-right";
          return ["b", "c", "d"][index - compactWindowStart];
        })
    : LAPTOP_ROLES[featuredCards.length] || [];
  const empty = cards !== null && featuredCards.length === 0;
  const compactMaximumStart = Math.max(0, featuredCards.length - 3);
  const compactControlsVisible = compact && featuredCards.length > 3;

  const moveCompactWindow = (direction) => {
    if (!compactEntranceComplete) return;
    setCompactWindowStart((current) => Math.max(0, Math.min(compactMaximumStart, current + direction)));
  };

  const beginGesture = (event) => {
    if (!compact || event.pointerType === "mouse") return;
    gestureRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  };
  const endGesture = (event) => {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - gesture.x;
    const deltaY = event.clientY - gesture.y;
    if (Math.abs(deltaX) < 42 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.15) return;
    suppressClickRef.current = true;
    moveCompactWindow(deltaX < 0 ? 1 : -1);
    window.setTimeout(() => { suppressClickRef.current = false; }, 0);
  };

  useEffect(() => {
    const hero = heroRef.current;
    if (!ready || !hero || empty) {
      setRevealReady(false);
      return;
    }
    if (!window.matchMedia("(min-width: 768px)").matches) {
      hero.nextElementSibling?.style.removeProperty("--home-arrivals-overlap");
      setRevealReady(false);
      return;
    }

    setRevealReady(false);
    const startedAt = performance.now();
    let frame = 0;
    const checkSettled = (now) => {
      const cardAnimationsRunning = [...hero.querySelectorAll(".product-hero-card")]
        .some((card) => card.getAnimations().some((animation) =>
          animation.animationName.startsWith("product-card-") && animation.playState !== "finished",
        ));
      const imagesReady = [...hero.querySelectorAll(".product-hero-card img")]
        .every((image) => image.complete);
      const minimumEntranceTimeReached = now - startedAt >= 2500;
      const safeFallbackReached = now - startedAt >= 5000;

      if ((minimumEntranceTimeReached && !cardAnimationsRunning && imagesReady) || safeFallbackReached) {
        setRevealReady(true);
        return;
      }
      frame = requestAnimationFrame(checkSettled);
    };
    frame = requestAnimationFrame(checkSettled);
    return () => cancelAnimationFrame(frame);
  }, [empty, ready, featuredCards.length, compact]);

  useEffect(() => {
    const hero = heroRef.current;
    const arrivals = hero?.nextElementSibling;
    if (!hero || empty || !arrivals?.classList.contains("home-new-arrivals-transition")) return;

    const reducedMotion = window.matchMedia(REDUCED_MOTION);
    const linkedCards = [...hero.querySelectorAll("a.product-hero-card")];
    let measurementFrame = 0;
    let latestScroll = window.scrollY;
    let lastProgress = Number.NaN;
    let geometry = null;

    const clearCoveredLinks = () => linkedCards.forEach((link) => { link.inert = link.dataset.heroVisible !== "true"; });
    const resetStacking = () => {
      arrivals.classList.remove("is-scroll-stacking");
      hero.style.removeProperty("--hero-stack-y");
      arrivals.style.removeProperty("--hero-stack-arrivals-y");
      geometry = null;
      lastProgress = Number.NaN;
      clearCoveredLinks();
    };

    const renderStacking = () => {
      if (!geometry || reducedMotion.matches) return;

      const progress = Math.min(1, Math.max(0, (latestScroll - geometry.start) / geometry.scrollDistance));
      if (Math.abs(progress - lastProgress) < 0.0001) return;
      lastProgress = progress;
      hero.style.setProperty("--hero-stack-y", `${(progress * geometry.heroShift).toFixed(3)}px`);
      arrivals.style.setProperty("--hero-stack-arrivals-y", `${((1 - progress) * geometry.overlap).toFixed(3)}px`);
      geometry.linkCoverProgress.forEach((coverProgress, link) => {
        link.inert = link.dataset.heroVisible !== "true" || progress >= coverProgress;
      });
    };

    const scheduleStacking = (scrollState) => {
      if (!Number.isFinite(scrollState?.scroll)) return;
      latestScroll = scrollState.scroll;
      renderStacking();
    };

    const measureStacking = () => {
      measurementFrame = 0;
      if (reducedMotion.matches) {
        resetStacking();
        return;
      }

      const styles = getComputedStyle(hero);
      const scrollDistance = Number.parseFloat(styles.getPropertyValue("--hero-stack-scroll-distance")) || 320;
      const heroShift = Number.parseFloat(styles.getPropertyValue("--hero-stack-max-shift")) || 64;
      const overlap = Number.parseFloat(styles.getPropertyValue("--hero-stack-overlap")) || 320;
      const headerHeight = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-height")) || 0;
      const heroRect = hero.getBoundingClientRect();
      const heroDocumentTop = heroRect.top + window.scrollY;
      const compositionCenter = Number.parseFloat(styles.getPropertyValue("--hero-composition-center")) || 0;
      const cardGroupOffset = Number.parseFloat(styles.getPropertyValue("--hero-card-group-offset")) || 0;
      const compositionOffset = Math.max(0, (heroRect.height / 2) - compositionCenter);
      const linkCoverProgress = new Map(linkedCards.map((link) => {
        const cardY = Number.parseFloat(getComputedStyle(link).getPropertyValue("--card-y")) || 0;
        const cardTop = compositionOffset + cardGroupOffset + cardY;
        return [link, Math.min(1, Math.max(0, (heroRect.height - cardTop) / (heroShift + overlap)))];
      }));

      geometry = {
        start: Math.max(0, heroDocumentTop - headerHeight),
        scrollDistance,
        heroShift,
        overlap,
        linkCoverProgress,
      };
      latestScroll = window.scrollY;
      lastProgress = Number.NaN;
      arrivals.classList.add("is-scroll-stacking");
      renderStacking();
    };

    const scheduleMeasurement = () => {
      if (!measurementFrame) measurementFrame = requestAnimationFrame(measureStacking);
    };

    const stopSmoothScrollSubscription = subscribeToSmoothScroll(scheduleStacking);
    const resizeObserver = new ResizeObserver(scheduleMeasurement);
    const heroImages = [...hero.querySelectorAll("img")];
    resizeObserver.observe(hero);
    resizeObserver.observe(arrivals);
    heroImages.forEach((image) => image.addEventListener("load", scheduleMeasurement));
    window.addEventListener("resize", scheduleMeasurement);
    reducedMotion.addEventListener("change", scheduleMeasurement);
    scheduleMeasurement();

    return () => {
      cancelAnimationFrame(measurementFrame);
      stopSmoothScrollSubscription();
      resizeObserver.disconnect();
      heroImages.forEach((image) => image.removeEventListener("load", scheduleMeasurement));
      window.removeEventListener("resize", scheduleMeasurement);
      reducedMotion.removeEventListener("change", scheduleMeasurement);
      resetStacking();
    };
  }, [empty, featuredCards.length]);

  return (
    <section
      ref={heroRef}
      className={`product-card-hero${ready ? " is-ready" : ""}${revealReady ? " is-reveal-ready" : ""}${compactEntranceComplete ? " is-compact-browsing" : ""}${empty ? " is-empty" : ""}`}
      aria-label="Featured products"
    >
      <div className="product-card-hero__cream-underlay" aria-hidden="true">
        {HERO_ARCHITECTURAL_BACKGROUND_ENABLED && !architectureImageFailed && (
          <picture className="product-card-hero__architecture">
            <source srcSet={HERO_ARCHITECTURE_WEBP} type="image/webp" />
            <img
              src={HERO_ARCHITECTURE_WEBP}
              alt=""
              decoding="async"
              draggable="false"
              onError={() => setArchitectureImageFailed(true)}
            />
          </picture>
        )}
      </div>
      <div className="product-card-hero__scroll-layer">
        <div className="product-card-hero__composition-layer">
          <div className="product-card-hero__cream" aria-hidden="true">
            <div className="product-card-hero__decoration">
              <span className="product-card-hero__wordmark">NARZISS</span>
            </div>
          </div>
          <div
            className="product-card-hero__stage"
            onPointerDown={beginGesture}
            onPointerUp={endGesture}
            onPointerCancel={() => { gestureRef.current = null; }}
          >
            {featuredCards.map((card, index) => (
              <Card
                key={card.id ?? `${card.image_url}-${index}`}
                card={card}
                role={roles[index]}
                visible={!compact || (index >= compactWindowStart && index <= compactWindowStart + 2)}
                suppressClickRef={suppressClickRef}
              />
            ))}
          </div>
        </div>
        {compactControlsVisible && (
          <div className="product-card-hero__controls" aria-label="Browse featured cards">
            <button
              type="button"
              aria-label="Previous featured cards"
              disabled={!compactEntranceComplete || compactWindowStart === 0}
              onClick={() => moveCompactWindow(-1)}
            ><ChevronLeft size={21} /></button>
            <button
              type="button"
              aria-label="Next featured cards"
              disabled={!compactEntranceComplete || compactWindowStart === compactMaximumStart}
              onClick={() => moveCompactWindow(1)}
            ><ChevronRight size={21} /></button>
          </div>
        )}
      </div>
      {empty && <p className="product-card-hero__empty">Featured cards are currently unavailable.</p>}
    </section>
  );
}
