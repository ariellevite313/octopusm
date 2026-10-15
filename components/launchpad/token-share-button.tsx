"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { ShareSheet, TOKEN_PERKS } from "@/components/shared/share-sheet";

interface Props {
  id:      string;
  name:    string;
  ticker:  string;
}

export function TokenShareButton({ id, name, ticker }: Props) {
  const { tr } = useT();
  const [open, setOpen] = useState(false);
  const text = tr("Check out ${ticker} — {name} on OMdotfun Launchpad!", { ticker, name });

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Share2 className="size-3.5" />
        {tr("Share")}
      </button>
      <ShareSheet
        open={open}
        onClose={() => setOpen(false)}
        images={[`/launchpad/${id}/opengraph-image`]}
        text={text}
        perks={TOKEN_PERKS}
      />
    </>
  );
}
