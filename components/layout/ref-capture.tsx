"use client";

import { useEffect } from "react";

/**
 * Captures the ?ref= query param on page load and persists it in sessionStorage
 * so it survives navigation before the user connects their wallet.
 */
export function RefCapture() {
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref) {
      sessionStorage.setItem("referral_code", ref);
    }
  }, []);
  return null;
}
