"use client";

import { type WalletInfo, type WalletType, WALLET_COLORS } from "@/lib/wallet/adapters";

type Props = {
  wallets: WalletInfo[];
  onSelect: (type: WalletType) => void;
  onClose: () => void;
};

function isMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}

export function WalletSelectDialog({ wallets, onSelect, onClose }: Props) {
  const installed = wallets.filter((w) => w.detected);
  const notInstalled = wallets.filter((w) => !w.detected);
  const mobile = isMobile();

  function handleSelect(wallet: WalletInfo) {
    if (wallet.detected) {
      onSelect(wallet.type);
      return;
    }
    // On mobile: redirect into the wallet app via deep link
    if (mobile) {
      const currentUrl = window.location.href;
      window.location.href = wallet.mobileDeepLink(currentUrl);
      return;
    }
    // On desktop: open download page in new tab
    window.open(wallet.downloadUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-5 shadow-2xl">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Connect your wallet</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Installed wallets */}
        {installed.length > 0 && (
          <div className="mb-4 space-y-2">
            {installed.map((w) => (
              <WalletItem key={w.type} wallet={w} onClick={() => handleSelect(w)} />
            ))}
          </div>
        )}

        {/* Not installed wallets */}
        {notInstalled.length > 0 && (
          <>
            {installed.length > 0 && (
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {mobile ? "Open in app" : "Not installed"}
              </p>
            )}
            <div className="space-y-2">
              {notInstalled.map((w) => (
                <WalletItem key={w.type} wallet={w} onClick={() => handleSelect(w)} mobile={mobile} />
              ))}
            </div>
          </>
        )}

        <p className="mt-4 text-center text-xs text-muted-foreground">
          New to Solana?{" "}
          <a
            href="https://phantom.app"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Get started with Phantom
          </a>
        </p>
      </div>
    </div>
  );
}

function WalletItem({
  wallet,
  onClick,
  mobile,
}: {
  wallet: WalletInfo;
  onClick: () => void;
  mobile?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl border border-border bg-secondary/40 px-4 py-3 text-left transition-colors hover:bg-secondary"
    >
      {/* Logo with initial fallback */}
      <div className={`relative size-9 shrink-0 rounded-xl overflow-hidden flex items-center justify-center ${WALLET_COLORS[wallet.type] ?? "bg-muted"}`}>
        <span className="text-white text-sm font-bold select-none">{wallet.name[0]}</span>
        <img
          src={wallet.icon}
          alt={wallet.name}
          className="absolute inset-0 size-9 rounded-xl object-contain"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
      </div>

      <div className="flex-1">
        <p className="text-sm font-semibold text-foreground">{wallet.name}</p>
        <p className="text-xs text-muted-foreground">
          {wallet.detected
            ? "Detected"
            : mobile
            ? "Tap to open app"
            : "Click to install"}
        </p>
      </div>

      {wallet.detected && (
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
          Ready
        </span>
      )}
      {!wallet.detected && mobile && (
        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
          Open
        </span>
      )}
    </button>
  );
}
