import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ThemeToggleProps = {
  isDark: boolean;
  onToggle: () => void;
  className?: string;
};

export function ThemeToggle({ isDark, onToggle, className }: ThemeToggleProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "border-orange-200 bg-white text-zinc-950 hover:bg-orange-50 dark:border-white/10 dark:bg-zinc-900 dark:text-white dark:hover:bg-zinc-800",
        className
      )}
      onClick={onToggle}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
