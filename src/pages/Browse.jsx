import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  Instagram,
  MessageCircle,
  Mail,
  QrCode,
  ChevronRight,
  Search,
  SlidersHorizontal,
  Tag as TagIcon,
  X,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import { categories, collections, config } from "../config";
import {
  Hero,
  Carousel,
  Image,
  ProductCard,
  Spinner,
  useReducedMotion,
} from "../components/UI";
import CardHero from "../components/CardHero";
import { ProductList } from "../components/Products";
import { updateMeta } from "../services/meta";
import { api } from "../services/api";



function CategoryShowcase({ heading, sub, category, collection, ids, newArrivals = false }) {
  return (
    <section className="category-showcase section">
      <div className="category-showcase-header">
        <div>
          <h2 className="showcase-heading">{heading}</h2>
          {sub && <p className="showcase-sub">{sub}</p>}
        </div>
      </div>
      <ProductList category={category} collection={collection} ids={ids} newArrivals={newArrivals} />
    </section>
  );
}

/* ─── Socials & Profiles ───────────────────────────────────────────────── */
function SocialsSection() {
  const socials = [
    {
      key: "instagram",
      label: "Instagram",
      handle: config.contact.instagram.display || "@narziss.official",
      href: config.contact.instagram.href || "#",
      icon: <Instagram size={28} />,
      color: "#E1306C",
      desc: "Follow us for daily outfit inspiration, behind-the-scenes, and new drops.",
    },
    {
      key: "whatsapp",
      label: "WhatsApp",
      handle: config.contact.whatsapp.display || "+91 XXXXX XXXXX",
      href: config.contact.whatsapp.href || "#",
      icon: <MessageCircle size={28} />,
      color: "#25D366",
      desc: "Chat with us for order support, bulk inquiries, and styling advice.",
    },
    {
      key: "email",
      label: "Email",
      handle: config.contact.email.display || "hello@narziss.com",
      href: config.contact.email.href || "#",
      icon: <Mail size={28} />,
      color: "#2D4F1E",
      desc: "Drop us a line for collaborations, press, and customer support.",
    },
  ];

  return (
    <section className="socials-section section" aria-label="Find us online">
      <div className="container">
        <div className="section-label-row">
          <span className="section-eyebrow">Connect With Us</span>
          <h2 className="section-title-centered">Socials & Profiles</h2>
          <p className="section-subtitle">
            Stay in the loop — new drops, exclusive deals, and lifestyle
            content.
          </p>
        </div>
        <div className="socials-grid">
          {socials.map((s) => (
            <a
              key={s.key}
              href={s.href}
              className="social-card"
              target={s.key !== "email" ? "_blank" : undefined}
              rel={s.key !== "email" ? "noopener noreferrer" : undefined}
              aria-label={`${s.label}: ${s.handle}`}
            >
              <span
                className="social-card-icon"
                style={{ color: s.color }}
                aria-hidden="true"
              >
                {s.icon}
              </span>
              <strong className="social-card-label">{s.label}</strong>
              <span className="social-card-handle">{s.handle}</span>
              <p className="social-card-desc">{s.desc}</p>
              <span className="social-card-qr" aria-hidden="true">
                <QrCode size={40} />
                <span className="social-qr-label">Scan to follow</span>
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Help & Footer Links Section ─────────────────────────────────────── */
function HelpSection() {
  const leftLinks = [
    { label: "Order Status", href: "/my-orders" },
    { label: "Delivery", href: "#" },
    { label: "FAQs", href: "#" },
    { label: "Shipping Policy", href: "#" },
    { label: "Return & Cancellation Policy", href: "#" },
    { label: "Contact Us", href: `mailto:${config.contact.email.href || ""}` },
  ];
  const rightLinks = [
    { label: "About Us", href: "#" },
    { label: "Narziss Lifestyle Ltd.", href: "#" },
    { label: "Narziss Blog", href: "#" },
    { label: "Bulk Order", href: "#" },
  ];

  return (
    <section
      className="help-section section"
      aria-label="Help and information links"
    >
      <div className="container">
        <div className="section-label-row">
          <span className="section-eyebrow">Support</span>
          <h2 className="section-title-centered">Need Help?</h2>
        </div>
        <div className="help-grid">
          <div className="help-column">
            <h3 className="help-col-title">Customer Support</h3>
            <ul className="help-link-list" role="list">
              {leftLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="help-link"
                    {...(link.href.startsWith("mailto:")
                      ? {}
                      : { onClick: (e) => e.preventDefault() })}
                  >
                    <ChevronRight size={14} aria-hidden="true" />
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div className="help-divider" aria-hidden="true" />
          <div className="help-column">
            <h3 className="help-col-title">About Narziss</h3>
            <ul className="help-link-list" role="list">
              {rightLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="help-link"
                    onClick={(e) => e.preventDefault()}
                  >
                    <ChevronRight size={14} aria-hidden="true" />
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Join Community Section ───────────────────────────────────────────── */
function CommunitySection() {
  const [input, setInput] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) {
      setError("Please enter your email or phone number.");
      return;
    }
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
    const isPhone = /^(\+91)?[6-9]\d{9}$/.test(trimmed.replace(/\s/g, ""));
    if (!isEmail && !isPhone) {
      setError(
        "Please enter a valid email address or 10-digit Indian phone number.",
      );
      return;
    }
    setError("");
    setSubmitted(true);
  }

  const socialLinks = [
    {
      label: "Instagram",
      href: config.contact.instagram.href || "#",
      icon: <Instagram size={22} />,
      color: "#E1306C",
    },
    {
      label: "WhatsApp",
      href: config.contact.whatsapp.href || "#",
      icon: <MessageCircle size={22} />,
      color: "#25D366",
    },
  ];

  return (
    <section className="community-section" aria-label="Join our community">
      <div className="container">
        <div className="community-inner">
          <div className="community-content">
            <span className="section-eyebrow community-eyebrow">
              Join the Club
            </span>
            <h2 className="community-heading">Join Our Community</h2>
            <p className="community-sub">
              Be the first to know about new drops, exclusive offers, and
              Narziss lifestyle updates. No spam — ever.
            </p>

            {submitted ? (
              <p className="community-success" role="status">
                ✓ You're in! Welcome to the Narziss community.
              </p>
            ) : (
              <form
                className="community-form"
                onSubmit={handleSubmit}
                noValidate
              >
                <label htmlFor="community-input" className="sr-only">
                  Enter your email or phone number
                </label>
                <input
                  id="community-input"
                  type="text"
                  className="community-input"
                  placeholder="Email address or phone number"
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    if (error) setError("");
                  }}
                  autoComplete="email"
                />
                <button type="submit" className="button community-btn">
                  Subscribe
                </button>
                {error && (
                  <p className="community-error field-error" role="alert">
                    {error}
                  </p>
                )}
              </form>
            )}

            <div className="community-socials-row">
              <span className="community-find-label">Find us on:</span>
              <div className="community-social-links">
                {socialLinks.map((s) => (
                  <a
                    key={s.label}
                    href={s.href}
                    className="community-social-btn"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={s.label}
                    style={{ "--social-color": s.color }}
                  >
                    {s.icon}
                    <span>{s.label}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>

          <div className="community-visual" aria-hidden="true">
            <div className="community-tag-cloud">
              {[
                "New Drop",
                "Acid Wash",
                "Formal",
                "Casual",
                "Trending",
                "Premium",
                "Lifestyle",
                "Limited",
                "Menswear",
                "Exclusive",
              ].map((tag, i) => (
                <span
                  key={tag}
                  className="community-tag"
                  style={{
                    animationDelay: `${i * 0.15}s`,
                    fontSize: `${0.7 + (i % 3) * 0.12}rem`,
                    opacity: 0.6 + (i % 4) * 0.1,
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Home Page ────────────────────────────────────────────────────────── */
export function Home() {
  const [sections, setSections] = useState([]);

  useEffect(() => {
    updateMeta(
      "Narziss | Formal, Casual & Trending Menswear",
      "Discover Narziss — premium Indian menswear. Shop formal, casual, acid-wash, cargo, and trending styles.",
    );
    api.getSections().then((s) => {
      if (Array.isArray(s) && s.length > 0) setSections(s);
    }).catch(() => {});
  }, []);

  return (
    <>
      <h1 className="sr-only">Narziss Menswear</h1>

      {/* API-driven product-card hero */}
      <CardHero />

      {/* Dynamic Sections from Backend */}
      {sections.length > 0 ? (
        sections.map((sec, index) => {
          const sectionProductIds =
            Array.isArray(sec.product_ids) && sec.product_ids.length > 0
              ? sec.product_ids
              : Array.isArray(sec.products) && sec.products.length > 0
                ? sec.products.map((p) => p.id)
                : null;
          return (
            <div id={index === 0 ? "new-arrivals" : undefined} className={`container${index === 0 ? " home-new-arrivals-transition" : ""}`} key={sec.id}>
              <CategoryShowcase
                heading={sec.name}
                sub={sec.description || "Fresh drops — crafted for every occasion."}
                collection={sec.collection || (sectionProductIds ? undefined : "casual")}
                category={sec.category}
                ids={sectionProductIds}
                newArrivals={index === 0}
              />
            </div>
          );
        })
      ) : (
        <div id="new-arrivals" className="container home-new-arrivals-transition">
          <CategoryShowcase
            heading="New Arrivals"
            sub="Fresh drops — crafted for every occasion."
            collection="casual"
            newArrivals
          />
        </div>
      )}

      {/* Socials & Profiles */}
      <SocialsSection />

      {/* Help Section */}
      <HelpSection />

      {/* Community / Newsletter */}
      <CommunitySection />
    </>
  );
}

function CollectionLinks({ exclude }) {
  const otherCollections = collections.filter((c) => c !== exclude);
  return (
    <div className="collection-links-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1.5rem", marginTop: "1.5rem", marginBottom: "3rem" }}>
      {otherCollections.map((c) => {
        const title = c === "formal" ? "Formal" : c === "casual" ? "Casual" : "Trending";
        return (
          <Link
            key={c}
            to={`/collections/${c}`}
            className="collection-card"
            style={{
              padding: "2rem",
              background: "var(--card-bg, #fbf7ee)",
              border: "1px solid var(--border-color, #e5dfd3)",
              borderRadius: "8px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              textDecoration: "none",
              color: "inherit",
              transition: "transform 0.2s, box-shadow 0.2s",
            }}
          >
            <div>
              <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "#666" }}>Collection</span>
              <h3 style={{ fontSize: "1.35rem", margin: "0.5rem 0", color: "#111" }}>{title} Menswear</h3>
            </div>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", fontWeight: 600, fontSize: "0.9rem", color: "#2d4f1e", marginTop: "1rem" }}>
              Explore Collection <ChevronRight size={16} />
            </span>
          </Link>
        );
      })}
    </div>
  );
}

/* ─── Collection Page ──────────────────────────────────────────────────── */
export function Collection() {
  const { collection } = useParams();
  useEffect(() => {
    updateMeta(
      `${collection} Menswear | Narziss`,
      `Browse the Narziss ${collection} menswear collection.`,
    );
  }, [collection]);
  if (!collections.includes(collection))
    return (
      <div className="container section">
        <h1>Collection not found</h1>
        <Link to="/#new-arrivals">Browse New Arrivals</Link>
      </div>
    );
  return (
    <>
      <Hero slides={[{ desktop: config.assets.collectionHeroes?.[collection] || "/assets/hero.png" }]} />
      <div className="container section">
        <h1>
          {collection === "formal"
            ? "Formal"
            : collection === "casual"
              ? "Casual"
              : "Trending"}{" "}
          Menswear
        </h1>
        <ProductList key={collection} collection={collection} />
        <h2>Explore Other Collections</h2>
        <CollectionLinks exclude={collection} />
      </div>
    </>
  );
}

/* ─── Shop Page (Redesigned with Tags & Tag-Based Search) ────────────────── */
export function Shop() {
  const [tags, setTags] = useState([]);
  const [selectedTag, setSelectedTag] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOption, setSortOption] = useState("popular");
  const [selectedPrice, setSelectedPrice] = useState("");
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    updateMeta(
      "Shop Men's Clothing | Narziss",
      "Explore curated Narziss menswear with tag and category filters.",
    );
    api
      .getTags()
      .then((data) => {
        if (Array.isArray(data)) setTags(data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setLoading(true);
    setError("");

    let minPrice, maxPrice;
    if (selectedPrice === "under-999") {
      maxPrice = 999;
    } else if (selectedPrice === "1000-1999") {
      minPrice = 1000;
      maxPrice = 1999;
    } else if (selectedPrice === "2000-plus") {
      minPrice = 2000;
    }

    const filters = {
      tag: selectedTag || undefined,
      category: selectedCategory || undefined,
      query: searchQuery.trim() || undefined,
      minPrice,
      maxPrice,
      sort: sortOption === "asc" ? "asc" : sortOption === "desc" ? "desc" : undefined,
    };

    api
      .listProducts(filters, 0, 100, { signal: controller.signal })
      .then((res) => {
        if (!alive) return;
        setProducts(res.items || []);
      })
      .catch((err) => {
        if (alive && err.name !== "AbortError") {
          setError(err.message || "Failed to load products");
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [selectedTag, selectedCategory, searchQuery, sortOption, selectedPrice]);

  const clearAllFilters = () => {
    setSelectedTag("");
    setSelectedCategory("");
    setSearchQuery("");
    setSortOption("popular");
    setSelectedPrice("");
  };

  const hasActiveFilters =
    Boolean(selectedTag) ||
    Boolean(selectedCategory) ||
    Boolean(searchQuery) ||
    sortOption !== "popular" ||
    Boolean(selectedPrice);

  return (
    <div className="container section shop-page shop-redesign">
      {/* ── Search & Tag Bar ── */}
      <div className="shop-header-row">
        <div className="shop-search-wrapper">
          <Search size={18} className="shop-search-icon" aria-hidden="true" />
          <input
            type="search"
            className="shop-search-input"
            placeholder="Search by tags, styles, fit, acid wash, oversized..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search clothing items and tags"
          />
          {searchQuery && (
            <button
              type="button"
              className="shop-search-clear"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* ── Tag Chips Bar ── */}
      <div className="shop-tags-strip" role="region" aria-label="Product tags">
        <button
          type="button"
          className={`shop-tag-chip ${!selectedTag ? "active" : ""}`}
          onClick={() => setSelectedTag("")}
        >
          <Sparkles size={14} className="tag-sparkle" /> All Tags
        </button>
        {tags.map((t) => {
          const isSelected = selectedTag.toLowerCase() === t.name.toLowerCase();
          return (
            <button
              key={t.id || t.name}
              type="button"
              className={`shop-tag-chip ${isSelected ? "active" : ""}`}
              onClick={() => setSelectedTag(isSelected ? "" : t.name)}
            >
              <TagIcon size={13} className="tag-icon" />
              <span>{t.name}</span>
            </button>
          );
        })}
      </div>

      {/* ── Horizontal Filter Bar (Matching Mockup) ── */}
      <div className="shop-filter-bar">
        <div className="shop-filter-group">
          <div className="shop-filter-select-wrapper">
            <select
              aria-label="Category filter"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="shop-filter-select"
            >
              <option value="">Category: All</option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="select-arrow" />
          </div>

          <div className="shop-filter-select-wrapper">
            <select
              aria-label="Price range filter"
              value={selectedPrice}
              onChange={(e) => setSelectedPrice(e.target.value)}
              className="shop-filter-select"
            >
              <option value="">Price: All</option>
              <option value="under-999">Under ₹999</option>
              <option value="1000-1999">₹1,000 - ₹1,999</option>
              <option value="2000-plus">₹2,000 & Above</option>
            </select>
            <ChevronDown size={14} className="select-arrow" />
          </div>

          <div className="shop-filter-select-wrapper">
            <select
              aria-label="Sort products by"
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value)}
              className="shop-filter-select"
            >
              <option value="popular">Sort By: Popular</option>
              <option value="asc">Price: Low to High</option>
              <option value="desc">Price: High to Low</option>
            </select>
            <ChevronDown size={14} className="select-arrow" />
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              className="shop-clear-btn"
              onClick={clearAllFilters}
            >
              <X size={14} /> Clear All
            </button>
          )}
        </div>
      </div>

      {/* ── Subtitle Count Bar ── */}
      <div className="shop-meta-bar">
        <div className="shop-meta-left">
          {selectedTag && (
            <span className="shop-active-badge">
              Tag: <strong>#{selectedTag}</strong>
              <button
                type="button"
                onClick={() => setSelectedTag("")}
                aria-label="Remove tag filter"
              >
                ×
              </button>
            </span>
          )}
          {selectedCategory && (
            <span className="shop-active-badge">
              Category: <strong>{selectedCategory}</strong>
              <button
                type="button"
                onClick={() => setSelectedCategory("")}
                aria-label="Remove category filter"
              >
                ×
              </button>
            </span>
          )}
        </div>
        <div className="shop-meta-count">
          <strong>{products.length}</strong> items found
        </div>
      </div>

      {/* ── Product Grid ── */}
      {loading ? (
        <div className="shop-loading-state">
          <Spinner label="Loading items..." />
        </div>
      ) : error ? (
        <div className="shop-error-state">
          <p>{error}</p>
          <button className="btn" onClick={() => clearAllFilters()}>
            Reset Filters
          </button>
        </div>
      ) : products.length === 0 ? (
        <div className="shop-empty-state">
          <h3>No products found</h3>
          <p>
            No items matched your active tags or search criteria. Try choosing a different tag or clear filters.
          </p>
          <button className="btn" onClick={clearAllFilters}>
            Clear Filters
          </button>
        </div>
      ) : (
        <div className="shop-grid">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}

    </div>
  );
}

/* ─── Shop Strip ───────────────────────────────────────────────────────── */
function ShopStrip() {
  const [offset, setOffset] = useState(0),
    reducedMotion = useReducedMotion(),
    [animated, setAnimated] = useState(true);
  useEffect(() => {
    if (reducedMotion) return;
    const t = setInterval(() => {
      setAnimated(true);
      setOffset((i) => Math.min(3, i + 1));
    }, 2000);
    return () => clearInterval(t);
  }, [reducedMotion]);
  useEffect(() => {
    if (reducedMotion) {
      setAnimated(false);
      setOffset(0);
    }
  }, [reducedMotion]);
  function reset() {
    if (offset >= 3) {
      setAnimated(false);
      setOffset(0);
    }
  }
  return (
    <section
      className="shop-strip"
      aria-label="Category campaign images"
    >
      <div className="shop-strip-window">
        <div
          className="shop-strip-track"
          style={{
            transform: `translateX(calc(-${offset} * (100% + var(--gap)) / var(--strip-count)))`,
            transition: animated ? "transform .5s ease" : "none",
          }}
          onTransitionEnd={reset}
        >
          {[...config.assets.shopImages, ...config.assets.shopImages].map(
            (src, i) => (
              <div key={i}>
                <Image src={src} alt="" />
              </div>
            ),
          )}
        </div>
      </div>
    </section>
  );
}
