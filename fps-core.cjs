const BOXES=[[-24,3,0,2,6,52,'wall'],[24,3,0,2,6,52,'wall'],[0,3,-26,50,6,2,'wall'],[0,3,26,50,6,2,'wall'],[-10,1.6,-9,6,3.2,12,'blue'],[10,1.6,9,6,3.2,12,'red'],[9,1.6,-13,11,3.2,5,'olive'],[-9,1.6,13,11,3.2,5,'olive'],[0,1.2,0,4,2.4,5,'crate'],[-18,1,3,3,2,3,'crate'],[18,1,-3,3,2,3,'crate'],[2,1,-19,3,2,3,'crate'],[-2,1,19,3,2,3,'crate']];
const SPAWNS=[[-19,21],[19,-21],[19,21],[-19,-21],[0,22],[0,-22],[-20,0],[20,0]];
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function blocked(x,z){return Math.abs(x)>22.5||Math.abs(z)>24.5||BOXES.some(b=>Math.abs(x-b[0])<b[3]/2+.35&&Math.abs(z-b[2])<b[5]/2+.35)}
function rayBox(o,d,min,max){let lo=0,hi=100;for(let i=0;i<3;i++){if(Math.abs(d[i])<1e-8){if(o[i]<min[i]||o[i]>max[i])return Infinity;}else{let a=(min[i]-o[i])/d[i],b=(max[i]-o[i])/d[i];lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));if(hi<lo)return Infinity}}return lo}
function wallDistance(o,d){return Math.min(...BOXES.map(b=>rayBox(o,d,[b[0]-b[3]/2,b[1]-b[4]/2,b[2]-b[5]/2],[b[0]+b[3]/2,b[1]+b[4]/2,b[2]+b[5]/2])))}
const WEAPONS={rifle:{name:'AR-4',mag:30,interval:.105,reload:1.8,damage:28,head:70},sniper:{name:'SR-7',mag:5,interval:1.25,reload:2.6,damage:100,head:150}};

// Walkable 2 m grid, built once. Routes are recomputed at most once per second per bot.
const navNodes=[];for(let x=-22;x<=22;x+=2)for(let z=-24;z<=24;z+=2)if(!blocked(x,z))navNodes.push({x,z,links:[]});
function clearPath(a,b){let n=Math.ceil(Math.hypot(a.x-b.x,a.z-b.z)/.25);for(let k=1;k<=n;k++)if(blocked(a.x+(b.x-a.x)*k/n,a.z+(b.z-a.z)*k/n))return false;return true}
for(let a of navNodes)for(let b of navNodes)if(a!==b&&Math.hypot(a.x-b.x,a.z-b.z)<2.9&&clearPath(a,b))a.links.push(b);
function route(a,b){const nearest=p=>navNodes.reduce((best,n)=>Math.hypot(n.x-p.x,n.z-p.z)<Math.hypot(best.x-p.x,best.z-p.z)?n:best,navNodes[0]);const start=nearest(a),end=nearest(b),queue=[start],prev=new Map([[start,null]]);for(let i=0;i<queue.length;i++){const n=queue[i];if(n===end)break;for(const next of n.links)if(!prev.has(next)){prev.set(next,n);queue.push(next)}}if(!prev.has(end))return [];let path=[];for(let n=end;n&&n!==start;n=prev.get(n))path.push({x:n.x,z:n.z});return path.reverse();}
const brains=new WeakMap();
function botInput(p,all,mode,dt){let brain=brains.get(p);if(!brain){brain={timer:0,path:[]};brains.set(p,brain)}const target=all.filter(q=>q.id!==p.id&&q.hp>0&&(mode==='ffa'||q.team!==p.team)).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];if(!target)return {yaw:p.yaw};
 const distance=Math.hypot(target.x-p.x,target.z-p.z),visible=wallDistance([p.x,p.y,p.z],[(target.x-p.x)/Math.max(distance,.001),0,(target.z-p.z)/Math.max(distance,.001)])>distance;
 brain.timer-=dt;if(brain.timer<=0){brain.timer=.8;brain.path=visible&&clearPath(p,target)?[]:route(p,target)}while(brain.path.length&&Math.hypot(brain.path[0].x-p.x,brain.path[0].z-p.z)<.7)brain.path.shift();
 const goal=visible?target:brain.path[0]||target;const wanted=Math.atan2(p.x-goal.x,p.z-goal.z),delta=Math.atan2(Math.sin(wanted-p.yaw),Math.cos(wanted-p.yaw)),yaw=p.yaw+clamp(delta,-dt*2.4,dt*2.4);
 // Stop and shoulder the rifle when in range; turn before advancing around cover.
 return {yaw,pitch:visible?Math.atan2(target.y-p.y,distance):0,f:visible&&distance<15?0:Math.abs(delta)<.55?.65:0,s:0,fire:visible&&distance<32&&Math.abs(delta)<.08&&p.shield===0,reload:p.ammo===0,weapon:'rifle'};
}

