"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function NavigationProgress() {
  const pathname    = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [visible,  setVisible]  = useState(false);
  const timer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);
  const prev    = useRef<string>("");

  const current = pathname + searchParams.toString();

  function clear() {
    if (timer.current)    clearTimeout(timer.current);
    if (interval.current) clearInterval(interval.current);
  }

  function finish() {
    clear();
    setProgress(100);
    timer.current = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 300);
  }

  useEffect(() => {
    if (prev.current === "") {
      prev.current = current;
      return;
    }
    if (prev.current === current) return;
    prev.current = current;
    finish();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  // Expose a start function via a global so Link clicks can trigger it
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const a = (e.target as HTMLElement).closest("a");
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("mailto") || href.startsWith("#")) return;
      clear();
      setProgress(0);
      setVisible(true);

      let p = 0;
      interval.current = setInterval(() => {
        p += Math.random() * 12;
        if (p >= 85) { p = 85; clear(); }
        setProgress(Math.min(p, 85));
      }, 120);
    }

    document.addEventListener("click", handleClick, true);
    return () => {
      document.removeEventListener("click", handleClick, true);
      clear();
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      style={{
        position:   "fixed",
        top:        0,
        left:       0,
        width:      `${progress}%`,
        height:     3,
        background: "#f97316",
        zIndex:     9999,
        transition: progress === 100 ? "width 0.1s ease, opacity 0.3s ease" : "width 0.12s ease",
        opacity:    progress === 100 ? 0 : 1,
        borderRadius: "0 2px 2px 0",
        pointerEvents: "none",
      }}
    />
  );
}
