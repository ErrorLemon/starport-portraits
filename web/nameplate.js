'use strict';
(()=>{
  const $=id=>document.getElementById(id),lib=()=>window.FleetCatalog.get(),notify=m=>window.FleetCatalog.notify(m);
  const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const backgrounds=window.FLEET_BACKGROUNDS||[],W=1600,H=600,FONT='"PingFang SC","Microsoft YaHei","Heiti TC",sans-serif';
  const explanationDefaults=()=>({section:true,modelZh:true,modelEn:true,manufacturer:true,length:true,view:true,source:true});
  const explanationFields=[['section','英文栏目与档案标题'],['modelZh','舰船中文名'],['modelEn','舰船英文名'],['manufacturer','制造商'],['length','舰船长度'],['view','视角说明'],['source','背景来源说明']];
  const defaults=()=>({format:'sc-nameplate-settings',version:1,name:'你的游戏 ID',tagline:'向星海出发',fleet:'斯曼达洛舰队',shipId:'anvl-carrack',view:'angled',backgroundId:'carrack',customBackground:null,logo:null,nameSize:64,textSize:24,shipScale:100,shade:35,backgroundY:50,showExplanations:true,explanations:explanationDefaults(),accent:'#d8b779'});
  let settings=defaults(),token=0,active=false,lastError='',busy=false;const images=new Map();
  const root=$('nameplateWorkspace');
  root.innerHTML=`<div class="fleet-heading"><div><div class="eyebrow">PERSONAL FLIGHT CARD / OFFLINE STUDIO</div><h1>把你的名字，写进星海。</h1><p>选择专属舰船，搭配背景、称号与队徽，制作可分享的个人名牌。</p></div><div class="fleet-top-actions"><button class="button quiet" id="nameplateSaveProject">保存工程备份</button><button class="button quiet" id="nameplateImport">导入名牌设置</button><button class="button quiet" id="nameplateSave">保存名牌设置</button><button class="button accent" id="nameplateExport">导出个人名牌 ↗</button></div></div>
  <div class="nameplate-layout"><aside class="fleet-panel"><h2>个人资料</h2><label for="cardName">成员名称</label><input id="cardName" maxlength="40"><label for="cardTagline">称号 / 签名</label><input id="cardTagline" maxlength="60"><label for="cardFleet">舰队名称</label><input id="cardFleet" maxlength="60"><label for="cardSearch">搜索舰船</label><input id="cardSearch" type="search" placeholder="中文、英文、俗称…"><label for="cardShip">名牌舰船</label><select id="cardShip"></select><label for="cardView">舰船视角</label><select id="cardView"><option value="angled">斜俯视</option><option value="top">俯视</option></select><p id="cardShipInfo" class="fleet-subnote"></p>
  <details open><summary>背景与 Logo</summary><label for="cardBackground">背景图</label><select id="cardBackground"></select><div class="card-upload-actions"><button class="button quiet" id="cardUploadBackground">上传背景</button><button class="button quiet" id="cardRemoveBackground" hidden>移除上传背景</button></div><label for="cardShade">背景压暗 <span id="cardShadeValue"></span></label><input id="cardShade" type="range" min="0" max="80" step="1"><label for="cardBackgroundY">背景上下取景</label><input id="cardBackgroundY" type="range" min="0" max="100" step="1"><div class="fleet-logo-control"><span class="fleet-logo-label">名牌 Logo</span><div class="fleet-logo-actions"><img id="cardLogoPreview" class="fleet-logo-preview" alt="当前名牌 Logo" hidden><button class="button quiet" id="cardUploadLogo">上传 Logo</button><button class="button quiet" id="cardRemoveLogo" hidden>移除</button></div><button class="button quiet" id="cardUseFleetLogo">使用全家福 Logo</button></div><p class="fleet-subnote">背景支持 12 MB 内的 PNG、WebP、JPEG；Logo 支持 5 MB。图片保存在本机和设置备份中。</p><p id="cardBackgroundSource" class="fleet-subnote"></p></details>
  <details open><summary>排版与颜色</summary><div class="fleet-font-grid"><div><label for="cardNameSize">名字字号 / px</label><input id="cardNameSize" type="number" min="32" max="92" step="1"></div><div><label for="cardTextSize">签名字号 / px</label><input id="cardTextSize" type="number" min="14" max="36" step="1"></div></div><label for="cardShipScale">舰船显示大小 <span id="cardShipScaleValue"></span></label><input id="cardShipScale" type="range" min="55" max="125" step="1"><label for="cardAccent">强调色</label><input id="cardAccent" type="color"></details></aside>
  <div><div class="fleet-stage"><div class="stage-bar"><span class="fleet-statline">个人名牌 · 1600 × 600 画布</span><div class="stage-tools"><button id="cardToggleExplanations" class="button quiet" aria-pressed="false">全部隐藏</button><span class="fleet-save-hint">导出 3200 × 1200 PNG</span></div></div><details open class="explanation-controls"><summary>说明文字 · 逐项显示</summary><div class="explanation-grid">${explanationFields.map(([key,label])=>`<label><input type="checkbox" id="cardExplain_${key}">${label}</label>`).join('')}</div></details><div class="stage-canvas-wrap"><canvas id="nameplateCanvas" width="1600" height="600" aria-label="个人名牌预览"></canvas></div><div class="stage-caption">左侧为个人信息，右侧为舰船。名牌中的舰船为展示构图，不作为舰船长度比例比较。</div></div><div class="fleet-alert" id="nameplateWarnings" role="status"></div><p class="fleet-subnote">内置背景来自 RSI 官方公开图片，已随工具内嵌，断网也能使用。游戏素材 © CIG / RSI；本工具为玩家制作。</p></div></div>
  <input id="cardBackgroundFile" type="file" accept="image/png,image/webp,image/jpeg" hidden><input id="cardLogoFile" type="file" accept="image/png,image/webp,image/jpeg" hidden><input id="cardSettingsFile" type="file" accept=".json,application/json" hidden>`;
  const canvas=$('nameplateCanvas'),ctx=canvas.getContext('2d');
  function validate(data){
    if(!data||data.format!=='sc-nameplate-settings'||data.version!==1)throw new Error('不是有效的名牌设置');
    data={showExplanations:true,...data};
    if(typeof data.showExplanations!=='boolean')throw new Error('说明开关无效');
    if(data.explanations===undefined)data.explanations=Object.fromEntries(explanationFields.map(([key])=>[key,data.showExplanations]));
    if(!data.explanations||typeof data.explanations!=='object'||explanationFields.some(([key])=>typeof data.explanations[key]!=='boolean'))throw new Error('说明文字选项无效');
    data={...data,showExplanations:Object.values(data.explanations).some(Boolean)};
    for(const [key,max]of [['name',40],['tagline',60],['fleet',60]])if(typeof data[key]!=='string'||data[key].length>max)throw new Error('名牌文字格式无效');
    if(!data.name.trim())throw new Error('请填写成员名称');
    for(const [key,min,max]of [['nameSize',32,92],['textSize',14,36],['shipScale',55,125],['shade',0,80],['backgroundY',0,100]])if(!Number.isInteger(data[key])||data[key]<min||data[key]>max)throw new Error('名牌排版参数无效');
    if(!['angled','top'].includes(data.view)||typeof data.shipId!=='string'||data.shipId.length>160||!/^#[a-f0-9]{6}$/i.test(data.accent))throw new Error('舰船或颜色无效');
    if(data.backgroundId!=='custom'&&!backgrounds.some(b=>b.id===data.backgroundId))throw new Error('背景不在内置目录中');
    for(const [key,max]of [['customBackground',17*1024*1024],['logo',7*1024*1024]])if(data[key]&&(typeof data[key]!=='string'||data[key].length>max||!/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(data[key])))throw new Error('背景和 Logo 必须是有效的内嵌图片');
    if(data.backgroundId==='custom'&&!data.customBackground)throw new Error('缺少上传的背景图片');
    return {...defaults(),...data};
  }
  function imageFor(data){
    if(!data)return null;let hit=images.get(data);if(hit)return hit;
    const im=new Image();hit={im,ready:false};im.src=data;hit.promise=im.decode().then(()=>{if(im.width*im.height>32000000)throw new Error('图片像素过大');hit.ready=true;return im;}).catch(()=>null);images.set(data,hit);return hit;
  }
  function selected(){const ship=lib().ships.find(s=>s.id===settings.shipId),asset=lib().assets[ship?.assets?.[settings.view]];return {ship,asset,data:lib().image_data[asset?.id]};}
  function background(){return settings.backgroundId==='custom'?{data:settings.customBackground,credit:'自定义背景',source_url:''}:backgrounds.find(b=>b.id===settings.backgroundId);}
  function fitText(c,text,x,y,width,size,color,weight='400'){
    let px=size;c.font=`${weight} ${px}px ${FONT}`;while(px>10&&c.measureText(text).width>width){px-=1;c.font=`${weight} ${px}px ${FONT}`;}
    c.fillStyle=color;c.fillText(text,x,y,width);
  }
  function paint(c){
    c.clearRect(0,0,W,H);c.fillStyle='#0b1420';c.fillRect(0,0,W,H);
    const bg=imageFor(background()?.data),logo=imageFor(settings.logo),{ship,asset,data}=selected(),hero=imageFor(data);
    if(bg?.ready){const scale=Math.max(W/bg.im.width,H/bg.im.height),w=bg.im.width*scale,h=bg.im.height*scale;c.drawImage(bg.im,(W-w)/2,(H-h)*settings.backgroundY/100,w,h);}
    c.fillStyle=`rgba(3,9,18,${settings.shade/100})`;c.fillRect(0,0,W,H);
    const shade=c.createLinearGradient(0,0,W,0);shade.addColorStop(0,'rgba(5,12,23,.94)');shade.addColorStop(.43,'rgba(5,12,23,.88)');shade.addColorStop(.68,'rgba(5,12,23,.25)');shade.addColorStop(1,'rgba(5,12,23,.1)');c.fillStyle=shade;c.fillRect(0,0,W,H);
    c.strokeStyle=settings.accent+'77';c.lineWidth=1;c.strokeRect(24,24,W-48,H-48);
    c.textAlign='left';let headerX=76;
    if(logo?.ready){const scale=Math.min(70/logo.im.width,70/logo.im.height),w=logo.im.width*scale,h=logo.im.height*scale;c.drawImage(logo.im,76+(70-w)/2,43+(70-h)/2,w,h);headerX+=92;}
    if(settings.explanations.section)fitText(c,'PERSONAL FLIGHT CARD',headerX,63,560,12,settings.accent,'600');
    fitText(c,settings.fleet,headerX,100,560,24,'#e5eaf1','500');
    fitText(c,settings.name||'成员名称',76,209,630,settings.nameSize,'#f3f5f9','600');
    const taglineY=Math.max(258,209+settings.nameSize*.22+settings.textSize+8),ruleY=Math.max(288,taglineY+17);
    fitText(c,settings.tagline,79,taglineY,600,settings.textSize,'#c1ccdb');
    c.fillStyle=settings.accent;c.fillRect(79,ruleY,84,3);c.fillStyle=settings.accent+'44';c.fillRect(163,ruleY,180,1);
    if(settings.explanations.section)fitText(c,'舰船档案 / SELECTED VESSEL',79,342,600,12,settings.accent,'500');
    if(settings.explanations.modelZh)fitText(c,ship?.name_zh||ship?.name||'请选择舰船',76,383,630,27,'#edf1f7','500');
    if(settings.explanations.modelEn)fitText(c,ship?.name||'',79,414,620,17,'#b1c1d5');
    if(settings.explanations.manufacturer)fitText(c,ship?.manufacturer||'',79,449,620,14,'#99aac1');
    const facts=[settings.explanations.length&&ship?.dimensions_m?.length?ship.dimensions_m.length+' m':'',settings.explanations.view?(settings.view==='angled'?'斜俯视展示':'俯视展示'):''].filter(Boolean);if(facts.length)fitText(c,facts.join(' · '),79,488,620,13,'#99aac1');
    if(hero?.ready&&asset){
      const b=asset.alpha_bbox||[0,0,hero.im.width,hero.im.height],sw=b[2]-b[0],sh=b[3]-b[1];
      if(sw>0&&sh>0){const scale=Math.min(Math.min(710/sw,350/sh)*settings.shipScale/100,790/sw,394/sh),w=sw*scale,h=sh*scale;
        c.save();c.beginPath();c.rect(742,103,810,414);c.clip();c.shadowColor='#000b';c.shadowBlur=22;c.shadowOffsetY=16;c.drawImage(hero.im,b[0],b[1],sw,sh,1140-w/2,310-h/2,w,h);c.restore();}
    }
    c.strokeStyle='#9badc644';c.beginPath();c.moveTo(76,538);c.lineTo(W-76,538);c.stroke();
    if(settings.explanations.source)fitText(c,background()?.source_url?'背景：CIG / RSI · 非官方玩家作品':'自定义背景 · 星际公民玩家名牌',76,572,690,12,'#a0aec2');
    c.textAlign='right';c.font=`12px ${FONT}`;c.fillStyle='#c4cedd';c.fillText('开发：斯曼达洛舰队-Lemon_ACE',W-76,572,670);
  }
  async function draw(){
    const n=++token;busy=true;lastError='';paint(ctx);
    const {ship,asset,data}=selected(),needed=[imageFor(background()?.data),imageFor(settings.logo),imageFor(data)].filter(Boolean);
    await Promise.all(needed.map(i=>i.promise));if(n!==token)return;paint(ctx);busy=false;
    if(!ship||!asset||!data)lastError='当前舰船缺少所选视角的图片，请更换舰船或切换视角；不会导出缺船的名牌。';
    else if(needed.some(i=>!i.ready))lastError='背景、Logo 或舰船图片无法读取，请更换后再导出。';
    $('nameplateWarnings').textContent=lastError;$('nameplateExport').disabled=!!lastError;
  }
  function fill(){
    for(const [key]of explanationFields)$('cardExplain_'+key).checked=settings.explanations[key];$('cardToggleExplanations').textContent=settings.showExplanations?'全部隐藏':'全部显示';$('cardToggleExplanations').ariaPressed=String(!settings.showExplanations);
    for(const [id,key]of [['cardName','name'],['cardTagline','tagline'],['cardFleet','fleet'],['cardShip','shipId'],['cardView','view'],['cardNameSize','nameSize'],['cardTextSize','textSize'],['cardShipScale','shipScale'],['cardShade','shade'],['cardBackgroundY','backgroundY'],['cardAccent','accent']])$(id).value=settings[key];
    $('cardBackground').innerHTML=backgrounds.map(b=>`<option value="${escape(b.id)}">${escape(b.name)}</option>`).join('')+(settings.customBackground?'<option value="custom">我上传的背景</option>':'');$('cardBackground').value=settings.backgroundId;
    $('cardShadeValue').textContent=settings.shade+'%';$('cardShipScaleValue').textContent=settings.shipScale+'%';$('cardRemoveBackground').hidden=!settings.customBackground;
    $('cardLogoPreview').hidden=!settings.logo;$('cardRemoveLogo').hidden=!settings.logo;if(settings.logo)$('cardLogoPreview').src=settings.logo;else $('cardLogoPreview').removeAttribute('src');
    const {ship}=selected();$('cardShipInfo').textContent=ship?`${ship.name_zh||ship.name} · ${ship.dimensions_m?.length||'未知'} m`:'该型号未在当前图库中找到，请重新选择';
    const bg=background();$('cardBackgroundSource').textContent=bg?.source_url?`图片来源：${bg.source_url}`:'使用你上传的本机图片';
  }
  function choices(){
    const q=$('cardSearch').value.trim().toLowerCase(),list=lib().ships.filter(s=>!q||[s.name,s.name_zh,...s.aliases||[]].join(' ').toLowerCase().includes(q));
    $('cardShip').innerHTML=list.sort((a,b)=>a.name.localeCompare(b.name,'en',{numeric:true})).map(s=>`<option value="${escape(s.id)}">${escape(s.name_zh||s.name)} / ${escape(s.name)}</option>`).join('');
    if(list.some(s=>s.id===settings.shipId))$('cardShip').value=settings.shipId;else $('cardShip').value='';
  }
  function commit(){window.FleetNameplateStore.set(structuredClone(settings));fill();draw();}
  function restore(value){try{settings=value?validate(value):defaults();choices();fill();draw();}catch(e){$('nameplateWarnings').textContent=e.message;}}
  function open(){window.FleetWorkspace.showFleet(false);$('libraryWorkspace').hidden=true;$('nameplateWorkspace').hidden=false;$('allModels').classList.remove('nav-active');$('nameplateNav').classList.add('nav-active');$('workspaceBreadcrumb').textContent='本地工作空间 / 个人名牌';active=true;choices();fill();draw();}
  $('nameplateNav').addEventListener('click',open);
  const quick=document.createElement('button');quick.id='nameplateQuickNav';quick.className='button quiet';quick.textContent='个人名牌';quick.addEventListener('click',open);$('importLibrary').before(quick);
  $('cardSearch').addEventListener('input',choices);
  for(const [key]of explanationFields)$('cardExplain_'+key).addEventListener('change',()=>{settings.explanations[key]=$('cardExplain_'+key).checked;settings.showExplanations=Object.values(settings.explanations).some(Boolean);commit();});
  $('cardToggleExplanations').addEventListener('click',()=>{const value=!Object.values(settings.explanations).some(Boolean);for(const [key]of explanationFields)settings.explanations[key]=value;settings.showExplanations=value;commit();});
  for(const [id,key]of [['cardName','name'],['cardTagline','tagline'],['cardFleet','fleet'],['cardAccent','accent']])$(id).addEventListener('input',()=>{settings[key]=$(id).value;commit();});
  for(const [id,key]of [['cardShip','shipId'],['cardView','view'],['cardBackground','backgroundId']])$(id).addEventListener('change',()=>{if(!$(id).value)return;settings[key]=$(id).value;commit();});
  for(const [id,key,min,max]of [['cardNameSize','nameSize',32,92],['cardTextSize','textSize',14,36],['cardShipScale','shipScale',55,125],['cardShade','shade',0,80],['cardBackgroundY','backgroundY',0,100]])$(id).addEventListener('change',()=>{const n=Number($(id).value);if(!Number.isInteger(n)||n<min||n>max){notify(`请输入 ${min}–${max} 的整数`);fill();return;}settings[key]=n;commit();});
  async function readImage(file,maxMb){
    if(!file||!['image/png','image/webp','image/jpeg'].includes(file.type)||file.size>maxMb*1024*1024)throw new Error(`请选择 ${maxMb} MB 内的 PNG、WebP 或 JPEG`);
    const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('无法读取图片'));r.readAsDataURL(file);});
    const hit=imageFor(data);await hit.promise;if(!hit.ready)throw new Error('图片无法解码或超过 3200 万像素');return data;
  }
  for(const [button,input,key,max]of [['cardUploadBackground','cardBackgroundFile','customBackground',12],['cardUploadLogo','cardLogoFile','logo',5]]){
    $(button).addEventListener('click',()=>$(input).click());
    $(input).addEventListener('change',async()=>{const file=$(input).files[0];if(!file)return;try{const data=await readImage(file,max);if(settings[key])images.delete(settings[key]);settings[key]=data;if(key==='customBackground')settings.backgroundId='custom';commit();}catch(e){notify(e.message);}finally{$(input).value='';}});
  }
  $('cardRemoveBackground').addEventListener('click',()=>{if(settings.customBackground)images.delete(settings.customBackground);settings.customBackground=null;if(settings.backgroundId==='custom')settings.backgroundId='carrack';commit();});
  $('cardRemoveLogo').addEventListener('click',()=>{settings.logo=null;commit();});
  $('cardUseFleetLogo').addEventListener('click',()=>{const logo=window.FleetNameplateStore.logo();if(!logo){notify('请先在全家福中上传 Logo，或直接在这里上传');return;}settings.logo=logo;commit();});
  function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
  const filename=()=>settings.name.replace(/[\\/:*?"<>|]/g,'-').slice(0,40)||'个人名牌';
  $('nameplateSaveProject').addEventListener('click',()=>{window.FleetNameplateStore.set(structuredClone(settings));$('projectExport').click();});
  $('nameplateSave').addEventListener('click',()=>{try{validate(settings);download(new Blob([JSON.stringify(settings)],{type:'application/json'}),filename()+'.nameplate.json');}catch(e){notify(e.message);}});
  $('nameplateImport').addEventListener('click',()=>$('cardSettingsFile').click());
  $('cardSettingsFile').addEventListener('change',async()=>{const file=$('cardSettingsFile').files[0];if(!file)return;try{if(file.size>30*1024*1024)throw new Error('名牌设置超过 30 MB');const next=validate(JSON.parse(await file.text()));settings=next;choices();commit();notify('名牌设置已恢复');}catch(e){notify('导入失败：'+e.message);}finally{$('cardSettingsFile').value='';}});
  $('nameplateExport').addEventListener('click',async()=>{
    $('nameplateExport').disabled=true;try{validate(settings);await draw();if(lastError)throw new Error(lastError);const output=document.createElement('canvas');output.width=3200;output.height=1200;const c=output.getContext('2d');c.scale(2,2);paint(c);const blob=await new Promise(resolve=>output.toBlob(resolve,'image/png'));if(!blob)throw new Error('名牌生成失败');download(blob,filename()+'-个人名牌.png');output.width=output.height=0;notify('个人名牌已生成 · 3200 × 1200 PNG');}catch(e){notify(e.message);}finally{$('nameplateExport').disabled=!!lastError;}
  });
  window.FleetNameplate={validate,restore,open,libraryChanged:()=>{choices();fill();if(active)draw();},status:()=>({settings:structuredClone(settings),busy,error:lastError})};
  restore(window.FleetNameplateStore.get());
})();
