/**
 * PATCH /api/launchpad/[id]/edit
 *
 * L'édition d'un token est désactivée (les infos sont immuables après création) :
 * l'endpoint doit toujours répondre 404, quel que soit le corps envoyé.
 */

import { describe, it, expect } from "vitest";
import { json } from "./helpers";

const { PATCH } = await import("../app/api/launchpad/[id]/edit/route");

describe("PATCH /api/launchpad/[id]/edit — disabled", () => {
  it("returns 404 whatever the payload", async () => {
    const form = new FormData();
    form.set("payload", JSON.stringify({ wallet_address: "CreatorWalletXYZ", name: "NewName" }));
    const res = await PATCH();
    expect(res.status).toBe(404);
    expect((await json(res)).error).toMatch(/disabled/i);
    expect(form.get("payload")).toBeTruthy();
  });
});
