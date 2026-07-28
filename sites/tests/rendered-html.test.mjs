import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

test("Sites build contains a server entry and hosting metadata", async () => {
  const server = await readFile(new URL("../dist/server/index.js", import.meta.url), "utf8");
  const hosting = JSON.parse(await readFile(new URL("../dist/.openai/hosting.json", import.meta.url), "utf8"));
  const migration = await readFile(new URL("../drizzle/0000_strong_clea.sql", import.meta.url), "utf8");
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const socialCard = await stat(new URL("../public/og.png", import.meta.url));
  assert.match(server, /fetch/);
  assert.match(server, /Strict-Transport-Security/);
  assert.match(server, /X-Content-Type-Options/);
  assert.equal(hosting.d1, "DB");
  assert.match(migration, /CREATE TABLE `research_groups`/);
  assert.match(migration, /CREATE TABLE `research_reports`/);
  assert.match(migration, /FOREIGN KEY \(`group_id`\)/);
  assert.match(layout, /new URL\("\/og\.png", base\)/);
  assert.match(layout, /summary_large_image/);
  assert.ok(socialCard.size > 100_000);
  const migrationTwo = await readFile(new URL("../drizzle/0001_clumsy_natasha_romanoff.sql", import.meta.url), "utf8");
  assert.match(migrationTwo, /CREATE TABLE `quant_backtests`/);
  assert.match(migrationTwo, /quant_backtests_saved_idx/);
  const migrationThree = await readFile(new URL("../drizzle/0002_productive_mikhail_rasputin.sql", import.meta.url), "utf8");
  assert.match(migrationThree, /owner_id/);
  assert.match(migrationThree, /legacy-unowned/);
  assert.match(migrationThree, /research_groups_owner_symbol_unique/);
});
