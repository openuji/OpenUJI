# Custom Scroll Animation — Level 1

_Editor’s Draft – 2 August 2025_

> **Note**   This document is published for early review. It deliberately follows a **two‑layer architecture**:
>
> - **Part I – Core Model** (platform‑agnostic, normative)
> - **Part II – Web Binding** (platform‑specific, normative)
>
> Future bindings (Android, iOS, etc.) may reference Part I and supply their own Part II‑style chapters without changing the Core.

---

## Part I – Core Model (Normative)

### § 1 Status of This Part

This Part defines the _formal model_ of a **scroll animation** regardless of execution environment. It contains no language bindings, no references to DOM, Web‑IDL, UIKit, Jetpack Compose, or any other host. Conforming **Host Bindings** MUST implement every Normative requirement herein.

### § 2 Abstract

A _scroll animation_ programmatically changes the scroll offset of a _scrollable area_ from an initial position *P₀* to a destination *P₁* over a finite _duration D_ according to an _easing function f(t)_, while allowing user input to interrupt the motion at any time and optionally coordinating with a _snap system_ at the end. This Part defines:

- The data model for a scroll animation
- Requirements for timing, easing, cancellation, and snap hand‑off
- A state‑machine, event semantics, and accessibility hooks that every Host Binding MUST expose in an idiomatic form.

### § 3 Conformance

The **key words** “MUST”, “MUST NOT”, “SHOULD”, “MAY” used in this Part are to be interpreted as described in \[RFC 2119]. Two conformance classes are defined:

| Class                               | Description                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------ |
| **Core Model Implementation (CMI)** | An engine that enforces every requirement of Part I.                                 |
| **Host Binding**                    | A specification that maps the Core Model to a concrete platform (e.g. Web, Android). |

A Host Binding that itself ships an implementation is therefore _both_ a CMI _and_ a Host Binding.

### § 4 Terminology

- _Scrollable area_ – A rectangular viewport that can change its visible coordinate range via a _scroll offset_.
- _Destination_ – A pair `{block, inline}` of coordinates in CSS pixels (neutral unit; hosts MAY map to logical equivalents).
- _Easing function_ – A continuous monotone mapping **f : \[0,1] → \[0,1]** with **f(0)=0** and **f(1)=1**.
- _Snap strategy_ – One of **preserve**, **suppress**, or **auto** (§ 5.3).
- _Time origin_ – Host‑specific high‑resolution time reference.

### § 5 Data Model

A **scroll animation object** consists of:

| Slot           | Type                      | Description                                 |
| -------------- | ------------------------- | ------------------------------------------- |
| _target_       | Scrollable area reference | The object whose offset changes.            |
| _destination_  | `{block?, inline?}`       | Missing components are left unchanged.      |
| _duration_     | Positive real (ms)        | Total running time.                         |
| _easing_       | Easing function           | Governs interpolation.                      |
| _snapStrategy_ | Enum                      | See § 5.3.                                  |
| _state_        | Enum                      | `idle`, `running`, `finishing`, `canceled`. |

\#### 5.1 Progress function

For any animation in _running_ state, its **progress** at host time **t** is:

```
progress(t) = easing( clamp( (t − startTime) / duration , 0 , 1 ) )
```

\#### 5.2 Offset function

```
offset(t) = P₀ + progress(t) × (P₁ − P₀)
```

where **P₀** is the offset at `startTime` and \*\*P₁ = destination\`.

\#### 5.3 Snap strategy

| Value              | Behaviour                                                                                                            |                  |                                                                                |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------ |
| **suppress**       | Snap interaction is disabled throughout and after the animation.                                                     |                  |                                                                                |
| **preserve**       | Snap is disabled _during_ the animation but restored immediately at finish; UA MAY trigger a separate snap sequence. |                  |                                                                                |
| **auto** (default) | Same as **preserve** _unless_                                                                                        | P₁ – nearestSnap |  ≤ ε, in which case the animation SHOULD finish exactly at that snap position. |

### § 6 State Machine

```
 idle ── start() ─▶ running ── userCancel() ─▶ canceled
   ▲                        │                     │
   │                        └─ reaches t=1 ─▶ finishing ─▶ idle
   └───────────────────────────────────────────────────────┘
