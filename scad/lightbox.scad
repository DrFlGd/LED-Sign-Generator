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
style = "letters"; // [letters:Separate letters,contour:Convex contour,outline:Close contour,rectangle:Rectangle,joined:Joined letters]
margin = 6;
join_radius = 8;
/* [Assembly] */
depth = 30;
wall = 1.6;
back = 1.6;
face = 1.2;
clearance = 0.2; // Per-side XY clearance.
ledge = 1.2;
recess = 0;
/* [Retention] */
fit_mode = "glue"; // [glue,friction]
friction_clearance = 0.05;
/* [Mounting] */
mount = "none"; // [none,screws,keyholes,adhesive]
mount_spacing = 40;
mount_y = 0;
screw_diameter = 3.5;
head_diameter = 7;
keyhole_travel = 6;
pad_size = 16;
pad_depth = 0.5;
/* [LED strip retention] */
led_lip = "none"; // [none,sides,back,both]
strip_width = 8;
strip_thickness = 2;
strip_clearance = 0.5;
lip_projection = 1;
lip_thickness = 1.2;
back_track_y = 0;
/* [Wiring] */
wire_exit = "none"; // [none,rear]
wire_diameter = 5;
wire_x = 0;
wire_y = 0;
cable_channel = "none"; // [none,horizontal]
channel_y = 0;
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
face_gap = fit_mode == "friction" ? friction_clearance : clearance;
cavity_inset = wall + ledge;
side_lip_z = back + strip_width + strip_clearance;
back_lip_z = back + strip_thickness + strip_clearance;
assert(len(sign_text) > 0, "Enter text");
assert(height >= 20 && depth > 0 && wall > 0 && back > 0 && face > 0);
assert(clearance >= 0 && ledge > face_gap, "Ledge must exceed clearance");
assert(recess >= 0 && seat_z > back + 2, "Insufficient LED cavity height");
assert(style == "letters" || style == "contour" || style == "outline" || style == "rectangle" || style == "joined");
assert(wire_exit == "none" || wire_exit == "rear");
assert(cable_channel == "none" || cable_channel == "horizontal");
assert(wire_diameter >= 2 && wire_diameter <= 12);
assert(cable_channel == "none" || back + wire_diameter + 0.6 < seat_z, "Channel must fit below ledge");
assert(style == "letters" || style == "joined" || margin > wall + face_gap);
assert(fit_mode == "glue" || fit_mode == "friction");
assert(mount == "none" || mount == "screws" || mount == "keyholes" || mount == "adhesive");
assert(led_lip == "none" || led_lip == "sides" || led_lip == "back" || led_lip == "both");
assert(mount != "adhesive" || pad_depth < back - 0.6, "Leave at least 0.6 mm behind adhesive pockets");
assert(mount != "keyholes" || head_diameter > screw_diameter + 1);
assert((led_lip != "sides" && led_lip != "both") || side_lip_z + lip_thickness + 1 < seat_z, "Side lip must clear face ledge");
assert((led_lip != "back" && led_lip != "both") || back_lip_z + lip_thickness + 1 < seat_z, "Back lip must clear face ledge");
assert(led_lip == "none" || 2*lip_projection < strip_width, "Lip must leave LEDs exposed");
module artwork() {
    resize([0, height], auto=true)
        text(sign_text, size=100, font=font_name, spacing=spacing,
             halign="center", valign="center");
}
module outline() {
    if (style == "contour") offset(r=margin) hull() artwork();
    else if (style == "outline") offset(r=margin) offset(r=-margin) offset(r=margin) artwork();
    else if (style == "rectangle") offset(delta=margin) minkowski() {
        // Orthogonal projections form a rectangle around actual glyph bounds.
        hull() projection() rotate([90,0,0]) linear_extrude(0.001,center=true) artwork();
        hull() projection() rotate([0,90,0]) linear_extrude(0.001,center=true) artwork();
    }
    else if (style == "joined") offset(r=-join_radius) offset(r=join_radius) artwork();
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
module diffuser2d() { offset(delta=-wall-face_gap) outline(); }
module led_retention() {
    if (led_lip == "sides" || led_lip == "both")
        translate([0,0,side_lip_z]) linear_extrude(lip_thickness)
            difference() {
                offset(delta=-cavity_inset+0.1) outline();
                offset(delta=-cavity_inset-lip_projection) outline();
            }
    if (led_lip == "back" || led_lip == "both")
        intersection() {
            linear_extrude(seat_z) offset(delta=-cavity_inset) outline();
            for (sign=[-1,1]) {
                // Rails fuse into the back; overhanging lips retain strip edges.
                translate([0,back_track_y+sign*((strip_width+strip_clearance)/2+lip_thickness/2),back-eps])
                    linear_extrude(strip_thickness+strip_clearance+lip_thickness+eps)
                        square([100000,lip_thickness],center=true);
                translate([0,back_track_y+sign*((strip_width+strip_clearance)/2-lip_projection/2),back_lip_z])
                    linear_extrude(lip_thickness) square([100000,lip_projection+0.02],center=true);
            }
        }
}
module mounting_cuts() {
    for (x=[-mount_spacing/2,mount_spacing/2]) translate([x,mount_y,-eps]) {
        if (mount == "screws") cylinder(d=screw_diameter,h=back+2*eps);
        if (mount == "keyholes") linear_extrude(back+2*eps) union() {
            circle(d=head_diameter);
            hull() { circle(d=screw_diameter); translate([0,keyhole_travel]) circle(d=screw_diameter); }
        }
        if (mount == "adhesive") linear_extrude(pad_depth+eps) square([pad_size,pad_size],center=true);
    }
}
module body() {
    difference() {
        union() { shell() outline(); led_retention(); }
        mounting_cuts();
        if (wire_exit == "rear") translate([wire_x,wire_y,-eps])
            cylinder(d=wire_diameter,h=back+2*eps);
        // A straight bore intersects every crossed wall and both exterior sides.
        // Air gaps between separate letters remain external cable spans.
        if (cable_channel == "horizontal") translate([0,channel_y,back+0.6+wire_diameter/2])
            rotate([0,90,0]) cylinder(d=wire_diameter,h=100000,center=true);
    }
}
module diffuser() { linear_extrude(face) diffuser2d(); }
// Complementary regions share boundaries, with no overlapping volume or fit gap.
// Print them together as a multi-material face; counters belong to the border.
module text_region2d() {
    if (style != "letters" && style != "joined") intersection() { diffuser2d(); artwork(); }
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
    offset(delta=-wall-face_gap) coupon();
else if (part == "assembly") {
    color(body_color) body();
    translate([0,0,seat_z+explode]) {
        color(text_color) text_region();
        if (style != "letters" && style != "joined") color(border_color) border_region();
    }
} else assert(false, "Unknown part");
