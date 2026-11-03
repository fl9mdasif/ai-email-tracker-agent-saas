CREATE TABLE "et_email_state" (
	"email_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"handled_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "et_followups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email_id" uuid NOT NULL,
	"thread_id" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "et_email_state" ADD CONSTRAINT "et_email_state_email_id_et_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."et_emails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "et_email_state" ADD CONSTRAINT "et_email_state_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "et_followups" ADD CONSTRAINT "et_followups_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "et_followups" ADD CONSTRAINT "et_followups_email_id_et_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."et_emails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "et_email_state_tenant_idx" ON "et_email_state" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "et_followups_tenant_status_due_idx" ON "et_followups" USING btree ("tenant_id","status","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "et_followups_ai_email_uq" ON "et_followups" USING btree ("email_id") WHERE "et_followups"."source" = 'ai';