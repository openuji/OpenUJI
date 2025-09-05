import { compose } from "./middleware/compose";
import type {
  ScrollEngine,
  ScrollEngineOptions,
  EngineMiddleware,
  EngineContext,
} from "./core";
import { ScrollEngineDOM } from "./dom";

export class EngineWithMiddlewareBuilder {
  private opts!: ScrollEngineOptions;
  private mws: EngineMiddleware[] = [];

  withOptions(opts: ScrollEngineOptions): this {
    this.opts = opts;
    return this;
  }

  use(mw: EngineMiddleware): this {
    this.mws.push(mw);
    return this;
  }

  build(): ScrollEngine {
    if (!this.opts)
      throw new Error("EngineWithMiddlewareBuilder: missing options");
    const engine = new ScrollEngineDOM(this.opts);
    const ctx: EngineContext = { engine, options: this.opts };

    // core "next": actually wire listeners now
    const core = () => {
      engine.init();
    };

    compose(this.mws)(ctx, core);
    return engine;
  }
}
