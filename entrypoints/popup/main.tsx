import ReactDOM from "react-dom/client";
import { ConvexClientProvider } from "../../src/lib/convex-provider";
import { ErrorBoundary } from "../../src/components/ErrorBoundary";
import App from "./App";
import "../../src/global.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <ConvexClientProvider>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </ConvexClientProvider>,
);
