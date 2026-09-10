import * as T from './three.module.js';
import {weaponPose,RIGS} from './weapon-pose.js?v=real-4';

// 진짜 3D 뷰모델. 전용 씬·전용 카메라로 본편 위에 덧그리기 때문에 벽에 총이 파묻히지 않는다.

// 실사 재질 사진. 같은 그림을 요철(bumpMap)로도 써서 결이 빛을 받게 한다.
// 거울 반복이라 아무리 붙여도 이음매가 안 보인다.
const loader=typeof document!=='undefined'?new T.TextureLoader():null;
function surface(file,repeat){
 if(!loader)return null;
 const tex=loader.load(file);
 tex.colorSpace=T.SRGBColorSpace;
 tex.wrapS=tex.wrapT=T.MirroredRepeatWrapping;
 tex.repeat.set(repeat,repeat);tex.anisotropy=4;
 return tex;
}
const STEEL=surface('gun-steel.webp?v=real-4',3.4),
      POLYMER=surface('gun-polymer.webp?v=real-4',3),
      GLOVE=surface('gun-glove.webp?v=real-4',2.4);
function skin(base,tex,bump){
 if(tex){base.map=tex;base.bumpMap=tex;base.bumpScale=bump}
 return new T.MeshStandardMaterial(base);
}
const M={
 polymer:()=>skin({color:'#9a8560',roughness:.7,metalness:.05},POLYMER,.006),
 dark:()=>skin({color:'#4a5157',roughness:.58,metalness:.4},STEEL,.006),
 steel:()=>skin({color:'#8d969c',roughness:.31,metalness:.92},STEEL,.004),
 blued:()=>skin({color:'#5d666e',roughness:.28,metalness:.95},STEEL,.0045),
 glove:()=>skin({color:'#5a6349',roughness:.9,metalness:.02},GLOVE,.008),
 sleeve:()=>skin({color:'#646b4c',roughness:.95,metalness:0},GLOVE,.009),
 brass:()=>new T.MeshStandardMaterial({color:'#b8933f',roughness:.32,metalness:.9}),
 lens:()=>new T.MeshStandardMaterial({color:'#12303f',roughness:.08,metalness:.4,emissive:'#0d3550',emissiveIntensity:.5})
};

function bx(parent,mats,name,w,h,d,x,y,z,rx=0,ry=0,rz=0){
 const m=new T.Mesh(new T.BoxGeometry(w,h,d),mats[name]);m.position.set(x,y,z);m.rotation.set(rx,ry,rz);parent.add(m);return m;
}
function cy(parent,mats,name,rt,rb,len,x,y,z,axis='z',seg=12){
 const m=new T.Mesh(new T.CylinderGeometry(rt,rb,len,seg),mats[name]);
 if(axis==='z')m.rotation.x=Math.PI/2;if(axis==='x')m.rotation.z=Math.PI/2;
 m.position.set(x,y,z);parent.add(m);return m;
}

// 손·팔뚝. 총을 잡은 방향으로 소매가 화면 밖까지 이어진다.
function hand(parent,mats,x,y,z,rz,ry,elbowX,elbowY,elbowZ){
 const g=new T.Group();g.position.set(x,y,z);g.rotation.set(0,ry,rz);parent.add(g);
 bx(g,mats,'glove',.052,.072,.088,0,0,0);                       // 주먹
 for(let i=0;i<4;i++)bx(g,mats,'glove',.05,.014,.019,0,.026-i*.018,-.047,.12); // 손가락 마디
 bx(g,mats,'glove',.02,.05,.03,.03,-.006,-.03,0,0,-.5);          // 엄지
 bx(g,mats,'glove',.05,.05,.05,0,.002,.045);                     // 손등
 // 팔뚝은 총 좌표계에 직접 단다. 손의 회전을 따라가면 팔꿈치 방향이 틀어지기 때문이다.
 const sleeve=new T.Group();sleeve.position.set(x,y,z);parent.add(sleeve);
 const dir=new T.Vector3(elbowX-x,elbowY-y,elbowZ-z);
 const len=dir.length();dir.normalize();
 sleeve.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),dir);
 cy(sleeve,mats,'glove',.038,.038,.03,0,0,.045,'z',10);                      // 손목 소맷단
 cy(sleeve,mats,'sleeve',.033,.047,len,0,0,len/2+.055,'z',10);
 for(let i=1;i<4;i++){const r=.033+(.047-.033)*(i/4)+.005;cy(sleeve,mats,'glove',r,r,.014,0,0,.055+len*i/4,'z',10)} // 소매 주름
 return g;
}

