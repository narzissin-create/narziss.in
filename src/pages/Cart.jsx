import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Minus, Trash2, Tag, Check, X, Truck, Loader2 } from "lucide-react";
import { useStore } from "../state/Store";
import { money, totals, validateCoupon } from "../services/logic";
import { api } from "../services/api";
import { config } from "../config";
import { Image, Empty, Spinner } from "../components/UI";
import { Recommendations } from "../components/Products";
import { updateMeta } from "../services/meta";
import { storageKeys, writeStorageJson } from "../services/storage";

export function PromoSection() {
  const { coupon, applyCoupon, notify, lines } = useStore();
  const [inputCode, setInputCode] = useState("");
  const [error, setError] = useState("");
  const [validating, setValidating] = useState(false);
  const subtotal = lines.reduce((s, l) => s + l.product.price * l.quantity, 0);

  async function handleApply(e) {
    e.preventDefault();
    if (!inputCode.trim()) {
      setError("Please enter a coupon code.");
      return;
    }
    setError("");
    setValidating(true);

    try {
      // 1. Try real-time validation via backend API
      let res = await api.validateCoupon(inputCode.trim(), subtotal);

      // 2. Fallback to client-side validation if backend returns null/offline
      if (!res) {
        res = validateCoupon(inputCode, subtotal);
      }

      if (!res.valid) {
        setError(res.message || "Coupon code is invalid or expired.");
        return;
      }

      applyCoupon(res);
      notify(`Coupon ${res.code} applied! Saved ${money(res.discount)}`);
      setInputCode("");
    } catch (err) {
      // Fallback
      const fallback = validateCoupon(inputCode, subtotal);
      if (fallback.valid) {
        applyCoupon(fallback);
        notify(`Coupon ${fallback.code} applied! Saved ${money(fallback.discount)}`);
        setInputCode("");
      } else {
        setError(fallback.message || "Failed to validate coupon.");
      }
    } finally {
      setValidating(false);
    }
  }

  function handleRemove() {
    applyCoupon(null);
    notify("Coupon removed.");
  }

  return (
    <div className="promo-box" style={{ background: "#f8f9fa", padding: "1rem", borderRadius: "8px", marginBottom: "1rem", border: "1px dashed #d1d5db" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: "600", fontSize: "0.9rem", color: "#374151", marginBottom: "0.5rem" }}>
        <Tag size={16} />
        <span>Promotions & Coupons</span>
      </div>

      {coupon ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#ecfdf5", border: "1px solid #a7f3d0", padding: "0.5rem 0.75rem", borderRadius: "6px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontWeight: "700", color: "#065f46" }}>
              <Check size={16} />
              <span>{coupon.code}</span>
            </div>
            <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "#047857" }}>{coupon.description}</p>
          </div>
          <button
            type="button"
            onClick={handleRemove}
            style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", display: "flex", alignItems: "center", gap: "2px", fontSize: "0.8rem" }}
          >
            <X size={14} /> Remove
          </button>
        </div>
      ) : (
        <form onSubmit={handleApply} style={{ display: "flex", gap: "0.5rem" }}>
          <input
            type="text"
            value={inputCode}
            onChange={(e) => {
              setInputCode(e.target.value.toUpperCase());
              setError("");
            }}
            placeholder="Try FIRST10"
            style={{ flex: 1, padding: "0.45rem 0.65rem", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "0.85rem", textTransform: "uppercase" }}
          />
          <button
            type="submit"
            className="button"
            disabled={validating}
            style={{ padding: "0.45rem 0.85rem", fontSize: "0.85rem", borderRadius: "6px", display: "inline-flex", alignItems: "center", gap: "4px" }}
          >
            {validating ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>Checking...</span>
              </>
            ) : (
              "Apply"
            )}
          </button>
        </form>
      )}
      {error && <p style={{ color: "#dc2626", fontSize: "0.8rem", margin: "0.4rem 0 0" }}>{error}</p>}
    </div>
  );
}

