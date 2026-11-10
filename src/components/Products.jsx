import { uniqueById } from "../services/validation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../services/api";
import { categories, colours, materials } from "../config";
import { ProductCard, Spinner, Empty, Carousel, isProductCardData } from "./UI";
import { useStore } from "../state/Store";
const columnSubscribers = new Set();
const getColumns = () => {
  if (window.matchMedia("(min-width: 1280px)").matches) return 5;
  if (window.matchMedia("(min-width: 1024px)").matches) return 4;
  if (window.matchMedia("(min-width: 768px)").matches) return 3;
  return 2;
};
const subscribeToColumns = (callback) => {
  columnSubscribers.add(callback);
  if (columnSubscribers.size === 1)
    window.addEventListener("resize", notifyColumnSubscribers);
  return () => {
    columnSubscribers.delete(callback);
    if (!columnSubscribers.size)
      window.removeEventListener("resize", notifyColumnSubscribers);
  };
};
function notifyColumnSubscribers() {
  columnSubscribers.forEach((callback) => callback());
}
export function useColumns() {
  return useSyncExternalStore(subscribeToColumns, getColumns, () => 2);
}
export function ProductList({
  category,
  collection,
  ids,
  newArrivals = false,
  hierarchy = false,
  sectionId,
  categoryId,
  subcategoryId,
  loaderOverride,
  initialTab = "all",
  urlFilters = false,
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const columns = useColumns(),
    [f, setF] = useState({
      tab: urlFilters ? (searchParams.get("tab") || initialTab) : initialTab,
      material: "",
      colour: "",
      sort: "",
      type: "",
      tag: urlFilters ? (searchParams.get("tag") || "") : "",
    }),
    [page, setPage] = useState(() => urlFilters ? Math.max(0, Number(searchParams.get("page") || 1) - 1) : 0),
    [data, setData] = useState({ items: [], total: 0 }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [tags, setTags] = useState([]),
    [tagsError, setTagsError] = useState("");
  const loadMoreLock = useRef(false);
  const searchSignature = searchParams.toString();
  const type = categories.find((c) => c.slug === category)?.type,
    effectiveType = type || f.type;
  const signature = JSON.stringify({ ...f, category, collection, ids, sectionId, categoryId, subcategoryId, hierarchy }),
    pageSize = columns * 3;

  useEffect(() => {
    if (!newArrivals && !hierarchy) return undefined;
    let active = true;
    const controller = new AbortController();
    setTagsError("");
    api.getTags({ signal: controller.signal })
      .then((items) => { if (active) setTags(items); })
      .catch((tagError) => {
        if (active && tagError.name !== "AbortError") setTagsError("Tags are temporarily unavailable.");
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [newArrivals, hierarchy, retry]);

  useEffect(() => {
    if (!urlFilters) return;
    setF((current) => ({
      ...current,
      tab: searchParams.get("tab") === "trending" ? "trending" : "all",
      tag: searchParams.get("tag") || "",
      sort: searchParams.get("price") === "desc" ? "desc" : searchParams.get("price") === "asc" ? "asc" : "",
    }));
    setPage(Math.max(0, Number(searchParams.get("page") || 1) - 1));
  }, [urlFilters, searchSignature]);
  useEffect(() => {
    if (!urlFilters) setPage(0);
    setData({ items: [], total: 0 });
  }, [signature, columns, urlFilters]);
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const loader = loaderOverride || (hierarchy ? api.listHierarchyProducts : api.listProducts);
    const offset = urlFilters ? 0 : page * pageSize;
    const limit = urlFilters ? (page + 1) * pageSize : pageSize;
    loader({ ...f, category, collection, ids, sectionId, categoryId, subcategoryId }, offset, limit, {
        signal: controller.signal,
      })
      .then((result) => {
        if (!alive) return;
        if (
          !result ||
          !Array.isArray(result.items) ||
          !result.items.every(isProductCardData) ||
          !Number.isInteger(result.total) ||
          result.total < result.items.length
        )
          throw new Error("Products could not be read. Please retry.");
        setData((current) => {
          if (!page || urlFilters) return { ...result, items: uniqueById(result.items) };
          const loaded = new Set(current.items.map((item) => item.id));
          return {
            items: [
              ...current.items,
              ...uniqueById(result.items).filter(
                (item) => !loaded.has(item.id),
              ),
            ],
            total: result.total,
          };
        });
      })
      .catch((e) => alive && e.name !== "AbortError" && setError(e.message))
      .finally(() => {
        if (alive) {
          loadMoreLock.current = false;
          setLoading(false);
        }
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [signature, columns, page, retry]);
  const change = (key, value) => {
    setData({ items: [], total: 0 });
    setF((old) => ({
      ...old,
      [key]: value,
      ...(key === "type" ? { material: "" } : {}),
    }));
    setPage(0);
    if (urlFilters) {
      const next = new URLSearchParams(searchParams);
      const parameter = key === "sort" ? "price" : key;
      if (value && !(key === "tab" && value === "all")) next.set(parameter, value);
      else next.delete(parameter);
      next.delete("page");
      setSearchParams(next);
    }
  };
  const reset = () => {
    setData({ items: [], total: 0 });
    setF({ tab: "all", material: "", colour: "", sort: "", type: "", tag: "" });
    if (urlFilters) setSearchParams(new URLSearchParams());
  };
  return (
    <>
      <div className="filter-bar">
        <div className="tabs">
          {(category && !hierarchy ? ["all", "new", "trending"] : ["all", "trending"]).map(
            (t) => (
              <button
                key={t}
                className={f.tab === t ? "selected" : ""}
                aria-pressed={f.tab === t}
                onClick={() => change("tab", t)}
              >
                {t}
              </button>
            ),
          )}
        </div>
        <div className="filter-selects">
          {!type && !hierarchy && (
            <select
              aria-label="Wear type"
              value={f.type}
              onChange={(e) => change("type", e.target.value)}
            >
              <option value="">All clothing</option>
              <option value="upper">Upper wear</option>
              <option value="bottom">Bottom wear</option>
            </select>
          )}
          {!newArrivals && !hierarchy && <select
              aria-label="Material"
              value={f.material}
              onChange={(e) => change("material", e.target.value)}
            >
              <option value="">Material</option>
              {[
                ...new Set(
                  effectiveType
                    ? materials[effectiveType]
                    : Object.values(materials).flat(),
                ),
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>}
          {(newArrivals || hierarchy) && <select
            aria-label="Tags"
            value={f.tag}
            onChange={(e) => change("tag", e.target.value)}
            disabled={Boolean(tagsError)}
          >
            <option value="">All Tags</option>
            {tags.map((tag) => <option key={tag.id ?? tag.name} value={tag.name}>{tag.name}</option>)}
          </select>}
          {!hierarchy && <select
            aria-label="Colour"
            value={f.colour}
            onChange={(e) => change("colour", e.target.value)}
          >
            <option value="">Colour</option>
            {colours.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>}
          <select
            className={newArrivals ? "new-arrivals-sort" : undefined}
            aria-label="Sort by price"
            value={f.sort}
            onChange={(e) => change("sort", e.target.value)}
          >
            <option value="">Sort</option>
            <option value="asc">Price: Low to High</option>
            <option value="desc">Price: High to Low</option>
          </select>
        </div>
      </div>
      {tagsError && <p className="filter-error" role="status">{tagsError} <button type="button" className="text-link" onClick={() => setRetry((value) => value + 1)}>Retry</button></p>}
      {error && !data.items.length ? (
        <Empty>
          <p>{error}</p>
          <button
            className="button secondary"
            onClick={() => setRetry((n) => n + 1)}
          >
            Retry
          </button>
        </Empty>
      ) : (
        <>
          <div className="product-grid">
            {data.items.map((p) => (
              <ProductCard product={p} key={p.id} />
            ))}
            {loading &&
              !data.items.length &&
              Array.from({ length: columns * 3 }, (_, i) => (
                <div className="skeleton-card" key={i}>
                  <div />
                  <span />
                  <span />
                </div>
              ))}
          </div>
          {loading && (
            <div className="loading-row">
              <Spinner label="Loading products…" />
            </div>
          )}
          {error && data.items.length > 0 && (
            <Empty>
              <p>{error}</p>
              <button
                className="button secondary"
                onClick={() => setRetry((n) => n + 1)}
              >
                Retry loading more
              </button>
            </Empty>
          )}
          {!loading && !data.items.length && (
            <Empty>
              <p>No products match these filters.</p>
              <button className="text-link" onClick={reset}>
                Clear filters
              </button>
            </Empty>
          )}
          {data.items.length < data.total && (
            <button
              className="show-more"
              disabled={loading || Boolean(error)}
              onClick={() => {
                if (loadMoreLock.current) return;
                loadMoreLock.current = true;
                const nextPage = page + 1;
                setPage(nextPage);
                if (urlFilters) {
                  const next = new URLSearchParams(searchParams);
                  next.set("page", String(nextPage + 1));
                  setSearchParams(next);
                }
              }}
            >
              Show more products ↓
            </button>
          )}
        </>
      )}
    </>
  );
}
export function Recommendations({
  title = "You May Also Like",
  exclude = [],
  requireCart = false,
}) {
  const { lines } = useStore(),
    [data, setData] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const excluded = [
    ...exclude,
    ...(requireCart ? lines.map((l) => l.product.id) : []),
  ];
  const signature = excluded.join(",");
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api
      .recommendations(
        { exclude: excluded, limit: 10 },
        { signal: controller.signal },
      )
      .then((items) => {
        if (!Array.isArray(items) || !items.every(isProductCardData))
          throw new Error("Recommendations could not be read.");
        if (alive)
          setData(
            uniqueById(items)
              .filter((item) => !excluded.includes(item.id))
              .slice(0, 10),
          );
      })
      .catch((e) => alive && e.name !== "AbortError" && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
      controller.abort();
    };
  }, [signature, retry]);
  if (requireCart && !lines.length) return null;
  return (
    <section className="section">
      <h2>{title}</h2>
      {loading ? (
        <Spinner />
      ) : error ? (
        <Empty>
          <p role="alert">{error}</p>
          <button
            className="button secondary"
            onClick={() => setRetry((n) => n + 1)}
          >
            Retry recommendations
          </button>
        </Empty>
      ) : data.length ? (
        <Carousel label={title}>
          {data.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </Carousel>
      ) : (
        <Empty>No other products available.</Empty>
      )}
    </section>
  );
}
