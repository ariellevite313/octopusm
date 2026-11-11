-- Articles longs : un post de type « article » avec titre, couverture et texte (Markdown limité, rendu sans HTML).
-- Dans le fil, posts.body garde un extrait en texte simple (traduction, recherche et contraintes inchangées).
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'post';
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS cover_url text;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS article_md text;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS article_images text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS read_minutes integer;

ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_kind_check;
ALTER TABLE public.posts ADD CONSTRAINT posts_kind_check CHECK (kind IN ('post', 'article'));
ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_article_check;
ALTER TABLE public.posts ADD CONSTRAINT posts_article_check CHECK (
  kind <> 'article' OR (
    title IS NOT NULL AND char_length(title) BETWEEN 3 AND 120
    AND article_md IS NOT NULL AND char_length(article_md) BETWEEN 50 AND 20000
    AND coalesce(array_length(article_images, 1), 0) <= 12
  )
);

CREATE INDEX IF NOT EXISTS idx_posts_articles ON public.posts (author, created_at DESC) WHERE kind = 'article';
