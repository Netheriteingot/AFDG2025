// Dialog: a conversation box that owns its own DOM.
//
// A Dialog holds some text and a list of options. Each option's onClick returns the
// Dialog to move to -- that return value is how a conversation branches, because the
// option decides what comes next and the dialog hands over to it:
//
//     null / undefined  the conversation ends and the box goes away
//     this              nothing happened; stay on this dialog
//     another Dialog    hand this box over to that one and continue in it
//
// That last line is literal: the incoming dialog takes over the outgoing one's element and
// mount point, so a chain of dialogs is one node the whole way down. The conversation
// changes, the box does not.
//
// Nothing here touches the DOM until a dialog is shown. main.js is loaded from <head>,
// so a `new Dialog(...)` at module scope runs before <body> exists; the element is built
// on first use by the `dom` getter and kept, so a dialog shown a second time is the same
// box with the same listeners.
//
// Two ways a dialog ends up NOT owning its box. Pass `element` and it renders into the node
// you hand it; set `preservePositioning` and it will not style, move, mount or remove that
// element at all, because something else -- a Frankenstein rig, say -- has charge of where
// it is. The first implies the second.

class Dialog {
    constructor(opts) {
        opts = opts || {};

        this.text = opts.text || "";
        this.options = opts.options || null;   // [{text, onClick(dialog, event), style}]
        this.style = opts.style || null;       // CSS for the box, applied verbatim
        this.position = opts.position || null; // CSS for placing it, applied over `style`
        this.mountTo = opts.mountTo || null;   // element | selector | fn -> either | null
        this.id = opts.id || null;
        this.className = ("className" in opts) ? opts.className : "afdgDialog";

        // A node to render into instead of building one. Supplying it says the caller has
        // already decided where the box lives, so placement is theirs by default; only an
        // explicit `preservePositioning: false` takes the box back.
        this.element = opts.element || null;
        this.preservePositioning = (opts.preservePositioning !== undefined)
            ? !!opts.preservePositioning
            : this.element !== null;

        // An adopted node keeps what it arrived with. Writing id/className would rename a
        // rig's part out from under the rig, and it never gets the `display: none` the
        // build path puts on a box of our own -- the caller's element is not ours to hide
        // before it is shown.
        if (this.element) {
            if (opts.id) this.element.id = this.id;
            if ("className" in opts) this.element.className = this.className;
        }

        this._dom = this.element;
        this._textEl = null;
        this._optsEl = null;
        this._mountWarned = false;
        this._preserveWarned = false;
        this._styled = false;

        // "This dialog is on screen", tracked here rather than read off the element's
        // parent: a handover moves the conversation without the box ever leaving its
        // parent, so parentNode would report the incoming dialog as already shown, and
        // would keep reporting a rig-owned box as shown long after it was hidden.
        this._shown = false;
    }

    // This dialog's own element. Built on first call and kept, so `dom` is stable, and
    // changing `text`/`options`/`style` needs a render() to take effect -- for as long as
    // the dialog holds the box. A handover gives the box to the next dialog, and reading
    // `dom` after that builds a fresh empty one: the box went with the conversation.
    get dom() {
        if (!this._dom) {
            const el = document.createElement("div");
            if (this.id) el.id = this.id;
            if (this.className) el.className = this.className;
            el.style.display = "none";
            this._dom = el;
        }
        // Applied once, whether we built the element or were handed one, so reading `.dom`
        // on an `element:` dialog gives the box render() would have given it.
        if (!this._styled) { this._styled = true; this._style(this._dom); }
        return this._dom;
    }

    // Whether this dialog is the one on screen -- not whether its element has a parent.
    // The two differ: a handover can leave the box mounted while the conversation moves
    // on, and a box owned by someone else is never removed at all.
    get shown() {
        return this._shown;
    }

    // The styling this dialog may put on its element, in the order a box has always been
    // built in: defaults -> style -> position, so `position` settles a conflict. Shared by
    // the `dom` getter and render() so the two cannot disagree about it.
    //
    // A dialog that does not own its element's placement does not get to apply the default
    // box either, and that is not only about coordinates: DEFAULT_STYLE carries `width`,
    // `padding`, `border` and a `background` *shorthand*. Assigning `background` resets
    // `background-image`, so on a node that is also a puppet part it would wipe the part's
    // picture; and `width: 30vw` moves the box without moving the part's own box, which is
    // what its relative joints are a fraction of. The caller's `style` and `position` are
    // still applied -- those are instructions about this dialog, not defaults.
    _style(el) {
        if (!this.preservePositioning) {
            applyCss(el, Dialog.DEFAULT_STYLE);
            applyCss(el, Dialog.DEFAULT_POSITION);
        }
        applyCss(el, this.style);
        applyCss(el, this.position);
    }

