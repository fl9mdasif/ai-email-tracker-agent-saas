CREATE TABLE "et_followup_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"reply_to_email_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"model" text,
	"error_code" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "et_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"contact_email" text NOT NULL,
	"contact_name" text,
	"temperature" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"last_email_id" uuid,
	"last_email_at" timestamp with time zone,
	"last_contacted_at" timestamp with time zone,
	"snoozed_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "et_send_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"draft_id" uuid,
	"account_id" uuid,
	"to_address" text NOT NULL,
	"sent_message_id" text,
	"outcome" text NOT NULL,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "et_email_analysis" ADD COLUMN "lead_temperature" text;--> statement-breakpoint
ALTER TABLE "et_email_analysis" ADD COLUMN "lead_reason" text;--> statement-breakpoint
ALTER TABLE "et_followup_drafts" ADD CONSTRAINT "et_followup_drafts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "et_followup_drafts" ADD CONSTRAINT "et_followup_drafts_lead_id_et_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."et_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "et_followup_drafts" ADD CONSTRAINT "et_followup_drafts_reply_to_email_id_et_emails_id_fk" FOREIGN KEY ("reply_to_email_id") REFERENCES "public"."et_emails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "et_followup_drafts" ADD CONSTRAINT "et_followup_drafts_account_id_connected_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."connected_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "et_leads" ADD CONSTRAINT "et_leads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "et_leads" ADD CONSTRAINT "et_leads_last_email_id_et_emails_id_fk" FOREIGN KEY ("last_email_id") REFERENCES "public"."et_emails"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "et_send_audit" ADD CONSTRAINT "et_send_audit_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "et_send_audit" ADD CONSTRAINT "et_send_audit_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "et_send_audit" ADD CONSTRAINT "et_send_audit_draft_id_et_followup_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."et_followup_drafts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "et_send_audit" ADD CONSTRAINT "et_send_audit_account_id_connected_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."connected_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "et_followup_drafts_tenant_lead_idx" ON "et_followup_drafts" USING btree ("tenant_id","lead_id");--> statement-breakpoint
CREATE INDEX "et_followup_drafts_tenant_created_idx" ON "et_followup_drafts" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "et_leads_tenant_contact_uq" ON "et_leads" USING btree ("tenant_id","contact_email");--> statement-breakpoint
CREATE INDEX "et_leads_tenant_temperature_idx" ON "et_leads" USING btree ("tenant_id","temperature");--> statement-breakpoint
CREATE INDEX "et_send_audit_tenant_created_idx" ON "et_send_audit" USING btree ("tenant_id","created_at");