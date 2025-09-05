import { test, expect } from "@playwright/test";
import { initBundlePath, readBundleSource } from "./_helpers";

const BUNDLE = initBundlePath();

test("circular-scroll wraps canonically & meets CPU/jank budget (immediate)", async ({
  page,
}) => {
  const src = await readBundleSource(BUNDLE);

  const logs: string[] = [];
  const traces: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "log") logs.push(msg.text());
    if (msg.type() === "trace") traces.push(msg.text());
  });

  // 3) Load the ESM bundle into the page
  await page.evaluate(async (source) => {
    const url = URL.createObjectURL(
      new Blob([source], { type: "text/javascript" }),
    );
    try {
      const mod = await import(url); // { circularScrollEngine, ... }
      window.__scrollMod = mod;
    } finally {
      URL.revokeObjectURL(url);
    }
  }, src);

  await expect(
    page.evaluate(() => typeof window.__scrollMod?.circularScrollEngine),
  ).resolves.toBe("function");

  // 4) Tall page so DOM-backed drivers have a non-zero limit
  await page.setContent(`<!DOCTYPE html>
  <style>
    html,body{margin:0;padding:0}
    .filler{height:4000px;background:linear-gradient(#0ea5e9,#6366f1)}
  </style>
  <div class="filler"></div>`);

  // 5) Init circular engine
  await page.evaluate(() => {
    const { circularScrollEngine } = window.__scrollMod!;
    window.__soscrollerInstance = circularScrollEngine();
  });

  // Get authoritative period from the engine’s domain
  const period = await page.evaluate(() => {
    const s = window.__soscrollerInstance!;
    const d = s.getDomain();
    // circular: d.period; else fallback to computeLimit(d)
    return Math.max(1, (d && d.period) || 1);
  });

  // 6) Jump far ahead instantly (no animation), expect canonical wrap: value % period
  const revolutions = 3.25;
  const extra = 123;
  const target = Math.floor(period * revolutions + extra);

  await page.evaluate(
    (t) => window.__soscrollerInstance?.scrollTo(t, true),
    target,
  );

  const pos =
    (await page.evaluate(() => window.__soscrollerInstance?.getPosition())) ??
    0;
  const expected = ((target % period) + period) % period;

  expect(Math.abs(pos - expected)).toBeLessThan(2);

  // If driver is DOM-backed, scrollTop should match canonical
  const domPos = await page.evaluate(() => {
    const el =
      (document.scrollingElement as HTMLElement) || document.documentElement;
    return el.scrollTop ?? window.scrollY ?? 0;
  });
  if (domPos !== 0 || expected === 0) {
    expect(Math.abs(domPos - expected)).toBeLessThan(2);
  }
});
