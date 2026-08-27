import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { installProductionConsoleSilence } from "./lib/logger";
import "./index.css";
import App from "./App.jsx";
import { ToastProvider } from "./context/ToastContext.jsx";
import { ConfirmProvider } from "./context/ConfirmContext.jsx";

// Must run before app code so leftover console.log/debug are silent in production builds.
installProductionConsoleSilence();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <ConfirmProvider>
            <App />
          </ConfirmProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);
