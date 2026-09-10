import * as T from './three.module.js';

// 3인칭 병사가 든 소총. 예전에는 실루엣 위에 크로마키로 지운 그림판 두 장을 붙였는데,
// 배경 지우기가 완벽하지 않아 가장자리에 자주색이 남았다. 지금은 전부 3D 도형이다.
const body=new T.MeshLambertMaterial({color:'#2f342d'});
const hand=new T.MeshLambertMaterial({color:'#4c4a3c'});
const metal=new T.MeshLambertMaterial({color:'#585d5e'});

export function createBotRifle(){
 const rifle=new T.Group();
 // 옆면 윤곽을 그대로 뽑아내 두께를 준다. 멀리서도 «소총»으로 읽히는 건 이 실루엣이다.
 const outline=[[.015,.28],[.13,.28],[.14,.08],[.16,.08],[.20,.21],[.42,.21],[.61,.19],[.63,.055],[.646,.055],[.65,.20],[.70,.25],[.97,.23],[.98,.28],[.98,.64],[.93,.66],[.86,.46],[.71,.42],[.66,.43],[.71,.75],[.65,.80],[.61,.57],[.54,.57],[.51,.94],[.42,.87],[.45,.52],[.45,.42],[.20,.41],[.18,.37],[.015,.35]];
 const shape=new T.Shape();outline.forEach(([u,v],i)=>{const x=(u-.5)*.84,y=(.5-v)*.331;i?shape.lineTo(x,y):shape.moveTo(x,y)});shape.closePath();
 const shell=new T.Mesh(new T.ExtrudeGeometry(shape,{depth:.064,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.002,bevelThickness:.002}),body);
 shell.rotation.y=-Math.PI/2;shell.position.set(.032,-.056,-.20);rifle.add(shell);
 // 색이 하나뿐이면 멀리서 덩어리로 보인다. 총열 덮개와 개머리판만 톤을 갈라 준다.
 const part=(w,h,d,color,x,y,z)=>{const m=new T.Mesh(new T.BoxGeometry(w,h,d),color);m.position.set(x,y,z);rifle.add(m);return m};
 part(.05,.046,.20,hand,0,-.028,-.34);          // 총열 덮개
 part(.046,.05,.13,hand,0,-.044,.055);          // 개머리판
 part(.026,.026,.13,metal,0,-.03,-.50);         // 총열
 part(.038,.062,.05,body,0,-.086,-.16);         // 탄창
 part(.044,.014,.24,metal,0,.006,-.27);         // 윗레일
 return rifle;
}
