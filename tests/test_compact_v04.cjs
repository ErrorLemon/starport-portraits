const fs=require('fs'),assert=require('node:assert/strict'),E=require('../web/fleet-engine.js');
const d=JSON.parse(fs.readFileSync('web/data/library.json'));
const valid=d.ships.filter(s=>E.geometry(s,d.assets[s.assets.top]));
const input=n=>Array.from({length:n},(_,i)=>{const s=valid[i*11%valid.length];return{id:'item-'+i,member:'成员'+i,name:s.name,geometry:E.geometry(s,d.assets[s.assets.top]),textWidth:60};});
for(const n of [0,1,15,80,200])for(const font of [6,18,40]){
 const options={mode:'compact',font,modelFont:font===40?28:6,gap:font===40?0:4};
 const rows=input(n),r=E.layout(rows,options);assert(!r.error,`${n} / ${font}: ${r.error}`);assert.equal(r.rects.length,n);
 for(let i=0;i<n;i++){assert(E.inside(r.rects[i]));for(let j=i+1;j<n;j++)assert(!E.overlap(r.rects[i],r.rects[j],Math.max(0,options.gap-.001)));}
 for(const row of rows){const rect=r.rects.find(b=>b.id===row.id);assert(Math.abs(rect.imageW/row.geometry.width_m-r.ppm)<1e-8);assert(Math.abs(rect.imageH/row.geometry.height_m-r.ppm)<1e-8);}
}
for(const n of [15,80,200]){
 const rows=input(n),base=E.layout(rows,{font:9,modelFont:7,gap:4}),packed=E.layout(rows,{mode:'compact',font:9,modelFont:7,gap:4});
 assert(packed.ppm>base.ppm,`${n}: compact should use the available canvas more densely on this mixed-size fixture`);
 console.log(`PASS ${n} mixed vessels: radial ${base.ppm.toFixed(3)}, compact ${packed.ppm.toFixed(3)} px/m`);
}
// A small ship fits in a gap bounded by four locked larger ships.
const frame={width:1000,height:800,margin:20,top:20,bottom:20};
const large=(id,w,h)=>({id,member:id,name:id,textWidth:20,geometry:{length:w,width_m:w,height_m:h}});
const locks={top:true,bottom:true,left:true,right:true};
const positions={top:{x:500,y:160},bottom:{x:500,y:640},left:{x:220,y:400},right:{x:780,y:400}};
const fixture=[large('top',700,180),large('bottom',700,180),large('left',180,250),large('right',180,250),large('small',80,60)];
const filled=E.layout(fixture,{mode:'compact',frame,font:6,modelFont:6,showModels:false,gap:4,ppm:1,locks,positions,keepPositions:true});
assert(!filled.error);for(const id of Object.keys(locks))assert.deepEqual(filled.positions[id],positions[id]);
const small=filled.rects.find(r=>r.id==='small');assert(small.x>310&&small.x<690&&small.y>250&&small.y<550);
const item=input(1)[0];assert(E.metrics(item,1,6,6,false).h<E.metrics(item,1,18,13,true).h);
assert(E.layout(input(201),{mode:'compact'}).error);
console.log('PASS 0/1/15/80/200 vessels, 6–40 px fonts, zero gap, non-overlap, common scale on both axes, true interstitial gap fill, locked positions, hidden-model spacing and 201-vessel rejection.');
