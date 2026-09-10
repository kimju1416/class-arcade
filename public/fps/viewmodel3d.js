import {realWeapon} from './weapon-model.js?v=photo-4';
import * as T from './three.module.js';
import {weaponPose,RIGS} from './weapon-pose.js?v=photo-4';

// 진짜 3D 뷰모델. 전용 씬·전용 카메라로 본편 위에 덧그리기 때문에 벽에 총이 파묻히지 않는다.

// 전술장갑 원단 사진. 같은 그림을 요철로도 써서 짜임이 빛을 받는다.
let fabricTex=null;
if(typeof document!=='undefined'){
 fabricTex=new T.TextureLoader().load('glove-fabric.webp?v=photo-4');
 fabricTex.colorSpace=T.SRGBColorSpace;
 fabricTex.wrapS=fabricTex.wrapT=T.MirroredRepeatWrapping;
 fabricTex.repeat.set(3.2,3.2);fabricTex.anisotropy=4;
}
function fabric(color,bump){
 const m=new T.MeshStandardMaterial({color,roughness:.93,metalness:.02,side:T.DoubleSide});
 if(fabricTex){m.map=fabricTex;m.bumpMap=fabricTex;m.bumpScale=bump}
 return m;
}

const M={
 polymer:()=>new T.MeshStandardMaterial({color:'#9c8869',roughness:.74,metalness:.06}),
 dark:()=>new T.MeshStandardMaterial({color:'#343a3e',roughness:.58,metalness:.18}),
 steel:()=>new T.MeshStandardMaterial({color:'#5b6165',roughness:.34,metalness:.88}),
 blued:()=>new T.MeshStandardMaterial({color:'#414850',roughness:.28,metalness:.92}),
 glove:()=>fabric('#333a35',.006),
 sleeve:()=>fabric('#41473a',.008),
 brass:()=>new T.MeshStandardMaterial({color:'#b8933f',roughness:.32,metalness:.9}),
 lens:()=>new T.MeshStandardMaterial({color:'#12303f',roughness:.08,metalness:.4,emissive:'#0d3550',emissiveIntensity:.5})
};

function roundedBox(w,h,d){
 const radius=Math.min(w,h,d)*.20,shape=new T.Shape(),x=-w/2+radius,y=-h/2+radius,ww=w-2*radius,hh=h-2*radius;
 shape.moveTo(x,y);shape.lineTo(x+ww,y);shape.lineTo(x+ww,y+hh);shape.lineTo(x,y+hh);shape.closePath();
 const geo=new T.ExtrudeGeometry(shape,{depth:Math.max(.001,d-2*radius),bevelEnabled:true,bevelThickness:radius,bevelSize:radius,bevelSegments:3,steps:1,curveSegments:4});geo.translate(0,0,-d/2+radius);return geo;
}
function bx(parent,mats,name,w,h,d,x,y,z,rx=0,ry=0,rz=0){
 const m=new T.Mesh(roundedBox(w,h,d),mats[name]);m.position.set(x,y,z);m.rotation.set(rx,ry,rz);parent.add(m);return m;
}
function cy(parent,mats,name,rt,rb,len,x,y,z,axis='z',seg=24){
 const m=new T.Mesh(new T.CylinderGeometry(rt,rb,len,seg),mats[name]);
 if(axis==='z')m.rotation.x=Math.PI/2;if(axis==='x')m.rotation.z=Math.PI/2;
 m.position.set(x,y,z);parent.add(m);return m;
}

