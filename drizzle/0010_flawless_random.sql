CREATE TABLE "et_chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"cited_email_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'ok' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "et_chat_messages" ADD CONSTRAINT "et_chat_messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "et_chat_messages" ADD CONSTRAINT "et_chat_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "et_chat_messages_tenant_created_idx" ON "et_chat_messages" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "et_chat_messages_user_created_idx" ON "et_chat_messages" USING btree ("tenant_id","user_id","created_at");