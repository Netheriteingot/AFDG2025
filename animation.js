// Animation system: Tween + Timeline
//
// Tween  = a target-agnostic "value over time" unit. All of its properties are
//          pure math (duration, easing, from/to). The only place that knows what
//          object is being driven is the apply(v) callback.
// Timeline = orchestrates WHEN each Tween starts. It never touches objects.
//
// Time is expressed in SECONDS in the public API; internally converted to ms.

// ---- Easing functions: (t in 0..1) -> (eased 0..1) ----
const Easings = {
    linear:        t => t,

    easeInQuad:    t => t * t,
    easeOutQuad:   t => 1 - (1 - t) * (1 - t),
    easeInOutQuad: t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,

    easeInCubic:   t => t * t * t,
    easeOutCubic:  t => 1 - Math.pow(1 - t, 3),
    easeInOutCubic:t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,

    easeInSine:    t => 1 - Math.cos((t * Math.PI) / 2),
    easeOutSine:   t => Math.sin((t * Math.PI) / 2),
    easeInOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2
};

// Resolve an easing spec (name string or custom function) to a function.
function resolveEasing(easing) {
    if (typeof easing === "function") return easing;
    if (typeof easing === "string" && Easings[easing]) return Easings[easing];
    return Easings.linear;
}

// A from/to spec may be a plain object or a function returning one (evaluated
// when the tween activates, so "from current position" is expressible).
function resolveValues(spec) {
    return typeof spec === "function" ? spec() : spec;
}

// ---- Tween: a single value-over-time animation ----
class Tween {
    // opts:
    //   duration   seconds (default 0)
    //   easing     name string or (t)=>t' (default "linear")
    //   from/to    property maps { key: number } or functions returning one
    //   apply(v)   REQUIRED: receives the interpolated value map, writes it to the target
    //   onComplete optional callback fired once when the tween finishes
    constructor(opts) {
        opts = opts || {};
        this.duration = (opts.duration || 0) * 1000; // seconds -> ms
        this.easingFn = resolveEasing(opts.easing);
        this.fromSpec = opts.from || {};
        this.toSpec = opts.to || {};
        this.applyFn = opts.apply || (() => {});
        this.onComplete = opts.onComplete || null;

        // Resolved on activation
        this.from = null;
        this.to = null;
        this.activated = false;
        this.completed = false;
    }

    // Called the first time this tween becomes active. Locks in from/to values.
    activate() {
        this.from = resolveValues(this.fromSpec);
        this.to = resolveValues(this.toSpec);
        this.activated = true;
        this.completed = false;
    }

    // Advance to localTime (ms since this tween's start). Returns true if finished.
    tick(localTime) {
        if (!this.activated) this.activate();

        let t = this.duration > 0 ? localTime / this.duration : 1;
        if (t >= 1) t = 1;
        const e = this.easingFn(t);

        // Interpolate every key present in `to` (fall back to `from` or 0).
        const v = {};
        for (const key in this.to) {
            const a = (key in this.from) ? this.from[key] : 0;
            const b = this.to[key];
            v[key] = a + (b - a) * e;
        }
        // Also pass through keys only present in `from` (held constant).
        for (const key in this.from) {
            if (!(key in v)) v[key] = this.from[key];
        }

        this.applyFn(v);

        if (t >= 1 && !this.completed) {
            this.completed = true;
            if (this.onComplete) this.onComplete();
            return true;
        }
        return t >= 1;
    }

    // Reset so the tween can be played again.
    reset() {
        this.activated = false;
        this.completed = false;
        this.from = null;
        this.to = null;
    }
}

// ---- Timeline: orchestrates WHEN each step starts ----
// Each step is { start: ms, duration: ms, tween: Tween|null, fn: function|null, fired: bool }.
// Steps are anchored relative to the PREVIOUS step:
//   .add(tween)        first step, starts at t=0
//   .then(tween)       starts when the previous step FINISHES (prevStart + prevDuration)
//   .after(sec, tween) starts `sec` after the previous step STARTS (may overlap it)
//   .call(fn)          zero-duration step: run fn at this point (like .then)
//   .wait(sec)         advance the cursor by sec (empty gap)
class Timeline {
    constructor() {
        this.steps = [];
        this.prevStart = 0;      // start time (ms) of the last added step
        this.prevDuration = 0;   // duration (ms) of the last added step
        this.playing = false;
        this.startWallClock = 0; // performance.now() when play() was called
        this.rafId = null;
        this.onComplete = null;
        this.selfDriven = false;
    }

    _push(startMs, tween, fn) {
        const duration = tween ? tween.duration : 0;
        this.steps.push({ start: startMs, duration, tween: tween || null, fn: fn || null, fired: false });
        this.prevStart = startMs;
        this.prevDuration = duration;
        return this;
    }

    // First step (or another step also anchored at t=0).
    add(tween) {
        return this._push(0, tween, null);
    }

    // Start after the previous step finishes.
    then(tween) {
        return this._push(this.prevStart + this.prevDuration, tween, null);
    }

    // Start `sec` seconds after the previous step STARTS (regardless of completion).
    after(sec, tween) {
        return this._push(this.prevStart + sec * 1000, tween, null);
    }

    // Run a function at the current point (zero-duration, anchored like .then).
    call(fn) {
        return this._push(this.prevStart + this.prevDuration, null, fn);
    }

    // Empty gap: advance the cursor by `sec` without adding an animation.
    wait(sec) {
        this.prevStart = this.prevStart + this.prevDuration;
        this.prevDuration = sec * 1000;
        return this;
    }

    // Total timeline length (ms).
    getTotalDuration() {
        let max = 0;
        for (const s of this.steps) {
            max = Math.max(max, s.start + s.duration);
        }
        return max;
    }

    // Advance the whole timeline to `elapsed` ms since it started.
    // Safe to call every frame; drives tweens and fires .call() steps once.
    tick(elapsed) {
        for (const s of this.steps) {
            if (elapsed < s.start) continue; // not started yet

            if (s.fn) {
                // Zero-duration function step: fire exactly once.
                if (!s.fired) {
                    s.fired = true;
                    s.fn();
                }
            } else if (s.tween) {
                const local = elapsed - s.start;
                s.tween.tick(local); // clamps internally at t>=1
            }
        }
        return elapsed >= this.getTotalDuration();
    }

    // Start a self-driven requestAnimationFrame loop.
    play() {
        this.playing = true;
        this.selfDriven = true;
        this.startWallClock = performance.now();

        const loop = () => {
            if (!this.playing) return;
            const elapsed = performance.now() - this.startWallClock;
            const done = this.tick(elapsed);
            if (done) {
                this.playing = false;
                if (this.onComplete) this.onComplete();
                return;
            }
            this.rafId = requestAnimationFrame(loop);
        };
        this.rafId = requestAnimationFrame(loop);
        return this;
    }

    // Stop the self-driven loop (no-op for externally ticked timelines).
    stop() {
        this.playing = false;
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        return this;
    }

    // Reset all steps/tweens so the timeline can play again from the start.
    reset() {
        for (const s of this.steps) {
            s.fired = false;
            if (s.tween) s.tween.reset();
        }
        return this;
    }
}
