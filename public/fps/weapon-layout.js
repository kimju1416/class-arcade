// Measured muzzle-tip coordinates in the original 1536 x 1024 assets.
export const MUZZLES={rifle:{x:505/1536,y:210/1024},sniper:{x:550/1536,y:300/1024}};
export function weaponLayout(weapon,aspect,aim=false,reload=0,sprint=false,recoil=0){
 const anchor=MUZZLES[weapon]||MUZZLES.rifle;
 const scale=Math.min(Math.max(aspect*.94,1.45),1.85)*(aim?1.08:1)*(1+recoil*.55);
 const progress=1-reload/(weapon==='sniper'?2.6:1.8),lower=reload>0?Math.max(0,Math.min(1,progress/.14,(1-progress)/.18)):0;
 const angle=reload>0?-.35*lower+Math.sin(progress*15)*.025:sprint?-.16:recoil*.6;
 const x=(anchor.x-.5)*1.5*scale,y=(.5-anchor.y)*scale;
 // Rotation and scale pivot around the muzzle; firing always points at screen center.
 return {scale,angle,x:-(x*Math.cos(angle)-y*Math.sin(angle)),y:-(x*Math.sin(angle)+y*Math.cos(angle))-(reload>0?.65*lower:sprint?.25:0)};
}
