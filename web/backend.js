import {validate,makeSource,meshInfo} from './model.js';
const browserMode=document.querySelector('meta[name="renderer"]')?.content==='wasm';
let configPromise,templatePromise,files=new Map();
const config=()=>configPromise??=fetch(new URL('./config.json',import.meta.url)).then(r=>{if(!r.ok)throw new Error('Unable to load site configuration.');return r.json();});
const template=()=>templatePromise??=fetch(new URL('./lightbox.scad',import.meta.url)).then(r=>{if(!r.ok)throw new Error('Unable to load OpenSCAD source.');return r.text();});
function render(source,fontFile,part){return new Promise((resolve,reject)=>{
 const worker=new Worker(new URL('./render-worker.js',import.meta.url),{type:'module'});
 const stop=()=>{clearTimeout(timer);worker.terminate();};
 const timer=setTimeout(()=>{stop();reject(new Error('Rendering exceeded two minutes. Try shorter text or a simpler font.'));},120000);
 worker.onmessage=({data})=>{stop();data.error?reject(new Error(data.error)):resolve(data.bytes);};
 worker.onerror=e=>{stop();reject(new Error(e.message||'The browser renderer could not start. Refresh and try again.'));};
 worker.postMessage({source,fontFile,part});
});}
const encoder=new TextEncoder();
function notes(p,parts){return `LED SIGN GENERATOR — PRINT & ASSEMBLY\n\nText: ${p.sign_text}\nFont: ${p.font_name}\nBody: ${parts.body.size.join(' × ')} mm\nPer-side clearance: ${p.clearance} mm\nFace thickness: ${p.face} mm; recess: ${p.recess} mm\n\nFor contour signs, import text_region.stl and border_region.stl together as parts of one object; they share coordinates and must not be separately arranged. Print them together as a multi-material face. diffuser.stl is the single-color fallback. The separate colored 3MF download preserves this grouping and includes color metadata; assign actual filaments in your slicer as needed.\n\n1. Print fit_body.stl and fit_diffuser.stl first. Adjust clearance if needed.\n2. Print body.stl back-down and diffuser.stl flat; both export on Z=0. Split disconnected letters into objects in your slicer if needed.\n3. diffuser.svg is in mm with no kerf compensation. Verify scale in your cutting software and use the configured face thickness.\n4. Inspect narrow strokes, counters, islands and LED space in your slicer. Rendering success does not certify printability.\n5. Wire exits and mounting holes are not generated. Plan these before printing.\n6. Use suitable low-voltage LEDs and account for heat. Test illumination before fitting the face. The face rests on a ledge; it is not a snap-lock. Use suitable removable adhesive if needed.\n\nOpen project.json in the app to edit. sign.scad is standalone; install the same DejaVu font to regenerate it in desktop OpenSCAD.\n`;}
export async function transportFetch(path,options){
 if(!browserMode)return fetch(path,options);
 try{
  const c=await config();
  if(path==='/api/config')return Response.json(c);
  if(path.startsWith('/build/')){const file=files.get(path);return file?new Response(file):Response.json({error:'Build expired. Generate again.'},{status:404});}
  const p=validate(JSON.parse(options.body),c);
  if(path==='/api/validate')return Response.json(p);
  const source=makeSource(await template(),p);
  if(path==='/api/scad')return new Response(source);
  if(path!=='/api/build')throw new Error('Unknown operation.');
  const {zipSync}=await import('./vendor/fflate.js');
  const id=crypto.randomUUID().replaceAll('-',''),parts={},kit={};
  const renderParts=['body','diffuser','fit_body','fit_diffuser','cutting',...(p.style==='contour'?['text_region','border_region']:[])];
  for(const [i,part]of renderParts.entries()){
   window.dispatchEvent(new CustomEvent('render-progress',{detail:`Rendering ${part.replaceAll('_',' ')} (${i+1}/${renderParts.length}) in your browser…`}));
   const bytes=await render(source,c.fontFiles[p.font_name],part);
   const name=part==='cutting'?'diffuser.svg':part+'.stl';kit[name]=bytes;
   if(part!=='cutting')parts[part]=meshInfo(bytes);
  }
  kit['sign.scad']=encoder.encode(source);
  kit['project.json']=encoder.encode(JSON.stringify({format:'led-sign-generator',version:1,settings:p},null,2));
  kit['ASSEMBLY.txt']=encoder.encode(notes(p,parts));
  const zip=zipSync(kit);files.clear();
  for(const [name,bytes]of Object.entries(kit))files.set(`/build/${id}/${name}`,bytes);
  files.set(`/build/${id}/print-kit.zip`,zip);
  return Response.json({id,parts,settings:p,seat:p.depth-p.recess-p.face,warnings:['Inspect thin strokes, counters, tiny islands and LED space in your slicer.','Print the fit coupon first.','Wire exits and mounting holes are not included.']});
 }catch(e){return Response.json({error:e.message},{status:400});}
}
