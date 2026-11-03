CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"price_monthly_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"max_accounts" integer DEFAULT 1 NOT NULL,
	"daily_ai_limit" integer DEFAULT 50 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_email" text NOT NULL,
	"actor_role" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text DEFAULT '' NOT NULL,
	"target_id" text DEFAULT '' NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_invites" (
	"email" text PRIMARY KEY NOT NULL,
	"invited_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_staff" (
	"email" text PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"disabled" boolean DEFAULT false NOT NULL,
	"added_by" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "default_plan_id" uuid;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "signups_open" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "announcement_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "announcement_level" text DEFAULT 'info' NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "announcement_active" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "plan_id" uuid;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "ai_daily_limit" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_login_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "plans_key_uq" ON "plans" USING btree ("key");--> statement-breakpoint
CREATE INDEX "platform_audit_log_created_idx" ON "platform_audit_log" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_default_plan_id_plans_id_fk" FOREIGN KEY ("default_plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Starting plans. The names, prices and limits are placeholders for the owner to edit in the platform dashboard.
INSERT INTO "plans" ("key", "name", "price_monthly_cents", "currency", "max_accounts", "daily_ai_limit", "is_default", "active") VALUES
	('free', 'Free', 0, 'USD', 1, 50, true, true),
	('starter', 'Starter', 1900, 'USD', 3, 300, false, true),
	('pro', 'Pro', 4900, 'USD', 10, 1500, false, true)
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
-- Workspaces that already exist keep working as before: they start on the top plan.
UPDATE "tenants" SET "plan_id" = (SELECT "id" FROM "plans" WHERE "key" = 'pro') WHERE "plan_id" IS NULL;