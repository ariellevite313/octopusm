import { vi } from "vitest";

// ── Mock next/headers (cookies) ───────────────────────────────────────────────
vi.mock("next/headers", () => ({
  cookies: vi.fn(() =>
    Promise.resolve({
      getAll: () => [],
      set: vi.fn(),
    })
  ),
}));

// ── Mock next/server — keep NextResponse real ─────────────────────────────────
// NextResponse is available natively in Node 18+ via undici; we just need to
// make sure the module resolves. If it doesn't, uncomment the block below.
// vi.mock("next/server", () => {
//   const { Response } = globalThis;
//   class NextResponse extends Response {
//     static json(body: unknown, init?: ResponseInit) {
//       return new NextResponse(JSON.stringify(body), {
//         ...init,
//         headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
//       });
//     }
//   }
//   return { NextResponse };
// });

// ── Global env stubs ──────────────────────────────────────────────────────────
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
process.env.SUPABASE_SERVICE_KEY = "test-service-key";
process.env.NEXT_PUBLIC_SITE_URL = "https://omdot.fun";
// Required by confirm/route.ts verifyTransaction — without this it returns false immediately
process.env.SOLANA_RPC_URL = "https://mock-rpc.test";
// Required by lib/solana/dbc.ts — dummy values so any test that imports dbc without mocking
// gets a clear error rather than "DBC_CONFIG_KEY is not set"
process.env.DBC_CONFIG_KEY         = "11111111111111111111111111111111";
// 64 zero-bytes base58-encoded — invalid key but passes the env check
process.env.PLATFORM_WALLET_SECRET = "1111111111111111111111111111111111111111111111111111111111111111111111111111111111111111";
