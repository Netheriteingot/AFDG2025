// Stage 1: the prestige layer -- the puppet, its entrance animation, and the conversation
// that plays over it.
//
// Loaded after main.js, which owns the stage machine and the 50ms clock. This file
// registers Stage1Tick() with that clock at the bottom; EnterNextLayer() is called by the
// control file (LoadStage) and by the #nextLayerBtn inline handler in index.html.

var prestigePuppet = null;
var prestigeEntered = false;
var prestigeTimeline = null; // entrance animation timeline
var prestigeRafId = null;    // render loop handle; null while the loop is stopped

// ===== Prestige Dialog Script =====
// Write your own content here. Each option's onClick returns the Dialog to move to;
// returning nothing ends the conversation and takes the box away, and returning `this`
// stays put. An option with no onClick at all is a plain dismissal.
//
// The chain is written back-to-front so each dialog can name the one after it -- that
// only works because the reference sits inside a closure, so `() => prestigeDialog3`
// is fine but `prestigeDialog3` on its own would throw before it is defined.
//
// These three lines are still the original placeholder text.

// ===== Weapon Selection =====
// Hayita needs a weapon before the game lets the player continue. The three weapons are
// all long, thin things, which is why their placeholder art is 1200x150
// (pics/weapon_*.png).
const WEAPONS = [
    { label: "A. long note",         name: "long note",         image: "pics/weapon_long_note.png" },
    { label: "B. line of code",      name: "line of code",      image: "pics/weapon_line_of_code.png" },
    { label: "C. steam achievement", name: "steam achievement", image: "pics/weapon_steam_achievement.png" }
];

// The forearm spins at 50rad/s. A preview slows it to 5% of that, and reselecting puts
// the original back, so both speeds are named once instead of inlined at each use.
function Arm2Spin() { return (Date.now() / 1000) * -50 * 180 / Math.PI; }
function Arm2PreviewSpin() { return (Date.now() / 1000) * -2.5 * 180 / Math.PI; }

// The forearm's picture and joint as loadPart() left them, captured at setup so that
// "I want to reselect..." can put them back exactly.
var arm2RestImage = null;
var arm2RestJoint = null;
// The forearm's resting swing, captured so "change the JSON file" can offset it without
// restating the animation.
var arm2RestTranslateX = null;

// The weapon currently on the arm while its preview is up; null when the arm is bare.
var previewedWeapon = null;
// What the player accepted with "Good."; null until then. This is the record that the
// selection leaves behind.
var chosenWeapon = null;

// Built before the prestige chain because prestigeDialog3 hands over to the selection.
// weaponDialog is assigned below, after the refusal dialog that names it in a closure.
let weaponDialog = null;

// The "no weapon" option, mutated once the player has been made to come back: it becomes
// a random pick instead. What a random pick does is not written yet, so for now it just
// stays on the selection screen.
const noWeaponOption = {
    text: "D. sorry, no weapon for you",
    onClick: () => weaponRefuseDialog
};

function ReturnToWeaponSelection() {
    noWeaponOption.text = "select a random one for me";
    noWeaponOption.onClick = () => weaponDialog; // TODO: pick a random weapon
    return weaponDialog;
}

const weaponRefuseDialog = new Dialog({
    text: "The author of the game requires that a weapon be chosen to continue playing!",
    options: [
        { text: "O", onClick: ReturnToWeaponSelection },
        { text: "K", onClick: ReturnToWeaponSelection }
    ],
    mountTo: "#nextPrestigeLayer"
});

// Picking a weapon previews it: the forearm takes the weapon's picture and holds it at
// the picture's left-center, and the arm's spin drops to 5%.
function PreviewWeapon(weapon) {
    previewedWeapon = weapon;

    // The art is 1200x150. "50%" measures against this part's own height, so the joint
    // lands halfway down the picture's left edge -- the grip end.
    prestigePuppet._loadImage("arm2_mirror", weapon.image);
    prestigePuppet.setJoint("arm2_mirror", "arm1_mirror", 0, "50%");
    prestigePuppet.setRotation("arm2_mirror", "relative", Arm2PreviewSpin);

    weaponPreviewDialog.text = weapon.name;
    return weaponPreviewDialog;
}

// Undo PreviewWeapon()'s changes to the rig, leaving the arm as loadPart() left it.
function RestoreArm2() {
    previewedWeapon = null;

    prestigePuppet._loadImage("arm2_mirror", arm2RestImage);
    prestigePuppet.setJoint("arm2_mirror", "arm1_mirror", arm2RestJoint[0], arm2RestJoint[1]);
    prestigePuppet.setRotation("arm2_mirror", "relative", Arm2Spin);
}

