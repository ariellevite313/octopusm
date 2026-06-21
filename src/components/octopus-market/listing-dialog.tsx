import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRightLeft,
  Check,
  LoaderCircle,
  QrCode,
  ShieldCheck,
  Signature,
  Wallet,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  clawdTrustThresholdUsd,
  paymentTokenSymbol,
  platformReserveFeeRate,
  pricingPlans,
  solanaPaymentAddress,
  solanaUsdcMintAddress,
  predictionMarketTreasuryAddress,
} from "@/components/octopus-market/octopus-market-data";
import { trackConnectedWalletSession, upsertAdminPaymentNotification } from "@/components/octopus-market/octopus-admin";
import {
  buildTransaction,
  fetchTransaction,
  findReference,
  type PaymentRequest,
  submitSolanaTransfer,
  validateTransfer,
} from "@/components/octopus-market/solana-pay";
import {
  calculatePercentageAmount,
  formatWalletAddress,
  getSolanaProvider,
  parseUsdAmount,
  type SolanaProvider,
} from "@/components/octopus-market/solana-wallet";

type ListingDialogProps = {
  children: React.ReactNode;
  walletUsername?: string | null;
};

type WalletStatus = "idle" | "connecting" | "connected" | "signing" | "processing" | "success" | "error";

const paymentStepLabels = [
  "1. Wallet connection",
  "2. Transfer request + signature",
  "3. Reference validation and activation",
];

function getIdleStatusMessage(walletAddress: string | null) {
  return walletAddress
    ? "Wallet connected. You can sign, verify, and trigger the listing charge."
    : "Connect a Solana wallet to authorize the listing payment.";
}

