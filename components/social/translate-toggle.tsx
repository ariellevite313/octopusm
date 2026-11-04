"use client";

import { useState } from "react";
import { Languages, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";

/**
 * Traduction d'un post ou d'une réponse vers la langue de l'utilisateur.
 * `onText(null)` remet le texte d'origine.
 */
export function useContentTranslation(kind: "post" | "reply", id: string) {
  const { tr, lang } = useT();
  const [text, setText] = useState<string | null>(null);
  const [cache, setCache] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (text !== null) { setText(null); return; }
    if (cache[lang]) { setText(cache[lang]); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id, lang }),
      });
      const j = await r.json().catch(() => ({})) as { text?: string; error?: string };
      if (!r.ok || !j.text) { toast.error(tr(j.error ?? "Translation failed")); return; }
      setCache((c) => ({ ...c, [lang]: j.text! }));
      setText(j.text);
    } catch {
      toast.error(tr("Translation failed"));
    } finally {
      setBusy(false);
    }
  }

  const button = (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Languages className="size-3.5" />}
      {text !== null ? tr("Show original") : tr("Translate")}
    </button>
  );

  return { text, button };
}
