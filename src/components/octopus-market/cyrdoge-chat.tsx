import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Brain, Clock3, MessageSquareQuote, Send, Sparkles, Wallet } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  aidoAgentStarterFaqs,
  createWelcomeMessage,
  cyrDogeQuickPrompts,
  cyrDogeStorageKey,
  detectChatLanguage,
  readStoredCyrDogeMessages,
  type CyrDogeMessage,
} from "@/components/octopus-market/cyrdoge-chat-data";
import { createAssistantReply } from "@/components/octopus-market/cyrdoge-chat-engine";
import {
  createCyrDogeSimulation,
  type CyrDogeSimulation,
} from "@/components/octopus-market/cyrdoge-chat-simulations";
import {
  countKnownMemoryItems,
  createEmptyCyrDogeMemory,
  getCyrDogeMemoryHighlights,
  loadCyrDogeMemory,
  readStoredCyrDogeMemory,
  updateCyrDogeMemory,
  writeStoredCyrDogeMemory,
} from "@/components/octopus-market/cyrdoge-memory";
import { aidoAgentAccessAreas } from "@/components/octopus-market/octopus-market-data";
import { formatWalletAddress } from "@/components/octopus-market/solana-wallet";

const cyrDogeProfileSrc =
  "https://studio-assets.supernova.io/files/ws/757243/9f6009d0241fda73d5e07a356ccc6c33825c2d1abb0e629d11579561e5f4e941.jpeg";

type CyrDogeChatProps = {
  isWalletConnected: boolean;
  walletAddress: string | null;
  onConnectWallet: () => Promise<string | null>;
};

