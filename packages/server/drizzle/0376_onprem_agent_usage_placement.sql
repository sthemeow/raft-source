-- Serialize the initial snapshot with all machine-assignment writers. This is
-- one transaction with trigger installation, so no transition falls between.
LOCK TABLE public.agents IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
DO $usage_placement$
DECLARE prior_path text := current_setting('search_path');
BEGIN
  PERFORM set_config('search_path', 'pg_catalog, public', true);
  IF to_regclass('public.agent_usage_placements') IS NULL THEN
    CREATE TABLE public.agent_usage_placements (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      server_id uuid NOT NULL CONSTRAINT agent_usage_placements_server_id_servers_id_fk REFERENCES public.servers(id) ON DELETE CASCADE,
      agent_id uuid NOT NULL CONSTRAINT agent_usage_placements_agent_id_agents_id_fk REFERENCES public.agents(id) ON DELETE CASCADE,
      machine_id uuid NOT NULL,
      started_at timestamptz NOT NULL,
      ended_at timestamptz,
      CONSTRAINT agent_usage_placements_range CHECK (ended_at IS NULL OR started_at <= ended_at)
    );
    -- Only the current assignment is known at install time. Do not assert a
    -- placement before this migration or recreate this snapshot on replay.
    INSERT INTO public.agent_usage_placements (server_id, agent_id, machine_id, started_at)
      SELECT server_id, id, daemon_id, clock_timestamp() FROM public.agents
      WHERE daemon_id IS NOT NULL AND deleted_at IS NULL;
  END IF;
  IF EXISTS (
    WITH expected(col, typ, required, default_expr) AS (VALUES
      ('id','uuid',true,'gen_random_uuid()'::text),
      ('server_id','uuid',true,NULL::text), ('agent_id','uuid',true,NULL::text),
      ('machine_id','uuid',true,NULL::text),
      ('started_at','timestamp with time zone',true,NULL::text),
      ('ended_at','timestamp with time zone',false,NULL::text)
    ), actual AS (
      SELECT a.attname::text, format_type(a.atttypid,a.atttypmod), a.attnotnull,
             pg_get_expr(d.adbin,d.adrelid)
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
      LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
      WHERE n.nspname='public' AND c.relname='agent_usage_placements' AND c.relkind='r'
    ) (SELECT * FROM expected EXCEPT SELECT * FROM actual)
      UNION ALL (SELECT * FROM actual EXCEPT SELECT * FROM expected)
  ) THEN RAISE EXCEPTION 'Agent usage placement migration found incompatible columns'; END IF;
  IF EXISTS (
    WITH expected(name, definition) AS (VALUES
      ('agent_usage_placements_pkey','PRIMARY KEY (id)'),
      ('agent_usage_placements_server_id_servers_id_fk','FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE'),
      ('agent_usage_placements_agent_id_agents_id_fk','FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE'),
      ('agent_usage_placements_range','CHECK (((ended_at IS NULL) OR (started_at <= ended_at)))')
    ), actual AS (
      SELECT con.conname::text, pg_get_constraintdef(con.oid)
      FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname='agent_usage_placements' AND con.convalidated
    ) (SELECT * FROM expected EXCEPT SELECT * FROM actual)
      UNION ALL (SELECT * FROM actual EXCEPT SELECT * FROM expected)
  ) THEN RAISE EXCEPTION 'Agent usage placement migration found incompatible constraints'; END IF;
  PERFORM set_config('search_path', prior_path, true);
END $usage_placement$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_agent_usage_placements_agent_time ON public.agent_usage_placements (server_id, agent_id, started_at);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_usage_placements_agent_open ON public.agent_usage_placements (agent_id) WHERE ended_at IS NULL;
--> statement-breakpoint
DO $usage_indexes$
DECLARE prior_path text := current_setting('search_path');
BEGIN
  PERFORM set_config('search_path', 'pg_catalog, public', true);
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='agent_usage_placements' AND indexname='idx_agent_usage_placements_agent_time' AND indexdef='CREATE INDEX idx_agent_usage_placements_agent_time ON public.agent_usage_placements USING btree (server_id, agent_id, started_at)')
    OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='agent_usage_placements' AND indexname='idx_agent_usage_placements_agent_open' AND indexdef='CREATE UNIQUE INDEX idx_agent_usage_placements_agent_open ON public.agent_usage_placements USING btree (agent_id) WHERE (ended_at IS NULL)')
  THEN RAISE EXCEPTION 'Agent usage placement migration found incompatible indexes'; END IF;
  PERFORM set_config('search_path', prior_path, true);
