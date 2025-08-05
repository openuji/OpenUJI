import { defineConfig } from "tsup";

export default defineConfig({
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: false,
  outDir: "dist",
  esbuildOptions(opts) {
    // Treat *internal* packages as externals so they aren’t re‑bundled
    opts.external ||= [];
    opts.external.push("@soscroller/*");
  },
});
