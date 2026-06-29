BEGIN;

CREATE OR REPLACE FUNCTION admin_search_partner_admin_audit_logs(
  p_action text DEFAULT NULL,
  p_created_after timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_partner_id uuid DEFAULT NULL,
  p_query text DEFAULT NULL,
  p_target_type text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  partner_id uuid,
  partner_name text,
  actor_user_id uuid,
  action text,
  target_type text,
  target_id uuid,
  reservation_id uuid,
  before_state jsonb,
  after_state jsonb,
  metadata jsonb,
  created_at timestamptz,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH filtered AS (
    SELECT
      logs.id,
      logs.partner_id,
      COALESCE(partners.name, 'Unknown partner') AS partner_name,
      logs.actor_user_id,
      logs.action,
      logs.target_type,
      logs.target_id,
      logs.reservation_id,
      logs.before_state,
      logs.after_state,
      logs.metadata,
      logs.created_at
    FROM partner_admin_audit_logs AS logs
    LEFT JOIN partners ON partners.id = logs.partner_id
    WHERE (p_action IS NULL OR logs.action = p_action)
      AND (p_created_after IS NULL OR logs.created_at >= p_created_after)
      AND (p_partner_id IS NULL OR logs.partner_id = p_partner_id)
      AND (p_target_type IS NULL OR logs.target_type = p_target_type)
      AND (
        NULLIF(BTRIM(p_query), '') IS NULL
        OR logs.id::text ILIKE '%' || p_query || '%'
        OR logs.partner_id::text ILIKE '%' || p_query || '%'
        OR COALESCE(partners.name, '') ILIKE '%' || p_query || '%'
        OR COALESCE(logs.actor_user_id::text, '') ILIKE '%' || p_query || '%'
        OR logs.action ILIKE '%' || p_query || '%'
        OR logs.target_type ILIKE '%' || p_query || '%'
        OR logs.target_id::text ILIKE '%' || p_query || '%'
        OR COALESCE(logs.reservation_id::text, '') ILIKE '%' || p_query || '%'
        OR logs.before_state::text ILIKE '%' || p_query || '%'
        OR logs.after_state::text ILIKE '%' || p_query || '%'
        OR logs.metadata::text ILIKE '%' || p_query || '%'
      )
  ),
  counted AS (
    SELECT COUNT(*) AS total_count
    FROM filtered
  )
  SELECT
    filtered.id,
    filtered.partner_id,
    filtered.partner_name,
    filtered.actor_user_id,
    filtered.action,
    filtered.target_type,
    filtered.target_id,
    filtered.reservation_id,
    filtered.before_state,
    filtered.after_state,
    filtered.metadata,
    filtered.created_at,
    counted.total_count
  FROM filtered
  CROSS JOIN counted
  ORDER BY filtered.created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100)
  OFFSET GREATEST(p_offset, 0);
$$;

REVOKE ALL ON FUNCTION admin_search_partner_admin_audit_logs(
  text,
  timestamptz,
  integer,
  integer,
  uuid,
  text,
  text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION admin_search_partner_admin_audit_logs(
  text,
  timestamptz,
  integer,
  integer,
  uuid,
  text,
  text
) TO service_role;

COMMIT;
