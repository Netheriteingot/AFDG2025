// Pure helpers shared by the stages. Nothing here holds state or touches the DOM, so it
// is safe to load from <head> and to call from any stage.

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
