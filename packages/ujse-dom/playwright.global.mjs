import { execSync } from "node:child_process";

// Runs _inside_ the pnpm workspace root
export default async () => {
  // --filter ensures we only build this package
  execSync("pnpm build", { stdio: "inherit" });
};
