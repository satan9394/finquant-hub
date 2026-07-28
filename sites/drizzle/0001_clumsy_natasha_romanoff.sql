CREATE TABLE `quant_backtests` (
	`id` text PRIMARY KEY NOT NULL,
	`symbol` text NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`params_json` text NOT NULL,
	`result_json` text NOT NULL,
	`provider` text NOT NULL,
	`data_as_of` text NOT NULL,
	`timezone` text NOT NULL,
	`currency` text NOT NULL,
	`adjustment` text NOT NULL,
	`frequency` text NOT NULL,
	`saved` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `quant_backtests_saved_idx` ON `quant_backtests` (`saved`,`updated_at`);