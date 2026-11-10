import { validProduct } from "../services/validation";
import { useEffect, useRef, useState, memo } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronLeft, ChevronRight, ArrowUp, LoaderCircle } from "lucide-react";
import { money } from "../services/logic";
import { config } from "../config";
import { api } from "../services/api";
export function Spinner({ label = "Loading…" }) {
  return (
    <span className="inline-flex items-center gap-2" role="status">
      <LoaderCircle className="animate-spin" size={18} />
      {label}
    </span>
  );
}
export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}
export function Image({ src, alt = "", className = "" }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return src && !failed ? (
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  ) : (
    <div
      className={`image-placeholder ${className}`}
      aria-label={alt || "Image reserved"}
    >
      <span aria-hidden="true">{alt || "Image reserved"}</span>
    </div>
  );
}
export const isProductCardData = validProduct;
export const ProductCard = memo(function ProductCard({ product: p }) {
  if (!isProductCardData(p))
    return (
      <article className="product-card product-card--unavailable" aria-label="Product unavailable">
        <div className="product-photo">
          <Image alt="Product image unavailable" />
        </div>
        <div className="product-card-copy">
          <p className="product-name">Product unavailable</p>
        </div>
      </article>
    );
  const out = p.variants.every((v) => !v.stock);
  return (
    <article className="product-card">
      <Link
        to={`/products/${p.slug}${p.previewQuery || ""}`}
        className="product-card-link"
        aria-label={`${p.name}, ${money(p.price)}${out ? ", out of stock" : ""}`}
      >
        <span className="product-photo">
          <Image src={p.images[0]} alt={p.name} />
          {out && <span className="stock-label">Out of Stock</span>}
        </span>
        <span className="product-card-copy">
          <span className="product-name" title={p.name}>{p.name}</span>
          <span className="price">{money(p.price)}</span>
        </span>
      </Link>
    </article>
  );
});
export function BackTop() {
  const location = useLocation(),
    [show, setShow] = useState(false);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const selector =
        location.pathname.startsWith("/shop/")
          ? ".shop-filter-bar, .category-directory"
          : location.pathname.startsWith("/products/")
            ? ".reviews"
            : ".ad-banner";
      const anchor = document.querySelector(selector);
      setShow(
        anchor
          ? anchor.getBoundingClientRect().top < window.innerHeight
          : window.scrollY > window.innerHeight,
      );
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [location.pathname, location.key]);
  return show ? (
    <button
      className="back-top"
      aria-label="Back to top"
      onClick={() =>
        window.scrollTo({
          top: 0,
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "auto"
            : "smooth",
        })
      }
    >
      <ArrowUp size={20} />
    </button>
  ) : null;
}
export function Carousel({ children, label = "Browse", className = "" }) {
  const ref = useRef(null),
    [bounds, setBounds] = useState({ left: false, right: false });
  function update() {
    const el = ref.current;
    if (el)
      setBounds({
        left: el.scrollLeft > 2,
        right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2,
      });
  }
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    update();
    return () => observer.disconnect();
  }, []);
  useEffect(update, [children]);
  const move = (direction) => {
    ref.current?.scrollBy({
      left: direction * ref.current.clientWidth,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  };
  return (
    <div className={`carousel ${className}`}>
      <div
        className="carousel-track"
        ref={ref}
        onScroll={update}
        tabIndex={0}
        role="region"
        aria-label={label}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          move(event.key === "ArrowLeft" ? -1 : 1);
        }}
      >
        {children}
      </div>
      {(bounds.left || bounds.right) && (
        <div className="carousel-actions">
          <button
            aria-label={`${label} previous`}
            disabled={!bounds.left}
            onClick={() => move(-1)}
          >
            <ChevronLeft />
          </button>
          <button
            aria-label={`${label} next`}
            disabled={!bounds.right}
            onClick={() => move(1)}
          >
            <ChevronRight />
          </button>
        </div>
      )}
    </div>
  );
}
export function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}
export function Hero({ slides: propSlides }) {
  const [liveSlides, setLiveSlides] = useState(null);

  useEffect(() => {
    if (!propSlides) {
      api.getBanners().then((banners) => {
        if (Array.isArray(banners) && banners.length > 0) {
          setLiveSlides(
            banners.map((b) => ({
              desktop: b.image_url || "/assets/hero.png",
              mobile: b.image_url || "/assets/hero.png",
              title: b.title,
            }))
          );
        }
      }).catch(() => {});
    }
  }, [propSlides]);

  const slides = propSlides || liveSlides || config.assets.heroes;
  const [index, setIndex] = useState(0),
    reducedMotion = useReducedMotion(),
    [animated, setAnimated] = useState(true),
    looping = slides.length > 1,
    renderedSlides = looping ? [...slides, slides[0]] : slides,
    animationFrames = useRef([]),
    activeIndex = slides.length ? index % slides.length : 0;
  useEffect(
    () => () => {
      animationFrames.current.forEach(cancelAnimationFrame);
    },
    [],
  );
  useEffect(() => {
    if (slides.length < 2 || reducedMotion)
      return;
    const t = setInterval(() => {
      setAnimated(true);
      setIndex((i) => Math.min(slides.length, i + 1));
    }, 2000);
    return () => clearInterval(t);
  }, [slides.length, reducedMotion]);
  useEffect(() => {
    if (reducedMotion) {
      setAnimated(false);
      setIndex(0);
    }
  }, [reducedMotion, slides.length]);
  function finishTransition(event) {
    if (
      event.target !== event.currentTarget ||
      event.propertyName !== "transform"
    )
      return;
    if (looping && index === slides.length) {
      setAnimated(false);
      setIndex(0);
      animationFrames.current.forEach(cancelAnimationFrame);
      const first = requestAnimationFrame(() => {
        const second = requestAnimationFrame(() => setAnimated(true));
        animationFrames.current = [second];
      });
      animationFrames.current = [first];
    }
  }
  function selectSlide(nextIndex) {
    animationFrames.current.forEach(cancelAnimationFrame);
    animationFrames.current = [];
    setAnimated(true);
    setIndex(nextIndex);
  }
  return (
    <section
      className="hero"
      aria-label="Campaign images"
    >
      <div
        className="hero-track"
        style={{
          transform: `translateX(-${index * 100}%)`,
          transition: animated ? undefined : "none",
        }}
        onTransitionEnd={finishTransition}
      >
        {renderedSlides.map((s, i) => (
          <div className="hero-slide" key={i} aria-hidden={i === slides.length}>
            {s.desktop ? (
              <picture>
                <source
                  media="(max-width:767px)"
                  srcSet={s.mobile || s.desktop}
                />
                <img
                  src={s.desktop}
                  alt={`Narziss campaign ${i + 1}`}
                  fetchPriority={i === 0 ? "high" : "auto"}
                  onError={(e) => {
                    e.currentTarget.style.visibility = "hidden";
                  }}
                />
              </picture>
            ) : (
              <div
                className="hero-reserved"
                aria-label={`Campaign image ${i + 1} reserved`}
              />
            )}
          </div>
        ))}
      </div>
      {slides.length > 1 && (
        <div className="hero-controls">
          {slides.map((_, i) => (
            <button
              key={i}
              aria-label={`Show campaign ${i + 1}`}
              aria-pressed={i === activeIndex}
              onClick={() => selectSlide(i)}
              className={i === activeIndex ? "active" : ""}
            />
          ))}
        </div>
      )}
    </section>
  );
}
