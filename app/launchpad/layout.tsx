import { BottomNavWrapper } from "@/components/layout/bottom-nav-wrapper";

export default function LaunchpadLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="pb-28 md:pb-0">{children}</div>
      <BottomNavWrapper />
    </>
  );
}
