// main.js --总控制: the stage machine, the shared clock, the stage bar, and boot.
//
// Each stage lives in its own file (stage0.js, stage1.js, ...) and registers its 50ms
// tick with RegisterTick below. This file knows the stage *number* and how to persist it;
// it does not know what any stage contains. The stage files are loaded after this one, so
// every call into them happens from DOMContentLoaded or the clock, never at module scope.
//
// Classic scripts, no modules, no IIFE: index.html's inline onclick handlers and the
// stage files both reach these names through the global scope.

// Progression stage: 0 = the initial (points / score) game, 1 = prestige unlocked.
// Nothing an earlier stage produced carries into a later one, so the stage number
// is the only thing worth remembering between sessions.
var stage = 0;

// Set when the score game has unlocked the next layer, and again on every load of a
// saved stage >= 1. Read by Stage1Tick to decide whether #nextLayerBtn is offered.
var nextLayerUnlocked = false;

// ===== The clock =====
// One 50ms interval for every stage. Each stage file calls RegisterTick at load time, so
// adding a stage never means editing this loop.
var tickers = [];
function RegisterTick(fn) {
    tickers.push(fn);
}

setInterval(function () {
    for (var i = 0; i < tickers.length; i++) tickers[i]();
}, 50);

// ===== Stage =====
// The stage only ever moves forward: once you are past a stage, that stage's
// content is not restored, because it has no meaning at the new stage.
const STAGE_KEY = "afdg2025_stage";

// Storage can be unavailable (private window, blocked site data, a file:// page).
// Failing quietly here is what turns "I set the stage but the reload showed 0"
// into a mystery, so say it out loud -- once, not on every call.
var stageStorageWarned = false;
function StageStorageBroken(e) {
    if(stageStorageWarned) return;
    stageStorageWarned = true;
    console.warn("AFDG2025: localStorage is not available, so the stage cannot be " +
                 "saved. The game still plays, but a reload will start over at " +
                 "stage 0.", e);
}

function SetStage(n) {
    if(n <= stage) return; // stages do not go backwards
    stage = n;
    try {
        localStorage.setItem(STAGE_KEY, String(stage));
    } catch (e) {
        // The in-memory stage still moves; only persistence is lost.
        StageStorageBroken(e);
    }
    RenderStageBar();
}

function RenderStageBar() {
    var num = document.getElementById("stageNum");
    if(num) num.textContent = stage;
}

// The transition out of the score game: unlocking the next layer both opens the door and
// records that the player has reached stage 1.
function UnlockNextLayer() {
    nextLayerUnlocked = true;
    SetStage(1); // prestige is now unlocked: this is stage 1, and it persists
}

// Boot: restore the saved stage. A returning stage-1 player has already played the
// stage-0 game, so skip the welcome screen and open the prestige layer directly.
function LoadStage() {
    try {
        var saved = parseInt(localStorage.getItem(STAGE_KEY), 10);
        if(saved >= 1) stage = saved;
    } catch (e) { StageStorageBroken(e); }

    RenderStageBar();

    if(stage >= 1) {
        nextLayerUnlocked = true; // the next layer is unlocked, so its button is available
        StartGame();              // dismiss the welcome screen (stage0.js)
        EnterNextLayer();         // open the prestige layer (stage1.js)
    }
}

// The stage bar sits above everything (z-index 9999), so it needs to be movable
// when it covers something. It stays position:fixed -- it just follows the mouse.
// The dragged position is deliberately NOT persisted: only `stage` is meant to
// survive a reload, so every load starts back in the corner.
function MakeStageBarDraggable() {
    var bar = document.getElementById("stageBar");
    if(!bar) return;

    var grab = null;      // pointer offset inside the bar, while dragging
    var moved = false;    // true once left/top are in charge instead of right/bottom

    function clamp(v, max) { return Math.max(0, Math.min(v, max)); }

    bar.addEventListener("pointerdown", function(e) {
        var r = bar.getBoundingClientRect();
        // The default anchor is right/bottom. Switch to left/top at the very same
        // pixel before moving: with both anchors set the bar would stretch, and
        // reading the rect first is what keeps it from jumping on grab.
        bar.style.right = "auto";
        bar.style.bottom = "auto";
        bar.style.left = r.left + "px";
        bar.style.top = r.top + "px";
        moved = true;

        grab = { dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, h: r.height };
        bar.style.cursor = "grabbing";
        bar.setPointerCapture(e.pointerId);
        e.preventDefault(); // otherwise the drag selects the text
    });

    bar.addEventListener("pointermove", function(e) {
        if(!grab) return;
        // Keep the whole bar on screen -- dragged past an edge it would be gone.
        bar.style.left = clamp(e.clientX - grab.dx, window.innerWidth  - grab.w) + "px";
        bar.style.top  = clamp(e.clientY - grab.dy, window.innerHeight - grab.h) + "px";
    });

    function release(e) {
        if(!grab) return;
        grab = null;
        bar.style.cursor = "grab";
        if(bar.hasPointerCapture(e.pointerId)) bar.releasePointerCapture(e.pointerId);
    }
    bar.addEventListener("pointerup", release);
    bar.addEventListener("pointercancel", release);

    // A shrunk window can leave a dragged bar hanging off the edge.
    window.addEventListener("resize", function() {
        if(!moved) return; // still anchored right/bottom, which handles this itself
        var r = bar.getBoundingClientRect();
        bar.style.left = clamp(r.left, window.innerWidth  - r.width)  + "px";
        bar.style.top = clamp(r.top,  window.innerHeight - r.height) + "px";
    });
}

// main.js runs from <head>, where no DOM exists yet, so boot once it is parsed.
window.addEventListener("DOMContentLoaded", function() {
    MakeStageBarDraggable();
    LoadStage();
});
