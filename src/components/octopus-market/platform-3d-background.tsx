type Platform3DBackgroundProps = {
  reduceMotion?: boolean;
};

export function Platform3DBackground({ reduceMotion = false }: Platform3DBackgroundProps) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(251,146,60,0.16),transparent_34%),radial-gradient(circle_at_18%_22%,rgba(251,191,36,0.12),transparent_22%),radial-gradient(circle_at_82%_18%,rgba(59,130,246,0.08),transparent_20%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,247,237,0.96)_22%,rgba(255,255,255,0.98)_56%,rgba(255,247,237,0.94))] dark:bg-[radial-gradient(circle_at_top,rgba(249,115,22,0.16),transparent_30%),radial-gradient(circle_at_18%_22%,rgba(251,191,36,0.08),transparent_22%),radial-gradient(circle_at_82%_18%,rgba(59,130,246,0.06),transparent_20%),linear-gradient(180deg,rgba(0,0,0,0.98),rgba(9,9,11,0.99)_24%,rgba(0,0,0,0.98)_62%,rgba(9,9,11,0.99))]" />

      <div
        className="absolute left-1/2 top-28 h-[26rem] w-[26rem] -translate-x-1/2 rounded-full border border-orange-200/40 bg-[radial-gradient(circle,rgba(255,255,255,0.92),rgba(255,247,237,0.34)_45%,transparent_72%)] blur-[1px] dark:border-orange-300/10 dark:bg-[radial-gradient(circle,rgba(251,191,36,0.12),rgba(249,115,22,0.06)_38%,transparent_72%)]"
        style={
          reduceMotion
            ? undefined
            : {
                animation: "om-platform-3d-float 12s ease-in-out infinite",
              }
        }
      />

      <div
        className="absolute left-1/2 top-20 h-[30rem] w-[30rem] -translate-x-1/2 rounded-full border border-orange-300/25 bg-transparent dark:border-orange-400/10"
        style={
          reduceMotion
            ? undefined
            : {
                animation: "om-platform-3d-spin 28s linear infinite",
              }
        }
      />

      <div
        className="absolute left-1/2 top-24 h-[22rem] w-[22rem] -translate-x-1/2 rounded-[32%] border border-white/70 bg-white/55 shadow-[0_40px_120px_rgba(249,115,22,0.12)] backdrop-blur-[2px] dark:border-white/10 dark:bg-white/5 dark:shadow-[0_40px_120px_rgba(249,115,22,0.08)]"
        style={
          reduceMotion
            ? { transform: "translateX(-50%) rotateX(64deg) rotateZ(12deg)" }
            : {
                transform: "translateX(-50%) rotateX(64deg) rotateZ(12deg)",
                animation: "om-platform-3d-spin-reverse 22s linear infinite",
              }
        }
      />

      <div
        className="absolute left-[12%] top-[28rem] h-40 w-40 rounded-[2rem] border border-orange-200/40 bg-white/45 shadow-[0_24px_90px_rgba(249,115,22,0.1)] backdrop-blur-md dark:border-white/10 dark:bg-white/5 dark:shadow-[0_28px_100px_rgba(249,115,22,0.06)]"
        style={
          reduceMotion
            ? { transform: "rotateX(58deg) rotateY(-18deg) rotateZ(-14deg)" }
            : {
                transform: "rotateX(58deg) rotateY(-18deg) rotateZ(-14deg)",
                animation: "om-platform-3d-drift-left 16s ease-in-out infinite",
              }
        }
      />

      <div
        className="absolute right-[10%] top-[32rem] h-44 w-44 rounded-[2rem] border border-orange-200/40 bg-white/45 shadow-[0_24px_90px_rgba(59,130,246,0.08)] backdrop-blur-md dark:border-white/10 dark:bg-white/5 dark:shadow-[0_28px_100px_rgba(59,130,246,0.06)]"
        style={
          reduceMotion
            ? { transform: "rotateX(60deg) rotateY(16deg) rotateZ(18deg)" }
            : {
                transform: "rotateX(60deg) rotateY(16deg) rotateZ(18deg)",
                animation: "om-platform-3d-drift-right 18s ease-in-out infinite",
              }
        }
      />

      <div className="absolute inset-x-0 top-0 h-[34rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.15),transparent)] dark:bg-[linear-gradient(180deg,rgba(0,0,0,0.2),transparent)]" />
    </div>
  );
}
