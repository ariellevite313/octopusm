import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  readCentralAdminLogs,
  readCentralPaymentRecords,
  readCentralWalletRecords,
  subscribeToCentralRegistry,
  type RegistryAdminLogRecord,
  type RegistryPaymentRecord,
  type RegistryWalletRecord,
} from "@/components/octopus-market/octopus-central-registry";
import { getAllPredictionHistoryAdmin } from "@/services/supabase/prediction-service";
import type { PredictionHistoryRow, PredictionResultStatus } from "@/lib/supabase-types";
import { predictionMarketTreasuryAddress } from "@/components/octopus-market/octopus-market-data";
import { formatWalletAddress } from "@/components/octopus-market/solana-wallet";

function formatMoment(value?: number) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatAmount(value?: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value ?? 0);
}

type AdminDatabasePanelProps = {
  walletAddress: string | null;
};

type PredictionHistoryWithStatus = PredictionHistoryRow & { result_status: PredictionResultStatus };

type DatabaseSnapshot = {
  wallets: RegistryWalletRecord[];
  payments: RegistryPaymentRecord[];
  history: PredictionHistoryWithStatus[];
  adminLogs: RegistryAdminLogRecord[];
};

async function loadDatabaseSnapshot(): Promise<DatabaseSnapshot> {
  const [wallets, payments, history, adminLogs] = await Promise.all([
    readCentralWalletRecords(),
    readCentralPaymentRecords(),
    getAllPredictionHistoryAdmin(),
    readCentralAdminLogs(),
  ]);

  return { wallets, payments, history, adminLogs };
}

