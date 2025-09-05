import { test, expect } from "@playwright/test";

import {
  injectBundleAndStart,
  waitAFewFrames,
  initBundlePath,
  readBundleSource,
} from "./_helpers";

const BUNDLE = initBundlePath();

test("snapshot on unload & restore on next load", async ({ page, context }) => {
  const src = await readBundleSource(BUNDLE);

  await context.addInitScript(() => {
    try {
      history.scrollRestoration = "manual";
    } catch {
      // ignore
    }
  });
  // 1) Serve our page at a stable origin so sessionStorage persists across reloads
  const URL_UNDER_TEST = "http://scroll.test/restore";
  await context.route("**/*", async (route) => {
    // Serve only our test page; let other requests fall through if any
    if (route.request().url() === URL_UNDER_TEST) {
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
        body: `<!DOCTYPE html>
          <meta charset="utf-8"/>
          <style>
            html,body{margin:0;padding:0}
            .filler{height:5000px;background:linear-gradient(#111,#555)}
          </style>
          <div class="filler"></div>`,
      });
    } else {
      // minimal transparent response for favicon/etc.
      await route.fulfill({ status: 204, body: "" });
    }
  });

  // (Optional) log page console to help when debugging locally
  // page.on('console', m => console.log('[page]', m.type(), m.text()));

  // 2) First navigation
  await page.goto(URL_UNDER_TEST, { waitUntil: "domcontentloaded" });

  // 3) Inject bundle + start engine
  await injectBundleAndStart(page, src);

  // 4) Wait until engine exists
  await page.waitForFunction(() => !!window.__soscrollerInstance);

  // 5) Scroll a bunch and capture position
  await page.mouse.wheel(0, 3600);

  await waitAFewFrames(page, 5);

  const before = await page.evaluate(async () => {
    const s = window.__soscrollerInstance;
    const el = (document.scrollingElement ||
      document.documentElement) as HTMLElement;
    return { y: el.scrollTop, sig: s?.getPosition() };
  });

  expect(before.y).toBeGreaterThan(1000); // sanity check

  // 6) Reload (this should trigger your save() in the page)
  await page.reload({ waitUntil: "domcontentloaded" });

  // 7) Re-inject the bundle and start a *new* engine instance.
  //    Your defaultScrollEngine() wires restore() on load/pageshow, so this is enough.
  await injectBundleAndStart(page, src);

  // 8) Wait for engine + allow your waitForStableLayout/RAF to complete
  await page.waitForFunction(() => !!window.__soscrollerInstance);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));

  // 9) Assert restored position ~= previous
  const after = await page.evaluate(() => {
    //@typescript-eslint/ignore
    const s = window.__soscrollerInstance;
    const el = (document.scrollingElement ||
      document.documentElement) as HTMLElement;
    return { y: el.scrollTop, sig: s?.getPosition() };
  });

  const tol = 4; // px wiggle
  expect(before.sig).not.toBeUndefined();
  expect(Math.abs(after.y - before.sig!)).toBeLessThanOrEqual(tol);
  expect(after.sig).not.toBeUndefined();
  expect(Math.abs(after.sig! - before.sig!)).toBeLessThanOrEqual(tol);
});
