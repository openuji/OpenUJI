import { clamp, modulo, ScrollSignal } from "./core";

import type {
  Scheduler,
  Animator,
  ScrollEngineOptions,
  InputModule,
  ScrollAxisKeyword,
  ScrollDriver,
  ScrollDirection,
  ScrollEnginePlugin,
  SettleInfo,
  ScrollEngine,
  DomainDescriptor,
} from "./core";

export function createRafScheduler(): Scheduler {
  let handle: number | null = null;

  return {
    start(cb) {
      handle = requestAnimationFrame(cb);
      return handle;
    },

    stop() {
      if (handle !== null) {
        cancelAnimationFrame(handle);
        handle = null;
      }
    },
  };
}

export interface Axis {
  deltaKey: "deltaX" | "deltaY";
  scrollProp: "scrollLeft" | "scrollTop";
  scrollToProp: "left" | "top";
  scrollSizeProp: "scrollWidth" | "scrollHeight";
  clientSizeProp: "clientWidth" | "clientHeight";
  pos(t: Touch | MouseEvent): number;
}

export const AXIS: Record<ScrollAxisKeyword, Axis> = {
  inline: {
    deltaKey: "deltaX",
    scrollProp: "scrollLeft",
    scrollToProp: "left",
    scrollSizeProp: "scrollWidth",
    clientSizeProp: "clientWidth",
    pos: (p) => p.clientX,
  },
  block: {
    deltaKey: "deltaY",
    scrollProp: "scrollTop",
    scrollToProp: "top",
    scrollSizeProp: "scrollHeight",
    clientSizeProp: "clientHeight",
    pos: (p) => p.clientY,
  },
} as const;

export interface WheelInputOpts {
  element: HTMLElement;
  axis?: ScrollAxisKeyword;
  multiplier?: number;
  allowNestedScroll?: boolean;
}

export const wheelInput = ({
  element,
  axis = "block",
  multiplier = 1,
}: WheelInputOpts): InputModule => {
  const ax = AXIS[axis];
  const LINE_HEIGHT = 40;
  return (emit) => {
    const h = (e: WheelEvent) => {
      const mult =
        e.deltaMode === 1
          ? LINE_HEIGHT
          : e.deltaMode === 2
            ? axis === "inline"
              ? window.innerWidth
              : window.innerHeight
            : 1;
      const delta = e[ax.deltaKey];
      emit(delta * mult * multiplier);
      if (e.cancelable) e.preventDefault();
    };
    element.addEventListener("wheel", h, { passive: false });
    return () => element.removeEventListener("wheel", h);
  };
};

export interface TouchInputOpts {
  element: HTMLElement;
  axis?: ScrollAxisKeyword;
  multiplier?: number;
  allowNestedScroll?: boolean;
}
export const touchInput = ({
  element,
  axis = "block",
  multiplier = 1,
}: TouchInputOpts): InputModule => {
  const ax = AXIS[axis];
  return (emit) => {
    let last = 0;
    const start = (e: TouchEvent) => {
      const p = e.touches[0] ?? false;
      if (!p) return;
      last = ax.pos(p);
    };
    const move = (e: TouchEvent) => {
      const p = e.touches[0] ?? false;
      if (!p) return;
      const dirP = ax.pos(p);
      const d = -(dirP - last) * multiplier;
      last = dirP;
      emit(d);
      if (e.cancelable) e.preventDefault();
    };

    element.addEventListener("touchstart", start, { passive: false });
    element.addEventListener("touchmove", move, { passive: false });

    return () => {
      element.removeEventListener("touchstart", start);
      element.removeEventListener("touchmove", move);
    };
  };
};
export function createDOMDriver(
  target: Window | HTMLElement,
  axisKeyword: ScrollAxisKeyword,
): ScrollDriver {
  const ax = AXIS[axisKeyword];
  const el: HTMLElement =
    target === window
      ? (document.scrollingElement as HTMLElement | null) ||
        document.documentElement
      : (target as HTMLElement);

  let ignore = false;

  const read = () => el[ax.scrollProp] as number;

  const write = (pos: number) => {
    ignore = true;

    if (target === window) {
      const p: ScrollToOptions = {
        [ax.scrollToProp]: pos,
        behavior: "instant",
      };
      window.scrollTo(p);
    } else {
      el[ax.scrollProp] = pos;
    }
  };

  const onUserScroll = (cb: (n: number) => void) => {
    const h = () => {
      if (ignore) {
        ignore = false;
        return;
      }
      cb(read());
    };
    (target === window ? window : el).addEventListener("scroll", h, {
      passive: true,
    });
    return () =>
      (target === window ? window : el).removeEventListener("scroll", h);
  };
  const limit = () =>
    (el[ax.scrollSizeProp] as number) - (el[ax.clientSizeProp] as number);
  const domain = (): DomainDescriptor => ({
    kind: "bounded",
    min: 0,
    max: Math.max(0, limit()),
  });
  return {
    read,
    write,
    limit,
    domain,
    onUserScroll,
  };
}

