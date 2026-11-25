import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Middleware Next.js:
 * 1. Refreshes the Supabase session automatically (JWT renewal)
 * 2. Protects private routes — redirects to / if unauthenticated
 */

const PROTECTED_ROUTES = ["/dashboard", "/admin"];

/** Chemins appelés par d'autres sites ou des programmes (clé API, jeton, signature) : pas de contrôle d'origine. */
const CROSS_ORIGIN_OK = ["/api/oauth", "/api/v1", "/api/cron", "/api/webhooks", "/api/telegram", "/mcp", "/.well-known"];

/** Protection CSRF : un navigateur qui envoie une écriture depuis un autre site porte toujours l'en-tête Origin. */
function crossSiteWrite(request: NextRequest): boolean {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return false;
  const path = request.nextUrl.pathname;
  if (!path.startsWith("/api/") || CROSS_ORIGIN_OK.some((p) => path.startsWith(p))) return false;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  let host: string;
  try { host = new URL(origin).host.toLowerCase(); } catch { return true; }
  const mine = new Set<string>([request.nextUrl.host.toLowerCase(), (request.headers.get("host") ?? "").toLowerCase(), (request.headers.get("x-forwarded-host") ?? "").toLowerCase()]);
  try { mine.add(new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://omdot.fun").host.toLowerCase()); } catch { /* ignoré */ }
  return !mine.has(host);
}

export async function middleware(request: NextRequest) {
  if (crossSiteWrite(request)) return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  // Chemin et méthode transmis aux routes (journal des actions admin)
  const fwd = new Headers(request.headers);
  fwd.set("x-om-path", request.nextUrl.pathname);
  fwd.set("x-om-method", request.method);
  let supabaseResponse = NextResponse.next({ request: { headers: fwd } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: unknown }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request: { headers: fwd } });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options as any)
          );
        },
      },
    }
  );

  // Refresh session (do not remove this line)
  const { data: { user } } = await supabase.auth.getUser();

  // Redirect if protected route and no session
  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED_ROUTES.some((route) => path.startsWith(route));

  if (isProtected && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/";
    redirectUrl.searchParams.set("returnTo", path);
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
