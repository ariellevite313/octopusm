const octopusLogoSrc =
  "https://studio-assets.supernova.io/files/ws/757243/d02f3ea24df2d8bf4dd2263cb73f1d153243be1bbc9b0422780f9ea32f83ee1b.jpeg";

type OctopusBrandProps = {
  compact?: boolean;
};

export function OctopusBrand({ compact = false }: OctopusBrandProps) {
  return (
    <div className="flex min-w-0 shrink items-center gap-2 sm:gap-3">
      <div
        className={compact
          ? "flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/15 bg-transparent shadow-sm backdrop-blur-[1px] sm:size-12"
          : "flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-transparent shadow-lg backdrop-blur-[1px]"
        }
      >
        <img
          src={octopusLogoSrc}
          alt="Logo Octopus Market"
          loading="eager"
          fetchPriority="high"
          decoding="async"
          referrerPolicy="no-referrer"
          draggable={false}
          className="h-full w-full object-cover"
        />
      </div>
      <div className="min-w-0">
        <p
          className={compact
            ? "truncate text-base font-semibold text-zinc-950 dark:text-white sm:text-lg"
            : "whitespace-nowrap text-2xl font-semibold text-zinc-950 dark:text-white"
          }
        >
          Octopus Market
        </p>
      </div>
    </div>
  );
}

export { octopusLogoSrc };
