import * as T from './three.module.js';
import {BOXES} from './core.js?v=ik-3';

// 총알이 닿은 자리의 반응 — 불똥, 먼지, 탄흔, 피격 분출.
// 모두 미리 만들어 두고 돌려 쓴다. 한 발마다 새로 만들면 연사에서 프레임이 끊긴다.

const SPARKS=150,DUSTS=14,DECALS=44;

// 맞은 지점이 어느 면인지 — 탄흔을 벽에 눕히려면 법선이 필요하다.
// 서버 판정이 BOXES와 바닥면만 쓰므로 여기서도 그 둘만 본다.
export function surfaceNormal(p,out){
 let best=.14,nx=0,ny=1,nz=0;
 if(p.y<.08){out.set(0,1,0);return out}
 for(const b of BOXES){
  const dx=Math.abs(p.x-b[0])-b[3]/2,dy=Math.abs(p.y-b[1])-b[4]/2,dz=Math.abs(p.z-b[2])-b[5]/2;
  if(dx>.14||dy>.14||dz>.14)continue;                     // 이 상자 밖
  const gap=Math.max(dx,dy,dz);
  if(gap<-.14||gap>best)continue;                          // 표면에서 먼 안쪽
  best=Math.abs(gap);
  if(dx>=dy&&dx>=dz){nx=Math.sign(p.x-b[0])||1;ny=0;nz=0}
  else if(dy>=dz){nx=0;ny=Math.sign(p.y-b[1])||1;nz=0}
  else {nx=0;ny=0;nz=Math.sign(p.z-b[2])||1}
 }
 return out.set(nx,ny,nz);
}

function softTexture(inner,outer){
 const c=document.createElement('canvas');c.width=c.height=64;
 const ctx=c.getContext('2d'),g=ctx.createRadialGradient(32,32,0,32,32,32);
 g.addColorStop(0,inner);g.addColorStop(.45,outer);g.addColorStop(1,'rgba(0,0,0,0)');
 ctx.fillStyle=g;ctx.fillRect(0,0,64,64);
 const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;return tex;
}
function holeTexture(){
 const c=document.createElement('canvas');c.width=c.height=64;
 const ctx=c.getContext('2d');
 const ring=ctx.createRadialGradient(32,32,2,32,32,30);
 ring.addColorStop(0,'rgba(6,6,8,1)');ring.addColorStop(.30,'rgba(10,9,9,.98)');
 ring.addColorStop(.44,'rgba(28,25,22,.78)');ring.addColorStop(.66,'rgba(186,176,158,.46)');ring.addColorStop(1,'rgba(186,176,158,0)');
 ctx.fillStyle=ring;ctx.beginPath();ctx.arc(32,32,32,0,7);ctx.fill();
 // 부서져 나간 잔금
 ctx.strokeStyle='rgba(24,22,20,.72)';ctx.lineWidth=2.1;
 for(let i=0;i<7;i++){const a=Math.random()*7,r=12+Math.random()*16;
  ctx.beginPath();ctx.moveTo(32,32);ctx.lineTo(32+Math.cos(a)*r,32+Math.sin(a)*r);ctx.stroke()}
 const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;return tex;
}

