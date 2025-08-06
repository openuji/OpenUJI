export type ScrollAxisKeyword = "block" | "inline";
export type ScrollDirection = -1 | 0 | 1;

export const clamp = (min: number, v: number, max: number) =>
  Math.max(min, Math.min(v, max));
export const modulo = (v: number, l: number) => ((v % l) + l) % l;

/* -------------------------------------------------------------------------- */
/*  reactive ScrollSignal                                                     */
/* -------------------------------------------------------------------------- */

export type Origin = "user" | "program" | "momentum";

export class ScrollSignal {
  private _value = 0;
  private listeners = new Set<(pos: number, origin: Origin) => void>();
  get value() {
    return this._value;
  }
  on(fn: (p: number, o: Origin) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  set(v: number, o: Origin) {
    if (Math.abs(v - this._value) < 0.01) return;
    this._value = v;
    this.listeners.forEach((l) => l(v, o));
  }
}

/**
 *
 */
export interface ScrollEngine {
  scroll: number;
  progress: number;
  scrollTo(value: number, immediate?: boolean): void;
}
/* -------------------------------------------------------------------------- */
/*  Scheduler & Animator & Plugin                                                      */
/* -------------------------------------------------------------------------- */

export interface FrameInfo {
  /** scroll position actually written this frame */
  current: CurrentPosition;
  /** goal we are still easing toward */
  target: number;
  /** px / ms calculated from previous frame → now */
  velocity: number;
  /** −1 ↓  0 ↔  +1 ↑ */
  direction: ScrollDirection;
  /** elapsed time since last frame (ms) */
  dt: number;
  /** 0–1 convenience value */
  progress: number;
}
export interface Scheduler {
  start(cb: (t: number) => void): number;
  stop(h?: number): void;
}

export type CurrentPosition = number | null;
export interface Animator {
  step(current: number, target: number, dt: number): CurrentPosition;
}

export interface ScrollEnginePlugin {
  name: string;
  init?(scroller: ScrollEngine): void;
  onImpulse?(impulse: number, origin: Origin): number | void;
  onFrame?(info: FrameInfo): void;
  destroy?(): void;
}

export interface ScrollDriver {
  read(): number;
  write(pos: number): void;
  limit(): number;
  onUserScroll(cb: (pos: number) => void): () => void;
}

export type InputModule = (emit: (delta: number) => void) => () => void;

export interface ScrollEngineOptions {
  driver: ScrollDriver;
  inputs: InputModule[];
  animator: Animator;
  scheduler: Scheduler;
  infinite?: boolean;
  plugins?: ScrollEnginePlugin[];
}
