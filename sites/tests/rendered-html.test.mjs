import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Sites build contains a server entry and hosting metadata", async () => {
  const server = await readFile(new URL("../dist/server/index.js", import.meta.url), "utf8");
  const hosting = JSON.parse(await readFile(new URL("../dist/.openai/hosting.json", import.meta.url), "utf8"));
  const migration = await readFile(new URL("../drizzle/0000_strong_clea.sql", import.meta.url), "utf8");
  assert.match(server, /fetch/);
  assert.equal(hosting.d1, "DB");
  assert.match(migration, /CREATE TABLE `research_groups`/);
  assert.match(migration, /CREATE TABLE `research_reports`/);
  assert.match(migration, /FOREIGN KEY \(`group_id`\)/);
});
