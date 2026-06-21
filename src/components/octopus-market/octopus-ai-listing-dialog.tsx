import { useMemo, useState } from "react";
import { CheckCircle2, FileText, Globe, ImagePlus, LoaderCircle, Receipt, ShieldCheck, Wallet } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { appendAIListingSubmission, getDefaultListingSubmissionProfile } from "@/components/octopus-market/ai-listing-store";
import type { RegistryWalletRecord } from "@/components/octopus-market/octopus-central-registry";
import { buildTransaction, fetchTransaction, findReference, submitSolanaTransfer, validateTransfer } from "@/components/octopus-market/solana-pay";
import { paymentTokenSymbol, solanaPaymentAddress, solanaUsdcMintAddress } from "@/components/octopus-market/octopus-market-data";
import { getSolanaProvider } from "@/components/octopus-market/solana-wallet";

const listingPlans = {
  free: {
    label: "Free",
    amountUsd: 0,
    billingLabel: "$0 / free",
  },
  starter: {
    label: "Starter",
    amountUsd: 10,
    billingLabel: "$10 / month",
  },
  builder: {
    label: "Builder",
    amountUsd: 100,
    billingLabel: "$100 / year · 22% off",
  },
} as const;

type OctopusAIListingDialogProps = {
  walletAddress: string | null;
  walletRecord: RegistryWalletRecord | null;
  onConnectWallet: () => Promise<string | null>;
  triggerLabel?: string;
  embedded?: boolean;
};

type StepId = 1 | 2;
type ListingPlanId = keyof typeof listingPlans;

function normalizeUrl(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return "";
  }

  if (/^https?:\/\//i.test(trimmedValue)) {
    return trimmedValue;
  }

  return `https://${trimmedValue}`;
}

