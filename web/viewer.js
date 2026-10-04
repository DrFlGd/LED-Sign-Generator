// A small, dependency-free STL viewer. Geometry comes only from OpenSCAD.
export class Viewer {
  constructor(canvas) {
    this.canvas=canvas; this.gl=canvas.getContext('webgl', {antialias:true,alpha:true});
    if(!this.gl) throw new Error('WebGL is unavailable. Downloads still work; open the STL files in your slicer.');
    const gl=this.gl;
    const shader=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;};
    const vs=shader(gl.VERTEX_SHADER,`attribute vec3 position;attribute vec3 normal;uniform vec3 center;uniform float scale;uniform float aspect;uniform vec2 angle;uniform float lift;varying float light;
    vec3 rotate(vec3 p){float c=cos(angle.y),s=sin(angle.y);p=vec3(c*p.x-s*p.y,s*p.x+c*p.y,p.z);c=cos(angle.x);s=sin(angle.x);return vec3(p.x,c*p.y-s*p.z,s*p.y+c*p.z);}
    void main(){vec3 p=rotate(position+vec3(0.,0.,lift)-center);vec3 n=rotate(normal);gl_Position=vec4(p.x/scale/aspect,p.y/scale,-p.z/(scale*8.),1.);light=.58+.42*max(0.,dot(n,normalize(vec3(-.3,.6,1.))));}`);
    const fs=shader(gl.FRAGMENT_SHADER,`precision mediump float;uniform vec3 color;varying float light;void main(){gl_FragColor=vec4(color*light,1.);}`);
    this.program=gl.createProgram();gl.attachShader(this.program,vs);gl.attachShader(this.program,fs);gl.linkProgram(this.program);
    if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw new Error('Could not initialize preview.');
    this.uniforms=Object.fromEntries(['center','scale','aspect','angle','lift','color'].map(n=>[n,gl.getUniformLocation(this.program,n)]));
    this.meshes=[];this.angle=[-.6,-.12];this.zoom=1;this.options={body:true,face:true,bodyColor:'#294650',faceColor:'#ffe4a6',explode:false};
    let last=null;
    canvas.addEventListener('pointerdown',e=>{last=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);});
    canvas.addEventListener('pointermove',e=>{if(last){this.angle[1]+=(e.clientX-last[0])*.008;this.angle[0]+=(e.clientY-last[1])*.008;last=[e.clientX,e.clientY];this.draw();}});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>last=null);
    canvas.addEventListener('wheel',e=>{e.preventDefault();this.zoom=Math.max(.3,Math.min(5,this.zoom*Math.exp(-e.deltaY*.001)));this.draw();},{passive:false});
    canvas.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-'].includes(e.key))return;e.preventDefault();if(e.key==='ArrowLeft')this.angle[1]-=.1;if(e.key==='ArrowRight')this.angle[1]+=.1;if(e.key==='ArrowUp')this.angle[0]-=.1;if(e.key==='ArrowDown')this.angle[0]+=.1;if(e.key==='+')this.zoom=Math.min(5,this.zoom*1.1);if(e.key==='-')this.zoom=Math.max(.3,this.zoom/1.1);this.draw();});
    new ResizeObserver(()=>this.draw()).observe(canvas);
  }
  mesh(buffer) {
    const view=new DataView(buffer),count=view.getUint32(80,true),data=new Float32Array(count*18);
    for(let i=0;i<count;i++)for(let j=0;j<3;j++)for(let k=0;k<3;k++){
      data[i*18+j*6+k]=view.getFloat32(84+i*50+12+j*12+k*4,true);
      data[i*18+j*6+3+k]=view.getFloat32(84+i*50+k*4,true);
    }
    const gl=this.gl,b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);return {buffer:b,count:count*3};
  }
  setModel(buffers,result) {
    this.meshes.forEach(m=>this.gl.deleteBuffer(m.buffer));this.meshes=buffers.map(b=>this.mesh(b));this.result=result;this.zoom=1;this.draw();
  }
  view(name){this.angle=name==='front'?[0,0]:name==='rear'?[Math.PI,0]:[-.6,-.12];this.zoom=1;this.draw();}
  draw(){
    const gl=this.gl,c=this.canvas,dpr=Math.min(devicePixelRatio||1,2);c.width=Math.round(c.clientWidth*dpr);c.height=Math.round(c.clientHeight*dpr);
    gl.viewport(0,0,c.width,c.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);if(!this.result)return;
    gl.enable(gl.DEPTH_TEST);gl.useProgram(this.program);
    const {minimum:lo,maximum:hi,size}=this.result.parts.body,aspect=c.width/c.height,u=this.uniforms;
    const extra=this.options.explode?this.result.settings.depth*.8:0;
    gl.uniform3fv(u.center,lo.map((x,i)=>(x+hi[i])/2+(i===2?extra/2:0)));
    gl.uniform1f(u.scale,Math.max(size[0]/aspect,size[1]+size[2]+extra)*.7/this.zoom);gl.uniform1f(u.aspect,aspect);gl.uniform2fv(u.angle,this.angle);
    this.meshes.forEach((m,i)=>{
      if(!(i===0?this.options.body:this.options.face))return;
      gl.bindBuffer(gl.ARRAY_BUFFER,m.buffer);
      for(const [name,offset]of [['position',0],['normal',12]]){const a=gl.getAttribLocation(this.program,name);gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,3,gl.FLOAT,false,24,offset);}
      const hex=i===0?this.options.bodyColor:this.options.faceColor;
      gl.uniform3fv(u.color,[1,3,5].map(j=>parseInt(hex.slice(j,j+2),16)/255));gl.uniform1f(u.lift,i===0?0:this.result.seat+extra);gl.drawArrays(gl.TRIANGLES,0,m.count);
    });
  }
}
