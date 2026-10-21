/**
 * OAuth 2.1 minimal pour le MCP (code d'autorisation + PKCE S256, clients publics, enregistrement dynamique).
 */
import { createHash, randomBytes } from "node:crypto";

export const SCOPES = {
  read: "Read markets, tokens, profiles and the feed",
  social: "Post, reply, like, follow and edit your profile",
  approvals: "Suggest bets and trades that you confirm yourself",
} as const;
export type Scope = keyof typeof SCOPES;
export const ALL_SCOPES = Object.keys(SCOPES) as Scope[];

export const ACCESS_TTL_S = 3600;
export const REFRESH_TTL_S = 30 * 24 * 3600;
export const CODE_TTL_S = 600;

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const newToken = (prefix: string) => `${prefix}_${randomBytes(32).toString("base64url")}`;

/** PKCE S256 : base64url(sha256(verifier)) === challenge */
export function pkceOk(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  return createHash("sha256").update(verifier).digest("base64url") === challenge;
}

export function parseScopes(raw: string | null | undefined): Scope[] {
  const asked = (raw ?? "").split(/\s+/).filter(Boolean);
  const valid = asked.filter((s): s is Scope => (ALL_SCOPES as string[]).includes(s));
  return valid.length ? [...new Set<Scope>(["read", ...valid])] : [...ALL_SCOPES];
}

/** URI de redirection acceptée : https, ou http sur localhost (applications locales). */
export function validRedirect(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.hash) return false;
    if (u.protocol === "https:") return true;
    if (u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)) return true;
    return false;
  } catch { return false; }
}

export function origin(req: Request): string {
  const u = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto") ?? u.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? u.host;
  return `${proto}://${host}`;
}

export function authServerMetadata(base: string) {
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/api/oauth/token`,
    registration_endpoint: `${base}/api/oauth/register`,
    revocation_endpoint: `${base}/api/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ALL_SCOPES,
  };
}

export function resourceMetadata(base: string) {
  return {
    resource: `${base}/mcp/connect`,
    authorization_servers: [base],
    scopes_supported: ALL_SCOPES,
    bearer_methods_supported: ["header"],
    resource_name: "OMdotfun",
  };
}