function buildRifle(mats){
 const g=new T.Group(),parts={};
 // 총몸 — 위쪽 모서리를 둥글려 «상자»에서 벗어난다.
 bx(g,mats,'dark',.062,.05,.30,0,.031,-.03);                     // 상부 총몸
 cy(g,mats,'dark',.031,.031,.30,0,.056,-.03,'z',14);             // 상부 총몸 둥근 등
 bx(g,mats,'dark',.056,.052,.17,0,-.008,.035);                   // 하부 총몸
 bx(g,mats,'dark',.05,.012,.47,0,.076,-.135);                    // 상부 레일 바닥
 for(let z=-.35;z<.09;z+=.0235)bx(g,mats,'blued',.052,.016,.011,0,.086,z); // 레일 홈
 // 총열 덮개 — 팔각 관에 M-LOK 슬롯. 둥근 단면이 손맛의 절반이다.
 cy(g,mats,'polymer',.032,.032,.27,0,.03,-.27,'z',8);
 for(const side of [-1,1])for(let z=-.38;z<-.17;z+=.055)bx(g,mats,'blued',.006,.014,.036,side*.031,.03,z);
 for(let z=-.38;z<-.17;z+=.055)bx(g,mats,'blued',.014,.006,.036,0,-.0005,z);
 bx(g,mats,'blued',.04,.011,.27,0,.056,-.27);                    // 덮개 위 레일 이음
 cy(g,mats,'blued',.0125,.0125,.055,0,.03,-.415,'z',12);         // 총열 노출부
 cy(g,mats,'blued',.0105,.0105,.14,0,.03,-.49,'z',12);           // 가늘어진 총열
 // 소염기 — 포트를 뚫어 실루엣을 깬다.
 cy(g,mats,'steel',.019,.0205,.058,0,.03,-.575,'z',12);
 for(let i=0;i<3;i++)for(const s of [-1,1])bx(g,mats,'dark',.006,.03,.011,s*.014,.038,-.588+i*.019,0,0,s*.3);
 cy(g,mats,'dark',.013,.013,.062,0,.03,-.575,'z',10);            // 소염기 안쪽 구멍
 bx(g,mats,'blued',.028,.026,.036,0,.052,-.40);                  // 가스 블록
 cy(g,mats,'blued',.0065,.0065,.30,0,.049,-.30,'z',8);           // 가스관
 // 접어 둔 기계식 가늠쇠 — 실제 조준은 위의 도트 사이트로 한다.
 bx(g,mats,'blued',.028,.026,.012,0,.087,-.397);
 cy(g,mats,'steel',.0032,.0032,.022,0,.076,-.397,'y',6);
 // 도트 사이트. 광축(붉은 점)이 RIGS.rifle.sight.y 높이에 정확히 있어야 정조준이 맞는다.
 const dotY=RIGS.rifle.sight.y;
 bx(g,mats,'blued',.03,.028,.05,0,dotY-.039,-.06);                // 마운트 받침
 bx(g,mats,'blued',.042,.008,.058,0,dotY-.025,-.06);              // 하판
 for(const s of [-1,1])bx(g,mats,'blued',.005,.036,.056,s*.019,dotY-.004,-.06); // 좌우 기둥
 bx(g,mats,'blued',.042,.006,.058,0,dotY+.017,-.06);              // 상판
 const glass=new T.Mesh(new T.PlaneGeometry(.032,.03),new T.MeshBasicMaterial({color:'#7ec8e8',transparent:true,opacity:.16,depthWrite:false,side:T.DoubleSide}));
 glass.position.set(0,dotY-.003,-.078);g.add(glass);
 const dot=new T.Mesh(new T.CircleGeometry(.0022,10),new T.MeshBasicMaterial({color:'#ff3b30',transparent:true,opacity:.95,depthTest:false,depthWrite:false,blending:T.AdditiveBlending}));
 dot.position.set(0,dotY,-.079);dot.renderOrder=3;g.add(dot);
 const halo=new T.Mesh(new T.CircleGeometry(.006,12),new T.MeshBasicMaterial({color:'#ff2a20',transparent:true,opacity:.3,depthTest:false,depthWrite:false,blending:T.AdditiveBlending}));
 halo.position.set(0,dotY,-.0785);halo.renderOrder=2;g.add(halo);
 // 탄창 — 두 토막을 살짝 꺾어 곡선을 흉내낸다.
 const mag=new T.Group();mag.position.set(RIGS.rifle.mag.x,RIGS.rifle.mag.y,RIGS.rifle.mag.z);g.add(mag);parts.mag=mag;
 bx(mag,mats,'polymer',.038,.062,.055,0,.026,.004,.06);
 bx(mag,mats,'polymer',.037,.055,.053,0,-.028,-.006,.17);
 bx(mag,mats,'polymer',.036,.05,.05,0,-.078,-.024,.29);
 bx(mag,mats,'dark',.04,.011,.056,0,-.106,-.034,.29);
 for(let i=0;i<3;i++)bx(mag,mats,'blued',.04,.005,.052,0,.002-i*.026,-.002-i*.008,.17);
 // 탄창실 — 앞으로 살짝 기울어야 탄창 각도와 맞는다.
 bx(g,mats,'dark',.05,.062,.062,0,-.042,.008,.09);
 bx(g,mats,'blued',.054,.008,.066,0,-.012,.006,.09);             // 탄창실 테두리
 bx(g,mats,'blued',.008,.016,.016,.03,-.03,.036);                // 탄창 멈치 단추
 bx(g,mats,'blued',.008,.02,.012,-.03,-.024,.036);               // 노리쇠 멈치
 bx(g,mats,'blued',.01,.012,.012,.031,-.004,.062,0,0,.6);        // 안전장치 레버
 // 손잡이 — 손가락 홈을 내면 «막대»가 아니게 된다.
 bx(g,mats,'dark',.036,.10,.05,0,-.078,.084,.31);
 for(let i=0;i<3;i++)cy(g,mats,'blued',.005,.005,.038,0,-.048-i*.026,.063+i*.009,'x',6);
 bx(g,mats,'dark',.036,.022,.042,0,-.128,.098,.31);              // 손잡이 밑동
 // 방아쇠울 — 둥근 앞테
 bx(g,mats,'dark',.028,.008,.06,0,-.044,.05);
 bx(g,mats,'dark',.028,.03,.008,0,-.03,.079);
 cy(g,mats,'dark',.018,.018,.028,0,-.032,.026,'x',12);
 bx(g,mats,'steel',.008,.023,.007,0,-.03,.046,-.22);             // 방아쇠
 // 개머리판 — 버퍼튜브에 얹혀 뒤로 갈수록 가늘어진다.
 cy(g,mats,'blued',.021,.021,.16,0,.012,.16,'z',12);             // 버퍼튜브
 for(let z=.10;z<.235;z+=.026)cy(g,mats,'dark',.0235,.0235,.008,0,.012,z,'z',12); // 조절 홈
 bx(g,mats,'dark',.046,.062,.11,0,-.004,.205);                   // 개머리판 몸통
 bx(g,mats,'dark',.05,.028,.09,0,.032,.196);                     // 뺨 받침
 bx(g,mats,'dark',.05,.082,.016,0,-.008,.262,-.09);              // 개머리판 고무
 bx(g,mats,'dark',.03,.03,.062,0,-.046,.19,.24);                 // 아래 지지대
 // 장전 손잡이 — 볼트 동작 때 뒤로 당겨진다.
 const bolt=new T.Group();bolt.position.set(0,.062,.093);g.add(bolt);parts.bolt=bolt;
 bx(bolt,mats,'steel',.056,.016,.042,0,0,0);
 bx(bolt,mats,'steel',.016,.014,.03,.03,0,.02);
 bx(g,mats,'blued',.004,.03,.07,.032,.036,-.02);                 // 탄피 배출구 덮개
 hand(g,mats,.032,-.088,.085,-.22,.12,.19,-.30,.30);             // 오른손
 hand(g,mats,-.03,-.02,-.26,.34,-.16,-.20,-.30,-.10);            // 왼손
 return {group:g,parts,muzzle:new T.Vector3(0,.03,-.585)};
}

