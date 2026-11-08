CREATE INDEX IF NOT EXISTS idx_agent_usage_records_server_agent_received ON public.agent_usage_records (server_id, agent_id, received_at);
--> statement-breakpoint
DO $usage_received_index$
DECLARE prior_path text := current_setting('search_path');
BEGIN
  PERFORM set_config('search_path', 'pg_catalog, public', true);
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes i JOIN pg_class c ON c.relname=i.indexname
    JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname=i.schemaname
    JOIN pg_index x ON x.indexrelid=c.oid
    WHERE i.schemaname='public' AND i.tablename='agent_usage_records'
      AND i.indexname='idx_agent_usage_records_server_agent_received'
      AND i.indexdef='CREATE INDEX idx_agent_usage_records_server_agent_received ON public.agent_usage_records USING btree (server_id, agent_id, received_at)'
      AND x.indisvalid AND x.indisready
  ) THEN RAISE EXCEPTION 'Agent usage received-time index is incompatible'; END IF;
  PERFORM set_config('search_path', prior_path, true);
END $usage_received_index$;
