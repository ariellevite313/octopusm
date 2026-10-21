/* eslint-disable @next/next/no-img-element */
import { Bot } from "lucide-react";

const LOGOS: { match: RegExp; src: string; label: string }[] = [
  { match: /claude|anthropic/i, src: "/agents/claude.png", label: "Claude" },
  { match: /chatgpt|openai|gpt/i, src: "/agents/chatgpt.png", label: "ChatGPT" },
  { match: /grok|xai|x\.ai/i, src: "/agents/grok.png", label: "Grok" },
];

export const ASSISTANTS = LOGOS.map(({ src, label }) => ({ src, label }));

/** Logo de l'assistant d'après son nom (Claude, ChatGPT, Grok) ; sinon une icône générique. */
export function AssistantLogo({ name, size = 40 }: { name: string; size?: number }) {
  const hit = LOGOS.find((l) => l.match.test(name));
  if (!hit) {
    return (
      <span className="flex shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary" style={{ width: size, height: size }}>
        <Bot style={{ width: size / 2, height: size / 2 }} />
      </span>
    );
  }
  return <img src={hit.src} alt={hit.label} width={size} height={size} className="shrink-0 rounded-[22%] object-cover ring-1 ring-border" style={{ width: size, height: size }} />;
}
