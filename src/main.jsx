import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Provider } from "./state/Store";
import App from "./App";
import "@fontsource/google-sans/latin-400.css";
import "@fontsource/google-sans/latin-500.css";
import "@fontsource/poppins/latin-500.css";
import "./styles.css";
import "./storefront-interactions.css";
class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("Global ErrorBoundary caught error:", error, errorInfo);
  }
  handleRetry = () => {
    this.setState({ error: null });
    window.location.reload();
  };
  handleHome = () => {
    this.setState({ error: null });
    window.location.href = "/";
  };
  render() {
    return this.state.error ? (
      <main className="container section" role="alert" style={{ minHeight: "50vh", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <h1>Something went wrong</h1>
        <p>
          Your page encountered an unexpected issue. You can retry or head back home.
        </p>
        <div className="flex flex-wrap gap-3" style={{ marginTop: "1rem" }}>
          <button className="button" onClick={this.handleRetry}>
            Retry page
          </button>
          <button className="button secondary" onClick={() => window.history.back()}>
            Go back
          </button>
          <button className="button secondary" onClick={this.handleHome}>
            Return home
          </button>
        </div>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <Provider>
          <App />
        </Provider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