const weaponPreviewDialog = new Dialog({
    text: "",   // PreviewWeapon() names the weapon before showing it.
    options: [
        {
            text: "Good.",
            onClick: () => {
                // Keep what is on the arm and continue into the conversation that comes
                // after the selection. The weapon stays.
                chosenWeapon = previewedWeapon;
                previewedWeapon = null;
                return AfterWeaponDialog(chosenWeapon);
            }
        },
        {
            text: "I want to reselect...",
            onClick: () => {
                RestoreArm2();
                return weaponDialog;
            }
        }
    ],
    mountTo: "#nextPrestigeLayer"
});

weaponDialog = new Dialog({
    text: "select a weapon for Hayita...",
    options: WEAPONS.map(weapon => ({
        text: weapon.label,
        onClick: () => PreviewWeapon(weapon)
    })).concat(noWeaponOption),
    mountTo: "#nextPrestigeLayer"
});

// ===== After the weapon =====
// Pure dialogue: the weapon is accepted and there is nothing left to implement, so the
// layer talks instead. The first line answers the player's choice; every branch then
// joins the same conversation.
//
// Options name dialogs declared further down on purpose: an onClick only runs after the
// whole file has loaded, so the reference inside the closure is safe.
const afterWeapon1 = new Dialog({
    text: "now that i am armed, the author says i should have a character arc.",
    options: [
        { text: "you are a puppet", onClick: () => afterWeapon2 },
        { text: "what is your arc", onClick: () => afterWeapon2 },
        { text: "skip cutscene", onClick: () => afterWeapon2 }
    ],
    mountTo: "#nextPrestigeLayer"
});
const afterWeapon2 = new Dialog({
    text: "my arc is a straight line. it goes from the left side of the screen to the right side of the screen. the author calls this animation.",
    options: [
        { text: "that is just a loop", onClick: () => afterWeapon3 },
        { text: "i believe in you", onClick: () => afterWeapon3 }
    ],
    mountTo: "#nextPrestigeLayer"
});
const afterWeapon3 = new Dialog({
    text: "there are two loops. one updates the stage bar every 50 milliseconds. one makes my arm spin. neither knows the other exists. this is called architecture.",
    options: [
        { text: "what does the stage bar do", onClick: () => afterWeapon4 },
        { text: "this is called a bug", onClick: () => afterWeapon4 }
    ],
    mountTo: "#nextPrestigeLayer"
});
const afterWeapon4 = new Dialog({
    text: "the stage bar says this resource exists solely to make this an incremental game. i have never met the resource. i think it is the friends we made along the way.",
    options: [
        { text: "the friends we made along the way", onClick: () => afterWeapon5 },
        { text: "what resource", onClick: () => afterWeapon5 }
    ],
    mountTo: "#nextPrestigeLayer"
});
const afterWeapon5 = new Dialog({
    text: "i have a JSON file that says where my elbow is. it does not say why my elbow is. this is the difference between data and meaning.",
    options: [
        { text: "deep", onClick: () => afterWeapon6 },
        { text: "where is your elbow", onClick: () => afterWeapon6 },
        {
            // The player edits the file, so the elbow moves. The rig has no writer for
            // joint files; the translation below is what the new number would look like.
            text: "change the JSON file",
            onClick: () => { ChangeElbowJSON(); return afterWeapon6; }
        }
    ],
    mountTo: "#nextPrestigeLayer"
});
const afterWeapon6 = new Dialog({
    text: "the author could not finish writing this part. so they asked a language model for some pure dialogue, as abstract as possible. i am the dialogue. please clap.",
    options: [
        { text: "clap", onClick: () => afterWeapon7 },
        { text: "who is the author", onClick: () => afterWeapon7 }
    ],
    mountTo: "#nextPrestigeLayer"
});
const afterWeapon7 = new Dialog({
    text: 'this conversation is not saved. if you reload, i will go back to "Dialog 1: Hi." and pretend we never met. also the dev server reloaded the page because i looked at a picture. the author called it a feature.',
    options: [
        { text: "it was not a feature", onClick: () => afterWeapon8 },
        { text: "the friends we made along the way", onClick: () => afterWeapon8 },
        {
            // The picture the paragraph is about, at last. The page reloads over it.
            text: "look at the picture",
            onClick: function () { ShowRickroll(); return this; }
        }
    ],
    mountTo: "#nextPrestigeLayer"
});
const afterWeapon8 = new Dialog({
    text: "this is the part where a real game would have gameplay. instead, have another dialog.",
    options: [
        { text: "Next", onClick: () => afterWeapon9 },
        { text: "Next (deluxe edition)", onClick: () => afterWeapon9 },
        { text: "Next (early access)", onClick: () => afterWeapon9 }
    ],
    mountTo: "#nextPrestigeLayer"
});
const afterWeapon9 = new Dialog({
    text: "ok. i am going to spin my arm now. if you need me, i will be at 25 percent from the left and one third from the top. do not look directly at the arm.",
    options: [
        { text: "goodbye", onClick: () => null },
        // The one option that does nothing, on purpose.
        { text: "one more dialog", onClick: function () { return this; } }
    ],
    mountTo: "#nextPrestigeLayer"
});

