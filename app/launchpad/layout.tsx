import { LaunchpadBottomNav } from "@/components/launchpad/launchpad-bottom-nav";

export default function LaunchpadLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="pb-28 md:pb-0">{children}</div>
      <LaunchpadBottomNav />
    </>
  );
}
