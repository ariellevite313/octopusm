import {
  BarChart3, BookOpen, CircleHelp, Coins, FileText, Globe, Headset,
  Link as LinkIcon, Lock, MessageCircle, Rocket, ShieldCheck, Trophy,
  type LucideIcon,
} from "lucide-react";

// Icônes en SVG (remplacent la police d'icônes, qui ne s'affichait pas sur
// certains téléphones). Même noms qu'avant : "ti-coin", "ti-brand-x", etc.

function XBrand({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
    </svg>
  );
}

function TelegramBrand({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

function Dot({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 10 10" fill="currentColor" className={className} aria-hidden="true">
      <circle cx="5" cy="5" r="5" />
    </svg>
  );
}

const LUCIDE: Record<string, LucideIcon> = {
  "ti-book": BookOpen,
  "ti-chart-bar": BarChart3,
  "ti-coin": Coins,
  "ti-file-text": FileText,
  "ti-headset": Headset,
  "ti-help-circle": CircleHelp,
  "ti-link": LinkIcon,
  "ti-lock": Lock,
  "ti-rocket": Rocket,
  "ti-shield-check": ShieldCheck,
  "ti-trophy": Trophy,
  "ti-world": Globe,
  "ti-brand-discord": MessageCircle,
};

export function AppIcon({ name, className = "size-4" }: { name: string; className?: string }) {
  if (name === "ti-brand-x") return <XBrand className={className} />;
  if (name === "ti-brand-telegram") return <TelegramBrand className={className} />;
  if (name === "ti-circle-filled") return <Dot className={className} />;
  const Icon = LUCIDE[name] ?? CircleHelp;
  return <Icon className={className} aria-hidden="true" />;
}
