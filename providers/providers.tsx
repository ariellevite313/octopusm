"use client";

import { Suspense } from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { QueryProvider } from "./query-provider";
import { AuthProvider, useAuth } from "./auth-provider";
import { OnboardingModal, useOnboardingModal } from "@/components/onboarding/onboarding-modal";
import { NavigationProgress } from "@/components/layout/navigation-progress";

function OnboardingGate() {
  const { walletAddress } = useAuth();
  const { show, close } = useOnboardingModal(walletAddress);
  if (!show || !walletAddress) return null;
  return <OnboardingModal walletAddress={walletAddress} onClose={close} />;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryProvider>
        <AuthProvider>
          <Suspense fallback={null}><NavigationProgress /></Suspense>
          {children}
          <OnboardingGate />
          <Toaster position="bottom-right" richColors />
        </AuthProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}
