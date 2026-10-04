import {createOpenSCAD} from './vendor/openscad.js';
// One invocation per worker bounds memory and avoids reusing OpenSCAD global state.
export async function renderPart({source,fontBytes,fontFile,part}) {
 const logs=[];
 const engine=(await createOpenSCAD({print:t=>logs.push(t),printErr:t=>logs.push(t)})).getInstance();
 for(const dir of ['/fonts','/etc','/etc/fonts'])try{engine.FS.mkdir(dir);}catch{}
 const conf='<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><dir>/fonts</dir><cachedir>/tmp</cachedir></fontconfig>';
 engine.FS.writeFile('/fonts/fonts.conf',conf);
 engine.FS.writeFile('/etc/fonts/fonts.conf',conf);
 engine.FS.writeFile('/fonts/'+fontFile,fontBytes);
 engine.FS.writeFile('/sign.scad',source);
 const name=part==='cutting'?'diffuser.svg':part+'.stl';
 const args=['/sign.scad','-D',`part="${part}"`,'-o','/'+name];
 if(part!=='cutting')args.push('--export-format','binstl');
 const exit=engine.callMain(args);
 if(exit!==0||logs.some(t=>t.startsWith('ERROR:')))throw new Error(`Could not render ${part}. Try larger, bolder text or thinner walls. ${logs.slice(-4).join(' ')}`);
 try{return engine.FS.readFile('/'+name).slice();}catch{throw new Error(`The ${part} is empty. Increase the text height or reduce wall thickness.`);}
}
