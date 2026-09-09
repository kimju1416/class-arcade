export class Recoil {
 constructor(){this.reset()}
 reset(){this.pitch=0;this.yaw=0;this.velocity=0;this.sideVelocity=0}
 shot(weapon,aim=false){this.velocity+=(weapon==='sniper'?.85:.32)*(aim?.8:1);this.sideVelocity+=(Math.random()-.5)*.12}
 update(dt){for(let left=Math.min(dt,.1);left>0;){const h=Math.min(left,1/120);this.velocity+=(-95*this.pitch-15*this.velocity)*h;this.sideVelocity+=(-110*this.yaw-17*this.sideVelocity)*h;this.pitch+=this.velocity*h;this.yaw+=this.sideVelocity*h;left-=h}}
}
