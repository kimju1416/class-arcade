export function reloadPhase(player,duration){
 if(!player||player.hp<=0||player.reload<=0)return null;
 const progress=Math.max(0,Math.min(1,1-player.reload/duration));
 const stage=progress<.3?0:progress<.72?1:2;
 return {progress,stage,label:['탄창 분리','새 탄창 삽입','볼트 전진'][stage],remaining:player.reload};
}
export function createCombatFeedback(audio){
 const panel=document.createElement('div');panel.id='reload-progress';panel.hidden=true;panel.innerHTML='<div><b></b><span></span></div><i><em></em></i>';document.getElementById('hud').append(panel);
 const toast=document.createElement('div');toast.id='kill-confirmation';toast.hidden=true;toast.innerHTML='<small></small><strong></strong><span></span>';document.getElementById('hud').append(toast);
 let stage=-1,weapon='',until=0,lastKill=0,chain=0,wasReloading=false,lastRemaining=0;
 return {update(p,dt){const duration=p?.weapon==='sniper'?2.6:1.8,phase=reloadPhase(p,duration);panel.hidden=!phase;
 if(phase){if(weapon!==p.weapon||!wasReloading||p.reload>lastRemaining+.1)stage=-1;weapon=p.weapon;if(stage!==phase.stage){stage=phase.stage;audio.foley(['mag-out','mag-in','bolt'][stage]);}panel.querySelector('b').textContent=phase.label;panel.querySelector('span').textContent=phase.remaining.toFixed(1)+'초';panel.querySelector('em').style.transform='scaleX('+phase.progress+')';}
 else {if(wasReloading&&p?.hp>0&&p.weapon===weapon&&p.ammo===(weapon==='sniper'?5:30))audio.foley('ready');stage=-1;}wasReloading=!!phase;lastRemaining=p?.reload||0;toast.hidden=performance.now()>until;
 },kill(event){const now=performance.now();chain=now-lastKill<3500?chain+1:1;lastKill=now;until=now+1700;toast.hidden=false;toast.classList.toggle('headshot',!!event.head);toast.querySelector('small').textContent=event.head?'HEADSHOT':chain>1?chain+' 연속 처치':'ELIMINATED';toast.querySelector('strong').textContent=event.victim+' 처치';toast.querySelector('span').textContent='+1 KILL';toast.getAnimations().forEach(a=>a.cancel());toast.animate([{opacity:0,transform:'translate(-50%, 10px) scale(.9)'},{opacity:1,transform:'translate(-50%, 0) scale(1)'}],{duration:180,easing:'ease-out'});audio.foley(event.head?'headshot':'kill');},reset(){stage=-1;wasReloading=false;until=0;lastKill=0;chain=0;panel.hidden=toast.hidden=true;}};
}
