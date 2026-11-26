/* Pure geometry and upgrade rules. No DOM, network, or external dependencies. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FleetEngine=api;})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  const FRAME={width:2400,height:1350,top:145,bottom:118,margin:54};
  const positive=n=>Number.isFinite(Number(n))&&Number(n)>0;
  function geometry(ship,asset){
    const length=Number(ship?.dimensions_m?.length),c=asset?.calibration||{};
    const box=c.crop_bbox||asset?.alpha_bbox||[0,0,asset?.width||0,asset?.height||0];
    const span=Number(c.reference_span_px),width=box[2]-box[0],height=box[3]-box[1];
    if(!positive(length)||!positive(span)||!positive(width)||!positive(height))return null;
    const flags=(Array.isArray(c.flags)?c.flags:[]).filter(f=>f!=='pose_or_extent_ratio_mismatch');
    if(asset.view==='top'&&positive(ship.dimensions_m.width)&&Math.abs((width/height)/(length/ship.dimensions_m.width)-1)>.2)flags.push('pose_or_extent_ratio_mismatch');
    return {length,width_m:width/span*length,height_m:height/span*length,crop:box,
      approximate:asset.view!=='top',manual:c.method==='manual_two_point'||c.method==='manual_reference',
      official:ship.dimensions_basis?.startsWith('rsi_')||false,flags};
  }
  function overlap(a,b,gap=0){return Math.abs(a.x-b.x)<(a.w+b.w)/2+gap&&Math.abs(a.y-b.y)<(a.h+b.h)/2+gap;}
  function inside(r,frame=FRAME){return r.x-r.w/2>=frame.margin&&r.x+r.w/2<=frame.width-frame.margin&&r.y-r.h/2>=frame.top&&r.y+r.h/2<=frame.height-frame.bottom;}
  function metrics(item,ppm,font=18,modelFont=font*.72,showModels=true){
    const imageW=item.geometry.width_m*ppm,imageH=item.geometry.height_m*ppm;
    const textWidth=item.textWidth||Math.max(50,item.member.length*font*.85,item.name.length*font*.52);
    const memberBaseline=imageH+Math.max(3,Math.round(font*.4))+font;
    const modelBaseline=memberBaseline+Math.max(2,Math.round(modelFont*.35))+modelFont;
    return {imageW,imageH,w:Math.max(imageW,textWidth+12),h:(showModels?modelBaseline:memberBaseline)+4,memberBaseline,modelBaseline};
  }
  // MaxRects free-space splitting leaves differently sized gaps for smaller vessels.
  // All occupied rectangles include labels; every vessel keeps the same px/m scale.
  function compactLayout(items,options={}){
    const frame=options.frame||FRAME,font=options.font??18,modelFont=options.modelFont??font*.72,showModels=options.showModels!==false,gap=Number(options.gap??8);
    const obstacles=options.obstacles||[];
    if(!items.length)return {positions:{},ppm:1,rects:[],error:null};
    if(items.length>200)return {error:'单张画布最多支持 200 艘，请分成多张全家福。'};
    const order=[...items].sort((a,b)=>b.geometry.length-a.geometry.length||a.id.localeCompare(b.id));
    const cx=frame.width/2,cy=(frame.top+frame.height-frame.bottom)/2,initial=options.ppm||Math.min(10,1200/Math.max(...order.map(i=>i.geometry.width_m)));
    const contains=(a,b)=>b.x>=a.x-.0001&&b.y>=a.y-.0001&&b.x+b.w<=a.x+a.w+.0001&&b.y+b.h<=a.y+a.h+.0001;
    const intersects=(a,b)=>a.x<b.x+b.w-.0001&&a.x+a.w>b.x+.0001&&a.y<b.y+b.h-.0001&&a.y+a.h>b.y+.0001;
    for(let attempt=0;attempt<45;attempt++){
      const ppm=initial*Math.pow(.90,attempt),rects=[],positions={};let failed=false;
      let free=[{x:frame.margin-gap/2,y:frame.top-gap/2,w:frame.width-2*frame.margin+gap,h:frame.height-frame.top-frame.bottom+gap}];
      const occupy=(r,isVessel=true)=>{
        const b={x:r.x-r.w/2-gap/2,y:r.y-r.h/2-gap/2,w:r.w+gap,h:r.h+gap},next=[];
        for(const f of free){
          if(!intersects(f,b)){next.push(f);continue;}
          if(b.x>f.x)next.push({...f,w:b.x-f.x});
          if(b.x+b.w<f.x+f.w)next.push({...f,x:b.x+b.w,w:f.x+f.w-b.x-b.w});
          if(b.y>f.y)next.push({...f,h:b.y-f.y});
          if(b.y+b.h<f.y+f.h)next.push({...f,y:b.y+b.h,h:f.y+f.h-b.y-b.h});
        }
        const valid=next.filter(f=>f.w>.1&&f.h>.1);
        free=valid.filter((f,i)=>!valid.some((b,j)=>i!==j&&contains(b,f)&&(!contains(f,b)||j<i)));
        if(isVessel){rects.push(r);positions[r.id]={x:r.x,y:r.y};}
      };
      for(const obstacle of obstacles)occupy(obstacle,false);
      const fits=r=>inside(r,frame)&&![...rects,...obstacles].some(b=>overlap(r,b,Math.max(0,gap-.0001)));
      for(const item of order.filter(i=>options.locks?.[i.id]&&options.positions?.[i.id])){
        const r={id:item.id,...metrics(item,ppm,font,modelFont,showModels),...options.positions[item.id]};
        if(!fits(r)){failed=true;break;}occupy(r);
      }
      if(failed)continue;
      for(const item of order){
        if(positions[item.id])continue;
        const m=metrics(item,ppm,font,modelFont,showModels),previous=options.keepPositions&&options.positions?.[item.id];
        if(previous){const r={id:item.id,...m,...previous};if(fits(r)){occupy(r);continue;}}
        const center={id:item.id,...m,x:cx,y:cy};
        if(!rects.length&&fits(center)){occupy(center);continue;}
        let best=null,bestScore=null;
        for(const f of free){
          const w=m.w+gap,h=m.h+gap;if(w>f.w+.0001||h>f.h+.0001)continue;
          for(const x of [f.x+w/2,f.x+f.w-w/2])for(const y of [f.y+h/2,f.y+f.h-h/2]){
            const r={id:item.id,...m,x,y};if(!fits(r))continue;
            const score=[Math.hypot((x-cx)/1.85,y-cy),Math.min(f.w-w,f.h-h),f.w*f.h-w*h,y,x];
            let better=!bestScore;for(let k=0;bestScore&&k<score.length;k++){if(Math.abs(score[k]-bestScore[k])>.0001){better=score[k]<bestScore[k];break;}}
            if(better){best=r;bestScore=score;}
          }
        }
        if(!best){failed=true;break;}occupy(best);
      }
      if(!failed)return {positions,ppm,rects,error:null};
    }
    return {error:'紧凑型排列仍无法容纳全部标签，请减小字号、间距或解除锁定。'};
  }
  function layout(items,options={}){
    if(options.mode==='compact')return compactLayout(items,options);
    const frame=options.frame||FRAME,font=options.font??18,gap=Number(options.gap??22),modelFont=options.modelFont??font*.72,showModels=options.showModels!==false;
    const obstacles=options.obstacles||[];
    if(!items.length)return {positions:{},ppm:1,rects:[],error:null};
    if(items.length>200)return {error:'单张画布最多支持 200 艘，请分成多张全家福。'};
    const order=[...items].sort((a,b)=>b.geometry.length-a.geometry.length||a.id.localeCompare(b.id));
    const cx=frame.width/2,cy=(frame.top+frame.height-frame.bottom)/2;
    const candidates=[{x:cx,y:cy}];
    // Elliptical rings: largest vessel is placed first at the center.
    for(let r=26;r<(frame.height-frame.top-frame.bottom)/2+200;r+=26){
      const count=Math.max(12,Math.ceil(2*Math.PI*r/26));
      for(let k=0;k<count;k++){const theta=k/count*Math.PI*2; candidates.push({x:cx+Math.cos(theta)*r*1.85,y:cy+Math.sin(theta)*r});}
    }
    const initial=options.ppm||Math.min(10,600/Math.max(...order.map(i=>i.geometry.width_m)));
    for(let attempt=0;attempt<45;attempt++){
      const ppm=initial*Math.pow(.90,attempt),rects=[],positions={};let failed=false;
      let points=candidates;
      if(items.length>=100){
        const sizes=order.map(i=>metrics(i,ppm,font,modelFont,showModels)),cw=Math.max(...sizes.map(m=>m.w))+gap+.01,ch=Math.max(...sizes.map(m=>m.h))+gap+.01;
        const cols=Math.floor((frame.width-2*frame.margin+gap)/cw),rows=Math.floor((frame.height-frame.top-frame.bottom+gap)/ch);
        if(cols*rows>=items.length){points=[];for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)points.push({x:cx+(x-(cols-1)/2)*cw,y:cy+(y-(rows-1)/2)*ch});points.sort((a,b)=>Math.hypot((a.x-cx)/1.85,a.y-cy)-Math.hypot((b.x-cx)/1.85,b.y-cy));}
      }
      const locked=order.filter(i=>options.locks?.[i.id]&&options.positions?.[i.id]);
      for(const item of locked){
        const m=metrics(item,ppm,font,modelFont,showModels),p=options.positions[item.id],r={id:item.id,x:p.x,y:p.y,...m};
        if(!inside(r,frame)||[...rects,...obstacles].some(b=>overlap(r,b,gap))){failed=true;break;}
        rects.push(r);positions[item.id]={x:r.x,y:r.y};
      }
      if(failed)continue;
      for(const item of order){
        if(positions[item.id])continue;
        const m=metrics(item,ppm,font,modelFont,showModels);let found;
        const previous=options.keepPositions&&options.positions?.[item.id];
        const pool=previous?[previous,...points]:points;
        for(const p of pool){const r={id:item.id,x:p.x,y:p.y,...m};if(inside(r,frame)&&![...rects,...obstacles].some(b=>overlap(r,b,gap))){found=r;break;}}
        if(!found){failed=true;break;}
        rects.push(found);positions[item.id]={x:found.x,y:found.y};
      }
      if(!failed)return {positions,ppm,rects,error:null};
    }
    return {error:'标签或锁定位置过于拥挤，请缩短名称、减小字号，或解除锁定后重排。'};
  }
  function migrateScale(saved,base){
    if(!saved||saved.library_version!=='0.1.0')return saved;
    const ships=new Map(base.ships.map(s=>[s.id,s]));
    const result={...base,...saved,library_version:base.library_version,provenance:base.provenance,stats:base.stats,
      assets:{...base.assets,...saved.assets},image_data:{...base.image_data,...saved.image_data}};
    result.ships=saved.ships.map(old=>{
      const current=ships.get(old.id);if(!current)return old;
      if(!old.modified_at)return current;
      const manual=old.dimensions_basis==='manual';
      return {...current,...old,sources:{...old.sources,rsi:current.sources.rsi},
        dimensions_m:manual?old.dimensions_m:current.dimensions_m,
        dimensions_basis:manual?'manual':current.dimensions_basis,
        official_conflict_axes:current.official_conflict_axes,
        calibration:old.calibration?.reference_pixels?old.calibration:current.calibration};
    });
    for(const [id,a] of Object.entries(result.assets)){
      const b=base.assets[id];
      if(b&&a.sha256===b.sha256)result.assets[id]={...a,calibration:b.calibration,scale_status:b.scale_status};
    }
    const retained=new Set(result.ships.map(s=>s.id));
    for(const [id,a] of Object.entries(result.assets))if(!retained.has(a.ship_id)){delete result.assets[id];delete result.image_data[id];}
    for(const s of result.ships){const c=s.calibration;
      if(c?.status?.startsWith('manual')&&positive(c.reference_pixels)){
        const id=s.assets[c.view],a=result.assets[id];if(a)result.assets[id]={...a,calibration:{...a.calibration,status:'manual_reference',method:'manual_reference',reference_span_px:Number(c.reference_pixels)}};
      }
    }
    result.upgraded_from='0.1.0';return result;
  }
  function migrate(saved,base){
    if(!saved)return saved;
    const prior=saved.library_version;
    let result=migrateScale(saved,base);
    if(saved.names_revision===base.names_revision)return result;
    const current=new Map(base.ships.map(s=>[s.id,s]));
    result={...result,library_version:base.library_version,names_revision:base.names_revision,
      provenance:{...result.provenance,chinese_names:base.provenance.chinese_names},
      ships:result.ships.map(old=>{
        const b=current.get(old.id),c=b?.community_name;if(!c)return old;
        const custom=old.name_zh_manual||!!old.name_zh&&old.name_zh!==c.previous_seed_name&&old.name_zh!==b.name_zh;
        const priorAliases=new Set(c.previous_seed_aliases||[]);
        const aliases=[...new Set([...b.aliases,...(old.aliases||[]).filter(a=>!priorAliases.has(a))])];
        return {...old,name_zh:custom?old.name_zh:b.name_zh,name_zh_status:custom?'user':'community_sourced',name_zh_manual:!!custom,
          aliases,community_name:c,sources:{...old.sources,community_name:b.sources.community_name}};
      })};
    result.upgraded_from=prior;return result;
  }
  return {FRAME,geometry,overlap,inside,metrics,layout,compactLayout,migrate};
});
