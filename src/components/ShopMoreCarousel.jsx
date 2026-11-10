import { useEffect, useState } from "react";
import { api } from "../services/api";
import { Carousel, Empty, ProductCard, Spinner, isProductCardData } from "./UI";

export default function ShopMoreCarousel({ product }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setItems([]);
    setLoading(true);
    setError("");
    api.shopMoreProducts({ current: product, limit: 10 }, { signal: controller.signal })
      .then((products) => {
        if (!Array.isArray(products) || !products.every(isProductCardData)) {
          throw new Error("Shop More products could not be read.");
        }
        if (alive) setItems(products);
      })
      .catch((requestError) => {
        if (alive && requestError.name !== "AbortError") {
          setError("Shop More is temporarily unavailable.");
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [product.id, retry]);

  if (!loading && !error && !items.length) return null;

  return (
    <section className="section shop-more-section" aria-labelledby="shop-more-title">
      <h2 id="shop-more-title">Shop More</h2>
      {loading ? (
        <div className="loading-row"><Spinner label="Loading products…" /></div>
      ) : error ? (
        <Empty>
          <p role="alert">{error}</p>
          <button className="button secondary" type="button" onClick={() => setRetry((value) => value + 1)}>Retry</button>
        </Empty>
      ) : (
        <Carousel className="shop-more-carousel" label="Shop More">
          {items.map((item) => <ProductCard key={item.id} product={item} />)}
        </Carousel>
      )}
    </section>
  );
}