// 손가락 한 개. 마디 셋을 이어 붙이고 관절마다 꺾어 «감아쥔» 모양을 만든다.
// 손바닥은 -X를 보고 있으므로, 마디는 -Z로 뻗다가 +Y축을 중심으로 돌면 손바닥 쪽으로 말린다.
function finger(parent,mat,y,scale,bend){
 const root=new T.Group();root.position.set(0,y,-.021);parent.add(root);
 const knuckle=new T.Mesh(new T.SphereGeometry(.0092*scale,12,9),mat);root.add(knuckle);
 const seg=(host,radius,length,angle)=>{
  host.rotation.y=angle;
  const bone=new T.Mesh(new T.CapsuleGeometry(radius,length,5,14),mat);
  bone.rotation.x=Math.PI/2;bone.position.z=-(length/2+radius*.35);host.add(bone);
  const next=new T.Group();next.position.z=-(length+radius*.5);host.add(next);return next;
 };
 const mid=seg(root,.0088*scale,.027*scale,bend[0]);        // 첫마디
 const tip=seg(mid,.0079*scale,.020*scale,bend[1]);         // 중간마디
 const end=seg(tip,.0070*scale,.014*scale,bend[2]);         // 끝마디
 const nail=new T.Mesh(new T.SphereGeometry(.0066*scale,10,8),mat);end.add(nail);
 return root;
}
// 총을 감아쥔 장갑 낀 손. 손바닥이 -X를 보고, 손가락이 그 쪽으로 말린다.
// 왼손은 mirror로 X를 뒤집어 만든다 — 오른손을 그대로 쓰면 손바닥이 총 반대편을 본다.
function gripHand(parent,mats,pos,rot,elbow,tight=1,mirror=false){
 const [x,y,z]=pos;
 const g=new T.Group();g.position.set(x,y,z);g.rotation.set(rot[0],rot[1],rot[2]);
 if(mirror)g.scale.x=-1;
 parent.add(g);
 const mat=mats.glove;
 // 손바닥 — 공이 아니라 납작한 판이라야 손처럼 보인다.
 const palm=new T.Mesh(roundedBox(.027,.081,.049),mat);palm.position.set(0,0,-.002);g.add(palm);
 const thenar=new T.Mesh(new T.SphereGeometry(1,14,10),mat);thenar.scale.set(.015,.026,.023);thenar.position.set(.009,-.024,-.006);g.add(thenar); // 엄지두덩
 const back=new T.Mesh(roundedBox(.017,.072,.040),mat);back.position.set(-.007,.002,-.004);g.add(back);                                            // 손등
 // 검지에서 새끼로 갈수록 짧아지고, 쥐는 각도도 조금씩 달라진다.
 const spread=[.0265,.0095,-.0085,-.0245],scale=[1,1.04,.97,.86];
 for(let i=0;i<4;i++)finger(g,mat,spread[i],scale[i],[.86*tight+i*.03,1.12*tight,.72*tight]);
 // 엄지 — 앞으로 넘어와 검지 쪽을 누른다.
 const thumbRoot=new T.Group();thumbRoot.position.set(.010,-.030,-.004);thumbRoot.rotation.set(.35,-.55*tight,-.75);g.add(thumbRoot);
 const t1=new T.Mesh(new T.CapsuleGeometry(.0105,.024,5,14),mat);t1.rotation.x=Math.PI/2;t1.position.z=-.016;thumbRoot.add(t1);
 const t2g=new T.Group();t2g.position.z=-.030;t2g.rotation.y=.62*tight;thumbRoot.add(t2g);
 const t2=new T.Mesh(new T.CapsuleGeometry(.0092,.018,5,14),mat);t2.rotation.x=Math.PI/2;t2.position.z=-.012;t2g.add(t2);
 const t3=new T.Mesh(new T.SphereGeometry(.0085,10,8),mat);t3.position.z=-.024;t2g.add(t3);
 // 손목 — 손과 소매를 이어 준다.
 cy(g,mats,'glove',.019,.021,.026,-.001,-.002,.028,'z',18);
 // 팔뚝은 총 좌표계에 직접 단다. 손의 회전을 따라가면 팔꿈치 방향이 틀어지기 때문이다.
 const [elbowX,elbowY,elbowZ]=elbow;
 const sleeve=new T.Group();sleeve.position.set(x,y,z);parent.add(sleeve);
 const dir=new T.Vector3(elbowX-x,elbowY-y,elbowZ-z);
 const len=dir.length();dir.normalize();
 sleeve.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),dir);
 cy(sleeve,mats,'glove',.027,.029,.028,0,0,.042,'z',20);                     // 손목 소맷단
 cy(sleeve,mats,'sleeve',.044,.028,len,0,0,len/2+.052,'z',20);                // 팔뚝
 for(let i=1;i<4;i++){const r=.029+(.044-.029)*(i/4)+.004;cy(sleeve,mats,'glove',r,r,.012,0,0,.052+len*i/4,'z',12)} // 소매 주름
 return g;
}