    // Rebuild the contents from the current fields. Safe to call repeatedly.
    render() {
        const el = this.dom;

        // Re-applied every render, not just at build time, so mutating `style` or
        // `position` and calling render() does what it looks like it should.
        this._style(el);

        // Remove our own nodes instead of clearing innerHTML: innerHTML is an inert
        // string in the test stub, where the old children would pile up rather than
        // being replaced. `_textEl`/`_optsEl` may have come from the dialog this one took
        // over from -- those are exactly the two nodes still sitting in this element,
        // which is why a handover transfers them rather than leaving them to stack.
        if (this._textEl && this._textEl.parentNode === el) el.removeChild(this._textEl);
        if (this._optsEl && this._optsEl.parentNode === el) el.removeChild(this._optsEl);

        this._textEl = document.createElement("div");
        this._textEl.innerHTML = this.text;   // innerHTML, so a dialog may embed markup
        el.appendChild(this._textEl);

        // No options is a dead end, so a dialog always offers a way out.
        const options = (this.options && this.options.length) ? this.options : [{ text: "OK" }];
        this._optsEl = document.createElement("div");
        for (let i = 0; i < options.length; i++) {
            this._optsEl.appendChild(this._optionButton(options[i]));
        }
        el.appendChild(this._optsEl);
        return this;
    }

    show() {
        // Tracked on the dialog rather than read off the element: a handover leaves the
        // box mounted while the conversation moves on, and a second appendChild would move
        // the node in a browser and duplicate it in the test stub. Either way it is never
        // what was meant.
        if (this._shown) return this;

        if (Dialog.active && Dialog.active !== this) Dialog.active.hide();

        this.render();
        this.dom.style.display = "block";

        // An element someone else placed stays where they put it. Appending it to mountTo
        // would pull a rig's part out of the rig, and this dialog never agreed to mount
        // anything in the first place.
        if (this.preservePositioning) {
            if (!this.dom.parentNode && !this._preserveWarned) {
                this._preserveWarned = true;
                console.warn("Dialog: preservePositioning is set, but the element has no " +
                             "parent -- nothing has adopted it, so it will not be visible. " +
                             "Add it to a rig or the document, or drop preservePositioning " +
                             "to let the dialog mount it.");
            }
        } else {
            resolveMount(this.mountTo, this).appendChild(this.dom);
        }

        this._shown = true;
        Dialog.active = this;
        return this;
    }

    hide() {
        // Under preservePositioning the element was never ours to place, so it is never
        // ours to remove either: the conversation ends -- or hands the box on -- with the
        // box still where its owner put it, its last line and all.
        if (!this.preservePositioning && this._dom && this._dom.parentNode) this._dom.parentNode.removeChild(this._dom);

        this._shown = false;

        // Only surrender the active slot if it is ours. Hiding a dialog that is not on
        // screen must not make the next show() believe the screen is already clear and
        // leave two boxes up at once. A box owned by someone else is a case of this: it
        // stays visible while another dialog is active, because only its owner can take
        // it down.
        if (Dialog.active === this) Dialog.active = null;
        return this;
    }

    _optionButton(option) {
        const btn = document.createElement("button");
        btn.textContent = option.text || "";
        btn.style.marginTop = "15px";
        if (option.style) applyCss(btn, option.style);
        // addEventListener rather than an onclick attribute: these nodes are created
        // at runtime, so there is no markup to hang a global function off.
        btn.addEventListener("click", (event) => this._choose(option, event));
        return btn;
    }

    _choose(option, event) {
        // An option with no onClick is a plain dismissal.
        if (typeof option.onClick !== "function") { this.hide(); return; }

        // Called with the dialog as `this` as well as the first argument, so an option
        // can `return this`. With a plain call `this` would be the button element in a
        // browser and the global object in the test stub, and `return this` would fall
        // through to the close branch below.
        const next = option.onClick.call(this, this, event);

        if (next === this) return;                              // nothing happened
        if (next instanceof Dialog) {
            // Hide first: hide() is the only thing that detaches the element, and it needs
            // _dom still pointing at it to do so. A box owned by someone else is not
            // detached either way, which is the whole point of that flag.
            this.hide();
            next._adopt(this);
            next.show();
            return;
        }
        if (next === null || next === undefined) { this.hide(); return; }

        console.warn("Dialog: an option's onClick should return a Dialog, `this`, or " +
                     "null/undefined to end the conversation. Got " + next + " instead -- " +
                     "ending the dialog.", option);
        this.hide();
    }

    // Continue the conversation in `from`'s box instead of building a second one, so a
    // chain of dialogs is one node the whole way down.
    //
    // Only when this dialog has no box of its own: one built with `element`, or shown
    // before and so already built, keeps its home, and `from` goes away as usual -- unless
    // `from` is itself owned by something else, in which case it stays where its owner put
    // it and the two boxes coexist.
    //
    // preservePositioning and mountTo describe the box, not the dialog, so they come with
    // it: a dialog that inherits an owned node stays owned, and one with nowhere of its own
    // to mount carries on in the same place rather than jumping to <body>. (`mountTo: null`
    // is indistinguishable from unset, so a dialog that explicitly asked for <body> inherits
    // the mount instead; narrow enough to live with, and a chain staying put is the point.)
    _adopt(from) {
        if (this._dom) return false;

        this._dom = from._dom;
        this._textEl = from._textEl;
        this._optsEl = from._optsEl;
        this.preservePositioning = from.preservePositioning;
        if (!this.mountTo) this.mountTo = from.mountTo;

        // The box is ours now. Leaving `from` pointing at it would let a later show() on
        // `from` append the same node a second time, and its render() would fight ours for
        // the children.
        from._dom = null;
        from._textEl = null;
        from._optsEl = null;
        from._styled = false;
        return true;
    }
}

