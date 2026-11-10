import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ProductList } from "../components/Products";
import { HierarchySelector } from "../components/HierarchySelector";
import { Empty, Spinner } from "../components/UI";
import { listTemporaryHierarchyProducts } from "../services/temporaryHierarchyAdapter";
import { getTemporaryStorefrontHierarchy, resolveTemporaryHierarchyPath } from "../services/temporaryStorefrontHierarchy";

const DevelopmentFixtureShopRoute = import.meta.env.DEV
  ? lazy(() => import("./DevelopmentFixtureShopRoute"))
  : null;

function HierarchyNotFound() {
  return (
    <div className="container section hierarchy-listing-route">
      <Empty>
        <h1>Page Not Found</h1>
        <Link className="button" to="/">Return Home</Link>
      </Empty>
    </div>
  );
}

function TemporaryHierarchyListing() {
  const { sectionSlug, categorySlug, subcategorySlug } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [openSelector, setOpenSelector] = useState("");
  const breadcrumbRef = useRef(null);
  const match = resolveTemporaryHierarchyPath(sectionSlug, categorySlug, subcategorySlug);

  useEffect(() => {
    const close = (event) => {
      if (!breadcrumbRef.current?.contains(event.target)) setOpenSelector("");
    };
    const escape = (event) => {
      if (event.key !== "Escape" || !openSelector) return;
      const trigger = breadcrumbRef.current?.querySelector(`[aria-controls="${openSelector}-options"]`);
      setOpenSelector("");
      requestAnimationFrame(() => trigger?.focus());
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [openSelector]);

  useEffect(() => setOpenSelector(""), [sectionSlug, categorySlug, subcategorySlug]);

  if (!match.valid) return <HierarchyNotFound />;

  const heading = match.subcategory?.name || match.category?.name || match.section.name;
  const hierarchy = getTemporaryStorefrontHierarchy();
  const sectionPath = `/shop/${match.section.slug}`;
  const categoryPath = match.category ? `${sectionPath}/${match.category.slug}` : "";
  const homeOptions = hierarchy.map((section) => ({
    label: section.name,
    value: section.slug,
    current: section.id === match.section.id,
  }));
  const sectionOptions = match.section.categories.map((category) => ({
    label: category.name,
    value: category.slug,
    current: category.id === match.category?.id,
  }));
  const categoryOptions = (match.category?.subcategories || []).map((subcategory) => ({
    label: subcategory.name,
    value: subcategory.slug,
    current: subcategory.id === match.subcategory?.id,
  }));

  return (
    <div className="container section hierarchy-listing-route">
      <nav className="shop-breadcrumbs shop-hierarchy-selectors" aria-label="Shop hierarchy" ref={breadcrumbRef}>
        <HierarchySelector
          id="home-level"
          label="Home"
          options={homeOptions}
          openId={openSelector}
          setOpenId={setOpenSelector}
          onSelect={(option) => navigate(`/shop/${option.value}`)}
        />
        <span aria-hidden="true">›</span>
        <HierarchySelector
          id="section-level"
          label={match.section.name}
          options={sectionOptions}
          openId={openSelector}
          setOpenId={setOpenSelector}
          onSelect={(option) => navigate(`${sectionPath}/${option.value}`)}
        />
        {match.category && (
          <>
            <span aria-hidden="true">›</span>
            <HierarchySelector
              id="category-level"
              label={match.category.name}
              options={categoryOptions}
              openId={openSelector}
              setOpenId={setOpenSelector}
              onSelect={(option) => navigate(`${categoryPath}/${option.value}`)}
            />
          </>
        )}
        {match.subcategory && (
          <>
            <span aria-hidden="true">›</span>
            <HierarchySelector
              id="subcategory-level"
              label={match.subcategory.name}
              options={[]}
              openId={openSelector}
              setOpenId={setOpenSelector}
              onSelect={() => {}}
            />
          </>
        )}
      </nav>
      <h1>{heading}</h1>
      <ProductList
        hierarchy
        sectionId={match.section.id}
        categoryId={match.category?.id}
        subcategoryId={match.subcategory?.id}
        loaderOverride={listTemporaryHierarchyProducts}
        initialTab={searchParams.get("tab") || "all"}
        urlFilters
      />
    </div>
  );
}

export default function HierarchyListingRoute() {
  const [searchParams] = useSearchParams();
  const fixturePreview = import.meta.env.DEV && searchParams.get("navigationPreview") === "fixtures";
  if (fixturePreview && DevelopmentFixtureShopRoute) {
    return (
      <Suspense fallback={<div className="container section"><Spinner label="Loading development preview…" /></div>}>
        <DevelopmentFixtureShopRoute />
      </Suspense>
    );
  }
  return <TemporaryHierarchyListing />;
}
