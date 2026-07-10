-- Extend payments_flow_check to include pool flows
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_flow_check;
ALTER TABLE payments ADD CONSTRAINT payments_flow_check
  CHECK (flow IN ('prediction', 'launch', 'listing', 'pool_prediction', 'pool_creation'));
