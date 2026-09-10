// 3D 뷰모델의 자세 계산. three.js를 쓰지 않는 순수 수학이라 node에서 그대로 검사할 수 있다.
// 좌표계: 카메라가 원점에서 -Z를 본다. +X 오른쪽, +Y 위.

// sight = 그룹 원점 기준 조준선(가늠자 구멍 / 조준경 광축)의 위치. 총 모형 좌표계라 scale을 곱해야 화면 좌표가 된다.
// 정조준하면 이 점이 화면 정중앙에 오도록 그룹을 통째로 옮긴다.
// scale = 뷰모델 축소율. 실물 크기 그대로 눈앞 60cm에 두면 화면 절반을 먹는다.
// adsZ = 정조준 시 총몸 원점까지의 거리. 개머리판 끝이 카메라 바로 뒤로 빠지는 값이라야
// 어깨에 붙인 것처럼 보이고, 총몸이 화면 아래 3분의 1만 차지한다.
export const RIGS={
 rifle:{scale:.6,hip:[.115,-.115,-.55],hipRot:[.02,-.055,.03],sight:{x:0,y:.115},adsZ:-.30,adsFov:52,bob:1,kick:.075,rise:.045,mag:{x:0,y:-.085,z:.015}},
 sniper:{scale:.6,hip:[.112,-.122,-.58],hipRot:[.025,-.05,.035],sight:{x:0,y:.108},adsZ:-.30,adsFov:26,bob:.8,kick:.14,rise:.085,mag:{x:0,y:-.07,z:.03}}
};
export const RELOAD_STAGES=[.3,.72];
export const clamp01=n=>n<0?0:n>1?1:n;
const mix=(a,b,t)=>a+(b-a)*t;
// 0에서 1로 갔다가 0으로 돌아오는 종 모양. 볼트처럼 «당겼다 놓는» 한순간 동작에 쓴다.
const bell=(t,rise,fall)=>t<rise?clamp01(t/rise):clamp01(1-(t-rise)/fall);
// 올라가서 «머물다가» 내려오는 사다리꼴. 재장전처럼 동작 내내 자세를 유지해야 할 때 쓴다.
const hold=(t,rise,fall)=>t<rise?clamp01(t/rise):t>1-fall?clamp01((1-t)/fall):1;

// 재장전 진행도를 세 단계로 나눈다. combat-feedback.js의 단계 구분과 같은 경계를 쓴다.
export function reloadMotion(progress){
 const p=clamp01(progress),[a,b]=RELOAD_STAGES;
 const stage=p<a?0:p<b?1:2;
 // 탄창: 1단계에서 아래로 빠지고, 2단계에서 다시 올라와 물린다.
 const drop=stage===0?clamp01(p/a):stage===1?1-clamp01((p-a)/(b-a)):0;
 // 볼트: 3단계에서 한 번 당겼다 놓는다.
 const bolt=stage===2?bell(clamp01((p-b)/(1-b)),.45,.55):0;
 // 총 전체를 눕히는 양. 시작에 빠르게 눕고, 재장전 내내 눕은 채로 있다가, 끝에 돌아온다.
 const tilt=hold(p,.16,.26);
 return {stage,drop,bolt,tilt};
}

// 저격총 볼트 조작(사격 후 재사격 대기) 진행도 → 손잡이 왕복
export function boltCycle(progress){return bell(clamp01(progress),.4,.6)}

export function weaponPose(weapon,s={}){
 const rig=RIGS[weapon]||RIGS.rifle;
 const aim=clamp01(s.aim||0),sprint=clamp01(s.sprint||0),reloading=!!s.reloading;
 const reload=reloading?reloadMotion(s.reload||0):{stage:-1,drop:0,bolt:0,tilt:0};
 const bolt=Math.max(reload.bolt,boltCycle(s.bolt||0));
 // 정조준하면 조준선이 화면 중앙으로. 재장전·달리기 중에는 정조준이 풀린다.
 const held=aim*(1-reload.tilt)*(1-sprint),scale=rig.scale||1;
 let x=mix(rig.hip[0],-rig.sight.x*scale,held);
 let y=mix(rig.hip[1],-rig.sight.y*scale,held);
 let z=mix(rig.hip[2],rig.adsZ,held);
 let rx=rig.hipRot[0]*(1-held),ry=rig.hipRot[1]*(1-held),rz=rig.hipRot[2]*(1-held);
 // 걸음 흔들림: 가로는 한 주기, 세로는 두 주기라 8자를 그린다. 정조준하면 거의 멈춘다.
 const bobAmount=clamp01(s.bobAmount||0)*rig.bob*(1-held*.86);
 x+=Math.sin(s.bobPhase||0)*.019*bobAmount;
 y+=Math.sin((s.bobPhase||0)*2)*.011*bobAmount;
 rz+=Math.sin(s.bobPhase||0)*.028*bobAmount;
 // 시선을 돌리면 총이 뒤따라온다(관성). sway는 -1~1로 정규화된 값이 들어온다.
 const swayX=clamp01(Math.abs(s.sway?.x||0))*Math.sign(s.sway?.x||0),swayY=clamp01(Math.abs(s.sway?.y||0))*Math.sign(s.sway?.y||0);
 const swayScale=1-held*.7;
 x+=swayX*.045*swayScale;y+=swayY*.035*swayScale;
 ry+=swayX*.09*swayScale;rx+=swayY*.07*swayScale;rz+=-swayX*.12*swayScale;
 // 반동: 뒤로 밀리고 총구가 들리며 살짝 비틀린다.
 const kick=clamp01(s.kick||0);
 z+=kick*rig.kick*(1-held*.45);
 y+=kick*rig.kick*.28;
 rx+=kick*rig.rise*(1-held*.4);
 rz+=(s.roll||0)*kick;
 // 재장전: 총을 왼쪽 아래로 눕혀 탄창이 보이게 한다.
 x-=reload.tilt*.055;y-=reload.tilt*.085;z+=reload.tilt*.05;
 rx+=reload.tilt*.34;rz+=reload.tilt*.62;ry+=reload.tilt*.22;
 // 볼트를 당기는 동안 총이 살짝 흔들린다.
 rz+=bolt*.05;y-=bolt*.008;
 // 달리기: 총을 내리고 안쪽으로 눕힌다.
 x+=sprint*.045;y-=sprint*.075;z+=sprint*.03;
 rx+=sprint*.16;ry+=sprint*.42;rz-=sprint*.5;
 // 점프·착지: 상하 속도를 반대로 받아 총이 늦게 따라온다.
 y-=clamp01(Math.abs(s.air||0))*Math.sign(s.air||0)*.05;
 return {
  pos:[x,y,z],rot:[rx,ry,rz],
  mag:reload.drop,bolt,tilt:reload.tilt,stage:reload.stage,
  aimT:held,fov:mix(0,1,held),
  // 정조준·재장전·달리기 중에는 총구 화염을 가린다(총구가 화면 밖이거나 가려진 상태).
  flash:!reloading&&sprint<.5
 };
}

// 정조준 시야각. 저격총은 배율경이라 훨씬 좁다.
export function weaponFov(weapon,base,aimT,scoped){
 const rig=RIGS[weapon]||RIGS.rifle;
 return scoped?rig.adsFov:mix(base,rig.adsFov+(weapon==='sniper'?26:0),clamp01(aimT));
}
