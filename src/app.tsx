import { SnErrorBoundary } from "../supernova/helpers/snErrorBoundary";

import { OctopusLocaleProvider } from "@/components/octopus-market/octopus-locale";
import { OctopusMarketPage } from "@/components/octopus-market/octopus-market-page";
import { SupabaseProvider } from "@/providers/supabase-provider";

export default function App() {
  return (
    <SupabaseProvider>
      <OctopusLocaleProvider>
        <SnErrorBoundary>
          <OctopusMarketPage />
        </SnErrorBoundary>
      </OctopusLocaleProvider>
    </SupabaseProvider>
  );
}
