var click = 0;
var ug0 = 0, ug1 = 0, ug2 = 0;
var ugunlocked = 0;
var sunlock = 0;
var score = 0;
var anal = 0;
var resetCount = 0;

// Three random multipliers for the first prestige upgrades
var multiplier1, multiplier2, multiplier3;
var multiplierChosen = -1; // -1 = none chosen, 0/1/2 = which one was chosen
var nextLayerUnlocked = false;

// Standard "illions" abbreviation for tiers >= 11 (>= 1e33).
// il is the illion index (decillion = 10 = 1e33).
//
// The illion index itself is written in base-1000 groups. Each group (0..999)
// is spelled with ONES+TENS+HUNDREDS, and each group above the lowest carries a
// "millia" marker for its position: MI = thousands group, MC = millions group,
// NA = billions group, PC = trillions group, FM = quadrillions group. Groups are
// joined high-to-low with "-", e.g. (...)NA-(...)MC-(...)MI-(...).
//
// Special rules:
// - If the lowest group is <1000, use the <1e33 unit names (M B T...Dc) instead.
// - For higher groups, if a group value is exactly 1, omit the "U" prefix.
function FmIllion(il){
    const ONES     = ["", "U", "D", "T", "Qa", "Qt", "Sx", "Sp", "O", "N"];
    const TENS     = ["", "Dc", "Vg", "Tg", "Qd", "Qi", "Se", "St", "Og", "Nn"];
    const HUNDREDS = ["", "Ce", "Dn", "Tc", "Qe", "Qu", "Sc", "Si", "Oe", "Ne"];
    const MILLIA   = ["", "MI", "MC", "NA", "PC", "FM"]; // group-position marker
    const UNITS1   = ["", "M", "B", "T", "Qa", "Qt", "Sx", "Sp", "Oc", "No"]; // lowest group, value 1..9 (<1e33)
    function seg(v){ // U/D/T-based 3-digit symbol for a group value 0..999
        return ONES[v % 10] + TENS[Math.floor(v / 10) % 10] + HUNDREDS[Math.floor(v / 100) % 10];
    }
    // split il into base-1000 groups, lowest first
    var groups = [];
    var x = il;
    while(x > 0){ groups.push(x % 1000); x = Math.floor(x / 1000); }
    if(groups.length === 0) return "";

    var parts = [];
    for(var j = groups.length - 1; j >= 0; j--){
        var v = groups[j];
        if(v === 0) continue; // skip empty groups, no dangling separators
        var s;
        if(j === 0 && v >= 1 && v <= 9){
            // lowest group < 1e33: use the <1e33 unit names (from M), no millia marker
            s = UNITS1[v];
        } else {
            s = seg(v);
            if(v === 1 && j !== 0) s = ""; // group value exactly 1: omit the "U"
            if(j >= 1) s += MILLIA[j];
        }
        parts.push(s);
    }
    return parts.join("-");
}

// Works on break_infinity.js Decimal (mantissa * 10^exponent, exponent up to 9e15),
// so it stays exact far past the native 1e308 ceiling. Plain numbers/strings are
// accepted too (wrapped into a Decimal). Only tiny native math is used: the display
// mantissa is d.m * 10^(0..2), never the full giant value.
function Fm(n){
    var d = (n instanceof Decimal) ? n : new Decimal(n);
    if(d.sign() < 0) return "-" + Fm(d.abs());
    // 0 ~ 100 (excluding): scientific notation, 3 effective digits
    if(d.lt(100)) return d.toExponential(2);
    // 100 ~ 1e5 (excluding): floored, as-is
    if(d.lt(1e5)) return d.floor().toString();

    // >= 1e5: unit suffix, 3 effective digits
    // K M B T Qa Qt Sx Sp Oc No cover tiers 1..10 (1e3 .. <1e33)
    const units1 = ["K", "M", "B", "T", "Qa", "Qt", "Sx", "Sp", "Oc", "No"];

    // For a normalized Decimal, mantissa is in [1,10), so floor(log10(value)) === d.e exactly.
    var exp = d.e;
    var tier = Math.floor(exp / 3);
    var mantissa = d.m * Math.pow(10, exp - tier * 3); // in [1, 1000), safe in a native double
    var m = mantissa.toPrecision(3);
    // Rounding (e.g. 999.9 -> "1.00e+3") can push the mantissa into the next tier.
    if(m.indexOf("e") !== -1){
        tier += 1;
        mantissa = d.m * Math.pow(10, exp - tier * 3);
        m = mantissa.toPrecision(3);
    }

    var suffix;
    if(tier <= 10) suffix = units1[tier - 1];          // K .. No
    else suffix = FmIllion(tier - 1);                  // >= 1e33, illions
    return m + suffix;
}

