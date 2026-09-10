export function mobileSprint({autoRun,f,s,aim,fire},now,blockedUntil=0){
 return !!autoRun&&f>.25&&Math.hypot(f,s)>.72&&!aim&&!fire&&now>=blockedUntil;
}
export function locomotion(vx,vz,yaw){
 const speed=Math.hypot(vx,vz),forward=-Math.sin(yaw)*vx-Math.cos(yaw)*vz,side=Math.cos(yaw)*vx-Math.sin(yaw)*vz;
 const angle=speed>.15?Math.atan2(-vx,-vz)-yaw:0;
 const delta=Math.atan2(Math.sin(angle),Math.cos(angle));
 return {speed,backward:forward<-.15,turn:Math.max(-.8,Math.min(.8,forward<0?Math.atan2(Math.sin(delta+Math.PI),Math.cos(delta+Math.PI)):delta)),lean:Math.max(-.09,Math.min(.09,-side*.018))};
}
