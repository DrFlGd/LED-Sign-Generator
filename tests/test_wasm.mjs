import assert from 'node:assert/strict';
import fs from 'node:fs';
import {renderPart} from '../dist/render.js';
import {validate,makeSource,meshInfo} from '../dist/model.js';
import {zipSync,unzipSync} from '../dist/vendor/fflate.js';
const config=JSON.parse(fs.readFileSync(new URL('../dist/config.json',import.meta.url)));
const template=fs.readFileSync(new URL('../dist/lightbox.scad',import.meta.url),'utf8');
const p=validate({},config),source=makeSource(template,p);
const fontFile=config.fontFiles[p.font_name],fontBytes=fs.readFileSync(new URL('../dist/fonts/'+fontFile,import.meta.url));
const kit={};
for(const part of ['body','diffuser','fit_body','fit_diffuser','cutting']){
 const bytes=await renderPart({source,fontFile,fontBytes,part});kit[part]=bytes;
 if(part==='cutting'){assert.match(new TextDecoder().decode(bytes),/<svg/);continue;}
 const m=meshInfo(bytes);assert.ok(m.triangles>0);assert.ok(Math.abs(m.minimum[2])<.001);
 if(part==='body'){assert.ok(Math.abs(m.size[1]-80)<.05);assert.ok(Math.abs(m.size[2]-30)<.01);}
 if(part==='diffuser')assert.ok(Math.abs(m.size[2]-1.2)<.01);
 if(part==='fit_diffuser')assert.ok(Math.abs(m.size[0]-26.4)<.01);
 console.log(part,m.size,m.triangles,'triangles');
}
assert.equal(Object.keys(unzipSync(zipSync(kit))).length,5);
assert.deepEqual(validate({format:'led-sign-generator',version:1,settings:p},config),p);
assert.throws(()=>validate({height:false},config));
assert.throws(()=>validate({font_name:'missing'},config));
assert.match(makeSource(template,{sign_text:'a"; cube(100); //'}),/sign_text = "a\\"; cube\(100\); \/\/";/);
console.log('WASM render, dimensions, cutting SVG, ZIP and project tests passed.');

// Contour regions must be closed solids whose combined volume fills the face.
const {make3MF,stlMesh}=await import('../dist/three-mf.js');
const cp=validate({...p,sign_text:'BOi',style:'contour',height:60,body_color:'#112233',text_color:'#ffeedd',border_color:'#445566'},config);
const cs=makeSource(template,cp),regionBytes={};
function volume(bytes){
 const m=stlMesh(bytes),edges=new Map();let v=0;
 for(const ids of m.triangles){const [a,b,c]=ids.map(i=>m.vertices[i]);v+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
 for(const [x,y]of [[ids[0],ids[1]],[ids[1],ids[2]],[ids[2],ids[0]]]){const key=[x,y].sort((a,b)=>a-b).join(',');edges.set(key,(edges.get(key)||0)+1);}}
 assert.ok(v>0);assert.ok([...edges.values()].every(n=>n===2),'Closed manifold mesh');return v;
}
for(const part of ['body','diffuser','text_region','border_region'])regionBytes[part]=await renderPart({source:cs,fontBytes,fontFile,part});
const whole=volume(regionBytes.diffuser),textVolume=volume(regionBytes.text_region),borderVolume=volume(regionBytes.border_region);
assert.ok(Math.abs(whole-textVolume-borderVolume)<.1,'Regions must fill the original face');
const result={settings:cp,parts:{body:meshInfo(regionBytes.body)}};
const archive=make3MF(['body','text_region','border_region'].map(k=>regionBytes[k]),result,cp);
const unpacked=unzipSync(archive),model=new TextDecoder().decode(unpacked['3D/3dmodel.model']);
assert.equal(Object.keys(unpacked).length,3);
for(const color of ['#112233FF','#FFEEDDFF','#445566FF'])assert.ok(model.includes(color));
assert.equal((model.match(/<object /g)||[]).length,4);
assert.equal((model.match(/<item /g)||[]).length,2);
assert.ok(model.includes('<component objectid="3"/><component objectid="4"/>'));
assert.ok(!model.includes('NaN'));
assert.throws(()=>validate({...cp,margin:2,wall:3},config));
assert.throws(()=>validate({...cp,text_color:'red'},config));
fs.mkdirSync(new URL('../.test-output/',import.meta.url),{recursive:true});
fs.writeFileSync(new URL('../.test-output/contour-colored.3mf',import.meta.url),archive);
console.log('Contour split volume, watertight meshes, preserved counters, material colors and grouped 3MF passed.');

// New enclosures retain complementary color regions; wiring only removes body material.
for(const style of ['outline','rectangle']){
 const settings=validate({...cp,style},config), src=makeSource(template,settings), meshes={};
 for(const part of ['body','diffuser','text_region','border_region'])meshes[part]=await renderPart({source:src,fontBytes,fontFile,part});
 const plainVolume=volume(meshes.body);
 assert.ok(Math.abs(volume(meshes.diffuser)-volume(meshes.text_region)-volume(meshes.border_region))<.15);
 const info=meshInfo(meshes.body);
 if(style==='rectangle')assert.ok(Math.abs(info.size[1]-72)<.01,'Rectangular glyph bounds plus margin');
 const colored=unzipSync(make3MF(['body','text_region','border_region'].map(k=>meshes[k]),{settings,parts:{body:info}},settings));
 assert.ok(new TextDecoder().decode(colored['3D/3dmodel.model']).includes('<component objectid="4"/>'));
 const wired=validate({...settings,wire_exit:'rear',cable_channel:'horizontal'},config);
 const body=await renderPart({source:makeSource(template,wired),fontBytes,fontFile,part:'body'});
 assert.ok(volume(body)<plainVolume-10,'Wiring removes body material');
 assert.deepEqual(meshInfo(body).size,info.size,'Wiring preserves envelope');
 if(style==='rectangle'){
  const rear=await renderPart({source:makeSource(template,{...settings,wire_exit:'rear'}),fontBytes,fontFile,part:'body'});
  const expected=48/2*(settings.wire_diameter/2)**2*Math.sin(2*Math.PI/48)*settings.back;
  assert.ok(Math.abs(plainVolume-volume(rear)-expected)<.1,'Rear bore removes exactly the back thickness');
 }
 console.log(style,'color regions, manifold wired body, preserved dimensions and 3MF passed');
}
assert.throws(()=>validate({...cp,cable_channel:'horizontal',depth:8,wire_diameter:8},config));
assert.throws(()=>validate({...cp,wire_exit:'unknown'},config));
assert.throws(()=>validate({...cp,wire_diameter:0},config));

// Retention and mounts: test actual material changes, closure and fit dimensions.
const rp=validate({...cp,style:'rectangle'},config);
const renderSetting=async(settings,part='body')=>renderPart({source:makeSource(template,settings),fontBytes,fontFile,part});
const baseline=await renderSetting(rp), baseVol=volume(baseline);
const bounds=meshInfo(baseline), W=bounds.maximum[0]-bounds.minimum[0], H=bounds.maximum[1]-bounds.minimum[1], seat=rp.depth-rp.face-rp.recess;
const expectedBox=W*H*rp.depth-(W-2*(rp.wall+rp.ledge))*(H-2*(rp.wall+rp.ledge))*(seat-rp.back)-(W-2*rp.wall)*(H-2*rp.wall)*(rp.depth-seat);
assert.ok(Math.abs(baseVol-expectedBox)<.15,'Rectangle must have a continuous, unpartitioned cavity');
for(const mount of ['screws','keyholes','adhesive']){
 const mounted=await renderSetting({...rp,mount});
 const removed=baseVol-volume(mounted);
 assert.ok(removed>1);
 if(mount==='adhesive')assert.ok(Math.abs(removed-2*rp.pad_size**2*rp.pad_depth)<.1,'Recess pocket volume');
 if(mount==='screws')assert.ok(Math.abs(removed-2*48/2*(rp.screw_diameter/2)**2*Math.sin(2*Math.PI/48)*rp.back)<.1,`Two through-back screw holes: removed ${removed}, expected ${2*48/2*(rp.screw_diameter/2)**2*Math.sin(2*Math.PI/48)*rp.back}`);
}
for(const led_lip of ['sides','back','both']){
 const retained=await renderSetting({...rp,led_lip});
 assert.ok(volume(retained)>baseVol+10,'Retaining features add material');
 assert.deepEqual(meshInfo(retained).size,meshInfo(baseline).size);
}
const combined=validate({...rp,mount:'keyholes',mount_y:16,led_lip:'both',fit_mode:'friction',wire_exit:'rear',wire_y:-18,cable_channel:'horizontal',channel_y:-18},config);
volume(await renderSetting(combined));
const coupon=await renderSetting(combined,'fit_diffuser');
assert.ok(Math.abs(meshInfo(coupon).size[0]-(30-2*(rp.wall+rp.friction_clearance)))<.001);
const glueFace=await renderSetting(rp,'diffuser'), frictionFace=await renderSetting(combined,'diffuser');
assert.ok(Math.abs(meshInfo(frictionFace).size[0]-meshInfo(glueFace).size[0]-2*(rp.clearance-rp.friction_clearance))<.005);
const jp=validate({...p,style:'joined',sign_text:'II',height:60,spacing:1,join_radius:12},config);
const joined=await renderSetting(jp), separate=await renderSetting({...jp,style:'letters'});
volume(joined);volume(separate);
function components(bytes){
 const {vertices,triangles}=stlMesh(bytes),parents=vertices.map((_,i)=>i);
 const root=i=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;};
 for(const [a,b,c]of triangles){parents[root(b)]=root(a);parents[root(c)]=root(a);}
 return new Set(vertices.map((_,i)=>root(i))).size;
}
assert.equal(components(separate),2);assert.equal(components(joined),1,'Joined letters must form one solid');
const joinedFace=await renderSetting(jp,'diffuser');
assert.ok(volume(joinedFace)>volume(await renderSetting({...jp,style:'letters'},'diffuser')),'Joining fills the face gaps');
make3MF([joined,joinedFace],{settings:jp,parts:{body:meshInfo(joined)}},jp);
for(const invalid of [{led_lip:'sides',depth:12},{mount:'adhesive',pad_depth:1.5},{mount:'keyholes',head_diameter:4,screw_diameter:4},{led_lip:'back',strip_width:4,lip_projection:3},{fit_mode:'unknown'}])assert.throws(()=>validate({...rp,...invalid},config));
console.log('Mount removal, LED lip volumes, closed combined assembly, friction coupon sizing and connected joined letters passed.');
