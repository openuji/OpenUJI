import type { EngineMiddleware, EngineContext } from "../core";

export function compose(middlewares: EngineMiddleware[]) {
  return (ctx: EngineContext, last: () => void) => {
    let idx = -1;
    const dispatch = (i: number): void => {
      if (i <= idx) throw new Error("next() called multiple times");
      idx = i;
      if (i === middlewares.length) {
        last();
        return;
      }
      const fn = middlewares[i];
      if (fn) fn(ctx, () => dispatch(i + 1));
    };
    dispatch(0);
  };
}
