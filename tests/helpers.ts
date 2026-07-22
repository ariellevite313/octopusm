import { vi } from "vitest";

// ── Request factory ───────────────────────────────────────────────────────────

export function makeRequest(body: unknown, method = "POST"): Request {
  return new Request("https://omdot.fun/api/test", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function makeGetRequest(): Request {
  return new Request("https://omdot.fun/api/test", { method: "GET" });
}

// ── Supabase mock builder ─────────────────────────────────────────────────────
//
// Usage:
//   const { mockAdmin, mockUser } = buildSupaMock({ user: { wallet_address: "abc" } });
//   vi.mock("@/lib/supabase/server", () => ({ createClient: mockUser, createAdminClient: mockAdmin }));
//
// Each table call can be customised:
//   mockAdmin.returnFor("mutuel_markets", { data: [{ id: "m1", status: "active" }] });

export interface SupaTableMock {
  data: unknown[] | null;
  error: null | { message: string; code?: string };
}

export class SupaMockBuilder {
  private tableMap: Record<string, SupaTableMock> = {};
  private _user: { wallet_address?: string } | null = null;
  private _rpcMap: Record<string, unknown> = {};

  setUser(u: { wallet_address?: string } | null) {
    this._user = u;
    return this;
  }

  setRpc(fn: string, data: unknown) {
    this._rpcMap[fn] = data;
    return this;
  }

  returnFor(table: string, result: SupaTableMock) {
    this.tableMap[table] = result;
    return this;
  }

  /** Returns a createClient / createAdminClient compatible mock */
  buildClient() {
    const self = this;
    const client = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: self._user
              ? { user_metadata: self._user }
              : null,
          },
          error: null,
        }),
      },
      rpc: vi.fn((fn: string) =>
        Promise.resolve({ data: self._rpcMap[fn] ?? null, error: null })
      ),
      from: vi.fn((table: string) => {
        const result: SupaTableMock = self.tableMap[table] ?? { data: [], error: null };
        const chain: Record<string, unknown> = {};
        const chainFn = () => chain;
        chain.select   = vi.fn(chainFn);
        chain.insert   = vi.fn(chainFn);   // chainable: .insert().select().single()
        chain.update   = vi.fn(chainFn);
        chain.delete   = vi.fn(chainFn);
        chain.upsert   = vi.fn(chainFn);   // chainable: .upsert().select()
        chain.eq       = vi.fn(chainFn);
        chain.neq      = vi.fn(chainFn);
        chain.in       = vi.fn(chainFn);
        chain.not      = vi.fn(chainFn);
        chain.is       = vi.fn(chainFn);
        chain.limit    = vi.fn(chainFn);
        chain.order    = vi.fn(chainFn);
        chain.single   = vi.fn(() =>
          Promise.resolve({ data: Array.isArray(result.data) ? (result.data[0] ?? null) : result.data, error: result.error })
        );
        chain.maybeSingle = vi.fn(() =>
          Promise.resolve({ data: Array.isArray(result.data) ? (result.data[0] ?? null) : result.data, error: result.error })
        );
        // Make the chain itself awaitable (resolves to result)
        Object.defineProperty(chain, "then", {
          get() {
            return (resolve: (v: SupaTableMock) => void) => resolve(result);
          },
        });
        return chain;
      }),
    };
    return client;
  }

  /** Wrap in async factory (createClient returns a promise) */
  buildAsyncFactory() {
    const client = this.buildClient();
    return vi.fn(() => Promise.resolve(client));
  }

  /** Wrap in sync factory (createAdminClient is sync) */
  buildSyncFactory() {
    const client = this.buildClient();
    return vi.fn(() => client);
  }
}

/** Shorthand: authenticated user mock */
export function authedMock(wallet = "wallet123abc") {
  return new SupaMockBuilder().setUser({ wallet_address: wallet });
}

/** Shorthand: unauthenticated mock */
export function unauthedMock() {
  return new SupaMockBuilder().setUser(null);
}

/** Shorthand: authenticated admin mock (user + is_admin rpc = true) */
export function adminAuthedMock(wallet = "AdminWallet") {
  return new SupaMockBuilder()
    .setUser({ wallet_address: wallet })
    .setRpc("is_admin", true);
}

/** Shorthand: authenticated non-admin mock (is_admin rpc = false) */
export function nonAdminMock(wallet = "RegularWallet") {
  return new SupaMockBuilder()
    .setUser({ wallet_address: wallet })
    .setRpc("is_admin", false);
}

/** Parse JSON body from a Response */
export async function json(res: Response) {
  return res.json() as Promise<Record<string, unknown>>;
}
