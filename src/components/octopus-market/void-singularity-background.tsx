const backgroundStars = [
  { id: "star-1", left: "6%", top: "10%", size: 2, delay: "0s" },
  { id: "star-2", left: "14%", top: "22%", size: 1.5, delay: "-1.4s" },
  { id: "star-3", left: "28%", top: "7%", size: 2.5, delay: "-2.1s" },
  { id: "star-4", left: "36%", top: "18%", size: 1.5, delay: "-0.8s" },
  { id: "star-5", left: "54%", top: "12%", size: 2, delay: "-2.8s" },
  { id: "star-6", left: "63%", top: "26%", size: 1.5, delay: "-1.6s" },
  { id: "star-7", left: "76%", top: "14%", size: 2.25, delay: "-3.1s" },
  { id: "star-8", left: "86%", top: "20%", size: 1.5, delay: "-0.5s" },
  { id: "star-9", left: "91%", top: "8%", size: 1.25, delay: "-2.2s" },
  { id: "star-10", left: "12%", top: "42%", size: 1.25, delay: "-1.1s" },
  { id: "star-11", left: "22%", top: "37%", size: 2, delay: "-2.6s" },
  { id: "star-12", left: "40%", top: "32%", size: 1.75, delay: "-1.8s" },
  { id: "star-13", left: "58%", top: "39%", size: 1.5, delay: "-0.9s" },
  { id: "star-14", left: "72%", top: "35%", size: 2, delay: "-2.4s" },
  { id: "star-15", left: "84%", top: "44%", size: 1.25, delay: "-1.3s" },
] as const;

const orbitingAuras = [
  { id: "aura-1", size: 10, duration: "14s", delay: "0s", offset: "translateX(13rem) translateY(-0.8rem)" },
  { id: "aura-2", size: 7, duration: "10s", delay: "-2.4s", offset: "translateX(-11rem) translateY(1.6rem)" },
  { id: "aura-3", size: 6, duration: "18s", delay: "-6.2s", offset: "translateX(0.5rem) translateY(-8.5rem)" },
  { id: "aura-4", size: 5, duration: "12s", delay: "-4.8s", offset: "translateX(-1.4rem) translateY(8rem)" },
] as const;

export function VoidSingularityBackground({ reduceMotion = false }: { reduceMotion?: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 hidden overflow-hidden dark:block" aria-hidden="true">
      <style>{`
        @keyframes om-singularity-spin {
          0% { transform: translate(-50%, -50%) rotateX(72deg) rotateZ(0deg) scale(1); }
          50% { transform: translate(-50%, -50%) rotateX(72deg) rotateZ(180deg) scale(1.04); }
          100% { transform: translate(-50%, -50%) rotateX(72deg) rotateZ(360deg) scale(1); }
        }

        @keyframes om-singularity-shimmer {
          0%, 100% { opacity: 0.72; filter: blur(0px); }
          50% { opacity: 1; filter: blur(0.6px); }
        }

        @keyframes om-singularity-core {
          0%, 100% { transform: translate(-50%, -50%) scale(1); box-shadow: 0 0 0 1px rgba(255,255,255,0.04), 0 0 48px rgba(255,255,255,0.06); }
          50% { transform: translate(-50%, -50%) scale(1.04); box-shadow: 0 0 0 1px rgba(255,255,255,0.06), 0 0 76px rgba(255,255,255,0.12); }
        }

        @keyframes om-singularity-orbit {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        @keyframes om-singularity-twinkle {
          0%, 100% { opacity: 0.32; transform: scale(1); }
          50% { opacity: 0.9; transform: scale(1.24); }
        }
      `}</style>

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(10,10,16,0.12)_0%,rgba(3,6,18,0.62)_45%,rgba(1,2,8,0.92)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center_top,rgba(255,255,255,0.035),transparent_22%),radial-gradient(circle_at_center,rgba(99,102,241,0.08),transparent_42%),radial-gradient(circle_at_center,transparent_0%,rgba(1,2,8,0.72)_74%,rgba(0,0,0,0.94)_100%)]" />

      {backgroundStars.map((star) => (
        <span
          key={star.id}
          className="absolute rounded-full bg-white/80"
          style={{
            left: star.left,
            top: star.top,
            width: `${star.size}px`,
            height: `${star.size}px`,
            boxShadow: `0 0 ${star.size * 8}px rgba(255,255,255,0.5)`,
            animation: reduceMotion ? undefined : `om-singularity-twinkle 4.8s ease-in-out ${star.delay} infinite`,
          }}
        />
      ))}

      <div className="absolute left-1/2 top-[15rem] h-[22rem] w-[22rem] -translate-x-1/2 -translate-y-1/2 sm:top-[17rem] sm:h-[26rem] sm:w-[26rem] lg:top-[18rem] lg:h-[30rem] lg:w-[30rem]">
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.12)_0%,rgba(148,163,184,0.04)_30%,transparent_68%)] blur-3xl" />
        <div className="absolute left-1/2 top-1/2 h-[9rem] w-[9rem] rounded-full bg-black sm:h-[10.5rem] sm:w-[10.5rem] lg:h-[12rem] lg:w-[12rem]" style={{ animation: reduceMotion ? undefined : "om-singularity-core 7.5s ease-in-out infinite" }} />

        <div
          className="absolute left-1/2 top-1/2 h-[15rem] w-[24rem] rounded-full border border-white/15 bg-[radial-gradient(ellipse_at_center,rgba(148,163,184,0.2)_0%,rgba(99,102,241,0.1)_32%,rgba(255,255,255,0.01)_58%,transparent_74%)] shadow-[0_0_34px_rgba(99,102,241,0.12)] blur-[0.4px] sm:h-[17rem] sm:w-[28rem] lg:h-[20rem] lg:w-[34rem]"
          style={{
            animation: reduceMotion ? undefined : "om-singularity-spin 18s linear infinite, om-singularity-shimmer 4s ease-in-out infinite",
          }}
        />

        <div className="absolute left-1/2 top-1/2 h-[18rem] w-[18rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/5" />

        {orbitingAuras.map((aura) => (
          <div
            key={aura.id}
            className="absolute left-1/2 top-1/2 h-0 w-0"
            style={{
              animation: reduceMotion ? undefined : `om-singularity-orbit ${aura.duration} linear ${aura.delay} infinite`,
            }}
          >
            <span
              className="absolute rounded-full bg-white/90"
              style={{
                width: `${aura.size}px`,
                height: `${aura.size}px`,
                transform: aura.offset,
                boxShadow: `0 0 ${aura.size * 6}px rgba(255,255,255,0.75)`,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
