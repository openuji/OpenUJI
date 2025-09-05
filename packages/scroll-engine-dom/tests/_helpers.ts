// @ts-expect-error -- TS can’t resolve node: imports until NodeNext is enabled
import { readFile } from "node:fs/promises";
// @ts-expect-error -- TS can’t resolve node: imports until NodeNext is enabled
import { fileURLToPath } from "node:url";
// @ts-expect-error -- TS can’t resolve node: imports until NodeNext is enabled
import { dirname, join } from "node:path";

type Page = import("@playwright/test").Page;
interface InjectBundleAndStartOptions {
  source: string;
  exportName: string;
}

export const initBundlePath = () => {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const BUNDLE = join(__dirname, "..", "dist", "index.js");
  return BUNDLE;
};

export async function readBundleSource(bundlePath: string): Promise<string> {
  const src = await readFile(bundlePath, "utf8");
  return src;
}

export async function injectBundleAndStart(
  page: Page,
  src: string,
  factoryExport: string = "defaultScrollEngine",
): Promise<void> {
  await page.evaluate(
    async ({ source, exportName }: InjectBundleAndStartOptions) => {
      const url = URL.createObjectURL(
        new Blob([source], { type: "text/javascript" }),
      );
      try {
        const mod = await import(url);
        // expose the whole module for flexibility
        window.__scrollMod = mod;
        window.__soscrollerInstance = mod[exportName]();
      } finally {
        URL.revokeObjectURL(url);
      }
    },
    { source: src, exportName: factoryExport },
  );
}

export async function waitAFewFrames(page: Page, n = 3) {
  await page.evaluate(
    (count) =>
      new Promise<void>((r) => {
        const step = (i: number) =>
          i <= 0 ? r() : requestAnimationFrame(() => step(i - 1));
        step(count);
      }),
    n,
  );
}
