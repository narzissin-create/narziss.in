import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  Search,
  ShoppingBag,
  UserRound,
  Package,
} from "lucide-react";
import { config } from "../config";
import { api } from "../services/api";
import { money } from "../services/logic";
import { useStore } from "../state/Store";
import { BackTop, Spinner, Image, isProductCardData } from "./UI";
import StoreHeader from "./StoreHeader";
import Announcement from "./Announcement";
import { NEW_ARRIVALS_PATH } from "../services/storefrontRoutes";
import { getTemporaryStorefrontHierarchy } from "../services/temporaryStorefrontHierarchy";

// Kept only for the legacy exported Header below. The active StoreHeader is
// API-driven and intentionally has no hardcoded production navigation data.
const NAV_CATS = [];

export function Header() {
  const { user, requireLogin, setModal, lines, logout, announcementText } = useStore(),
    navigate = useNavigate(),
    [query, setQuery] = useState(""),
    [results, setResults] = useState([]),
    [loading, setLoading] = useState(false),
    [searchError, setSearchError] = useState(""),
    [searchRetry, setSearchRetry] = useState(0),
    [activeResult, setActiveResult] = useState(-1),
    [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setResults([]);
    setSearchError("");
    setActiveResult(-1);
    if (query.trim().length < 2) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(
      () =>
        api
          .listProducts({ query: query.trim() }, 0, 6, {
            signal: controller.signal,
          })
          .then((result) => {
            if (
              !Array.isArray(result?.items) ||
              !result.items.every(isProductCardData)
            )
              throw new Error("Search results were invalid.");
            if (alive) setResults(result.items);
          })
          .catch((error) => {
            if (alive && error.name !== "AbortError")
              setSearchError("Search is unavailable. Please try again.");
          })
          .finally(() => alive && setLoading(false)),
      250,
    );
    return () => {
      alive = false;
      controller.abort();
      clearTimeout(t);
    };
  }, [query, searchRetry]);
  useEffect(() => {
    const h = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", h);
    return () => document.removeEventListener("pointerdown", h);
  }, []);
    const activeAnnouncement =
      announcementText !== null && announcementText !== undefined
        ? announcementText
        : config.announcement;

    return (
      <header className="site-header">
        {Boolean(activeAnnouncement && activeAnnouncement.trim()) && (
          <Announcement text={activeAnnouncement.trim()} />
        )}
      <nav className="navbar" aria-label="Main navigation">
        {/* Left — Brand */}
        <Link className="navbar-brand" to="/" aria-label="Narziss home">
          {config.logo ? (
            <img
              src={config.logo}
              alt="Narziss"
              className="navbar-brand-img"
              onError={(e) => { e.currentTarget.hidden = true; }}
            />
          ) : (
            <span className="navbar-brand-text">NARZISS</span>
          )}
        </Link>

        {/* Center — Category links */}
        <div className="navbar-cats" role="navigation" aria-label="Shop categories">
          {NAV_CATS.map((cat) => (
            <Link
              key={cat.slug}
              to={cat.isCollection ? `/collections/${cat.slug}` : NEW_ARRIVALS_PATH}
              className="navbar-cat-link"
            >
              {cat.label}
            </Link>
          ))}
        </div>

        {/* Right — Search + icons */}
        <div className="navbar-right">
          <div
            className="search-box"
            ref={ref}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                setOpen(false);
                setActiveResult(-1);
              }
            }}
          >
            <label className="sr-only" htmlFor="search">
              Search products and categories
            </label>
            <Search size={16} />
            <input
              id="search"
              value={query}
              placeholder="Search"
              onFocus={() => setOpen(true)}
              role="combobox"
              aria-expanded={open && query.trim().length >= 2}
              aria-controls="search-results"
              aria-activedescendant={
                activeResult >= 0 ? `search-result-${activeResult}` : undefined
              }
              onKeyDown={(e) => {
                if (e.key === "Escape") { setOpen(false); setActiveResult(-1); }
                if (e.key === "ArrowDown" && results.length && open) {
                  e.preventDefault();
                  setActiveResult((i) => (i + 1) % results.length);
                }
                if (e.key === "ArrowUp" && results.length && open) {
                  e.preventDefault();
                  setActiveResult((i) => (i <= 0 ? results.length - 1 : i - 1));
                }
                if (e.key === "Enter" && open && results[activeResult]) {
                  e.preventDefault();
                  const result = results[activeResult];
                  setOpen(false);
                  setQuery("");
                  navigate(`/products/${result.slug}`);
                }
              }}
              onChange={(e) => {
                setActiveResult(-1);
                setQuery(e.target.value);
                setOpen(true);
              }}
            />
            {open && query.trim().length >= 2 && (
              <div className="search-results" id="search-results" role="listbox">
                {loading ? (
                  <Spinner />
                ) : searchError ? (
                  <div>
                    <p className="error" role="alert">{searchError}</p>
                    <button type="button" className="text-link" onClick={() => setSearchRetry((n) => n + 1)}>Retry search</button>
                  </div>
                ) : results.length ? (
                  results.map((p, index) => (
                    <Link
                      key={p.id}
                      id={`search-result-${index}`}
                      role="option"
                      aria-selected={activeResult === index}
                      className={activeResult === index ? "active" : ""}
                      to={`/products/${p.slug}`}
                      onClick={() => { setOpen(false); setQuery(""); }}
                    >
                      <Image src={p.images[0]} alt="" />
                      <span>{p.name}<small>{money(p.price)}</small></span>
                    </Link>
                  ))
                ) : (
                  <>
                    <p>No products found.</p>
                    <Link to={NEW_ARRIVALS_PATH} onClick={() => setOpen(false)}>Browse New Arrivals</Link>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="nav-icons">
            <button className="icon-button" aria-label="My Orders" onClick={() => requireLogin(() => navigate("/my-orders"))}>
              <Package size={20} />
            </button>
            <button className="icon-button" aria-label={`Cart, ${lines.reduce((n, l) => n + l.quantity, 0)} items`} onClick={() => requireLogin(() => navigate("/cart"))}>
              <ShoppingBag size={20} />
              {lines.length > 0 && (
                <span className="cart-count">{lines.reduce((n, l) => n + l.quantity, 0)}</span>
              )}
            </button>
            <button className="icon-button" aria-label={user ? "Account" : "Log in"} onClick={() => user ? setModal({ type: "account" }) : setModal({ type: "login" })}>
              <UserRound size={20} />
            </button>
          </div>
        </div>
      </nav>
    </header>
  );
}
export function Footer() {
  const { setModal } = useStore();
  const [shopLinks, setShopLinks] = useState([]);
  const [shopLinksUnavailable, setShopLinksUnavailable] = useState(false);
  useEffect(() => {
    const sections = getTemporaryStorefrontHierarchy();
    setShopLinks(sections.flatMap((section) => section.categories.flatMap((category) =>
      category.subcategories.length
        ? category.subcategories.map((subcategory) => ({
            label: subcategory.name,
            to: `/shop/${section.slug}/${category.slug}/${subcategory.slug}`,
          }))
        : [{ label: category.name, to: `/shop/${section.slug}/${category.slug}` }],
    )));
    setShopLinksUnavailable(false);
  }, []);
  const helpLeft = [
    { label: "Order Status", href: "/my-orders", internal: true },
    { label: "Delivery", href: "#" },
    { label: "FAQs", href: "#" },
    { label: "Shipping Policy", href: "#" },
    { label: "Return & Cancellation Policy", href: "#" },
    { label: "Contact Us", href: config.contact.email.href || "#" },
  ];
  const helpRight = [
    { label: "About Us", href: "#" },
    { label: "Narziss Lifestyle Ltd.", href: "#" },
    { label: "Narziss Blog", href: "#" },
    { label: "Bulk Order", href: "#" },
  ];
  return (
    <footer className="footer">
      <div className="container footer-top-grid">
        {/* Brand column */}
        <section className="footer-brand-col">
          <Link to="/" className="footer-logo-link" aria-label="Narziss home">
            {config.logo ? (
              <img
                src={config.logo}
                alt="Narziss"
                className="footer-logo-img"
                onError={(e) => { e.currentTarget.hidden = true; }}
              />
            ) : (
              <span className="footer-brand-name">Narziss</span>
            )}
          </Link>
          {config.about && <p className="footer-about-text">{config.about}</p>}
          <div className="footer-socials-row">
            {config.contact.instagram.href && (
              <a
                href={config.contact.instagram.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className="footer-social-icon"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
              </a>
            )}
            {config.contact.whatsapp.href && (
              <a
                href={config.contact.whatsapp.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="WhatsApp"
                className="footer-social-icon"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
              </a>
            )}
            {config.contact.email.href && (
              <a
                href={config.contact.email.href}
                aria-label="Email"
                className="footer-social-icon"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              </a>
            )}
          </div>
        </section>

        {/* Categories column */}
        <section className="footer-col">
          <h3>Shop</h3>
          {shopLinks.map((item) => <Link key={item.to} to={item.to}>{item.label}</Link>)}
          {shopLinksUnavailable && <span className="footer-navigation-unavailable">Categories unavailable</span>}
          <Link to={NEW_ARRIVALS_PATH}>New Arrivals</Link>
        </section>

        {/* Help Left */}
        <section className="footer-col">
          <h3>Need Help?</h3>
          {helpLeft.map((item) =>
            item.internal ? (
              <Link key={item.label} to={item.href}>{item.label}</Link>
            ) : (
              <a key={item.label} href={item.href}>{item.label}</a>
            )
          )}
        </section>

        {/* Help Right */}
        <section className="footer-col">
          <h3>Company</h3>
          {helpRight.map((item) => (
            <a key={item.label} href={item.href}>{item.label}</a>
          ))}
          <div className="footer-contact-block">
            <h3 style={{ marginTop: "1.5rem" }}>Contact</h3>
            {Object.entries(config.contact).map(([key, item]) => (
              <div className="contact-row" key={key}>
                <span>{item.label}</span>
                {item.href && (
                  <a
                    href={item.href}
                    {...(key === "email"
                      ? {}
                      : { target: "_blank", rel: "noopener noreferrer" })}
                  >
                    {item.display || item.href}
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="container footer-bottom">
        <span>{"\u00a9"} 2026 Narziss Lifestyle Ltd. All rights reserved.</span>
        <div className="footer-bottom-links">
          <button onClick={() => setModal({ type: "terms" })}>
            Terms &amp; Conditions
          </button>
          <a href="#" onClick={(e) => e.preventDefault()}>Privacy Policy</a>
        </div>
      </div>
    </footer>
  );
}
export function Shell({ children }) {
  const { notice, maintenanceMode } = useStore(),
    location = useLocation(),
    ref = useRef(null),
    plain = location.pathname === "/my-orders";

  useEffect(() => {
    api.getTheme().then((theme) => {
      if (!theme) return;
      if (theme.primary_color) {
        document.documentElement.style.setProperty("--green", theme.primary_color);
        document.documentElement.style.setProperty("--border", theme.primary_color);
      }
      if (theme.secondary_color) {
        document.documentElement.style.setProperty("--accent", theme.secondary_color);
      }
      if (theme.font_family) {
        document.documentElement.style.setProperty("font-family", theme.font_family);
      }
      if (theme.dark_mode) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    let observer, timer;
    if (location.hash) {
      let id;
      try {
        id = decodeURIComponent(location.hash.slice(1));
      } catch {
        id = location.hash.slice(1);
      }
      const scroll = () => {
        const anchor = document.getElementById(id);
        if (!anchor) return false;
        anchor.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "auto"
            : "smooth",
        });
        observer?.disconnect();
        clearTimeout(timer);
        return true;
      };
      if (!scroll()) {
        observer = new MutationObserver(scroll);
        observer.observe(document.getElementById("main"), {
          childList: true,
          subtree: true,
        });
        timer = setTimeout(() => observer.disconnect(), 10_000);
      }
    } else window.scrollTo(0, 0);
    return () => {
      clearTimeout(timer);
      observer?.disconnect();
    };
  }, [location.pathname, location.hash]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () =>
      document.documentElement.style.setProperty(
        "--header-height",
        `${el.getBoundingClientRect().height}px`,
      );
    const o = new ResizeObserver(update);
    o.observe(el);
    update();
    return () => o.disconnect();
  }, [plain]);
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      {maintenanceMode && (
        <aside
          role="alert"
          style={{
            backgroundColor: "#dc2626",
            color: "#ffffff",
            padding: "10px 16px",
            textAlign: "center",
            fontWeight: "600",
            fontSize: "0.95rem",
            letterSpacing: "0.02em",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            zIndex: 9999,
            position: "relative",
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
          }}
        >
          <span style={{ fontSize: "1.2rem" }}>⚠️</span>
          <span>WEBSITE UNDER MAINTENANCE: Checkout and ordering are currently paused. You may browse items.</span>
        </aside>
      )}
      {!plain && (
        <div ref={ref} className="sticky top-0 z-30">
          <StoreHeader />
        </div>
      )}

      <main id="main">{children}</main>
      <Footer />
      <BackTop />
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
    </>
  );
}
