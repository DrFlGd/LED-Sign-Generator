import {Viewer} from './viewer.js';
const $=id=>document.getElementById(id),form=$('controls');
let viewer=null,current=null,busy=false,defaults={},keys=[],revision=0,previewError='';
try{viewer=new Viewer($('viewer'));}catch(e){previewError=e.message;}
const message=(text,error=false)=>{$('status').textContent=text;$('status').classList.toggle('error',error);};
async function api(path,data){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});if(!r.ok){const e=await r.json();throw new Error(e.error||'Request failed');}return r;}
function settings(){return Object.fromEntries(keys.map(k=>[k,typeof defaults[k]==='number'?Number(form.elements[k].value):form.elements[k].value]));}
function refreshStyle(){ $('margin-field').hidden=form.elements.style.value!=='contour'; }
function fill(p){for(const k of keys)form.elements[k].value=p[k];refreshStyle();}
function dirty(){revision++;current=null;$('download').disabled=true;$('badge').textContent='CHANGES NOT BUILT';message('Settings changed. Generate again to update the preview and print files.');refreshStyle();}
function download(data,name,type='application/json'){const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function project(p){return {format:'led-sign-generator',version:1,settings:p};}
form.addEventListener('input',dirty);
form.addEventListener('submit',async e=>{
  e.preventDefault();if(busy||!form.reportValidity())return;
  const version=revision,p=settings();busy=true;$('generate').disabled=true;$('download').disabled=true;current=null;
  $('badge').textContent='RENDERING';$('badge').classList.add('busy');message('Building the body, diffuser and fit samples in OpenSCAD…');
  try{
    const result=await (await api('/api/build',p)).json();
    if(version!==revision){message('Settings changed during rendering. Generate again to build your latest design.');$('badge').textContent='CHANGES NOT BUILT';return;}
    if(viewer){const buffers=await Promise.all(['body','diffuser'].map(async part=>{const r=await fetch(`/build/${result.id}/${part}.stl`);if(!r.ok)throw new Error('Could not load preview mesh.');return r.arrayBuffer();}));
      if(version!==revision){message('Settings changed during rendering. Generate again.');$('badge').textContent='CHANGES NOT BUILT';return;}
      viewer.setModel(buffers,result);$('empty').hidden=true;$('empty').style.display='none';
    }
    current=result;$('model-title').textContent=p.sign_text+' / inset diffuser';$('badge').textContent='MODEL READY';
    ['x','y','z'].forEach((k,i)=>{$('dim-'+k).replaceChildren(document.createTextNode(result.parts.body.size[i].toFixed(1)+' '));const s=document.createElement('small');s.textContent='mm';$('dim-'+k).append(s);});
    $('warnings').replaceChildren(...result.warnings.map(w=>{const li=document.createElement('li');li.textContent=w;return li;}));
    $('download').disabled=false;message(previewError||`Ready. ${result.parts.body.triangles.toLocaleString()} body triangles. Clear height below the ledge: ${(result.seat-p.back).toFixed(1)} mm. Inspect narrow strokes before printing.`,!!previewError);
    try{localStorage.setItem('led-sign-project',JSON.stringify(project(p)));}catch{}
  }catch(e){message(e.message,true);$('badge').textContent='BUILD NEEDS ATTENTION';}
  finally{busy=false;$('generate').disabled=false;$('badge').classList.remove('busy');}
});
$('download').onclick=()=>{if(current){const a=document.createElement('a');a.href=`/build/${current.id}/print-kit.zip`;a.download='led-sign-print-kit.zip';a.click();}};
$('save').onclick=async()=>{try{const p=await(await api('/api/validate',settings())).json();download(JSON.stringify(project(p),null,2),'led-sign-project.json');}catch(e){message(e.message,true);}};
$('scad').onclick=async()=>{try{download(await(await api('/api/scad',settings())).text(),'sign.scad','text/plain');}catch(e){message(e.message,true);}};
$('open').onclick=()=>$('file').click();
$('file').onchange=async()=>{try{const f=$('file').files[0];if(!f)return;if(f.size>16384)throw new Error('Project file is too large.');const p=await(await api('/api/validate',JSON.parse(await f.text()))).json();fill(p);dirty();message('Project opened. Generate to rebuild the preview.');}catch(e){message('Could not open project: '+e.message,true);}finally{$('file').value='';}};
for(const button of document.querySelectorAll('[data-view]'))button.onclick=()=>{document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b===button));viewer?.view(button.dataset.view);};
$('reset').onclick=()=>document.querySelector('[data-view="iso"]').click();
for(const id of ['show-body','show-face','body-color','face-color','explode'])$(id).oninput=()=>{if(!viewer)return;Object.assign(viewer.options,{body:$('show-body').checked,face:$('show-face').checked,bodyColor:$('body-color').value,faceColor:$('face-color').value,explode:$('explode').checked});viewer.draw();};
try{
 const r=await fetch('/api/config');if(!r.ok)throw new Error('Could not load app configuration.');const config=await r.json();defaults=config.defaults;keys=Object.keys(defaults);
 for(const font of config.fonts){const o=document.createElement('option');o.value=font;o.textContent=font.replace(':style=',' · ');form.elements.font_name.append(o);}
 fill(defaults);
 try{const saved=localStorage.getItem('led-sign-project');if(saved){fill(await(await api('/api/validate',JSON.parse(saved))).json());message('Restored your last generated project. Generate to rebuild it.');}}catch{message('Your saved project could not be restored; using defaults.');}
 if(!config.openscad)message('Install OpenSCAD and add it to PATH to generate print files. You can still download the source.',true);
 else if(previewError)message(previewError,true);
}catch(e){message(e.message+' Start the app with python server.py.',true);$('generate').disabled=true;}
