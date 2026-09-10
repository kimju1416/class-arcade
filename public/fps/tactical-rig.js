import * as T from './three.module.js';
import {createBotRifle} from './bot-rifle.js?v=combat3d-1';
// Lightweight third-person rifle, with a two-handed aiming pose on the soldier skeleton.
export function tacticalRig(group,body){
 const rifle=createBotRifle();
 group.add(rifle);const muzzle=new T.Mesh(new T.ConeGeometry(.06,.19,6),new T.MeshBasicMaterial({color:'#ffe1a0'}));muzzle.rotation.x=-Math.PI/2;muzzle.position.z=-.65;muzzle.visible=false;rifle.add(muzzle);
 const bones={};body.traverse(n=>{if(n.isBone)bones[n.name.replace('mixamorig','').replace(':','')]=n});
 const position=new T.Vector3(),tip=new T.Vector3(),a=new T.Vector3(),b=new T.Vector3(),target=new T.Vector3(),rotation=new T.Quaternion(),world=new T.Quaternion(),parent=new T.Quaternion();
 function reach(side,local){const hand=bones[side+'Hand'];if(!hand)return;target.copy(local);rifle.localToWorld(target);
  for(let iteration=0;iteration<8;iteration++)for(const bone of [bones[side+'ForeArm'],bones[side+'Arm']]){if(!bone)continue;bone.getWorldPosition(position);hand.getWorldPosition(tip);a.subVectors(tip,position).normalize();b.subVectors(target,position).normalize();rotation.setFromUnitVectors(a,b);bone.getWorldQuaternion(world);bone.parent.getWorldQuaternion(parent).invert();bone.quaternion.copy(parent.multiply(rotation.multiply(world)));bone.updateWorldMatrix(false,true)}
 }
 const right=new T.Vector3(0,-.09,-.04),left=new T.Vector3(-.04,-.045,-.26);let shotTime=0;
 return {down(){muzzle.visible=false},shot(){shotTime=.09},update(q,dt,speed){shotTime=Math.max(0,shotTime-dt);rifle.position.set(.12,1.34,-.15+shotTime*.22);rifle.rotation.x=q.reload>0?.5:-(q.pitch||0);rifle.rotation.z=Math.sin(performance.now()*.008)*Math.min(speed,.5)*.025;group.updateWorldMatrix(true,true);reach('Right',right);reach('Left',left);muzzle.visible=shotTime>0;},dispose(){rifle.traverse(n=>{if(n.isMesh){n.geometry.dispose();n.material.dispose()}})}};
}
