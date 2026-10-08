CREATE TABLE `collection_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`created` text NOT NULL,
	`updated` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `collection_parts` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`payload` text NOT NULL
);
