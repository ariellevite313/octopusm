"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ExternalLink, LoaderCircle, Plus, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { parseMarketOptions } from "@/lib/market/utils";
import type { PredictionMarketRow } from "@/lib/supabase/types";

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

// ─── Create market form ───────────────────────────────────────────────────────

const CATEGORIES = ["sports", "crypto", "politics", "entertainment", "science", "other"];
const MARKET_TYPES = ["yes-no", "threshold", "three-way"] as const;
const VISUAL_TYPES = ["simple", "vs"] as const;

type CreateForm = {
  title: string;
  category_id: string;
  market_type: "yes-no" | "threshold" | "three-way";
  visual_type: "simple" | "vs";
  resolution_label: string;
  resolution_criteria: string;
  event_date_label: string;
  event_start_at: string;
  options: { id: string; label: string; oddsMultiplier: number }[];
  // vs mode
  left_name: string;
  left_image: string;
  right_name: string;
  right_image: string;
  // simple mode
  single_name: string;
  single_image: string;
};

const DEFAULT_FORM: CreateForm = {
  title: "",
  category_id: "crypto",
  market_type: "yes-no",
  visual_type: "simple",
  resolution_label: "",
  resolution_criteria: "",
  event_date_label: "",
  event_start_at: "",
  options: [
    { id: "yes", label: "Yes", oddsMultiplier: 2 },
    { id: "no",  label: "No",  oddsMultiplier: 2 },
  ],
  left_name: "", left_image: "",
  right_name: "", right_image: "",
  single_name: "", single_image: "",
};

function CreateMarketDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState<CreateForm>(DEFAULT_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function set<K extends keyof CreateForm>(key: K, val: CreateForm[K]) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function setOption(i: number, field: "label" | "oddsMultiplier", val: string | number) {
    setForm((f) => {
      const opts = [...f.options];
      opts[i] = { ...opts[i], [field]: val };
      return { ...f, options: opts };
    });
  }

  function addOption() {
    setForm((f) => ({
      ...f,
      options: [...f.options, { id: `opt_${Date.now()}`, label: "", oddsMultiplier: 2 }],
    }));
  }

  function removeOption(i: number) {
    setForm((f) => ({ ...f, options: f.options.filter((_, idx) => idx !== i) }));
  }

  function changeMarketType(t: CreateForm["market_type"]) {
    const defaults: Record<string, { id: string; label: string; oddsMultiplier: number }[]> = {
      "yes-no":    [{ id: "yes", label: "Yes", oddsMultiplier: 2 }, { id: "no", label: "No", oddsMultiplier: 2 }],
      "threshold": [{ id: "over", label: "Over", oddsMultiplier: 2 }, { id: "under", label: "Under", oddsMultiplier: 2 }],
      "three-way": [{ id: "win", label: "Win", oddsMultiplier: 3 }, { id: "draw", label: "Draw", oddsMultiplier: 4 }, { id: "lose", label: "Lose", oddsMultiplier: 3 }],
    };
    setForm((f) => ({ ...f, market_type: t, options: defaults[t] ?? f.options }));
  }

  async function handleCreate() {
    if (!form.title.trim()) { setError("Title is required."); return; }
    if (form.options.length < 2) { setError("At least 2 options required."); return; }
    if (form.options.some((o) => !o.label.trim())) { setError("All options need a label."); return; }

    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/markets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          title: form.title.trim(),
          category_id: form.category_id,
          market_type: form.market_type,
          visual_type: form.visual_type,
          resolution_label: form.resolution_label.trim() || form.title.trim(),
          resolution_criteria: form.resolution_criteria.trim() || null,
          event_date_label: form.event_date_label.trim() || null,
          event_start_at: form.event_start_at || null,
          options: form.options.map((o) => ({
            id: o.id,
            label: o.label.trim(),
            oddsMultiplier: Number(o.oddsMultiplier),
          })),
          left_competitor_name: form.left_name.trim() || null,
          left_competitor_image_src: form.left_image.trim() || null,
          right_competitor_name: form.right_name.trim() || null,
          right_competitor_image_src: form.right_image.trim() || null,
          single_name: form.single_name.trim() || null,
          single_image_src: form.single_image.trim() || null,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Error");
      setForm(DEFAULT_FORM);
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto border-border">
        <DialogHeader>
          <DialogTitle>Create Market</DialogTitle>
          <DialogDescription>Add a new prediction market.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          {/* Title */}
          <div>
            <label className="mb-1 block font-semibold text-muted-foreground">Title *</label>
            <input
              className="w-full rounded-xl border border-border bg-card px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400"
              placeholder="Will BTC reach $100k by end of 2025?"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
            />
          </div>

          {/* Category + type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block font-semibold text-muted-foreground">Category</label>
              <select
                className="w-full rounded-xl border border-border bg-card px-3 py-2 capitalize focus:outline-none focus:ring-2 focus:ring-orange-400"
                value={form.category_id}
                onChange={(e) => set("category_id", e.target.value)}
              >
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block font-semibold text-muted-foreground">Market type</label>
              <select
                className="w-full rounded-xl border border-border bg-card px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400"
                value={form.market_type}
                onChange={(e) => changeMarketType(e.target.value as CreateForm["market_type"])}
              >
                {MARKET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* Visual type */}
          <div>
            <label className="mb-1 block font-semibold text-muted-foreground">Visual style</label>
            <div className="flex gap-2">
              {VISUAL_TYPES.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => set("visual_type", v)}
                  className={`flex-1 rounded-xl border py-2 text-xs font-semibold capitalize transition-colors ${
                    form.visual_type === v
                      ? "border-orange-400 bg-orange-50 text-orange-700 dark:bg-orange-950/20 dark:text-orange-300"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Visual fields */}
          {form.visual_type === "vs" ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block font-semibold text-muted-foreground">Left name</label>
                <input className="w-full rounded-xl border border-border bg-card px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400" placeholder="Team A" value={form.left_name} onChange={(e) => set("left_name", e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block font-semibold text-muted-foreground">Right name</label>
                <input className="w-full rounded-xl border border-border bg-card px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400" placeholder="Team B" value={form.right_name} onChange={(e) => set("right_name", e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block font-semibold text-muted-foreground">Left image URL</label>
                <input className="w-full rounded-xl border border-border bg-card px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400" placeholder="https://..." value={form.left_image} onChange={(e) => set("left_image", e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block font-semibold text-muted-foreground">Right image URL</label>
                <input className="w-full rounded-xl border border-border bg-card px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400" placeholder="https://..." value={form.right_image} onChange={(e) => set("right_image", e.target.value)} />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block font-semibold text-muted-foreground">Subject name</label>
                <input className="w-full rounded-xl border border-border bg-card px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400" placeholder="Bitcoin" value={form.single_name} onChange={(e) => set("single_name", e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block font-semibold text-muted-foreground">Subject image URL</label>
                <input className="w-full rounded-xl border border-border bg-card px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400" placeholder="https://..." value={form.single_image} onChange={(e) => set("single_image", e.target.value)} />
              </div>
            </div>
          )}

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block font-semibold text-muted-foreground">Event date label</label>
              <input className="w-full rounded-xl border border-border bg-card px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400" placeholder="June 15, 2025" value={form.event_date_label} onChange={(e) => set("event_date_label", e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block font-semibold text-muted-foreground">Event start (ISO)</label>
              <input type="datetime-local" className="w-full rounded-xl border border-border bg-card px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400" value={form.event_start_at} onChange={(e) => set("event_start_at", e.target.value)} />
            </div>
          </div>

          {/* Resolution label */}
          <div>
            <label className="mb-1 block font-semibold text-muted-foreground">Resolution label</label>
            <input className="w-full rounded-xl border border-border bg-card px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400" placeholder="Same as title by default" value={form.resolution_label} onChange={(e) => set("resolution_label", e.target.value)} />
          </div>

          {/* Resolution criteria */}
          <div>
            <label className="mb-1 block font-semibold text-muted-foreground">
              Resolution criteria <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <textarea
              rows={3}
              className="w-full resize-none rounded-xl border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              placeholder="This market resolves YES if… Data source: …"
              value={form.resolution_criteria}
              onChange={(e) => set("resolution_criteria", e.target.value)}
            />
          </div>

          {/* Options */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="font-semibold text-muted-foreground">Options</label>
              <button type="button" onClick={addOption} className="flex items-center gap-1 text-xs font-semibold text-orange-500 hover:text-orange-400">
                <Plus className="size-3" /> Add option
              </button>
            </div>
            <div className="space-y-2">
              {form.options.map((opt, i) => (
                <div key={opt.id} className="flex items-center gap-2">
                  <input
                    className="flex-1 rounded-xl border border-border bg-card px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400"
                    placeholder={`Option ${i + 1}`}
                    value={opt.label}
                    onChange={(e) => setOption(i, "label", e.target.value)}
                  />
                  <input
                    type="number"
                    className="w-16 rounded-xl border border-border bg-card px-2 py-2 text-center focus:outline-none focus:ring-2 focus:ring-orange-400"
                    placeholder="x2"
                    min="1"
                    step="0.1"
                    value={opt.oddsMultiplier}
                    onChange={(e) => setOption(i, "oddsMultiplier", parseFloat(e.target.value) || 2)}
                  />
                  {form.options.length > 2 && (
                    <button type="button" onClick={() => removeOption(i)} className="text-muted-foreground hover:text-destructive">
                      <X className="size-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={onClose}>Cancel</Button>
            <Button
              className="flex-1 rounded-xl bg-orange-500 text-white hover:bg-orange-400"
              disabled={loading}
              onClick={handleCreate}
            >
              {loading ? <LoaderCircle className="size-4 animate-spin" /> : "Create Market"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

export function AdminMarketsClient({ markets }: { markets: PredictionMarketRow[] }) {
  const router = useRouter();
  const [resolving, setResolving] = useState<PredictionMarketRow | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "resolved">("all");
  const [showCreate, setShowCreate] = useState(false);
  const [page, setPage] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<PredictionMarketRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const filtered = markets.filter((m) => {
    if (filter === "active") return m.is_active && !m.is_resolved;
    if (filter === "resolved") return m.is_resolved;
    return true;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const safePage = Math.min(page, Math.max(0, totalPages - 1));
  const slice = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  function changeFilter(f: "all" | "active" | "resolved") {
    setFilter(f);
    setPage(0);
  }

  async function handleAction(
    action: "resolve" | "toggle_active",
    market: PredictionMarketRow,
    extra?: object
  ) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/markets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, marketId: market.id, ...extra }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Error");
      router.refresh();
      setResolving(null);
      setSelectedOutcome("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch("/api/admin/markets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", marketId: deleteTarget.id }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Error");
      setDeleteTarget(null);
      router.refresh();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Error");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {([
            ["all",      `All (${markets.length})`],
            ["active",   `Active (${markets.filter((m) => m.is_active && !m.is_resolved).length})`],
            ["resolved", `Resolved (${markets.filter((m) => m.is_resolved).length})`],
          ] as const).map(([f, label]) => (
            <Button
              key={f}
              variant="outline"
              size="sm"
              onClick={() => changeFilter(f)}
              className={`rounded-full text-xs ${filter === f ? "border-orange-400 bg-orange-500 text-white hover:bg-orange-400" : "border-border"}`}
            >
              {label}
            </Button>
          ))}
        </div>
        <Button
          size="sm"
          onClick={() => setShowCreate(true)}
          className="rounded-full bg-orange-500 text-white hover:bg-orange-400"
        >
          <Plus className="mr-1 size-3" /> New Market
        </Button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40">
            <tr>
              {["Title", "Category", "Status", "Created", "Actions"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {slice.map((market) => (
              <tr key={market.id} className="hover:bg-muted/20">
                <td className="px-4 py-3">
                  <p className="line-clamp-2 max-w-xs font-medium leading-5">{market.title}</p>
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize">{market.category_id}</span>
                </td>
                <td className="px-4 py-3">
                  {market.is_resolved ? (
                    <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">Resolved</Badge>
                  ) : market.is_active ? (
                    <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">Active</Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(market.created_at)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {!market.is_resolved && (
                      <>
                        <Button
                          size="sm" variant="outline"
                          className="rounded-full border-emerald-300 text-emerald-700 text-xs hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300"
                          onClick={() => { setResolving(market); setSelectedOutcome(""); setError(""); }}
                        >
                          <CheckCircle2 className="mr-1 size-3" /> Resolve
                        </Button>
                        <Button
                          size="sm" variant="outline"
                          className="rounded-full text-xs border-border"
                          onClick={() => handleAction("toggle_active", market, { isActive: !market.is_active })}
                        >
                          {market.is_active ? "Deactivate" : "Activate"}
                        </Button>
                      </>
                    )}
                    <a href={`/prediction/${market.slug ?? market.id}`} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="ghost" className="rounded-full px-2">
                        <ExternalLink className="size-3" />
                      </Button>
                    </a>
                    <Button
                      size="sm" variant="ghost"
                      className="rounded-full px-2 text-red-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/20"
                      onClick={() => { setDeleteTarget(market); setDeleteError(""); }}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">No markets.</p>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={safePage === 0}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-xs text-muted-foreground">{safePage + 1} / {totalPages}</span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={safePage === totalPages - 1}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}

      {/* Resolve dialog */}
      <Dialog open={!!resolving} onOpenChange={(o) => { if (!o) { setResolving(null); setError(""); } }}>
        <DialogContent className="max-w-md border-border">
          <DialogHeader>
            <DialogTitle>Resolve Market</DialogTitle>
            <DialogDescription className="line-clamp-2">{resolving?.title}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm font-medium">Select the winning outcome:</p>
            {resolving &&
              parseMarketOptions(resolving.options).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSelectedOutcome(opt.id)}
                  className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition ${
                    selectedOutcome === opt.id
                      ? "border-emerald-400 bg-emerald-50 font-semibold text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300"
                      : "border-border hover:border-orange-300 hover:bg-muted/40"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => { setResolving(null); setError(""); }}>Cancel</Button>
              <Button
                className="flex-1 rounded-xl bg-emerald-500 text-white hover:bg-emerald-400"
                disabled={!selectedOutcome || loading}
                onClick={() => resolving && handleAction("resolve", resolving, { outcomeId: selectedOutcome })}
              >
                {loading ? <LoaderCircle className="size-4 animate-spin" /> : "Confirm"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) { setDeleteTarget(null); setDeleteError(""); } }}>
        <DialogContent className="max-w-md border-border">
          <DialogHeader>
            <DialogTitle>Delete Market</DialogTitle>
            <DialogDescription className="line-clamp-2">{deleteTarget?.title}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This action is irreversible. All bets and history associated with this market will also be deleted.
            </p>
            {deleteError && <p className="text-sm text-red-500">{deleteError}</p>}
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1 rounded-xl"
                onClick={() => { setDeleteTarget(null); setDeleteError(""); }}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 rounded-xl bg-red-500 text-white hover:bg-red-400"
                disabled={deleting}
                onClick={handleDelete}
              >
                {deleting ? <LoaderCircle className="size-4 animate-spin" /> : "Delete Market"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create dialog */}
      <CreateMarketDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => router.refresh()}
      />
    </>
  );
}
