import type { Metadata } from "next";
import { ArticleEditor } from "@/components/social/article-editor";

export const metadata: Metadata = { title: "Write an article" };
export default function Page() { return <ArticleEditor />; }
