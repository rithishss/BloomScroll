import { expect, test, type Page } from "@playwright/test";

/**
 * End-to-end smoke suite for the demo workspace — runs against a production
 * build (see playwright.config.ts), requires no credentials, and covers the
 * full acceptance checklist: landing → demo → feed interactions → saved →
 * source drawer → Ask Bloom → mobile nav → no console errors.
 */

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

test("landing page loads with the hero and both CTAs", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /full bloom/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /upload your first pdf/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /try the interactive demo/i })).toBeVisible();
  expect(errors).toEqual([]);
});

test("entering the demo lands on the feed with a reel visible", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /try the interactive demo/i }).click();
  await page.waitForURL(/\/demo\/feed/);
  await expect(page.getByRole("heading", { name: /today's feed/i })).toBeVisible();
  // The primary reel should resolve to a real, bundled demo video.
  const video = page.locator("video");
  await expect(video).toHaveAttribute("src", /\/demo-videos\/.+\.mp4$/, { timeout: 10_000 });
  // Visible interaction controls — gestures are never the only way.
  await expect(page.getByRole("button", { name: /got it/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /review again/i })).toBeVisible();
});

test("Got it and Review again advance to the next card", async ({ page }) => {
  await page.goto("/demo/feed");
  // Each reel's <video> has a unique aria-label ("<title> — narrated reel"),
  // which is the reliable per-card signal now that titles are baked into
  // the video frame rather than rendered as HTML text. The exiting and
  // entering reel briefly coexist during the transition animation, so
  // .first() (not a bare locator) is used throughout to avoid a strict-mode
  // multi-match error.
  const reelLabel = page.locator("video").first();
  const firstLabel = await reelLabel.getAttribute("aria-label");

  await page.getByRole("button", { name: /got it/i }).click();
  await expect(page.locator("video")).toHaveCount(1, { timeout: 5000 });
  await expect(reelLabel).not.toHaveAttribute("aria-label", firstLabel ?? "", { timeout: 5000 });

  const secondLabel = await reelLabel.getAttribute("aria-label");
  await page.getByRole("button", { name: /review again/i }).click();
  await expect(page.locator("video")).toHaveCount(1, { timeout: 5000 });
  await expect(reelLabel).not.toHaveAttribute("aria-label", secondLabel ?? "", { timeout: 5000 });
});

test("a card can be saved and then appears on the Saved screen", async ({ page }) => {
  await page.goto("/demo/feed");
  const label = await page.locator("video").first().getAttribute("aria-label");
  const title = (label ?? "").replace(/ — narrated reel$/, "");

  await page.getByRole("button", { name: /save card/i }).click();
  await expect(page.getByText(/saved for later/i)).toBeVisible();

  await page.goto("/demo/saved");
  await expect(page.getByText(title, { exact: false }).first()).toBeVisible();
});

test("the source drawer shows a document title and page number", async ({ page }) => {
  await page.goto("/demo/feed");
  await page.getByRole("button", { name: /view source/i }).click();
  await expect(page.getByRole("heading", { name: /^source$/i })).toBeVisible();
  await expect(page.getByText(/p\.\s*\d+|pp\.\s*\d+/i).first()).toBeVisible();
  await expect(page.getByText(/supporting excerpt/i)).toBeVisible();
});

test("Ask Bloom produces a cited demo response", async ({ page }) => {
  await page.goto("/demo/ask");
  const input = page.getByRole("textbox", { name: /your question/i });
  await input.fill("Why does SJF minimize average waiting time?");
  await page.getByRole("button", { name: /send question/i }).click();
  await expect(page.getByText(/from your notes/i)).toBeVisible({ timeout: 10_000 });
  // At least one page-cited source chip should render.
  await expect(page.getByRole("button", { name: /p\.\s*\d+|pp\.\s*\d+/i }).first()).toBeVisible();
});

test("mobile navigation exposes the primary sections", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Mobile bottom nav only renders below md:");
  const errors = collectConsoleErrors(page);
  await page.goto("/demo/feed");
  const nav = page.getByRole("navigation", { name: /primary/i }).last();
  await expect(nav.getByRole("link", { name: /feed/i })).toBeVisible();
  await expect(nav.getByRole("link", { name: /library/i })).toBeVisible();
  await expect(nav.getByRole("link", { name: /saved/i })).toBeVisible();

  await nav.getByRole("link", { name: /library/i }).click();
  await page.waitForURL(/\/demo\/library/);
  await expect(page.getByRole("heading", { name: /library/i })).toBeVisible();
  expect(errors).toEqual([]);
});
