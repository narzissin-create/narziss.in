import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../services/api";
import { HierarchySelector } from "../components/HierarchySelector";
import { ProductCard } from "../components/UI";
import { developmentNavigationPreview } from "../services/navigationPreview";
import { applyDevelopmentSubcategoryFixtures, getDevelopmentFixtureProductBySlug, getDevelopmentFixtureProducts, resolveDevelopmentShopPath } from "../services/developmentSubcategoryFixtures";
import { NEW_ARRIVALS_PATH } from "../services/storefrontRoutes";

const fixtureNavigation = applyDevelopmentSubcategoryFixtures(developmentNavigationPreview);

function currentBatchSize() {
  if (window.matchMedia("(min-width: 1024px)").matches) return 15;
  if (window.matchMedia("(min-width: 768px)").matches) return 9;
  return 6;
}

function useFixtureBatchSize() {
  const [batchSize, setBatchSize] = useState(currentBatchSize);
  useEffect(() => {
    const update = () => setBatchSize(currentBatchSize());
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return batchSize;
}

export default function DevelopmentFixtureShopRoute() {
  const { sectionSlug, categorySlug, subcategorySlug } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [openSelector, setOpenSelector] = useState("");
  const [tags, setTags] = useState([]);
  const [tagError, setTagError] = useState("");
  const [tagRetry, setTagRetry] = useState(0);
  const selectedTag = searchParams.get("tag") || "";
  const selectedTab = searchParams.get("tab") === "trending" ? "trending" : "all";
  const sortOrder = searchParams.get("price") === "desc" ? "desc" : "asc";
  const batchSize = useFixtureBatchSize();
  const [visibleCount, setVisibleCount] = useState(batchSize);
  const rootRef = useRef(null);
  const match = resolveDevelopmentShopPath(fixtureNavigation, sectionSlug, categorySlug, subcategorySlug);

  useEffect(() => {
    const close = (event) => { if (!rootRef.current?.contains(event.target)) setOpenSelector(""); };
    const escape = (event) => {
      if (event.key !== "Escape" || !openSelector) return;
      const trigger = rootRef.current?.querySelector(`[aria-controls="${openSelector}-options"]`);
      setOpenSelector("");
      requestAnimationFrame(() => trigger?.focus());
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [openSelector]);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setTagError("");
    api.getTags({ signal: controller.signal })
      .then((items) => { if (alive) setTags(Array.isArray(items) ? items : []); })
      .catch((error) => { if (alive && error.name !== "AbortError") setTagError("Tags are unavailable."); });
    return () => { alive = false; controller.abort(); };
  }, [tagRetry]);

  useEffect(() => setVisibleCount(batchSize), [batchSize, sectionSlug, categorySlug, subcategorySlug, selectedTag, selectedTab, sortOrder]);

  const updateFilter = (name, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(name, value);
    else next.delete(name);
    setSearchParams(next);
  };

  const products = useMemo(() => {
    if (!match) return [];
    const items = getDevelopmentFixtureProducts(sectionSlug, categorySlug, subcategorySlug)
      .filter((product) => (!selectedTag || tags[product.tagSlot]?.name === selectedTag) && (selectedTab !== "trending" || product.isTrending));
    return [...items].sort((left, right) => sortOrder === "desc" ? right.price - left.price : left.price - right.price);
  }, [match, sectionSlug, categorySlug, subcategorySlug, selectedTag, selectedTab, sortOrder, tags]);
  const visibleProducts = products.slice(0, visibleCount);

  if (!match) return <div className="container section development-fixture-route"><h1>Development route not found</h1><Link className="text-link" to={NEW_ARRIVALS_PATH}>Browse New Arrivals</Link></div>;

  const { section, category, subcategory } = match;
  const sectionPath = `/shop/${section.slug}`;
  const categoryPath = category ? `${sectionPath}/${category.slug}` : "";
  const previewPath = (path) => `${path}?navigationPreview=fixtures`;
  const heading = subcategory?.name || category?.name || section.name;
  const homeOptions = fixtureNavigation.map((item) => ({ label: item.name, value: item.slug, current: item.slug === section.slug }));
  const sectionOptions = section.categories.map((item) => ({ label: item.name, value: item.slug, current: item.slug === category?.slug }));
  const categoryOptions = category?.subcategories.map((item) => ({ label: item.name, value: item.slug, current: item.slug === subcategory?.slug })) || [];

  return <div className="container section development-fixture-route" ref={rootRef}>
    <nav className="shop-breadcrumbs shop-hierarchy-selectors" aria-label="Shop hierarchy">
      <HierarchySelector id="home-level" label="Home" openId={openSelector} setOpenId={setOpenSelector} options={homeOptions} onSelect={(option) => navigate(previewPath(`/shop/${option.value}`))} />
      <span aria-hidden="true">›</span>
      <HierarchySelector id="section-level" label={section.name} openId={openSelector} setOpenId={setOpenSelector} options={sectionOptions} onSelect={(option) => navigate(previewPath(`${sectionPath}/${option.value}`))} />
      {category && <><span aria-hidden="true">›</span><HierarchySelector id="category-level" label={category.name} openId={openSelector} setOpenId={setOpenSelector} options={categoryOptions} onSelect={(option) => navigate(previewPath(`${categoryPath}/${option.value}`))} /></>}
      {subcategory && <><span aria-hidden="true">›</span><HierarchySelector id="subcategory-level" label={subcategory.name} openId={openSelector} setOpenId={setOpenSelector} options={[]} onSelect={() => {}} /></>}
    </nav>
    <div className="development-fixture-heading-row">
      <div>
        <h1>{heading}</h1>
        <div className="tabs" aria-label="Product view">
          {["all", "trending"].map((tab) => <button type="button" key={tab} className={selectedTab === tab ? "selected" : ""} aria-pressed={selectedTab === tab} onClick={() => updateFilter("tab", tab === "all" ? "" : tab)}>{tab}</button>)}
        </div>
      </div>
      <div className="development-fixture-filters">
        <label><span>Tags</span><select value={selectedTag} onChange={(event) => updateFilter("tag", event.target.value)}><option value="">All tags</option>{tags.map((tag) => <option key={tag.id || tag.name} value={tag.name}>{tag.name}</option>)}</select></label>
        <label><span>Price</span><select value={sortOrder} onChange={(event) => updateFilter("price", event.target.value)}><option value="asc">Low to High</option><option value="desc">High to Low</option></select></label>
      </div>
    </div>
    {tagError && <p className="error" role="alert">{tagError} <button type="button" className="text-link" onClick={() => setTagRetry((value) => value + 1)}>Retry</button></p>}
    {products.length ? <><section className="product-grid development-fixture-products" aria-label="Development fixture products">{visibleProducts.map((product) => <ProductCard product={getDevelopmentFixtureProductBySlug(`development-${product.id}`)} key={product.id} />)}</section>{visibleCount < products.length && <div className="development-fixture-show-more"><button type="button" onClick={() => setVisibleCount((count) => Math.min(products.length, count + batchSize))}>Show more products ↓</button></div>}</> : <div className="development-fixture-empty"><p>No mock products match this tag.</p></div>}
  </div>;
}
