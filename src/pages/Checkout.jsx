import {
  validAddress,
  validSavedAddress,
  validOrder,
  expectData,
  addressErrors,
} from "../services/validation";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useStore } from "../state/Store";
import { api } from "../services/api";
import { money, totals } from "../services/logic";
import { config } from "../config";
import { Spinner, Empty } from "../components/UI";
import { Summary } from "./Cart";
import { updateMeta } from "../services/meta";
import {
  readStorageJson,
  removeStorage,
  storageKeys,
  writeStorageJson,
} from "../services/storage";
function readCheckout() {
  const checkout = readStorageJson("sessionStorage", storageKeys.checkout);
  return checkout && typeof checkout === "object" && !Array.isArray(checkout)
    ? checkout
    : null;
}
function expanded(checkout) {
  return api.hydrateLines(checkout?.lines || []);
}
function validCheckout(checkout, lines, requireAddress = false) {
  return Boolean(
    checkout &&
      ["cart", "buy"].includes(checkout.kind) &&
      typeof checkout.idempotencyKey === "string" &&
      checkout.idempotencyKey &&
      Array.isArray(checkout.lines) &&
      checkout.lines.length === lines.length &&
      lines.length &&
      lines.every(
        (line) =>
          line.quantity <= Math.min(line.stock || 0, config.maxQuantity),
      ) &&
      (!requireAddress || validAddress(checkout.address)),
  );
}
export function Address() {
  const navigate = useNavigate(),
    { notify, maintenanceMode, coupon, user } = useStore(),
    [addresses, setAddresses] = useState([]),
    [showOlder, setShowOlder] = useState(false),
    [selected, setSelected] = useState(""),
    [form, setForm] = useState({}),
    [adding, setAdding] = useState(false),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const actionLock = useRef(false);
  const checkout = readCheckout(),
    lines = expanded(checkout);
  async function load(signal) {
    setLoading(true);
    setError("");
    try {
      const result = await api.addresses({ signal });
      if (signal?.aborted) return;
      expectData(
        result,
        (x) => Array.isArray(x) && x.every(validSavedAddress),
        "Addresses could not be read. Please retry.",
      );
      setAddresses(result);
      setSelected((current) =>
        result.some((a) => a.id === current) ? current : result[0]?.id || "",
      );
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
      "Delivery Address | Narziss",
      "Choose a delivery address for your Narziss checkout.",
    );
    return () => controller.abort();
  }, []);
  async function save(e) {
    e.preventDefault();
    if (actionLock.current) return;
    const nextErrors = addressErrors(form);
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    actionLock.current = true;
    setBusy(true);
    try {
      const item = expectData(
        await api.saveAddress(form),
        validSavedAddress,
        "The saved address could not be read. Please retry.",
      );
      await load();
      setSelected(item.id);
      setAdding(false);
      setForm({});
      setFieldErrors({});
    } catch (e) {
      notify(e.message);
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }
  async function proceed() {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    try {
      const address = expectData(
        await api.selectAddress(selected),
        validSavedAddress,
        "The selected address could not be read. Please retry.",
      );
      if (
        !writeStorageJson("sessionStorage", storageKeys.checkout, {
          ...checkout,
          address,
        })
      )
        throw new Error(
          "Checkout storage is unavailable. Enable browser storage and retry.",
        );
      navigate("/checkout/payment");
    } catch (e) {
      notify(e.message);
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }
  if (!validCheckout(checkout, lines))
    return (
      <div className="container section">
        <Empty>
          <p>Checkout items are missing, outdated, or no longer available.</p>
          <Link to="/cart">Return to cart</Link>
        </Empty>
      </div>
    );
  return (
    <div className="container section narrow">
      <h1>Delivery Address</h1>
      <div className="checkout-steps">
        <strong>1 Address</strong>
        <span>2 Payment</span>
        <span>3 Confirm Order</span>
      </div>
      {loading ? (
        <Spinner />
      ) : error ? (
        <Empty>
          <p>{error}</p>
          <button onClick={() => load()}>Retry</button>
        </Empty>
      ) : (
        <div className="address-list">
          {addresses.length ? (
            addresses.slice(0, showOlder ? addresses.length : 2).map((a) => (
              <div className="address-card" key={a.id}>
                <input
                  id={`address-${a.id}`}
                  type="radio"
                  name="address"
                  checked={selected === a.id}
                  onChange={() => setSelected(a.id)}
                />
                <label htmlFor={`address-${a.id}`}>
                  <strong>{a.name}</strong>
                  <br />
                  {a.line}, {a.city}, {a.state} {a.pin}
                  <br />
                  {a.phone}
                </label>
                <button
                  type="button"
                  className="text-link"
                  onClick={() => {
                    setForm(a);
                    setAdding(true);
                  }}
                >
                  Edit
                </button>
              </div>
            ))
          ) : (
            <Empty>No saved addresses.</Empty>
          )}
        </div>
      )}
      {addresses.length > 2 && !loading && !error && (
        <button
          type="button"
          className="text-link"
          onClick={() => setShowOlder((v) => !v)}
        >
          {showOlder ? "Show recent addresses" : "Other saved addresses"}
        </button>
      )}
      <button
        className="button secondary"
        onClick={() => {
          setForm({ email: user?.email || "" });
          setAdding(true);
        }}
      >
        Add Address
      </button>
      {adding && (
        <form className="address-form panel" onSubmit={save} noValidate>
          <h2>Add Address</h2>
          {[
            ["name", "Full name"],
            ["email", "Email address (for delivery tracking)"],
            ["phone", "Phone number"],
            ["line", "Address line"],
            ["landmark", "Landmark (optional)"],
            ["state", "State"],
            ["pin", "PIN code"],
            ["city", "City"],
          ].map(([key, label]) => (
            <label
              className={
                ["name", "email", "line", "landmark", "city"].includes(key) ? "full" : ""
              }
              key={key}
            >
              {label}
              <input
                value={form[key] || ""}
                required={key !== "landmark" && key !== "email"}
                type={key === "phone" ? "tel" : key === "email" ? "email" : "text"}
                inputMode={
                  ["phone", "pin"].includes(key) ? "numeric" : undefined
                }
                pattern={
                  key === "phone"
                    ? "[6-9][0-9]{9}"
                    : key === "pin"
                      ? "[1-9][0-9]{5}"
                      : undefined
                }
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                aria-invalid={Boolean(fieldErrors[key])}
                aria-describedby={
                  fieldErrors[key] ? `address-${key}-error` : undefined
                }
              />
              {fieldErrors[key] && (
                <span className="field-error" id={`address-${key}-error`}>
                  {fieldErrors[key]}
                </span>
              )}
            </label>
          ))}
          <button className="button full" disabled={busy}>
            {busy ? <Spinner /> : "Save and Proceed"}
          </button>
        </form>
      )}
      <div className="mt-8">
        <Summary lines={lines} />
      </div>
      {maintenanceMode && (
        <p className="error mt-4" style={{ textAlign: "center", fontWeight: "600" }}>
          Website is under maintenance. Checkout is temporarily paused.
        </p>
      )}
      <button
        className="button w-full mt-4"
        disabled={!selected || busy || loading || Boolean(error) || maintenanceMode}
        onClick={proceed}
      >
        {busy ? (
          <Spinner />
        ) : maintenanceMode ? (
          "Maintenance Mode — Checkout Paused"
        ) : (
          `Continue to Payment · ${money(totals(lines, config, coupon).total)}`
        )}
      </button>
    </div>
  );
}
export function Payment() {
  const navigate = useNavigate(),
    { notify, refreshCart, maintenanceMode, coupon, user } = useStore(),
    [method] = useState("upi"),
    [upi, setUpi] = useState("Scan Any QR / UPI"),
    [paymentError, setPaymentError] = useState(""),
    [busy, setBusy] = useState(false),
    checkout = readCheckout(),
    lines = expanded(checkout);
  const submissionLock = useRef(false);
  useEffect(() => {
    updateMeta(
      "Payment | Narziss",
      "Pay securely using UPI or Dynamic QR Code.",
    );
  }, []);
  async function place() {
    if (submissionLock.current) return;
    setPaymentError("");
    if (maintenanceMode) {
      setPaymentError("Website is currently under maintenance. Orders are temporarily paused.");
      notify("Website is currently under maintenance. Orders are temporarily paused.");
      return;
    }
    submissionLock.current = true;
    setBusy(true);
    try {
      const order = await api.placeOrder({
        lines: checkout.lines,
        address: checkout.address,
        method: "upi",
        orderId: checkout.retryOrderId,
        checkoutKind: checkout.kind,
        idempotencyKey: checkout.idempotencyKey,
        couponCode: coupon?.code || checkout.couponCode,
        discount: totals(lines, config, coupon).discount,
        upiProvider: upi,
      });
      expectData(
        order,
        validOrder,
        "The order result could not be read. Retry this same checkout attempt.",
      );
      removeStorage("sessionStorage", storageKeys.checkout);

      // Initiate real YouPI-PG checkout session
      try {
        const orderIdentifier = order.orderNumber || order.order_number || order.id;
        const totalAmount = totals(lines, config, coupon).total;
        const youpiRes = await api.initiateYoupiPayment(orderIdentifier, {
          amount: totalAmount,
          customerName: checkout.address.name,
          customerPhone: checkout.address.phone,
          customerEmail: checkout.address.email || user?.email || "",
          address: checkout.address,
          lines: checkout.lines,
        });
        if (youpiRes && youpiRes.checkoutUrl) {
          // If YouPI JavaScript checkout SDK is loaded, launch modal
          if (typeof window !== "undefined" && window.Youpi && typeof window.Youpi.pay === "function") {
            window.Youpi.pay({
              checkoutUrl: youpiRes.checkoutUrl,
              paymentId: youpiRes.paymentId,
              onSuccess: () => navigate(`/order-confirmation/${order.id}`, { replace: true }),
              onClose: () => {
                notify("Payment cancelled. You can retry when ready.");
              },
            });
            return;
          } else if (typeof window !== "undefined" && youpiRes.checkoutUrl) {
            window.location.href = youpiRes.checkoutUrl;
            return;
          }
        }
      } catch (gatewayErr) {
        console.warn("YouPI initiation fallback:", gatewayErr);
      }

      navigate(`/order-confirmation/${order.id}`, { replace: true });
    } catch (e) {
      setPaymentError(e.message);
      notify(e.message);
    } finally {
      submissionLock.current = false;
      setBusy(false);
    }
  }
  if (!validCheckout(checkout, lines, true))
    return (
      <div className="container section">
        <Empty>
          <p>Checkout details are missing, outdated, or no longer available.</p>
          <Link to="/cart">Return to cart</Link>
        </Empty>
      </div>
    );
  const orderTotals = totals(lines, config, coupon);
  return (
    <div className="container section narrow">
      <div className="flex justify-between gap-4 items-center">
        <h1>Payment</h1>
        <Link
          className="text-link"
          to="/cart"
          onClick={() => removeStorage("sessionStorage", storageKeys.checkout)}
        >
          Cancel
        </Link>
      </div>
      <div className="checkout-steps">
        <strong>● Address</strong>
        <strong>● Payment (UPI)</strong>
        <span>◯ Confirmation</span>
      </div>
      <p className="panel">
        Delivering to {checkout.address.name}: {checkout.address.line},{" "}
        {checkout.address.city}, {checkout.address.pin}
      </p>

      <section className="panel" style={{ border: "1.5px solid #2d4f1e" }}>
        <div className="flex justify-between items-center mb-3">
          <strong style={{ fontSize: "1.1rem", color: "#2d4f1e" }}>
            UPI & Dynamic QR Payment (YouPI Gateway)
          </strong>
          <span style={{ fontSize: "0.8rem", background: "#dcfce7", color: "#166534", padding: "2px 8px", borderRadius: "12px", fontWeight: "600" }}>
            0% Gateway Fee
          </span>
        </div>

        <div className="form-stack mt-3">
          <label>
            Preferred Payment Method
            <select
              value={upi}
              onChange={(e) => setUpi(e.target.value)}
            >
              {["Scan Any QR / UPI", "PhonePe", "Google Pay", "Paytm", "BHIM", "CRED"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>

          <div style={{ background: "#fbf7ee", border: "1px solid #e7ded0", borderRadius: "8px", padding: "12px 14px", fontSize: "0.85rem", color: "#5c5346" }}>
            <p style={{ margin: "0 0 6px 0", fontWeight: "600", color: "#2d4f1e" }}>
              ⚡ Instant UPI Bank Transfer
            </p>
            <p style={{ margin: 0 }}>
              Scan the dynamic QR code on screen using any UPI app (GPay, PhonePe, Paytm, BHIM) or tap to pay directly on mobile. Payments are securely deposited directly to the merchant account.
            </p>
          </div>

          {paymentError && (
            <p className="error" role="alert">
              {paymentError}
            </p>
          )}
          {maintenanceMode && (
            <p className="error" role="alert" style={{ fontWeight: "600" }}>
              Website is under maintenance. Orders cannot be submitted.
            </p>
          )}

          <button
            type="button"
            className="button"
            disabled={busy || maintenanceMode}
            onClick={place}
            style={{ marginTop: "8px" }}
          >
            {busy ? (
              <Spinner label="Initiating YouPI Gateway…" />
            ) : maintenanceMode ? (
              "Maintenance Mode — Ordering Paused"
            ) : (
              `Pay ${money(orderTotals.total)} via UPI`
            )}
          </button>
        </div>
      </section>

      <Summary lines={lines} />
    </div>
  );
}

function isValidMockCard(card) {
  return (
    card.holder.trim().toUpperCase() === "TEST USER" &&
    card.number.replace(/\s/g, "") === "4242424242424242" &&
    card.expiry === "12/34" &&
    card.cvv === "123"
  );
}
export function Confirmation() {
  const { id } = useParams(),
    [order, setOrder] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    setLoading(true);
    setOrder(null);
    setError("");
    updateMeta(
      "Order Confirmation | Narziss",
      "Review your Narziss Cash on Delivery order confirmation.",
    );
    const controller = new AbortController();
    api
      .orders({ signal: controller.signal })
      .then((orders) => {
        expectData(
          orders,
          (x) => Array.isArray(x) && x.every(validOrder),
          "Order confirmation could not be read. Please retry.",
        );
        if (!controller.signal.aborted)
          setOrder(
            orders.find(
              (x) =>
                String(x.id) === String(id) ||
                String(x.orderNumber || "") === String(id) ||
                String(x.order_number || "") === String(id),
            ),
          );
      })
      .catch((error) => {
        if (!controller.signal.aborted && error.name !== "AbortError")
          setError(error.message);
      })
      .finally(() => !controller.signal.aborted && setLoading(false));
    return () => controller.abort();
  }, [id, retry]);
  return (
    <div className="container section narrow text-center">
      {loading ? (
        <Spinner />
      ) : error ? (
        <Empty>
          <p role="alert">{error}</p>
          <button
            className="button secondary"
            onClick={() => setRetry((n) => n + 1)}
          >
            Retry confirmation
          </button>
        </Empty>
      ) : order ? (
        <>
          <div className="confirmation">
            <h1>Thank You for Shopping with Narziss</h1>
            <p>
              {order.method === "cod"
                ? "Your Cash on Delivery order has been placed."
                : "Your order and payment have been verified successfully."}
            </p>
            <p>Order reference: #{String(order.orderNumber || order.order_number || order.id).slice(0, 8).toUpperCase()}</p>

            {order.confirmed_by_admin && order.delivery_date ? (
              <div style={{
                background: "#f0fdf4",
                border: "1.5px solid #86efac",
                borderRadius: "12px",
                padding: "16px",
                margin: "20px auto 0",
                maxWidth: "440px",
                textAlign: "center"
              }}>
                <div style={{ color: "#166534", fontWeight: 700, fontSize: "1rem", marginBottom: "4px" }}>
                  ✓ Order Confirmed by Narziss
                </div>
                <div style={{ color: "#15803d", fontSize: "0.95rem" }}>
                  Expected Delivery Date: <strong>{order.delivery_date}</strong>
                </div>
              </div>
            ) : (
              <div style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: "12px",
                padding: "16px",
                margin: "20px auto 0",
                maxWidth: "440px",
                textAlign: "center"
              }}>
                <div style={{ color: "#334155", fontWeight: 600, fontSize: "0.95rem", marginBottom: "4px" }}>
                  📋 Sent to Merchant Fulfillment Desk
                </div>
                <p style={{ color: "#64748b", fontSize: "0.85rem", margin: 0 }}>
                  The merchant will confirm your order and assign your scheduled delivery date shortly.
                </p>
              </div>
            )}
          </div>
          <div className="flex justify-center gap-4 mt-8">
            <Link className="button" to="/my-orders">
              View My Orders
            </Link>
            <Link className="button secondary" to="/#new-arrivals">
              Explore More
            </Link>
          </div>
        </>
      ) : (
        <Empty>
          <h1>Order confirmation unavailable</h1>
          <Link to="/my-orders">View My Orders</Link>
        </Empty>
      )}
    </div>
  );
}
export function PaymentStatus() {
  const { id } = useParams(),
    navigate = useNavigate(),
    [order, setOrder] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [qrCodeUrl, setQrCodeUrl] = useState(""),
    [checkoutUrl, setCheckoutUrl] = useState(""),
    { refreshCart, notify } = useStore();
  const submissionLock = useRef(false);

  useEffect(() => {
    if (order && (order.paymentStatus === "successful" || order.paymentStatus === "paid")) {
      navigate(`/order-confirmation/${order.id}`, { replace: true });
    }
  }, [order?.paymentStatus, order?.id, navigate]);

  async function load(signal) {
    setLoading(true);
    setError("");
    try {
      const orders = expectData(
        await api.orders({ signal }),
        (x) => Array.isArray(x) && x.every(validOrder),
        "Payment details could not be read. Please retry.",
      );
      if (!signal?.aborted)
        setOrder(
          orders.find(
            (order) =>
              order.id === id &&
              order.method !== "cod" &&
              ["pending", "successful", "failed"].includes(order.paymentStatus),
          ),
        );
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
      "Payment Status | Narziss",
      "Review the current status of your UPI payment.",
    );
    return () => controller.abort();
  }, [id]);

  // Auto-fetch dynamic QR code for pending UPI payments
  useEffect(() => {
    if (!order || order.paymentStatus !== "pending") return;
    let isCancelled = false;

    async function fetchQrSession() {
      try {
        const orderIdentifier = order.orderNumber || order.order_number || order.id;
        const totalAmount = order.total || order.items?.reduce((s, it) => s + (it.price || 0) * (it.quantity || 1), 0) || 1299.0;
        const res = await api.initiateYoupiPayment(orderIdentifier, {
          amount: totalAmount,
          customerName: order.address?.name,
          customerPhone: order.address?.phone,
        });
        if (!isCancelled && res) {
          const qr = res.qrUrl || res.qr_url || (res.checkoutUrl ? `${res.checkoutUrl}/qr.svg` : (res.checkout_url ? `${res.checkout_url}/qr.svg` : ""));
          if (qr) setQrCodeUrl(qr);
          if (res.checkoutUrl || res.checkout_url) setCheckoutUrl(res.checkoutUrl || res.checkout_url);
        }
      } catch (e) {
        console.warn("QR initiation error:", e);
      }
    }

    fetchQrSession();
    return () => { isCancelled = true; };
  }, [order?.id, order?.paymentStatus]);

  // Real-time polling of YouPI Payment Gateway status
  useEffect(() => {
    if (!order || order.paymentStatus !== "pending") return;
    const interval = setInterval(async () => {
      try {
        const res = await api.checkYoupiPaymentStatus(order.orderNumber || order.order_number || order.id);
        const qr = res?.qrUrl || res?.qr_url || (res?.checkoutUrl ? `${res.checkoutUrl}/qr.svg` : (res?.checkout_url ? `${res.checkout_url}/qr.svg` : ""));
        if (qr && !qrCodeUrl) {
          setQrCodeUrl(qr);
        }
        if (res && (res.payment_status === "paid" || res.payment_status === "successful")) {
          clearInterval(interval);
          await simulate("successful");
        } else if (res && res.payment_status === "failed") {
          clearInterval(interval);
          await simulate("failed");
        }
      } catch {
        // silent catch during polling
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [order?.id, order?.paymentStatus, qrCodeUrl]);

  async function simulate(status) {
    if (submissionLock.current) return;
    submissionLock.current = true;
    setBusy(true);
    try {
      const updated = expectData(
        await api.paymentStatus(id, status),
        validOrder,
        "Payment details could not be read. Please retry.",
      );
      setOrder(updated);
      if (status === "successful" && updated.checkoutKind === "cart")
        await refreshCart().catch((error) =>
          notify(`Payment confirmed. ${error.message}`),
        );
    } catch (e) {
      setError(e.message);
    } finally {
      submissionLock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="container section narrow">
      <h1>Payment Status</h1>
      {loading ? (
        <Spinner />
      ) : error ? (
        <Empty>
          <p>{error}</p>
          <button className="button secondary" onClick={() => load()}>
            Retry
          </button>
        </Empty>
      ) : order ? (
        <>
          <h2>
            {order.paymentStatus === "successful"
              ? "Payment Successful"
              : order.paymentStatus === "failed"
                ? "Payment Failed"
                : "Payment Processing"}
          </h2>
          {order.paymentStatus === "pending" && (
            <>
              {/* Prominent Live Dynamic UPI QR Code Box */}
              <div className="p-6 mb-6 rounded-2xl border-2 border-emerald-600/30 bg-gradient-to-b from-emerald-50/40 via-white to-stone-50 text-center shadow-md max-w-md mx-auto">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-semibold mb-3 border border-emerald-300">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
                  Scan & Pay with Any UPI App
                </div>

                <div className="text-xl font-bold text-stone-900 mb-1">
                  Amount: {money(order.total || order.items?.reduce((s, it) => s + (it.price || 0) * (it.quantity || 1), 0) || 1299)}
                </div>
                <p className="text-xs text-stone-500 mb-4">
                  Dynamic QR Code generated for Order #{order.orderNumber || order.id.slice(0, 8)}
                </p>

                {/* QR Display */}
                <div className="relative inline-block p-4 bg-white rounded-xl border border-stone-200 shadow-sm mb-4">
                  {qrCodeUrl ? (
                    <img
                      src={qrCodeUrl}
                      alt="Scan UPI QR Code to pay"
                      className="w-56 h-56 object-contain mx-auto rounded-lg transition-all"
                    />
                  ) : (
                    <div className="w-56 h-56 flex flex-col items-center justify-center gap-2 text-stone-400">
                      <Spinner />
                      <span className="text-xs">Generating secure UPI QR...</span>
                    </div>
                  )}
                </div>

                {/* Supported UPI Apps */}
                <p className="text-xs text-stone-600 mb-3">
                  Open <strong>Google Pay</strong>, <strong>PhonePe</strong>, <strong>Paytm</strong>, or <strong>BHIM</strong> and scan this code
                </p>

                <div className="flex items-center justify-center gap-2 text-xs text-emerald-800 font-medium bg-emerald-50 py-2 px-3 rounded-lg border border-emerald-200">
                  <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span>
                  Listening for instant bank confirmation... (Auto-verifying)
                </div>
              </div>

              <div className="flex flex-col items-center gap-3 mb-6">
                <button
                  className="button"
                  style={{
                    backgroundColor: "#16a34a",
                    borderColor: "#16a34a",
                    color: "#ffffff",
                    fontWeight: 700,
                    padding: "9px 22px",
                    fontSize: "0.9rem",
                    boxShadow: "0 2px 8px rgba(22, 163, 74, 0.35)",
                  }}
                  disabled={busy}
                  onClick={async () => {
                    try {
                      setBusy(true);
                      const paymentId = order.youpiPaymentId || order.youpi_payment_id;
                      if (paymentId) {
                        try {
                          await fetch(`http://localhost:6100/api/v1/checkout/${paymentId}/payment-done`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({}),
                          });
                        } catch {}
                      }
                      await simulate("successful");
                    } catch (e) {
                      notify("Error confirming payment: " + e.message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  ✓ Verify Instantly
                </button>

                <button
                  className="button secondary"
                  style={{ fontSize: "0.85rem", padding: "6px 16px" }}
                  disabled={busy}
                  onClick={async () => {
                    try {
                      const orderIdentifier = order.orderNumber || order.order_number || order.id;
                      const totalAmount = order.total || order.items?.reduce((s, it) => s + (it.price || 0) * (it.quantity || 1), 0) || 1299.0;
                      const youpiRes = await api.initiateYoupiPayment(orderIdentifier, {
                        amount: totalAmount,
                        customerName: order.address?.name,
                        customerPhone: order.address?.phone,
                      });
                      if (youpiRes?.checkoutUrl) {
                        if (typeof window !== "undefined" && window.Youpi && typeof window.Youpi.pay === "function") {
                          window.Youpi.pay({
                            checkoutUrl: youpiRes.checkoutUrl,
                            paymentId: youpiRes.paymentId,
                            onSuccess: () => navigate(`/order-confirmation/${order.id}`, { replace: true }),
                            onClose: () => {},
                          });
                        } else {
                          window.location.href = youpiRes.checkoutUrl;
                        }
                      }
                    } catch (e) {
                      notify("Unable to open YouPI checkout: " + e.message);
                    }
                  }}
                >
                  Open Fullscreen QR / UPI Apps
                </button>
              </div>
            </>
          )}
          {order.paymentStatus === "failed" && (
            <>
              <p>
                Your order details are retained. Retry or choose another method.
              </p>
              <div className="flex flex-wrap gap-3 mb-6">
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => simulate("pending")}
                >
                  Retry Payment
                </button>
                <Link
                  className="button secondary"
                  to="/checkout/payment"
                  onClick={(event) => {
                    const stored = writeStorageJson(
                      "sessionStorage",
                      storageKeys.checkout,
                      {
                        kind: order.checkoutKind || "buy",
                        retryOrderId: order.id,
                        idempotencyKey: order.idempotencyKey,
                        lines: order.items
                          .filter((l) => l.status !== "cancelled")
                          .map((l) => ({
                            variantId: l.variantId,
                            quantity: l.quantity,
                          })),
                        address: order.address,
                      },
                    );
                    if (!stored) {
                      event.preventDefault();
                      setError(
                        "Checkout storage is unavailable. Enable browser storage and retry.",
                      );
                    }
                  }}
                >
                  Change Payment Method
                </Link>
              </div>
            </>
          )}
          <Link className="button secondary" to="/my-orders">
            View My Orders
          </Link>
        </>
      ) : (
        <Empty>Payment reference unavailable.</Empty>
      )}
    </div>
  );
}
