CREATE TABLE `datasets` (
	`id` text PRIMARY KEY NOT NULL,
	`created` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `fetch_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`created` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`dataset_id` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`created` text NOT NULL,
	`updated` text NOT NULL,
	`payload` text NOT NULL
);