function StartGame(){
    document.getElementById("startScreen").style.display = "none";
}

function Click(){
    click += 1;
}
function BuyUg0(){
    if(click >= 25){
        ug0 = 1;
        click -= 25;
    }
}
function BuyUg1(){
    if(click >= 50 && ug0 == 1){
        ug1 = 1;
        click -= 50;
    }
}
function BuyUg2(){
    if(click >= 100 && ug1 == 1){
        ug2 = 1;
        click -= (10 + 0.9 * click);
    }
}
function UnlockS(){
    if(click >= 1e+6){
        click -= 1e+6;
        sunlock=1;
    }
}
function BuyU(){
    if(click >= 1e+6){
        click -= 1e+6;
        ugunlocked++;
    }
    var str="";
    for(var i=0;i<ugunlocked;i++)str+=`<button>Unlock a new upgrade. BOUGHT</button>`;
    if(ugunlocked<30)str+=`<button onclick="BuyU()">Unlock a new upgrade. Cost: 1e6 points</button>`;
    else if(!sunlock) str+=`<button onclick="UnlockS()">Unlock Score. Cost: 1e6 points</button>`;
    else str+=`<button>Unlock Score. BOUGHT</button>`;
    document.getElementById("ugs").innerHTML=str;
}
function ClickMax(){
    click = 1e+6;
}
// The current AI breakdown, regenerated on each +1 score click.
var aibreakdown = [];

function GetScore(){
    var gain = 1;

    // Apply multiplier if chosen
    if(multiplierChosen !== -1) {
        var chosenMultiplier;
        if(multiplierChosen === 0) chosenMultiplier = multiplier1;
        else if(multiplierChosen === 1) chosenMultiplier = multiplier2;
        else chosenMultiplier = multiplier3;

        gain = chosenMultiplier.toNumber();
    }

    score += gain;
    // "AI analysis": pick 4 random attributes, give each a random factor, then
    // add a "Normalization" row that forces the product to exactly 1 (so the AI
    // always, after all its fancy math, awards precisely +1 score).
    aibreakdown = [];
    var pool = scoretext.slice();
    var product = 1;
    for(var i=0;i<4;i++){
        var idx = Math.floor(Math.random()*pool.length);
        var name = pool.splice(idx,1)[0];
        var factor = Math.random()*4 + 0.25; // arbitrary-looking multiplier
        product *= factor;
        aibreakdown.push([name, factor]);
    }
    aibreakdown.push(["Normalization", 1/product]);
}
function Anal(){
    if(score >= 10) {
        anal = 1;
        generateMultipliers();
    }
}
function ResetScore(){
    if(confirm("Are you sure you want to reset all your score and score upgrades? Reset count: " + resetCount)) {
        score = 0;
        anal = 0;
        aibreakdown = [];
        multiplierChosen = -1;
        resetCount++;
        generateMultipliers();
    }
}

// Generate three random multipliers
function generateMultipliers() {
    // Probability of positive multiplier
    var posProb = Math.max(0, (resetCount - 1) / 3 + (resetCount - 1) / 30);

    for(var i = 0; i < 3; i++) {
        var exponent = Math.random() * 90 + 10; // 10 to 100
        var isPositive = (resetCount === 0) ? false : (Math.random() < posProb);
        var value = new Decimal(10).pow(exponent);
        if(!isPositive) value = value.neg();

        if(i === 0) multiplier1 = value;
        else if(i === 1) multiplier2 = value;
        else multiplier3 = value;
    }
}

