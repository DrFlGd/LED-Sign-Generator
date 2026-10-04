/* LED Sign Generator — dimensions in mm; OpenSCAD 2021.01+
   Geometry authority for the app and standalone Customizer use.
   Body prints back-down. Face exports flat on the bed; assembly raises it.
*/
/* [Artwork] */
sign_text = "GLOW";
font_name = "DejaVu Sans:style=Bold";
// Actual visible glyph height, not typographic point size.
height = 80;
spacing = 1.05;
style = "letters"; // [letters:Separate letters,contour:Convex contour]
margin = 6;
/* [Assembly] */
depth = 30;
wall = 1.6;
back = 1.6;
face = 1.2;
clearance = 0.2; // Per-side XY clearance.
ledge = 1.2;
recess = 0;
/* [Colors] */
body_color = "#294650";
text_color = "#ffe4a6";
border_color = "#294650";
/* [Output] */
part = "assembly"; // [assembly,body,diffuser,text_region,border_region,cutting,fit_body,fit_diffuser]
explode = 0;
/* [Hidden] */
$fn = 48;
eps = 0.02;
seat_z = depth - recess - face;
assert(len(sign_text) > 0, "Enter text");
assert(height >= 20 && depth > 0 && wall > 0 && back > 0 && face > 0);
assert(clearance >= 0 && ledge > clearance, "Ledge must exceed clearance");
assert(recess >= 0 && seat_z > back + 2, "Insufficient LED cavity height");
assert(style == "letters" || style == "contour");
module artwork() {
    resize([0, height], auto=true)
        text(sign_text, size=100, font=font_name, spacing=spacing,
             halign="center", valign="center");
}
module outline() {
    if (style == "contour") offset(r=margin) hull() artwork();
    else artwork();
}
// Two cavity widths form a ledge at seat_z. Counter walls are preserved.
module shell(total_depth=depth, seat=seat_z) {
    difference() {
        linear_extrude(total_depth) children();
        translate([0,0,back]) linear_extrude(total_depth+eps)
            offset(delta=-wall-ledge) children();
        translate([0,0,seat]) linear_extrude(total_depth-seat+eps)
            offset(delta=-wall) children();
    }
}
module diffuser2d() { offset(delta=-wall-clearance) outline(); }
module body() { shell() outline(); }
module diffuser() { linear_extrude(face) diffuser2d(); }
// Complementary regions share boundaries, with no overlapping volume or fit gap.
// Print them together as a multi-material face; counters belong to the border.
module text_region2d() {
    if (style == "contour") intersection() { diffuser2d(); artwork(); }
    else diffuser2d();
}
module border_region2d() { difference() { diffuser2d(); artwork(); } }
module text_region() { linear_extrude(face) text_region2d(); }
module border_region() { linear_extrude(face) border_region2d(); }
module coupon() { square([30,30], center=true); }
if (part == "body") body();
else if (part == "diffuser") diffuser();
else if (part == "text_region") text_region();
else if (part == "border_region") border_region();
else if (part == "cutting") diffuser2d();
else if (part == "fit_body") shell(back+face+5,back+5) coupon();
else if (part == "fit_diffuser") linear_extrude(face)
    offset(delta=-wall-clearance) coupon();
else if (part == "assembly") {
    color(body_color) body();
    translate([0,0,seat_z+explode]) {
        color(text_color) text_region();
        if (style == "contour") color(border_color) border_region();
    }
} else assert(false, "Unknown part");