export class ScrollEngineDOM implements ScrollEngine {
  private driver: ScrollDriver;
  private animator: Animator;
  private scheduler: Scheduler;
  private inputs: Array<(emit: (d: number) => void) => () => void>;
  private plugins: ScrollEnginePlugin[];

  // reactive state
  private signal = new ScrollSignal();
  private destroyers: Array<() => void> = [];

  // motion state
  private target = 0;
  private motionValue = 0;
  private impulse = 0;
  private running = false;
  private prev = 0;

  // public-ish telemetry
  velocity = 0;
  direction: ScrollDirection = 0;

  // lifecycle guard
  private initialized = false;

  constructor({
    driver,
    inputs,
    animator,
    scheduler,
    plugins = [],
  }: ScrollEngineOptions) {
    // NOTE: no listeners wired here
    this.driver = driver;
    this.inputs = inputs;
    this.animator = animator;
    this.scheduler = scheduler;
    this.plugins = plugins;
  }

  /** Seed BEFORE init() — no jump. */
  seedInitialPosition(pos: number) {
    const domain = this.resolveDomain();
    const limit = this.computeLimit(domain);
    const clamped = this.clampToDomain(pos, domain, limit);

    this.driver.write(clamped);
    this.signal.set(clamped, "program");
    this.motionValue = clamped;
    this.target = clamped;
    this.prev = clamped;
    this.velocity = 0;
    this.direction = 0;
  }

  /** Wire listeners, inputs, plugins, signals. Call exactly once. */
  init() {
    if (this.initialized) return;
    this.initialized = true;

    // 1) user scroll listener
    this.destroyers.push(
      this.driver.onUserScroll((p) => {
        this.signal.set(p, "user");
        const domain = this.resolveDomain();
        const limit = this.computeLimit(domain);
        if (domain.kind === "circular" && limit && limit > 0) {
          this.motionValue = this.alignToCycle(p, limit, this.motionValue);
        } else {
          this.motionValue = p;
        }
        this.target = this.motionValue;
        this.plugins.forEach((pl) => pl.onUserScroll?.(p));
      }),
    );

    // 2) plugins
    this.plugins.forEach((pl) => pl.init?.(this));

    // 3) inputs
    this.inputs.forEach((mod) =>
      this.destroyers.push(mod((d) => this.applyImpulse(d))),
    );

    // 4) velocity/direction from signal
    this.signal.on((p) => {
      const domain = this.resolveDomain();
      const limit = this.computeLimit(domain);
      let delta = p - this.prev;
      if (domain.kind === "circular" && limit && limit > 0) {
        if (delta > limit / 2) delta -= limit;
        else if (delta < -limit / 2) delta += limit;
      }
      this.velocity = delta;
      this.direction = Math.sign(this.velocity) as ScrollDirection;
      this.prev = p;
    });
  }

