"use client";

/**
 * TokenSwapJupiter — swap widget for tokens that have migrated off the bonding curve.
 * Embeds Jupiter Terminal with the token pre-selected and the same orange visual style.
 */

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

type Props = {
  mintAddress: string;
};

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Jupiter?: any;
  }
}

const JUPITER_SCRIPT = "https://terminal.jup.ag/main-v3.js";

export function TokenSwapJupiter({ mintAddress }: Props) {
  const containerId = "jupiter-terminal-" + mintAddress.slice(0, 8);
  const loaded      = useRef(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (loaded.current) return;

    const init = () => {
      if (!window.Jupiter) return;
      // Mark ready FIRST so the container div is visible before Jupiter.init()
      setReady(true);
      // Small tick to let React flush the DOM update before Jupiter mounts
      setTimeout(() => {
        try {
          window.Jupiter.init({
            displayMode:          "integrated",
            integratedTargetId:   containerId,
            defaultExplorer:      "Solscan",
            formProps: {
              fixedOutputMint:    true,
              initialOutputMint:  mintAddress,
              swapMode:           "ExactIn",
            },
            containerStyles: {
              borderRadius: "16px",
              background:   "#111111",
            },
          });
        } catch { /* ignore */ }
      }, 0);
    };

    // If already loaded (e.g. navigated back)
    if (window.Jupiter) {
      loaded.current = true;
      init();
      return;
    }

    const script    = document.createElement("script");
    script.src      = JUPITER_SCRIPT;
    script.async    = true;
    script.onload   = () => {
      loaded.current = true;
      init();
    };
    document.head.appendChild(script);

    return () => {
      try { window.Jupiter?.close?.(); } catch { /* ignore */ }
    };
  }, [containerId, mintAddress]);

  return (
    <div className="rounded-2xl overflow-hidden border border-orange-500/20 bg-[#111111]">
      {/* Loading overlay — shown until Jupiter signals it's ready */}
      {!ready && (
        <div className="flex items-center justify-center gap-2 py-12 text-white/30">
          <Loader2 className="size-4 animate-spin" />
          <span className="text-[13px]">Loading swap…</span>
        </div>
      )}
      {/* Container always in DOM; hidden only before ready so Jupiter can mount into a visible div */}
      <div
        id={containerId}
        style={{ minHeight: ready ? 420 : 0, display: ready ? "block" : "none" }}
      />
    </div>
  );
}
