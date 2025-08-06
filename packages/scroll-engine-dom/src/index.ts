import {
  Scheduler,
  Animator,
  clamp,
  ScrollEngineOptions,
  InputModule,
  modulo,
  ScrollAxisKeyword,
  ScrollDriver,
  ScrollSignal,
  ScrollDirection,
  FrameInfo,
  ScrollEnginePlugin,
  ScrollEngine,
} from "@openuji/scroll-engine-core";

export function createRafScheduler(): Scheduler {
  let handle = 0;
  return {
    start: (cb) => (handle = requestAnimationFrame(cb)),
    stop: () => cancelAnimationFrame(handle),
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
  return {
    read,
    write,
    limit,
    onUserScroll,

    // element: el  // Uncomment if you want to use createScrollTimeline
  };
}

export class ScrollEngineDOM {
  private driver: ScrollDriver;
  private animator: Animator;
  private scheduler: Scheduler;
  private infinite: boolean;
  private signal = new ScrollSignal();
  private destroyers: (() => void)[] = [];
  private target = 0;
  private impulse = 0;
  private running = false;
  velocity = 0;
  direction: ScrollDirection = 0;
  private prev = 0;
  private plugins: ScrollEnginePlugin[] = [];

  constructor({
    driver,
    inputs,
    animator,
    scheduler,
    infinite = false,
    plugins = [],
  }: ScrollEngineOptions) {
    this.driver = driver;
    this.animator = animator;
    this.scheduler = scheduler;
    this.infinite = infinite;

    this.destroyers.push(
      driver.onUserScroll((p) => {
        this.signal.set(p, "user");
        this.target = p;
      }),
    );

    this.plugins = plugins.map((plugin) => {
      plugin.init?.(this);
      return plugin;
    });

    inputs.forEach((mod) =>
      this.destroyers.push(mod((d) => this.applyImpulse(d))),
    );

    this.signal.on((p) => {
      this.velocity = p - this.prev;
      this.direction = Math.sign(this.velocity) as ScrollDirection;
      this.prev = p;
    });
  }

  /* public accessors */
  get scroll() {
    const v = this.signal.value;
    return this.infinite ? modulo(v, this.driver.limit()) : v;
  }
  get progress() {
    const lim = this.driver.limit();
    return lim === 0 ? 0 : this.scroll / lim;
  }

  scrollTo(value: number, immediate = false) {
    const dest = clamp(0, value, this.driver.limit());
    if (immediate) {
      this.target = dest;
      this.driver.write(dest);
      this.signal.set(dest, "program");
      return;
    }
    this.target = dest;

    this.startLoop();
  }

  destroy() {
    this.scheduler.stop();
    this.destroyers.forEach((fn) => fn());
  }

  /** External modules inject force via this method */
  applyImpulse(d: number) {
    this.impulse += d;
    this.startLoop();
  }

  /** Create a ScrollTimeline that mirrors this scroller’s source element. */
  // createScrollTimeline(axis: ScrollAxisKeyword = 'block', opts: Omit<ScrollTimelineOptions, 'source' | 'axis'> = {}) {
  //   const source = this.driver.element || document.scrollingElement || document.documentElement;
  //   return new ScrollTimeline({ ...opts, source, axis });
  // }

  private applyPosition(next: number, dt: number) {
    const limit = this.driver.limit();
    this.driver.write(next);
    this.signal.set(next, "program");
    const info: FrameInfo = {
      current: next,
      target: this.target,
      velocity: this.velocity,
      direction: this.direction,
      dt,
      progress: limit ? next / limit : 0,
    };
    this.plugins.forEach((plugin) => {
      plugin.onFrame?.(info);
    });
  }

  /* loop */
  private startLoop() {
    if (this.running) return;
    this.running = true;
    let last = 0;

    const step = (now: number) => {
      if (last === 0) {
        // ── first tick: just prime the clock
        last = now;
        this.scheduler.start(step);
        return; //  ← skip any work
      }

      const dt = now - last; // ms since previous frame
      last = now;

      const limit = this.driver.limit();
      if (this.impulse !== 0) {
        this.target = clamp(0, this.target + this.impulse, limit);
        this.impulse = 0;
      }
      const cur = this.signal.value;
      const next = this.animator.step(cur, this.target, dt);

      if (next === null) {
        this.applyPosition(this.target, dt);
        this.running = false;
        return;
      }

      this.applyPosition(next, dt);
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

export const defaultScrollEngine = () => {
  const domScroller = new ScrollEngineDOM({
    driver: createDOMDriver(window, "block"),
    inputs: [
      wheelInput({ element: document.body }),
      touchInput({ element: document.body }),
    ],
    animator: expAnimator(0.1),
    scheduler: createRafScheduler(),
    plugins: [snapPlugin()],
  });

  return domScroller;
};

function snapPlugin(grid = 800): ScrollEnginePlugin {
  let scroller: ScrollEngine;

  return {
    name: "snap",
    init(s: ScrollEngine) {
      scroller = s;
    },

    onFrame({ target, velocity, current }) {
      const snap = Math.round(target / grid) * grid;
      const diff = Math.abs((current || 0) - snap);
      if (Math.abs(velocity) < 0.2 && diff < 200) {
        if (snap !== target) scroller.scrollTo(snap); // smooth
      }
    },
  };
}
