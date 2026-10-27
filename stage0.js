// Stage 0: the click-and-score game, plus the score upgrades that unlock the next layer.
//
// Loaded after main.js, which owns the stage machine and the 50ms clock. This file
// registers Stage0Tick() with that clock at the bottom; it never drives itself.

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

var curscorepos=[500,200];
var currentmov=[1,1];

// The stage-0 half of the 50ms UI refresh, registered with main.js's clock below.
function Stage0Tick(){
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
    // NOTE: this assigns the whole style attribute, so every property #score needs
    // must be in this string -- anything set on #score in index.html is wiped here
    // on the first tick (50ms in). The white card keeps it readable over bg.png.
    document.getElementById("score").style="height: 300px; width: 400px; border: 2px solid black; background-color: white; color: black; position: fixed; left: "+curscorepos[0]+"px; top: "+curscorepos[1]+"px; display: "+(sunlock?"flex;":"none;");
}

RegisterTick(Stage0Tick);
