import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Menu,
  Package,
  Search,
  ShoppingBag,
  UserRound,
  X,
} from "lucide-react";
import { config } from "../config";
import { api } from "../services/api";
import { acquireOverlayScrollLock } from "../services/overlayScrollLock";
import { money } from "../services/logic";
import { useStore } from "../state/Store";
import { Image, Spinner, isProductCardData } from "./UI";
import Announcement from "./Announcement";
import { NEW_ARRIVALS_PATH } from "../services/storefrontRoutes";
import { getTemporaryStorefrontHierarchy } from "../services/temporaryStorefrontHierarchy";

function Brand({ className = "navbar-brand", onClick }) {
  return (
    <Link className={className} to="/" aria-label="Narziss home" onClick={onClick}>
      {config.logo ? (
        <img src={config.logo} alt="Narziss" className="navbar-brand-img" onError={(event) => { event.currentTarget.hidden = true; }} />
      ) : <span className="navbar-brand-text">NARZISS</span>}
    </Link>
  );
}

function ProductSearch({ id, onNavigate }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [activeResult, setActiveResult] = useState(-1);
  const [open, setOpen] = useState(false);
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  const ref = useRef(null);
  const keyboardModalityRef = useRef(false);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setResults([]);
    setError("");
    setActiveResult(-1);
    if (query.trim().length < 2) {
      setLoading(false);
      return () => controller.abort();
    }
    setLoading(true);
    const timer = setTimeout(() => {
      api.listProducts({ query: query.trim() }, 0, 6, { signal: controller.signal })
        .then((result) => {
          if (!Array.isArray(result?.items) || !result.items.every(isProductCardData)) {
            throw new Error("Search results were invalid.");
          }
          if (alive) setResults(result.items);
        })
        .catch((searchError) => {
          if (alive && searchError.name !== "AbortError") setError("Search is unavailable. Please try again.");
        })
        .finally(() => { if (alive) setLoading(false); });
    }, 250);
    return () => {
      alive = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, retry]);

  useEffect(() => {
    const close = (event) => {
      keyboardModalityRef.current = false;
      if (ref.current?.contains(event.target)) setKeyboardFocus(false);
      if (!ref.current?.contains(event.target)) setOpen(false);
    };
    const trackKeyboard = (event) => {
      if (event.key === "Tab") keyboardModalityRef.current = true;
    };
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("keydown", trackKeyboard, true);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("keydown", trackKeyboard, true);
    };
  }, []);

  const selectProduct = (product) => {
    setOpen(false);
    setQuery("");
    onNavigate?.();
    navigate(`/products/${product.slug}`);
  };

  return (
    <div className={`search-box${keyboardFocus ? " keyboard-focus" : ""}`} ref={ref}>
      <div className="search-input-shell">
        <label className="sr-only" htmlFor={id}>Search products and categories</label>
        <Search size={16} />
        <input
          id={id}
          value={query}
          placeholder="Search"
          onFocus={() => { setOpen(true); setKeyboardFocus(keyboardModalityRef.current); }}
          onBlur={() => setKeyboardFocus(false)}
          role="combobox"
          aria-expanded={open && query.trim().length >= 2}
          aria-controls={`${id}-results`}
          aria-activedescendant={activeResult >= 0 ? `${id}-result-${activeResult}` : undefined}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); setActiveResult(-1); }}
          onKeyDown={(event) => {
            if (event.key === "Escape") { setOpen(false); setActiveResult(-1); }
            if (event.key === "ArrowDown" && results.length && open) {
              event.preventDefault();
              setActiveResult((index) => (index + 1) % results.length);
            }
            if (event.key === "ArrowUp" && results.length && open) {
              event.preventDefault();
              setActiveResult((index) => index <= 0 ? results.length - 1 : index - 1);
            }
            if (event.key === "Enter" && results[activeResult]) {
              event.preventDefault();
              selectProduct(results[activeResult]);
            }
          }}
        />
      </div>
      {open && query.trim().length >= 2 && (
        <div className="search-results" id={`${id}-results`} role="listbox">
          {loading ? <Spinner /> : error ? (
            <div>
              <p className="error" role="alert">{error}</p>
              <button type="button" className="text-link" onClick={() => setRetry((value) => value + 1)}>Retry search</button>
            </div>
          ) : results.length ? results.map((product, index) => (
            <button
              type="button"
              key={product.id}
              id={`${id}-result-${index}`}
              role="option"
              aria-selected={activeResult === index}
              className={activeResult === index ? "active" : ""}
              onClick={() => selectProduct(product)}
            >
              <Image src={product.images[0]} alt="" />
              <span>{product.name}<small>{money(product.price)}</small></span>
            </button>
          )) : (
            <>
              <p>No products found.</p>
              <Link to={NEW_ARRIVALS_PATH} onClick={() => { setOpen(false); onNavigate?.(); }}>Browse New Arrivals</Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function StoreHeader() {
  const { user, requireLogin, setModal, lines, announcementText } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [sections, setSections] = useState([]);
  const [navigationError, setNavigationError] = useState("");
  const [navigationLoading, setNavigationLoading] = useState(true);
  const [navigationRetry, setNavigationRetry] = useState(0);
  const [navigationPreview, setNavigationPreview] = useState(false);
  const [activeSectionId, setActiveSectionId] = useState(null);
  const [megaMenuOpen, setMegaMenuOpen] = useState(false);
  const [drawerRendered, setDrawerRendered] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerView, setDrawerView] = useState({ level: "sections" });
  const [drawerDirection, setDrawerDirection] = useState("forward");
  const desktopNavigationRef = useRef(null);
  const drawerRef = useRef(null);
  const closeTimerRef = useRef(null);
  const megaFrameRef = useRef(null);
  const drawerCloseTimerRef = useRef(null);
  const drawerFrameRef = useRef(null);
  const cartCount = lines.reduce((total, line) => total + line.quantity, 0);
  const fixturePreview = import.meta.env.DEV && new URLSearchParams(location.search).get("navigationPreview") === "fixtures";
  const hierarchyDestination = (path) => fixturePreview ? `${path}?navigationPreview=fixtures` : path;

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setNavigationLoading(true);
    setNavigationError("");
    setNavigationPreview(false);
    const request = fixturePreview
      ? Promise.all([
          import("../services/developmentSubcategoryFixtures"),
          import("../services/navigationPreview"),
        ]).then(([fixtures, preview]) => fixtures.applyDevelopmentSubcategoryFixtures(preview.developmentNavigationPreview))
      : Promise.resolve(getTemporaryStorefrontHierarchy());
    request
      .then((items) => {
        if (!alive) return;
        setSections(items);
        setNavigationPreview(fixturePreview);
      })
      .catch((error) => {
        if (alive && error.name !== "AbortError") {
          setSections([]);
          setNavigationError("Navigation is temporarily unavailable.");
        }
      })
      .finally(() => { if (alive) setNavigationLoading(false); });
    return () => { alive = false; controller.abort(); };
  }, [navigationRetry, fixturePreview]);

  useEffect(() => {
    const handleOutside = (event) => {
      if (!desktopNavigationRef.current?.contains(event.target)) closeMegaMenu();
    };
    const handleEscape = (event) => {
      if (event.key === "Escape") closeMegaMenu();
    };
    document.addEventListener("pointerdown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    if (!drawerRendered) return undefined;
    const previouslyFocused = document.activeElement;
    const releaseScrollLock = acquireOverlayScrollLock();
    requestAnimationFrame(() => drawerRef.current?.querySelector("button, input, a")?.focus());
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        closeDrawer();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...(drawerRef.current?.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])') || [])];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      releaseScrollLock();
      previouslyFocused?.focus?.();
    };
  }, [drawerRendered]);

  useEffect(() => () => {
    clearTimeout(closeTimerRef.current);
    clearTimeout(drawerCloseTimerRef.current);
    cancelAnimationFrame(megaFrameRef.current);
    cancelAnimationFrame(drawerFrameRef.current);
  }, []);

  const activeSection = sections.find((section) => section.id === activeSectionId);
  const drawerSection = sections.find((section) => section.id === drawerView.sectionId);
  const drawerCategory = drawerSection?.categories.find((category) => category.id === drawerView.categoryId);
  const activeAnnouncement = announcementText ?? config.announcement;
  const openSection = (id) => {
    clearTimeout(closeTimerRef.current);
    cancelAnimationFrame(megaFrameRef.current);
    setMegaMenuOpen(true);
    setActiveSectionId(id);
  };
  const scheduleClose = () => {
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      if (!desktopNavigationRef.current?.contains(document.activeElement)) closeMegaMenu();
    }, 110);
  };
  function closeMegaMenu() {
    clearTimeout(closeTimerRef.current);
    cancelAnimationFrame(megaFrameRef.current);
    setMegaMenuOpen(false);
    closeTimerRef.current = setTimeout(() => setActiveSectionId(null), 220);
  }
  const openDrawer = () => {
    clearTimeout(drawerCloseTimerRef.current);
    cancelAnimationFrame(drawerFrameRef.current);
    setDrawerDirection("forward");
    setDrawerView({ level: "sections" });
    setDrawerRendered(true);
    drawerFrameRef.current = requestAnimationFrame(() => setDrawerOpen(true));
  };
  const closeDrawer = (afterClose) => {
    const callback = typeof afterClose === "function" ? afterClose : null;
    clearTimeout(drawerCloseTimerRef.current);
    cancelAnimationFrame(drawerFrameRef.current);
    setDrawerOpen(false);
    drawerCloseTimerRef.current = setTimeout(() => {
      setDrawerRendered(false);
      setDrawerDirection("forward");
      setDrawerView({ level: "sections" });
      callback?.();
    }, 240);
  };
  const showDrawerView = (view, direction) => {
    setDrawerDirection(direction);
    setDrawerView(view);
  };

  return (
    <header className="site-header">
      {Boolean(activeAnnouncement?.trim()) && <Announcement text={activeAnnouncement.trim()} />}
      <nav className="navbar" aria-label="Main navigation">
        <button type="button" className="mobile-menu-button icon-button" aria-label="Open navigation menu" aria-expanded={drawerOpen} onClick={openDrawer}><Menu size={24} /></button>
        <Brand />

        <div
          className="desktop-navigation"
          ref={desktopNavigationRef}
          onMouseLeave={scheduleClose}
          onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) closeMegaMenu(); }}
        >
          <div className="navbar-cats" aria-label="Shop sections">
            {navigationLoading ? <span className="navbar-nav-status">Loading menu…</span> : navigationError ? (
              <button type="button" className="navbar-nav-retry" onClick={() => setNavigationRetry((value) => value + 1)}>Categories unavailable — Retry</button>
            ) : sections.map((section) => (
              <button
                type="button"
                key={section.id}
                className={`navbar-cat-link${activeSectionId === section.id ? " active" : ""}`}
                aria-expanded={megaMenuOpen && activeSectionId === section.id}
                aria-controls={`mega-menu-${section.id}`}
                onMouseEnter={() => openSection(section.id)}
                onFocus={() => openSection(section.id)}
                onClick={() => openSection(section.id)}
              >
                {section.name}
              </button>
            ))}
          </div>
          {activeSection && (
            <div className={`mega-menu${megaMenuOpen ? " is-open" : ""}`} id={`mega-menu-${activeSection.id}`} onMouseEnter={() => openSection(activeSection.id)} onMouseLeave={scheduleClose}>
              <div className="mega-menu-grid">
                {activeSection.categories.map((category) => (
                  <section className="mega-menu-group" key={category.id}>
                    <h2><Link to={hierarchyDestination(`/shop/${activeSection.slug}/${category.slug}`)} onClick={closeMegaMenu}>{category.name}</Link></h2>
                    {category.subcategories.map((subcategory) => (
                      <Link className="mega-menu-pending-item" key={subcategory.id} to={hierarchyDestination(`/shop/${activeSection.slug}/${category.slug}/${subcategory.slug}`)} onClick={closeMegaMenu}>{subcategory.name}</Link>
                    ))}
                  </section>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="navbar-right desktop-navbar-right">
          <ProductSearch id="desktop-search" />
          <div className="nav-icons">
            <button className="icon-button" aria-label="My Orders" onClick={() => requireLogin(() => navigate("/my-orders"))}><Package size={20} /></button>
            <button className="icon-button" aria-label={`Cart, ${cartCount} items`} onClick={() => requireLogin(() => navigate("/cart"))}>
              <ShoppingBag size={20} />{cartCount > 0 && <span className="cart-count">{cartCount}</span>}
            </button>
            <button className="icon-button" aria-label={user ? "Account" : "Log in"} onClick={() => user ? setModal({ type: "account" }) : setModal({ type: "login" })}><UserRound size={20} /></button>
          </div>
        </div>

        <button className="mobile-cart-button icon-button" aria-label={`Cart, ${cartCount} items`} onClick={() => requireLogin(() => navigate("/cart"))}>
          <ShoppingBag size={22} />{cartCount > 0 && <span className="cart-count">{cartCount}</span>}
        </button>
      </nav>
      {navigationPreview && (
        <div className="navigation-preview-label" role="status">
          Development-only menu preview — navigation changes are not loaded from or saved to the database.
        </div>
      )}

      {drawerRendered && (
        <div className={`mobile-drawer-layer${drawerOpen ? " is-open" : " is-closing"}`}>
          <button type="button" className="mobile-drawer-overlay" aria-label="Close navigation menu" onClick={closeDrawer} />
          <aside className="mobile-drawer" ref={drawerRef} role="dialog" aria-modal="true" aria-label="Shop navigation">
            <div className="mobile-drawer-header">
              <button type="button" className="mobile-drawer-close" aria-label="Close navigation menu" onClick={closeDrawer}><X size={25} /></button>
              <Brand className="mobile-drawer-brand" onClick={closeDrawer} />
              <span aria-hidden="true" className="mobile-drawer-balance" />
            </div>

            <div className="mobile-drawer-viewport">
            {drawerView.level === "sections" && (
              <div className={`mobile-drawer-content drawer-view-${drawerDirection}`} key="sections">
                <p className="mobile-drawer-eyebrow">Shop</p>
                {navigationLoading ? <Spinner label="Loading navigation…" /> : navigationError ? (
                  <div className="mobile-nav-error" role="alert">
                    <p>{navigationError}</p>
                    <button type="button" className="button" onClick={() => setNavigationRetry((value) => value + 1)}>Retry</button>
                  </div>
                ) : sections.map((section) => (
                  <button type="button" className="mobile-drawer-row" key={section.id} onClick={() => showDrawerView({ level: "categories", sectionId: section.id }, "forward")}>
                    <span>{section.name}</span><ChevronRight size={21} aria-hidden="true" />
                  </button>
                ))}
                <div className="mobile-drawer-tools">
                  <ProductSearch id="mobile-search" onNavigate={closeDrawer} />
                  <button type="button" className="mobile-tool-row" onClick={() => closeDrawer(() => requireLogin(() => navigate("/my-orders")))}><Package size={20} /><span>My Orders</span></button>
                  <button type="button" className="mobile-tool-row" onClick={() => closeDrawer(() => user ? setModal({ type: "account" }) : setModal({ type: "login" }))}><UserRound size={20} /><span>{user ? "Account" : "Log in"}</span></button>
                </div>
              </div>
            )}

            {drawerView.level === "categories" && drawerSection && (
              <div className={`mobile-drawer-content drawer-view-${drawerDirection}`} key={`categories-${drawerSection.id}`}>
                <button type="button" className="mobile-drawer-back" onClick={() => showDrawerView({ level: "sections" }, "back")}><ChevronLeft size={22} /><span>Back</span></button>
                <h2 className="mobile-drawer-title">{drawerSection.name}</h2>
                {drawerSection.categories.map((category) => category.subcategories.length ? (
                  <button type="button" className="mobile-drawer-row" key={category.id} onClick={() => showDrawerView({ level: "subcategories", sectionId: drawerSection.id, categoryId: category.id }, "forward")}>
                    <span>{category.name}</span><ChevronRight size={21} aria-hidden="true" />
                  </button>
                ) : <Link className="mobile-drawer-row mobile-drawer-label" key={category.id} to={hierarchyDestination(`/shop/${drawerSection.slug}/${category.slug}`)} onClick={closeDrawer}>{category.name}</Link>)}
              </div>
            )}

            {drawerView.level === "subcategories" && drawerSection && drawerCategory && (
              <div className={`mobile-drawer-content drawer-view-${drawerDirection}`} key={`subcategories-${drawerCategory.id}`}>
                <button type="button" className="mobile-drawer-back" onClick={() => showDrawerView({ level: "categories", sectionId: drawerSection.id }, "back")}><ChevronLeft size={22} /><span>Back</span></button>
                <h2 className="mobile-drawer-title">{drawerCategory.name}</h2>
                {drawerCategory.subcategories.map((subcategory) => <Link className="mobile-drawer-row mobile-drawer-label" key={subcategory.id} to={hierarchyDestination(`/shop/${drawerSection.slug}/${drawerCategory.slug}/${subcategory.slug}`)} onClick={closeDrawer}>{subcategory.name}</Link>)}
              </div>
            )}
            </div>
          </aside>
        </div>
      )}
    </header>
  );
}
