-- Add 'cancelled' value to mutuel_market_status enum
-- Run in Supabase SQL editor

ALTER TYPE mutuel_market_status ADD VALUE IF NOT EXISTS 'cancelled';