function BuyMultiplier(index) {
    if(multiplierChosen !== -1) return; // Already chosen

    multiplierChosen = index;

    // Generate positive random multipliers for the other two
    for(var i = 0; i < 3; i++) {
        if(i !== index) {
            var exponent = Math.random() * 90 + 10;
            var value = new Decimal(10).pow(exponent);
            if(i === 0) multiplier1 = value;
            else if(i === 1) multiplier2 = value;
            else multiplier3 = value;
        }
    }

    // Disable other buttons
    for(var i = 0; i < 3; i++) {
        var btn = document.getElementById("mult" + (i + 1));
        if(btn && i !== index) {
            btn.onclick = null;
            btn.style.opacity = "0.5";
            btn.style.cursor = "not-allowed";
        }
    }
}

function UnlockNextLayer() {
    nextLayerUnlocked = true;
}

var curscorepos=[500,200];
var currentmov=[1,1];

setInterval(function(){
    if(click > 1e+6) click = 1e+6;
    document.getElementById("click").innerHTML = "You have "+click+" points. "+(click == 1e+6? "Hardcapped":"");
    document.getElementById("ug2").innerHTML = "Upgrade: Unlock a new button. Cost: "+(ug1?10+0.9*click:10+click)+" points";
    document.getElementById("getclick2").style.display = (ug0?"inline-block":"none");
    document.getElementById("ug1").style.display = (ug0?"inline-block":"none");
    document.getElementById("ug2").style.display = (ug1?"inline-block":"none");
    document.getElementById("clickmax").style.display = (ug2?"flex":"none");
    document.getElementById("ugs").style.display = (ug2?"flex":"none");
    document.getElementById("scorecount").innerHTML = "You have "+score+" score";

    // AI breakdown panel (only once "AI score gain breakdown" is enabled)
    var aip = document.getElementById("aipanel");
    if(anal){
        var str = "<b>AI score gain breakdown</b><br>";
        for(var k=0;k<aibreakdown.length;k++){
            str += aibreakdown[k][0] + ": &times;" + aibreakdown[k][1].toPrecision(3) + "<br>";
        }
        str += "<b>= +1 score</b>";
        aip.innerHTML = str;
        aip.style.display = "block";
    } else {
        aip.style.display = "none";
    }

    // Show/hide prestige upgrades
    var pg = document.getElementById("prestigeUpgrades");
    if(pg) pg.style.display = (anal ? "block" : "none");

    var m1 = document.getElementById("mult1");
    var m2 = document.getElementById("mult2");
    var m3 = document.getElementById("mult3");

    // Update multiplier button text
    if(anal && multiplier1) {
        if(m1) {
            m1.innerHTML = multiplierChosen === -1 ?
                "Multiply score gain by an amount with big absolute value" :
                "Multiply score gain by " + Fm(multiplier1.abs()) + (multiplier1.lt(0) ? " (negative)" : "");
        }
        if(m2) {
            m2.innerHTML = multiplierChosen === -1 ?
                "Multiply score gain by an amount with big absolute value" :
                "Multiply score gain by " + Fm(multiplier2.abs()) + (multiplier2.lt(0) ? " (negative)" : "");
        }
        if(m3) {
            m3.innerHTML = multiplierChosen === -1 ?
                "Multiply score gain by an amount with big absolute value" :
                "Multiply score gain by " + Fm(multiplier3.abs()) + (multiplier3.lt(0) ? " (negative)" : "");
        }
    }

    if(m1) m1.style.display = (anal && multiplierChosen === -1 ? "inline-block" : (anal ? "block" : "none"));
    if(m2) m2.style.display = (anal && multiplierChosen === -1 ? "inline-block" : (anal ? "block" : "none"));
    if(m3) m3.style.display = (anal && multiplierChosen === -1 ? "inline-block" : (anal ? "block" : "none"));

    var unl = document.getElementById("unlockNextLayer");
    if(unl) unl.style.display = (multiplierChosen !== -1 ? "block" : "none");

    var nlb = document.getElementById("nextLayerBtn");
    if(nlb) nlb.style.display = (nextLayerUnlocked ? "inline-block" : "none");

    curscorepos[0]+=currentmov[0]*1.5;
    curscorepos[1]+=currentmov[1]*1.5;
    if(curscorepos[0]<=0||curscorepos[0]>=window.innerWidth-400||curscorepos[1]<=0||curscorepos[1]>=window.innerHeight-300){
        currentmov[0]=Math.random();
        if(curscorepos[0]>=window.innerWidth-400)currentmov[0]*=-1;
        else if(curscorepos[0]>0)currentmov[0]*=(Math.random()>0.5?1:-1);
        currentmov[1]=Math.random();
        if(curscorepos[1]>=window.innerHeight-300)currentmov[1]*=-1;
        else if(curscorepos[1]>0)currentmov[1]*=(Math.random()>0.5?1:-1);
    }
    document.getElementById("score").style="height: 300px; width: 400px; border: 2px solid; position: fixed; left: "+curscorepos[0]+"px; top: "+curscorepos[1]+"px; display: "+(sunlock?"flex;":"none;");
},50);

