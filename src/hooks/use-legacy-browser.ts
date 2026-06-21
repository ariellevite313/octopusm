import { useEffect, useState } from "react";

function detectLegacyBrowser() {
  if (typeof window === "undefined") {
    return false;
  }

  const userAgent = window.navigator.userAgent;
  const isWindows7 = /Windows NT 6\.1/.test(userAgent);
  const isInternetExplorer = /MSIE|Trident/.test(userAgent);
  const safariVersionMatch = userAgent.match(/Version\/(\d+)/);
  const isSafari = /Safari/.test(userAgent) && !/Chrome|Chromium|Edg|OPR/.test(userAgent);
  const safariVersion = safariVersionMatch ? Number(safariVersionMatch[1]) : null;
  const isOldSafari = isSafari && safariVersion !== null && safariVersion < 15;
  const androidVersionMatch = userAgent.match(/Android\s(\d+)/i);
  const androidVersion = androidVersionMatch ? Number(androidVersionMatch[1]) : null;
  const isOldAndroid = androidVersion !== null && androidVersion < 10;

  try {
    const supportsCssApi = typeof window.CSS !== "undefined" && typeof window.CSS.supports === "function";
    const supportsBackdropFilter = supportsCssApi && window.CSS.supports("backdrop-filter", "blur(12px)");
    const supportsEventSource = typeof window.EventSource !== "undefined";
    const supportsIndexedDb = typeof window.indexedDB !== "undefined";
    const supportsAbortController = typeof window.AbortController !== "undefined";
    const supportsUrlSearchParams = typeof window.URLSearchParams !== "undefined";

    return (
      isWindows7 ||
      isInternetExplorer ||
      isOldSafari ||
      isOldAndroid ||
      !supportsBackdropFilter ||
      !supportsEventSource ||
      !supportsIndexedDb ||
      !supportsAbortController ||
      !supportsUrlSearchParams
    );
  } catch {
    return true;
  }
}

export function useLegacyBrowser() {
  const [isLegacyBrowser, setIsLegacyBrowser] = useState(detectLegacyBrowser);

  useEffect(() => {
    setIsLegacyBrowser(detectLegacyBrowser());
  }, []);

  return { isLegacyBrowser };
}
