import * as T from './three.module.js';
import {GLTFLoader} from './addons/loaders/GLTFLoader.js';
import {RIGS} from './weapon-pose.js?v=warm-3';
const textures=new T.TextureLoader();
// 폰은 GPU 메모리가 좁다 — 2048² PBR 네 장(85MB)이 게임 시작·첫 조준 멈칫의 주범이었다. 폰은 1024² 두 장만, 거칠기·금속은 값으로.
const mobileGPU=typeof matchMedia!=='undefined'&&(matchMedia('(pointer: coarse)').matches||navigator.maxTouchPoints>0&&innerWidth<1100);
function tex(name,color=false){const t=textures.load('weapons/m4-'+name+(mobileGPU?'-1k':'')+'.webp');t.flipY=true;t.anisotropy=mobileGPU?1:4;if(color)t.colorSpace=T.SRGBColorSpace;return t}
const material=mobileGPU
 ?new T.MeshStandardMaterial({map:tex('color',true),normalMap:tex('normal'),roughness:.55,metalness:.75,normalScale:new T.Vector2(.65,.65)})
 :new T.MeshStandardMaterial({map:tex('color',true),normalMap:tex('normal'),roughnessMap:tex('rough'),metalnessMap:tex('metal'),roughness:1,metalness:1,normalScale:new T.Vector2(.65,.65)});
const pending=[];let template;
new GLTFLoader().load('weapons/m4a1.glb',g=>{template=g.scene;for(const mount of pending)mount();pending.length=0});
// Artist-authored CC0 M4A1, adapted to the existing viewmodel coordinate system.
export function realWeapon(kind){
 const group=new T.Group(),mag=new T.Group(),bolt=new T.Group(),rig=RIGS[kind];mag.position.set(rig.mag.x,rig.mag.y,rig.mag.z);bolt.position.set(0,.062,kind==='sniper'?.075:.093);group.add(mag,bolt);
 const mount=()=>{const meshes=[];template.traverse(n=>{if(n.isMesh)meshes.push(n)});for(const original of meshes){if(!original.isMesh)continue;const mesh=new T.Mesh(original.geometry,material);mesh.name=original.name;mesh.frustumCulled=false;
  if(['Sight','Sight_2','Switch1','Switch2'].includes(mesh.name))continue;
  if(mesh.name==='Magazine'){mesh.position.copy(mag.position).negate();mag.add(mesh)}else if(mesh.name==='Charging_Handle'){mesh.position.copy(bolt.position).negate();bolt.add(mesh)}else group.add(mesh);
 }group.userData.ready=true;if(typeof document!=='undefined')document.documentElement.dataset[kind+'Model']='pbr-ready'};
 if(template)mount();else pending.push(mount);
 return {group,parts:{mag,bolt},muzzle:new T.Vector3(0,.03,kind==='sniper'?-.87:-.576)};
}