export function OctopusAIListingDialog({
  walletAddress,
  walletRecord,
  onConnectWallet,
  triggerLabel = "Open AI listing",
  embedded = false,
}: OctopusAIListingDialogProps) {
  const [step, setStep] = useState<StepId>(1);
  const [planId, setPlanId] = useState<ListingPlanId>("starter");
  const [autoRenewEnabled, setAutoRenewEnabled] = useState(true);
  const [iconSrc, setIconSrc] = useState("");
  const [iconName, setIconName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [detail, setDetail] = useState("");
  const [socialUrl, setSocialUrl] = useState("");
  const [guideFileName, setGuideFileName] = useState("");
  const [guideFileUrl, setGuideFileUrl] = useState("");
  const [statusMessage, setStatusMessage] = useState(
    "Submit your AI details first, then verify the USDC payment to place the listing in the admin review queue."
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const profileDefaults = getDefaultListingSubmissionProfile(walletRecord);
  const selectedPlan = listingPlans[planId];
  const detailWordCount = detail.trim().split(/\s+/).filter(Boolean).length;
  const canGoToPayment =
    iconSrc.length > 0 &&
    normalizeUrl(websiteUrl).length > 0 &&
    detailWordCount <= 500 &&
    detail.trim().length > 0 &&
    normalizeUrl(socialUrl).length > 0 &&
    guideFileName.length > 0;

  const currentAmount = useMemo(() => selectedPlan.amountUsd, [selectedPlan.amountUsd]);

  const handleIconChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setIconSrc(typeof reader.result === "string" ? reader.result : "");
      setIconName(file.name);
    };
    reader.readAsDataURL(file);
  };

  const handleGuideChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setGuideFileUrl(typeof reader.result === "string" ? reader.result : "");
      setGuideFileName(file.name);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitListing = async () => {
    const connectedWallet = walletAddress ?? (await onConnectWallet());

    if (!connectedWallet) {
      setStatusMessage("Connect a Phantom wallet first to continue with the AI listing flow.");
      return;
    }

    const appendSubmission = (paymentReference?: string, paymentRequestId?: string) => {
      appendAIListingSubmission({
        id: `listing-${Date.now()}`,
        walletAddress: connectedWallet,
        displayName: walletRecord?.displayName || walletRecord?.username || profileDefaults.displayName,
        twitterHandle: walletRecord?.twitterHandle || profileDefaults.twitterHandle,
        iconSrc,
        iconName,
        websiteUrl: normalizeUrl(websiteUrl),
        description: detail.trim(),
        socialUrl: normalizeUrl(socialUrl),
        guideFileName,
        guideFileUrl,
        planId,
        billingLabel: selectedPlan.billingLabel,
        amountUsd: currentAmount,
        autoRenewEnabled,
        submittedAt: Date.now(),
        updatedAt: Date.now(),
        status: "pending",
        badge: "none",
        paymentReference,
        paymentRequestId,
        visibleInExplore: true,
        visitorCount: 0,
        uniqueVisitorKeys: [],
      });
    };

    if (currentAmount === 0) {
      appendSubmission();
      setStatusMessage("Your free AI listing is now visible in Explore AI and is waiting for admin review.");
      setStep(1);
      return;
    }

    const provider = getSolanaProvider();

    if (!provider?.signAndSendTransaction && !provider?.signTransaction) {
      setStatusMessage("This wallet cannot complete the live USDC listing payment yet.");
      return;
    }

    try {
      setIsSubmitting(true);
      setStatusMessage("Phantom is opening so you can validate the USDC payment for this AI listing.");

      const paymentRequest = await buildTransaction({
        kind: "listing",
        recipient: solanaPaymentAddress,
        amount: currentAmount,
        walletAddress: connectedWallet,
        currency: "USDC",
        tokenMint: solanaUsdcMintAddress,
        tokenDecimals: 6,
        label: "Octopus Market AI listing",
        message: `${selectedPlan.label} AI listing payment`,
        memo: `${selectedPlan.label} AI listing subscription`,
        metadata: {
          onChainTransfer: true,
          plan: selectedPlan.label,
          listingAmountUsd: currentAmount,
          listingAmountUsdc: currentAmount,
          totalChargeUsdc: currentAmount,
          reserveFee: 0,
          username: walletRecord?.displayName || walletRecord?.username || profileDefaults.displayName,
        },
      });

      await submitSolanaTransfer(paymentRequest);
      const foundReference = await findReference(paymentRequest.reference);

      if (!foundReference?.signature) {
        throw new Error("reference-not-found");
      }

      await validateTransfer(foundReference.signature, {
        recipient: solanaPaymentAddress,
        amount: currentAmount,
        reference: paymentRequest.reference,
        currency: "USDC",
        tokenMint: solanaUsdcMintAddress,
        tokenDecimals: 6,
      });

      const validatedPayment = await fetchTransaction(paymentRequest.id);

      if (!validatedPayment || validatedPayment.status !== "validated") {
        throw new Error("validated-transfer-required");
      }

      appendSubmission(validatedPayment.reference, validatedPayment.id);

      setStatusMessage("Your AI listing is now visible in Explore AI and is waiting for admin review, moderation, and badge decisions.");
      setStep(1);
    } catch (error) {
      setStatusMessage(
        error instanceof Error
          ? `The AI listing payment could not be completed: ${error.message}`
          : "The AI listing payment failed."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const content = (
    <div className={embedded ? "min-h-0 space-y-5" : "space-y-6"}>
      {!embedded ? (
        <DialogHeader>
          <Badge className="mb-2 w-fit border border-orange-200 bg-orange-100 text-orange-700 hover:bg-orange-100 dark:border-orange-400/20 dark:bg-orange-500/15 dark:text-orange-300 dark:hover:bg-orange-500/15">
            AI listing submission
          </Badge>
          <DialogTitle className="text-2xl">Submit a new AI for Octopus Market</DialogTitle>
          <DialogDescription className="text-zinc-600 dark:text-zinc-400">
            Step 1 collects your AI details. Step 2 confirms the payment only when the selected plan is paid. Free listings are published immediately in Explore AI and still go through admin review.
          </DialogDescription>
        </DialogHeader>
      ) : null}

      <div className={embedded ? "max-h-[78vh] overflow-y-auto overscroll-contain pr-2 lg:max-h-[82vh]" : "max-h-[80vh] overflow-y-auto overscroll-contain pr-2"}>
        <div className="grid gap-6 lg:grid-cols-[1.35fr_0.85fr] xl:grid-cols-[1.55fr_0.75fr]">
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2">
              <Button
                type="button"
                variant={step === 1 ? "default" : "outline"}
                className={step === 1 ? "min-h-12 justify-center rounded-2xl bg-orange-500 px-4 text-center text-sm text-white hover:bg-orange-400 md:whitespace-nowrap" : "min-h-12 justify-center rounded-2xl border-orange-200 bg-white px-4 text-center text-sm text-zinc-950 hover:bg-orange-50 md:whitespace-nowrap dark:border-white/10 dark:bg-zinc-950 dark:text-white dark:hover:bg-zinc-900"}
                onClick={() => setStep(1)}
              >
                Step 1 · AI details
              </Button>
              <Button
                type="button"
                variant={step === 2 ? "default" : "outline"}
                className={step === 2 ? "min-h-12 justify-center rounded-2xl bg-orange-500 px-4 text-center text-sm text-white hover:bg-orange-400 md:whitespace-nowrap" : "min-h-12 justify-center rounded-2xl border-orange-200 bg-white px-4 text-center text-sm text-zinc-950 hover:bg-orange-50 md:whitespace-nowrap dark:border-white/10 dark:bg-zinc-950 dark:text-white dark:hover:bg-zinc-900"}
                onClick={() => setStep(2)}
                disabled={!canGoToPayment}
              >
                Step 2 · {currentAmount === 0 ? "Review listing" : "Pay with USDC"}
              </Button>
            </div>

            {step === 1 ? (
              <div className="space-y-4 rounded-3xl border border-orange-200 bg-orange-50/70 p-5 xl:min-h-[31rem] dark:border-white/10 dark:bg-white/5">
                <label className="block rounded-2xl border border-dashed border-orange-300 bg-white p-4 text-sm text-zinc-700 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-300">
                  <span className="mb-2 flex items-center gap-2 font-medium">
                    <ImagePlus className="size-4 text-orange-500 dark:text-orange-300" />
                    Submit AI icon
                  </span>
                  <input type="file" accept="image/*" className="mt-2 block w-full text-xs" onChange={handleIconChange} />
                  <span className="mt-3 block text-xs text-zinc-500 dark:text-zinc-400">{iconName || "PNG, JPG, or WEBP"}</span>
                </label>
                <Input
                  value={websiteUrl}
                  onChange={(event) => setWebsiteUrl(event.target.value)}
                  placeholder="AI website URL"
                  className="border-orange-200 bg-white text-zinc-950 dark:border-white/10 dark:bg-zinc-950 dark:text-white"
                />
                <Textarea
                  value={detail}
                  onChange={(event) => setDetail(event.target.value)}
                  placeholder="AI details, maximum 500 words"
                  className="min-h-44 border-orange-200 bg-white text-zinc-950 dark:border-white/10 dark:bg-zinc-950 dark:text-white"
                />
                <div className="text-right text-xs text-zinc-500 dark:text-zinc-400">{detailWordCount} / 500 words</div>
                <Input
                  value={socialUrl}
                  onChange={(event) => setSocialUrl(event.target.value)}
                  placeholder="AI social network URL"
                  className="border-orange-200 bg-white text-zinc-950 dark:border-white/10 dark:bg-zinc-950 dark:text-white"
                />
                <label className="block rounded-2xl border border-dashed border-orange-300 bg-white p-4 text-sm text-zinc-700 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-300">
                  <span className="mb-2 flex items-center gap-2 font-medium">
                    <FileText className="size-4 text-orange-500 dark:text-orange-300" />
                    Submit a PDF guide
                  </span>
                  <input type="file" accept="application/pdf" className="mt-2 block w-full text-xs" onChange={handleGuideChange} />
                  <span className="mt-3 block text-xs text-zinc-500 dark:text-zinc-400">{guideFileName || "PDF guide required"}</span>
                </label>
              </div>
            ) : (
              <div className="space-y-4 rounded-3xl border border-orange-200 bg-orange-50/70 p-5 xl:min-h-[31rem] dark:border-white/10 dark:bg-white/5">
                <div className="grid gap-3 lg:grid-cols-3">
                  {Object.entries(listingPlans).map(([key, plan]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setPlanId(key as ListingPlanId)}
                      className={`rounded-2xl border p-4 text-left transition ${
                        planId === key
                          ? "border-orange-300 bg-white shadow-sm dark:border-orange-400/40 dark:bg-orange-500/10"
                          : "border-orange-200 bg-white hover:border-orange-300 hover:bg-orange-50 dark:border-white/10 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                      }`}
                    >
                      <p className="font-medium text-zinc-950 dark:text-white">{plan.label}</p>
                      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{plan.billingLabel}</p>
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between gap-4 rounded-2xl border border-orange-200 bg-white px-4 py-4 dark:border-white/10 dark:bg-black/20">
                  <div>
                    <p className="font-medium text-zinc-950 dark:text-white">Automatic renewal</p>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                      Activate or disable the recurring payment from your account settings when you choose a paid plan.
                    </p>
                  </div>
                  <Switch checked={autoRenewEnabled} onCheckedChange={setAutoRenewEnabled} disabled={planId === "free"} />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-5">
            <Card className="border-orange-200 bg-white dark:border-white/10 dark:bg-white/5">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center gap-2 text-sm font-medium text-zinc-950 dark:text-white">
                  <Receipt className="size-4 text-orange-500 dark:text-orange-300" />
                  Listing summary
                </div>
                <div className="rounded-2xl border border-orange-100 bg-orange-50/80 px-4 py-4 dark:border-white/10 dark:bg-black/20">
                  <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Linked wallet</p>
                  <p className="mt-2 break-all font-medium text-zinc-950 dark:text-white">{walletAddress || "Connect Phantom to continue"}</p>
                </div>
                <div className="rounded-2xl border border-orange-100 bg-orange-50/80 px-4 py-4 dark:border-white/10 dark:bg-black/20">
                  <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Profile</p>
                  <p className="mt-2 text-sm font-medium text-zinc-950 dark:text-white">
                    {walletRecord?.displayName || walletRecord?.username || profileDefaults.displayName || "No profile saved"}
                  </p>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{walletRecord?.twitterHandle || profileDefaults.twitterHandle || "No X handle saved"}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <div className="rounded-2xl border border-orange-100 bg-orange-50/80 px-4 py-4 dark:border-white/10 dark:bg-black/20">
                    <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Selected plan</p>
                    <p className="mt-2 text-lg font-semibold text-zinc-950 dark:text-white">{selectedPlan.label}</p>
                  </div>
                  <div className="rounded-2xl border border-orange-100 bg-orange-50/80 px-4 py-4 dark:border-white/10 dark:bg-black/20">
                    <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Payment</p>
                    <p className="mt-2 text-lg font-semibold text-zinc-950 dark:text-white">
                      {currentAmount === 0 ? "Free listing" : `${currentAmount.toFixed(2)} ${paymentTokenSymbol}`}
                    </p>
                  </div>
                </div>
                <div className="rounded-2xl border border-orange-100 bg-orange-50/80 px-4 py-4 dark:border-white/10 dark:bg-black/20">
                  <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Validation rules</p>
                  <div className="mt-3 space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
                    <p>Listing becomes visible immediately in Explore AI and remains subject to admin review.</p>
                    <p>No badge is added by default.</p>
                    <p>The blue badge is controlled by the admin.</p>
                    <p>The gold badge stays free only after 6 months minimum.</p>
                  </div>
                </div>
                <Separator className="bg-orange-100 dark:bg-white/10" />
                <Button
                  type="button"
                  className="w-full rounded-2xl bg-orange-500 text-white hover:bg-orange-400"
                  onClick={() => void handleSubmitListing()}
                  disabled={!canGoToPayment || isSubmitting}
                >
                  {isSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : <Wallet className="size-4" />}
                  {currentAmount === 0 ? "Submit free listing" : "Pay with USDC"}
                </Button>
              </CardContent>
            </Card>

            <Alert className="border-orange-200 bg-orange-50/70 text-zinc-950 dark:border-white/10 dark:bg-white/5 dark:text-white">
              {isSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
              <AlertTitle>{isSubmitting ? "Payment validation in progress" : "Listing workflow"}</AlertTitle>
              <AlertDescription>{statusMessage}</AlertDescription>
            </Alert>
          </div>
        </div>
      </div>
    </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="rounded-2xl bg-orange-500 text-white hover:bg-orange-400">{triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[94vh] w-[98vw] max-w-[98vw] overflow-hidden border-orange-200 bg-white text-zinc-950 sm:max-w-[96vw] xl:max-w-[1440px] dark:border-white/10 dark:bg-zinc-950 dark:text-white">
        {content}
      </DialogContent>
    </Dialog>
  );
}
