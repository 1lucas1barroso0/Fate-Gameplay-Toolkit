CREATE TABLE "entries" (
	"id" text PRIMARY KEY NOT NULL,
	"room_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"request_id" text NOT NULL,
	"type" text NOT NULL,
	"body" text NOT NULL,
	"data_json" text NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "entries_type_check" CHECK ("entries"."type" IN ('roll', 'note', 'rule', 'file'))
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" text PRIMARY KEY NOT NULL,
	"room_id" text NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"role" text NOT NULL,
	"status" text NOT NULL,
	"request_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "participants_role_check" CHECK ("participants"."role" IN ('gm', 'player')),
	CONSTRAINT "participants_status_check" CHECK ("participants"."status" IN ('pending', 'approved', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"request_id" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_actor_id_participants_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entries_room_created_idx" ON "entries" USING btree ("room_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "entries_request_id_unique" ON "entries" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "participants_room_idx" ON "participants" USING btree ("room_id");--> statement-breakpoint
CREATE UNIQUE INDEX "participants_request_id_unique" ON "participants" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rooms_code_unique" ON "rooms" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "rooms_request_id_unique" ON "rooms" USING btree ("request_id");