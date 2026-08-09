import { NextResponse } from "next/server";
import { checkNameAvailability } from "@/services/launchpad-service";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const name   = searchParams.get("name")   ?? "";
  const ticker = searchParams.get("ticker") ?? "";

  if (!name || !ticker) {
    return NextResponse.json({ error: "name and ticker are required" }, { status: 400 });
  }

  const result = await checkNameAvailability(name, ticker);
  return NextResponse.json(result);
}
