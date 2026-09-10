const assert=require('node:assert/strict');const fs=require('fs');const {Arena,blocked}=require('../fps-core.cjs');
(async()=>{
 const source=fs.readFileSync('public/fps/weapon-pose.js','utf8').replace(/\?v=[a-z0-9-]+/g,'');const {weaponPose,reloadMotion,RIGS,RELOAD_STAGES}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 // 정조준을 끝까지 당기면 조준선이 화면 정중앙(x=0,y=0)에 와야 한다. 안 그러면 가늠자로 맞출 수 없다.
 for(const weapon of ['rifle','sniper']){const rig=RIGS[weapon],p=weaponPose(weapon,{aim:1});
  assert(Math.abs(p.pos[0]+rig.sight.x*rig.scale)<1e-12,weapon+' 정조준 가로 정렬');
  assert(Math.abs(p.pos[1]+rig.sight.y*rig.scale)<1e-12,weapon+' 정조준 세로 정렬');
  assert(Math.abs(p.pos[2]-rig.adsZ)<1e-12,weapon+' 정조준 거리');
  for(const r of p.rot)assert(Math.abs(r)<1e-12,weapon+' 정조준 시 총이 기울어 있으면 안 된다');
  // 재장전·달리기 중에는 정조준이 풀려야 한다. 안 그러면 탄창을 빼면서 가늠자를 보게 된다.
  assert(weaponPose(weapon,{aim:1,sprint:1}).aimT<.05,weapon+' 달리는 중엔 정조준 해제');
  assert(weaponPose(weapon,{aim:1,reloading:true,reload:.5}).aimT<.9,weapon+' 재장전 중엔 정조준 이완');
 }
 // 어떤 입력 조합에서도 총이 화면 밖으로 날아가거나 뒤집히면 안 된다.
 for(const weapon of ['rifle','sniper'])for(const aim of [0,.5,1])for(const sprint of [0,1])for(const kick of [0,1])for(const reload of [0,.15,.5,.85,1])for(const sway of [-1,0,1]){
  const p=weaponPose(weapon,{aim,sprint,kick,roll:.5,reloading:reload>0,reload,bobAmount:1,bobPhase:2.1,sway:{x:sway,y:-sway},air:sway,bolt:1});
  for(const v of p.pos)assert(Number.isFinite(v)&&Math.abs(v)<.8,weapon+' 위치 범위: '+p.pos);
  for(const v of p.rot)assert(Number.isFinite(v)&&Math.abs(v)<1.6,weapon+' 회전 범위: '+p.rot);
  assert(p.mag>=0&&p.mag<=1&&p.bolt>=0&&p.bolt<=1,'탄창·볼트 진행도는 0~1');
 }
 // 재장전 세 단계 경계가 화면 문구(combat-feedback.js)와 같아야 한다.
 assert.deepEqual([reloadMotion(0).stage,reloadMotion(RELOAD_STAGES[0]).stage,reloadMotion(RELOAD_STAGES[1]).stage,reloadMotion(1).stage],[0,1,2,2]);
 // 탄창은 1단계에 빠지고 3단계엔 물려 있어야 한다.
 assert(reloadMotion(RELOAD_STAGES[0]-.01).drop>.9,'탄창 분리 끝엔 빠져 있어야 한다');
 assert(reloadMotion(.95).drop===0,'볼트 전진 단계엔 탄창이 물려 있어야 한다');
 const arena=new Arena('ffa'),bot=arena.add('bot0','BOT',true),target=arena.add('target','TARGET');Object.assign(bot,{x:-10,z:-18,yaw:0,shield:100});Object.assign(target,{x:-10,z:1,shield:100});let travelled=0,closest=100,previous={x:bot.x,z:bot.z,yaw:bot.yaw};
 for(let i=0;i<900;i++){arena.step(1/30);assert(!blocked(bot.x,bot.z),'bot cannot enter cover');let delta=Math.atan2(Math.sin(bot.yaw-previous.yaw),Math.cos(bot.yaw-previous.yaw));assert(Math.abs(delta)<=2.4/30+1e-8,'bounded turn rate');travelled+=Math.hypot(bot.x-previous.x,bot.z-previous.z);closest=Math.min(closest,Math.hypot(bot.x-target.x,bot.z-target.z));previous={x:bot.x,z:bot.z,yaw:bot.yaw}}
 assert(travelled>10,'bot should navigate around container');assert(closest<16,'bot must reach firing range');console.log('PASS: 정조준 조준선 정렬, 자세 범위, 재장전 단계; bot cover avoidance, turn rate and navigation');
})().catch(e=>{console.error(e);process.exitCode=1});
