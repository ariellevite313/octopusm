import { describe, it, expect } from "vitest";
import { ratingBars, validateApp, validateReview } from "@/lib/discover";

const base = {
  tokenId: "3f1c2b8e-1a2b-4c3d-8e9f-0a1b2c3d4e5f", name: "Omero Pay", tagline: "Pay friends in OMERO", description: "A simple app to pay friends with the OMERO token.",
  category: "payments", siteUrl: "https://omeropay.app", screenshots: ["https://x.io/a.png"], paymentNote: "Every payment in the app is made in OMERO.", acceptsToken: true,
};

describe("fiche Discover", () => {
  it("accepte une fiche complète", () => { expect(validateApp(base).ok).toBe(true); });
  it("exige le token comme moyen de paiement", () => {
    expect(validateApp({ ...base, acceptsToken: false })).toEqual({ ok: false, error: "Your website must accept your token as payment" });
    expect(validateApp({ ...base, paymentNote: "yes" }).ok).toBe(false);
  });
  it("refuse http, trop d'images et une mauvaise catégorie", () => {
    expect(validateApp({ ...base, siteUrl: "http://omeropay.app" }).ok).toBe(false);
    expect(validateApp({ ...base, screenshots: Array(7).fill("https://x.io/a.png") }).ok).toBe(false);
    expect(validateApp({ ...base, category: "casino" }).ok).toBe(false);
  });
});

describe("avis", () => {
  it("1 à 5 étoiles, 600 caractères au plus", () => {
    expect(validateReview(5, "Great").ok).toBe(true);
    expect(validateReview(0, "").ok).toBe(false);
    expect(validateReview(4.5, "").ok).toBe(false);
    expect(validateReview(3, "x".repeat(601)).ok).toBe(false);
  });
  it("répartition des notes", () => {
    const b = ratingBars([5, 5, 4, 1]);
    expect(b[0]).toEqual({ star: 5, count: 2, pct: 50 });
    expect(b[4]).toEqual({ star: 1, count: 1, pct: 25 });
  });
});
