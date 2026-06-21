import * as React from "react";
import { XIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type SheetSide = "top" | "right" | "bottom" | "left";

type SheetContextValue = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const SheetContext = React.createContext<SheetContextValue | null>(null);

function useSheetContext() {
  const context = React.useContext(SheetContext);

  if (!context) {
    throw new Error("Sheet components must be used inside <Sheet>.");
  }

  return context;
}

type SheetProps = {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
};

function Sheet({ open, defaultOpen = false, onOpenChange, children }: SheetProps) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const isControlled = typeof open === "boolean";
  const currentOpen = isControlled ? open : internalOpen;

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (!isControlled) {
        setInternalOpen(nextOpen);
      }

      onOpenChange?.(nextOpen);
    },
    [isControlled, onOpenChange]
  );

  const value = React.useMemo(
    () => ({
      open: currentOpen,
      onOpenChange: handleOpenChange,
    }),
    [currentOpen, handleOpenChange]
  );

  return <SheetContext.Provider value={value}>{children}</SheetContext.Provider>;
}

type SlottableProps = {
  asChild?: boolean;
  children?: React.ReactNode;
};

function cloneWithProps(child: React.ReactNode, props: Record<string, unknown>) {
  if (!React.isValidElement(child)) {
    return null;
  }

  return React.cloneElement(child, props);
}

function SheetTrigger({ asChild, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & SlottableProps) {
  const { onOpenChange } = useSheetContext();
  const childProps = React.isValidElement(children) ? (children.props as { onClick?: (event: React.MouseEvent) => void }) : undefined;

  if (asChild) {
    return cloneWithProps(children, {
      ...props,
      onClick: (event: React.MouseEvent) => {
        childProps?.onClick?.(event);
        if (!event.defaultPrevented) {
          onOpenChange(true);
        }
      },
    });
  }

  return (
    <button data-slot="sheet-trigger" type="button" {...props} onClick={(event) => {
      props.onClick?.(event);
      if (!event.defaultPrevented) {
        onOpenChange(true);
      }
    }}>
      {children}
    </button>
  );
}

function SheetClose({ asChild, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & SlottableProps) {
  const { onOpenChange } = useSheetContext();
  const childProps = React.isValidElement(children) ? (children.props as { onClick?: (event: React.MouseEvent) => void }) : undefined;

  if (asChild) {
    return cloneWithProps(children, {
      ...props,
      onClick: (event: React.MouseEvent) => {
        childProps?.onClick?.(event);
        if (!event.defaultPrevented) {
          onOpenChange(false);
        }
      },
    });
  }

  return (
    <button data-slot="sheet-close" type="button" {...props} onClick={(event) => {
      props.onClick?.(event);
      if (!event.defaultPrevented) {
        onOpenChange(false);
      }
    }}>
      {children}
    </button>
  );
}

function SheetPortal({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

function SheetOverlay({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { open, onOpenChange } = useSheetContext();

  if (!open) {
    return null;
  }

  return (
    <div
      data-slot="sheet-overlay"
      className={cn("fixed inset-0 z-50 bg-black/50", className)}
      {...props}
      onClick={(event) => {
        props.onClick?.(event);
        if (!event.defaultPrevented) {
          onOpenChange(false);
        }
      }}
    />
  );
}

function getSideClassName(side: SheetSide) {
  switch (side) {
    case "left":
      return "inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm";
    case "top":
      return "inset-x-0 top-0 h-auto border-b";
    case "bottom":
      return "inset-x-0 bottom-0 h-auto border-t";
    case "right":
    default:
      return "inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm";
  }
}

function SheetContent({
  className,
  children,
  side = "right",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  side?: SheetSide;
}) {
  const { open, onOpenChange } = useSheetContext();

  React.useEffect(() => {
    if (!open || typeof document === "undefined") {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <SheetPortal>
      <SheetOverlay />
      <div
        data-slot="sheet-content"
        className={cn(
          "bg-background fixed z-50 flex flex-col gap-4 shadow-lg",
          getSideClassName(side),
          className
        )}
        {...props}
      >
        {children}
        <button
          type="button"
          data-slot="sheet-close"
          className="ring-offset-background focus:ring-ring data-[state=open]:bg-secondary absolute right-4 top-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:outline-hidden focus:ring-2 focus:ring-offset-2 disabled:pointer-events-none"
          onClick={() => onOpenChange(false)}
        >
          <XIcon className="size-4" />
          <span className="sr-only">Close</span>
        </button>
      </div>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-header" className={cn("flex flex-col gap-1.5 p-4", className)} {...props} />;
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-footer" className={cn("mt-auto flex flex-col gap-2 p-4", className)} {...props} />;
}

function SheetTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return <h2 data-slot="sheet-title" className={cn("text-foreground font-semibold", className)} {...props} />;
}

function SheetDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="sheet-description" className={cn("text-muted-foreground text-sm", className)} {...props} />;
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};