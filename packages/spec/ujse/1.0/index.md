# Custom Scroll Animation Module Level 1

_Editor’s Draft   2 August 2025_

## Status of This Document

This specification is an **editor’s draft** and has no official standing within the W3C. It is published solely for discussion and feedback by implementers and authors interested in a script‑level API for user‑definable smooth‑scroll animations that interoperates with existing **CSS Scroll Snap** and **CSS Scroll‑Driven Animations** features. Comments are welcome on the project issue tracker.

## Table of Contents

1. [Abstract](#abstract)
2. [Conformance](#conformance)
3. [Terminology](#terminology)
4. [Overview](#overview)
5. [Model](#model)
6. [JavaScript API](#javascript-api)
7. [Events](#events)
8. [Algorithms](#algorithms)
9. [Integration with CSS Scroll Snap](#integration-with-css-scroll-snap)
10. [Accessibility Considerations](#accessibility-considerations)
11. [Security & Privacy Considerations](#security-privacy-considerations)
12. [Examples](#examples)
13. [Acknowledgements](#acknowledgements)
14. [References](#references)
15. [Change Log](#change-log)

---

## 1. <a id="abstract">Abstract</a>

This specification defines a **script‑level controller** that enables authors to programmatically animate the scroll offset of any scrollable box along an author‑supplied easing curve while co‑existing with native scrolling, user interaction, `scroll-behavior`, and **CSS Scroll Snap**. The API encapsulates timing, cancellation, and snap hand‑off logic so developers can supply only _where_ to scroll and _how_ the motion should feel.

---

## 2. <a id="conformance">Conformance</a>

The **key words** “MUST”, “MUST NOT”, “REQUIRED”, “SHOULD”, “SHOULD NOT”, “RECOMMENDED”, “MAY”, and “OPTIONAL” in this document are to be interpreted as described in _\[RFC 2119]_.

### 2.1 Conformance Classes

- **Scroll Animation Implementations** (SAI) implement every normative requirement in this specification.
- **Content** is any script that uses the API.

A conforming SAI MAY be provided by the user agent, a JavaScript library, or a browser extension.

---

## 3. <a id="terminology">Terminology</a>

- _Scrollable box_ — as defined in _\[CSSOM‑VIEW]_.
- _Snap position_ — as defined in _\[CSS‑SCROLL‑SNAP‑1]_.
- _Author easing function_ — a mapping **f**: \[0,1]→\[0,1] that is monotonic and has **f(0)=0**, **f(1)=1**.
- _Preferred snap alignment_ — the value of `scroll-snap-align` that applies to the current scroll container.

Where algorithms below refer to “queue a `scroll` event” or similar, they use the DOM event‑dispatching mechanisms of _\[DOM]_.

---

## 4. <a id="overview">Overview</a>

While `scroll-behavior:smooth` offers a user‑agent‑defined scroll interpolation, authors frequently need **branded motion** (e.g., spring or stepped curves), physics‑based pagination, or synchronised view transitions. Today this requires hand‑rolled `requestAnimationFrame` loops. **Smooth Scroll Controller** provides:

- A _promise‑based_ method to start a scroll animation.
- Built‑in cancellation on user interaction.
- Automatic disabling and re‑enabling of `scroll-snap-type` to prevent premature snap.
- A consistent event model (`scrollanimationstart` / `scrollanimationend`).
- Integration hooks for **CSS View Transitions** via the returned `AnimationTimeline`.

An implementation MAY delegate to native `scrollTo` with UA‑specific extensions if such a capability becomes available.

---

## 5. <a id="model">Model</a>

A **scroll animation** is defined by the tuple:

- _Target_ — a reference to a Scrollable box.
- _Destination_ — one or both offsets `{block, inline}` in CSS pixels.
- _Duration_ — a positive number in milliseconds.
- _Easing_ — an author easing function or one of the pre‑defined keywords in §6.2.
- _Snap Strategy_ — `preserve \| suppress \| auto` (default `auto`).

A scroll animation **owns** the target’s scrolling interaction until it _finishes_ or is _aborted_.

> **Note:** Implementations should perform writes on the main thread but keep event listeners **passive** so user‑initiated scrolling is always composited.

---

## 6. <a id="javascript-api">JavaScript API</a>

### 6.1 Interface Definition

```webidl
[Exposed=Window]
interface SmoothScrollController {
  constructor(Element target);

  Promise<void> scrollTo(ScrollToOptions destination,
                         optional ScrollAnimationOptions options = {});

  void            cancel();
  readonly attribute boolean animating;
  readonly attribute AnimationTimeline? timeline;
};
```

### 6.2 Dictionary Types

```webidl
 dictionary ScrollAnimationOptions {
   double              duration = 600;               // ms
   Easing              easing   = "ease";           // pre‑defined or function
   SnapStrategy        snap     = "auto";           // enum
 };

 typedef (DOMString or Function) Easing;

 enum SnapStrategy { "preserve", "suppress", "auto" };
```

If _easing_ is a **Function**, it MUST accept a double **t** in the closed range \[0,1] and return a double in \[0,1] obeying §3 _Author easing function_.

### 6.3 Lifetime

- **animating** MUST be `true` from the time the scroll animation is _started_ until it is _finished_ or _cancelled_.
- **timeline** MUST reference the UA’s `DocumentTimeline` for the scroll animation such that CSS `animation-timeline` may consume it.

A newly constructed `SmoothScrollController` MUST respect the target element’s `scroll-snap-type` and `scroll-behavior` computed styles.

---

## 7. <a id="events">Events</a>

Implementations MUST fire the following **trusted** events at the `SmoothScrollController` instance:

| Event name             | Cancelable | Bubbles | Target     | When fired                                                          |
| ---------------------- | ---------- | ------- | ---------- | ------------------------------------------------------------------- |
| `scrollanimationstart` | false      | false   | controller | Immediately after the algorithm in §8.1 “Start a scroll animation”. |
| `scrollanimationend`   | false      | false   | controller | After §8.4 yields _finish_ or _abort_.                              |

UA MUST NOT fire duplicate events for nested controllers acting on the same target.

---

## 8. <a id="algorithms">Algorithms</a>

This section is **normative**.

Implementations MUST perform all steps atomically on the \[HTML] event loop of the document that owns the `SmoothScrollController` instance. Terminology such as _queue a task_, _microtask checkpoint_, and _event loop_ are defined in \[HTML].

### 8.1 Internal Slots

Each `SmoothScrollController` has the following internal slots:

- `[[target]]` — the _scrollable box_ being controlled.
- `[[options]]` — the `ScrollAnimationOptions` used by the currently‑running animation.
- `[[startTime]]` — a high‑resolution time value taken from `performance.now()`.
- `[[startOffset]]` — the block and inline offsets at `[[startTime]]`.
- `[[delta]]` — destination offset minus `[[startOffset]]`.
- `[[rafID]]` — the identifier returned by the most‑recent `requestAnimationFrame` call, or _null_.

### 8.2 Start a Scroll Animation

Given a controller _c_, a destination _d_, and an `options` dictionary _o_, run the following algorithm (called **start an animation**):

1. **If** `c.animating` is **true**, invoke **cancel the current animation** (8.4).
2. Let _p_ be a new \[Promise] object and set its _pending_ flag to **true**.
3. Store _o_ in `c.[[options]]`.
4. Set `c.[[startTime]]` ← `performance.now()` (with the binding document’s time origin).
5. Resolve `c.[[startOffset]]` to the current scroll position of `c.[[target]]` _without_ flushing layout.
6. Compute `c.[[delta]]` ← _d_ – `c.[[startOffset]]` component‑wise.
7. **If** _o.snap_ is "suppress" **or** ("auto" **and** `|c.[[delta]]|` ≠ 0), temporarily set `scroll-snap-type: none` on `c.[[target]]`, remembering the previous computed value.
8. Set `c.animating` ← **true**.
9. Fire a trusted `scrollanimationstart` event at _c_.
10. Call `requestAnimationFrame(step)` and store the returned handle in `c.[[rafID]]`, where _step_ is defined in 8.3.
11. Return _p_ to the caller.

The _p_ promise is fulfilled in 8.5 or rejected in 8.4.

### 8.3 Per‑Frame Step

The _step_ callback receives a single argument _now_ (DOMHighResTimeStamp) and must:

1. Let _t_ ← clamp(((_now_ – `c.[[startTime]]`) / `c.[[options]].duration`), 0, 1).
2. Let _progress_ ← `easing(t)` where _easing_ is resolved per 6.2.
3. Set the scroll position of `c.[[target]]` to
   `c.[[startOffset]] + *progress* × c.[[delta]]` component‑wise **using** `Element.scrollTo()` with `behavior: 'instant'`.
4. **If** _t_ < 1 **and** `c.animating` is **true**:
   Call `requestAnimationFrame(step)` and update `c.[[rafID]]`.
5. **Otherwise** invoke **finish the animation** (8.5).

### 8.4 Cancel the Current Animation

To **cancel the current animation** for controller _c_:

1. **If** `c.animating` is **false**, abort these steps.
2. Set `c.animating` ← **false**.
3. If `c.[[rafID]]` is not _null_, call `cancelAnimationFrame(c.[[rafID]])` and set the slot to _null_.
4. Restore any `scroll-snap-type` value that was overridden in 8.2 step 7.
5. Reject the _p_ promise with an `AbortError` DOMException and set its _pending_ flag to **false**.
6. Fire a trusted `scrollanimationend` event at _c_.

Any user input of type `wheel`, `touchstart`, `keydown`, or `pointerdown` that produces a **scrolling interaction start** MUST immediately run this algorithm unless \[event.defaultPrevented] is **true**.

### 8.5 Finish the Animation

To **finish the animation** for controller _c_:

1. Restore any `scroll-snap-type` value that was overridden in 8.2 step 7.
2. **If** the restored `scroll-snap-type` is not `none` **and** `c.[[options]].snap` is not "suppress":
   Invoke `Element.scrollTo()` with the nearest snap position as determined by _CSS‑SCROLL‑SNAP‑1_ §6.
3. Set `c.animating` ← **false**.
4. Resolve the _p_ promise with _undefined_ and set its _pending_ flag to **false**.
5. Fire a trusted `scrollanimationend` event at _c_.

When the promise is fulfilled or rejected, the microtask checkpoint MUST be reached before firing `scrollanimationend`, ensuring handler ordering consistent with \[DOM].

### 8.6 Scheduling and Pause Throttling

User agents SHOULD throttle the per‑frame step to at most one invocation per rendering update for the document, but MUST NOT drop the first and last frames of an animation. Implementations MAY migrate the scroll writes to a compositor thread if the UA supports scroll‑off‑main‑thread **and** can guarantee ordering relative to DOM events.

> **Note:** These algorithms intentionally mirror the structure of the Web Animations API’s _playback algorithms_ so that a future integration could substitute a UA‑level implementation without breaking authored code.

---

## 9. <a id="integration-with-css-scroll-snap">Integration with CSS Scroll Snap</a> <a id="integration-with-css-scroll-snap">Integration with CSS Scroll Snap</a>

An implementation MUST restore the author’s computed `scroll-snap-type` as soon as the animation finishes or is cancelled so further UA or user‑driven scrolling behaves per spec. Snapping MUST be performed by the UA, _not_ the implementation, to ensure consistent selection of snap positions in nested scrollers.

When `o.snap` is `preserve`, the implementation MUST finish at the mathematically exact destination, letting the UA initiate a separate snap sequence if required. When `o.snap` is `auto` (default), the implementation SHOULD finish at a destination that coincides with the nearest snap position if such a position exists within ±0.5 CSS pixels of the supplied destination.

---

## 10. <a id="accessibility-considerations">Accessibility Considerations</a>

- Respect [`prefers-reduced-motion`](https://www.w3.org/TR/mediaqueries-5/#prefers-reduced-motion). If the query matches `reduce`, implementations SHOULD immediately jump to the destination without animation.
- The `cancel()` method SHOULD be invoked automatically when assistive‑technology shortcuts scroll the page.
- Implementations SHOULD expose meaningful states via ARIA `busy` or live regions if scroll animations hide or reveal content critical for comprehension.

---

## 11. <a id="security-privacy-considerations">Security & Privacy Considerations</a>

This API does not expose any additional fingerprintable information or cross‑origin vectors beyond existing scroll APIs. Timelines generated by the controller are same‑origin and follow _\[HTML]_ Event Loop semantics.

---

## 12. <a id="examples">Examples</a>

### 12.1 Basic Ease‑Out Scroll

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

### 12.2 Carousel with Preserved Snap

```js
const gallery = new SmoothScrollController(document.querySelector(".carousel"));

document.querySelector("#next").addEventListener("click", () => {
  const pos = gallery.target.scrollLeft + gallery.target.clientWidth;
  gallery.scrollTo({ inline: pos }, { snap: "preserve" });
});
```

---

## 13. <a id="acknowledgements">Acknowledgements</a>

Thanks to Edwin Smith, Katie Hempenius, Sadeq Alyan, the CSS WG’s Scroll Linked Animations Task Force, and early implementers on the open‑source **scrollfly** project for feedback.

---

## 14. <a id="references">References</a>

- \[CSSOM‑VIEW] CSSOM View Module — W3C Candidate Recommendation, 28 March 2023.
- \[CSS‑SCROLL‑SNAP‑1] CSS Scroll Snap Module Level 1 — W3C Recommendation, 14 December 2022.
- \[DOM] DOM Standard — WHATWG Living Standard.
- \[HTML] HTML Standard — WHATWG Living Standard.
- \[RFC 2119] Key words for use in RFCs to Indicate Requirement Levels.

---

## 15. <a id="change-log">Change Log</a>

- **02 Aug 2025** — Initial editor’s draft.