// The first line after the preview depends on which weapon the player accepted.
const afterWeaponLongNote = new Dialog({
    text: "a long note. When you hold it you get PERFECT PERFECT PERFECT",
    options: [
        { text: "what feelings", onClick: () => afterWeapon1 },
        { text: "that is not a weapon", onClick: () => afterWeapon1 }
    ],
    mountTo: "#nextPrestigeLayer"
});
const afterWeaponCode = new Dialog({
    text: "a line of code. mine says // TODO: make this a weapon. it compiles, which is more than i can say for the plot.",
    options: [
        { text: "what plot", onClick: () => afterWeapon1 },
        { text: "it compiles", onClick: () => afterWeapon1 }
    ],
    mountTo: "#nextPrestigeLayer"
});
const afterWeaponAchievement = new Dialog({
    text: 'a steam achievement. For some reason I could not complete it as well.',
    options: [
        { text: "customize your dining experience with", onClick: () => afterWeapon1 },
    ],
    mountTo: "#nextPrestigeLayer"
});

function AfterWeaponDialog(weapon) {
    if (weapon === WEAPONS[0]) return afterWeaponLongNote;
    if (weapon === WEAPONS[1]) return afterWeaponCode;
    return afterWeaponAchievement;
}

// "change the JSON file": the only joint the conversation names is the elbow, so editing
// the file is shown as a shove of the forearm. The rig never rewrites its own JSON, so
// this is a translation standing in for a changed coordinate: far to the right, and in
// root coordinates ("relative"), so it is to the right on screen rather than along the
// arm. The swing is kept, now around the new position, and the change persists.
const ELBOW_EDIT = 800;
function ChangeElbowJSON() {
    prestigePuppet.setTranslation("arm2_mirror", "relative",
        () => arm2RestTranslateX() + ELBOW_EDIT, () => 0);
}

// "look at the picture": the rickroll the conversation was talking about, full screen
// above everything (the stage bar is 9999), then the reload it warned about. The picture
// never needs removing -- the page goes away first.
function ShowRickroll() {
    var img = document.createElement("img");
    img.src = "rickroll.jpg";
    img.alt = "never gonna give you up";
    img.style.position = "fixed";
    img.style.top = "0";
    img.style.left = "0";
    img.style.width = "100vw";
    img.style.height = "100vh";
    img.style.objectFit = "cover";
    img.style.zIndex = "2147483647";
    img.style.pointerEvents = "none";
    document.body.appendChild(img);

    setTimeout(function () {
        // Guarded because the test harness has no location; the browser always does.
        if (typeof location !== "undefined") location.reload();
    }, 1000);
}

const prestigeDialog3 = new Dialog({
    text: "Dialog 3: Im Hayita the greatest skibidi man of all time",
    options: [{ text: "Next", onClick: () => weaponDialog }],
    mountTo: "#nextPrestigeLayer"
});
const prestigeDialog2 = new Dialog({
    text: "Dialog 2: Youre here. (My apostrophe key on my keyboard is broken.)",
    options: [{ text: "Next", onClick: () => prestigeDialog3 }],
    mountTo: "#nextPrestigeLayer"
});
const prestigeDialog1 = new Dialog({
    text: "Dialog 1: Hi.",
    options: [{ text: "Next", onClick: () => prestigeDialog2 }],
    mountTo: "#nextPrestigeLayer"
});

