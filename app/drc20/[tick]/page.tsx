import type { Metadata } from "next";
import { Drc20TokenView } from "@/components/drc20/drc20-token";

type Props = { params: Promise<{ tick: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tick = decodeURIComponent((await params).tick).toUpperCase();
  return { title: `${tick} · DRC-20 | OMdotfun`, description: `${tick} on Dogecoin (DRC-20): holders, mint progress and activity on OMdotfun.` };
}

export default async function Drc20TokenPage({ params }: Props) {
  return <Drc20TokenView tick={decodeURIComponent((await params).tick)} />;
}
