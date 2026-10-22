import { redirect } from "next/navigation";

// Le fil est maintenant l'accueil ; on garde les anciens liens (/feed, /feed?tag=…)
export default async function FeedRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const tag = typeof sp.tag === "string" ? sp.tag : "";
  redirect(tag ? `/?tag=${encodeURIComponent(tag)}` : "/");
}