  destroy() {
    this.scheduler.stop();
    this.destroyers.forEach((fn) => fn());
    this.plugins.forEach((pl) => pl.destroy?.());
    this.destroyers = [];
  }

  scrollTo(value: number, immediate = false) {
    const domain = this.resolveDomain();
    const limit = this.computeLimit(domain);
    const { target, canonical } = this.projectTarget(
      value,
      domain,
      limit,
      this.motionValue,
    );

    if (immediate) {
      this.target = target;
      const written = this.applyPosition(canonical, domain, limit);
      if (domain.kind === "circular" && limit && limit > 0) {
        this.target = this.motionValue; // keep logical target on same cycle
      }
      this.plugins.forEach((p) => p.onTargetChange?.(canonical));
      this.plugins.forEach((p) =>
        p.onSettle?.({
          position: written,
          target: canonical,
          velocity: this.velocity,
          direction: this.direction,
          limit,
        }),
      );
      return;
    }

    this.target = target;
    this.plugins.forEach((p) => p.onTargetChange?.(canonical));
    this.startLoop();
  }

  applyImpulse(d: number) {
    this.impulse += d;
    this.startLoop();
  }

  getDomain(): DomainDescriptor {
    return this.resolveDomain();
  }

  schedule(cb: (t?: number) => void): void {
    this.scheduler.start(cb);
  }

  getPosition(): number {
    return this.signal.value;
  }

  /* ---------- internals ---------- */

  private resolveDomain(): DomainDescriptor {
    const d = this.driver.domain?.();
    if (d) return d;
    const lim = Math.max(0, this.driver.limit());
    return { kind: "bounded", min: 0, max: lim };
    // (other domain kinds can be signalled through driver.domain())
  }

  private computeLimit(domain: DomainDescriptor): number | null {
    switch (domain.kind) {
      case "bounded":
        return Math.max(0, this.driver.limit());
      case "circular":
        return domain.period ?? null;
      case "end-unbounded":
      case "all-unbounded":
      default:
        return null;
    }
  }

  private clampToDomain(
    value: number,
    domain: DomainDescriptor,
    limit: number | null,
  ): number {
    const min = domain.min ?? 0;
    switch (domain.kind) {
      case "bounded": {
        const max = domain.max ?? limit ?? value;
        return clamp(min, value, max);
      }
      case "end-unbounded":
        return Math.max(min, value);
      case "all-unbounded":
        return value;
      case "circular":
        return limit && limit > 0 ? modulo(value, limit) : value;
      default:
        return value;
    }
  }

  private projectTarget(
    desired: number,
    domain: DomainDescriptor,
    limit: number | null,
    reference: number,
  ): { target: number; canonical: number } {
    const canonical = this.clampToDomain(desired, domain, limit);
    if (domain.kind === "circular" && limit && limit > 0) {
      return {
        target: this.alignToCycle(canonical, limit, reference),
        canonical,
      };
    }
    return { target: canonical, canonical };
  }

  private applyImpulseToTarget(
    currentTarget: number,
    impulse: number,
    domain: DomainDescriptor,
    limit: number | null,
  ): { target: number; canonical: number } {
    if (domain.kind === "circular" && limit && limit > 0) {
      const raw = currentTarget + impulse;
      const target = this.alignToCycle(raw, limit, this.motionValue);
      const canonical = this.clampToDomain(target, domain, limit);
      return { target, canonical };
    }
    const next = this.clampToDomain(currentTarget + impulse, domain, limit);
    return { target: next, canonical: next };
  }

  private alignToCycle(
    value: number,
    limit: number,
    reference: number,
  ): number {
    if (!Number.isFinite(limit) || limit <= 0) return value;
    const rev = Math.round((reference - value) / limit);
    return value + rev * limit;
  }

