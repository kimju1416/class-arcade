import * as T from './three.module.js';
let map=null;
if(typeof document!=='undefined'){map=new T.TextureLoader().load('bot-carbine-chroma.png');map.colorSpace=T.SRGBColorSpace;}
export function createBotRifle(){
 const rifle=new T.Group();
 // Extruded silhouette supplies real thickness; generated side art supplies the fine machining.
 const outline=[[.015,.28],[.13,.28],[.14,.08],[.16,.08],[.20,.21],[.42,.21],[.61,.19],[.63,.055],[.646,.055],[.65,.20],[.70,.25],[.97,.23],[.98,.28],[.98,.64],[.93,.66],[.86,.46],[.71,.42],[.66,.43],[.71,.75],[.65,.80],[.61,.57],[.54,.57],[.51,.94],[.42,.87],[.45,.52],[.45,.42],[.20,.41],[.18,.37],[.015,.35]];
 const shape=new T.Shape();outline.forEach(([u,v],i)=>{const x=(u-.5)*.84,y=(.5-v)*.331;i?shape.lineTo(x,y):shape.moveTo(x,y)});shape.closePath();
 const shell=new T.Mesh(new T.ExtrudeGeometry(shape,{depth:.064,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.002,bevelThickness:.002}),new T.MeshLambertMaterial({color:'#30362e'}));shell.rotation.y=-Math.PI/2;shell.position.set(.032,-.056,-.20);rifle.add(shell);
 if(map){const material=new T.ShaderMaterial({uniforms:{map:{value:map}},side:T.DoubleSide,vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'uniform sampler2D map;varying vec2 vUv;void main(){vec4 c=texture2D(map,vUv);float key=min(c.r,c.b)-c.g;if(key>.24)discard;gl_FragColor=vec4(c.rgb,1.0);\n#include <colorspace_fragment>\n}'});
 for(const side of [-1,1]){const panel=new T.Mesh(new T.PlaneGeometry(.84,.331),material);panel.rotation.y=-Math.PI/2;panel.position.set(side*.035,-.056,-.20);rifle.add(panel)}}
 return rifle;
}
