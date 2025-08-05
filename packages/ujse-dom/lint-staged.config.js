export default {
  "*.{ts,tsx,js,jsx}": () => [
    "prettier --write .",
    "pnpm lint",
    "pnpm check-types",
  ],
};
