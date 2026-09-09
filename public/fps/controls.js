export function createControls({look,shoot,weaponChanged,pauseChanged}){
 const $=id=>document.getElementById(id);let mobile=matchMedia('(pointer: coarse)').matches||navigator.maxTouchPoints>0&&innerWidth<1100;const keys={};
 const c={mobile,keys,paused:true,enabled:false,weapon:'rifle',fire:false,aim:false,trigger:0,f:0,s:0,board:false};let reloadUntil=0,jumpUntil=0;
 document.body.classList.toggle('touch-device',mobile);
 function reset(){for(const k in keys)keys[k]=false;c.fire=false;c.f=0;c.s=0;reloadUntil=0;jumpUntil=0;$('stick-knob').style.transform='translate(-50%,-50%)'}
 function paused(value){c.paused=value;if(value)reset();pauseChanged(value)}
 c.pause=()=>{paused(true);document.exitPointerLock?.()};c.resume=()=>{if(mobile){paused(false);document.documentElement.requestFullscreen?.().catch(()=>{});screen.orientation?.lock?.('landscape').catch(()=>{})}else $('scene').requestPointerLock?.()?.catch(()=>{mobile=true;c.mobile=true;document.body.classList.add('touch-device');paused(false)})};c.reset=reset;
 c.select=value=>{c.weapon=value==='sniper'?'sniper':'rifle';$('weapon-select').value=c.weapon;$('weapon-switch').textContent=c.weapon==='sniper'?'SR-7 ↔':'AR-4 ↔';weaponChanged(c.weapon)};
 c.input=()=>{const usable=c.enabled&&!c.paused;return {cancelFire:!usable,f:usable?(mobile?c.f:Number(!!keys.KeyW)-Number(!!keys.KeyS)):0,s:usable?(mobile?c.s:Number(!!keys.KeyD)-Number(!!keys.KeyA)):0,fire:usable&&c.fire,trigger:c.trigger,reload:usable&&(keys.KeyR||performance.now()<reloadUntil),jump:usable&&(keys.Space||performance.now()<jumpUntil),sprint:usable&&!!keys.ShiftLeft,aim:c.aim,weapon:c.weapon}};
 function pressFire(){if(!c.enabled||c.paused)return;c.fire=true;c.trigger++;shoot()}
 $('touch-resume').onclick=()=>{mobile=true;c.mobile=true;document.body.classList.add('touch-device');paused(false)};
 $('weapon-select').onchange=e=>c.select(e.target.value);$('weapon-switch').onclick=()=>c.select(c.weapon==='rifle'?'sniper':'rifle');$('pause-button').onclick=()=>c.pause();
 document.addEventListener('pointerlockchange',()=>{if(!mobile&&c.enabled)paused(document.pointerLockElement!==$('scene'))});
 document.addEventListener('mousemove',e=>{if(c.enabled&&!c.paused&&!mobile)look(e.movementX,e.movementY,c.aim)});
 document.addEventListener('mousedown',e=>{if(mobile||!c.enabled||c.paused)return;if(e.button===0)pressFire();if(e.button===2)c.aim=true});document.addEventListener('mouseup',e=>{if(!mobile){if(e.button===0)c.fire=false;if(e.button===2)c.aim=false}});
 document.addEventListener('keydown',e=>{if(!c.enabled)return;if(['Tab','Space','KeyW','KeyA','KeyS','KeyD'].includes(e.code))e.preventDefault();keys[e.code]=true;if(e.code==='Digit1')c.select('rifle');if(e.code==='Digit2')c.select('sniper')});document.addEventListener('keyup',e=>keys[e.code]=false);document.addEventListener('contextmenu',e=>{if(c.enabled)e.preventDefault()});window.addEventListener('blur',()=>{if(c.enabled)c.pause()});document.addEventListener('visibilitychange',()=>{if(document.hidden&&c.enabled)c.pause()});
 let stickId=null,lookId=null,originX=0,originY=0,lastX=0,lastY=0;const stick=$('move-stick'),surface=$('look-pad');
 stick.onpointerdown=e=>{if(c.paused)return;e.preventDefault();stickId=e.pointerId;const r=stick.getBoundingClientRect();originX=r.left+r.width/2;originY=r.top+r.height/2;stick.setPointerCapture(e.pointerId);moveStick(e)};
 function moveStick(e){if(e.pointerId!==stickId)return;const x=(e.clientX-originX)/45,y=(e.clientY-originY)/45,n=Math.max(1,Math.hypot(x,y));c.s=x/n;c.f=-y/n;$('stick-knob').style.transform=`translate(calc(-50% + ${c.s*42}px),calc(-50% + ${-c.f*42}px))`}
 stick.onpointermove=moveStick;stick.onpointerup=stick.onpointercancel=stick.onlostpointercapture=()=>{stickId=null;c.f=0;c.s=0;$('stick-knob').style.transform='translate(-50%,-50%)'};
 surface.onpointerdown=e=>{if(c.paused)return;e.preventDefault();lookId=e.pointerId;lastX=e.clientX;lastY=e.clientY;surface.setPointerCapture(e.pointerId)};surface.onpointermove=e=>{if(e.pointerId!==lookId)return;look(e.clientX-lastX,e.clientY-lastY,c.aim);lastX=e.clientX;lastY=e.clientY};surface.onpointerup=surface.onpointercancel=()=>lookId=null;
 function hold(id,down,up){const el=$(id);el.onpointerdown=e=>{e.preventDefault();e.stopPropagation();el.setPointerCapture(e.pointerId);if(!c.paused)down()};el.onpointerup=el.onpointercancel=el.onlostpointercapture=()=>up?.()}
 hold('touch-fire',pressFire,()=>c.fire=false);hold('touch-aim',()=>{c.aim=!c.aim;$('touch-aim').classList.toggle('on',c.aim)});hold('touch-reload',()=>reloadUntil=performance.now()+180);hold('touch-jump',()=>jumpUntil=performance.now()+180);hold('touch-sprint',()=>keys.ShiftLeft=true,()=>keys.ShiftLeft=false);
 return c;
}
