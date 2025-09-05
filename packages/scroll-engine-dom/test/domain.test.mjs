import assert from "node:assert/strict";
import { ScrollEngineDOM } from "../dist/index.js";

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

async function run() {
  let failures = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      /* eslint-disable */
      console.log(`✓ ${name}`);
    } catch (error) {
      failures += 1;
      /* eslint-disable */
      console.error(`✗ ${name}`);
      console.error(error);
    }
  }
  if (failures > 0) process.exitCode = 1;
}

class StubScheduler {
  #cb = null;
  #handle = 0;

  start(cb) {
    this.#cb = cb;
    this.#handle += 1;
    return this.#handle;
  }

  stop() {
    this.#cb = null;
  }

  tick(time) {
    if (!this.#cb) throw new Error("No scheduled callback");
    const cb = this.#cb;
    this.#cb = null;
    cb(time);
  }
}

class StubDriver {
  constructor(domain, limit = 100) {
    this.descriptor = domain;
    this.limitValue = limit;
    this.position = 0;
  }

  read() {
    return this.position;
  }

  write(pos) {
    this.position = pos;
  }

  limit() {
    return this.limitValue;
  }

  onUserScroll() {
    return () => {};
  }

  domain() {
    return this.descriptor;
  }
}

const immediateAnimator = {
  step(current, target) {
    if (Math.abs(target - current) <= 0.001) return null;
    return target;
  },
};

function createEngine(
  domain,
  { plugins = [], limit = 100, animator = immediateAnimator } = {},
) {
  const driver = new StubDriver(domain, limit);
  const scheduler = new StubScheduler();
  const engine = new ScrollEngineDOM({
    driver,
    inputs: [],
    animator,
    scheduler,
    plugins,
  });
  return { engine, driver, scheduler };
}

function runTicks(scheduler, ...times) {
  for (const time of times) scheduler.tick(time);
}

test("end-unbounded scrollTo clamps only the lower bound", () => {
  const settles = [];
  const { engine, driver } = createEngine(
    { kind: "end-unbounded", min: 10 },
    {
      plugins: [
        {
          name: "probe",
          onSettle: (info) => settles.push(info),
        },
      ],
    },
  );
  driver.limitValue = 42;

  engine.scrollTo(5, true);
  assert.equal(driver.position, 10);

  engine.scrollTo(500, true);
  assert.equal(driver.position, 500);
  assert.equal(settles.at(-1).limit, null);
});

test("end-unbounded impulse respects the minimum bound", () => {
  const { engine, driver, scheduler } = createEngine({
    kind: "end-unbounded",
    min: 0,
  });
  engine.scrollTo(50, true);

  engine.applyImpulse(-100);
  runTicks(scheduler, 0, 16, 32, 48);

  assert.equal(driver.position, 0);
});

test("all-unbounded impulse ignores driver limit ceilings", () => {
  const targets = [];
  const { engine, driver, scheduler } = createEngine(
    { kind: "all-unbounded" },
    {
      plugins: [
        {
          name: "probe",
          onTargetChange: (value) => targets.push(value),
        },
      ],
      limit: 120,
    },
  );

  engine.applyImpulse(600);
  runTicks(scheduler, 0, 16, 32, 48);

  assert.equal(driver.position, 600);
  assert.equal(targets.at(-1), 600);
});

test("circular scrollTo chooses shortest arc and emits canonical target", () => {
  const targetChanges = [];
  const settles = [];
  const stepAnimator = {
    step(current, target) {
      const diff = target - current;
      if (Math.abs(diff) <= 0.5) return null;
      const delta = Math.sign(diff) * Math.min(Math.abs(diff), 90);
      return current + delta;
    },
  };
  const { engine, driver, scheduler } = createEngine(
    { kind: "circular", period: 360, min: 0 },
    {
      animator: stepAnimator,
      plugins: [
        {
          name: "probe",
          onTargetChange: (value) => targetChanges.push(value),
          onSettle: (info) => settles.push(info),
        },
      ],
    },
  );

  engine.scrollTo(350, true);
  targetChanges.length = 0;
  settles.length = 0;

  engine.scrollTo(10);
  assert.equal(targetChanges.at(-1), 10);
  runTicks(scheduler, 0, 16, 32, 48);
  assert.equal(driver.position, 10);
  assert.equal(settles.at(-1).target, 10);
  assert.equal(settles.at(-1).limit, 360);
});

test("circular impulses wrap and notify canonical targets", () => {
  const targetChanges = [];
  const settles = [];
  const { engine, driver, scheduler } = createEngine(
    { kind: "circular", period: 360 },
    {
      plugins: [
        {
          name: "probe",
          onTargetChange: (value) => targetChanges.push(value),
          onSettle: (info) => settles.push(info),
        },
      ],
    },
  );

  engine.applyImpulse(470);
  runTicks(scheduler, 0, 16, 32, 48);
  assert.equal(targetChanges.at(-1), 110);
  assert.equal(driver.position, 110);
  assert.equal(settles.at(-1).target, 110);
  assert.equal(settles.at(-1).limit, 360);

  engine.applyImpulse(-200);
  runTicks(scheduler, 0, 16, 32, 48);
  assert.equal(targetChanges.at(-1), 270);
  assert.equal(driver.position, 270);
  assert.equal(settles.at(-1).target, 270);
});

run();