END $usage_indexes$;
--> statement-breakpoint
DO $usage_existing_function$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='track_agent_usage_placement' AND p.pronargs=0 AND p.prosrc <> $usage_expected$
DECLARE boundary timestamptz := clock_timestamp();
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.daemon_id IS NOT NULL AND NEW.deleted_at IS NULL THEN
      INSERT INTO public.agent_usage_placements (server_id, agent_id, machine_id, started_at)
        VALUES (NEW.server_id, NEW.id, NEW.daemon_id, boundary);
    END IF;
  ELSIF OLD.daemon_id IS DISTINCT FROM NEW.daemon_id OR OLD.server_id IS DISTINCT FROM NEW.server_id OR (OLD.deleted_at IS NULL) IS DISTINCT FROM (NEW.deleted_at IS NULL) THEN
    UPDATE public.agent_usage_placements SET ended_at = GREATEST(boundary, started_at)
      WHERE agent_id = NEW.id AND ended_at IS NULL;
    IF NEW.daemon_id IS NOT NULL AND NEW.deleted_at IS NULL THEN
      INSERT INTO public.agent_usage_placements (server_id, agent_id, machine_id, started_at)
        VALUES (NEW.server_id, NEW.id, NEW.daemon_id, boundary);
    END IF;
  END IF;
  RETURN NEW;
END $usage_expected$) THEN
    RAISE EXCEPTION 'Agent usage placement function already exists with a different definition';
  END IF;
END $usage_existing_function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.track_agent_usage_placement() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $usage_trigger$
DECLARE boundary timestamptz := clock_timestamp();
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.daemon_id IS NOT NULL AND NEW.deleted_at IS NULL THEN
      INSERT INTO public.agent_usage_placements (server_id, agent_id, machine_id, started_at)
        VALUES (NEW.server_id, NEW.id, NEW.daemon_id, boundary);
    END IF;
  ELSIF OLD.daemon_id IS DISTINCT FROM NEW.daemon_id OR OLD.server_id IS DISTINCT FROM NEW.server_id OR (OLD.deleted_at IS NULL) IS DISTINCT FROM (NEW.deleted_at IS NULL) THEN
    UPDATE public.agent_usage_placements SET ended_at = GREATEST(boundary, started_at)
      WHERE agent_id = NEW.id AND ended_at IS NULL;
    IF NEW.daemon_id IS NOT NULL AND NEW.deleted_at IS NULL THEN
      INSERT INTO public.agent_usage_placements (server_id, agent_id, machine_id, started_at)
        VALUES (NEW.server_id, NEW.id, NEW.daemon_id, boundary);
    END IF;
  END IF;
  RETURN NEW;
END $usage_trigger$;
--> statement-breakpoint
DO $usage_install_trigger$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace WHERE n.nspname='public' AND c.relname='agents' AND t.tgname='track_agent_usage_placement' AND NOT (pn.nspname='public' AND p.proname='track_agent_usage_placement' AND t.tgtype=21 AND t.tgenabled='O' AND t.tgqual IS NULL AND t.tgattr::text = (SELECT string_agg(a.attnum::text, ' ' ORDER BY CASE a.attname WHEN 'daemon_id' THEN 1 WHEN 'server_id' THEN 2 ELSE 3 END) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname IN ('daemon_id','server_id','deleted_at')))) THEN
    RAISE EXCEPTION 'Agent usage placement trigger name is already in use';
  END IF;
END $usage_install_trigger$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS track_agent_usage_placement ON public.agents;
--> statement-breakpoint
CREATE TRIGGER track_agent_usage_placement AFTER INSERT OR UPDATE OF daemon_id, server_id, deleted_at ON public.agents FOR EACH ROW EXECUTE FUNCTION public.track_agent_usage_placement();
