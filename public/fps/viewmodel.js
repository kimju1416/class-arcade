import {weaponLayout} from './weapon-layout.js?v=detail-4';
import * as T from './three.module.js';
export function createViewmodel(renderer){
 const scene=new T.Scene(),camera=new T.OrthographicCamera(-1,1,1,-1,0,10);camera.position.z=2;
 let loaded=0;const loader=new T.TextureLoader(),textures={rifle:loader.load('rifle-chroma.png',()=>loaded++),sniper:loader.load('sniper-chroma.png',()=>loaded++)};for(const texture of Object.values(textures))texture.colorSpace=T.SRGBColorSpace;const texture=textures.rifle;
 const material=new T.ShaderMaterial({uniforms:{map:{value:texture}},transparent:true,depthTest:false,depthWrite:false,vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'uniform sampler2D map; varying vec2 vUv; void main(){vec4 c=texture2D(map,vUv);float chroma=min(c.r,c.b)-c.g;float alpha=1.0-smoothstep(0.28,0.58,chroma);if(alpha<0.02)discard;if(alpha<0.95){c.r=min(c.r,c.g+0.15);c.b=min(c.b,c.g+0.15);}gl_FragColor=vec4(c.rgb,alpha);#include <colorspace_fragment>\n}'});
 // Keep the shader directive on its own line for all WebGL implementations.
 material.fragmentShader=material.fragmentShader.replace(';#include',';\n#include');
 const mesh=new T.Mesh(new T.PlaneGeometry(1.5,1),material);scene.add(mesh);
 const flash=new T.Mesh(new T.CircleGeometry(.07,7),new T.MeshBasicMaterial({color:'#ffe5a6',transparent:true,opacity:.85,depthTest:false}));scene.add(flash);flash.position.z=.1;let flashTime=0;
 return {get ready(){return loaded===2},shot(){flashTime=.06},render(p,dt,now,aim,sprint,recoil,moving){if(loaded!==2||!p||p.hp<=0)return;material.uniforms.map.value=textures[p.weapon]||textures.rifle;let a=innerWidth/innerHeight;camera.left=-a;camera.right=a;camera.updateProjectionMatrix();const layout=weaponLayout(p.weapon,a,aim,p.reload,sprint,recoil);mesh.scale.setScalar(layout.scale);mesh.position.set(layout.x,layout.y,0);mesh.rotation.z=layout.angle;flashTime-=dt;flash.visible=flashTime>0&&!sprint&&p.reload<=0;flash.position.set(0,0,.1);flash.rotation.z=Math.random()*6;let auto=renderer.autoClear;renderer.autoClear=false;renderer.clearDepth();renderer.render(scene,camera);renderer.autoClear=auto}}
}
