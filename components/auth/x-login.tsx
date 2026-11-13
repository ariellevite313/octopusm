"use client";

import dynamic from "next/dynamic";

/** Connexion avec X : visible seulement si l'application Privy est configuree. Le code Privy ne se charge qu'au clic. */
export const X_LOGIN_ENABLED = !!process.env.NEXT_PUBLIC_PRIVY_APP_ID;
export const XLoginFlow = dynamic(() => import("./x-login-flow"), { ssr: false });

export function XLogo({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function GithubLogo({ className = "size-4" }: { className?: string }) {
  // Logo noir : inversé en mode nuit pour rester visible
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/social/github.png" alt="" className={`${className} object-contain dark:invert`} aria-hidden="true" />;
}

export function TwitchLogo({ className = "size-4" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/social/twitch.png" alt="" className={`${className} object-contain`} aria-hidden="true" />;
}