function EnterNextLayer() {
    document.getElementById("nextPrestigeLayer").style.display = "block";

    if(prestigeEntered) {
        // Already built. Reachable by clicking the button again during the 1s
        // setup delay, so just make sure the loop is running.
        ContinuePrestigeLoop();
        return;
    }
    prestigeEntered = true;

    // 1 second after entering, spawn the Frankenstein and start the animation
    setTimeout(async function() {
        // humanoid() is the ten-part rig; a bare new Frankenstein() builds no parts.
        prestigePuppet = Frankenstein.humanoid();

        await prestigePuppet.loadPart("head", "pics/head.png", "pics/head.png.json");
        await prestigePuppet.loadPart("body", "pics/body.png", "pics/body.png.json");
        await prestigePuppet.loadPart("arm1", "pics/arm1.png", "pics/arm1.png.json");
        await prestigePuppet.loadPart("arm1_mirror", "pics/arm1_mirror.png", "pics/arm1_mirror.png.json");
        await prestigePuppet.loadPart("arm2", "pics/arm2.png", "pics/arm2.png.json");
        await prestigePuppet.loadPart("arm2_mirror", "pics/arm2_mirror.png", "pics/arm2_mirror.png.json");
        await prestigePuppet.loadPart("leg1", "pics/leg1.png", "pics/leg1.png.json");
        await prestigePuppet.loadPart("leg1_mirror", "pics/leg1_mirror.png", "pics/leg1_mirror.png.json");
        await prestigePuppet.loadPart("leg2", "pics/leg2.png", "pics/leg2.png.json");
        await prestigePuppet.loadPart("leg2_mirror", "pics/leg2_mirror.png", "pics/leg2_mirror.png.json");

        // Remember the forearm as loaded, so a reselected weapon can be undone.
        arm2RestImage = prestigePuppet.getPart("arm2_mirror").img;
        arm2RestJoint = prestigePuppet.getJoint("arm2_mirror", "arm1_mirror").center.slice();

        // Scale 0.5
        prestigePuppet.setGlobalScale(() => 0.5);

        prestigePuppet.setTranslation("head", "relative", () => 0, () => Math.sin(Date.now() / 550) * 100);
        prestigePuppet.setRotation("arm1", "relative", () => Math.sin(Date.now() / 500) * 180 / Math.PI);
        prestigePuppet.setRotation("arm2", "relative", () => (Date.now() / 1000) * 50 * 180 / Math.PI);
        prestigePuppet.setTranslation("arm2_mirror", "rotate", () => Math.sin(Date.now() / 233) * 400 + 350 , () => 0);
        arm2RestTranslateX = prestigePuppet.getPart("arm2_mirror").translateX;
        prestigePuppet.setScale("arm1_mirror", () => (Math.sin(Date.now() / 233) * 400 + 350) / 179 / 3 + 0.9);
        prestigePuppet.setRotation("arm1_mirror", "relative", () => -Math.sin(Date.now() / 500) * 180 / Math.PI);
        prestigePuppet.setRotation("arm2_mirror", "relative", Arm2Spin);

        prestigePuppet.attachTo(document.getElementById("frankensteinStage"));

        // Run one frame of transforms, so the measurements below see the puppet as
        // it is actually rendered (widths/heights and scale already applied).
        prestigePuppet.update();

        // Target: the head's CENTER at 25vh from the left, vertically centered.
        // setPosition() places the container's own origin, and the container is a
        // 0x0 box whose origin is the head's *untransformed* top-left -- every part
        // scales about its own rotation center, so the head's rendered box is
        // offset from that origin. Measure the offset rather than deriving it from
        // the joint math; that also keeps this correct if head/body JSON changes.
        const vh = window.innerHeight / 100;
        const headRect = prestigePuppet.getElement("head").getBoundingClientRect();
        const contRect = prestigePuppet.getContainer().getBoundingClientRect();
        const restX = 25 * vh - (headRect.left + headRect.width / 2 - contRect.left);
        const restY = window.innerHeight / 3 - (headRect.top + headRect.height / 2 - contRect.top);

        // Park it just below the screen edge before the first paint, so it never
        // flashes at the container's default position.
        prestigePuppet.setPosition(restX, window.innerHeight + 200);

        // Build the entrance timeline:
        //   - a 3s ease-out slide from below the screen up to rest
        //   - then show the first dialog
        prestigeTimeline = new Timeline()
            .add(new Tween({
                duration: 3,
                easing: "easeOutCubic",
                // x is equal at both ends, so the slide stays purely vertical.
                from: () => ({ x: restX, y: window.innerHeight + 200 }),
                to: () => ({ x: restX, y: restY }),
                apply: (v) => prestigePuppet.setPosition(v.x, v.y)
            }))
            .call(() => { prestigeDialog1.show(); })
            .play();

        // Drive the puppet's own rendering (independent of the timeline).
        ContinuePrestigeLoop();
    }, 1000);
}

// Render loop for the puppet. Entering this layer is one-way, so once the loop
// starts it runs for the rest of the session -- that is the intent, not a leak.
function prestigeLoop() {
    prestigePuppet.update();
    prestigeRafId = requestAnimationFrame(prestigeLoop);
}

// Start the loop, at most once.
function ContinuePrestigeLoop() {
    if(prestigeRafId === null && prestigePuppet) prestigeRafId = requestAnimationFrame(prestigeLoop);
}

// The stage-1 half of the 50ms UI refresh, registered with main.js's clock below.
function Stage1Tick() {
    // The button is the way INTO this layer, so once we are in it the button is
    // spent -- leaving it up would offer a door into the room we are standing in.
    var nlb = document.getElementById("nextLayerBtn");
    if(nlb) nlb.style.display = (nextLayerUnlocked && !prestigeEntered ? "inline-block" : "none");
}

RegisterTick(Stage1Tick);
