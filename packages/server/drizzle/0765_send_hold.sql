-- Send hold. ADD COLUMN on users is catalog-only (nullable, no default); give up after 2 s rather than queue sign-ins behind a long transaction.
SET LOCAL lock_timeout = '2s';--> statement-breakpoint
CREATE TABLE "pending_human_sends" (
	"id" uuid PRIMARY KEY NOT NULL,
	"server_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"sender_user_id" uuid NOT NULL,
	"random_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"releasing" boolean DEFAULT false NOT NULL,
	"release_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "send_hold_seconds" smallint;--> statement-breakpoint
ALTER TABLE "pending_human_sends" ADD CONSTRAINT "pending_human_sends_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_human_sends" ADD CONSTRAINT "pending_human_sends_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_human_sends" ADD CONSTRAINT "pending_human_sends_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_pending_human_sends_sender_channel" ON "pending_human_sends" USING btree ("sender_user_id","channel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_pending_human_sends_sender_random" ON "pending_human_sends" USING btree ("sender_user_id","random_id");--> statement-breakpoint
CREATE INDEX "idx_pending_human_sends_release_at" ON "pending_human_sends" USING btree ("release_at");