export function AdminDatabasePanel({ walletAddress }: AdminDatabasePanelProps) {
  const [snapshot, setSnapshot] = useState<DatabaseSnapshot>({
    wallets: [],
    payments: [],
    history: [],
    adminLogs: [],
  });
  const [isLoading, setIsLoading] = useState(true);

  const isAdminWallet = walletAddress === predictionMarketTreasuryAddress;

  useEffect(() => {
    if (!isAdminWallet) {
      setSnapshot({ wallets: [], payments: [], history: [], adminLogs: [] });
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    const hydrate = async () => {
      const nextSnapshot = await loadDatabaseSnapshot();

      if (isMounted) {
        setSnapshot(nextSnapshot);
        setIsLoading(false);
      }
    };

    setIsLoading(true);
    void hydrate();

    return subscribeToCentralRegistry(() => {
      void hydrate();
    });
  }, [isAdminWallet]);

  const totals = useMemo(() => {
    const approvedVolume = snapshot.payments
      .filter((payment) => payment.status === "approved")
      .reduce((total, payment) => total + payment.totalPaidUsdc, 0);

    return {
      wallets: snapshot.wallets.length,
      payments: snapshot.payments.length,
      history: snapshot.history.length,
      adminLogs: snapshot.adminLogs.length,
      approvedVolume,
    };
  }, [snapshot]);

  if (!isAdminWallet) {
    return null;
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Badge className="border border-orange-200 bg-orange-100 text-orange-700 hover:bg-orange-100 dark:border-orange-400/20 dark:bg-orange-500/15 dark:text-orange-300 dark:hover:bg-orange-500/15">
            Shared registry
          </Badge>
          <h2 className="mt-3 text-2xl font-semibold text-zinc-950 dark:text-white">Platform database</h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Read the shared Octopus Market data store for wallets, payments, user history, and admin actions.
          </p>
        </div>
        <div className="rounded-2xl border border-orange-200 bg-white px-4 py-3 text-right dark:border-white/10 dark:bg-zinc-900">
          <p className="text-xs uppercase tracking-[0.18em] text-orange-600 dark:text-orange-300">Admin wallet</p>
          <p className="mt-2 text-sm font-medium text-zinc-950 dark:text-white">{walletAddress}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card className="border-orange-200 bg-white dark:border-white/10 dark:bg-zinc-900/80">
          <CardHeader className="pb-3">
            <CardDescription>Total wallets</CardDescription>
            <CardTitle className="text-2xl">{totals.wallets}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-orange-200 bg-white dark:border-white/10 dark:bg-zinc-900/80">
          <CardHeader className="pb-3">
            <CardDescription>Total payments</CardDescription>
            <CardTitle className="text-2xl">{totals.payments}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-orange-200 bg-white dark:border-white/10 dark:bg-zinc-900/80">
          <CardHeader className="pb-3">
            <CardDescription>Total history rows</CardDescription>
            <CardTitle className="text-2xl">{totals.history}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-orange-200 bg-white dark:border-white/10 dark:bg-zinc-900/80">
          <CardHeader className="pb-3">
            <CardDescription>Admin logs</CardDescription>
            <CardTitle className="text-2xl">{totals.adminLogs}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-orange-200 bg-white dark:border-white/10 dark:bg-zinc-900/80">
          <CardHeader className="pb-3">
            <CardDescription>Approved volume</CardDescription>
            <CardTitle className="text-2xl">{formatAmount(totals.approvedVolume)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="border-orange-200 bg-white dark:border-white/10 dark:bg-zinc-900/80">
          <CardHeader>
            <CardTitle className="text-xl">Wallet records</CardTitle>
            <CardDescription>All tracked wallets stored in the shared registry.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-[22rem] overflow-y-auto rounded-2xl border border-orange-100 dark:border-white/10">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-orange-50 dark:bg-zinc-950">
                  <tr className="text-left text-zinc-500 dark:text-zinc-400">
                    <th className="px-4 py-3 font-medium">Wallet</th>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Latest activity</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.wallets.map((wallet) => (
                    <tr key={wallet.address} className="border-t border-orange-100 dark:border-white/10">
                      <td className="px-4 py-3 align-top text-zinc-950 dark:text-white">
                        <div className="font-medium">{wallet.displayName || wallet.username || formatWalletAddress(wallet.address)}</div>
                        <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{wallet.address}</div>
                      </td>
                      <td className="px-4 py-3 align-top capitalize text-zinc-600 dark:text-zinc-300">{wallet.role}</td>
                      <td className="px-4 py-3 align-top capitalize text-zinc-600 dark:text-zinc-300">{wallet.status}</td>
                      <td className="px-4 py-3 align-top text-zinc-600 dark:text-zinc-300">{formatMoment(wallet.latestActivityAt)}</td>
                    </tr>
                  ))}
                  {!snapshot.wallets.length ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-zinc-500 dark:text-zinc-400">
                        {isLoading ? "Loading wallets..." : "No wallet records yet."}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className="border-orange-200 bg-white dark:border-white/10 dark:bg-zinc-900/80">
          <CardHeader>
            <CardTitle className="text-xl">Payment records</CardTitle>
            <CardDescription>Latest shared payment rows available to the admin.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-[22rem] overflow-y-auto rounded-2xl border border-orange-100 dark:border-white/10">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-orange-50 dark:bg-zinc-950">
                  <tr className="text-left text-zinc-500 dark:text-zinc-400">
                    <th className="px-4 py-3 font-medium">User</th>
                    <th className="px-4 py-3 font-medium">Flow</th>
                    <th className="px-4 py-3 font-medium">Amount</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.payments.map((payment) => (
                    <tr key={payment.id} className="border-t border-orange-100 dark:border-white/10">
                      <td className="px-4 py-3 align-top text-zinc-950 dark:text-white">
                        <div className="font-medium">{payment.username || formatWalletAddress(payment.userWallet)}</div>
                        <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{formatMoment(payment.createdAt)}</div>
                      </td>
                      <td className="px-4 py-3 align-top capitalize text-zinc-600 dark:text-zinc-300">{payment.flow}</td>
                      <td className="px-4 py-3 align-top text-zinc-600 dark:text-zinc-300">{formatAmount(payment.totalPaidUsdc)}</td>
                      <td className="px-4 py-3 align-top capitalize text-zinc-600 dark:text-zinc-300">{payment.status}</td>
                    </tr>
                  ))}
                  {!snapshot.payments.length ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-zinc-500 dark:text-zinc-400">
                        {isLoading ? "Loading payments..." : "No payment records yet."}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <Card className="border-orange-200 bg-white dark:border-white/10 dark:bg-zinc-900/80 xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-xl">User bets table</CardTitle>
            <CardDescription>
              Every bet stored in the shared database, with the exact market, chosen side, wallet, amount, total charged, and payment reference.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-[24rem] overflow-y-auto rounded-2xl border border-orange-100 dark:border-white/10">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-orange-50 dark:bg-zinc-950">
                  <tr className="text-left text-zinc-500 dark:text-zinc-400">
                    <th className="px-4 py-3 font-medium">User</th>
                    <th className="px-4 py-3 font-medium">Wallet</th>
                    <th className="px-4 py-3 font-medium">Market</th>
                    <th className="px-4 py-3 font-medium">Section</th>
                    <th className="px-4 py-3 font-medium">Choice</th>
                    <th className="px-4 py-3 font-medium">Bet</th>
                    <th className="px-4 py-3 font-medium">Total paid</th>
                    <th className="px-4 py-3 font-medium">Admin</th>
                    <th className="px-4 py-3 font-medium">Result</th>
                    <th className="px-4 py-3 font-medium">Reference</th>
                    <th className="px-4 py-3 font-medium">Placed at</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.history.map((bet) => {
                    const ownerRecord = snapshot.wallets.find((w) => w.address === bet.wallet_address);
                    return (
                      <tr key={bet.id} className="border-t border-orange-100 dark:border-white/10">
                        <td className="px-4 py-3 align-top text-zinc-950 dark:text-white">
                          <div className="font-medium">{ownerRecord?.displayName || ownerRecord?.username || formatWalletAddress(bet.wallet_address)}</div>
                          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{ownerRecord?.twitterHandle || "No X profile saved"}</div>
                        </td>
                        <td className="px-4 py-3 align-top text-xs text-zinc-600 dark:text-zinc-300">
                          <span className="break-all">{bet.wallet_address}</span>
                        </td>
                        <td className="px-4 py-3 align-top text-zinc-600 dark:text-zinc-300">{bet.market_title}</td>
                        <td className="px-4 py-3 align-top text-zinc-600 dark:text-zinc-300">{bet.category_label}</td>
                        <td className="px-4 py-3 align-top text-zinc-950 dark:text-white">{bet.selection_label}</td>
                        <td className="px-4 py-3 align-top text-zinc-600 dark:text-zinc-300">{formatAmount(Number(bet.amount))}</td>
                        <td className="px-4 py-3 align-top text-zinc-600 dark:text-zinc-300">{formatAmount(Number(bet.total_charged))}</td>
                        <td className="px-4 py-3 align-top capitalize text-zinc-600 dark:text-zinc-300">{bet.admin_decision_status ?? "pending"}</td>
                        <td className="px-4 py-3 align-top text-zinc-600 dark:text-zinc-300">
                          <div className="font-medium text-zinc-950 dark:text-white">{bet.result_status ?? "open"}</div>
                        </td>
                        <td className="px-4 py-3 align-top text-xs text-zinc-600 dark:text-zinc-300">
                          <span className="break-all">{bet.payment_reference}</span>
                        </td>
                        <td className="px-4 py-3 align-top text-zinc-600 dark:text-zinc-300">{formatMoment(new Date(bet.created_at).getTime())}</td>
                      </tr>
                    );
                  })}
                  {!snapshot.history.length ? (
                    <tr>
                      <td colSpan={11} className="px-4 py-6 text-center text-zinc-500 dark:text-zinc-400">
                        {isLoading ? "Loading bets..." : "No user bets stored yet."}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className="border-orange-200 bg-white dark:border-white/10 dark:bg-zinc-900/80">
          <CardHeader>
            <CardTitle className="text-xl">Prediction history</CardTitle>
            <CardDescription>Latest history rows synced from the live user flow.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-[20rem] overflow-y-auto rounded-2xl border border-orange-100 dark:border-white/10">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-orange-50 dark:bg-zinc-950">
                  <tr className="text-left text-zinc-500 dark:text-zinc-400">
                    <th className="px-4 py-3 font-medium">User</th>
                    <th className="px-4 py-3 font-medium">Market</th>
                    <th className="px-4 py-3 font-medium">Net reward</th>
                    <th className="px-4 py-3 font-medium">Result</th>
                    <th className="px-4 py-3 font-medium">Reported</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.history.map((entry) => (
                    <tr key={entry.id} className="border-t border-orange-100 dark:border-white/10">
                      <td className="px-4 py-3 align-top text-zinc-950 dark:text-white">{formatWalletAddress(entry.wallet_address)}</td>
                      <td className="px-4 py-3 align-top text-zinc-600 dark:text-zinc-300">{entry.market_title}</td>
                      <td className="px-4 py-3 align-top text-zinc-600 dark:text-zinc-300">{formatAmount(Number(entry.net_reward))}</td>
                      <td className="px-4 py-3 align-top text-zinc-600 dark:text-zinc-300">{entry.result_status ?? "open"}</td>
                      <td className="px-4 py-3 align-top text-zinc-600 dark:text-zinc-300">{formatMoment(new Date(entry.reported_at ?? entry.created_at).getTime())}</td>
                    </tr>
                  ))}
                  {!snapshot.history.length ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-zinc-500 dark:text-zinc-400">
                        {isLoading ? "Loading history..." : "No prediction history yet."}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className="border-orange-200 bg-white dark:border-white/10 dark:bg-zinc-900/80">
          <CardHeader>
            <CardTitle className="text-xl">Admin logs</CardTitle>
            <CardDescription>Tracked admin actions stored in the shared registry.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {snapshot.adminLogs.map((log) => (
                <div key={log.id} className="rounded-2xl border border-orange-100 bg-orange-50/70 px-4 py-3 dark:border-white/10 dark:bg-zinc-950/70">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium capitalize text-zinc-950 dark:text-white">{log.action.replaceAll("_", " ")}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">{formatMoment(log.createdAt)}</p>
                  </div>
                  <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{log.details}</p>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Target: {log.targetId}</p>
                </div>
              ))}
              {!snapshot.adminLogs.length ? (
                <div className="rounded-2xl border border-dashed border-orange-200 px-4 py-6 text-center text-zinc-500 dark:border-white/10 dark:text-zinc-400">
                  {isLoading ? "Loading admin logs..." : "No admin logs yet."}
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
