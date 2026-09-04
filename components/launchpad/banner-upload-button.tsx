"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Props = {
  tokenId: string;
};

export function BannerUploadButton({ tokenId }: Props) {
  const inputRef  = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const router    = useRouter();

  const handleFile = async (file: File) => {
    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/launchpad/${tokenId}/banner`, {
        method: "POST",
        body:   form,
      });
      const data = await res.json() as { banner_url?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "Upload failed");
      toast.success("Banner updated");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) { void handleFile(f); e.target.value = ""; } }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-full bg-black/40 hover:bg-black/60 text-white/80 hover:text-white transition-colors backdrop-blur-sm border border-white/20"
      >
        {loading ? <Loader2 className="size-3 animate-spin" /> : <ImagePlus className="size-3" />}
        {loading ? "Uploading…" : "Edit banner"}
      </button>
    </>
  );
}
