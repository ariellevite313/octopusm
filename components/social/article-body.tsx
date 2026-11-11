/** Affiche le texte d'un article (blocs déjà découpés : jamais de HTML interprété). */
import Link from "next/link";
import { parseArticle, type Inline } from "@/lib/social/article";

function Inl({ c }: { c: Inline[] }) {
  return (
    <>
      {c.map((x, i) => {
        if (x.t === "text") return <span key={i}>{x.v}</span>;
        if (x.t === "b") return <strong key={i} className="font-bold text-foreground"><Inl c={x.c} /></strong>;
        if (x.t === "i") return <em key={i}><Inl c={x.c} /></em>;
        if (x.t === "s") return <s key={i}><Inl c={x.c} /></s>;
        return x.href.startsWith("/")
          ? <Link key={i} href={x.href} className="font-medium text-foreground underline underline-offset-2"><Inl c={x.c} /></Link>
          : <a key={i} href={x.href} target="_blank" rel="noopener noreferrer nofollow ugc" className="font-medium text-foreground underline underline-offset-2 [overflow-wrap:anywhere]"><Inl c={x.c} /></a>;
      })}
    </>
  );
}

export function ArticleBody({ md }: { md: string }) {
  const blocks = parseArticle(md);
  return (
    <div className="text-[17px] leading-[1.68] text-foreground/90">
      {blocks.map((b, i) => {
        switch (b.t) {
          case "h2": return <h2 key={i} className="mb-3 mt-8 text-[22px] font-extrabold leading-tight text-foreground"><Inl c={b.c} /></h2>;
          case "h3": return <h3 key={i} className="mb-2 mt-6 text-[19px] font-bold leading-snug text-foreground"><Inl c={b.c} /></h3>;
          case "quote": return <blockquote key={i} className="my-5 border-l-4 border-[#a3e635] pl-4 italic text-foreground/80"><Inl c={b.c} /></blockquote>;
          case "ul": return <ul key={i} className="mb-5 ml-6 list-disc space-y-1.5">{b.items.map((it, j) => <li key={j}><Inl c={it} /></li>)}</ul>;
          case "ol": return <ol key={i} className="mb-5 ml-6 list-decimal space-y-1.5">{b.items.map((it, j) => <li key={j}><Inl c={it} /></li>)}</ol>;
          case "hr": return <hr key={i} className="my-8 border-border" />;
          case "img": return (
            <figure key={i} className="my-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={b.src} alt={b.alt} loading="lazy" className="w-full rounded-2xl bg-muted object-cover" />
              {b.alt && <figcaption className="mt-2 text-center text-[13px] text-muted-foreground">{b.alt}</figcaption>}
            </figure>
          );
          default: return <p key={i} className="mb-5 [overflow-wrap:anywhere]"><Inl c={b.c} /></p>;
        }
      })}
    </div>
  );
}
