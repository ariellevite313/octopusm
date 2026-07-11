-- Fix: market_comments INSERT policy blocked createAdminClient() because
-- get_wallet_address() returns null for the service role (no user JWT).
-- Solution: drop the restrictive check and rely on the API route for auth.
-- The service role bypasses RLS entirely, so no INSERT policy is needed.

DROP POLICY IF EXISTS "market_comments_insert_authenticated" ON market_comments;

-- Also drop delete policy that has the same issue
DROP POLICY IF EXISTS "market_comments_delete_own" ON market_comments;

-- Re-create delete policy using auth.uid() pattern if needed in future,
-- but for now API routes handle all writes via service role.
