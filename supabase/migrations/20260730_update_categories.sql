-- Migration: unifier les catégories vers le nouveau système
-- Anciens slugs → nouveaux slugs

-- prediction_markets (category_id)
UPDATE prediction_markets SET category_id = 'culture'    WHERE category_id = 'entertainment';
UPDATE prediction_markets SET category_id = 'tech'       WHERE category_id = 'science';
UPDATE prediction_markets SET category_id = 'esports'    WHERE category_id = 'gaming';
UPDATE prediction_markets SET category_id = 'mentions'   WHERE category_id = 'other';

-- mutuel_markets (category)
UPDATE mutuel_markets SET category = 'culture'    WHERE category = 'entertainment';
UPDATE mutuel_markets SET category = 'tech'       WHERE category = 'science';
UPDATE mutuel_markets SET category = 'esports'    WHERE category = 'gaming';
UPDATE mutuel_markets SET category = 'mentions'   WHERE category = 'other';
UPDATE mutuel_markets SET category = 'mentions'   WHERE category = 'general';
