DROP INDEX `research_groups_symbol_unique`;--> statement-breakpoint
ALTER TABLE `research_groups` ADD `owner_id` text DEFAULT 'legacy-unowned' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `research_groups_owner_symbol_unique` ON `research_groups` (`owner_id`,`symbol`);--> statement-breakpoint
DROP INDEX `quant_backtests_saved_idx`;--> statement-breakpoint
ALTER TABLE `quant_backtests` ADD `owner_id` text DEFAULT 'legacy-unowned' NOT NULL;--> statement-breakpoint
CREATE INDEX `quant_backtests_saved_idx` ON `quant_backtests` (`owner_id`,`saved`,`updated_at`);--> statement-breakpoint
DROP INDEX `research_reports_group_idx`;--> statement-breakpoint
DROP INDEX `research_reports_symbol_idx`;--> statement-breakpoint
ALTER TABLE `research_reports` ADD `owner_id` text DEFAULT 'legacy-unowned' NOT NULL;--> statement-breakpoint
CREATE INDEX `research_reports_group_idx` ON `research_reports` (`owner_id`,`group_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `research_reports_symbol_idx` ON `research_reports` (`owner_id`,`symbol`,`created_at`);
