import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { registerCentralWalletProfile, type RegistryWalletRecord } from "@/components/octopus-market/octopus-central-registry";

function persistDismissed(walletAddress: string): void {
  try {
    window.localStorage.setItem(`octopus-market-onboarding-dismissed-${walletAddress}`, "1");
  } catch {
    // localStorage indisponible — sans effet
  }
}

type OctopusOnboardingDialogProps = {
  walletAddress: string | null;
  walletRecord: RegistryWalletRecord | null;
  onProfileSaved: (record: RegistryWalletRecord) => void;
};

export function OctopusOnboardingDialog({
  walletAddress,
  walletRecord,
  onProfileSaved,
}: OctopusOnboardingDialogProps) {
  const [isDismissed, setIsDismissed] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [twitterHandle, setTwitterHandle] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Lit l'état persisté pour ce wallet afin d'éviter la réapparition à la reconnexion
  useEffect(() => {
    if (!walletAddress) {
      setIsDismissed(false);
      return;
    }
    const storageKey = `octopus-market-onboarding-dismissed-${walletAddress}`;
    try {
      setIsDismissed(window.localStorage.getItem(storageKey) === "1");
    } catch {
      setIsDismissed(false);
    }
  }, [walletAddress]);

  const isVisible = useMemo(() => {
    // Si le profil existe en DB, jamais visible
    if (walletRecord?.displayName || walletRecord?.username) return false;
    return Boolean(walletAddress) && !isDismissed;
  }, [isDismissed, walletAddress, walletRecord?.displayName, walletRecord?.username]);

  const handleSaveProfile = async () => {
    if (!walletAddress || isSaving) {
      return;
    }

    const trimmedDisplayName = displayName.trim();
    const trimmedTwitterHandle = twitterHandle.trim();

    if (trimmedDisplayName.length < 2) {
      setErrorMessage("Enter a valid name.");
      return;
    }

    if (!/^@[A-Za-z0-9_]{1,15}$/.test(trimmedTwitterHandle)) {
      setErrorMessage("Enter a valid X identifier in the format @username.");
      return;
    }

    try {
      setIsSaving(true);
      setErrorMessage(null);
      const nextRecord = await registerCentralWalletProfile(walletAddress, {
        displayName: trimmedDisplayName,
        twitterHandle: trimmedTwitterHandle,
        role: "user",
      });

      if (nextRecord) {
        onProfileSaved(nextRecord);
        persistDismissed(walletAddress);
        setIsDismissed(true);
      }
    } catch (error) {
      if (error instanceof Error && error.message === "username-taken") {
        setErrorMessage("This name is already linked to another wallet.");
      } else if (error instanceof Error && error.message === "username-locked") {
        setErrorMessage("This wallet already has a permanent name.");
      } else {
        setErrorMessage("Profile registration failed.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/45 px-4 backdrop-blur-sm">
      <Card className="w-full max-w-xl border-orange-200 bg-white text-zinc-950 shadow-[0_28px_90px_rgba(249,115,22,0.22)] dark:border-white/10 dark:bg-zinc-950 dark:text-white">
        <CardHeader className="relative pr-14">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-4 top-4 rounded-full"
            onClick={() => { if (walletAddress) persistDismissed(walletAddress); setIsDismissed(true); }}
          >
            <X className="size-4" />
          </Button>
          <Badge className="w-fit border border-orange-200 bg-orange-100 text-orange-700 hover:bg-orange-100 dark:border-orange-400/20 dark:bg-orange-500/15 dark:text-orange-300 dark:hover:bg-orange-500/15">
            New Phantom registration
          </Badge>
          <CardTitle className="text-2xl">Complete your Octopus Market profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Your name"
            className="border-orange-200 bg-white text-zinc-950 dark:border-white/10 dark:bg-zinc-900 dark:text-white"
            autoCorrect="off"
            autoCapitalize="words"
            spellCheck={false}
          />
          <Input
            value={twitterHandle}
            onChange={(event) => setTwitterHandle(event.target.value)}
            placeholder="@yourxhandle"
            className="border-orange-200 bg-white text-zinc-950 dark:border-white/10 dark:bg-zinc-900 dark:text-white"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
          />
          <Input
            value={walletAddress || ""}
            readOnly
            className="border-orange-200 bg-orange-50 text-zinc-950 dark:border-white/10 dark:bg-black/20 dark:text-white"
          />
          {errorMessage ? <p className="text-sm text-orange-600 dark:text-orange-300">{errorMessage}</p> : null}
          <Button
            type="button"
            className="w-full rounded-2xl bg-orange-500 text-white hover:bg-orange-400"
            onClick={() => void handleSaveProfile()}
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Save profile and continue"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
