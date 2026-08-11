import { expect, test, type Page } from "@playwright/test";

/**
 * End-to-end smoke suite for the demo workspace — runs against a production
 * build (see playwright.config.ts), requires no credentials, and covers the
 * full acceptance checklist: landing → demo → feed interactions in both
 * faces → saved → source drawer → Ask Bloom → mobile nav → no console errors.
 */

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

/** Switches the feed to the reel face and waits for a real video to resolve. */
async function switchToReels(page: Page) {
  await page.getByRole("button", { name: "Reels view" }).click();
  await expect(page.locator("video")).toHaveAttribute("src", /\/demo-videos\/.+\.mp4$/, {
    timeout: 10_000,
  });
}

test("landing page loads with the hero and both CTAs", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /full bloom/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /upload your first pdf/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /try the interactive demo/i })).toBeVisible();
  expect(errors).toEqual([]);
});

test("entering the demo lands on the feed showing text cards by default", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /try the interactive demo/i }).click();
  await page.waitForURL(/\/demo\/feed/);
  await expect(page.getByRole("heading", { name: /today's feed/i })).toBeVisible();

  // Text is the default face: a readable card, and no video element at all.
  await expect(page.locator("article h2").first()).toBeVisible();
  await expect(page.locator("video")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cards view" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // Visible interaction controls — gestures are never the only way.
  await expect(page.getByRole("button", { name: /got it/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /review again/i })).toBeVisible();
});

test("the feed-style toggle swaps the face and persists across a reload", async ({ page }) => {
  await page.goto("/demo/feed");
  const cardTitle = await page.locator("article h2").first().textContent();

  await switchToReels(page);
  await expect(page.getByRole("button", { name: "Reels view" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // Same card, different face: the reel's accessible name carries the title
  // that the text face rendered as an <h2>.
  await expect(page.locator("video").first()).toHaveAttribute(
    "aria-label",
    `${cardTitle} — narrated reel`,
  );

  // The preference survives a full reload.
  await page.reload();
  await expect(page.locator("video").first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Reels view" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // ...and switching back restores the text face, again persistently.
  await page.getByRole("button", { name: "Cards view" }).click();
  await expect(page.locator("video")).toHaveCount(0);
  await page.reload();
  await expect(page.locator("article h2").first()).toBeVisible();
  await expect(page.locator("video")).toHaveCount(0);
});

test("text mode requests no video assets at all", async ({ page }) => {
  const videoRequests: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("/demo-videos/")) videoRequests.push(req.url());
  });
  await page.goto("/demo/feed");
  await expect(page.locator("article h2").first()).toBeVisible();
  await page.waitForTimeout(1000);
  expect(videoRequests).toEqual([]);
});

test("Got it and Review again advance to the next card (text face)", async ({ page }) => {
  await page.goto("/demo/feed");
  // The exiting and entering card briefly coexist during the transition
  // animation, so .first() (not a bare locator) avoids a strict-mode
  // multi-match error.
  const title = page.locator("article h2").first();
  const firstTitle = await title.textContent();

  await page.getByRole("button", { name: /got it/i }).click();
  await expect(page.locator("article h2")).toHaveCount(1, { timeout: 5000 });
  await expect(title).not.toHaveText(firstTitle ?? "", { timeout: 5000 });

  const secondTitle = await title.textContent();
  await page.getByRole("button", { name: /review again/i }).click();
  await expect(page.locator("article h2")).toHaveCount(1, { timeout: 5000 });
  await expect(title).not.toHaveText(secondTitle ?? "", { timeout: 5000 });
});

test("Got it and Review again advance to the next card (reel face)", async ({ page }) => {
  await page.goto("/demo/feed");
  await switchToReels(page);
  // Each reel's <video> has a unique aria-label ("<title> — narrated reel"),
  // which is the reliable per-card signal when titles are baked into the
  // video frame rather than rendered as HTML text.
  const reel = page.locator("video").first();
  const firstLabel = await reel.getAttribute("aria-label");

  await page.getByRole("button", { name: /got it/i }).click();
  await expect(page.locator("video")).toHaveCount(1, { timeout: 5000 });
  await expect(reel).not.toHaveAttribute("aria-label", firstLabel ?? "", { timeout: 5000 });

  const secondLabel = await reel.getAttribute("aria-label");
  await page.getByRole("button", { name: /review again/i }).click();
  await expect(page.locator("video")).toHaveCount(1, { timeout: 5000 });
  await expect(reel).not.toHaveAttribute("aria-label", secondLabel ?? "", { timeout: 5000 });
});

test("a card can be saved and then appears on the Saved screen", async ({ page }) => {
  await page.goto("/demo/feed");
  const title = (await page.locator("article h2").first().textContent()) ?? "";

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

test("a document quiz can be taken end to end, with retry-missed", async ({ page }) => {
  await page.goto("/demo/library/demo-doc-os");

  // Reachable from the document screen, and honest about its length.
  const quizLink = page.getByRole("link", { name: /take the quiz/i });
  await expect(quizLink).toBeVisible();
  await quizLink.click();
  await page.waitForURL(/\/demo\/library\/demo-doc-os\/quiz/);

  await expect(page.getByRole("heading", { name: /^quiz$/i })).toBeVisible();
  const counter = page.getByText(/Question 1 of \d+/);
  await expect(counter).toBeVisible();
  const total = Number((await counter.textContent())?.match(/of (\d+)/)?.[1] ?? 0);
  expect(total).toBeGreaterThanOrEqual(5);

  // Answer every question by always choosing the last option. That is wrong
  // for most questions, which is what we want: it exercises the incorrect
  // path (rationale + source passage) and guarantees a non-empty retry set.
  for (let i = 0; i < total; i++) {
    await page.locator("li button").last().click();
    // A wrong answer must show its supporting passage, never a bare verdict.
    const verdict = page.getByRole("status");
    await expect(verdict).toBeVisible();
    if ((await verdict.textContent())?.match(/not quite/i)) {
      await expect(page.getByText(/from your notes/i)).toBeVisible();
    }
    await page.getByRole("button", { name: /next question|see results/i }).click();
  }

  // Results: a score out of the real total, and a retry for the missed set.
  await expect(page.getByText(/\d+ of \d+ correct/)).toBeVisible();
  const retry = page.getByRole("button", { name: /retry \d+ missed/i });
  await expect(retry).toBeVisible();
  const missedCount = Number((await retry.textContent())?.match(/(\d+)/)?.[1] ?? 0);
  expect(missedCount).toBeGreaterThan(0);
  expect(missedCount).toBeLessThanOrEqual(total);

  await retry.click();
  await expect(page.getByRole("heading", { name: /retrying missed questions/i })).toBeVisible();
  await expect(page.getByText(`Question 1 of ${missedCount}`)).toBeVisible();
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
