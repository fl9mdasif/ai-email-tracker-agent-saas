CREATE TABLE "platform_settings" (
	"id" text PRIMARY KEY DEFAULT 'platform' NOT NULL,
	"ai_scan_interval_minutes" integer DEFAULT 60 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "et_scan_state" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"last_scan_started_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "timezone" text DEFAULT 'Asia/Dhaka' NOT NULL;--> statement-breakpoint
ALTER TABLE "et_scan_state" ADD CONSTRAINT "et_scan_state_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;