export function ListingDialog({ children, walletUsername }: ListingDialogProps) {
  const featuredPlan = pricingPlans.find((plan) => plan.featured) ?? pricingPlans[0];
  const [selectedPlanName, setSelectedPlanName] = useState(featuredPlan.name);
  const [holderDiscountEnabled, setHolderDiscountEnabled] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletStatus, setWalletStatus] = useState<WalletStatus>("idle");
  const [statusMessage, setStatusMessage] = useState(getIdleStatusMessage(null));
  const [paymentReference, setPaymentReference] = useState<string | null>(null);
  const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(null);

  const providerAvailable = Boolean(getSolanaProvider());

  const selectedPlan = useMemo(
    () => pricingPlans.find((plan) => plan.name === selectedPlanName) ?? featuredPlan,
    [featuredPlan, selectedPlanName]
  );

  const baseAmount = useMemo(() => parseUsdAmount(selectedPlan.price), [selectedPlan.price]);
  const discountAmount = holderDiscountEnabled ? Number((baseAmount * 0.3).toFixed(2)) : 0;
  const finalAmount = Number((baseAmount - discountAmount).toFixed(2));
  const reserveFee = calculatePercentageAmount(finalAmount, platformReserveFeeRate);
  const totalCharge = Number((finalAmount + reserveFee).toFixed(2));
  const isBusy = walletStatus === "connecting" || walletStatus === "signing" || walletStatus === "processing";

  const resetPaymentState = (nextWalletAddress = walletAddress) => {
    setPaymentReference(null);
    setPaymentRequest(null);
    setWalletStatus(nextWalletAddress ? "connected" : "idle");
    setStatusMessage(getIdleStatusMessage(nextWalletAddress));
  };

  const handlePlanChange = (planName: string) => {
    setSelectedPlanName(planName);
    resetPaymentState();
  };

  const handleHolderDiscountChange = (checked: boolean) => {
    setHolderDiscountEnabled(checked);
    resetPaymentState();
  };

  const connectWallet = async () => {
    const provider = getSolanaProvider();

    if (!provider) {
      setWalletStatus("error");
      setStatusMessage("No Solana wallet detected. Open this page with a compatible wallet to continue.");
      return null;
    }

    try {
      setWalletStatus("connecting");
      setStatusMessage("Connecting wallet...");

      const response = await provider.connect();
      const address = response.publicKey?.toString() ?? provider.publicKey?.toString();

      if (!address) {
        throw new Error("wallet-address-missing");
      }

      setWalletAddress(address);
      trackConnectedWalletSession(address, {
        isAdminWallet: address === predictionMarketTreasuryAddress,
        activityLabel:
          address === predictionMarketTreasuryAddress
            ? "Admin wallet connected from listing dialog"
            : "User wallet connected from listing dialog",
      });
      setWalletStatus("connected");
      setStatusMessage("Wallet connected. You can sign, verify, and trigger the listing charge.");

      return { provider, address };
    } catch {
      setWalletStatus("error");
      setStatusMessage("Wallet connection was denied or interrupted.");
      return null;
    }
  };

  const handleAutomaticPayment = async () => {
    let provider: SolanaProvider | null = getSolanaProvider();
    let address = walletAddress;

    if (!provider || !address) {
      const connection = await connectWallet();

      if (!connection) {
        return;
      }

      provider = connection.provider;
      address = connection.address;
    }

    if (!provider.signAndSendTransaction && !provider.signTransaction) {
      setWalletStatus("error");
      setStatusMessage(`This wallet cannot send the live ${paymentTokenSymbol} transfer for listing yet.`);
      return;
    }

    if (!Number.isFinite(totalCharge) || totalCharge <= 0) {
      setWalletStatus("error");
      setStatusMessage(`The ${paymentTokenSymbol} debit cannot be prepared safely right now.`);
      return;
    }

    const nextPaymentRequest = await buildTransaction({
      kind: "listing",
      recipient: solanaPaymentAddress,
      amount: totalCharge,
      walletAddress: address,
      currency: "USDC",
      tokenMint: solanaUsdcMintAddress,
      tokenDecimals: 6,
      label: "Octopus Market listing",
      message: `${selectedPlan.name} listing charge in ${paymentTokenSymbol}`,
      memo: holderDiscountEnabled ? "Holder discount applied with reserve fee" : "Standard listing charge with reserve fee",
      metadata: {
        onChainTransfer: true,
        plan: selectedPlan.name,
        holderDiscount: holderDiscountEnabled,
        listingAmountUsd: finalAmount,
        listingAmountUsdc: finalAmount,
        reserveFee,
        totalChargeUsdc: totalCharge,
        ...(walletUsername?.trim() ? { username: walletUsername.trim() } : {}),
      },
    });

    setPaymentRequest(nextPaymentRequest);

    try {
      setWalletStatus("signing");
      setStatusMessage(`Payment request created. Phantom is now asking for the real on-chain ${paymentTokenSymbol} listing transfer.`);

      await submitSolanaTransfer(nextPaymentRequest);

      setWalletStatus("processing");
      setStatusMessage("Signature received. Octopus Market is validating the reference before activation.");

      const foundReference = await findReference(nextPaymentRequest.reference);

      if (!foundReference) {
        throw new Error("reference-not-found");
      }

      await new Promise((resolve) => {
        window.setTimeout(resolve, 900);
      });

      await validateTransfer(foundReference.signature, {
        recipient: solanaPaymentAddress,
        amount: totalCharge,
        reference: nextPaymentRequest.reference,
        currency: "USDC",
        tokenMint: solanaUsdcMintAddress,
        tokenDecimals: 6,
      });

      const storedValidatedTransfer = await fetchTransaction(nextPaymentRequest.id);

      if (!storedValidatedTransfer || storedValidatedTransfer.status !== "validated") {
        throw new Error("validated-transfer-required");
      }

      setPaymentReference(storedValidatedTransfer.reference);
      setPaymentRequest(storedValidatedTransfer);
      upsertAdminPaymentNotification({
        id: `admin-${storedValidatedTransfer.reference}`,
        paymentRequestId: storedValidatedTransfer.id,
        paymentReference: storedValidatedTransfer.reference,
        flow: "listing",
        title: `${selectedPlan.name} AI listing payment`,
        subtitle: holderDiscountEnabled ? "Holder discount applied" : "Standard listing flow",
        username: walletUsername?.trim() || undefined,
        userWallet: address,
        recipientWallet: solanaPaymentAddress,
        amountUsdc: finalAmount,
        reserveFeeUsdc: reserveFee,
        totalPaidUsdc: totalCharge,
        createdAt: Date.now(),
        status: "pending",
      });
      setWalletStatus("success");
      setStatusMessage(`Payment verified. Your ${selectedPlan.name.toLowerCase()} can now be activated.`);
    } catch (error) {
      setWalletStatus("error");
      setStatusMessage(
        error instanceof Error
          ? `The real ${paymentTokenSymbol} listing payment could not be completed: ${error.message}`
          : "The listing payment request could not be validated."
      );
    }
  };

  const statusIcon =
    walletStatus === "error" ? (
      <AlertCircle className="size-4" />
    ) : walletStatus === "success" ? (
      <Check className="size-4" />
    ) : isBusy ? (
      <LoaderCircle className="size-4 animate-spin" />
    ) : (
      <Wallet className="size-4" />
    );

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-5xl border-orange-200 bg-white text-zinc-950 dark:border-white/10 dark:bg-zinc-950 dark:text-white">
        <DialogHeader>
          <Badge className="mb-2 w-fit border border-orange-200 bg-orange-100 text-orange-700 hover:bg-orange-100 dark:border-orange-400/20 dark:bg-orange-500/15 dark:text-orange-300 dark:hover:bg-orange-500/15">
            {paymentTokenSymbol} on Solana payment
          </Badge>
          <DialogTitle className="text-2xl text-zinc-950 dark:text-white sm:text-3xl">
            Authorize your listing with a wallet signature
          </DialogTitle>
          <DialogDescription className="max-w-3xl text-zinc-600 dark:text-zinc-300">
            The user chooses a plan, connects a Solana wallet, approves the {paymentTokenSymbol} transfer request, and then Octopus Market validates the reference before the listing charge plus the 1% reserve fee is accepted.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <div className="rounded-3xl border border-orange-200 bg-orange-50/70 p-5 dark:border-white/10 dark:bg-white/5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Choose the plan to charge</p>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    The final amount updates automatically before signature.
                  </p>
                </div>
                <Badge className="border border-orange-200 bg-white text-orange-700 hover:bg-white dark:border-white/10 dark:bg-zinc-900 dark:text-orange-300 dark:hover:bg-zinc-900">
                  Verified payment flow
                </Badge>
              </div>

              <RadioGroup
                value={selectedPlan.name}
                onValueChange={handlePlanChange}
                className="mt-5 gap-4"
              >
                {pricingPlans.map((plan) => {
                  const isSelected = plan.name === selectedPlan.name;

                  return (
                    <button
                      key={plan.name}
                      type="button"
                      onClick={() => handlePlanChange(plan.name)}
                      className={`w-full rounded-2xl border p-5 text-left transition ${
                        isSelected
                          ? "border-orange-300 bg-white shadow-sm dark:border-orange-400/50 dark:bg-orange-500/10"
                          : "border-orange-200 bg-white hover:border-orange-300 hover:bg-orange-50 dark:border-white/10 dark:bg-black/20 dark:hover:border-white/20 dark:hover:bg-white/5"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <RadioGroupItem
                            value={plan.name}
                            checked={isSelected}
                            className="mt-1 border-orange-400 text-orange-500 dark:border-white/30 dark:text-orange-300"
                            aria-label={plan.name}
                          />
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-base font-semibold text-zinc-950 dark:text-white">{plan.name}</p>
                              {plan.savings ? (
                                <Badge className="border border-orange-200 bg-orange-100 text-orange-700 hover:bg-orange-100 dark:border-orange-400/20 dark:bg-orange-500/15 dark:text-orange-300 dark:hover:bg-orange-500/15">
                                  {plan.savings}
                                </Badge>
                              ) : null}
                            </div>
                            <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{plan.description}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-3xl font-semibold text-zinc-950 dark:text-white">{plan.price}</p>
                          <p className="text-sm text-zinc-500 dark:text-zinc-400">{plan.billing}</p>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-2 text-sm text-zinc-700 dark:text-zinc-200 sm:grid-cols-2">
                        {plan.perks.map((perk) => (
                          <div key={perk} className="flex items-center gap-2">
                            <Check className="size-4 text-orange-500 dark:text-orange-300" />
                            <span>{perk}</span>
                          </div>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </RadioGroup>
            </div>

            <div className="rounded-3xl border border-orange-200 bg-orange-100/70 p-5 dark:border-orange-400/20 dark:bg-orange-500/10">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium text-zinc-950 dark:text-white">
                    <ShieldCheck className="size-4 text-orange-500 dark:text-orange-300" />
                    $ClawdTrust holder discount
                  </div>
                  <p className="mt-2 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
                    Enable the 30% discount if the wallet used for signature belongs to a qualified holder.
                  </p>
                </div>
                <Switch checked={holderDiscountEnabled} onCheckedChange={handleHolderDiscountChange} />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-orange-700 dark:text-orange-200">
                <Badge className="border border-orange-200 bg-white text-orange-700 hover:bg-white dark:border-orange-400/20 dark:bg-orange-500/15 dark:text-orange-200 dark:hover:bg-orange-500/15">
                  Minimum threshold {clawdTrustThresholdUsd}$
                </Badge>
                {holderDiscountEnabled ? <span>-30% applied to final amount</span> : <span>Discount inactive</span>}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {paymentStepLabels.map((step) => (
                <div
                  key={step}
                  className="rounded-2xl border border-orange-200 bg-white px-4 py-4 text-sm text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300"
                >
                  {step}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-3xl border border-orange-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-900 dark:text-zinc-200">
                <ArrowRightLeft className="size-4 text-orange-500 dark:text-orange-300" />
                Charge summary
              </div>
              <div className="mt-5 space-y-3 text-sm text-zinc-700 dark:text-zinc-300">
                <div className="flex items-center justify-between gap-3">
                  <span>Selected plan</span>
                  <span className="font-medium text-zinc-950 dark:text-white">{selectedPlan.name}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Listing amount</span>
                  <span>{baseAmount.toFixed(2)} $</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Holder discount</span>
                  <span>{holderDiscountEnabled ? `-${discountAmount.toFixed(2)} $` : "0.00 $"}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Reserve fee</span>
                  <span>{reserveFee.toFixed(2)} $</span>
                </div>
                <Separator className="bg-orange-100 dark:bg-white/10" />
                <div className="flex items-center justify-between gap-3 text-base font-semibold text-zinc-950 dark:text-white">
                  <span>Total to charge</span>
                  <span>{totalCharge.toFixed(2)} $</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Exact {paymentTokenSymbol} debit</span>
                  <span>{totalCharge.toFixed(2)} {paymentTokenSymbol}</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-xs text-zinc-500 dark:text-zinc-400">
                  <span>Mint</span>
                  <span>{solanaUsdcMintAddress}</span>
                </div>
              </div>
            </div>

            <Alert
              className={
                walletStatus === "error"
                  ? "border-red-200 bg-red-50 text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100"
                  : "border-orange-200 bg-orange-50/70 text-zinc-950 dark:border-white/10 dark:bg-white/5 dark:text-white"
              }
            >
              {statusIcon}
              <AlertTitle>
                {walletStatus === "success"
                  ? "Payment approved"
                  : walletStatus === "error"
                    ? "Action required"
                    : "Wallet status"}
              </AlertTitle>
              <AlertDescription
                className={walletStatus === "error" ? "text-red-700 dark:text-red-100/80" : "text-zinc-600 dark:text-zinc-300"}
              >
                <p>{statusMessage}</p>
                {!providerAvailable ? <p>A compatible Solana wallet is required to complete the listing.</p> : null}
              </AlertDescription>
            </Alert>

            <div className="grid gap-3">
              <Button
                type="button"
                variant="outline"
                className="w-full border-orange-200 bg-white text-zinc-950 hover:bg-orange-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                onClick={connectWallet}
                disabled={isBusy}
              >
                {walletStatus === "connecting" ? <LoaderCircle className="size-4 animate-spin" /> : <Wallet className="size-4" />}
                {walletAddress ? `Connected wallet ${formatWalletAddress(walletAddress)}` : "Connect my Solana wallet"}
              </Button>

              <Button
                type="button"
                className="w-full bg-orange-500 text-white hover:bg-orange-400 dark:bg-orange-500 dark:text-white dark:hover:bg-orange-400"
                onClick={() => void handleAutomaticPayment()}
                disabled={isBusy}
              >
                {walletStatus === "signing" || walletStatus === "processing" ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Signature className="size-4" />
                )}
                Sign, verify, and charge
              </Button>
            </div>

            <div className="rounded-3xl border border-orange-200 bg-white p-5 dark:border-white/10 dark:bg-black/20">
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-900 dark:text-zinc-200">
                <QrCode className="size-4 text-orange-500 dark:text-orange-300" />
                Payment request details
              </div>
              <div className="mt-4 space-y-4 text-sm text-zinc-600 dark:text-zinc-400">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-500">Client wallet</p>
                  <p className="mt-2 break-all text-zinc-900 dark:text-zinc-200">{walletAddress ?? "Waiting for connection"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-500">Payment token</p>
                  <p className="mt-2 break-all text-zinc-900 dark:text-zinc-200">{paymentTokenSymbol} · {solanaUsdcMintAddress}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-500">Destination address</p>
                  <p className="mt-2 break-all text-orange-600 dark:text-orange-300">{solanaPaymentAddress}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-500">Reference</p>
                  <p className="mt-2 font-medium text-zinc-950 dark:text-white">
                    {paymentReference ?? paymentRequest?.reference ?? "Created after you confirm"}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-500">Encoded transfer request</p>
                  <p className="mt-2 break-all text-zinc-900 dark:text-zinc-200">
                    {paymentRequest?.encodedUrl ?? "solana:... request appears here after the payment request is built"}
                  </p>
                </div>
                {paymentRequest ? (
                  <div className="rounded-2xl border border-orange-100 bg-orange-50 p-4 dark:border-white/10 dark:bg-white/5">
                    <img
                      src={paymentRequest.qrCodeSrc}
                      alt="Listing payment QR"
                      className="mx-auto w-full max-w-44 rounded-2xl border border-orange-200 bg-white p-2 dark:border-white/10 dark:bg-zinc-950"
                    />
                    <p className="mt-3 text-center text-xs text-zinc-500 dark:text-zinc-400">
                      Scan in Phantom or use the encoded request above.
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
