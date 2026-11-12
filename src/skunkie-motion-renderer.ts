import motion from "./skunkie-motion.json";
import type { MotionSample } from "./skunkie-motion-timeline";

export const SKUNKIE_MOTION_SRC = motion.atlas.source;
export const SKUNKIE_FLOW_SRC = motion.flow.source;
const pairIndex = new Map(motion.flow.pairs.map((pair, index) => [pair.join(":"), index]));

const vertex = `attribute vec2 position; varying vec2 uv;
void main(){ uv=position; gl_Position=vec4(position.x*2.0-1.0,1.0-position.y*2.0,0.0,1.0); }`;
const fragment = `precision highp float;
varying vec2 uv;
uniform sampler2D artwork; uniform sampler2D vectors;
uniform vec2 fromSlot; uniform vec2 toSlot; uniform vec2 flowSlot;
uniform vec2 flowGrid; uniform vec2 flowCell; uniform vec2 atlasGrid;
uniform float reverse; uniform float amount; uniform float extent; uniform float still;
vec2 vectorAt(vec2 point,float direction){
  vec2 slot=vec2(flowSlot.x*2.0+direction,flowSlot.y);
  vec2 safePoint=clamp(point,0.5/flowCell,1.0-0.5/flowCell);
  vec2 data=texture2D(vectors,(slot+safePoint)/vec2(flowGrid.x*2.0,flowGrid.y)).rg;
  return ((data*255.0-128.0)/127.0)*extent/flowCell;
}
vec2 sourceAt(float travel,float direction){
  vec2 point=uv;
  for(int i=0;i<8;i++) point=mix(point,uv-travel*vectorAt(point,direction),0.5);
  return point;
}
vec4 pose(vec2 point,vec2 slot){
  point=clamp(point,vec2(0.5/288.0,0.5/384.0),vec2(1.0-0.5/288.0,1.0-0.5/384.0));
  vec4 color=texture2D(artwork,(slot+point)/atlasGrid);
  return vec4(color.rgb*color.a,color.a);
}
void main(){
  vec4 a=pose(sourceAt(amount*(1.0-still),reverse),fromSlot);
  vec4 b=pose(sourceAt((1.0-amount)*(1.0-still),1.0-reverse),toSlot);
  // Keep unmatched details from lingering as a second hand or eye. Where
  // correspondence is strong, use the complete smooth blend interval.
  vec3 ca=a.rgb/max(a.a,0.00001), cb=b.rgb/max(b.a,0.00001);
  float mismatch=max(length(ca-cb),abs(a.a-b.a));
  float blend=mix(amount,smoothstep(0.44,0.56,amount),smoothstep(0.08,0.35,mismatch));
  vec4 blended=mix(a,b,blend);
  float alpha=blended.a;
  gl_FragColor=vec4(blended.rgb*alpha/max(blended.a,0.00001),alpha);
}`;

export type SkunkieRenderer = { draw(sample: MotionSample): void; dispose(): void };

/** Sample measured bidirectional displacement on every display refresh.
 * Cell coordinates are calculated in JS to avoid GPU rounding at row boundaries.
 * All rendering is premultiplied-alpha; still artwork remains the fallback. */
export function createSkunkieRenderer(canvas: HTMLCanvasElement, atlas: HTMLImageElement, flow: HTMLImageElement): SkunkieRenderer | null {
  const gl=canvas.getContext("webgl",{alpha:true,premultipliedAlpha:true,antialias:false,depth:false,stencil:false,powerPreference:"low-power"});
  if(!gl || gl.getParameter(gl.MAX_TEXTURE_SIZE)<Math.max(atlas.width,atlas.height,flow.width,flow.height)) return null;
  const shaders:WebGLShader[]=[], textures:WebGLTexture[]=[];
  let program:WebGLProgram|null=null, buffer:WebGLBuffer|null=null;
  const dispose=()=>{textures.forEach(t=>gl.deleteTexture(t));shaders.forEach(s=>gl.deleteShader(s));if(program)gl.deleteProgram(program);if(buffer)gl.deleteBuffer(buffer);};
  try {
    const compile=(type:number,source:string)=>{
      const shader=gl.createShader(type);if(!shader)throw Error("Shader unavailable");
      shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error("Shader compilation failed");return shader;
    };
    program=gl.createProgram();if(!program)throw Error("Program unavailable");
    gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error("Program linking failed");
    gl.useProgram(program);
    buffer=gl.createBuffer();if(!buffer)throw Error("Buffer unavailable");
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,0,1,0,0,1,0,1,1,0,1,1]),gl.STATIC_DRAW);
    const position=gl.getAttribLocation(program,"position");gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.NONE);
    [atlas,flow].forEach((image,index)=>{
      const texture=gl.createTexture();if(!texture)throw Error("Texture unavailable");textures.push(texture);
      gl.activeTexture(gl.TEXTURE0+index);gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
    });
    if(gl.getError()!==gl.NO_ERROR)throw Error("Texture upload failed");
    const uniform=(name:string)=>gl.getUniformLocation(program!,name);
    gl.uniform2f(uniform("atlasGrid"),motion.atlas.columns,motion.atlas.rows);
    gl.uniform1i(uniform("artwork"),0);gl.uniform1i(uniform("vectors"),1);
    gl.uniform2f(uniform("flowGrid"),motion.flow.columns,motion.flow.rows);gl.uniform2f(uniform("flowCell"),motion.flow.width,motion.flow.height);gl.uniform1f(uniform("extent"),motion.flow.range);
    const from=uniform("fromSlot"),to=uniform("toSlot"),slot=uniform("flowSlot"),reverse=uniform("reverse"),amount=uniform("amount"),still=uniform("still");
    gl.viewport(0,0,canvas.width,canvas.height);
    return {dispose,draw(sample){
      const edge=pairIndex.get([Math.min(sample.from,sample.to),Math.max(sample.from,sample.to)].join(":"));
      if(edge===undefined && sample.from!==sample.to)throw Error("Missing motion edge");
      gl.uniform2f(from,sample.from%motion.atlas.columns,Math.floor(sample.from/motion.atlas.columns));gl.uniform2f(to,sample.to%motion.atlas.columns,Math.floor(sample.to/motion.atlas.columns));
      gl.uniform2f(slot,(edge??0)%motion.flow.columns,Math.floor((edge??0)/motion.flow.columns));
      gl.uniform1f(reverse,sample.from>sample.to?1:0);gl.uniform1f(amount,sample.progress);gl.uniform1f(still,sample.from===sample.to?1:0);
      gl.drawArrays(gl.TRIANGLES,0,6);
    }};
  } catch {dispose();return null;}
}