// 사진 팔. 빠나나로 뽑은 실사 장갑 팔을, 마젠타 배경을 «미리» 지워 진짜 알파로 구웠다
// (남은 자주색 0픽셀 확인). 예전 스프라이트는 이걸 실시간 셰이더로 하다 테두리가 남았다.
// 총 그룹 안에 두므로 흔들림·반동·재장전 기울기를 그대로 따라간다.
const armTex={};
// anchor = 사진 속 주먹 자리(0~1, 왼쪽 위 기준). 판을 그 점이 원점이 되게 옮겨 두므로,
// pos에 주먹이 오고 판을 키워도 주먹은 제자리다. 사진에 조명이 구워져 있어 무조명·톤매핑 제외.
function photoArm(parent,file,w,h,anchor,pos,rot){
 if(typeof document==='undefined')return null;
 let tex=armTex[file];
 if(!tex){tex=armTex[file]=new T.TextureLoader().load(file+'?v=photo-4');tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=4}
 const mat=new T.MeshBasicMaterial({map:tex,transparent:true,alphaTest:.02,side:T.DoubleSide,toneMapped:false,color:'#cfcfc8'});
 const geo=new T.PlaneGeometry(w,h);geo.translate(-(anchor[0]-.5)*w,-(.5-anchor[1])*h,0);
 const arm=new T.Mesh(geo,mat);
 arm.position.set(pos[0],pos[1],pos[2]);arm.rotation.set(rot[0],rot[1],rot[2]);
 parent.add(arm);
 return arm;
}

function buildRifle(mats){
 const m=realWeapon('rifle'),g=m.group;
 const sy=RIGS.rifle.sight.y;
 bx(g,mats,'dark',.035,.05,.055,0,sy-.05,0);
 const tube=new T.Mesh(new T.CylinderGeometry(.026,.026,.066,40,1,true),new T.MeshStandardMaterial({color:'#30373a',roughness:.48,metalness:.8,side:T.DoubleSide}));tube.rotation.x=Math.PI/2;tube.position.set(0,sy,0);g.add(tube);
 for(const z of [-.034,.034]){const ring=new T.Mesh(new T.TorusGeometry(.026,.003,10,40),mats.blued);ring.position.set(0,sy,z);g.add(ring)}
 const glass=new T.Mesh(new T.CircleGeometry(.024,40),new T.MeshBasicMaterial({color:'#8dcbd5',transparent:true,opacity:.09,depthWrite:false,side:T.DoubleSide}));glass.position.set(0,sy,-.03);g.add(glass);
 const dot=new T.Mesh(new T.CircleGeometry(.0014,16),new T.MeshBasicMaterial({color:'#ff3928',depthTest:false,depthWrite:false}));dot.position.set(0,sy,-.031);dot.renderOrder=3;g.add(dot);
 // 오른팔: 사진 속 손이 권총손잡이(0,-.085,+.036)에 오고 팔뚝이 오른쪽 아래로 빠진다.
 photoArm(g,'arm-right.webp',.30,.277,[.08,.12],[.020,-.056,.034],[0,0,0]);   // 주먹을 권총손잡이 오른쪽에
 // 왼팔: 손가락이 총열덮개(0,+.03,-.25) 왼쪽 위를 감고 팔뚝이 왼쪽 아래로 빠진다.
 photoArm(g,'arm-left.webp',.46,.46,[.84,.20],[-.026,.030,-.272],[0,0,0]);   // 주먹을 총열덮개 왼쪽 위에, 소매는 화면 밖까지
 return m;
}
function buildSniper(mats){
 const m=realWeapon('sniper'),g=m.group,sy=RIGS.sniper.sight.y;
 // Scoped precision variant of the imported receiver, with a free-floating long barrel.
 cy(g,mats,'blued',.0125,.0125,.29,0,.03,-.715,'z',32);
 cy(g,mats,'steel',.021,.021,.045,0,.03,-.85,'z',32);
 cy(g,mats,'blued',.024,.024,.28,0,sy,-.11,'z',40);
 cy(g,mats,'blued',.035,.024,.075,0,sy,-.285,'z',40);
 cy(g,mats,'blued',.030,.025,.06,0,sy,.05,'z',40);
 cy(g,mats,'lens',.031,.031,.003,0,sy,-.324,'z',40);
 cy(g,mats,'lens',.026,.026,.003,0,sy,.081,'z',40);
 for(const z of [-.20,0]){cy(g,mats,'dark',.027,.027,.018,0,sy,z,'z',32);bx(g,mats,'dark',.025,.045,.024,0,sy-.035,z)}
 cy(g,mats,'blued',.013,.013,.018,0,sy+.033,-.06,'y',24);
 cy(g,mats,'blued',.012,.012,.018,.033,sy,-.06,'x',24);
 photoArm(g,'arm-right.webp',.30,.277,[.08,.12],[.020,-.056,.034],[0,0,0]);   // 주먹을 권총손잡이 오른쪽에
 photoArm(g,'arm-left.webp',.46,.46,[.84,.20],[-.026,.028,-.322],[0,0,0]);   // 긴 총열이라 왼손을 더 앞으로
 return m;
}

