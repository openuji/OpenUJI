// ---- types for what you touch in the page ----
import type { ScrollEngine } from "../src/core";

interface ScrollModLike {
  defaultScrollEngine(): ScrollEngine;
  circularScrollEngine(): ScrollEngine;
}

// Augment Window so we can access our test handles without `any`
declare global {
  interface Window {
    __scrollMod?: ScrollModLike;
    __soscrollerInstance?: ScrollEngine;
    __jankFrames?: number;
  }
}
export {}; // keep this file a module