function buildSniper(mats){
 const g=new T.Group(),parts={};
 bx(g,mats,'dark',.058,.058,.36,0,.03,-.02);                     // 총몸
 bx(g,mats,'polymer',.066,.05,.30,0,-.004,-.30);                 // 총열 덮개
 cy(g,mats,'blued',.0135,.0135,.42,0,.026,-.60,'z',12);          // 긴 총열
 for(let z=-.50;z<-.36;z+=.035)cy(g,mats,'blued',.017,.017,.01,0,.026,z,'z',10); // 방열 홈
 cy(g,mats,'steel',.022,.022,.07,0,.026,-.83,'z',12);            // 소염기
 // 조준경 — 광축 중심이 RIGS.sniper.sight.y와 같아야 한다.
 const sy=RIGS.sniper.sight.y;
 cy(g,mats,'blued',.0245,.0245,.28,0,sy,-.11,'z',14);
 cy(g,mats,'blued',.034,.0265,.075,0,sy,-.285,'z',14);           // 대물부
 cy(g,mats,'blued',.028,.0245,.05,0,sy,.045,'z',14);             // 접안부
 cy(g,mats,'lens',.0305,.0305,.006,0,sy,-.321,'z',16);
 cy(g,mats,'lens',.0245,.0245,.006,0,sy,.068,'z',16);
 for(const z of [-.20,.0])bx(g,mats,'steel',.03,.05,.026,0,sy-.03,z);   // 마운트 링
 bx(g,mats,'steel',.018,.02,.02,.03,sy+.012,-.06);               // 영점 조절 손잡이
 bx(g,mats,'steel',.02,.018,.02,0,sy+.028,-.06);
 // 접힌 양각대
 for(const s of [-1,1]){bx(g,mats,'blued',.01,.012,.13,s*.016,-.014,-.42,0,0,s*.12);bx(g,mats,'dark',.014,.016,.03,s*.018,-.014,-.36)}
 // 탄창
 const mag=new T.Group();mag.position.set(RIGS.sniper.mag.x,RIGS.sniper.mag.y,RIGS.sniper.mag.z);g.add(mag);parts.mag=mag;
 bx(mag,mats,'dark',.04,.075,.06,0,0,0,.06);
 bx(mag,mats,'blued',.043,.012,.063,0,-.044,-.004,.06);
 // 손잡이·개머리판
 bx(g,mats,'polymer',.04,.11,.054,0,-.075,.09,.3);
 bx(g,mats,'dark',.03,.008,.064,0,-.04,.058);
 for(const s of [-1,1])bx(g,mats,'dark',.03,.03,.008,0,-.026,.058+s*.032);
 bx(g,mats,'steel',.008,.024,.008,0,-.028,.056,-.2);
 bx(g,mats,'polymer',.052,.075,.14,0,.004,.20);
 bx(g,mats,'polymer',.05,.03,.10,0,.05,.185);                    // 뺨 받침
 bx(g,mats,'dark',.054,.09,.018,0,-.004,.278);
 // 볼트 손잡이 — 사격 후 왕복한다.
 const bolt=new T.Group();bolt.position.set(.03,.042,.075);g.add(bolt);parts.bolt=bolt;
 bx(bolt,mats,'steel',.05,.016,.016,.022,0,0,0,0,.1);
 const knob=new T.Mesh(new T.SphereGeometry(.014,10,8),mats.steel);knob.position.set(.05,.002,0);bolt.add(knob);
 hand(g,mats,.034,-.086,.092,-.2,.12,.19,-.30,.31);              // 오른손
 hand(g,mats,-.03,-.052,-.30,.3,-.14,-.20,-.32,-.14);            // 왼손
 return {group:g,parts,muzzle:new T.Vector3(0,.026,-.87)};
}

export function createViewmodel3D(renderer){
 const scene=new T.Scene();
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
  // 본편 하늘을 뷰모델 씬의 반사원으로 빌려 온다. 금속이 하늘을 비춰야 «쇠»로 보인다.
  setEnvironment(tex){scene.environment=tex;scene.environmentIntensity=.55},
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
