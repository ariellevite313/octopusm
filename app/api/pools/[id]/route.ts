import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const supabase = await createClient() as any;
  const { data, error } = await supabase
    .from("mutuel_markets")
    .select("*")
    .eq("id", id)
    .in("status", ["active", "closed", "resolved", "cancelled"])
    .single();

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}
