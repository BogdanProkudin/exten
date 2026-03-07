import { ConvexProvider, ConvexReactClient } from "convex/react";
import { Component, type ReactNode, type ErrorInfo } from "react";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

// Error boundary for Convex provider
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ConvexErrorBoundary extends Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[Vocabify] Convex error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "20px", textAlign: "center" }}>
          <p style={{ color: "#dc2626", marginBottom: "8px", fontSize: "14px" }}>
            Connection error
          </p>
          <p style={{ color: "#6b7280", marginBottom: "12px", fontSize: "12px" }}>
            {this.state.error?.message || "Could not connect to the server"}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: "6px 16px",
              fontSize: "13px",
              fontWeight: 500,
              border: "1px solid #e5e7eb",
              borderRadius: "6px",
              background: "#f9fafb",
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexProvider client={convex}>
      <ConvexErrorBoundary>{children}</ConvexErrorBoundary>
    </ConvexProvider>
  );
}
