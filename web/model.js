export function validate(raw, config) {
  if(!raw || typeof raw!=='object' || Array.isArray(raw))throw new Error('Project must be an object.');
  if('version' in raw){if(raw.version!==1||raw.format!=='led-sign-generator')throw new Error('Unsupported project version.');raw=raw.settings;}
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid project settings.');
  if(Object.keys(raw).some(k=>!(k in config.defaults)))throw new Error('Unrecognized project settings.');
  const p={...config.defaults,...raw};
  if(typeof p.sign_text!=='string'||!p.sign_text.trim()||p.sign_text.length>24||/[\x00-\x1f]/.test(p.sign_text))throw new Error('Enter 1–24 characters on a single line.');
  if(!config.fonts.includes(p.font_name))throw new Error('This font is not included in the browser edition. Choose a DejaVu font.');
  if(!['letters','contour','outline','rectangle','joined'].includes(p.style))throw new Error('Choose a valid sign style.');
  for(const [key,[min,max]] of Object.entries(config.limits))if(typeof p[key]!=='number'||!Number.isFinite(p[key])||p[key]<min||p[key]>max)throw new Error(`${key} must be between ${min} and ${max}.`);
  for(const key of ['body_color','text_color','border_color'])if(typeof p[key]!=='string'||!/^#[0-9a-fA-F]{6}$/.test(p[key]))throw new Error('Colors must be six-digit hex values.');
  const gap=p.fit_mode==='friction'?p.friction_clearance:p.clearance;
  if(!['letters','joined'].includes(p.style)&&p.margin<=p.wall+gap)throw new Error('Contour margin must exceed wall thickness plus clearance to preserve the lettering.');
  if(p.ledge<=gap)throw new Error('Support ledge must exceed clearance.');
  if(p.depth-p.recess-p.face<=p.back+2)throw new Error('Increase depth to leave more than 2 mm for LEDs.');
  if(!['none','rear'].includes(p.wire_exit)||!['none','horizontal'].includes(p.cable_channel))throw new Error('Choose valid wiring options.');
  if(p.cable_channel==='horizontal'&&p.back+p.wire_diameter+0.6>=p.depth-p.recess-p.face)throw new Error('Increase depth or reduce wire diameter to fit the channel below the ledge.');
  if(!['glue','friction'].includes(p.fit_mode)||!['none','screws','keyholes','adhesive'].includes(p.mount)||!['none','sides','back','both'].includes(p.led_lip))throw new Error('Choose valid fit, mounting and LED retention options.');
  if(p.mount==='adhesive'&&p.pad_depth>=p.back-.6)throw new Error('Adhesive pockets must leave more than 0.6 mm of back material.');
  if(p.mount==='keyholes'&&p.head_diameter<=p.screw_diameter+1)throw new Error('Keyhole head opening must exceed screw diameter by more than 1 mm.');
  for(const [mode,dimension] of [['sides','strip_width'],['back','strip_thickness']])if([mode,'both'].includes(p.led_lip)&&p.back+p[dimension]+p.strip_clearance+p.lip_thickness+1>=p.depth-p.recess-p.face)throw new Error('Increase depth: LED retaining lips need 1 mm of clearance below the diffuser ledge.');
  if(p.led_lip!=='none'&&2*p.lip_projection>=p.strip_width)throw new Error('Reduce lip projection to leave the LED strip exposed.');
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