const scoretext = [
    "Total M press time",
    "Number of ratings given",
    "Hungriness",
    "Last game played",
    "Age of your device",
    "Total clicks in counting activity",
    "Galaxy level",
    "Wow more points!!!",
    "RNG performance",
    "Number of reviews written",
    "Whether you are above 13",
    "Number of messages sent to the author",
    "Advice from GPT-6",
    "IP address",
    "Your mood",
    "Progress in Antimatter Dimensions",
]

// ===== Next Prestige Layer =====
var prestigePuppet = null;
var prestigeEntered = false;
var prestigeTimeline = null; // entrance animation timeline
var currentDialog = 0;

// Dialog script for the prestige layer (write your own content here)
const prestigeDialogs = [
    "Dialog 1: (write your content here)",
    "Dialog 2: (write your content here)",
    "Dialog 3: (write your content here)"
];

function EnterNextLayer() {
    document.getElementById("nextPrestigeLayer").style.display = "block";

    if(prestigeEntered) return; // only set up once
    prestigeEntered = true;

    // 1 second after entering, spawn the Frankenstein and start the animation
    setTimeout(async function() {
        prestigePuppet = new Frankenstein();

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

        // Scale 0.5
        prestigePuppet.setGlobalScale(() => 0.5);

        // arm2: opacity 50%, spin very fast (+100 rad/s)
        prestigePuppet.getElement("arm2").style.opacity = 0.5;
        prestigePuppet.setRotation("arm2", "relative", () => (Date.now() / 1000) * 100 * 180 / Math.PI);

        // arm2_mirror: opacity 50%, spin -100 rad/s
        prestigePuppet.getElement("arm2_mirror").style.opacity = 0.5;
        prestigePuppet.setRotation("arm2_mirror", "relative", () => (Date.now() / 1000) * -100 * 180 / Math.PI);

        prestigePuppet.attachTo(document.getElementById("frankensteinStage"));

        // Horizontal target: head's center at 25vh from the left. The container
        // anchor is the top-center of the head (horizontally = head's center), so x = 25vh.
        const vh = window.innerHeight / 100;
        const targetX = 25 * vh;

        // Build the entrance timeline:
        //   - a 3s ease-out slide from below the screen up to vertical center
        //   - then show the first dialog
        prestigeTimeline = new Timeline()
            .add(new Tween({
                duration: 3,
                easing: "easeOutCubic",
                // Resolve from/to at activation so head height (scaled) is known.
                from: () => ({ y: window.innerHeight + 200 }),
                to: () => {
                    const headHeight = prestigePuppet.getElement("head").getBoundingClientRect().height;
                    return { y: window.innerHeight / 2 - headHeight / 2 };
                },
                apply: (v) => prestigePuppet.setPosition(targetX, v.y)
            }))
            .call(() => { currentDialog = 0; showDialog(); })
            .play();

        // Drive the puppet's own rendering (independent of the timeline).
        function prestigeLoop() {
            if(prestigePuppet) prestigePuppet.update();
            requestAnimationFrame(prestigeLoop);
        }
        prestigeLoop();
    }, 1000);
}

function showDialog() {
    const box = document.getElementById("dialogBox");
    const text = document.getElementById("dialogText");
    if(currentDialog < prestigeDialogs.length) {
        text.innerHTML = prestigeDialogs[currentDialog];
        box.style.display = "block";
    } else {
        box.style.display = "none";
    }
}

function NextDialog() {
    currentDialog++;
    showDialog();
}