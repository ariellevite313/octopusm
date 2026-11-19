import { describe, expect, it, vi } from "vitest";

// Base simulée : un humain avec deux wallets d'IA enregistrés à des dates différentes
const rows = [
  { id: "b", owner: "human", client_id: "om_new", sol_address: "NEW", created_at: "2026-11-18" },
  { id: "a", owner: "human", client_id: "om_old", sol_address: "OLD", created_at: "2026-11-10" },
  { id: "c", owner: "other", client_id: "om_x", sol_address: "OTHER", created_at: "2026-11-01" },
];
vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: () => {
      let f: Record<string, string> = {};
      const q = {
        select: () => q,
        eq: (k: string, v: string) => { f[k] = v; return q; },
        order: () => q,
        limit: () => q,
        maybeSingle: async () => {
          const r = rows.filter((x) => Object.entries(f).every(([k, v]) => (x as Record<string, string>)[k] === v)).sort((a, b) => a.created_at.localeCompare(b.created_at));
          f = {};
          return { data: r[0] ?? null };
        },
      };
      return q;
    },
  }),
}));

import { walletForConnection } from "@/lib/agent-wallet/server";

describe("wallet de l'IA : toujours la même adresse", () => {
  it("renvoie le même wallet quelle que soit l'application IA ou la reconnexion", async () => {
    const a = await walletForConnection("human", "om_new");
    const b = await walletForConnection("human", "om_totally_new_registration");
    const c = await walletForConnection("human");
    expect(a?.sol_address).toBe("OLD");
    expect(b?.sol_address).toBe("OLD");
    expect(c?.sol_address).toBe("OLD");
  });
  it("ne mélange pas les humains, et renvoie rien s'il n'y en a pas encore", async () => {
    expect((await walletForConnection("other", "om_x"))?.sol_address).toBe("OTHER");
    expect(await walletForConnection("nobody", "om_x")).toBeNull();
  });
});
