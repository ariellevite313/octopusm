import { isBanned } from "@/lib/moderation";
import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function PATCH(req: Request) {
  // Verify session
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: { user } } = await (supabase as any).auth.getUser();
  const wallet: string | null = user?.app_metadata?.wallet_address ?? null;
  if (!wallet) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (await isBanned(wallet, true)) return NextResponse.json({ error: "This account is suspended" }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Only allow safe fields
  const allowed = ["username", "display_name", "twitter_handle", "avatar_src", "bio"] as const;
  const updates: Record<string, string | null> = {};
  for (const key of allowed) {
    if (key in body) {
      const val = body[key];
      updates[key] = typeof val === "string" && val.trim() ? val.trim() : null;
    }
  }

  // Mêmes règles que le formulaire, côté serveur : sinon on pouvait prendre « admin » ou mettre n'importe quelle image externe
  const RESERVED = /^(admin|administrator|support|omdot|omdotfun|omero|official|moderator|mod|staff|team|system|root)$/i;
  if (updates.username != null && (!/^[A-Za-z0-9_]{3,30}$/.test(updates.username) || RESERVED.test(updates.username))) {
    return NextResponse.json({ error: "Username: 3 to 30 letters, numbers or _ (this name may be reserved)" }, { status: 400 });
  }
  if (updates.display_name != null) updates.display_name = updates.display_name.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 50);
  if (updates.twitter_handle != null) {
    updates.twitter_handle = updates.twitter_handle.replace(/^@/, "");
    if (!/^[A-Za-z0-9_]{1,15}$/.test(updates.twitter_handle)) return NextResponse.json({ error: "Invalid X handle" }, { status: 400 });
  }
  if (updates.avatar_src != null) {
    // Seulement une image stockée chez nous (bucket avatars) : pas de pixel espion ni d'image d'un autre site
    const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
    if (!base || !updates.avatar_src.startsWith(`${base}/storage/v1/object/public/avatars/`)) {
      return NextResponse.json({ error: "Upload the picture from the profile form" }, { status: 400 });
    }
  }
  if (updates.username != null) {
    const { data: taken } = await (createAdminClient() as any).from("wallets").select("address").ilike("username", updates.username.replace(/_/g, "\\_")).neq("address", wallet).limit(1);
    if (taken?.length) return NextResponse.json({ error: "This username is taken" }, { status: 409 });
  }

  // Bio : 160 caractères, contrôlée comme un post
  if ("bio" in updates && updates.bio) {
    updates.bio = updates.bio.replace(/\s+\n/g, "\n").slice(0, 160);
    const { moderateText } = await import("@/lib/moderation");
    if ((await moderateText(updates.bio)) === "blocked") return NextResponse.json({ error: "This bio goes against our rules" }, { status: 400 });
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  // Use admin client to bypass RLS
  const admin = createAdminClient() as any;
  const { error } = await admin.from("wallets").update(updates).eq("address", wallet);

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "This username is taken" }, { status: 409 });
    console.error("[profile]", error.message);
    return NextResponse.json({ error: "Could not save the profile" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
