"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { TaskRow } from "@/lib/supabase/types";

const TASK_TYPES = ["social", "trade", "hold", "refer", "other"];

export function AdminTasksClient({ tasks }: { tasks: TaskRow[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Create form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [externalLink, setExternalLink] = useState("");
  const [rewardOcto, setRewardOcto] = useState("100");
  const [taskType, setTaskType] = useState("social");
  const [icon, setIcon] = useState("⭐");
  const [sortOrder, setSortOrder] = useState("0");
  const [formError, setFormError] = useState("");
  const [creating, setCreating] = useState(false);

  async function apiCall(body: object, key: string) {
    setLoading(key);
    try {
      const res = await fetch("/api/admin/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? "Error");
      }
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  async function handleCreate() {
    if (!title.trim() || !rewardOcto || !taskType) {
      setFormError("Title, reward and type are required.");
      return;
    }
    setFormError("");
    setCreating(true);
    try {
      const res = await fetch("/api/admin/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          title: title.trim(),
          description: description.trim() || null,
          externalLink: externalLink.trim() || null,
          rewardOcto: Number(rewardOcto),
          taskType,
          icon: icon.trim() || null,
          sortOrder: Number(sortOrder) || 0,
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? "Error");
      }
      setTitle("");
      setDescription("");
      setExternalLink("");
      setRewardOcto("100");
      setTaskType("social");
      setIcon("⭐");
      setSortOrder("0");
      setShowForm(false);
      router.refresh();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Error");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Add button */}
      <div className="flex justify-end">
        <Button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-full bg-orange-500 text-white hover:bg-orange-400"
          size="sm"
        >
          <Plus className="mr-1 size-4" />
          New Task
        </Button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="rounded-2xl border border-orange-200 bg-orange-50/60 p-5 dark:border-orange-900/40 dark:bg-orange-950/10 space-y-3">
          <p className="text-sm font-semibold">Create a task</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Task title *"
                className="border-orange-200 bg-white dark:border-white/10 dark:bg-zinc-950"
              />
            </div>
            <div className="sm:col-span-2">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description (optional)"
                className="min-h-16 border-orange-200 bg-white dark:border-white/10 dark:bg-zinc-950"
              />
            </div>
            <Input
              value={externalLink}
              onChange={(e) => setExternalLink(e.target.value)}
              placeholder="External link (optional)"
              className="border-orange-200 bg-white dark:border-white/10 dark:bg-zinc-950"
            />
            <Input
              type="number"
              value={rewardOcto}
              onChange={(e) => setRewardOcto(e.target.value)}
              placeholder="OCTO Reward *"
              min={1}
              className="border-orange-200 bg-white dark:border-white/10 dark:bg-zinc-950"
            />
            <div className="flex flex-wrap gap-2">
              {TASK_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTaskType(t)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors ${
                    taskType === t
                      ? "border-orange-400 bg-orange-500 text-white"
                      : "border-border text-muted-foreground hover:border-orange-300"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <Input
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="Emoji icon (e.g. ⭐)"
              className="border-orange-200 bg-white dark:border-white/10 dark:bg-zinc-950"
            />
            <Input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              placeholder="Sort order (0 = first)"
              min={0}
              className="border-orange-200 bg-white dark:border-white/10 dark:bg-zinc-950"
            />
          </div>
          {formError && <p className="text-sm text-red-500">{formError}</p>}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => { setShowForm(false); setFormError(""); }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="rounded-full bg-orange-500 text-white hover:bg-orange-400"
              disabled={creating}
              onClick={handleCreate}
            >
              {creating ? <LoaderCircle className="size-4 animate-spin" /> : "Create"}
            </Button>
          </div>
        </div>
      )}

      {/* Tasks table */}
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40">
            <tr>
              {["Icon", "Title", "Type", "Reward", "Status", "Actions"].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-medium text-muted-foreground"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {tasks.map((task) => (
              <tr key={task.id} className="hover:bg-muted/20">
                <td className="px-4 py-3 text-xl">{task.icon ?? "—"}</td>
                <td className="px-4 py-3">
                  <p className="font-medium">{task.title}</p>
                  {task.description && (
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {task.description}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize">
                    {task.task_type}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 font-semibold text-orange-600">
                    <span>{task.reward_octo.toLocaleString()}</span>
                    <img src="/octo-coin.png" alt="OCTO" width={14} height={14} className="rounded-full" />
                  </div>
                </td>
                <td className="px-4 py-3">
                  {task.is_active ? (
                    <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 text-xs dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      Inactive
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={task.is_active}
                      disabled={!!loading}
                      onCheckedChange={(v) =>
                        apiCall({ action: "toggle", taskId: task.id, isActive: v }, task.id + "toggle")
                      }
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!!loading}
                      className="rounded-full px-2 text-red-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/20"
                      onClick={() => {
                        if (!window.confirm("Delete this task? This cannot be undone.")) return;
                        apiCall({ action: "delete", taskId: task.id }, task.id + "delete");
                      }}
                    >
                      {loading === task.id + "delete" ? (
                        <LoaderCircle className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {tasks.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No tasks yet. Create one above.
          </p>
        )}
      </div>
    </div>
  );
}
