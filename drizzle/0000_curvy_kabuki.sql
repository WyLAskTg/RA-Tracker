CREATE TABLE `user_states` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`data_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