function AgentAvatar({ className = "size-11" }: { className?: string }) {
  return (
    <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-orange-200 bg-white dark:border-white/10 dark:bg-zinc-900 ${className}`}>
      <img
        src={cyrDogeProfileSrc}
        alt="Aido Agent profile"
        loading="eager"
        fetchPriority="high"
        decoding="async"
        referrerPolicy="no-referrer"
        draggable={false}
        className="h-full w-full object-cover"
      />
    </div>
  );
}

function formatRelativeMoment(timestamp: number, language: "fr" | "en") {
  try {
    return new Intl.DateTimeFormat(language === "fr" ? "fr-FR" : "en-US", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "short",
    }).format(new Date(timestamp));
  } catch {
    return new Date(timestamp).toLocaleString();
  }
}

function formatLiveClock(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function useCyrDogeState(walletAddress: string | null) {
  const [messages, setMessages] = useState<CyrDogeMessage[]>(() => {
    const storedMessages = readStoredCyrDogeMessages();
    return storedMessages ?? [createWelcomeMessage()];
  });
  const [memory, setMemory] = useState(() => readStoredCyrDogeMemory() ?? createEmptyCyrDogeMemory());

  // Load memory from Supabase when wallet connects
  useEffect(() => {
    if (!walletAddress) return;
    loadCyrDogeMemory(walletAddress).then((loaded) => {
      if (loaded) setMemory(loaded);
    });
  }, [walletAddress]);

  // Persist chat history to localStorage (session-local, not synced)
  useEffect(() => {
    try {
      window.localStorage.setItem(cyrDogeStorageKey, JSON.stringify(messages));
    } catch {
      return;
    }
  }, [messages]);

  // Persist memory to Supabase (replaces localStorage write)
  useEffect(() => {
    if (!walletAddress) return;
    writeStoredCyrDogeMemory(walletAddress, memory).catch(() => {});
  }, [walletAddress, memory]);

  return { memory, messages, setMemory, setMessages };
}

export function CyrDogeChat({
  isWalletConnected,
  walletAddress,
  onConnectWallet,
}: CyrDogeChatProps) {
  const { memory, messages, setMemory, setMessages } = useCyrDogeState(walletAddress);
  const [draft, setDraft] = useState("");
  const [isReplying, setIsReplying] = useState(false);
  const [simulation, setSimulation] = useState<CyrDogeSimulation | null>(null);
  const [liveTime, setLiveTime] = useState(() => Date.now());
  const viewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    viewportRef.current?.scrollTo({ top: viewportRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isReplying]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setLiveTime(Date.now());
    }, 30000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const totalUserMessages = useMemo(
    () => messages.filter((message) => message.role === "user").length,
    [messages]
  );
  const rememberedItemsCount = useMemo(() => countKnownMemoryItems(memory), [memory]);
  const currentLanguage = useMemo(() => {
    const latestUserMessage = [...messages].reverse().find((message) => message.role === "user");
    return latestUserMessage?.language ?? memory.preferences.languagePreference ?? "en";
  }, [memory.preferences.languagePreference, messages]);
  const memoryHighlights = useMemo(
    () => getCyrDogeMemoryHighlights(memory, currentLanguage),
    [currentLanguage, memory]
  );
  const lastInteractionMoment = useMemo(
    () => formatRelativeMoment(memory.updatedAt, currentLanguage),
    [currentLanguage, memory.updatedAt]
  );

  const sendMessage = (content: string) => {
    const trimmedContent = content.trim();

    if (!trimmedContent || isReplying || !isWalletConnected) {
      return;
    }

    const language = detectChatLanguage(trimmedContent);
    const userMessage: CyrDogeMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      language,
      content: trimmedContent,
      createdAt: Date.now(),
    };
    const memoryUpdate = updateCyrDogeMemory(memory, trimmedContent);

    setMemory(memoryUpdate.memory);
    setMessages((currentMessages) => [...currentMessages, userMessage]);
    setDraft("");
    setIsReplying(true);
    setSimulation(createCyrDogeSimulation(trimmedContent, language));

    window.setTimeout(() => {
      setMessages((currentMessages) => [
        ...currentMessages,
        createAssistantReply(trimmedContent, currentMessages, {
          memory: memoryUpdate.memory,
          learnedFacts: memoryUpdate.learnedFacts,
        }),
      ]);
      setIsReplying(false);
    }, 480);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    sendMessage(draft);
  };

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage(draft);
    }
  };

  const handleReset = () => {
    setMessages([createWelcomeMessage()]);
    setMemory(createEmptyCyrDogeMemory());
    setSimulation(null);
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[0.88fr_1.12fr]">
      <Card className="border-orange-200 bg-white text-zinc-950 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-white">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className="border border-orange-200 bg-orange-100 text-orange-700 hover:bg-orange-100 dark:border-orange-400/20 dark:bg-orange-500/15 dark:text-orange-300 dark:hover:bg-orange-500/15">
              Standard English default
            </Badge>
            <Badge className="border border-orange-200 bg-white text-zinc-800 hover:bg-white dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-900">
              10 FAQ memory starters
            </Badge>
          </div>
          <CardTitle className="mt-4 flex items-center gap-3 text-2xl">
            <AgentAvatar />
            Aido Agent
          </CardTitle>
          <CardDescription className="text-base leading-7 text-zinc-600 dark:text-zinc-400">
            Ask a question, get a response, and keep the conversation tied to Octopus Market, official platform facts, wallet-gated flows, and guided next steps.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-4 dark:border-white/10 dark:bg-black/20">
            <div className="flex items-center gap-2">
              <Wallet className="size-4 text-orange-500 dark:text-orange-300" />
              <p className="text-sm font-medium text-zinc-950 dark:text-white">Utility unlock status</p>
            </div>
            <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              {isWalletConnected
                ? `Aido Agent is unlocked with wallet ${formatWalletAddress(walletAddress)}.`
                : "Connect a Solana wallet to chat, save guided actions, and use the full Octopus Market utility layer."}
            </p>
            {!isWalletConnected ? (
              <Button
                type="button"
                className="mt-4 rounded-2xl bg-orange-500 text-white hover:bg-orange-400"
                onClick={() => void onConnectWallet()}
              >
                <Wallet className="size-4" />
                Connect wallet to unlock Aido Agent
              </Button>
            ) : null}
          </div>

          <div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-4 dark:border-white/10 dark:bg-black/20">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Bot className="size-4 text-orange-500 dark:text-orange-300" />
                <p className="text-sm font-medium text-zinc-950 dark:text-white">Platform access areas</p>
              </div>
              <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                <Clock3 className="size-4 text-orange-500 dark:text-orange-300" />
                <span>{formatLiveClock(liveTime)}</span>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {aidoAgentAccessAreas.map((workspace) => (
                <Badge
                  key={workspace}
                  className="border border-orange-200 bg-white text-zinc-800 hover:bg-white dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-950"
                >
                  {workspace}
                </Badge>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              <Clock3 className="size-4 text-orange-500 dark:text-orange-300" />
              <span>Last memory sync: {lastInteractionMoment}</span>
            </div>
          </div>

          <div className="rounded-2xl border border-orange-200 bg-white px-4 py-4 dark:border-white/10 dark:bg-black/20">
            <div className="flex items-center gap-2">
              <Brain className="size-4 text-orange-500 dark:text-orange-300" />
              <p className="text-sm font-medium text-zinc-950 dark:text-white">Memory profile on this device</p>
            </div>
            <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Aido Agent currently remembers {rememberedItemsCount} useful detail{rememberedItemsCount === 1 ? "" : "s"}. New chat resets both the thread and the local memory profile for a clean English restart.
            </p>
            {memoryHighlights.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {memoryHighlights.map((highlight) => (
                  <Badge
                    key={highlight}
                    className="border border-orange-200 bg-orange-50 text-zinc-800 hover:bg-orange-50 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-950"
                  >
                    {highlight}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-orange-200 bg-white px-4 py-4 dark:border-white/10 dark:bg-black/20">
            <div className="flex items-center gap-2">
              <MessageSquareQuote className="size-4 text-orange-500 dark:text-orange-300" />
              <p className="text-sm font-medium text-zinc-950 dark:text-white">Stored Q&A series</p>
            </div>
            <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              These 10 built-in memory starters help users ask direct product questions and get consistent answers.
            </p>
            <div className="mt-4 grid gap-3">
              {aidoAgentStarterFaqs.map((faq, index) => (
                <Button
                  key={faq.question}
                  type="button"
                  variant="outline"
                  className="h-auto min-h-14 justify-start border-orange-200 bg-white px-4 py-3 text-left text-zinc-950 hover:bg-orange-50 dark:border-white/10 dark:bg-zinc-950 dark:text-white dark:hover:bg-zinc-900"
                  onClick={() => sendMessage(faq.question)}
                  disabled={!isWalletConnected || isReplying}
                >
                  <span className="mr-3 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-semibold text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
                    {index + 1}
                  </span>
                  <span className="whitespace-normal">{faq.question}</span>
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {cyrDogeQuickPrompts.map((prompt) => (
              <Button
                key={prompt}
                type="button"
                variant="outline"
                className="h-auto min-h-14 justify-start border-orange-200 bg-white px-4 py-3 text-left text-zinc-950 hover:bg-orange-50 dark:border-white/10 dark:bg-zinc-950 dark:text-white dark:hover:bg-zinc-900"
                onClick={() => sendMessage(prompt)}
                disabled={!isWalletConnected || isReplying}
              >
                <Sparkles className="size-4 shrink-0 text-orange-500 dark:text-orange-300" />
                <span className="whitespace-normal">{prompt}</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-orange-200 bg-white text-zinc-950 shadow-sm dark:border-white/10 dark:bg-zinc-950 dark:text-white">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-2xl">Live chat preview</CardTitle>
              <CardDescription className="mt-2 text-zinc-600 dark:text-zinc-400">
                {totalUserMessages > 0
                  ? `${totalUserMessages} user message${totalUserMessages > 1 ? "s" : ""} saved on this device, plus ${rememberedItemsCount} memory item${rememberedItemsCount === 1 ? "" : "s"}`
                  : "Ask about ClawdTrust, Launch Token, Prediction Market, wallet validation, or official Octopus Market details"}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border border-orange-200 bg-orange-100 text-orange-700 hover:bg-orange-100 dark:border-orange-400/20 dark:bg-orange-500/15 dark:text-orange-300 dark:hover:bg-orange-500/15">
                Platform-aware mode
              </Badge>
              <Button
                type="button"
                variant="ghost"
                className="rounded-2xl px-3 text-zinc-600 hover:bg-orange-50 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-white/5 dark:hover:text-white"
                onClick={handleReset}
              >
                New chat
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {simulation ? (
            <div className="rounded-3xl border border-orange-200 bg-orange-50 p-4 dark:border-white/10 dark:bg-black/20">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Badge className="border border-orange-200 bg-white text-orange-700 hover:bg-white dark:border-orange-400/20 dark:bg-orange-500/15 dark:text-orange-300 dark:hover:bg-orange-500/15">
                    {simulation.badge}
                  </Badge>
                  <p className="mt-3 text-lg font-semibold text-zinc-950 dark:text-white">{simulation.title}</p>
                  <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{simulation.summary}</p>
                </div>
                <Badge className="border border-orange-200 bg-orange-500 text-white hover:bg-orange-500 dark:border-orange-400/20 dark:bg-orange-500 dark:text-white dark:hover:bg-orange-500">
                  Live preview
                </Badge>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {simulation.metrics.map((metric) => (
                  <div
                    key={metric.label}
                    className="rounded-2xl border border-orange-200 bg-white px-4 py-4 dark:border-white/10 dark:bg-zinc-950"
                  >
                    <p className="text-xs uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">{metric.label}</p>
                    <p className="mt-2 text-base font-semibold text-zinc-950 dark:text-white">{metric.value}</p>
                    {metric.delta ? (
                      <p className="mt-1 text-xs text-orange-600 dark:text-orange-300">{metric.delta}</p>
                    ) : null}
                  </div>
                ))}
              </div>
              <ul className="mt-4 space-y-2 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
                {simulation.bullets.map((bullet) => (
                  <li key={bullet} className="flex gap-2">
                    <span className="mt-2 size-2 shrink-0 rounded-full bg-orange-500 dark:bg-orange-300" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">{simulation.footer}</p>
            </div>
          ) : null}

          <div
            ref={viewportRef}
            className="max-h-[420px] space-y-4 overflow-y-auto rounded-3xl border border-orange-200 bg-orange-50/80 p-4 dark:border-white/10 dark:bg-black/20"
            aria-live="polite"
          >
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "assistant" ? "justify-start" : "justify-end"}`}
              >
                <div
                  className={`max-w-[88%] rounded-3xl px-4 py-3 text-sm leading-7 shadow-sm ${
                    message.role === "assistant"
                      ? "border border-orange-200 bg-white text-zinc-800 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-100"
                      : "bg-orange-500 text-white"
                  }`}
                >
                  {message.role === "assistant" ? (
                    <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-orange-600 dark:text-orange-300">
                      <AgentAvatar className="size-4 rounded-full border-orange-200 dark:border-white/10" />
                      Aido Agent
                    </div>
                  ) : null}
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </div>
              </div>
            ))}

            {isReplying ? (
              <div className="flex justify-start">
                <div className="rounded-3xl border border-orange-200 bg-white px-4 py-3 text-sm text-zinc-700 shadow-sm dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-200">
                  Aido Agent is reviewing your message, memory, and Octopus Market context...
                </div>
              </div>
            ) : null}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              rows={4}
              placeholder={
                isWalletConnected
                  ? "Ask a question about Octopus Market, Launch Token, Prediction Market, List My AI, ClawdTrust, the official token, or wallet validation"
                  : "Connect a Solana wallet to unlock Aido Agent chat"
              }
              className="min-h-32 resize-none border-orange-200 bg-white text-zinc-950 placeholder:text-zinc-400 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-zinc-500"
              disabled={!isWalletConnected || isReplying}
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {isWalletConnected
                  ? "Press Enter to send, or Shift + Enter for a new line."
                  : "Connect first to unlock assistant replies and guided answers."}
              </p>
              <Button
                type={isWalletConnected ? "submit" : "button"}
                className="h-12 shrink-0 rounded-2xl bg-orange-500 px-6 text-white hover:bg-orange-400"
                disabled={isWalletConnected ? isReplying || draft.trim().length === 0 : false}
                onClick={isWalletConnected ? undefined : () => void onConnectWallet()}
              >
                {isWalletConnected ? <Send className="size-4" /> : <Wallet className="size-4" />}
                {isWalletConnected ? "Send" : "Connect wallet"}
              </Button>
            </div>
          </form>

          <Separator className="bg-orange-100 dark:bg-white/10" />

          <div className="rounded-2xl border border-orange-200 bg-white px-4 py-4 dark:border-white/10 dark:bg-black/20">
            <p className="text-sm font-medium text-zinc-950 dark:text-white">What changed in this version</p>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
              <li>It now includes 10 built-in Q&A starters for consistent product answers.</li>
              <li>It keeps memory, answers free-form questions, and stays grounded in official platform facts.</li>
              <li>It shows live date and time context, plus wallet-gated access to the utility layer.</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
