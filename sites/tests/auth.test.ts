import { describe, expect, test } from "bun:test";
import { ownerIdFromRequest } from "../lib/auth";

describe("platform identity", () => {
  test("hashes normalized authenticated email without storing the address", async () => {
    const first = await ownerIdFromRequest(new Request("https://example.test", { headers: { "oai-authenticated-user-email": " USER@Example.com " } }));
    const second = await ownerIdFromRequest(new Request("https://example.test", { headers: { "oai-authenticated-user-email": "user@example.com" } }));
    expect(first).toBe(second);
    expect(first).toMatch(/^oai:[a-f0-9]{64}$/);
    expect(first).not.toContain("example.com");
  });

  test("treats anonymous and malformed identities as public demo access", async () => {
    await expect(ownerIdFromRequest(new Request("https://example.test"))).resolves.toBeNull();
    await expect(ownerIdFromRequest(new Request("https://example.test", { headers: { "oai-authenticated-user-email": "not-an-email" } }))).resolves.toBeNull();
  });
});
