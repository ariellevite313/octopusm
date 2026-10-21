import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { AdminAction, BanForm } from "@/components/admin/admin-actions";

export const metadata: Metadata = { title: "Moderation — Admin" };
export const revalidate = 0;

const short = (w: string) => `${w.slice(0, 6)}…${w.slice(-4)}`;

export default async function AdminModerationPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const [{ data: banned }, { data: imgs }] = await Promise.all([
    admin.from("banned_wallets").select("wallet, reason, created_at").order("created_at", { ascending: false }).limit(200),
    admin.from("posts").select("id, author, body, images, created_at, hidden").eq("images_checked", false).eq("hidden", false).order("created_at", { ascending: false }).limit(60),
  ]);
  const posts = ((imgs ?? []) as { id: string; author: string; body: string; images: string[]; created_at: string }[]).filter((p) => p.images?.length);
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold">Moderation</h1>
        <p className="mt-1 text-sm text-muted-foreground">Images are checked automatically when OPENAI_API_KEY is set; anything not checked waits here.</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Ban a wallet</h2>
        <BanForm />
        <div className="divide-y divide-border rounded-2xl border border-border bg-card">
          {(banned ?? []).length === 0 && <p className="p-4 text-sm text-muted-foreground">No banned wallet.</p>}
          {((banned ?? []) as { wallet: string; reason: string | null; created_at: string }[]).map((b) => (
            <div key={b.wallet} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="font-mono text-xs text-foreground">{short(b.wallet)}</p>
                <p className="truncate text-xs text-muted-foreground">{b.reason ?? "No reason"} · {new Date(b.created_at).toLocaleDateString()}</p>
              </div>
              <AdminAction url="/api/admin/moderation" body={{ action: "unban", wallet: b.wallet }} label="Unban" />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Images to review ({posts.length})</h2>
        {posts.length === 0 && <p className="text-sm text-muted-foreground">Nothing to review.</p>}
        {posts.map((p) => (
          <div key={p.id} className="rounded-2xl border border-border bg-card p-4">
            <p className="font-mono text-xs text-muted-foreground">{short(p.author)} · {new Date(p.created_at).toLocaleString()}</p>
            {p.body && <p className="mt-2 whitespace-pre-wrap text-sm">{p.body}</p>}
            <div className="mt-2 flex gap-2">
              {p.images.map((u) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={u} src={u} alt="" className="h-32 rounded-lg object-cover" />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <AdminAction url="/api/admin/moderation" body={{ action: "image_ok", post_id: p.id }} label="Approve" />
              <AdminAction url={`/api/admin/reports/${p.id}`} body={{ action: "delete" }} label="Delete post" danger confirm="Delete this post and its images?" />
              <AdminAction url="/api/admin/moderation" body={{ action: "ban", wallet: p.author, reason: "Image moderation" }} label="Ban author" danger confirm="Ban this wallet?" />
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
