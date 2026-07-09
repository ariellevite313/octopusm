"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { QueryProvider } from "./query-provider";
import { AuthProvider, useAuth } from "./auth-provider";
import { OnboardingModal, useOnboardingModal } from "@/components/onboarding/onboarding-modal";

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
          {children}
          <OnboardingGate />
          <Toaster position="bottom-right" richColors />
        </AuthProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}
