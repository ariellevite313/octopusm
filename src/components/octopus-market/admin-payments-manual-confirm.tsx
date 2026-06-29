import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  upsertAdminPaymentNotification,
  updateAdminPaymentNotificationStatus,
  type AdminPaymentFlow,
  type AdminPaymentNotification,
} from "@/components/octopus-market/octopus-admin";
import { predictionMarketTreasuryAddress } from "@/components/octopus-market/octopus-market-data";

const paymentFlowOptions: AdminPaymentFlow[] = ["prediction", "launch", "listing"];

type AdminPaymentsManualConfirmProps = {
  walletAddress: string | null;
  initialPending: AdminPaymentNotification[];
};

function formatMoment(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

export function AdminPaymentsManualConfirm({
  walletAddress,
  initialPending,
}: AdminPaymentsManualConfirmProps) {
  const [showManualForm, setShowManualForm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [manualForm, setManualForm] = useState({
    username: "",
    type: "prediction" as AdminPaymentFlow,
    amount: "",
    txSignature: "",
    userWallet: "",
    title: "",
  });

  const pendingPayments = useMemo(
    () => initialPending.filter((payment) => payment.status === "pending"),
    [initialPending]
  );

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3000);
  };

  const handleManualAdd = () => {
    const amount = Number(manualForm.amount);

    if (
      !manualForm.username.trim() ||
      !manualForm.txSignature.trim() ||
      !manualForm.userWallet.trim() ||
      !manualForm.title.trim() ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      showToast("Fill every field before adding a manual payment.");
      return;
    }

    const paymentReference = `manual-${Date.now()}`;

    upsertAdminPaymentNotification({
      id: `admin-${paymentReference}`,
      paymentRequestId: paymentReference,
      paymentReference,
      flow: manualForm.type,
      title: manualForm.title.trim(),
      subtitle: "Manual confirmation queue",
      username: manualForm.username.trim(),
      userWallet: manualForm.userWallet.trim(),
      recipientWallet: walletAddress || predictionMarketTreasuryAddress,
      amountUsdc: amount,
      reserveFeeUsdc: 0,
      totalPaidUsdc: amount,
      createdAt: Date.now(),
      status: "pending",
    });

    setManualForm({
      username: "",
      type: "prediction",
      amount: "",
      txSignature: "",
      userWallet: "",
      title: "",
    });
    setShowManualForm(false);
    showToast("Manual payment added to the pending approval queue.");
  };

  const handleManualApprove = (paymentReference: string) => {
    updateAdminPaymentNotificationStatus(
      paymentReference,
      "approved",
      walletAddress || predictionMarketTreasuryAddress
    );
    showToast("Payment approved manually.");
  };

  return (
    <Card className="border-orange-200 bg-white text-zinc-950 dark:border-white/10 dark:bg-zinc-950/80 dark:text-white">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <Badge className="mb-3 border border-orange-200 bg-orange-100 text-orange-700 hover:bg-orange-100 dark:border-orange-400/20 dark:bg-orange-500/15 dark:text-orange-300 dark:hover:bg-orange-500/15">
            Manual admin confirm
          </Badge>
          <CardTitle className="text-xl">Temporary manual payment review</CardTitle>
        </div>
        <Button
          type="button"
          variant="outline"
          className="rounded-2xl border-orange-200 bg-white text-zinc-950 hover:bg-orange-50 dark:border-white/10 dark:bg-zinc-900 dark:text-white dark:hover:bg-zinc-800"
          onClick={() => setShowManualForm((currentValue) => !currentValue)}
        >
          {showManualForm ? "Close" : "Add manually"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {toast ? (
          <div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-700 dark:border-orange-400/20 dark:bg-orange-500/10 dark:text-orange-300">
            {toast}
          </div>
        ) : null}

        {showManualForm ? (
          <div className="grid gap-3 rounded-2xl border border-orange-100 bg-orange-50 p-4 md:grid-cols-2 xl:grid-cols-6 dark:border-white/10 dark:bg-black/20">
            <Input
              value={manualForm.username}
              onChange={(event) => setManualForm((currentValue) => ({ ...currentValue, username: event.target.value }))}
              placeholder="Username"
              className="border-orange-200 bg-white dark:border-white/10 dark:bg-zinc-950"
            />
            <Input
              value={manualForm.userWallet}
              onChange={(event) => setManualForm((currentValue) => ({ ...currentValue, userWallet: event.target.value }))}
              placeholder="User wallet"
              className="border-orange-200 bg-white dark:border-white/10 dark:bg-zinc-950"
            />
            <Input
              value={manualForm.title}
              onChange={(event) => setManualForm((currentValue) => ({ ...currentValue, title: event.target.value }))}
              placeholder="Flow title"
              className="border-orange-200 bg-white dark:border-white/10 dark:bg-zinc-950"
            />
            <select
              value={manualForm.type}
              onChange={(event) =>
                setManualForm((currentValue) => ({
                  ...currentValue,
                  type: event.target.value as AdminPaymentFlow,
                }))
              }
              className="h-10 rounded-md border border-orange-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-zinc-950"
            >
              {paymentFlowOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <Input
              type="number"
              step="0.01"
              value={manualForm.amount}
              onChange={(event) => setManualForm((currentValue) => ({ ...currentValue, amount: event.target.value }))}
              placeholder="Amount in USDC"
              className="border-orange-200 bg-white dark:border-white/10 dark:bg-zinc-950"
            />
            <Input
              value={manualForm.txSignature}
              onChange={(event) => setManualForm((currentValue) => ({ ...currentValue, txSignature: event.target.value }))}
              placeholder="Tx signature"
              className="border-orange-200 bg-white dark:border-white/10 dark:bg-zinc-950"
            />
            <div className="md:col-span-2 xl:col-span-6">
              <Button
                type="button"
                className="rounded-2xl bg-orange-500 text-white hover:bg-orange-400"
                onClick={handleManualAdd}
              >
                Add and send to pending approvals
              </Button>
            </div>
          </div>
        ) : null}

        <div className="space-y-3">
          {pendingPayments.length > 0 ? (
            pendingPayments.slice(0, 5).map((payment) => (
              <div
                key={payment.id}
                className="rounded-2xl border border-orange-100 bg-orange-50 px-4 py-4 dark:border-white/10 dark:bg-black/20"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-zinc-950 dark:text-white">{payment.title}</p>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      {payment.username || payment.userWallet} · {payment.flow} · {formatMoment(payment.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-zinc-950 dark:text-white">
                      {payment.token === "clawdtrust"
                        ? `${new Intl.NumberFormat("en-US").format(payment.amountUsdc)} CLT`
                        : `${payment.totalPaidUsdc.toFixed(2)} USDC`}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      className="rounded-full bg-emerald-600 text-white hover:bg-emerald-500"
                      onClick={() => handleManualApprove(payment.paymentReference)}
                    >
                      Approve manually
                    </Button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-orange-200 bg-white px-4 py-4 text-sm text-zinc-600 dark:border-white/10 dark:bg-zinc-950/80 dark:text-zinc-400">
              No manual approval is waiting right now.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
