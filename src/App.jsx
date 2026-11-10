import { Suspense, lazy, useEffect, Fragment } from "react";
import { Navigate, Routes, Route, Link, useLocation } from "react-router-dom";
import { Shell } from "./components/Layout";
import { Modals } from "./components/Modals";
import { Spinner, Empty } from "./components/UI";
import { useStore } from "./state/Store";
import SmoothScrollProvider from "./components/SmoothScrollProvider";
import CustomCursor from "./components/CustomCursor";
const Home = lazy(() =>
  import("./pages/Browse").then((m) => ({ default: m.Home })),
);
const Collection = lazy(() =>
  import("./pages/Browse").then((m) => ({ default: m.Collection })),
);
const Product = lazy(() => import("./pages/Product"));
const HierarchyListingRoute = lazy(() => import("./pages/HierarchyListingRoute"));
const Cart = lazy(() => import("./pages/Cart"));
const Orders = lazy(() => import("./pages/Orders"));
const Address = lazy(() =>
  import("./pages/Checkout").then((m) => ({ default: m.Address })),
);
const Payment = lazy(() =>
  import("./pages/Checkout").then((m) => ({ default: m.Payment })),
);
const Confirmation = lazy(() =>
  import("./pages/Checkout").then((m) => ({ default: m.Confirmation })),
);
const PaymentStatus = lazy(() =>
  import("./pages/Checkout").then((m) => ({ default: m.PaymentStatus })),
);
function Protected({ children }) {
  const { user, requireLogin } = useStore(),
    location = useLocation();
  useEffect(() => {
    if (!user) requireLogin();
  }, [user, location.pathname]);
  return user ? (
    <Fragment key={user.id}>{children}</Fragment>
  ) : (
    <div className="container section">
      <Empty>
        <p>Please log in to continue.</p>
        <button className="button" onClick={() => requireLogin()}>
          Log in
        </button>
      </Empty>
    </div>
  );
}

export default function App() {
  return (
    <Shell>
      <SmoothScrollProvider />
      <CustomCursor />
      <Suspense
        fallback={
          <div className="container section loading-row">
            <Spinner label="Loading page…" />
          </div>
        }
      >
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/shop" element={<Navigate replace to="/#new-arrivals" />} />
          <Route path="/shop/:sectionSlug" element={<HierarchyListingRoute />} />
          <Route path="/shop/:sectionSlug/:categorySlug" element={<HierarchyListingRoute />} />
          <Route path="/shop/:sectionSlug/:categorySlug/:subcategorySlug" element={<HierarchyListingRoute />} />
          <Route path="/collections/:collection" element={<Collection />} />
          <Route path="/products/:slug" element={<Product />} />
          {[
            ["/cart", Cart],
            ["/my-orders", Orders],
            ["/checkout/address", Address],
            ["/checkout/payment", Payment],
            ["/order-confirmation/:id", Confirmation],
            ["/payment-status/:id", PaymentStatus],
          ].map(([path, Page]) => (
            <Route
              key={path}
              path={path}
              element={
                <Protected>
                  <Page />
                </Protected>
              }
            />
          ))}
          <Route
            path="*"
            element={
              <div className="container section">
                <h1>Page Not Found</h1>
                <Link className="button" to="/">
                  Return Home
                </Link>
              </div>
            }
          />
        </Routes>
      </Suspense>
      <Modals />
    </Shell>
  );
}
