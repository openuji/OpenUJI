export type ScrollAxisKeyword = "block" | "inline";
export type ScrollDirection = -1 | 0 | 1;

export type CurrentPosition = number | null;

export type DomainKind =
  | "bounded"
  | "end-unbounded"
  | "all-unbounded"
  | "circular-unbounded"     // new: old circular semantics
  | "circular-end-unbounded"
export interface DomainDescriptor {
  kind: DomainKind;
  min?: number | null;
  max?: number | null;
  period?: number | null; // required > 0 when kind === "circular-unbounded" | "circular-end-unbounded"
}

export interface EngineScrollToOptions {
  immediate?: boolean;
  animator?: Animator | null;
  duration?: number | null; // ms
  easing?: string | null; // e.g., "linear", "ease", "cubic-bezier(…)"
  clamp?: boolean; // default true
  userCanInterrupt?: boolean; // default true
}

export interface FrameInfo {
  current: number | null;
  target: number;
  velocity: number;
  direction: ScrollDirection;
  dt: number;
  progress: number | null; // bounded [0,1], circular* [0,1), unbounded null
  limit: number | null; // bounded range, circular* period, unbounded null
  domain: DomainKind;
}

export interface AxisState {
  position: number;
}
export interface ScrollState {
  axes: AxisState[];
  timestamp: number;
}

export const clamp = (min: number, v: number, max: number) =>
  Math.max(min, Math.min(v, max));
export const modulo = (v: number, l: number) => ((v % l) + l) % l;

/* -------------------------------------------------------------------------- */
/*  reactive ScrollSignal                                                     */
/* -------------------------------------------------------------------------- */

export type Origin = "user" | "program" | "momentum";
export type Signal = (p: number, o: Origin) => void;

export class ScrollSignal {
  private _value = 0;
  private listeners = new Set<Signal>();
  get value() {
    return this._value;
  }
  on(fn: Signal) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  set(v: number, o: Origin) {
    if (Math.abs(v - this._value) < 0.0001) return;
    this._value = v;
    this.listeners.forEach((l) => {
      try {
        l(v, o);
      } catch {
        /* intentionally ignore */
      }
    });
  }
}

export interface ScrollEngine {
  /** Wire listeners, inputs, signals, plugins. Must be called once after construction. */
  init(): void;

  /** Programmatic scroll. If `immediate`, writes & settles synchronously. */
  scrollTo(value: number, immediate?: boolean): void;

  /** Inject force (e.g., from wheel/touch inputs). */
  applyImpulse(delta: number): void;

  /** Tear down listeners and plugins. */
  destroy(): void;

  /** Public helpers */
  getDomain(): DomainDescriptor;

  getPosition(): number;

  /** Seed initial position BEFORE init() (no jump). Public on purpose. */
  seedInitialPosition(pos: number): void;

  schedule(cb: (t?: number) => void): void;
}

export interface Scheduler {
  start(cb: (t: number) => void): number;
  stop(h?: number): void;
}

export interface Animator {
  step(current: number, target: number, dt: number): CurrentPosition;
}

export interface ScrollDriver {
  read(): number;
  write(pos: number): void;
  limit(): number;
  viewportExtent?(): number;
  contentExtent?(): number;
  domain?(): DomainDescriptor;
  onUserScroll(cb: (pos: number) => void): () => void;
}

export type InputModule = (emit: (delta: number) => void) => () => void;

export interface DomainRuntime {
  /** Effective period / limit of the domain (null = unbounded). */
  readonly limit: number | null;

  /** Clamp a canonical value into the domain. */
  clamp(value: number): number;

  /**
   * Align a canonical value onto the closest cycle relative to a reference.
   * For non-circular domains this is just identity.
   */
  align(value: number, reference: number): number;

  /**
   * Compute delta between two canonical positions, respecting wrapping if needed.
   */
  delta(current: number, previous: number): number;

  /**
   * Given a desired position and current reference, compute:
   * - `target`: the internal logical target (can span multiple cycles)
   * - `canonical`: the clamped/canonical coordinate we report externally
   */
  projectTarget(
    desired: number,
    reference: number,
  ): { target: number; canonical: number };

  /**
   * Apply an impulse to the current target, respecting domain semantics
   * (including the "no wrap on negative" rule for circular-end-unbounded).
   */
  applyImpulse(
    currentTarget: number,
    impulse: number,
    motionValue: number,
    direction: ScrollDirection,
  ): { target: number; canonical: number };

  /**
   * Convert an internal “next” logical value into:
   * - `canonical` to write to the driver
   * - `logical` to store as engine's motionValue
   */
  mapPosition(
    next: number,
    currentLogical: number,
  ): { canonical: number; logical: number };

  /**
   * Stateless “what canonical would this logical target correspond to”.
   * Used for settle info.
   */
  canonicalOf(logical: number): number;
}


export interface ScrollEngineOptions {
  driver: ScrollDriver;
  inputs: InputModule[];
  animator: Animator;
  scheduler: Scheduler;
  plugins?: ScrollEnginePlugin[];
  signals?: Signal[];
}

export interface SettleInfo {
  position: number; // final written position
  target: number; // final target we eased to
  velocity: number; // last computed velocity
  direction: ScrollDirection;
  limit: number | null;
}

export interface ScrollEnginePlugin {
  name: string;
  init?(scroller: ScrollEngine): void;

  // user gesture scrolls (driver emits these only when it isn't ignoring)
  onUserScroll?(pos: number): void;

  // fires whenever the engine’s target changes (scrollTo or impulse applied)
  onTargetChange?(target: number): void;

  // fires exactly once when the animator stops (programmatic end-of-motion)
  onSettle?(info: SettleInfo): void;

  destroy?(): void;
}

export interface EngineContext {
  /** The constructed engine (not yet initialized when middleware starts). */
  engine: ScrollEngine;
  /** The exact options used for the engine; useful for telemetry. */
  options: ScrollEngineOptions;
}

export type EngineMiddleware = (ctx: EngineContext, next: () => void) => void;
