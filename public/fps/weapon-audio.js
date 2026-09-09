// Reusable, layered weapon transients. No audio buffers allocated per shot.
export function createWeaponAudio(){
 let ctx,noise,sniperBus;
 function init(){ctx??=new AudioContext();if(!noise){noise=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);const d=noise.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1}if(ctx.state==='suspended')ctx.resume();}
 return {shot(weapon='rifle',volume=1){try{init();const sniper=weapon==='sniper',t=ctx.currentTime;if(sniper&&!sniperBus){sniperBus=ctx.createDynamicsCompressor();sniperBus.threshold.value=-4;sniperBus.knee.value=6;sniperBus.ratio.value=10;sniperBus.attack.value=.002;sniperBus.release.value=.18;sniperBus.connect(ctx.destination)}const output=sniper?sniperBus:ctx.destination;
 function burst(delay,length,frequency,gain,type='lowpass'){const s=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();s.buffer=noise;f.type=type;f.frequency.value=frequency;g.gain.setValueAtTime(gain*volume,t+delay);g.gain.exponentialRampToValueAtTime(.0001,t+delay+length);s.connect(f);f.connect(g);g.connect(output);s.start(t+delay,.13);s.stop(t+delay+length);s.onended=()=>{s.disconnect();f.disconnect();g.disconnect()}}
 burst(0,sniper?.13:.04,sniper?4300:4200,sniper?.46:.14,'highpass');
 burst(.006,sniper?.68:.12,sniper?1400:1700,sniper?.70:.17);
 const o=ctx.createOscillator(),g=ctx.createGain();o.frequency.setValueAtTime(sniper?165:170,t);o.frequency.exponentialRampToValueAtTime(sniper?38:42,t+(sniper?.28:.18));g.gain.setValueAtTime((sniper?.50:.09)*volume,t);g.gain.exponentialRampToValueAtTime(.0001,t+(sniper?.55:.1));o.connect(g);g.connect(output);o.start(t);o.stop(t+(sniper?.58:.34));o.onended=()=>{o.disconnect();g.disconnect()};
 if(sniper){burst(.015,.42,220,.32);burst(.13,.62,850,.12);burst(.38,.07,2600,.07,'bandpass');burst(.64,.1,3300,.09,'bandpass');}
 }catch{}}};
}
