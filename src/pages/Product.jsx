import {
  validProduct,
  validReviewPage,
  uniqueById,
} from "../services/validation";
import { useEffect, useRef, useState } from "react";
import { useLocation, useParams, useNavigate, Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Plus, Minus } from "lucide-react";
import { api } from "../services/api";
import { money } from "../services/logic";
import { useStore } from "../state/Store";
import { Image, Spinner, Empty } from "../components/UI";
import { updateMeta } from "../services/meta";
import { storageKeys, writeStorageJson } from "../services/storage";
import ShopMoreCarousel from "../components/ShopMoreCarousel";
import { NEW_ARRIVALS_PATH } from "../services/storefrontRoutes";
export default function Product() {
  const { slug } = useParams(),
    navigate = useNavigate(),
    location = useLocation(),
    { user, lines, add, quantity, busy, requireLogin, setModal, notify, maintenanceMode } =
      useStore(),
    [p, setProduct] = useState(null),
    [productLoading, setProductLoading] = useState(true),
    [productError, setProductError] = useState(""),
    [retry, setRetry] = useState(0),
    [size, setSize] = useState(""),
    [sizeError, setSizeError] = useState(""),
    [image, setImage] = useState(0),
    [reviews, setReviews] = useState([]),
    [reviewTotal, setReviewTotal] = useState(0),
    [reviewAverage, setReviewAverage] = useState(null),
    [rating, setRating] = useState(5),
    [text, setText] = useState(""),
    [submitting, setSubmitting] = useState(false),
    [eligible, setEligible] = useState(false),
    [eligibilityLoading, setEligibilityLoading] = useState(false),
    [reviewLoading, setReviewLoading] = useState(false),
    [reviewError, setReviewError] = useState(""),
    [eligibilityError, setEligibilityError] = useState(""),
    [reviewRetry, setReviewRetry] = useState(0);
  const reviewSubmitLock = useRef(false),
    reviewLoadLock = useRef(false),
    scope = useRef("");
  scope.current = `${slug}:${user?.id || ""}`;
  useEffect(() => {
    setText("");
    setRating(5);
  }, [slug, user?.id]);
  useEffect(() => {
    const controller = new AbortController();
    setSize("");
    setSizeError("");
    setImage(0);
    setReviews([]);
    setReviewTotal(0);
    setReviewAverage(null);
    setText("");
    setProduct(null);
    setProductLoading(true);
    setProductError("");
    let alive = true;
    const loadProduct = async () => {
      // The fixture catalog is loaded only by the development server, so its
      // mock products and routes cannot be bundled into a production build.
      if (import.meta.env.DEV && new URLSearchParams(location.search).get("navigationPreview") === "fixtures") {
        const { getDevelopmentFixtureProductBySlug } = await import(
          "../services/developmentSubcategoryFixtures"
        );
        if (!alive || controller.signal.aborted) return;
        const developmentFixture = getDevelopmentFixtureProductBySlug(slug);
        if (developmentFixture) {
          setProduct(developmentFixture);
          updateMeta(`${developmentFixture.name} | Narziss`, developmentFixture.description);
          setProductLoading(false);
          return;
        }
      }
      api
      .product(slug, { signal: controller.signal })
      .then((product) => {
        if (controller.signal.aborted) return;
        if (product && !validProduct(product)) {
          setProduct(product);
          setProductError("");
          return;
        }
        setProduct(product);
        updateMeta(
          product ? `${product.name} | Narziss` : "Product Not Found | Narziss",
          product
            ? `View ${product.name}, available sizes and customer reviews at Narziss.`
            : "The requested Narziss product could not be found.",
        );
      })
      .catch((error) => {
        if (error.name !== "AbortError") setProductError(error.message || "Failed to load product");
      })
      .finally(() => {
        if (!controller.signal.aborted) setProductLoading(false);
      });
    };
    loadProduct();
    return () => {
      alive = false;
      controller.abort();
    };
  }, [slug, retry, location.search]);
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setEligible(false);
    setReviewError("");
    setEligibilityError("");
    setEligibilityLoading(Boolean(user));
    if (!p) return;
    if (p.isDevelopmentFixture) {
      setReviewLoading(false);
      setEligibilityLoading(false);
      setReviews([]);
      setReviewTotal(0);
      setReviewAverage(null);
      return () => controller.abort();
    }
    setReviewLoading(true);
    api
      .reviewPage(p.id, 0, 20, { signal: controller.signal })
      .then((result) => {
        if (!validReviewPage(result))
          throw new Error("Reviews could not be read. Please retry.");
        if (alive) {
          setReviews(uniqueById(result.items));
          setReviewTotal(result.total);
          setReviewAverage(result.averageRating);
          const own = result.items.find((x) => x.userId === user?.id);
          if (own) {
            setText(own.text);
            setRating(own.rating);
          }
        }
      })
      .catch(
        (e) => alive && e.name !== "AbortError" && setReviewError(e.message),
      )
      .finally(() => alive && setReviewLoading(false));
    if (user)
      api
        .reviewEligibility(p.id, { signal: controller.signal })
        .then((result) => {
          if (typeof result !== "boolean")
            throw new Error("Review eligibility could not be verified.");
          if (alive) setEligible(result);
        })
        .catch(
          (e) =>
            alive && e.name !== "AbortError" && setEligibilityError(e.message),
        )
        .finally(() => alive && setEligibilityLoading(false));
    return () => {
      alive = false;
      controller.abort();
    };
  }, [p?.id, user?.id, reviewRetry]);
  if (productLoading) return <ProductLoading />;
  if (productError)
    return (
      <div className="container section">
        <Empty>
          <p>{productError}</p>
          <button
            className="button secondary"
            onClick={() => setRetry((n) => n + 1)}
          >
            Retry
          </button>
        </Empty>
      </div>
    );
  if (!p)
    return (
      <div className="container section">
        <h1>Product not found</h1>
        <Link to={NEW_ARRIVALS_PATH}>Browse New Arrivals</Link>
      </div>
    );
  const variants = Array.isArray(p.variants) ? p.variants : [],
    v = variants.find((item) => item.size === size),
    line = lines.find((l) => l.variantId === v?.id),
    out = variants.length > 0 ? variants.every((item) => !item.stock) : false,
    galleryImages = Array.from(
      { length: 3 },
      (_, index) => (Array.isArray(p.images) && p.images[index]) || "",
    ),
    average = reviewAverage;
  function action(buy) {
    if (buy && maintenanceMode) {
      notify("Website is currently under maintenance. Orders are temporarily paused.");
      return;
    }
    if (!v) {
      setSizeError("Please select an available size.");
      return;
    }
    setSizeError("");
    if (!v.stock) {
      notify("This size is out of stock");
      return;
    }
    requireLogin(() => {
      if (buy) {
        if (maintenanceMode) {
          notify("Website is currently under maintenance. Orders are temporarily paused.");
          return;
        }
        const stored = writeStorageJson(
          "sessionStorage",
          storageKeys.checkout,
          {
            kind: "buy",
            idempotencyKey: crypto.randomUUID(),
            lines: [{ variantId: v.id, quantity: line?.quantity || 1 }],
          },
        );
        if (!stored) {
          notify(
            "Checkout storage is unavailable. Enable browser storage and retry.",
          );
          return;
        }
        navigate("/checkout/address");
      } else add(v.id);
    });
  }
  async function review(e) {
    e.preventDefault();
    if (!eligible || eligibilityLoading || reviewSubmitLock.current) return;
    const actionScope = scope.current;
    reviewSubmitLock.current = true;
    setSubmitting(true);
    try {
      await api.review(p.id, rating, text);
      const result = await api.reviewPage(p.id, 0, 20);
      if (!validReviewPage(result))
        throw new Error("The saved review could not be reloaded.");
      if (scope.current !== actionScope) return;
      setReviewError("");
      setReviews(uniqueById(result.items));
      setReviewTotal(result.total);
      setReviewAverage(result.averageRating);
      notify("Review saved");
    } catch (e) {
      if (scope.current === actionScope) setReviewError(e.message);
    } finally {
      reviewSubmitLock.current = false;
      setSubmitting(false);
    }
  }
  async function loadMoreReviews() {
    if (
      reviewLoading ||
      reviewLoadLock.current ||
      reviews.length >= reviewTotal
    )
      return;
    reviewLoadLock.current = true;
    const actionScope = scope.current;
    setReviewError("");
    setReviewLoading(true);
    try {
      const result = await api.reviewPage(p.id, reviews.length, 20);
      if (!validReviewPage(result))
        throw new Error("More reviews could not be read.");
      if (scope.current !== actionScope) return;
      setReviews((current) => uniqueById([...current, ...result.items]));
      setReviewTotal(result.total);
      setReviewAverage(result.averageRating);
    } catch (error) {
      if (scope.current === actionScope) setReviewError(error.message);
    } finally {
      reviewLoadLock.current = false;
      if (scope.current === actionScope) setReviewLoading(false);
    }
  }
  return (
    <div className="container section product-page">
      <button
        type="button"
        className="text-link product-back-button"
        onClick={() => navigate((window.history.state?.idx ?? 0) > 0 ? -1 : NEW_ARRIVALS_PATH)}
      >
        ← Back
      </button>
      <section className="product-detail">
        <div className="product-gallery">
          <div className="detail-photo">
            <Image
              src={galleryImages[image]}
              alt={galleryImages[image] ? `${p.name}, view ${image + 1}` : ""}
            />
          </div>
          <div className="gallery-controls">
            <button
              aria-label="Previous product image"
              onClick={() =>
                setImage(
                  (i) => (i - 1 + galleryImages.length) % galleryImages.length,
                )
              }
            >
              <ChevronLeft />
            </button>
            <div
              className="gallery-indicators"
              aria-label={`Image ${image + 1} of 3`}
            >
              {galleryImages.map((_, index) => (
                <button
                  key={index}
                  type="button"
                  className={image === index ? "active" : ""}
                  aria-label={`Show product image ${index + 1}`}
                  aria-pressed={image === index}
                  onClick={() => setImage(index)}
                />
              ))}
            </div>
            <button
              aria-label="Next product image"
              onClick={() => setImage((i) => (i + 1) % galleryImages.length)}
            >
              <ChevronRight />
            </button>
          </div>
        </div>
        <div className="product-info">
          <h1>{p.name}</h1>
          <p
            aria-label={
              average
                ? `${average.toFixed(1)} out of five stars`
                : "No reviews yet"
            }
          >
            {reviewLoading && !reviews.length ? (
              "Loading ratings…"
            ) : reviewError && !reviews.length ? (
              "Ratings unavailable"
            ) : (
              <>
                {average ? `★ ${average.toFixed(1)} / 5` : "No ratings yet"} ·{" "}
                {reviewTotal} reviews
              </>
            )}
          </p>
          <p className="detail-price">{money(p.price)}</p>
          {out && <p className="error">Out of Stock</p>}
          <div className="size-heading">
            <span>Select size</span>
            <button
              className="text-link"
              onClick={() => setModal({ type: "size", product: p })}
            >
              Size chart
            </button>
          </div>
          <div className="size-options">
            {variants.map((variant) => (
              <button
                key={variant.id}
                disabled={!variant.stock}
                className={size === variant.size ? "selected" : ""}
                aria-pressed={size === variant.size}
                title={!variant.stock ? "Out of Stock" : variant.size}
                onClick={() => {
                  setSize(variant.size);
                  setSizeError("");
                }}
              >
                {variant.size}
              </button>
            ))}
          </div>
          {sizeError && (
            <p className="field-error" role="alert">
              {sizeError}
            </p>
          )}
          <div className="purchase-actions">
            {line ? (
              <div className="quantity">
                <button
                  aria-label="Decrease quantity"
                  disabled={busy}
                  onClick={() => quantity(v.id, line.quantity - 1)}
                >
                  <Minus size={16} />
                </button>
                <span>{line.quantity}</span>
                <button
                  aria-label="Increase quantity"
                  disabled={busy || line.quantity >= Math.min(3, v.stock)}
                  onClick={() => quantity(v.id, line.quantity + 1)}
                >
                  <Plus size={16} />
                </button>
              </div>
            ) : (
              <button
                className="button secondary"
                disabled={out || busy}
                onClick={() => action(false)}
              >
                {busy ? <Spinner label="Adding…" /> : "Add to Cart"}
              </button>
            )}
            <button
              className="button"
              disabled={out || busy || maintenanceMode}
              onClick={() => action(true)}
            >
              {maintenanceMode ? "Ordering Paused" : "Buy Now"}
            </button>
          </div>
          <button
            className="description-toggle"
            onClick={() => setModal({ type: "description", product: p })}
          >
            Product description ↓
          </button>
        </div>
      </section>
      <section className="reviews section" aria-label="Product reviews">
        <form className="review-form form-stack" onSubmit={review}>
          <h2 id="write-review-heading">
            {reviews.some((r) => r.userId === user?.id)
              ? "Edit Your Review"
              : "Write a Review"}
          </h2>
          <label>
            <span id="review-rating-label">Rating</span>
            <select
              aria-labelledby="review-rating-label"
              value={rating}
              disabled={!eligible || eligibilityLoading}
              aria-describedby="review-eligibility"
              onChange={(e) => setRating(Number(e.target.value))}
            >
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? "star" : "stars"}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span id="review-text-label">Your review</span>
            <textarea
              aria-labelledby="review-text-label"
              required
              maxLength={2000}
              value={text}
              disabled={!eligible || eligibilityLoading}
              aria-describedby="review-eligibility"
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <div className="review-submit-row">
            <button
              className="button"
              disabled={!eligible || eligibilityLoading || submitting}
            >
              {submitting ? <Spinner label="Submitting…" /> : "Submit Review"}
            </button>
            <div id="review-eligibility" className="review-eligibility">
              {!user ? (
                <>
                  <span>Only delivered-product buyers can submit reviews.</span>
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => requireLogin()}
                  >
                    Log in to review
                  </button>
                </>
              ) : eligibilityLoading ? (
                <span>Checking review eligibility…</span>
              ) : eligibilityError ? (
                <>
                  <span role="alert">{eligibilityError}</span>
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => setReviewRetry((n) => n + 1)}
                  >
                    Retry eligibility
                  </button>
                </>
              ) : !eligible ? (
                <span>
                  Review submission unlocks after this product is delivered to
                  your account.
                </span>
              ) : (
                <span>You can review this delivered product.</span>
              )}
            </div>
          </div>
        </form>
        <div className="review-reader-slot">
          <div className="review-list-column">
            <h2>Customer Reviews</h2>
            <div className="review-scroll">
              {reviewError && (
                <Empty>
                  <p role="alert">{reviewError}</p>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setReviewRetry((n) => n + 1)}
                  >
                    Retry reviews
                  </button>
                </Empty>
              )}
              {reviewLoading && !reviews.length ? (
                <Spinner />
              ) : reviews.length ? (
                <>
                  {reviews.map((r) => (
                    <article className="review" key={r.id}>
                      <strong>
                        {r.name} · {r.rating}/5 ★
                      </strong>
                      <p>{r.text}</p>
                    </article>
                  ))}
                  {reviews.length < reviewTotal && (
                    <button
                      type="button"
                      className="text-link"
                      disabled={reviewLoading}
                      onClick={loadMoreReviews}
                    >
                      {reviewLoading ? "Loading…" : "Show more reviews"}
                    </button>
                  )}
                </>
              ) : (
                !reviewError && <Empty>No reviews yet.</Empty>
              )}
            </div>
          </div>
        </div>
      </section>
      {!p.isDevelopmentFixture && <ShopMoreCarousel product={p} />}
    </div>
  );
}

function ProductLoading() {
  return (
    <div className="container section product-page" aria-busy="true">
      <span className="product-loading-back" aria-hidden="true">
        ← Back
      </span>
      <section className="product-detail product-loading-layout">
        <div className="product-gallery">
          <div className="detail-photo">
            <div className="image-placeholder" aria-hidden="true" />
          </div>
          <div className="gallery-loading-controls" aria-hidden="true" />
        </div>
        <div className="product-info product-loading-copy">
          <Spinner label="Loading product…" />
          <div className="skeleton-line wide" aria-hidden="true" />
          <div className="skeleton-line medium" aria-hidden="true" />
          <div className="skeleton-line short" aria-hidden="true" />
        </div>
      </section>
    </div>
  );
}
