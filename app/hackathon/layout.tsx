import { HackathonNav } from "@/components/hackathon/hackathon-nav";

export default function HackathonLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <HackathonNav />
      {children}
    </div>
  );
}
