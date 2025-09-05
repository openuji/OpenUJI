import type { EngineMiddleware, EngineContext } from "../core";

type Options = {
  key?: (url?: string) => string;
  storage?: Storage | null; // allow null to explicitly disable
  restoreMode?: "immediate" | "afterLayout";
  layoutTimeoutMs?: number;
  hooks?: { history?: boolean; pageshow?: boolean; visibilityHidden?: boolean };
};
export function getSessionStorageSafe(): Storage | null {
  try {
    // Accessing the property itself can throw on opaque origins
    const s = window.sessionStorage;
    // Some browsers might return an object that still throws on use.
    // Probe with a noop getItem wrapped in try.
    try {
      s.getItem("__probe__");
    } catch {
      // Some privacy modes throw on first use; still treat as unusable.
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function trySetItem(
  storage: Storage | null,
  key: string,
  val: string,
): void {
  if (!storage) return;
  try {
    storage.setItem(key, val);
  } catch {
    /* ignore */
  }
}

export function tryGetItem(
  storage: Storage | null,
  key: string,
): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function sessionStoragePersistence(
  opts: Options = {},
): EngineMiddleware {
  const key = opts.key ?? ((u?: string) => `ouji:scroll:${u}`);
  const storageRef = () => opts.storage ?? getSessionStorageSafe(); // ← lazy & safe

  const restoreMode = opts.restoreMode ?? "immediate";
  const layoutTimeoutMs = opts.layoutTimeoutMs ?? 2000;
  const hooks = {
    history: opts.hooks?.history ?? true,
    pageshow: opts.hooks?.pageshow ?? true,
    visibilityHidden: opts.hooks?.visibilityHidden ?? true,
  };

  const readPos = (): number | null => {
    const storage = storageRef();
    const raw = tryGetItem(storage, key(location.href));
    if (!raw) return null;
    try {
      return (JSON.parse(raw)?.axes?.[0]?.position ?? null) as number | null;
    } catch {
      return null;
    }
  };

  const save = (ctx: EngineContext) => {
    const storage = storageRef();
    if (!storage) return;
    const pos = ctx.engine.getPosition() ?? 0;
    trySetItem(
      storage,
      key(location.href),
      JSON.stringify({ axes: [{ position: pos }], timestamp: Date.now() }),
    );
  };

  const waitStable = (ms: number) =>
    new Promise<void>((resolve) => {
      const start = performance.now();
      let last = 0,
        stable = 0;
      const el =
        (document.scrollingElement as HTMLElement) || document.documentElement;
      const tick = () => {
        const h = el.scrollHeight;
        stable = h === last ? stable + 1 : ((last = h), 0);
        if (stable >= 4 || performance.now() - start > ms) resolve();
        else requestAnimationFrame(tick);
      };
      if (document.readyState === "complete") requestAnimationFrame(tick);
      else
        window.addEventListener("load", () => requestAnimationFrame(tick), {
          once: true,
        });
    });

  return (ctx, next) => {
    try {
      history.scrollRestoration = "auto";
    } catch {
      // ignore
    }

    // BEFORE init(): seed if we have a stored value and storage is usable
    const pos = readPos();
    if (pos != null && restoreMode === "immediate") {
      ctx.engine.seedInitialPosition(pos);
    }

    next();

    // AFTER init(): optional after-layout seed + hooks
    const unsubs: Array<() => void> = [];

    if (pos != null && restoreMode === "afterLayout") {
      void waitStable(layoutTimeoutMs).then(() =>
        ctx.engine.schedule(() => ctx.engine.seedInitialPosition(pos)),
      );
    }

    if (hooks.visibilityHidden) {
      const onVis = () => {
        if (document.visibilityState === "hidden") save(ctx);
      };
      document.addEventListener("visibilitychange", onVis);
      unsubs.push(() =>
        document.removeEventListener("visibilitychange", onVis),
      );
    }

    if (hooks.history) {
      const patch = (m: "pushState" | "replaceState") => {
        const orig = history[m].bind(history);
        history[m] = (s: unknown, t: string, url?: string | URL | null) => {
          save(ctx);
          const ret = orig(s, t, url);
          const p = readPos();
          if (p != null) {
            ctx.engine.schedule(() =>
              ctx.engine.schedule(() => ctx.engine.seedInitialPosition(p)),
            );
          }
          return ret;
        };
        return () => (history[m] = orig);
      };
      unsubs.push(patch("pushState"), patch("replaceState"));

      const onPop = () => {
        const p = readPos();
        if (p != null) {
          ctx.engine.schedule(() =>
            ctx.engine.schedule(() => ctx.engine.seedInitialPosition(p)),
          );
        }
      };
      window.addEventListener("popstate", onPop);
      unsubs.push(() => window.removeEventListener("popstate", onPop));
    }

    if (hooks.pageshow) {
      const onShow = () => {
        const p = readPos();
        if (p == null) return;
        if (restoreMode === "immediate") ctx.engine.seedInitialPosition(p);
        else
          void waitStable(layoutTimeoutMs).then(() =>
            ctx.engine.schedule(() => ctx.engine.seedInitialPosition(p)),
          );
      };
      window.addEventListener("pageshow", onShow);
      unsubs.push(() => window.removeEventListener("pageshow", onShow));
    }

    const origDestroy = ctx.engine.destroy.bind(ctx.engine);
    ctx.engine.destroy = () => {
      try {
        unsubs.forEach((u) => u());
      } finally {
        origDestroy();
      }
    };
  };
}
