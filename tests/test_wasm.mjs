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
