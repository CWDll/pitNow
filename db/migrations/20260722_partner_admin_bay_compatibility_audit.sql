BEGIN;

ALTER TABLE public.partner_admin_audit_logs
  DROP CONSTRAINT IF EXISTS partner_admin_audit_logs_action_check;

ALTER TABLE public.partner_admin_audit_logs
  ADD CONSTRAINT partner_admin_audit_logs_action_check CHECK (
    action IN (
      'BAY_ACTIVE_UPDATED',
      'BAY_COMPATIBILITY_UPDATED',
      'AVAILABILITY_BLOCK_CREATED',
      'AVAILABILITY_BLOCK_UPDATED',
      'AVAILABILITY_BLOCK_DEACTIVATED',
      'AVAILABILITY_BLOCK_REACTIVATED',
      'RESERVATION_NOTE_CREATED',
      'RESERVATION_NOTE_RESOLVED',
      'RESERVATION_NOTE_REOPENED'
    )
  );

COMMIT;
