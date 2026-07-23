"use client";

import { Suspense, useEffect, useState } from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { QueryProvider } from "./query-provider";
import { AuthProvider, useAuth } from "./auth-provider";
import { OnboardingModal, useOnboardingModal } from "@/components/onboarding/onboarding-modal";
import { UsernameSetupModal } from "@/components/dashboard/username-setup-modal";
import { NavigationProgress } from "@/components/layout/navigation-progress";
import { createClient } from "@/lib/supabase/client";

// ─── Combined modal gate ──────────────────────────────────────────────────────
// Order: profile setup FIRST → then onboarding tasks

function GlobalModals() {
  const { walletAddress } = useAuth();
  // null = still loading, true = needs setup, false = setup done
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);

  useEffect(() => {
    if (!walletAddress) {
      setNeedsSetup(null);
      return;
    }
    const supabase = createClient();
    supabase
      .from("wallets")
      .select("username")
      .eq("address", walletAddress)
      .maybeSingle()
      .then(({ data }) => {
        setNeedsSetup(!data?.username);
      });
  }, [walletAddress]);

  // Only enable onboarding hook once profile is complete
  const { show: showOnboarding, close: closeOnboarding } = useOnboardingModal(
    needsSetup === false ? walletAddress : null,
  );

  if (!walletAddress || needsSetup === null) return null;

  // Profile setup required — blocks everything else
  if (needsSetup) {
    return <UsernameSetupModal onSetupComplete={() => setNeedsSetup(false)} />;
  }

  // Profile complete — show onboarding if not yet seen
  if (showOnboarding) {
    return <OnboardingModal walletAddress={walletAddress} onClose={closeOnboarding} />;
  }

  return null;
}

// ─── Root providers ───────────────────────────────────────────────────────────

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryProvider>
        <AuthProvider>
          <Suspense fallback={null}><NavigationProgress /></Suspense>
          {children}
          <GlobalModals />
          <Toaster position="bottom-right" richColors />
        </AuthProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}
