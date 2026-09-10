import * as T from './three.module.js';
import {createBotRifle} from './bot-rifle.js?v=ik-3';
// Lightweight third-person rifle, with a two-handed aiming pose on the soldier skeleton.
export function tacticalRig(group,body){
 const rifle=createBotRifle();
 group.add(rifle);const muzzle=new T.Mesh(new T.ConeGeometry(.06,.19,6),new T.MeshBasicMaterial({color:'#ffe1a0'}));muzzle.rotation.x=-Math.PI/2;muzzle.position.z=-.65;muzzle.visible=false;rifle.add(muzzle);
 const bones={};body.traverse(n=>{if(n.isBone)bones[n.name.replace('mixamorig','').replace(':','')]=n});
 const up=new T.Vector3(0,1,0),position=new T.Vector3(),tip=new T.Vector3(),a=new T.Vector3(),b=new T.Vector3(),target=new T.Vector3(),rotation=new T.Quaternion(),world=new T.Quaternion(),parent=new T.Quaternion();
 const scl=new T.Vector3(),pos2=new T.Vector3();
 // 세계 회전·위치를 matrixWorld에서 바로 뽑는다. getWorldQuaternion/getWorldPosition은 부를 때마다 엉덩이부터 조상 전체를
 // 다시 계산해서, 병사 5명×양팔×반복마다 수천 번 행렬곱이 돌았다(프로파일: 폰 CPU의 29%, PC 18%).
 const worldQuat=(o,out)=>{o.matrixWorld.decompose(pos2,out,scl);return out};
 function reach(side,local,iterations){const hand=bones[side+'Hand'],fore=bones[side+'ForeArm'],arm=bones[side+'Arm'];if(!hand||iterations<=0)return;target.copy(local);rifle.localToWorld(target);
  const chain=[arm,fore,hand].filter(Boolean);
  for(let iteration=0;iteration<iterations;iteration++)for(const bone of [fore,arm]){if(!bone)continue;position.setFromMatrixPosition(bone.matrixWorld);tip.setFromMatrixPosition(hand.matrixWorld);a.subVectors(tip,position).normalize();b.subVectors(target,position).normalize();rotation.setFromUnitVectors(a,b);worldQuat(bone,world);worldQuat(bone.parent,parent).invert();bone.quaternion.copy(parent.multiply(rotation.multiply(world)));
   // 이 뼈부터 손까지 «사슬»만 갱신한다. 손가락 20여 개까지 매번 갱신할 필요는 없다 — 렌더 직전에 전체가 한 번 갱신된다.
   for(let i=chain.indexOf(bone);i<chain.length;i++)chain[i].updateWorldMatrix(false,false)}
 }
 const right=new T.Vector3(0,-.09,-.04),left=new T.Vector3(-.04,-.045,-.26);let shotTime=0,gaitTime=0;
 return {down(){muzzle.visible=false},shot(){shotTime=.09},update(q,dt,speed,bodyTurn=0,lod=8){shotTime=Math.max(0,shotTime-dt);gaitTime+=dt*(speed>.2?speed*4.5:1.6);rifle.position.set(.12,1.34+Math.sin(gaitTime)*(speed>.2?.012:.004),-.15+shotTime*.22);rifle.rotation.x=q.reload>0?.5:-(q.pitch||0);rifle.rotation.z=Math.sin(performance.now()*.008)*Math.min(speed,.5)*.025;group.updateWorldMatrix(true,true);const spine=bones.Spine2;if(spine&&Math.abs(bodyTurn)>.001){spine.getWorldQuaternion(world);spine.parent.getWorldQuaternion(parent).invert();rotation.setFromAxisAngle(up,-bodyTurn*.85);spine.quaternion.copy(parent.multiply(rotation.multiply(world)));spine.updateWorldMatrix(false,true)}reach('Right',right,lod);reach('Left',left,lod);muzzle.visible=shotTime>0;},dispose(){rifle.traverse(n=>{if(n.isMesh){n.geometry.dispose();n.material.dispose()}})}};
}
