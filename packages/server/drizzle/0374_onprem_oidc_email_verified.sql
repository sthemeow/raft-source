-- On-prem only: store the provider's email-verification claim on social auth
-- completions (shared by the web callback, the desktop/mobile handoff and
-- native Apple), so a link never marks a Raft account verified on the strength
-- of an unverified claim.
--
-- The column is nullable on purpose: NULL means "not recorded yet", and every
-- reader refuses it instead of treating it as false. A writer that forgets the
-- value therefore fails loudly rather than silently rejecting a valid link.
--
-- The backfill runs only when the column is first introduced, and only for
-- providers that passed verification under the old code.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'social_auth_completions' AND column_name = 'provider_email_verified'
  ) THEN
    ALTER TABLE social_auth_completions ADD COLUMN provider_email_verified boolean;
    UPDATE social_auth_completions SET provider_email_verified = true
      WHERE provider IN ('google', 'github', 'apple');
  END IF;
END $$;
