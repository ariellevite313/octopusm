"use client";

import { useState, useCallback } from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";

export function CopyMint({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  const { t } = useT();

  const copy = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success(t.caCopied, {
        description: `${address.slice(0, 8)}…${address.slice(-6)}`,
        duration: 2000,
      });
    });
  }, [address, t]);

  return (
    <button
      onClick={copy}
      className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
      title="Copy address"
    >
      {copied
        ? <Check className="size-3 text-emerald-400" />
        : <Copy className="size-3" />
      }
    </button>
  );
}