export function createImpacts(scene){
 // 불똥 — 점 하나짜리 입자. 위치는 GPU 버퍼, 속도·수명은 JS 배열로 따로 둔다.
 const sparkGeo=new T.BufferGeometry();
 const sparkPos=new Float32Array(SPARKS*3),sparkAlpha=new Float32Array(SPARKS);
 sparkGeo.setAttribute('position',new T.BufferAttribute(sparkPos,3));
 sparkGeo.setAttribute('aAlpha',new T.BufferAttribute(sparkAlpha,1));
 const sparkMat=new T.PointsMaterial({color:'#ffd07a',size:.055,sizeAttenuation:true,transparent:true,depthWrite:false,blending:T.AdditiveBlending,map:softTexture('rgba(255,255,235,1)','rgba(255,190,90,.75)')});
 // 개별 알파를 쓰기 위해 셰이더에 한 줄 끼워 넣는다(PointsMaterial의 기본 동작은 유지).
 // opaque_fragment가 gl_FragColor를 통째로 덮어쓰므로 그 «앞»에서 diffuseColor.a를 깎아야 한다.
 sparkMat.onBeforeCompile=s=>{
  s.vertexShader='attribute float aAlpha;varying float vA;\n'+s.vertexShader.replace('void main() {','void main() {\n vA=aAlpha;');
  s.fragmentShader='varying float vA;\n'+s.fragmentShader.replace('#include <opaque_fragment>','diffuseColor.a*=vA;\n#include <opaque_fragment>');
 };
 const sparks=new T.Points(sparkGeo,sparkMat);sparks.frustumCulled=false;sparks.renderOrder=2;scene.add(sparks);
 const sparkLife=new Float32Array(SPARKS),sparkVel=new Float32Array(SPARKS*3);let sparkAt=0;

 // 먼지·피분출 — 카메라를 늘 마주 보는 스프라이트
 const dustTex=softTexture('rgba(214,205,188,.85)','rgba(150,142,126,.45)');
 const bloodTex=softTexture('rgba(196,44,38,.9)','rgba(120,16,14,.5)');
 const dusts=[];
 for(let i=0;i<DUSTS;i++){
  const s=new T.Sprite(new T.SpriteMaterial({map:dustTex,transparent:true,depthWrite:false,opacity:0}));
  s.visible=false;scene.add(s);dusts.push({sprite:s,ttl:0,life:1,grow:1});
 }
 let dustAt=0;

 // 탄흔 — 표면에 눕혀 두는 작은 판. 오래된 것부터 재활용한다.
 const holeTex=holeTexture();
 const decalMat=new T.MeshBasicMaterial({map:holeTex,transparent:true,depthWrite:false,opacity:.9,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4});
 const decals=[];
 for(let i=0;i<DECALS;i++){
  const m=new T.Mesh(new T.PlaneGeometry(.24,.24),decalMat.clone());
  m.visible=false;m.renderOrder=1;scene.add(m);decals.push({mesh:m,ttl:0});
 }
 let decalAt=0;

 const normal=new T.Vector3(),tangent=new T.Vector3(),bitangent=new T.Vector3(),up=new T.Vector3(0,1,0),side=new T.Vector3(0,0,1);
 const basis=new T.Matrix4(),quat=new T.Quaternion();

 function spark(x,y,z,dx,dy,dz,speed,spread){
  const i=sparkAt=(sparkAt+1)%SPARKS;
  sparkPos[i*3]=x;sparkPos[i*3+1]=y;sparkPos[i*3+2]=z;
  sparkVel[i*3]=dx*speed+(Math.random()-.5)*spread;
  sparkVel[i*3+1]=dy*speed+(Math.random()-.5)*spread+.9;
  sparkVel[i*3+2]=dz*speed+(Math.random()-.5)*spread;
  sparkLife[i]=.22+Math.random()*.3;sparkAlpha[i]=1;
 }
 function puff(x,y,z,tex,size,grow,life){
  const d=dusts[dustAt=(dustAt+1)%DUSTS];
  d.sprite.material.map=tex; /* 같은 종류 텍스처끼리 바꿀 땐 needsUpdate가 필요 없다 — 매 발 재질 재평가(getParameters)를 부르던 원인 */
  d.sprite.position.set(x,y,z);d.sprite.scale.setScalar(size);
  d.sprite.visible=true;d.sprite.material.opacity=.75;
  d.ttl=d.life=life;d.grow=grow;
 }

 return {
  // point = 맞은 자리, dir = 총알이 날아온 방향, flesh = 사람을 맞혔는가
  // 멈칫 방지: 먼지·탄흔을 잠깐 켜고 «실제로 한 번 그린다». compile()만으로는 링크 확인·유니폼 준비가 첫 실사용(=첫 사격)으로 미뤄진다.
  // 로딩 중엔 메뉴가 캔버스를 가리고 있어 이 한 장은 보이지 않는다.
  prewarm(renderer,scene,camera){const on=[...dusts.map(d=>d.sprite),...decals.map(d=>d.mesh)];for(const o of on){o.visible=true;o.frustumCulled=false}try{renderer.compile(scene,camera);renderer.render(scene,camera)}catch{}for(const o of on)o.frustumCulled=true;for(const d of dusts)d.sprite.visible=d.ttl>0;for(const d of decals)d.mesh.visible=d.ttl>0},
  hit(point,dir,flesh){
   const x=point.x,y=point.y,z=point.z;
   if(flesh){
    for(let i=0;i<7;i++)spark(x,y,z,-dir.x,-dir.y,-dir.z,1.7,2.4);
    puff(x,y,z,bloodTex,.34,2.1,.34);
    return;
   }
   surfaceNormal(point,normal);
   for(let i=0;i<9;i++)spark(x+normal.x*.02,y+normal.y*.02,z+normal.z*.02,normal.x,normal.y,normal.z,2.6,3.4);
   puff(x+normal.x*.06,y+normal.y*.06,z+normal.z*.06,dustTex,.42,2.4,.42);
   // 탄흔을 표면에 눕힌다. 법선이 위쪽이면 기준축을 바꿔 뒤집힘을 막는다.
   const d=decals[decalAt=(decalAt+1)%DECALS];
   tangent.copy(Math.abs(normal.y)>.9?side:up).cross(normal).normalize();
   bitangent.copy(normal).cross(tangent).normalize();
   basis.makeBasis(tangent,bitangent,normal);
   quat.setFromRotationMatrix(basis);
   d.mesh.position.set(x+normal.x*.012,y+normal.y*.012,z+normal.z*.012);
   d.mesh.quaternion.copy(quat);d.mesh.rotateZ(Math.random()*6.28);
   const s=.8+Math.random()*.5;d.mesh.scale.set(s,s,s);
   d.mesh.visible=true;d.mesh.material.opacity=.92;d.ttl=9;
  },
  update(dt){
   let live=false;
   for(let i=0;i<SPARKS;i++){
    if(sparkLife[i]<=0){if(sparkAlpha[i]!==0){sparkAlpha[i]=0;sparkPos[i*3+1]=-999;live=true}continue}
    sparkLife[i]-=dt;live=true;
    // 알파 훅이 어떤 three 판에서 안 먹더라도 죽은 입자가 안 보이도록 맵 밖으로 치운다.
    if(sparkLife[i]<=0){sparkAlpha[i]=0;sparkPos[i*3+1]=-999;continue}
    sparkVel[i*3+1]-=11*dt;
    sparkPos[i*3]+=sparkVel[i*3]*dt;sparkPos[i*3+1]+=sparkVel[i*3+1]*dt;sparkPos[i*3+2]+=sparkVel[i*3+2]*dt;
    sparkAlpha[i]=Math.min(1,sparkLife[i]*3.4);
   }
   if(live){sparkGeo.attributes.position.needsUpdate=true;sparkGeo.attributes.aAlpha.needsUpdate=true}
   for(const d of dusts){
    if(d.ttl<=0)continue;
    d.ttl-=dt;
    if(d.ttl<=0){d.sprite.visible=false;continue}
    const t=1-d.ttl/d.life;
    d.sprite.scale.setScalar(d.sprite.scale.x+d.grow*dt*.5);
    d.sprite.material.opacity=.75*(1-t)*(1-t);
    d.sprite.position.y+=dt*.22;
   }
   for(const d of decals){
    if(d.ttl<=0)continue;
    d.ttl-=dt;
    if(d.ttl<=0){d.mesh.visible=false;continue}
    if(d.ttl<1.6)d.mesh.material.opacity=.92*(d.ttl/1.6);
   }
  },
  reset(){
   sparkLife.fill(0);sparkAlpha.fill(0);sparkGeo.attributes.aAlpha.needsUpdate=true;
   for(const d of dusts){d.ttl=0;d.sprite.visible=false}
   for(const d of decals){d.ttl=0;d.mesh.visible=false}
  }
 };
}