class Arena {
 constructor(mode='tdm',bots=0){this.mode=mode;this.players={};this.time=300;this.scores=[0,0];this.events=[];this.over=false;this.restart=0;for(let i=0;i<bots;i++)this.add('bot'+i,['GHOST','VIPER','NOVA','REAPER','ECHO','FALCON'][i],true)}
 add(id,name,bot=false){let p={id,name:String(name||'ROOKIE').slice(0,16),bot,team:Object.values(this.players).filter(p=>p.team===0).length<=Object.values(this.players).filter(p=>p.team===1).length?0:1,x:0,z:0,y:1.65,vy:0,yaw:0,pitch:0,hp:100,weapon:'rifle',ammo:30,magazines:{rifle:30,sniper:5},kills:0,deaths:0,cool:0,reload:0,respawn:0,shield:2,input:{},triggerSeen:0,pendingShot:false,wasFire:false};this.players[id]=p;this.spawn(p);return p}
 spawn(p){let spots=this.mode==='tdm'?SPAWNS.filter((_,i)=>i%2===p.team):SPAWNS,s=spots[Math.floor(Math.random()*spots.length)];Object.assign(p,{x:s[0],z:s[1],yaw:Math.atan2(s[0],s[1]),y:1.65,vy:0,hp:100,ammo:WEAPONS[p.weapon].mag,magazines:{rifle:30,sniper:5},respawn:0,reload:0,cool:0,shield:2,pendingShot:false,wasFire:false})}
 input(id,i){let p=this.players[id];if(!p||!i||typeof i!=='object')return;
  const trigger=Number.isSafeInteger(i.trigger)&&i.trigger>=0?i.trigger:0;if(trigger>p.triggerSeen){p.pendingShot=true;p.triggerSeen=trigger}
  if(i.fire&&!p.wasFire)p.pendingShot=true;p.wasFire=!!i.fire;if(i.cancelFire)p.pendingShot=false;
  p.input={f:clamp(Number(i.f)||0,-1,1),s:clamp(Number(i.s)||0,-1,1),yaw:Number.isFinite(i.yaw)?i.yaw:0,pitch:clamp(Number(i.pitch)||0,-1.45,1.45),fire:!!i.fire,reload:!!i.reload,jump:!!i.jump,sprint:!!i.sprint,aim:!!i.aim,weapon:i.weapon==='sniper'?'sniper':'rifle'};
 }
 step(dt){this.events=[];if(this.over){this.restart-=dt;if(this.restart<=0){this.over=false;this.time=300;this.scores=[0,0];for(let p of Object.values(this.players)){p.kills=0;p.deaths=0;this.spawn(p)}}return}this.time-=dt;let all=Object.values(this.players);
  for(let p of all){p.cool=Math.max(0,p.cool-dt);p.shield=Math.max(0,p.shield-dt);if(p.hp<=0){p.respawn-=dt;if(p.respawn<=0)this.spawn(p);continue}
   if(p.reload>0){p.reload-=dt;if(p.reload<=0){p.ammo=WEAPONS[p.weapon].mag;p.magazines[p.weapon]=p.ammo}}
   if(p.bot)p.input=botInput(p,all,this.mode,dt);
   let i=p.input;if(i.weapon&&i.weapon!==p.weapon){p.magazines[p.weapon]=p.ammo;p.weapon=i.weapon;p.ammo=p.magazines[p.weapon];p.reload=0;p.cool=Math.max(p.cool,.35)}let weapon=WEAPONS[p.weapon];
   p.yaw=i.yaw||0;p.pitch=i.pitch||0;let f=i.f||0,s=i.s||0,n=Math.max(1,Math.hypot(f,s)),speed=i.sprint?7:4.6,dx=(-Math.sin(p.yaw)*f+Math.cos(p.yaw)*s)/n*speed*dt,dz=(-Math.cos(p.yaw)*f-Math.sin(p.yaw)*s)/n*speed*dt;
   if(!blocked(p.x+dx,p.z))p.x+=dx;if(!blocked(p.x,p.z+dz))p.z+=dz;if(i.jump&&p.y<=1.65)p.vy=5;p.vy-=15*dt;p.y=Math.max(1.65,p.y+p.vy*dt);if(p.y===1.65)p.vy=0;
   if(i.reload&&p.ammo<weapon.mag&&p.reload<=0){p.reload=weapon.reload;p.pendingShot=false}
   const wantsShot=p.weapon==='sniper'?p.pendingShot:i.fire||p.pendingShot;
   if(wantsShot&&!i.sprint&&p.cool===0&&p.reload<=0&&p.ammo>0){p.pendingShot=false;p.shield=0;p.ammo--;p.magazines[p.weapon]=p.ammo;p.cool=p.bot?.3:weapon.interval;
    let cp=Math.cos(p.pitch),d=[-Math.sin(p.yaw)*cp,Math.sin(p.pitch),-Math.cos(p.yaw)*cp],o=[p.x,p.y,p.z],nearest=wallDistance(o,d),hit=null;
    for(let q of all){if(q.id===p.id||q.hp<=0||q.shield>0||(this.mode==='tdm'&&q.team===p.team))continue;let dist=rayBox(o,d,[q.x-.34,q.y-1.65,q.z-.34],[q.x+.34,q.y+.2,q.z+.34]);if(dist<nearest){nearest=dist;hit=q}}
    this.events.push({type:'shot',id:p.id,weapon:p.weapon,o,d,distance:Math.min(nearest,100),hit:hit?.id});
    if(hit){let head=o[1]+d[1]*nearest>hit.y-.24;hit.hp=Math.max(0,hit.hp-(head?weapon.head:weapon.damage));if(!hit.hp){p.kills++;hit.deaths++;hit.respawn=3;this.scores[p.team]++;this.events.push({type:'kill',name:p.name,victim:hit.name,head,team:p.team})}}
   }
  }
  if(this.time<=0||(this.mode==='tdm'?Math.max(...this.scores)>=50:all.some(p=>p.kills>=25))){this.over=true;this.restart=8}
 }
 snapshot(){return {mode:this.mode,time:this.time,scores:this.scores,over:this.over,restart:this.restart,events:this.events,players:Object.values(this.players).map(({input,triggerSeen,pendingShot,wasFire,...p})=>p)}}
}

module.exports={Arena,BOXES,SPAWNS,blocked,rayBox,wallDistance,WEAPONS};
