// Reusable, layered weapon transients. No audio buffers allocated per shot.
export function createWeaponAudio(){
 let ctx,noise,sniperBus;
 function init(){ctx??=new AudioContext();if(!noise){noise=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);const d=noise.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1}if(ctx.state==='suspended')ctx.resume();}
 // 남의 총성·발소리가 «어느 쪽에서» 났는지 들리게 한다.
 // pan은 -1(왼쪽)~1(오른쪽), muffle은 0(정면)~1(등 뒤) — 뒤쪽 소리는 고음을 깎아 둔하게 만든다.
 function placed(pan,muffle){
  if(!ctx.createStereoPanner)return null;
  const panner=ctx.createStereoPanner();
  panner.pan.value=Math.max(-1,Math.min(1,pan||0));
  panner.connect(ctx.destination);
  let input=panner;
  if(muffle>0){const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=1100+(1-Math.min(1,muffle))*9500;lp.connect(panner);input=lp}
  // 한 발이 다 울린 뒤에 끊는다. 안 끊으면 노드가 계속 쌓인다.
  setTimeout(()=>{try{input.disconnect();panner.disconnect()}catch{}},1800);
  return input;
 }
 return {foley(kind){try{init();const t=ctx.currentTime;const tap=(delay,duration,hz,level,tonal=false)=>{const gain=ctx.createGain();gain.gain.setValueAtTime(level,t+delay);gain.gain.exponentialRampToValueAtTime(.0001,t+delay+duration);gain.connect(ctx.destination);let src;if(tonal){src=ctx.createOscillator();src.type='triangle';src.frequency.value=hz;src.connect(gain);}else{src=ctx.createBufferSource();src.buffer=noise;const filter=ctx.createBiquadFilter();filter.type='bandpass';filter.frequency.value=hz;filter.Q.value=2;src.connect(filter);filter.connect(gain);src.onended=()=>{filter.disconnect();gain.disconnect();src.disconnect()};}src.start(t+delay);src.stop(t+delay+duration);if(tonal)src.onended=()=>{gain.disconnect();src.disconnect()}};
if(kind==='mag-out'){tap(0,.075,1700,.23);tap(.1,.14,600,.15)}else if(kind==='mag-in'){tap(0,.09,650,.30);tap(.055,.06,2500,.2)}else if(kind==='bolt'){tap(0,.13,3200,.2);tap(.14,.08,1800,.27)}else if(kind==='ready'){tap(0,.055,1500,.12)}else{tap(0,.09,kind==='headshot'?1400:1050,.14,true);tap(.085,.15,kind==='headshot'?1900:1500,.1,true)}
}catch{}},
 // 발소리. 내 발소리는 가운데서, 남의 발소리는 방향을 실어 낸다.
 step(volume=1,pan=0,muffle=0){try{init();const t=ctx.currentTime,out=placed(pan,muffle)||ctx.destination;
  const s=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();
  s.buffer=noise;f.type='bandpass';f.frequency.value=430+Math.random()*260;f.Q.value=1.1;
  g.gain.setValueAtTime(.001,t);g.gain.exponentialRampToValueAtTime(Math.max(.001,.11*volume),t+.008);
  g.gain.exponentialRampToValueAtTime(.0001,t+.085);
  s.connect(f);f.connect(g);g.connect(out);s.start(t,Math.random()*1.5);s.stop(t+.09);
  s.onended=()=>{s.disconnect();f.disconnect();g.disconnect()};
 }catch{}},
 shot(weapon='rifle',volume=1,pan=0,muffle=0){try{init();const sniper=weapon==='sniper',t=ctx.currentTime;if(sniper&&!sniperBus){sniperBus=ctx.createDynamicsCompressor();sniperBus.threshold.value=-2;sniperBus.knee.value=6;sniperBus.ratio.value=10;sniperBus.attack.value=.002;sniperBus.release.value=.18;sniperBus.connect(ctx.destination)}
 // 방향이 주어지면 그쪽으로 흘린다. 내 총성(방향 없음)만 저격 압축단을 탄다.
 const positioned=(pan||muffle)?placed(pan,muffle):null;const output=positioned||(sniper?sniperBus:ctx.destination);
 function burst(delay,length,frequency,gain,type='lowpass'){const s=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();s.buffer=noise;f.type=type;f.frequency.value=frequency;g.gain.setValueAtTime(gain*volume,t+delay);g.gain.exponentialRampToValueAtTime(.0001,t+delay+length);s.connect(f);f.connect(g);g.connect(output);s.start(t+delay,.13);s.stop(t+delay+length);s.onended=()=>{s.disconnect();f.disconnect();g.disconnect()}}
 burst(0,sniper?.13:.04,sniper?4300:4200,sniper?.62:.14,'highpass');
 burst(.006,sniper?.68:.12,sniper?1400:1700,sniper?.95:.17);
 const o=ctx.createOscillator(),g=ctx.createGain();o.frequency.setValueAtTime(sniper?165:170,t);o.frequency.exponentialRampToValueAtTime(sniper?38:42,t+(sniper?.28:.18));g.gain.setValueAtTime((sniper?.66:.09)*volume,t);g.gain.exponentialRampToValueAtTime(.0001,t+(sniper?.55:.1));o.connect(g);g.connect(output);o.start(t);o.stop(t+(sniper?.58:.34));o.onended=()=>{o.disconnect();g.disconnect()};
 if(sniper){burst(.015,.5,220,.42);burst(.13,.62,850,.12);burst(.38,.07,2600,.07,'bandpass');burst(.64,.1,3300,.09,'bandpass');}
 }catch{}}};
}
