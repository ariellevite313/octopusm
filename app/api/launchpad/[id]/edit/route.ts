import { NextResponse } from "next/server";

// Edit endpoint disabled — token information is immutable after creation.
export async function PATCH() {
  return NextResponse.json({ error: "Token editing is disabled" }, { status: 404 });
}
