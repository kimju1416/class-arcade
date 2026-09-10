// CC0 field recordings; see audio/CREDITS.txt for provenance and editing notes.
export function createRecordedAudio(){
 const names=['rifle-real-1','rifle-real-2','sniper-real-1','sniper-real-2'],raw={},decoded={},requests=names.map(async name=>{try{const r=await fetch('audio/'+name+'.wav');if(!r.ok)throw Error(r.status);raw[name]=await r.arrayBuffer()}catch{}});let preparing=null,bus=null,counter=0;const voices=[];
 function prepare(ctx){return preparing??=Promise.all(requests).then(()=>Promise.all(names.map(async name=>{if(raw[name])try{decoded[name]=await ctx.decodeAudioData(raw[name]);delete raw[name]}catch{}}))).then(()=>{if(typeof document!=='undefined')document.documentElement.dataset.gunAudio=names.every(n=>decoded[n])?'recorded-ready':'fallback'})}
 function play(ctx,weapon,volume=1,pan=0,muffle=0){const name=weapon+'-real-'+(++counter%2+1),buffer=decoded[name];if(!buffer)return false;
 if(!bus){bus=ctx.createDynamicsCompressor();bus.threshold.value=-1;bus.knee.value=5;bus.ratio.value=3;bus.attack.value=.008;bus.release.value=.14;bus.connect(ctx.destination)}
 const source=ctx.createBufferSource(),gain=ctx.createGain(),position=ctx.createStereoPanner(),filter=ctx.createBiquadFilter();source.buffer=buffer;source.playbackRate.value=1;gain.gain.value=volume*(weapon==='sniper'?1.05:.95);position.pan.value=Math.max(-1,Math.min(1,pan));filter.type='lowpass';filter.frequency.value=Math.min(volume<.3?4500:18000,18000-Math.max(0,Math.min(1,muffle))*15000);source.connect(filter);filter.connect(gain);gain.connect(position);position.connect(bus);if(voices.length>=32)voices.shift().stop();voices.push(source);source.start();source.onended=()=>{const index=voices.indexOf(source);if(index>=0)voices.splice(index,1);source.disconnect();filter.disconnect();gain.disconnect();position.disconnect()};return true;
 }
 return {prepare,play};
}
