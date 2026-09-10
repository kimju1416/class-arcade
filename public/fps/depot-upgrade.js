import * as T from './three.module.js';
export function upgradeDepot(scene,mats,box,boxes){
 const loader=new T.TextureLoader(),wall=loader.load('factory-wall-v2.webp'),ground=loader.load('depot-ground-v2.webp');
 for(const texture of [wall,ground]){texture.colorSpace=T.SRGBColorSpace;texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.anisotropy=2}wall.repeat.set(5,2);ground.repeat.set(9,10);mats.wall.map=wall;mats.wall.color.set('#a0aaa5');mats.wall.needsUpdate=true;mats.ground.map=ground;mats.ground.color.set('#a6aaa1');mats.ground.needsUpdate=true;mats.barrier.map=wall;mats.barrier.roughness=1;
 const orange=new T.MeshLambertMaterial({color:'#c78835'}),steel=new T.MeshLambertMaterial({color:'#38484b'}),glass=new T.MeshLambertMaterial({color:'#759ba0'}),stripe=new T.MeshLambertMaterial({color:'#dcc47d'});
 // Freight gantry beyond the north wall: visible above the warehouse roof, outside playable bounds.
 for(const x of [-20,20]){box(.85,15,.9,orange,x,7.5,-30);box(3,.45,3,steel,x,.23,-30);for(const y of [3,6,9,12])box(1.5,.15,1.5,steel,x,y,-30)}
 box(42,1,1.3,orange,0,15,-30);box(42,.15,1.7,steel,0,15.7,-30);for(let x=-18;x<20;x+=4){const truss=box(4.3,.16,.16,steel,x+2,14.45,-29.2);truss.rotation.z=(x%8===-2?.2:-.2)}box(3.2,2,2.2,orange,12,13.7,-30);box(2.7,1.15,.05,glass,12,13.8,-28.87);box(.1,5,.1,steel,-5,11.8,-30);box(2.6,.25,1.2,orange,-5,9.3,-30);
 // Guard tower and rooftop machinery remain outside the combat floor.
 for(const x of [27,30])for(const z of [20,23])box(.22,9,.22,steel,x,4.5,z);box(4.2,.35,4.2,steel,28.5,8.2,21.5);box(4,1.1,4,'wall',28.5,8.8,21.5);box(3.9,1.3,3.9,glass,28.5,10,21.5);box(4.5,.3,4.5,steel,28.5,10.8,21.5);for(const x of [26.5,30.5])for(const z of [19.5,23.5])box(.13,2.2,.13,steel,x,9.6,z);for(let n=0;n<18;n++)box(1.6,.15,.45,steel,26,4.3+n*.22,17+n*.24);
 for(const x of [-33,33])for(const z of [-19,12]){box(3,1.3,2,steel,x,11.8,z);for(let i=-1;i<=1;i++)box(.1,1,2.03,glass,x+i*.8,11.8,z);box(3.3,.1,2.3,stripe,x,12.55,z)}
 // New low concrete cover: paint follows the same dimensions used for collision and the tactical map.
 for(const cover of boxes.filter(b=>b[6]==='barrier')){for(const side of [-1,1])for(let x=-1.8;x<=1.8;x+=.6){const paint=box(.28,.48,.016,stripe,cover[0]+x,.85,cover[2]+side*(cover[5]/2+.011));paint.rotation.z=-.45}box(cover[3]+.07,.08,cover[5]+.07,steel,cover[0],cover[4]-.04,cover[2]);}
 // Wayfinding plates, door numbering and loading lane paint.
 function sign(text,x,y,z){const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d');ctx.fillStyle='#17292c';ctx.fillRect(0,0,512,128);ctx.strokeStyle='#dcca8d';ctx.lineWidth=8;ctx.strokeRect(4,4,504,120);ctx.font='bold 51px Arial';ctx.textAlign='center';ctx.fillStyle='#eee9cc';ctx.fillText(text,256,82);const mesh=new T.Mesh(new T.PlaneGeometry(2.6,.65),new T.MeshBasicMaterial({map:new T.CanvasTexture(canvas)}));mesh.position.set(x,y,z);scene.add(mesh)}
 sign('NORTH / 01',0,4,-24.96);sign('LOADING A',-10,2.65,-2.91);sign('LOADING B',10,2.65,15.09);
 for(const x of [-5.4,5.4])for(let z=-21;z<=21;z+=3)box(.14,.012,1.5,stripe,x,.022,z);
 for(const z of [-21,21])for(const side of [-1,1]){box(4.4,.012,.12,stripe,side*11,.022,z);box(.12,.012,3.8,stripe,side*13.2,.022,z-1.8)}
}
