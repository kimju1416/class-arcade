import { buildTrack } from '../../public/kart/trackmath.js';
import { TRACKS } from '../../public/kart/data.js';
import fs from 'fs';
let svg='';
TRACKS.forEach((d,k)=>{const t=buildTrack(d);
 // 비인접 구간 최소 거리
 let md=1e9,mi=0,mj=0;for(let i=0;i<t.N;i+=4)for(let j=0;j<t.N;j+=4){const gap=Math.min(Math.abs(i-j),t.N-Math.abs(i-j));if(gap*t.seg<80)continue;const dd=Math.hypot(t.x[i]-t.x[j],t.z[i]-t.z[j]);if(dd<md){md=dd;mi=i;mj=j}}
 let maxc=0;for(let i=0;i<t.N;i++)maxc=Math.max(maxc,Math.abs(t.curv[i]));
 console.log(d.id,'len',t.length.toFixed(0),'minGap',md.toFixed(1),'need',(d.width+2*d.band+6),'at',mi,mj,'maxCurv(20seg)',maxc.toFixed(2), 'seg',t.seg.toFixed(2));
 const b=t.bounds;let p='';for(let i=0;i<t.N;i+=4)p+=(i?'L':'M')+((t.x[i]-b.minx)/2+10+k*260).toFixed(1)+','+((t.z[i]-b.minz)/2+10).toFixed(1);
 svg+=`<path d="${p}Z" fill="none" stroke="black" stroke-width="${d.width/2}"/><circle cx="${(t.x[0]-b.minx)/2+10+k*260}" cy="${(t.z[0]-b.minz)/2+10}" r="5" fill="red"/>`;
});
fs.writeFileSync(process.argv[2],`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="300" style="background:#fff">${svg}</svg>`);
