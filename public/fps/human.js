import * as T from './three.module.js';
import {GLTFLoader} from './addons/loaders/GLTFLoader.js';
import {clone} from './addons/utils/SkeletonUtils.js';
let template=null,clips=[];new GLTFLoader().load('soldier.glb',gltf=>{template=gltf.scene;clips=gltf.animations});
export function createHuman(p,tag){
 if(!template)return null;const group=new T.Group(),body=clone(template);const mixer=new T.AnimationMixer(body),actions={};for(const clip of clips)if(['Idle','Walk','Run'].includes(clip.name))actions[clip.name]=mixer.clipAction(clip);actions.Idle?.play();mixer.update(.001);body.updateMatrixWorld(true);body.traverse(m=>{if(m.isSkinnedMesh){m.skeleton.update();m.boundingBox=null}});const bounds=new T.Box3().setFromObject(body),size=bounds.getSize(new T.Vector3()),scale=1.82/size.y;body.scale.multiplyScalar(scale);body.position.y-=bounds.min.y*scale;body.rotation.y=Math.PI;body.traverse(m=>{if(m.isMesh){m.castShadow=false;m.receiveShadow=false;m.frustumCulled=true;if(m.isSkinnedMesh)m.boundingSphere=new T.Sphere(new T.Vector3(0,0,90),200);if(m.material){m.material=new T.MeshBasicMaterial({map:m.material.map,color:0xffffff,alphaTest:.1})}}});group.add(body);group.add(tag);
 const marker=new T.Mesh(new T.TorusGeometry(.38,.035,5,16),new T.MeshBasicMaterial({color:p.team===0?'#ff625c':'#6ed5ff',depthTest:true}));marker.rotation.x=Math.PI/2;marker.position.y=.025;group.add(marker);
 let current='Idle',lastX=p.x,lastZ=p.z,speed=0;
 group.userData.animate=(q,dt)=>{let measured=Math.hypot(q.x-lastX,q.z-lastZ)/Math.max(dt,.001);lastX=q.x;lastZ=q.z;speed=T.MathUtils.lerp(speed,Math.min(measured,8),.15);let next=speed>.8?'Run':speed>.08?'Walk':'Idle';if(next!==current&&actions[next]){actions[current]?.fadeOut(.18);actions[next].reset().fadeIn(.18).play();current=next}mixer.update(dt);marker.material.color.set(q.team===0?'#ff625c':'#6ed5ff')};
 group.userData.dispose=()=>{mixer.stopAllAction();mixer.uncacheRoot(body);body.traverse(m=>{if(m.isMesh)m.material?.dispose()});tag.material.map?.dispose();tag.material.dispose();marker.geometry.dispose();marker.material.dispose()};return group;
}
