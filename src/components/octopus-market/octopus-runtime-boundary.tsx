import { Component, type ErrorInfo, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

type OctopusRuntimeBoundaryProps = {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackDescription?: string;
};

type OctopusRuntimeBoundaryState = {
  hasError: boolean;
};

function clearOctopusBrowserState() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const localKeys: string[] = [];

    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith("octopus-market-")) {
        localKeys.push(key);
      }
    }

    localKeys.forEach((key) => {
      window.localStorage.removeItem(key);
    });
  } catch {
    return;
  }
}

export class OctopusRuntimeBoundary extends Component<
  OctopusRuntimeBoundaryProps,
  OctopusRuntimeBoundaryState
> {
  state: OctopusRuntimeBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _errorInfo: ErrorInfo) {}

  private handleReset = () => {
    clearOctopusBrowserState();

    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="flex min-h-[40vh] items-center justify-center px-4 py-12">
        <div className="w-full max-w-2xl rounded-3xl border border-orange-200 bg-white p-6 text-zinc-950 shadow-[0_24px_80px_rgba(249,115,22,0.14)] dark:border-white/10 dark:bg-zinc-950 dark:text-white">
          <p className="text-xs uppercase tracking-[0.18em] text-orange-600 dark:text-orange-300">
            Safe recovery mode
          </p>
          <h2 className="mt-3 text-2xl font-semibold">
            {this.props.fallbackTitle ?? "Octopus Market recovered from a browser runtime issue."}
          </h2>
          <p className="mt-3 text-sm leading-7 text-zinc-600 dark:text-zinc-400">
            {this.props.fallbackDescription ??
              "This browser hit a runtime issue while loading a richer section of the platform. You can reset the local browser state and reopen the page without losing the project code."}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              type="button"
              className="rounded-2xl bg-orange-500 text-white hover:bg-orange-400"
              onClick={this.handleReset}
            >
              Reset local browser state
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-2xl border-orange-200 bg-white text-zinc-950 hover:bg-orange-50 dark:border-white/10 dark:bg-zinc-900 dark:text-white dark:hover:bg-zinc-800"
              onClick={() => window.location.reload()}
            >
              Reload page
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