  private applyPosition(
    next: number,
    domain?: DomainDescriptor,
    limit?: number | null,
  ) {
    const dom = domain ?? this.resolveDomain();
    const lim = limit ?? this.computeLimit(dom);
    let raw = next;
    if (dom.kind === "circular" && lim && lim > 0)
      raw = this.alignToCycle(raw, lim, this.motionValue);
    const clamped = this.clampToDomain(raw, dom, lim);
    this.driver.write(clamped);
    this.signal.set(clamped, "program");
    this.motionValue =
      dom.kind === "circular" && lim && lim > 0 ? raw : clamped;
    return clamped;
  }

  private startLoop() {
    if (this.running) return;
    this.running = true;
    let last = 0;

    const step = (now: number) => {
      if (last === 0) {
        last = now;
        this.scheduler.start(step);
        return;
      }
      const dt = now - last;
      last = now;

      const domain = this.resolveDomain();
      const limit = this.computeLimit(domain);

      if (this.impulse !== 0) {
        const { target, canonical } = this.applyImpulseToTarget(
          this.target,
          this.impulse,
          domain,
          limit,
        );
        this.target = target;
        this.impulse = 0;
        this.plugins.forEach((p) => p.onTargetChange?.(canonical));
      }

      const cur = this.motionValue;
      const next = this.animator.step(cur, this.target, dt);

      if (next === null) {
        const written = this.applyPosition(this.target, domain, limit);
        const canonicalTarget = this.clampToDomain(this.target, domain, limit);
        if (domain.kind === "circular" && limit && limit > 0) {
          this.target = this.motionValue;
        }
        this.running = false;
        this.scheduler.stop();

        const info: SettleInfo = {
          position: written,
          target: canonicalTarget,
          velocity: this.velocity,
          direction: this.direction,
          limit,
        };
        this.plugins.forEach((p) => p.onSettle?.(info));
        return;
      }

      this.applyPosition(next, domain, limit);
      this.scheduler.start(step);
    };

    this.scheduler.start(step);
  }
}

export const expAnimator = (lerp = 0.1): Animator => {
  const freq = 1 / 60;
  const k = -Math.log(1 - lerp) / freq;
  return {
    step: (c, t, dt) => {
      const alpha = 1 - Math.exp((-k * dt) / 1000);
      const next = c + (t - c) * alpha;
      return Math.abs(t - next) < 0.5 ? null : next;
    },
  };
};

export type SpotAninmation = {
  from: number;
  to: number;
  animation: Animation;
};

// export const defaultScrollEngine = (
//   scheduler = createRafScheduler(),
// ): ScrollEngineDOM => {
//   const domScroller = new ScrollEngineDOM({
//     driver: createDOMDriver(window, "block"),
//     inputs: [
//       wheelInput({ element: document.body }),
//       touchInput({ element: document.body, multiplier: 2 }),
//     ],
//     scheduler,
//     animator: expAnimator(0.1),
//     plugins: [],
//   });

//   domScroller.init();
//   return domScroller;
// };

// /** Virtual circular driver that keeps position in memory. */
// export function createVirtualCircularDriver(period: number): ScrollDriver {
//   const base = createDOMDriver(window, "block");
//   return {
//     ...base,
//     domain: () => {
//       const lim = Math.max(0, base.limit());
//       return { kind: "circular", min: 0, max: lim, period: lim } as const;
//     },
//   };
// }

// /** Engine with circular domain; still gets history via sessionStorage. */
// export function circularScrollEngine(
//   period: number,
//   scheduler: Scheduler = createRafScheduler(),
// ): ScrollEngineDOM {
//   const engine = new ScrollEngineDOM({
//     driver: createVirtualCircularDriver(period),
//     inputs: [
//       wheelInput({ element: document.body }),
//       touchInput({ element: document.body, multiplier: 2 }),
//     ],
//     scheduler,
//     animator: expAnimator(0.15), // slightly snappier default for loops
//     plugins: [],
//   });

//   engine.init();

//   return engine;
// }
