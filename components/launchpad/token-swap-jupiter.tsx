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
      setReady(true);
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
      loaded.current = true; // mark loaded only after script is ready
      init();
    };
    document.head.appendChild(script);

    return () => {
      try { window.Jupiter?.close?.(); } catch { /* ignore */ }
    };
  }, [containerId, mintAddress]);

  return (
    <div className="rounded-2xl overflow-hidden border border-orange-500/20 bg-[#111111]">
      {!ready && (
        <div className="flex items-center justify-center gap-2 py-12 text-white/30">
          <Loader2 className="size-4 animate-spin" />
          <span className="text-[13px]">Loading swap…</span>
        </div>
      )}
      <div
        id={containerId}
        className={ready ? "block" : "hidden"}
        style={{ minHeight: 420 }}
      />
    </div>
  );
}
