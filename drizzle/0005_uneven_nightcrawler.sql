CREATE TABLE "et_email_analysis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email_id" uuid NOT NULL,
	"status" text NOT NULL,
	"category" text,
	"priority" integer,
	"needs_reply" boolean,
	"summary" text,
	"suggested_action" text,
	"model" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "et_email_analysis" ADD CONSTRAINT "et_email_analysis_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "et_email_analysis" ADD CONSTRAINT "et_email_analysis_email_id_et_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."et_emails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "et_email_analysis_email_uq" ON "et_email_analysis" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "et_email_analysis_tenant_status_idx" ON "et_email_analysis" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "et_email_analysis_tenant_priority_idx" ON "et_email_analysis" USING btree ("tenant_id","priority");