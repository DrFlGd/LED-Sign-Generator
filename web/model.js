export function validate(raw, config) {
  if(!raw || typeof raw!=='object' || Array.isArray(raw))throw new Error('Project must be an object.');
  if('version' in raw){if(raw.version!==1||raw.format!=='led-sign-generator')throw new Error('Unsupported project version.');raw=raw.settings;}
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid project settings.');
  if(Object.keys(raw).some(k=>!(k in config.defaults)))throw new Error('Unrecognized project settings.');
  const p={...config.defaults,...raw};
  if(typeof p.sign_text!=='string'||!p.sign_text.trim()||p.sign_text.length>24||/[\x00-\x1f]/.test(p.sign_text))throw new Error('Enter 1–24 characters on a single line.');
  if(!config.fonts.includes(p.font_name))throw new Error('This font is not included in the browser edition. Choose a DejaVu font.');
  if(!['letters','contour'].includes(p.style))throw new Error('Choose a valid sign style.');
  for(const [key,[min,max]] of Object.entries(config.limits))if(typeof p[key]!=='number'||!Number.isFinite(p[key])||p[key]<min||p[key]>max)throw new Error(`${key} must be between ${min} and ${max}.`);
  for(const key of ['body_color','text_color','border_color'])if(typeof p[key]!=='string'||!/^#[0-9a-fA-F]{6}$/.test(p[key]))throw new Error('Colors must be six-digit hex values.');
  if(p.style==='contour'&&p.margin<=p.wall+p.clearance)throw new Error('Contour margin must exceed wall thickness plus clearance to preserve the lettering.');
  if(p.ledge<=p.clearance)throw new Error('Support ledge must exceed clearance.');
  if(p.depth-p.recess-p.face<=p.back+2)throw new Error('Increase depth to leave more than 2 mm for LEDs.');
  return p;
}
export function makeSource(template,p){for(const [key,value]of Object.entries(p))template=template.replace(new RegExp(`^${key} = .*?;`,'m'),()=>`${key} = ${JSON.stringify(value)};`);return template;}
export function meshInfo(bytes){
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(bytes.length<84)throw new Error('The generated mesh is empty. Try bolder text or thinner walls.');
 const n=v.getUint32(80,true),minimum=[Infinity,Infinity,Infinity],maximum=[-Infinity,-Infinity,-Infinity];
 if(!n||bytes.length!==84+50*n)throw new Error('OpenSCAD returned an invalid STL.');
 for(let i=0;i<n;i++)for(let j=0;j<9;j++){const x=v.getFloat32(84+50*i+12+4*j,true),k=j%3;minimum[k]=Math.min(minimum[k],x);maximum[k]=Math.max(maximum[k],x);}
 return {triangles:n,minimum,maximum,size:maximum.map((x,i)=>Math.round((x-minimum[i])*1000)/1000)};
}
