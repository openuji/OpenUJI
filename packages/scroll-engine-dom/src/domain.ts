import { clamp, modulo, DomainDescriptor, DomainRuntime } from "./core";

type DomainProvider = () => DomainDescriptor | undefined;
type LimitProvider = () => number;
export function createDomainRuntime(
  descProvider: DomainProvider,
  driverLimit: LimitProvider,
): DomainRuntime {

  const desc = descProvider() || { kind: "bounded" };
  const min = desc.min ?? 0;
  
  switch (desc.kind) {
    case "bounded": {
      const max = desc.max ?? driverLimit();
      const limit = Math.max(0, max - min);

      const clampFn = (v: number) => clamp(min, v, max);
      const deltaFn = (cur: number, prev: number) => cur - prev;

      return {
        limit,
        clamp: clampFn,
        align: (v) => v,
        delta: deltaFn,
        projectTarget(desired) {
          const canonical = clampFn(desired);
          return { target: canonical, canonical };
        },
        applyImpulse(currentTarget, impulse) {
          const next = clampFn(currentTarget + impulse);
          return { target: next, canonical: next };
        },
        mapPosition(next) {
          const canonical = clampFn(next);
          return { canonical, logical: canonical };
        },
        canonicalOf(logical) {
          return clampFn(logical);
        },
      };
    }

    case "circular-unbounded": {
      const period = desc.period ?? driverLimit();
      const limit = period > 0 ? period : null;
      const hasPeriod = limit !== null && limit > 0;

      const clampFn = (v: number) => {
        if (!hasPeriod) return v;
        return min + modulo(v - min, limit!);
      };

      const alignFn = (v: number, reference: number) => {
        if (!hasPeriod) return v;
        const rev = Math.round((reference - v) / limit!);
        return v + rev * limit!;
      };

      const deltaFn = (cur: number, prev: number) => {
        if (!hasPeriod) return cur - prev;
        let d = cur - prev;
        if (d > limit! / 2) d -= limit!;
        else if (d < -limit! / 2) d += limit!;
        return d;
      };

      return {
        limit,
        clamp: clampFn,
        align: alignFn,
        delta: deltaFn,
        projectTarget(desired, reference) {
          const canonical = clampFn(desired);
          const target = alignFn(canonical, reference);
          return { target, canonical };
        },
        applyImpulse(currentTarget, impulse, motionValue) {
          if (!hasPeriod) {
            const next = currentTarget + impulse;
            return { target: next, canonical: clampFn(next) };
          }
          const raw = currentTarget + impulse;
          const target = alignFn(raw, motionValue);
          const canonical = clampFn(target);
          return { target, canonical };
        },
        mapPosition(next, currentLogical) {
          if (!hasPeriod) {
            return { canonical: next, logical: next };
          }
          const raw = alignFn(next, currentLogical);
          const canonical = clampFn(raw);
          return { canonical, logical: raw };
        },
        canonicalOf(logical) {
          return clampFn(logical);
        },
      };
    }

    case "circular-end-unbounded": {
      const period = desc.period ?? driverLimit();
      const limit = period > 0 ? period : null;
      const hasPeriod = limit !== null && limit > 0;

      const clampFn = (value: number) => {
        if (!hasPeriod) return Math.max(min, value);
        if (value <= min) return min; // top bounded
        // end circular
        return min + modulo(value - min, limit!);
      };

      const alignFn = (value: number, reference: number) => {
        if (!hasPeriod) return Math.max(min, value);
        const base = value <= min ? min : value;
        const rev = Math.round((reference - base) / limit!);
        return base + rev * limit!;
      };

      const deltaFn = (cur: number, prev: number) => {
        if (!hasPeriod) return cur - prev;
        let d = cur - prev;
        if (d > limit! / 2) d -= limit!;
        else if (d < -limit! / 2) d += limit!;
        return d;
      };

      return {
        limit,
        clamp: clampFn,
        align: alignFn,
        delta: deltaFn,
        projectTarget(desired, reference) {
          const canonical = clampFn(desired);
          const target = hasPeriod ? alignFn(canonical, reference) : canonical;
          return { target, canonical };
        },
        applyImpulse(currentTarget, impulse, motionValue, direction) {
          // *** your "no wrap on negative" rule lives HERE ***
          if (!hasPeriod || direction < 0) {
            const next = clampFn(currentTarget + impulse);
            return { target: next, canonical: next };
          }
          const raw = currentTarget + impulse;
          const target = alignFn(raw, motionValue);
          const canonical = clampFn(target);
          return { target, canonical };
        },
        mapPosition(next) {
          const canonical = clampFn(next);
          return { canonical, logical: canonical };
        },
        canonicalOf(logical) {
          return clampFn(logical);
        },
      };
    }

    case "end-unbounded": {
      const clampFn = (v: number) => Math.max(min, v);
      const deltaFn = (cur: number, prev: number) => cur - prev;

      return {
        limit: null,
        clamp: clampFn,
        align: (v) => v,
        delta: deltaFn,
        projectTarget(desired) {
          const canonical = clampFn(desired);
          return { target: canonical, canonical };
        },
        applyImpulse(currentTarget, impulse) {
          const next = clampFn(currentTarget + impulse);
          return { target: next, canonical: next };
        },
        mapPosition(next) {
          const canonical = clampFn(next);
          return { canonical, logical: canonical };
        },
        canonicalOf(logical) {
          return clampFn(logical);
        },
      };
    }

    case "all-unbounded":
    default: {
      const clampFn = (v: number) => v;
      const deltaFn = (cur: number, prev: number) => cur - prev;

      return {
        limit: null,
        clamp: clampFn,
        align: (v) => v,
        delta: deltaFn,
        projectTarget(desired) {
          return { target: desired, canonical: desired };
        },
        applyImpulse(currentTarget, impulse) {
          const next = currentTarget + impulse;
          return { target: next, canonical: next };
        },
        mapPosition(next) {
          return { canonical: next, logical: next };
        },
        canonicalOf(logical) {
          return logical;
        },
      };
    }
  }
}