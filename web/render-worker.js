import {renderPart} from './render.js';
self.onmessage=async({data})=>{
 try{
  const r=await fetch(new URL('./fonts/'+data.fontFile,import.meta.url));
  if(!r.ok)throw new Error('Font download failed. Check your connection and retry.');
  const bytes=await renderPart({...data,fontBytes:new Uint8Array(await r.arrayBuffer())});
  self.postMessage({bytes},[bytes.buffer]);
 }catch(e){self.postMessage({error:e.message});}
};
