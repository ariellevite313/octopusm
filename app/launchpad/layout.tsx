import { LaunchpadBottomNav } from "@/components/launchpad/launchpad-bottom-nav";

export default function LaunchpadLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="pb-[calc(4rem+env(safe-area-inset-bottom,0px))] md:pb-0">{children}</div>
      <LaunchpadBottomNav />
    </>
  );
}
