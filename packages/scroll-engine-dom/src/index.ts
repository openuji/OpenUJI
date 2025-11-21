export * from "./dom";
export type { Scheduler, ScrollDriver, ScrollEngine } from "./core";
import { clamp, DomainDescriptor, DomainRuntime, modulo, Scheduler, ScrollDriver, ScrollEngine } from "./core";

import { EngineWithMiddlewareBuilder } from "./builder";
import { sessionStoragePersistence } from "./middleware/sessionStoragePersistence";
import {
  createRafScheduler,
  createDOMDriver,
  wheelInput,
  touchInput,
  expAnimator,
} from "./dom";




export const defaultScrollEngine = (): ScrollEngine =>
  new EngineWithMiddlewareBuilder()
    .withOptions({
      driver: createDOMDriver(window, "block"),
      inputs: [
        wheelInput({ element: document.body }),
        touchInput({ element: document.body, multiplier: 2 }),
      ],
      scheduler: createRafScheduler(),
      animator: expAnimator(0.1),
      plugins: [],
    })
    .use(sessionStoragePersistence({ restoreMode: "immediate" })) // ← seeds before init()
    .build();

/** Virtual circular driver that keeps position in memory. */
function createVirtualCircularDriver(): ScrollDriver {
  const base = createDOMDriver(window, "block");
  return {
    ...base,
    domain: () => {
      const lim = Math.max(0, base.limit());
      return { kind: "circular-end-unbounded", min: 0, max: lim, period: lim } as const;
    },
  };
}

export const circularScrollEngine = (
  scheduler: Scheduler = createRafScheduler(),
): ScrollEngine => {
  const driver = createVirtualCircularDriver();
  console.log("circularScrollEngine created with driver:", driver);
  return new EngineWithMiddlewareBuilder()
    .withOptions({
      driver,
      inputs: [
        wheelInput({ element: document.body }),
        touchInput({ element: document.body, multiplier: 2 }),
      ],
      scheduler,
      animator: expAnimator(0.15), // slightly snappier default for loops
      plugins: [],
    })
    .use(sessionStoragePersistence({ restoreMode: "immediate" })) // ← seeds before init()
    .build();
};
