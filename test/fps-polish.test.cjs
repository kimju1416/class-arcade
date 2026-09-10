const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const {mobileSprint,locomotion}=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('public/fps/movement.js','utf8')).toString('base64'));
 const moving={autoRun:true,f:1,s:0,aim:false,fire:false};
 assert(mobileSprint(moving,1000));
 for(const change of [{autoRun:false},{f:0},{f:-1},{f:.5},{aim:true},{fire:true}])assert(!mobileSprint({...moving,...change},1000));
 assert(!mobileSprint(moving,1000,1500));assert(mobileSprint(moving,1500,1500));
 for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2]){
  const forward=locomotion(-Math.sin(yaw)*3,-Math.cos(yaw)*3,yaw);
  assert(!forward.backward);assert(Math.abs(forward.turn)<1e-9);
  const back=locomotion(Math.sin(yaw)*3,Math.cos(yaw)*3,yaw);
  assert(back.backward);assert(Math.abs(back.turn)<1e-9);
 }
 assert.equal(locomotion(0,0,0).speed,0);
 assert(locomotion(3,0,0).lean<0);assert(locomotion(-3,0,0).lean>0);
 console.log('PASS: mobile auto-run, firing/aiming grace, directional forward/backward gait');
})().catch(e=>{console.error(e);process.exitCode=1});
