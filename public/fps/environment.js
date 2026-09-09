import * as T from './three.module.js';
export function enhanceDepot(scene,mats,box,boxes){
 const loader=new T.TextureLoader();let sky=loader.load('sky-depot.png');sky.mapping=T.EquirectangularReflectionMapping;sky.colorSpace=T.SRGBColorSpace;scene.background=sky;scene.environment=sky;scene.environmentIntensity=.45;
 const steel=loader.load('steel-blue.png');steel.colorSpace=T.SRGBColorSpace;steel.wrapS=steel.wrapT=T.RepeatWrapping;steel.repeat.set(2,1);for(let name of ['blue','red','olive']){mats[name].map=steel;mats[name].metalness=.45;mats[name].roughness=.73;mats[name].needsUpdate=true}
 let wood=loader.load('wood-crate.png');wood.colorSpace=T.SRGBColorSpace;wood.wrapS=wood.wrapT=T.RepeatWrapping;mats.crate.map=wood;mats.crate.needsUpdate=true;
 const rust=new T.MeshStandardMaterial({color:'#65594a',metalness:.7,roughness:.74}),dark=new T.MeshStandardMaterial({color:'#263135',metalness:.6,roughness:.6}),glass=new T.MeshStandardMaterial({color:'#627b83',metalness:.5,roughness:.2}),light=new T.MeshBasicMaterial({color:'#ffe5ac'});
 function cylinder(radius,length,x,y,z,material=rust,axis='y'){let mesh=new T.Mesh(new T.CylinderGeometry(radius,radius,length,12),material);if(axis==='x')mesh.rotation.z=Math.PI/2;if(axis==='z')mesh.rotation.x=Math.PI/2;mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);return mesh}
 // Warehouse shell, drainage pipes, door surrounds and recessed glazing.
 for(let side of [-1,1]){for(let z=-21;z<24;z+=7){box(.24,6.7,.26,dark,side*22.85,3.35,z);box(.2,.25,6.8,dark,side*22.8,5.7,z+3.4);box(.1,1.1,2.2,glass,side*22.94,4.7,z+2.4);for(let dz of [1.3,2.4,3.5])box(.15,1.3,.06,dark,side*22.83,4.7,z+dz);box(.2,.06,2.3,dark,side*22.82,4.7,z+2.4)}cylinder(.14,49,side*22.7,3.6,0,rust,'z');for(let z of [-20,0,20]){cylinder(.18,3.7,side*22.5,1.85,z);box(.6,.5,.7,dark,side*22.45,.3,z)}
 // External factory volumes visible through the open clerestory.
 for(let z of [-18,12]){box(12,11,18,'wall',side*33,5.5,z);for(let x=side*33-5;x<side*33+6;x+=2)for(let level of [5,8])box(1.1,1.3,.12,glass,x,level,z+9.08);box(12.5,.45,18.5,dark,side*33,11,z)}
 cylinder(.55,17,side*35,8.5,-17);cylinder(.7,.8,side*35,17,-17);
 }
 // Roof trusses: diagonal members give the warehouse depth and scale.
 for(let z=-24;z<25;z+=6){for(let x=-21;x<20;x+=6){let beam=box(6.5,.12,.12,dark,x+3,7.5,z);beam.rotation.z=(Math.floor((x+21)/6)%2?1:-1)*.2}box(44,.1,.1,rust,0,6.85,z)}
 // Small warm light pools under the side roofs.
 for(let x of [-17,17])for(let z of [-18,0,18]){let point=new T.PointLight('#ffce88',13,13,2);point.position.set(x,6.8,z);scene.add(point);box(.8,.11,.3,dark,x,7.03,z);box(.65,.045,.2,light,x,6.96,z)}
 // Bolted container frames, latches and timber straps use existing cover bounds.
 for(let b of boxes){if(['blue','red','olive'].includes(b[6])){for(let sx of [-1,1])for(let sz of [-1,1])box(.15,b[4]+.09,.15,rust,b[0]+sx*(b[3]/2-.08),b[1],b[2]+sz*(b[5]/2-.08));for(let x of [-.7,.7]){cylinder(.035,b[4]-.35,b[0]+x,b[1],b[2]+b[5]/2+.08,dark);for(let y of [.35,b[4]-.35])box(.23,.08,.1,rust,b[0]+x,y,b[2]+b[5]/2+.12)}
 }if(b[6]==='crate'){for(let x of [-b[3]*.35,b[3]*.35])box(.1,b[4]+.08,b[5]+.08,rust,b[0]+x,b[1],b[2]);for(let side of [-1,1]){let brace=box(b[3]*1.08,.13,.1,'tan',b[0],b[1],b[2]+side*(b[5]/2+.06));brace.rotation.z=.46}}
 }
 // Ground wear, drain grilles and traffic paint. They do not create invisible cover.
 const paint=new T.MeshStandardMaterial({color:'#b29b51',roughness:1,transparent:true,opacity:.55});for(let z of [-21,21])for(let x=-3;x<4;x+=.7){let mark=box(.3,.008,2,paint,x,.016,z);mark.rotation.y=-.55}for(let x of [-21.7,21.7])for(let z=-23;z<25;z+=2){box(.8,.012,.8,dark,x,.015,z);for(let i=-.3;i<.4;i+=.12)box(.065,.013,.72,'metal',x+i,.025,z)}
 const puddle=new T.MeshStandardMaterial({color:'#4f646c',metalness:.6,roughness:.12,transparent:true,opacity:.55});for(let [x,z,s]of [[-16,20,2],[16,-20,2.2],[-18,-16,1.6],[5,20,1.2],[19,10,.8]]){let mesh=new T.Mesh(new T.CircleGeometry(s,28),puddle);mesh.rotation.x=-Math.PI/2;mesh.scale.y=.45;mesh.position.set(x,.025,z);scene.add(mesh)}
}