export function createViewmodel3D(renderer){
 const scene=new T.Scene();const env=new T.TextureLoader().load('sky-depot.webp');env.mapping=T.EquirectangularReflectionMapping;env.colorSpace=T.SRGBColorSpace;scene.environment=env;scene.environmentIntensity=.85;
 const camera=new T.PerspectiveCamera(45,1,.01,6);
 // 뷰모델 전용 조명. 본편 밝기와 무관하게 총이 항상 또렷하게 읽힌다.
 scene.add(new T.HemisphereLight('#d6e6f7','#3a3b33',2.3));
 const key=new T.DirectionalLight('#fff2d8',3.6);key.position.set(-.6,1,.75);scene.add(key);
 const rim=new T.DirectionalLight('#9dc3e8',1.9);rim.position.set(.9,.25,-.8);scene.add(rim);
 const mats={};for(const k in M)mats[k]=M[k]();
 const rifle=buildRifle(mats),sniper=buildSniper(mats),models={rifle,sniper};
 for(const [k,m] of Object.entries(models)){m.group.visible=false;m.group.scale.setScalar(RIGS[k].scale);scene.add(m.group)}

 // 총구 화염과 섬광. 화염은 두 장을 교차시켜 어느 각도에서도 두께가 보인다.
 const flash=new T.Group();flash.visible=false;flash.renderOrder=5;scene.add(flash);
 // depthTest를 끈다 — 화염 중심이 소염기 안쪽이라 깊이검사를 켜면 총열에 가려 안 보인다.
 const flashMat=new T.MeshBasicMaterial({color:'#ffdf9c',transparent:true,opacity:.9,depthTest:false,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending});
 const core=new T.Mesh(new T.ConeGeometry(.026,.10,7),flashMat);core.rotation.x=Math.PI/2;core.position.z=-.045;flash.add(core);
 // 판때기를 그냥 겹치면 «흰 네모»가 된다. 가장자리가 사라지는 방사형 무늬를 그려 넣는다.
 const burst=document.createElement('canvas');burst.width=burst.height=128;
 const bc=burst.getContext('2d');
 const grad=bc.createRadialGradient(64,64,0,64,64,64);
 grad.addColorStop(0,'rgba(255,255,240,1)');grad.addColorStop(.22,'rgba(255,226,150,.85)');
 grad.addColorStop(.55,'rgba(255,168,60,.28)');grad.addColorStop(1,'rgba(255,140,40,0)');
 bc.fillStyle=grad;bc.fillRect(0,0,128,128);
 bc.globalCompositeOperation='lighter';bc.strokeStyle='rgba(255,236,180,.55)';bc.lineCap='round';
 for(let i=0;i<6;i++){const a=i*Math.PI/3+.4,r=44+Math.random()*18;bc.lineWidth=5-i%2*2;bc.beginPath();bc.moveTo(64,64);bc.lineTo(64+Math.cos(a)*r,64+Math.sin(a)*r);bc.stroke()}
 const burstTex=new T.CanvasTexture(burst);burstTex.colorSpace=T.SRGBColorSpace;
 const petalMat=new T.MeshBasicMaterial({map:burstTex,transparent:true,opacity:.9,depthTest:false,depthWrite:false,blending:T.AdditiveBlending});
 for(const r of [0,Math.PI/2]){const petal=new T.Mesh(new T.PlaneGeometry(.115,.115),petalMat);petal.rotation.z=r;flash.add(petal)}
 const flashLight=new T.PointLight('#ffcf87',0,1.2,2);scene.add(flashLight);

 // 탄피. 미리 만들어 두고 돌려 쓴다.
 const shellGeo=new T.CylinderGeometry(.0045,.005,.024,7),shells=[];
 for(let i=0;i<10;i++){const m=new T.Mesh(shellGeo,mats.brass);m.visible=false;scene.add(m);shells.push({mesh:m,ttl:0,v:new T.Vector3(),spin:new T.Vector3()})}
 let shellIndex=0;

 const state={aim:0,sprint:0,bob:0,bobPhase:0,kick:0,kickV:0,roll:0,sway:{x:0,y:0},air:0,bolt:0,weapon:'rifle'};
 let flashTime=0;
 const pos=new T.Vector3(),ejectOffset=new T.Vector3();

 return {
  ready:true,
  // 사격 순간: 반동을 밀어 넣고 화염·탄피를 낸다.
  shot(weapon='rifle'){
   state.kickV+=weapon==='sniper'?7.4:4.3;
   state.roll=(Math.random()-.5)*.9;
   flashTime=weapon==='sniper'?.075:.058;
   if(weapon==='sniper')state.bolt=1;
   const model=models[weapon]||models.rifle,s=shells[shellIndex=(shellIndex+1)%shells.length];
   s.mesh.position.copy(ejectOffset.set(.032,.055,.02).multiplyScalar(model.group.scale.x).applyEuler(model.group.rotation)).add(model.group.position);
   s.mesh.visible=true;s.ttl=.85;
   s.v.set(.9+Math.random()*.5,.5+Math.random()*.4,.5+Math.random()*.4);
   s.spin.set(Math.random()*16-8,Math.random()*16-8,Math.random()*16-8);
  },
  reset(){state.kick=state.kickV=state.bolt=state.aim=state.sprint=state.bob=0;for(const s of shells){s.ttl=0;s.mesh.visible=false}},
  // 매 프레임 호출. p는 서버 상태의 내 플레이어, ctx는 지금 입력 상황.
  render(p,dt,ctx){
   const aspect=innerWidth/innerHeight;
   if(camera.aspect!==aspect){camera.aspect=aspect;camera.updateProjectionMatrix()}
   for(const s of shells){if(s.ttl<=0)continue;s.ttl-=dt;if(s.ttl<=0){s.mesh.visible=false;continue}
    s.v.y-=5.2*dt;s.mesh.position.addScaledVector(s.v,dt);
    s.mesh.rotation.x+=s.spin.x*dt;s.mesh.rotation.y+=s.spin.y*dt;s.mesh.rotation.z+=s.spin.z*dt}
   if(!p||p.hp<=0||ctx.scoped){for(const m of Object.values(models))m.group.visible=false;flash.visible=false;flashLight.intensity=0;
    if(shells.some(s=>s.ttl>0)){const auto=renderer.autoClear;renderer.autoClear=false;renderer.clearDepth();renderer.render(scene,camera);renderer.autoClear=auto}
    return}
   const weapon=models[p.weapon]?p.weapon:'rifle';
   for(const k in models)models[k].group.visible=k===weapon;
   const model=models[weapon],rig=RIGS[weapon];
   // 상태 보간 — 정조준·달리기·걸음 흔들림
   const smooth=(now,target,speed)=>now+(target-now)*(1-Math.exp(-speed*dt));
   state.aim=smooth(state.aim,ctx.aim?1:0,weapon==='sniper'?13:17);
   state.sprint=smooth(state.sprint,ctx.sprint&&!ctx.aim?1:0,11);
   state.bob=smooth(state.bob,ctx.moving?1:0,8);
   state.bobPhase+=dt*(ctx.sprint?13.5:8.6)*(ctx.moving?1:0);
   state.sway.x=smooth(state.sway.x,Math.max(-1,Math.min(1,(ctx.lookX||0)*.055)),13);
   state.sway.y=smooth(state.sway.y,Math.max(-1,Math.min(1,(ctx.lookY||0)*.055)),13);
   state.air=smooth(state.air,Math.max(-1,Math.min(1,(p.vy||0)*.18)),9);
   if(state.bolt>0)state.bolt=Math.max(0,state.bolt-dt/(weapon==='sniper'?.62:.3));
   // 반동 스프링
   state.kickV+=(-118*state.kick-16.5*state.kickV)*Math.min(dt,.033);
   state.kick=Math.max(0,Math.min(1,state.kick+state.kickV*Math.min(dt,.033)));
   state.roll*=Math.exp(-9*dt);
   const duration=weapon==='sniper'?2.6:1.8,reloading=p.reload>0;
   const pose=weaponPose(weapon,{
    aim:state.aim,sprint:state.sprint,reloading,reload:reloading?1-p.reload/duration:0,
    bobPhase:state.bobPhase,bobAmount:state.bob,sway:state.sway,
    kick:state.kick,roll:state.roll,air:state.air,bolt:state.bolt
   });
   model.group.position.set(...pose.pos);
   model.group.rotation.set(...pose.rot);
   model.parts.mag.position.y=rig.mag.y-pose.mag*.19;
   model.parts.mag.position.z=rig.mag.z+pose.mag*.03;
   model.parts.mag.rotation.x=pose.mag*.5;
   model.parts.bolt.position.z=(weapon==='sniper'?.075:.093)+pose.bolt*.055;
   // 정조준하면 총이 화면을 덜 먹도록 뷰모델 시야각을 같이 좁힌다.
   // 정조준하면 시야각을 오히려 살짝 넓혀 총몸이 화면을 덜 먹게 한다.
   const fov=45+pose.aimT*(weapon==='sniper'?4:5);
   if(Math.abs(camera.fov-fov)>.01){camera.fov=fov;camera.updateProjectionMatrix()}
   // 총구 화염
   flashTime=Math.max(0,flashTime-dt);
   const lit=flashTime>0&&pose.flash;
   flash.visible=lit;flashLight.intensity=lit?9:0;
   if(lit){
    pos.copy(model.muzzle).multiplyScalar(rig.scale).applyEuler(model.group.rotation).add(model.group.position);
    flash.position.copy(pos);flash.rotation.copy(model.group.rotation);flash.rotateZ(Math.random()*6.28);
    const size=.62+Math.random()*.42;flash.scale.setScalar(size*(1-pose.aimT*.3));
    flashLight.position.copy(pos);flashLight.intensity=9*(1-pose.aimT*.4);
   }
   const auto=renderer.autoClear;renderer.autoClear=false;renderer.clearDepth();
   renderer.render(scene,camera);renderer.autoClear=auto;
  },
  dispose(){scene.traverse(n=>{if(n.isMesh){n.geometry.dispose();n.material.dispose?.()}})}
 };
}
