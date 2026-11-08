-- On-prem usage accounting. Computer IDs are historical provenance rather
-- than foreign keys, so deleting an attachment does not erase its history.
CREATE TABLE IF NOT EXISTS public.agent_usage_records (
  id uuid PRIMARY KEY,
  server_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  computer_id uuid NOT NULL,
  runtime text NOT NULL,
  ended_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  complete boolean NOT NULL,
  input_tokens bigint,
  output_tokens bigint,
  cache_read_tokens bigint,
  cache_write_tokens bigint,
  reasoning_tokens bigint,
  CONSTRAINT agent_usage_records_server_id_servers_id_fk FOREIGN KEY (server_id) REFERENCES public.servers(id) ON DELETE CASCADE,
  CONSTRAINT agent_usage_records_agent_id_agents_id_fk FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE,
  CONSTRAINT agent_usage_records_runtime CHECK (runtime IN ('claude', 'codex', 'opencode')),
  CONSTRAINT agent_usage_records_nonnegative CHECK (
    (input_tokens IS NULL OR input_tokens >= 0) AND
    (output_tokens IS NULL OR output_tokens >= 0) AND
    (cache_read_tokens IS NULL OR cache_read_tokens >= 0) AND
    (cache_write_tokens IS NULL OR cache_write_tokens >= 0) AND
    (reasoning_tokens IS NULL OR reasoning_tokens >= 0)
  ),
  CONSTRAINT agent_usage_records_complete_observed CHECK (
    NOT complete OR input_tokens IS NOT NULL OR output_tokens IS NOT NULL OR
    cache_read_tokens IS NOT NULL OR cache_write_tokens IS NOT NULL OR reasoning_tokens IS NOT NULL
  )
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_agent_usage_records_server_agent_time ON public.agent_usage_records (server_id, agent_id, ended_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_agent_usage_records_server_time ON public.agent_usage_records (server_id, ended_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.agent_usage_gaps (
  id uuid PRIMARY KEY,
  server_id uuid NOT NULL,
  computer_id uuid NOT NULL,
  first_ended_at timestamptz NOT NULL,
  last_ended_at timestamptz NOT NULL,
  failed_attempts bigint NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_usage_gaps_server_id_servers_id_fk FOREIGN KEY (server_id) REFERENCES public.servers(id) ON DELETE CASCADE,
  CONSTRAINT agent_usage_gaps_range CHECK (first_ended_at <= last_ended_at AND failed_attempts > 0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_agent_usage_gaps_server_computer_time ON public.agent_usage_gaps (server_id, computer_id, first_ended_at);
--> statement-breakpoint
-- IF NOT EXISTS must never disguise a conflicting table on replay. Validate
-- columns, defaults, constraints and the required indexes before proceeding.
DO $usage_migration$
DECLARE
  previous_search_path text := current_setting('search_path');
BEGIN
  -- Make catalog-rendered constraint definitions independent of the
  -- migration connection's search_path, then restore it before returning.
  PERFORM set_config('search_path', 'pg_catalog, public', true);
  IF EXISTS (
    WITH expected(tbl, col, typ, required, default_expr) AS (VALUES
      ('agent_usage_records','id','uuid',true,NULL::text),
      ('agent_usage_records','server_id','uuid',true,NULL::text),
      ('agent_usage_records','agent_id','uuid',true,NULL::text),
      ('agent_usage_records','computer_id','uuid',true,NULL::text),
      ('agent_usage_records','runtime','text',true,NULL::text),
      ('agent_usage_records','ended_at','timestamp with time zone',true,NULL::text),
      ('agent_usage_records','received_at','timestamp with time zone',true,'now()'),
      ('agent_usage_records','complete','boolean',true,NULL::text),
      ('agent_usage_records','input_tokens','bigint',false,NULL::text),
      ('agent_usage_records','output_tokens','bigint',false,NULL::text),
      ('agent_usage_records','cache_read_tokens','bigint',false,NULL::text),
      ('agent_usage_records','cache_write_tokens','bigint',false,NULL::text),
      ('agent_usage_records','reasoning_tokens','bigint',false,NULL::text),
      ('agent_usage_gaps','id','uuid',true,NULL::text),
      ('agent_usage_gaps','server_id','uuid',true,NULL::text),
      ('agent_usage_gaps','computer_id','uuid',true,NULL::text),
      ('agent_usage_gaps','first_ended_at','timestamp with time zone',true,NULL::text),
      ('agent_usage_gaps','last_ended_at','timestamp with time zone',true,NULL::text),
      ('agent_usage_gaps','failed_attempts','bigint',true,NULL::text),
      ('agent_usage_gaps','received_at','timestamp with time zone',true,'now()')
    ), actual AS (
      SELECT c.relname::text AS tbl, a.attname::text AS col,
             format_type(a.atttypid, a.atttypmod) AS typ, a.attnotnull AS required,
             pg_get_expr(d.adbin, d.adrelid) AS default_expr
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
      LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
      WHERE n.nspname = 'public' AND c.relname IN ('agent_usage_records','agent_usage_gaps') AND c.relkind = 'r'
    )
    (SELECT * FROM expected EXCEPT SELECT * FROM actual)
    UNION ALL
    (SELECT * FROM actual EXCEPT SELECT * FROM expected)
  ) THEN RAISE EXCEPTION 'Agent usage migration found incompatible table columns or defaults'; END IF;

  IF EXISTS (
    WITH expected(tbl, name, definition) AS (VALUES
      ('agent_usage_records','agent_usage_records_pkey','PRIMARY KEY (id)'),
      ('agent_usage_records','agent_usage_records_server_id_servers_id_fk','FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE'),
      ('agent_usage_records','agent_usage_records_agent_id_agents_id_fk','FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE'),
      ('agent_usage_records','agent_usage_records_runtime',$v$CHECK ((runtime = ANY (ARRAY['claude'::text, 'codex'::text, 'opencode'::text])))$v$),
      ('agent_usage_records','agent_usage_records_nonnegative',$v$CHECK ((((input_tokens IS NULL) OR (input_tokens >= 0)) AND ((output_tokens IS NULL) OR (output_tokens >= 0)) AND ((cache_read_tokens IS NULL) OR (cache_read_tokens >= 0)) AND ((cache_write_tokens IS NULL) OR (cache_write_tokens >= 0)) AND ((reasoning_tokens IS NULL) OR (reasoning_tokens >= 0))))$v$),
      ('agent_usage_records','agent_usage_records_complete_observed',$v$CHECK (((NOT complete) OR (input_tokens IS NOT NULL) OR (output_tokens IS NOT NULL) OR (cache_read_tokens IS NOT NULL) OR (cache_write_tokens IS NOT NULL) OR (reasoning_tokens IS NOT NULL)))$v$),
      ('agent_usage_gaps','agent_usage_gaps_pkey','PRIMARY KEY (id)'),
      ('agent_usage_gaps','agent_usage_gaps_server_id_servers_id_fk','FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE'),
      ('agent_usage_gaps','agent_usage_gaps_range','CHECK (((first_ended_at <= last_ended_at) AND (failed_attempts > 0)))')
    ), actual AS (
      SELECT c.relname::text AS tbl, co.conname::text AS name, pg_get_constraintdef(co.oid) AS definition
      FROM pg_constraint co JOIN pg_class c ON c.oid = co.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname IN ('agent_usage_records','agent_usage_gaps') AND co.convalidated
    )
    (SELECT * FROM expected EXCEPT SELECT * FROM actual)
    UNION ALL
    (SELECT * FROM actual EXCEPT SELECT * FROM expected)
  ) THEN RAISE EXCEPTION 'Agent usage migration found incompatible constraints'; END IF;

  IF EXISTS (
    WITH expected(name, definition) AS (VALUES
      ('idx_agent_usage_records_server_agent_time','CREATE INDEX idx_agent_usage_records_server_agent_time ON public.agent_usage_records USING btree (server_id, agent_id, ended_at)'),
      ('idx_agent_usage_records_server_time','CREATE INDEX idx_agent_usage_records_server_time ON public.agent_usage_records USING btree (server_id, ended_at)'),
      ('idx_agent_usage_gaps_server_computer_time','CREATE INDEX idx_agent_usage_gaps_server_computer_time ON public.agent_usage_gaps USING btree (server_id, computer_id, first_ended_at)')
    )
    SELECT 1 FROM expected e WHERE NOT EXISTS (
      SELECT 1 FROM pg_indexes i JOIN pg_class ic ON ic.relname = i.indexname
      JOIN pg_namespace n ON n.oid = ic.relnamespace AND n.nspname = i.schemaname
      JOIN pg_index ix ON ix.indexrelid = ic.oid
      WHERE i.schemaname = 'public' AND i.indexname = e.name AND i.indexdef = e.definition AND ix.indisvalid
    )
  ) THEN RAISE EXCEPTION 'Agent usage migration found incompatible indexes'; END IF;
  PERFORM set_config('search_path', previous_search_path, true);
END
$usage_migration$;