export function ShippingMeter({ subtotal }) {
  const threshold = 1999;
  const qualifies = subtotal >= threshold;
  const percent = Math.min(100, Math.round((subtotal / threshold) * 100));
  const remaining = Math.max(0, threshold - subtotal);

  return (
    <div style={{ background: "#fbf7ee", border: "1px solid #e7dfcb", borderRadius: "8px", padding: "0.75rem 1rem", marginBottom: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", fontWeight: "600", color: "#2d4f1e", marginBottom: "0.35rem" }}>
        <Truck size={16} />
        {qualifies ? (
          <span>🎉 You've unlocked Complimentary Express Delivery!</span>
        ) : (
          <span>Add {money(remaining)} more for Free Express Delivery</span>
        )}
      </div>
      <div style={{ width: "100%", height: "6px", background: "#e5e7eb", borderRadius: "3px", overflow: "hidden" }}>
        <div
          style={{
            width: `${percent}%`,
            height: "100%",
            background: qualifies ? "#2d4f1e" : "#eab308",
            transition: "width 0.4s ease-in-out",
          }}
        />
      </div>
    </div>
  );
}

export function Summary({ lines }) {
  const { coupon } = useStore();
  const t = totals(lines, config, coupon);
  return (
    <aside className="summary">
      <h2>Order Summary</h2>
      <ShippingMeter subtotal={t.subtotal} />
      <PromoSection />
      {lines.map((l) => (
        <div className="summary-line" key={l.variantId}>
          <span>
            {l.product.name} × {l.quantity}
          </span>
          <span>{money(l.product.price * l.quantity)}</span>
        </div>
      ))}
      <hr />
      <div className="summary-line">
        <span>Subtotal</span>
        <span>{money(t.subtotal)}</span>
      </div>
      {t.discount > 0 && (
        <div className="summary-line" style={{ color: "#059669", fontWeight: "600" }}>
          <span>Discount ({t.appliedCoupon?.code || "Coupon"})</span>
          <span>-{money(t.discount)}</span>
        </div>
      )}
      <div className="summary-line">
        <span>Shipping</span>
        <span>{t.shipping === 0 ? "FREE" : money(t.shipping)}</span>
      </div>
      <div className="summary-line">
        <span>GST {config.pricesIncludeGst ? "(included)" : ""}</span>
        <span>{money(t.gst)}</span>
      </div>
      <div className="summary-line total">
        <strong>Total</strong>
        <strong>{money(t.total)}</strong>
      </div>
      {!config.chargesConfirmed && (
        <p className="demo-note">
          Development totals: shipping and GST values await business
          confirmation.
        </p>
      )}
    </aside>
  );
}
export default function Cart() {
  const { lines, quantity, busy, notify, cartLoading, cartError, refreshCart, maintenanceMode } =
      useStore(),
    navigate = useNavigate(),
    invalid = lines.some(
      (l) => l.quantity > Math.min(config.maxQuantity, l.stock),
    );
  useEffect(() => {
    updateMeta(
      "Shopping Cart | Narziss",
      "Review selected Narziss products and checkout quantities.",
    );
  }, []);
  function proceed() {
    if (maintenanceMode) {
      notify("Website is currently under maintenance. Orders are temporarily paused.");
      return;
    }
    const stored = writeStorageJson("sessionStorage", storageKeys.checkout, {
      kind: "cart",
      idempotencyKey: crypto.randomUUID(),
      lines: lines.map((l) => ({
        variantId: l.variantId,
        quantity: l.quantity,
      })),
    });
    if (!stored) {
      notify(
        "Checkout storage is unavailable. Enable browser storage and retry.",
      );
      return;
    }
    navigate("/checkout/address");
  }
  return (
    <div className="container section">
      <h1>Your Shopping Cart</h1>
      {cartLoading ? (
        <Spinner label="Loading cart…" />
      ) : cartError ? (
        <Empty>
          <p role="alert">{cartError}</p>
          <button
            className="button secondary"
            onClick={() => refreshCart().catch(() => {})}
          >
            Retry cart
          </button>
        </Empty>
      ) : !lines.length ? (
        <Empty>
          <p>Your cart is empty.</p>
          <Link className="button" to="/#new-arrivals">
            Explore clothing
          </Link>
        </Empty>
      ) : (
        <>
          <div className="cart-layout">
            <div className="cart-products-panel">
              <div className="cart-scroll">
                {lines.map((l) => (
                  <article className="cart-line" key={l.variantId}>
                    <Link
                      className="cart-product-thumbnail"
                      to={`/products/${l.product.slug}`}
                    >
                      <span className="cart-product-thumbnail-frame">
                        <Image src={l.product.images[0]} alt={l.product.name} />
                      </span>
                    </Link>
                    <div className="cart-line-details">
                      <Link to={`/products/${l.product.slug}`}>
                        {l.product.name}
                      </Link>
                      <p>Size {l.size}</p>
                      <p className="price">{money(l.product.price)}</p>
                      {!l.stock ? (
                        <p className="error">Out of Stock</p>
                      ) : (
                        l.quantity > Math.min(config.maxQuantity, l.stock) && (
                          <p className="error">
                            Only {l.stock} available. Reduce quantity.
                          </p>
                        )
                      )}
                      <div className="cart-controls">
                        <div className="quantity">
                          <button
                            aria-label={`Decrease ${l.product.name}`}
                            disabled={busy}
                            onClick={() =>
                              quantity(l.variantId, l.quantity - 1)
                            }
                          >
                            <Minus size={16} />
                          </button>
                          <span>{l.quantity}</span>
                          <button
                            aria-label={`Increase ${l.product.name}`}
                            disabled={
                              busy || l.quantity >= Math.min(3, l.stock)
                            }
                            onClick={() =>
                              quantity(l.variantId, l.quantity + 1)
                            }
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                    <button
                      className="icon-button cart-remove-button"
                      disabled={busy}
                      aria-label={`Remove ${l.product.name}`}
                      onClick={() => quantity(l.variantId, 0)}
                    >
                      <Trash2 size={18} />
                    </button>
                  </article>
                ))}
              </div>
            </div>
            <div className="cart-billing">
              <Summary lines={lines} />
              {invalid && (
                <p className="error">
                  Remove unavailable items or update quantities before checkout.
                </p>
              )}
              {maintenanceMode && (
                <p className="error" style={{ textAlign: "center", fontWeight: "600" }}>
                  Website is under maintenance. Ordering is temporarily paused.
                </p>
              )}
              <button
                className="button w-full mt-4"
                disabled={invalid || busy || maintenanceMode}
                onClick={proceed}
              >
                {maintenanceMode
                  ? "Maintenance Mode — Ordering Paused"
                  : `Proceed to Buy ${lines.reduce((n, l) => n + l.quantity, 0)} Items`}
              </button>
            </div>
          </div>
          <Recommendations requireCart />
        </>
      )}
    </div>
  );
}
