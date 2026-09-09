const {Arena}=require('./fps-core.cjs');
const {randomUUID}=require('crypto');
module.exports=function createFPS(WebSocketServer){
 const rooms=new Map(),wss=new WebSocketServer({noServer:true,maxPayload:4096});
 wss.on('connection',ws=>{let room,id,packets=0;ws.alive=true;ws.on('pong',()=>ws.alive=true);const deadline=setTimeout(()=>ws.close(),10000);
 ws.on('message',raw=>{if(++packets>150)return ws.close(1008,'Rate limit');let m;try{m=JSON.parse(raw.toString())}catch{return ws.close(1008,'Invalid JSON')}if(!m||typeof m!=='object')return;
 if(m.type==='join'&&!id){let code=String(m.room||'DEPOT-01').replace(/[^A-Za-z0-9_-]/g,'').slice(0,20)||'DEPOT-01',mode=m.mode==='ffa'?'ffa':'tdm',key=mode+':'+code;room=rooms.get(key);if(!room){if(rooms.size>=32)return ws.close(1013,'Server full');room={arena:new Arena(mode),clients:new Map(),key};rooms.set(key,room)}if(room.clients.size>=16){ws.send(JSON.stringify({type:'error',message:'방 정원 16명이 가득 찼습니다.'}));return ws.close()}clearTimeout(deadline);id=randomUUID();room.arena.add(id,m.name);room.clients.set(id,ws);ws.send(JSON.stringify({type:'welcome',id,mode}));}
 else if(m.type==='input'&&id)room.arena.input(id,m.input);else if(m.type==='ping')ws.send(JSON.stringify({type:'pong',time:m.time}));});
 let rate=setInterval(()=>packets=0,1000);ws.on('close',()=>{clearTimeout(deadline);clearInterval(rate);if(room&&id){delete room.arena.players[id];room.clients.delete(id);if(!room.clients.size)rooms.delete(room.key)}});ws.on('error',()=>{});});
 const tick=setInterval(()=>{for(let room of rooms.values()){room.arena.step(1/30);let packet=JSON.stringify({type:'state',state:room.arena.snapshot()});for(let ws of room.clients.values())if(ws.readyState===1){if(ws.bufferedAmount>1048576){ws.close(1013,'Slow connection');continue}ws.send(packet)}}},1000/30);
 const heartbeat=setInterval(()=>{for(let ws of wss.clients){if(!ws.alive){ws.terminate();continue}ws.alive=false;ws.ping()}},30000);
 wss.on('close',()=>{clearInterval(tick);clearInterval(heartbeat)});return wss;
};
