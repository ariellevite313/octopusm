/**
 * GET /api/launchpad/[id]/image
 *
 * Image proxy for token logos — fetches from Supabase storage with the
 * service-role key (bypasses bucket RLS / public-access restrictions) and
 * streams the bytes back to the caller.
 *
 * Used by the /metadata endpoint so Phantom, Jupiter, DexScreener… can
 * always load the logo regardless of how the Supabase bucket is configured.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { id } = await params;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    const { data: token } = await admin
      .from("launchpad_tokens")
      .select("logo_url")
      .eq("id", id)
      .maybeSingle();

    if (!token?.logo_url) {
      // No logo → redirect to default
      return NextResponse.redirect("https://omdot.fun/octomarket-logo.png", {
        status: 302,
        headers: CORS,
      });
    }

    const logoUrl: string = token.logo_url as string;

    // Try to extract the storage path from the Supabase URL so we can
    // download it via the service-role client (avoids auth issues).
    // URL format: https://{project}.supabase.co/storage/v1/object/public/{bucket}/{path}
    const match = logoUrl.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?.*)?$/);

    if (match) {
      const [, bucket, path] = match;
      const { data, error } = await admin.storage.from(bucket).download(path);
      // `data` is a Blob in supabase-js v2; avoid `instanceof Blob` because the
      // global may differ between the Node.js runtime and the library's polyfill.
      if (!error && data && typeof (data as { arrayBuffer?: unknown }).arrayBuffer === "function") {
        const arrayBuffer = await (data as Blob).arrayBuffer();
        // Guess content-type from extension
        const ext = path.split(".").pop()?.toLowerCase() ?? "";
        const contentType =
          ext === "jpg" || ext === "jpeg" ? "image/jpeg" :
          ext === "gif"  ? "image/gif"  :
          ext === "webp" ? "image/webp" :
                           "image/png";
        return new Response(arrayBuffer, {
          status: 200,
          headers: {
            ...CORS,
            "Content-Type":  contentType,
            "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600",
          },
        });
      }
    }

    // Fallback: proxy the URL directly (works if bucket is already public)
    const res = await fetch(logoUrl);
    if (res.ok) {
      const buf = await res.arrayBuffer();
      return new Response(buf, {
        status: 200,
        headers: {
          ...CORS,
          "Content-Type":  res.headers.get("Content-Type") ?? "image/png",
          "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600",
        },
      });
    }

    return NextResponse.redirect("https://omdot.fun/octomarket-logo.png", {
      status: 302,
      headers: CORS,
    });
  } catch (err) {
    console.error("[token-image] error:", err);
    return NextResponse.redirect("https://omdot.fun/octomarket-logo.png", {
      status: 302,
      headers: CORS,
    });
  }
}
