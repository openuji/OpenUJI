import { test, expect } from "@playwright/test";

import { DomainDescriptor } from "../src/core";
import { initBundlePath, readBundleSource } from "./_helpers";

const BUNDLE = initBundlePath();

/** Robust jank observer that never leaves the counter undefined. */
function installJankObserver() {
  // global counter the spec will read
  window.__jankFrames = 0;

  try {
    new PerformanceObserver((list) => {
      window.__jankFrames =
        (window.__jankFrames ?? 0) + list.getEntries().length;
    }).observe({ type: "long-animation-frame", buffered: true });
    return;
  } catch {
    // not supported
  }
  try {
    new PerformanceObserver((list) => {
      window.__jankFrames =
        (window.__jankFrames ?? 0) + list.getEntries().length;
    }).observe({ type: "longtask", buffered: true });
    return;
  } catch {
    // not supported
  }

  let last = performance.now();
  const loop = (now: number) => {
    if (now - last > 50) window.__jankFrames!++;
    last = now;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

test("smooth‑scroll keeps main‑thread & jank budget", async ({
  page,
  context,
}) => {
  const src = await readBundleSource(BUNDLE);

  const logs: string[] = [];
  const traces: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "log") logs.push(msg.text());
  });

  page.on("console", (msg) => {
    if (msg.type() === "trace") traces.push(msg.text());
  });

  /* 1.  Enable raw DevTools CPU buckets */
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");

  /* 2.  Blank page + jank observer BEFORE any work starts */
  await page.goto("about:blank");
  await page.evaluate(installJankObserver); // runs immediately

  /* 3.  Load the ESM bundle into the page and stash its namespace */
  await page.evaluate(async (source) => {
    const url = URL.createObjectURL(
      new Blob([source], { type: "text/javascript" }),
    );
    try {
      const mod = await import(url); // { AXIS, defaultScrollEngine, ... }
      window.__scrollMod = mod; // test-only handle
    } finally {
      URL.revokeObjectURL(url);
    }
  }, src);

  await expect(
    page.evaluate(() => typeof window.__scrollMod?.defaultScrollEngine),
  ).resolves.toBe("function");

  await page.setContent(`<!DOCTYPE html>
  <style>
    html,body{margin:0;padding:0}
    .filler{height:4000px;background:linear-gradient(#e66465,#9198e5)}
  </style>
  <div class="filler"></div>`);

  await page.evaluate(() => {
    const { defaultScrollEngine } = window.__scrollMod!;
    window.__soscrollerInstance = defaultScrollEngine();
  });

  /* 4.  Scroll a few thousand px to exercise the lib */
  await page.mouse.wheel(0, 3500);

  await page.waitForFunction(() => {
    const s = window.__soscrollerInstance!;
    const domain = s.getDomain();
    const limit = (
      s as unknown as { computeLimit: (domain: DomainDescriptor) => number }
    ).computeLimit(domain);
    const cur = (s as unknown as { signal: { value: number } }).signal.value;
    return Number.isFinite(limit) && Math.abs(cur - limit) < 1;
  });

  /* 5.  Collect CPU numbers & jank count */
  const { metrics } = await cdp.send("Performance.getMetrics");
  const taskDur = metrics.find((m) => m.name === "TaskDuration")?.value ?? 0;
  const jankFrames = await page.evaluate(() => window.__jankFrames);

  console.log("Task duration:", taskDur);
  console.log("Jank frames:", jankFrames);
  console.log("Console logs:", logs);
  console.log("Console traces:", traces);
  /* 6.  Budget assertions */

  expect(taskDur).toBeLessThan(0.06);
  expect(jankFrames).toBe(0);
});
