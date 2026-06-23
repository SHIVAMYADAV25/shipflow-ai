CREATE TABLE IF NOT EXISTS "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "discovery_messages" DROP CONSTRAINT "discovery_messages_author_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "feature_requests" DROP CONSTRAINT "feature_requests_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "org_invitations" DROP CONSTRAINT "org_invitations_invited_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "org_members" DROP CONSTRAINT "org_members_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "prds" DROP CONSTRAINT "prds_approved_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT "projects_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "releases" DROP CONSTRAINT "releases_approved_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "reviews" DROP CONSTRAINT "reviews_resolved_by_user_id_users_id_fk";
DROP TABLE "users";--> statement-breakpoint
--> statement-breakpoint
ALTER TABLE "discovery_messages" ALTER COLUMN "author_user_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "feature_requests" ALTER COLUMN "created_by_user_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "org_invitations" ALTER COLUMN "invited_by_user_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "org_members" ALTER COLUMN "user_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "prds" ALTER COLUMN "approved_by_user_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "created_by_user_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "releases" ALTER COLUMN "approved_by_user_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "reviews" ALTER COLUMN "resolved_by_user_id" SET DATA TYPE text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "discovery_messages" ADD CONSTRAINT "discovery_messages_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "feature_requests" ADD CONSTRAINT "feature_requests_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "org_invitations" ADD CONSTRAINT "org_invitations_invited_by_user_id_user_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "org_members" ADD CONSTRAINT "org_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prds" ADD CONSTRAINT "prds_approved_by_user_id_user_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "releases" ADD CONSTRAINT "releases_approved_by_user_id_user_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reviews" ADD CONSTRAINT "reviews_resolved_by_user_id_user_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
