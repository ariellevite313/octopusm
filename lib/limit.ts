/**
 * Limite par IP pour les routes publiques coûteuses (RPC, API payantes, rendu d'image, uploads).
 * Compteur partagé entre serveurs (rateHit). Les appels internes du serveur à lui-même (sans IP) ne sont pas comptés.
 */
import { NextResponse } from "next/server";
import { rateHit } from "@/lib/rate-limit";
import { getIp } from "@/lib/v1/helpers";

export async function limited(req: Request, name: string, max: number, windowMs = 60_000): Promise<NextResponse | null> {
  const ip = getIp(req);
  if (ip === "unknown") return null;
  if (await rateHit(`${name}:${ip}`, max, windowMs)) return null;
  return NextResponse.json({ error: "Too many requests, slow down" }, { status: 429, headers: { "Retry-After": String(Math.ceil(windowMs / 1000)) } });
}