```

- `start()` with a new _destination_ when `state ≠ idle` must **cancel** the running animation first.
- Transitions to `canceled` or `finishing` MUST enqueue, in order, a **notification event** (§ 7) and resolution/rejection of the Host Binding’s _completion promise_.

### § 7 Notification Events (Abstract)

A CMI MUST expose _observable_ start and end notifications, named **animation‑start** and **animation‑end** in this Part. Host Bindings MAY rename them (`scrollanimationstart`, etc.) but MUST preserve ordering:

```
— state = idle
start() → queue microtask: fire animation‑start
...
finish/cancel → queue microtask: resolve/reject promise
                then fire animation‑end
```

### § 8 Accessibility

- If the host signals `prefers‑reduced‑motion`, CMIs **SHOULD** bypass the animation and jump instantly to _destination_.
- CMIs **MUST** cancel immediately on input from assistive technologies that programmatically scroll _target_.

### § 9 Security & Privacy

CMIs do not expose new fingerprinting surfaces beyond existing scroll APIs. Host Bindings MUST ensure that cross‑origin constraints of their platform (e.g. Same Origin Policy) remain intact.

### § 10 References (Core)

- \[RFC 2119] Key words for use in RFCs.
- \[Core‑Math] Internal proof that **f** monotone ⇒ no overshoot (non‑normative).

---

## Part II – Web Binding (Normative)

### § A Scope

This Part maps the Core Model to the Web Platform, integrating with DOM, CSS Scroll Snap, CSS Scroll‑Driven Animations, and Web Animations.

### § B Web‑IDL Interface

```webidl
[Exposed=Window]
interface SmoothScrollController {
  constructor(Element target);
  Promise<void> scrollTo(ScrollToOptions destination,
                         optional ScrollAnimationOptions options = {});
  void          cancel();
  readonly attribute boolean animating;
  readonly attribute AnimationTimeline? timeline;
};

dictionary ScrollAnimationOptions {
  double        duration = 600;    // ms
  (DOMString or Function) easing = "ease";
  SnapStrategy  snap     = "auto";
};

enum SnapStrategy { "preserve", "suppress", "auto" };
```

### § C Internal Slots (Web)

Bindings MUST implement the internal slots defined in Core § 5 plus:

- `[[rafID]]` – Handle returned by `requestAnimationFrame`.
- `[[snapOverride]]` – Previous computed `scroll-snap-type` value, or _undefined_.

### § D Algorithms

The algorithms of Core § 6 are mapped as follows:

- **start()** → `scrollTo()` method
- **userCancel()** → Any `wheel`, `touchstart`, `keydown`, or `pointerdown` event whose default is _not_ prevented

Full step‑by‑step prose (updated from previous draft) appears in **Annex D.1**.

### § E Integration with CSS Scroll Snap

When Core demands `snapStrategy ≠ suppress`, the UA MUST restore the author’s `scroll-snap-type` and invoke the **UA Snap‑Selection Algorithm** from _CSS‑SCROLL‑SNAP‑1_ § 6. Implementations MUST NOT replicate that algorithm in script.

### § F Security & Privacy (Web)

All methods are **same‑origin restricted**: a `SmoothScrollController` created on an element MUST throw `SecurityError` if a calling script does not have access to _target_’s node.

### § G Examples

See live demos in repository `examples/web`. An excerpt:

```js
const controller = new SmoothScrollController(document.scrollingElement);
controller.scrollTo(
  { block: 0 },
  {
    duration: 800,
    easing: (t) => 1 - Math.pow(2, -10 * t),
  },
);
```

### § H Change Log (Web Binding)

- **2025‑08‑02** — Initial extraction from monolithic draft into two‑part structure.

---

## Annex D.1 — Detailed Web Algorithms _(Normative)_

The following replaces § 8 of the previous draft.

\#### D.1.1 Start a Scroll Animation

_(Steps identical to the updated text inserted in the previous revision, but now reference Core slot names directly.)_

\#### D.1.2 Per‑Frame Step

_Implementation MUST perform writes via `Element.scrollTo({behavior:'instant'})`._

\#### D.1.3 Cancel & Finish

_See Core § 6 for state changes; Web Binding specifics are restoration of `scroll-snap-type` and promise settlement ordering._

---

## End of Document
