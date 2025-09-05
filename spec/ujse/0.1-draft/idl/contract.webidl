// Axis and directions


// State persistence
dictionary AxisState { AxisKeyword axis; double position; };
dictionary ScrollState {
sequence<AxisState> axes;
double timestamp; // ms since epoch or host-defined monotonic time
};


// ScrollTo options (per-call animation customization)
dictionary ScrollToOptions {
boolean immediate = false; // if true, jump to value this tick
Animator? animator; // overrides the Engine's default animator for this call
double? duration; // ms; if present and animator is null, hosts MAY create a time-based animator
DOMString? easing; // host-defined token (e.g., CSS easing for Web bindings)
boolean clamp = true; // apply domain-appropriate clamping/wrapping
boolean userCanInterrupt = true; // if true, user input overrides the in-flight animation
};


// Animator advances current toward target by dt; return null to signal completion this frame.
interface Animator {
double? step(double current, double target, double dt);
};


// Scheduler ties into the host's presentation clock (e.g., rAF, display link, Choreographer)
callback FrameCallback = void (DOMHighResTimeStamp highResTime);
interface Scheduler {
unsigned long start(FrameCallback callback);
void stop(optional unsigned long handle);
};


// Drivers adapt the host's scrollable surface to the Engine
callback ScrollListener = void (double position);
dictionary DomainDescriptor {
DomainKind kind;
double? min; // bounded/end-unbounded/all-unbounded lower bound; null means -Infinity
double? max; // bounded upper bound; null means +Infinity
double? period; // circular only (required > 0 when kind == "circular")
};
interface Driver {
double read(AxisKeyword axis);
void write(AxisKeyword axis, double position);
double viewportExtent(AxisKeyword axis);
double contentExtent(AxisKeyword axis);
DomainDescriptor domain(AxisKeyword axis);
Subscription onUserScroll(AxisKeyword axis, ScrollListener listener);
};


interface Engine {
// Programmatic scroll with optional per-call animation customization
void scrollTo(AxisKeyword axis, double value, optional ScrollToOptions options);


// State persistence API
ScrollState snapshot();
void restore(ScrollState state, optional boolean immediate = true);
};


// Programmatic settle information surfaced to plugins
dictionary SettleInfo {
double position;
double target;
double velocity;
Direction direction;
double? limit;
};


interface Plugin {
readonly attribute DOMString name;
void init(Engine engine);
// Fired when the host reports a user-initiated scroll for this axis
void onUserScroll(double position);
// Fired whenever the Engine's target changes (scrollTo or impulses applied)
void onTargetChange(double target);
// Fired exactly once when an in-flight programmatic animation ends (including immediate scrollTo)
void onSettle(SettleInfo info);
void destroy();
};


// Optional adapter for host history/storage integration
interface HistoryAdapter {
void save(ScrollState state, DOMString key);
ScrollState? load(DOMString key);
};