import { Mirage } from "@/components/shared/mirage"

import { cn } from "@/lib/utils"

/** Indicateur de chargement : style « Mirage » partout sur OM */
function Spinner({ className }: { className?: string }) {
  return <Mirage className={cn("size-4", className)} />
}

export { Spinner }
