import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * Returns the connected wallet address for the current request.
 * Uses React.cache so the Supabase getUser() call is deduped
 * across layout + sub-pages in the same render tree.
 */
export const getWalletAddress = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return (user?.user_metadata?.wallet_address as string | undefined) ?? null;
});
