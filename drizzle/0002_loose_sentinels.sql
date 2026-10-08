CREATE TABLE `model_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`reserved` text NOT NULL,
	`status` text NOT NULL,
	`payload` text NOT NULL
);
