import * as T from './three.module.js';
export function polishDepot(scene,mats,box,boxes){
 const map=new T.TextureLoader().load('loading-bay-v3.webp');map.colorSpace=T.SRGBColorSpace;map.anisotropy=2;
 const panelMat=new T.MeshStandardMaterial({map,roughness:.82,metalness:.12,color:'#d6ddd9'}),frame=new T.MeshStandardMaterial({color:'#28383c',metalness:.45,roughness:.67}),lamp=new T.MeshBasicMaterial({color:'#ffdea0'});
 for(const side of [-1,1])for(const z of [-17,0,17]){const panel=new T.Mesh(new T.PlaneGeometry(5.5,5),panelMat);panel.rotation.y=-side*Math.PI/2;panel.position.set(side*22.96,2.53,z);scene.add(panel);for(const dz of [-2.8,2.8])box(.22,5.25,.18,frame,side*22.78,2.62,z+dz);box(.22,.18,5.8,frame,side*22.78,5.2,z);box(.24,.10,.55,lamp,side*22.65,4.77,z);}
 mats.wall.bumpMap=mats.wall.map;mats.wall.bumpScale=.045;mats.ground.bumpMap=mats.ground.map;mats.ground.bumpScale=.025;mats.crate.bumpMap=mats.crate.map;mats.crate.bumpScale=.035;
 for(const name of ['blue','red','olive']){mats[name].bumpMap=mats[name].map;mats[name].bumpScale=.025;mats[name].roughness=.8;mats[name].metalness=.3;mats[name].needsUpdate=true}
 // Shared, instanced contact shadows anchor cover to the floor without a shadow-map pass.
 const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');ctx.shadowColor='#000';ctx.shadowBlur=16;ctx.fillStyle='#000';ctx.fillRect(19,19,90,90);const shadow=new T.CanvasTexture(c),material=new T.MeshBasicMaterial({map:shadow,transparent:true,opacity:.28,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}),cover=boxes.filter(b=>b[6]!=='wall');const batch=new T.InstancedMesh(new T.PlaneGeometry(1,1),material,cover.length),matrix=new T.Matrix4(),rotation=new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),-Math.PI/2);cover.forEach((b,i)=>{matrix.compose(new T.Vector3(b[0],.007,b[2]),rotation,new T.Vector3(b[3]+1.1,b[5]+1.1,1));batch.setMatrixAt(i,matrix)});batch.computeBoundingSphere();scene.add(batch);
 scene.fog.density=.005;
}
export function characterShadow(){const c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d'),gradient=ctx.createRadialGradient(32,32,3,32,32,30);gradient.addColorStop(0,'#0009');gradient.addColorStop(1,'#0000');ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);return new T.CanvasTexture(c)}
