var click = 0;
var ug1 = 0, ug2 = 0;
var ugunlocked = 0;
var sunlock = 0;
var score = 0;
var anal = 0;

function Click(){
    click += 1;
}
function BuyUg1(){
    if(click >= 50){
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
    click -= 1e+6;
    sunlock=1;
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
function Anal(){
    anal = 1;
}

var curscorepos=[500,200];
var currentmov=[1,1];

setInterval(function(){
    if(click > 1e+6) click = 1e+6;
    document.getElementById("click").innerHTML = "You have "+click+" points. "+(click == 1e+6? "Hardcapped":"");
    document.getElementById("ug2").innerHTML = "Upgrade: Unlock a new button. Cost: "+(ug1?10+0.9*click:10+click)+" points";
    document.getElementById("clickmax").style.display = (ug2?"flex":"none");
    document.getElementById("ugs").style.display = (ug2?"flex":"none");

    curscorepos[0]+=currentmov[0];
    curscorepos[1]+=currentmov[1];
    if(curscorepos[0]<=0||curscorepos[0]>=window.innerWidth-200||curscorepos[1]<=0||curscorepos[1]>=window.innerHeight-300){
        currentmov[0]=Math.random;
        if(curscorepos[0]>=window.innerWidth-200)currentmov[0]*=-1;
        else if(curscorepos[0]>0)currentmov[0]*=(Math.random>0.5?1:-1);
        currentmov[1]=Math.random;
        if(curscorepos[1]>=window.innerHeight-300)currentmov[1]*=-1;
        else if(curscorepos[1]>0)currentmov[1]*=(Math.random>0.5?1:-1);
    }
    document.getElementById("score").style="height: 300px; width: 200px; border: 2px solid; position: fixed; left: "+curscorepos[0]+"px; top: "+curscorepos[1]+"px; display: "+(sunlock?"flex;":"none;");
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
    "Number of reviews written"
]