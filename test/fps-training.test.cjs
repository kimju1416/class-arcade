const assert=require('node:assert/strict'),fs=require('fs');const {Arena}=require('../fps-core.cjs');
(async()=>{
 const oldRandom=Math.random;Math.random=()=>.5;
 try{const a=new Arena('ffa'),b=a.add('bot0','BOT',true),p=a.add('p','PLAYER');Object.assign(b,{x:19,z:20,yaw:0,shield:0});Object.assign(p,{x:19,z:10,shield:0});
 for(let i=0;i<33;i++)a.step(1/30);assert.equal(p.hp,100,'easy bot must allow reaction time');
 for(let i=0;i<42;i++)a.step(1/30);assert.equal(p.hp,76,'two chest hits do 12 damage each');const hp=p.hp;
 for(let i=0;i<30;i++)a.step(1/30);assert.equal(p.hp,hp,'burst must have a recovery pause');
 }finally{Math.random=oldRandom}
 const {Recoil}=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('public/fps/recoil.js','utf8')).toString('base64'));let peaks=[];
 for(const weapon of ['rifle','sniper']){const r=new Recoil();r.shot(weapon);let peak=0;for(let i=0;i<180;i++){r.update(1/60);peak=Math.max(peak,r.pitch)}assert(peak>.009);assert(Math.abs(r.pitch)<.00001,'recoil must settle');peaks.push(peak)}assert(peaks[1]>peaks[0]*2,'sniper has stronger kick');console.log('PASS: easy bot reaction delay, chest damage and burst pause; recoil kick and recovery');
})().catch(e=>{console.error(e);process.exitCode=1});
