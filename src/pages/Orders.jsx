import { validOrder } from "../services/validation";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../services/api";
import { money } from "../services/logic";
import { config } from "../config";
import { useStore } from "../state/Store";
import { Spinner, Empty, Image } from "../components/UI";
import { Recommendations } from "../components/Products";
import { updateMeta } from "../services/meta";
export default function Orders() {
  const [orders, setOrders] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    { notify } = useStore();
  const actionLock = useRef(false);
  async function load(signal) {
    setLoading(true);
    setError("");
    try {
      const result = await api.orders({ signal });
      if (!signal?.aborted) {
        if (!Array.isArray(result) || !result.every(validOrder))
          throw new Error("Orders could not be read.");
        setOrders(result);
      }
    } catch (e) {
      if (e.name !== "AbortError") setError(e.message);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    updateMeta(
      "My Orders | Narziss",
      "Review active and recently delivered Narziss orders.",
    );
    return () => controller.abort();
  }, []);
  async function cancel(id, variantId) {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    try {
      await api.cancel(id, variantId);
      await load();
    } catch (e) {
      notify(e.message);
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }
  async function deliver(id) {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    try {
      await api.demoDeliver(id);
      await load();
    } catch (error) {
      notify(error.message);
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }
  const active = orders.filter((o) =>
      o.items.some((l) => !["delivered", "cancelled"].includes(l.status)),
    ),
    latest = [...orders]
      .sort(
        (a, b) =>
          (b.deliveredAt || b.createdAt) - (a.deliveredAt || a.createdAt),
      )
      .find(
        (o) => o.items.length && o.items.every((l) => l.status === "delivered"),
      ),
    shown = [...active, ...(latest ? [latest] : [])];
  return (
    <div className="container section">
      <Link className="text-link" to="/">
        ← Home
      </Link>
      <h1>My Orders</h1>
      {loading ? (
        <Spinner />
      ) : error ? (
        <Empty>
          <p>{error}</p>
          <button onClick={() => load()}>Retry</button>
        </Empty>
      ) : shown.length ? (
        <div className="orders-box">
          {shown.map((o) => (
            <section className="order" key={o.id}>
              <div className="order-heading">
                <h3>Order {o.id.slice(0, 8)}</h3>
                <span>{o.paymentStatus}</span>
                {o.items.some((l) => l.canCancel) && (
                  <button
                    disabled={busy}
                    className="text-link"
                    onClick={() => cancel(o.id)}
                  >
                    Cancel Entire Order
                  </button>
                )}
              </div>
              {o.items.map((l) => {
                const v = api.variantDetails(l.variantId);
                if (!v) return null;
                return (
                  <article className="order-line" key={l.variantId}>
                    <Link to={`/products/${v.product.slug}`}>
                      <Image src={v.product.images[0]} alt={v.product.name} />
                    </Link>
                    <div>
                      <Link to={`/products/${v.product.slug}`}>
                        {v.product.name}
                      </Link>
                      <p>
                        Size {v.size} · Qty {l.quantity}
                      </p>
                      <p className="status-badge">{l.status}</p>
                      <p style={{ fontSize: "0.85rem", color: o.delivery_date ? "#15803d" : "#64748b", fontWeight: o.delivery_date ? 600 : 400 }}>
                        {l.status === "delivered"
                          ? "Delivered"
                          : o.delivery_date
                            ? `Expected Delivery: ${o.delivery_date}`
                            : o.confirmed_by_admin
                              ? "Delivery scheduled soon"
                              : "Awaiting merchant confirmation"}
                      </p>
                    </div>
                    <div className="order-actions">
                      <span>{money(l.price * l.quantity)}</span>
                      {l.canCancel && (
                        <button
                          className="text-link"
                          disabled={busy}
                          onClick={() => cancel(o.id, l.variantId)}
                        >
                          Cancel Item
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
              {o.refundStatus && <p>Refund: {o.refundStatus}</p>}
              {config.mock &&
                (o.method === "cod" || o.paymentStatus === "successful") &&
                o.items.some((l) => l.canCancel) && (
                  <button
                    className="text-link"
                    disabled={busy}
                    onClick={() => deliver(o.id)}
                  >
                    Demo only: mark delivered to test reviews
                  </button>
                )}
            </section>
          ))}
        </div>
      ) : (
        <Empty>No active or delivered orders.</Empty>
      )}
      <Recommendations title="You May Also Like" />
    </div>
  );
}
