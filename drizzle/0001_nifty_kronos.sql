CREATE TABLE "connected_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"auth_type" text NOT NULL,
	"label" text NOT NULL,
	"identity" text NOT NULL,
	"encrypted_credentials" text NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL,
	"status_message" text,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "connected_accounts" ADD CONSTRAINT "connected_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "connected_accounts_tenant_provider_identity_uq" ON "connected_accounts" USING btree ("tenant_id","provider","identity");--> statement-breakpoint
CREATE INDEX "connected_accounts_tenant_idx" ON "connected_accounts" USING btree ("tenant_id");