import * as T from './three.module.js';
import {mergeGeometries} from './addons/utils/BufferGeometryUtils.js';
// Lightweight third-person rifle, with a two-handed aiming pose on the soldier skeleton.
export function tacticalRig(group,body){
 const rifle=new T.Group(),parts=[[],[]];
 function box(x,y,z,w,h,d,material=0){const geo=new T.BoxGeometry(w,h,d);geo.translate(x,y,z);parts[material].push(geo)}
 box(0,0,0,.095,.13,.36,1);box(0,0,-.3,.075,.09,.32,1);box(0,-.14,.02,.065,.2,.1);box(0,-.11,.15,.06,.18,.075);box(0,0,.27,.08,.12,.22);box(0,.09,-.07,.04,.035,.5);box(0,.12,.06,.06,.05,.06);box(0,.1,-.41,.03,.06,.03);
 const barrel=new T.CylinderGeometry(.024,.024,.23,8);barrel.rotateX(Math.PI/2);barrel.translate(0,0,-.56);parts[0].push(barrel);
 for(let i=0;i<2;i++){const merged=mergeGeometries(parts[i]);parts[i].forEach(g=>g.dispose());rifle.add(new T.Mesh(merged,new T.MeshLambertMaterial({color:i?'#796e50':'#242b2b'})))}
 group.add(rifle);const muzzle=new T.Mesh(new T.ConeGeometry(.06,.19,6),new T.MeshBasicMaterial({color:'#ffe1a0'}));muzzle.rotation.x=-Math.PI/2;muzzle.position.z=-.77;muzzle.visible=false;rifle.add(muzzle);
 const bones={};body.traverse(n=>{if(n.isBone)bones[n.name.replace('mixamorig','').replace(':','')]=n});
 const position=new T.Vector3(),tip=new T.Vector3(),a=new T.Vector3(),b=new T.Vector3(),target=new T.Vector3(),rotation=new T.Quaternion(),world=new T.Quaternion(),parent=new T.Quaternion();
 function reach(side,local){const hand=bones[side+'Hand'];if(!hand)return;target.copy(local);rifle.localToWorld(target);
  for(let iteration=0;iteration<8;iteration++)for(const bone of [bones[side+'ForeArm'],bones[side+'Arm']]){if(!bone)continue;bone.getWorldPosition(position);hand.getWorldPosition(tip);a.subVectors(tip,position).normalize();b.subVectors(target,position).normalize();rotation.setFromUnitVectors(a,b);bone.getWorldQuaternion(world);bone.parent.getWorldQuaternion(parent).invert();bone.quaternion.copy(parent.multiply(rotation.multiply(world)));bone.updateWorldMatrix(false,true)}
 }
 const right=new T.Vector3(0,-.09,.13),left=new T.Vector3(-.075,-.045,-.12);let shotTime=0;
 return {shot(){shotTime=.09},update(q,dt,speed){shotTime=Math.max(0,shotTime-dt);rifle.position.set(.12,1.34,-.15+shotTime*.22);rifle.rotation.x=q.reload>0?.5:-(q.pitch||0);rifle.rotation.z=Math.sin(performance.now()*.008)*Math.min(speed,.5)*.025;group.updateWorldMatrix(true,true);reach('Right',right);reach('Left',left);muzzle.visible=shotTime>0;},dispose(){rifle.traverse(n=>{if(n.isMesh){n.geometry.dispose();n.material.dispose()}})}};
}
