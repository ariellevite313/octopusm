import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

// Capture referral code from URL on first load (runs once at module init)
try {
  const ref = new URLSearchParams(window.location.search).get("ref");
  if (ref?.startsWith("OCT-")) {
    localStorage.setItem("octo_ref", ref);
  }
} catch {
  // localStorage may be unavailable in some environments
}

import { SnErrorBoundary } from "../supernova/helpers/snErrorBoundary";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OctopusLocaleProvider } from "@/components/octopus-market/octopus-locale";
import { OctopusMarketPage } from "@/components/octopus-market/octopus-market-page";
import { ArchivePage } from "@/components/octopus-market/archive-page";
import { SupabaseProvider } from "@/providers/supabase-provider";
import { Toaster } from "@/components/ui/sonner";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SupabaseProvider>
        <OctopusLocaleProvider>
          <SnErrorBoundary>
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<OctopusMarketPage />} />
                <Route path="/archive" element={<ArchivePage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </BrowserRouter>
            <Toaster />
          </SnErrorBoundary>
        </OctopusLocaleProvider>
      </SupabaseProvider>
    </QueryClientProvider>
  );
}
