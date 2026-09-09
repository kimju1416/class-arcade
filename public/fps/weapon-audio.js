// Reusable, layered weapon transients. No audio buffers allocated per shot.
export function createWeaponAudio(){
 let ctx,noise;
 function init(){ctx??=new AudioContext();if(!noise){noise=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);const d=noise.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1}if(ctx.state==='suspended')ctx.resume();}
 return {shot(weapon='rifle',volume=1){try{init();const sniper=weapon==='sniper',t=ctx.currentTime;
 function burst(delay,length,frequency,gain,type='lowpass'){const s=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();s.buffer=noise;f.type=type;f.frequency.value=frequency;g.gain.setValueAtTime(gain*volume,t+delay);g.gain.exponentialRampToValueAtTime(.0001,t+delay+length);s.connect(f);f.connect(g);g.connect(ctx.destination);s.start(t+delay,.13);s.stop(t+delay+length);s.onended=()=>{s.disconnect();f.disconnect();g.disconnect()}}
 burst(0,sniper?.09:.04,sniper?6500:4200,sniper?.25:.14,'highpass');
 burst(.006,sniper?.48:.12,sniper?1100:1700,sniper?.38:.17);
 const o=ctx.createOscillator(),g=ctx.createGain();o.frequency.setValueAtTime(sniper?130:170,t);o.frequency.exponentialRampToValueAtTime(42,t+.18);g.gain.setValueAtTime((sniper?.24:.09)*volume,t);g.gain.exponentialRampToValueAtTime(.0001,t+(sniper?.32:.1));o.connect(g);g.connect(ctx.destination);o.start(t);o.stop(t+.34);o.onended=()=>{o.disconnect();g.disconnect()};
 if(sniper){burst(.11,.36,800,.055);burst(.38,.07,2600,.07,'bandpass');burst(.64,.1,3300,.09,'bandpass');}
 }catch{}}};
}
