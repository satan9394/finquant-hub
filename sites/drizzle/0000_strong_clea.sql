CREATE TABLE `research_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`symbol` text NOT NULL,
	`display_name` text NOT NULL,
	`market` text DEFAULT '' NOT NULL,
	`report_count` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `research_groups_symbol_unique` ON `research_groups` (`symbol`);--> statement-breakpoint
CREATE TABLE `research_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`symbol` text NOT NULL,
	`name` text NOT NULL,
	`title` text NOT NULL,
	`query` text DEFAULT '' NOT NULL,
	`content_md` text NOT NULL,
	`evidence_json` text DEFAULT '[]' NOT NULL,
	`snapshot_json` text NOT NULL,
	`ai_enhanced` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `research_groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `research_reports_group_idx` ON `research_reports` (`group_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `research_reports_symbol_idx` ON `research_reports` (`symbol`,`created_at`);