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
