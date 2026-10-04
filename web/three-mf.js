// 3MF Core: named mesh resources with base-material colors. No slicer-specific
// printer/filament profile is assumed. The two face regions share one component.
const enc=new TextEncoder();
const xml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
// Standard uncompressed ZIP makes this exporter also work in the Python edition
// without requiring npm packages or an external CDN.
function zip(files){
 const local=[],central=[];let offset=0,totalCentral=0;
 const record=(size)=>{const bytes=new Uint8Array(size);return [bytes,new DataView(bytes.buffer)];};
 for(const [path,text]of Object.entries(files)){
  const name=enc.encode(path),data=enc.encode(text),crc=crc32(data);
  const [h,v]=record(30+name.length);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(12,33,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);h.set(name,30);
  local.push(h,data);
  const [c,w]=record(46+name.length);w.setUint32(0,0x02014b50,true);w.setUint16(4,20,true);w.setUint16(6,20,true);w.setUint16(14,33,true);w.setUint32(16,crc,true);w.setUint32(20,data.length,true);w.setUint32(24,data.length,true);w.setUint16(28,name.length,true);w.setUint32(42,offset,true);c.set(name,46);central.push(c);totalCentral+=c.length;offset+=h.length+data.length;
 }
 const [end,e]=record(22);e.setUint32(0,0x06054b50,true);e.setUint16(8,central.length,true);e.setUint16(10,central.length,true);e.setUint32(12,totalCentral,true);e.setUint32(16,offset,true);
 const out=new Uint8Array(offset+totalCentral+22);let p=0;for(const a of [...local,...central,end]){out.set(a,p);p+=a.length;}return out;
}
export function stlMesh(bytes){
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),vertices=[],triangles=[],seen=new Map();
 if(bytes.length<84)throw new Error('Invalid STL');const n=v.getUint32(80,true);if(!n||bytes.length!==84+n*50)throw new Error('Invalid STL');
 for(let i=0;i<n;i++){
  const t=[];for(let j=0;j<3;j++){
   const xyz=[0,1,2].map(k=>v.getFloat32(84+50*i+12+12*j+4*k,true));
   if(xyz.some(x=>!Number.isFinite(x)))throw new Error('Non-finite mesh coordinate');
   const key=xyz.join(',');if(!seen.has(key)){seen.set(key,vertices.length);vertices.push(xyz);}t.push(seen.get(key));
  }triangles.push(t);
 }return {vertices,triangles};
}
export function make3MF(buffers,result,colors){
 const contour=result.settings.style==='contour';
 if(buffers.length!==(contour?3:2))throw new Error('Missing color-region meshes.');
 const names=['Body',contour?'Text — translucent':'Diffuser — translucent','Border / background — opaque'];
 const palette=[colors.body_color,colors.text_color,colors.border_color];
 for(const c of palette)if(!/^#[0-9a-fA-F]{6}$/.test(c))throw new Error('Invalid color.');
 const resources=buffers.map((b,i)=>{
  const {vertices,triangles}=stlMesh(b);
  return `<object id="${i+2}" type="model" name="${xml(names[i])}" pid="1" pindex="${i}"><mesh><vertices>${vertices.map(([x,y,z])=>`<vertex x="${x}" y="${y}" z="${z}"/>`).join('')}</vertices><triangles>${triangles.map(([a,b,c])=>`<triangle v1="${a}" v2="${b}" v3="${c}"/>`).join('')}</triangles></mesh></object>`;
 }).join('');
 const lo=result.parts.body.minimum,hi=result.parts.body.maximum;
 const transform=(x,y)=>`1 0 0 0 1 0 0 0 1 ${x} ${y} 0`;
 const model=`<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><metadata name="Title">${xml(result.settings.sign_text)} — LED lightbox</metadata><metadata name="Description">Body and multicolor face at Z=0. Keep face components aligned. Assign filaments by part; arrange objects for your printer.</metadata><resources><basematerials id="1">${palette.map((c,i)=>`<base name="${xml(names[i])}" displaycolor="${c.toUpperCase()}FF"/>`).join('')}</basematerials>${resources}<object id="10" type="model" name="Face — keep text and border together"><components><component objectid="3"/>${contour?'<component objectid="4"/>':''}</components></object></resources><build><item objectid="2" transform="${transform(5-lo[0],5-lo[1])}"/><item objectid="10" transform="${transform(15+hi[0]-2*lo[0],5-lo[1])}"/></build></model>`;
 return zip({
  '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>',
  '_rels/.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>',
  '3D/3dmodel.model':model
 });
}
