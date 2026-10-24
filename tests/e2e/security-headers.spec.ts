import { test, expect } from "@playwright/test";

test("the published page rejects framing and keeps resource loading available", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  const headers = response!.headers();
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["content-security-policy"]).toContain("form-action 'self'");
  await expect(page.getByRole("heading", { name: "Fichas", exact: true })).toBeVisible();
});
