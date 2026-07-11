-- Drop and recreate the prediction_history_with_status view
-- result_status logic:
--   pending_review       => admin has not yet approved/rejected (admin_decision_status IS NULL)
--   rejected             => admin rejected (admin_decision_status = 'rejected')
--   approved_pending_result => approved but market not yet resolved
--   win / lose           => market resolved, outcome known
--   claimed              => user claimed payout
--   paid                 => payout sent

DROP VIEW IF EXISTS prediction_history_with_status;

CREATE VIEW prediction_history_with_status AS
SELECT
  ph.*,
  CASE
    WHEN ph.admin_decision_status = 'rejected'                              THEN 'rejected'
    WHEN ph.admin_decision_status IS NULL                                    THEN 'pending_review'
    WHEN ph.claimed_at IS NOT NULL OR ph.payout_status = 'claimed'          THEN 'claimed'
    WHEN ph.paid_at IS NOT NULL    OR ph.payout_status = 'paid'             THEN 'paid'
    WHEN ph.resolution_outcome_id IS NOT NULL AND ph.resolution_outcome_id = ph.selection_id THEN 'win'
    WHEN ph.resolution_outcome_id IS NOT NULL AND ph.resolution_outcome_id <> ph.selection_id THEN 'lose'
    ELSE 'approved_pending_result'
  END::text AS result_status
FROM prediction_history ph;

-- Grant access
GRANT SELECT ON prediction_history_with_status TO authenticated;
GRANT SELECT ON prediction_history_with_status TO service_role;
