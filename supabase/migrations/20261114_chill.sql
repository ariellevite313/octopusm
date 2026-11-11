-- « Chill ton sac » : un détenteur montre un token (hors tokens OM) dans le fil ; quand quelqu'un l'achète ou le vend
-- depuis son post, il reçoit 40 % des frais OM (0,12 % sur 0,3 %), payés dans la même transaction.

-- 1. Posts « sac »
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS bag_mint text;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS bag_symbol text;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS bag_name text;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS bag_logo text;
ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_kind_check;
ALTER TABLE public.posts ADD CONSTRAINT posts_kind_check CHECK (kind IN ('post', 'article', 'bag'));
ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_bag_check;
ALTER TABLE public.posts ADD CONSTRAINT posts_bag_check CHECK (
  kind <> 'bag' OR (bag_mint IS NOT NULL AND char_length(bag_mint) BETWEEN 32 AND 44 AND bag_symbol IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_posts_bags ON public.posts (bag_mint, created_at DESC) WHERE kind = 'bag';

-- 2. Part du détenteur sur chaque swap
ALTER TABLE public.swaps ADD COLUMN IF NOT EXISTS ref_post uuid;
ALTER TABLE public.swaps ADD COLUMN IF NOT EXISTS ref_wallet text;
ALTER TABLE public.swaps ADD COLUMN IF NOT EXISTS ref_amount numeric NOT NULL DEFAULT 0; -- unités brutes (lamports ou USDC)
ALTER TABLE public.swaps ADD COLUMN IF NOT EXISTS ref_usd numeric;
CREATE INDEX IF NOT EXISTS swaps_ref_idx ON public.swaps (ref_wallet, created_at DESC) WHERE ref_wallet IS NOT NULL;

-- 3. Notification au détenteur
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check
  CHECK (kind IN ('follow', 'mention', 'reply', 'like', 'repost', 'quote', 'reply_like', 'reply_reply', 'tip', 'chill'));