// The box you get with no style or position of your own: the prestige layer's old
// #dialogBox, which used to be static markup in index.html.
//
// Skipped whole under preservePositioning -- see _style(). These are the defaults a dialog
// puts on a box it built, and an element that belongs to something else (a puppet part)
// already has an owner for every one of them.
//
// `color` is spelled out here on purpose. That markup sat inside #nextPrestigeLayer and
// inherited its `color: white`; a box built here can be mounted anywhere -- <body> by
// default -- where the inherited colour is the page default, which would be black text
// on a dark box. (Option buttons keep the browser's own button colour, as they did
// before.)
Dialog.DEFAULT_STYLE = {
    background: "rgba(30,30,40,0.95)",
    border: "2px solid #888",
    borderRadius: "8px",
    padding: "20px",
    width: "30vw",
    boxSizing: "border-box",
    color: "white",
    zIndex: "1001"
};

// Where a self-built box goes. Also skipped whole under preservePositioning: a rig writes
// `transform` on its parts every frame, so this would be overwritten immediately anyway,
// and `position: fixed` would be a lie about a node in the rig's own container.
Dialog.DEFAULT_POSITION = {
    position: "fixed",
    top: "50%",
    right: "5vw",
    transform: "translateY(-50%)"
};

// The dialog currently on screen, or null. Read by tests and by anything that needs
// to know whether a conversation is in progress.
Dialog.active = null;

// ---------- helpers ----------

// "background-color" -> "backgroundColor". element.style only knows the camelCase
// spelling, and the test stub's box model reads camelCase exclusively, so a kebab-case
// key would be set and then never seen by anything.
function cssProp(key) {
    return key.indexOf("-") < 0 ? key : key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

// Split a CSS string into [prop, value] pairs. The ";" split ignores separators inside
// parentheses, so a value like url(data:...;base64,...) survives intact.
function parseCss(str) {
    const pairs = [];
    let depth = 0, buf = "";
    const take = () => {
        const i = buf.indexOf(":");
        if (i > 0) pairs.push([cssProp(buf.slice(0, i).trim()), buf.slice(i + 1).trim()]);
        buf = "";
    };
    for (const ch of str) {
        if (ch === "(") depth++;
        else if (ch === ")") depth--;
        if (ch === ";" && depth === 0) take(); else buf += ch;
    }
    take();
    return pairs;
}

// Apply a CSS spec to an element. A spec is an object ({top: "50%"}) or a string
// ("top: 50%; right: 5vw").
//
// Strings are parsed and assigned one property at a time rather than assigned to
// element.style or cssText, because assigning a string to .style replaces the whole
// style object -- which main.js already does to #score, and which the test stub models
// as "this element no longer has a box".
function applyCss(el, spec) {
    if (!spec) return;
    if (typeof spec === "string") {
        for (const [prop, value] of parseCss(spec)) el.style[prop] = value;
        return;
    }
    for (const key of Object.keys(spec)) el.style[cssProp(key)] = spec[key];
}

// Work out where a dialog's element should be appended.
//
// `mountTo` names the DOM parent only; it has no say in the CSS `position` the dialog
// uses. A `position: fixed` box is placed against the viewport no matter what it is
// mounted inside -- unless an ancestor has a transform/filter/perspective, which makes
// that ancestor the containing block. Mount inside something and want coordinates
// relative to it, and you want `position: absolute` plus a positioned parent.
function resolveMount(mountTo, dialog) {
    if (typeof mountTo === "function") mountTo = mountTo(dialog);
    if (mountTo === null || mountTo === undefined) return document.body;

    if (typeof mountTo === "string") {
        // "#id" goes through getElementById so it works even where there is no
        // selector engine; anything fancier needs querySelector.
        let el = null;
        if (mountTo.charAt(0) === "#") el = document.getElementById(mountTo.slice(1));
        else if (document.querySelector) el = document.querySelector(mountTo);

        if (!el) {
            if (!dialog._mountWarned) {
                dialog._mountWarned = true;
                console.warn("Dialog: mountTo " + JSON.stringify(mountTo) + " matched no " +
                             "element -- mounting to document.body instead.");
            }
            return document.body;
        }
        return el;
    }

    if (typeof mountTo.appendChild === "function") return mountTo;

    if (!dialog._mountWarned) {
        dialog._mountWarned = true;
        console.warn("Dialog: mountTo must be an element, a selector, or a function " +
                     "returning one. Got " + mountTo + " -- mounting to document.body.");
    }
    return document.body;
}
