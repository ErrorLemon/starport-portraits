'use strict';
(()=>{
  const $=id=>document.getElementById(id),E=window.FleetEngine,esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uuid=()=>crypto.randomUUID(),lib=()=>window.FleetCatalog.get(),notify=m=>window.FleetCatalog.notify(m);
  const explanationDefaults=()=>({brand:true,counts:true,model:true,length:true,scale:true,view:true,source:true});
  const explanationFields=[['brand','工具英文标识'],['counts','成员与舰船统计'],['model','舰船型号'],['length','舰船长度'],['scale','比例尺'],['view','视角与比例说明'],['source','来源与数据快照']];
  const fresh=()=>({format:'sc-fleet-project',schema_version:1,title:'我们的舰队',subtitle:'STAR CITIZEN · FLEET PORTRAIT',view:'top',rows:[],positions:{},locks:{},ppm:3,font:18,modelFont:13,titleFont:35,subtitleFont:13,layoutMode:'radial',headerAlign:'left',headerX:56,headerY:52,showExplanations:true,explanations:explanationDefaults(),nameplate:null,gap:22,bg:'#090e17',showModels:true,logo:null,updated_at:null});
  let editingRow=null;
  let project=fresh(),items=[],omitted=[],selected=null,projectDb,saveTimer,renderToken=0,dirty=false,active=false,loadingImages=false;
  const cache=new Map();
  const root=$('fleetWorkspace');
  root.innerHTML=`
    <div class="fleet-heading"><div><div class="eyebrow">FLEET PORTRAIT / OFFLINE STUDIO</div><h1>让每一艘船，都有归属。</h1><p>添加成员与舰船，按同一比例组成舰队全家福。支持拖动、锁定与随时修改。</p></div><div class="fleet-top-actions"><button class="button light" id="excelImport">导入 Excel 名单</button><button class="button quiet" id="projectImport">导入工程</button><button class="button quiet" id="projectExport">保存工程备份</button><button class="button accent" id="pngExport">导出 4K 大图 ↗</button></div></div>
    <div class="fleet-layout"><aside class="fleet-panel"><h2>＋ 添加成员舰船</h2><button class="button quiet" id="downloadExcelTemplate">下载标准 Excel 模板</button><label for="ownerName">成员名称</label><input id="ownerName" maxlength="40" placeholder="输入成员游戏 ID"><label for="shipSearch">搜索舰船</label><input id="shipSearch" type="search" placeholder="中文、英文、俗称…"><label for="shipChoice">舰船型号</label><select id="shipChoice"></select><div class="fleet-input-row"><div><label for="ownerQuantity">拥有数量</label><input id="ownerQuantity" type="number" min="1" max="50" value="1"></div><div><label>单位</label><input value="艘 / 辆" disabled></div></div><button class="button accent" id="addOwnership">添加到舰队</button><button class="button quiet" id="cancelOwnershipEdit" hidden>取消编辑</button><p class="fleet-subnote" id="shipChoiceInfo"></p>
    <details open><summary>画布与比例</summary><label for="fleetTitle">全家福标题</label><input id="fleetTitle" maxlength="70"><div class="fleet-logo-control"><span class="fleet-logo-label">舰队 Logo</span><div class="fleet-logo-actions"><img id="fleetLogoPreview" class="fleet-logo-preview" alt="当前舰队 Logo" hidden><button id="chooseLogo" class="button quiet" type="button">上传 Logo</button><button id="clearLogo" class="button quiet" type="button" hidden>移除</button></div><p class="fleet-subnote">显示在标题左侧，随大图导出。支持 5 MB 内 PNG、WebP、JPEG；推荐透明 PNG。</p></div><label for="fleetSubtitle">副标题</label><input id="fleetSubtitle" maxlength="100"><label for="fleetHeaderAlign">标题区位置</label><select id="fleetHeaderAlign"><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option><option value="custom">自定义位置</option></select><div class="fleet-font-grid"><div><label for="fleetHeaderX">左边距 X / px</label><input id="fleetHeaderX" type="number" min="56" max="2344" step="1"></div><div><label for="fleetHeaderY">上边距 Y / px</label><input id="fleetHeaderY" type="number" min="12" max="1232" step="1"></div></div><p class="fleet-subnote">标题、副标题和 Logo 整体移动。自定义坐标以 2400 × 1350 画布左上角为起点；超出边界时自动限制，自动排列会避让标题区。</p><label for="fleetView">图片视角</label><select id="fleetView"><option value="top">俯视 · 长度比例</option><option value="angled">斜俯视 · 近似展示</option></select><label for="fleetTitleFont">标题字号 / px</label><input id="fleetTitleFont" type="number" min="16" max="56" step="1"><label for="fleetSubtitleFont">副标题字号 / px</label><input id="fleetSubtitleFont" type="number" min="8" max="28" step="1"><div class="fleet-font-grid"><div><label for="fleetFont">成员名字号 / px <span id="fontValue"></span></label><input id="fleetFont" type="number" min="6" max="40" step="1"></div><div><label for="fleetModelFont">舰船信息字号 / px</label><input id="fleetModelFont" type="number" min="6" max="28" step="1"></div></div><p class="fleet-subnote">船多时可将成员名设为 8–12 px、型号设为 6–9 px，或关闭型号。修改后自动重排并重新计算文字占位。</p><label for="fleetLayoutMode">排列方式</label><select id="fleetLayoutMode"><option value="radial">中心辐射排列</option><option value="compact">紧凑型排列</option></select><p class="fleet-subnote">紧凑型会把小船填入大船间的可用空隙，建议排列间距 4–8 px。舰船始终使用同一长度比例。</p><label for="fleetGap">排列间距 <span id="gapValue"></span></label><input id="fleetGap" type="range" min="0" max="60" step="1"><label for="fleetBg">背景色</label><input id="fleetBg" type="color"></details>
    <details><summary>名单批量录入</summary><p class="file-help">每行：成员名称,英文型号,数量<br>支持逗号分隔及带引号的名称。未识别行会保留提示。</p><textarea id="rosterText" rows="5" placeholder="成员A,Carrack,1&#10;成员B,C2 Hercules,2"></textarea><button id="pasteRoster" class="button quiet">检查并加入名单</button><button id="csvExport" class="button quiet">导出成员 CSV</button></details>
    <p id="projectState" class="fleet-project-state">请保存工程备份，以便跨浏览器或换电脑继续编辑。</p><button class="button quiet" id="loadExample">载入示例舰队</button></aside>
    <div><div class="fleet-stage"><div class="stage-bar"><span id="fleetCount" class="fleet-statline">尚未添加舰船</span><div class="stage-tools"><button id="fleetToggleExplanations" class="button quiet" aria-pressed="false">全部隐藏</button><button id="autoArrange" class="button quiet">自动排列</button><button id="lockSelected" class="button quiet">锁定 / 解锁选中</button><button id="unlockAll" class="button quiet">全部解锁</button></div></div><details open class="explanation-controls"><summary>说明文字 · 逐项显示</summary><div class="explanation-grid">${explanationFields.map(([key,label])=>`<label><input type="checkbox" id="${key==='model'?'showModels':'fleetExplain_'+key}">${label}</label>`).join('')}</div></details><div class="stage-canvas-wrap"><canvas id="fleetCanvas" width="2400" height="1350" aria-label="舰队全家福画布，可拖动舰船微调位置" tabindex="0"></canvas></div><div class="stage-caption" id="scaleCaption"></div></div><div class="fleet-alert" id="fleetWarnings"></div><div class="fleet-panel fleet-list"><div class="fleet-list-head"><h2>成员舰船清单</h2><span class="fleet-save-hint">修改名称、数量后自动更新</span></div><div class="fleet-roster-wrap"><table class="fleet-roster"><thead><tr><th>成员</th><th>舰船型号</th><th>数量</th><th>长度</th><th>操作</th></tr></thead><tbody id="fleetRoster"></tbody></table><div id="rosterEmpty" class="fleet-empty">从左侧添加成员和舰船，<br>或载入示例查看排列效果。</div></div></div></div></div>
    <input id="projectFile" type="file" accept=".json,application/json" hidden><input id="fleetLogo" type="file" accept="image/png,image/webp,image/jpeg" hidden>`;
  const canvas=$('fleetCanvas'),ctx=canvas.getContext('2d');
  const quick=document.createElement('button');quick.id='fleetQuickNav';quick.className='button quiet';quick.textContent='成员与全家福';$('importLibrary').before(quick);
  function showFleet(value=true){active=value;$('nameplateWorkspace').hidden=true;$('nameplateNav').classList.remove('nav-active');$('workspaceBreadcrumb').innerHTML='本地工作空间 <span>/</span> '+(value?'成员与全家福':'舰船素材库');$('libraryWorkspace').hidden=value;root.hidden=!value;$('fleetNav').classList.toggle('nav-active',value);$('allModels').classList.toggle('nav-active',!value);quick.textContent=value?'返回素材库':'成员与全家福';if(value){buildItems();if(items.some(i=>!project.positions[i.id]))arrange(true);else draw();} }
  $('fleetNav').addEventListener('click',()=>showFleet());quick.addEventListener('click',()=>showFleet(!active));$('allModels').addEventListener('click',()=>showFleet(false));
  $('manufacturers').addEventListener('click',()=>showFleet(false));
  window.FleetWorkspace={showFleet};
  window.FleetNameplateStore={get:()=>project.nameplate||null,set:value=>{project.nameplate=value;save();},logo:()=>project.logo};
  function state(message){$('projectState').textContent=message;}
  function save(){
    project.updated_at=new Date().toISOString();dirty=true;clearTimeout(saveTimer);state('修改已应用 · 请保存工程备份');
    saveTimer=setTimeout(()=>{if(!projectDb)return;try{const tx=projectDb.transaction('projects','readwrite');tx.objectStore('projects').put(project,'current');tx.oncomplete=()=>{dirty=false;state('工程已暂存本机 · 建议保留工程备份文件');};tx.onerror=()=>state('暂存失败 · 请保存工程备份');}catch{state('请保存工程备份以保留当前修改');}},500);
  }
  function fillSettings(){for(const [id,key]of[['fleetTitle','title'],['fleetSubtitle','subtitle'],['fleetView','view'],['fleetFont','font'],['fleetModelFont','modelFont'],['fleetTitleFont','titleFont'],['fleetSubtitleFont','subtitleFont'],['fleetLayoutMode','layoutMode'],['fleetHeaderAlign','headerAlign'],['fleetGap','gap'],['fleetBg','bg']])$(id).value=project[key];for(const [key]of explanationFields)$(key==='model'?'showModels':'fleetExplain_'+key).checked=project.explanations[key];syncHeaderControls();$('fleetToggleExplanations').textContent=project.showExplanations?'全部隐藏':'全部显示';$('fleetToggleExplanations').ariaPressed=String(!project.showExplanations);$('fontValue').textContent=project.font;$('gapValue').textContent=project.gap;$('clearLogo').hidden=!project.logo;$('chooseLogo').textContent=project.logo?'更换 Logo':'上传 Logo';$('fleetLogoPreview').hidden=!project.logo;if(project.logo)$('fleetLogoPreview').src=project.logo;else $('fleetLogoPreview').removeAttribute('src');window.FleetNameplate?.restore(project.nameplate);}
  function choices(){
    const q=$('shipSearch').value.trim().toLowerCase(),previous=$('shipChoice').value;
    const models=lib().ships.filter(s=>!q||[s.name,s.name_zh,...s.aliases||[]].join(' ').toLowerCase().includes(q)).sort((a,b)=>a.name.localeCompare(b.name,'en',{numeric:true}));
    $('shipChoice').innerHTML=models.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}${s.name_zh?' · '+esc(s.name_zh):''}</option>`).join('');
    if(models.some(s=>s.id===previous))$('shipChoice').value=previous;choiceInfo();
  }
  function choiceInfo(){const s=lib().ships.find(s=>s.id===$('shipChoice').value),a=lib().assets[s?.assets?.[project.view]];
    $('shipChoiceInfo').textContent=s?`${s.dimensions_m?.length||'未知'} 米 · ${s.dimensions_basis?.startsWith('rsi_')?'官网长度':'非官网 / 人工长度'}${a?' · '+(a.style==='clay'?'灰色模型':a.style==='colored'?'彩色贴图':'自定义图片'):' · 缺少当前视角素材'}${s.official_conflict_axes?.length?' · 官网存在不同数值':''}`:'没有匹配型号';}
  const effectiveModels=()=>project.explanations.model||project.explanations.length;
  const vesselLabel=(name,length)=>[project.explanations.model?name:'',project.explanations.length?`${length} m`:''].filter(Boolean).join(' · ');
  function buildItems(){
    items=[];omitted=[];const byId=new Map(lib().ships.map(s=>[s.id,s]));
    for(const row of project.rows){const s=byId.get(row.ship_id),a=lib().assets[s?.assets?.[project.view]],g=E.geometry(s,a);
      if(!s||!a||!lib().image_data[a.id]||!g){omitted.push({row,reason:!s?'型号不在当前图库':!a?'缺少当前视角图片':'缺少有效长度或像素参考'});continue;}
      ctx.font=`500 ${project.font}px "PingFang SC","Microsoft YaHei","Heiti TC",sans-serif`;const ownerWidth=ctx.measureText(row.member).width;
      ctx.font=`${project.modelFont}px "PingFang SC","Microsoft YaHei","Heiti TC",sans-serif`;const name=s.name_zh||s.name;
      const textWidth=Math.max(ownerWidth,effectiveModels()?ctx.measureText(vesselLabel(name,g.length)).width:0);
      for(let n=0;n<row.quantity;n++)items.push({id:`${row.id}:${n}`,row_id:row.id,member:row.member,name,ship:s,asset:a,geometry:g,textWidth});
    }
    const ids=new Set(items.map(i=>i.id)),known=new Set(project.rows.flatMap(r=>Array.from({length:r.quantity},(_,n)=>`${r.id}:${n}`)));for(const k of Object.keys(project.positions))if(!known.has(k)){delete project.positions[k];delete project.locks[k];}
    if(!ids.has(selected))selected=null;
    renderRoster();warningText();
    const total=project.rows.reduce((n,r)=>n+r.quantity,0);$('fleetCount').textContent=`${new Set(project.rows.map(r=>r.member_id||r.member)).size} 位成员 · ${total} 艘 / 辆${omitted.length?` · ${omitted.reduce((n,o)=>n+o.row.quantity,0)} 艘未入画`:''}`;
  }
  function warningText(extra=''){
    const messages=[];
    if(project.view==='angled')messages.push('斜俯视采用投影近似，同一长度比例仍保留，但相机透视未经求解。精确比较长度请使用俯视模式。');
    const conflicts=items.filter(i=>i.ship.official_conflict_axes?.length),pose=items.filter(i=>i.geometry.flags.includes('pose_or_extent_ratio_mismatch')),unofficial=items.filter(i=>!i.geometry.official),shared=items.filter(i=>i.asset.shared_with?.length);
    if(conflicts.length)messages.push(`${new Set(conflicts.map(i=>i.ship.id)).size} 个型号的官网详情与矩阵数值不同；当前按各型号选定的来源绘制，可在素材库切换。`);
    if(pose.length)messages.push(`${new Set(pose.map(i=>i.ship.id)).size} 个型号的俯视长宽比与官网不符，可能涉及姿态、机翼或原始素材；保持原图形状，未强行拉伸。`);
    if(unofficial.length)messages.push(`${unofficial.length} 艘使用非官网或人工长度。`);
    if(shared.length)messages.push(`${new Set(shared.map(i=>i.ship.id)).size} 个型号使用来源共享图片，涂装或细节需复核。`);
    if(omitted.length)messages.push('未入画：'+omitted.map(o=>`${o.row.member} / ${o.row.quantity} × ${lib().ships.find(s=>s.id===o.row.ship_id)?.name||o.row.ship_id}（${o.reason}）`).join('；'));
    if(extra)messages.push(extra);$('fleetWarnings').textContent=messages.join(' ');
  }
  function headerGeometry(context=ctx){
    const W=E.FRAME.width,H=E.FRAME.height,offset=project.logo?98:0,maxText=W-112-offset;
    context.font=`500 ${project.titleFont}px "PingFang SC","Microsoft YaHei","Heiti TC",sans-serif`;
    const titleWidth=Math.min(maxText,context.measureText(project.title).width);
    context.font=`${project.subtitleFont}px "PingFang SC","Microsoft YaHei","Heiti TC",sans-serif`;
    const subtitleWidth=Math.min(maxText,context.measureText(project.subtitle).width);
    const textW=Math.max(1,titleWidth,subtitleWidth),w=textW+offset,titleY=5+project.titleFont,subtitleY=titleY+project.subtitleFont+14;
    const logoSlotH=Math.max(70,subtitleY),h=Math.max(project.logo?logoSlotH:0,subtitleY+Math.max(4,project.subtitleFont*.25));
    const clampX=x=>Math.max(56,Math.min(W-56-w,x)),clampY=y=>Math.max(12,Math.min(H-E.FRAME.bottom-h,y));
    const x=clampX(project.headerAlign==='custom'?project.headerX:project.headerAlign==='center'?(W-w)/2:project.headerAlign==='right'?W-56-w:56);
    const y=project.headerAlign==='custom'?clampY(project.headerY):52;
    const align=project.headerAlign==='center'?'center':project.headerAlign==='right'?'right':'left';
    const textX=x+offset+(align==='center'?textW/2:align==='right'?textW:0);
    return {x,y,w,h,textX,textW,titleY,subtitleY,logoSlotH,align};
  }
  function syncHeaderControls(){
    const h=headerGeometry();for(const [id,key]of [['fleetHeaderX','x'],['fleetHeaderY','y']]){$(id).value=Math.round(h[key]);$(id).disabled=project.headerAlign!=='custom';}
  }
  function headerObstacle(){const h=headerGeometry();return {x:h.x+h.w/2,y:h.y+h.h/2,w:h.w+16,h:h.h+16};}
  function portraitFrame(){return {...E.FRAME,top:Math.max(145,97+project.titleFont+project.subtitleFont)};}
  function arrange(keepPositions=false){
    buildItems();const result=E.layout(items,{frame:portraitFrame(),font:project.font,modelFont:project.modelFont,showModels:effectiveModels(),obstacles:[headerObstacle()],mode:project.layoutMode,gap:project.gap,positions:project.positions,locks:project.locks,keepPositions,ppm:keepPositions?project.ppm:undefined});
    if(result.error){warningText(result.error);notify(result.error);save();draw();return false;}
    project.positions={...project.positions,...result.positions};project.ppm=result.ppm;save();draw();return true;
  }
  function rectFor(item){const m=E.metrics(item,project.ppm,project.font,project.modelFont,effectiveModels()),p=project.positions[item.id];return p?{...m,x:p.x,y:p.y,id:item.id}:null;}
  function imageFor(asset){const data=lib().image_data[asset.id];let hit=cache.get(asset.id);if(hit&&hit.data===data)return hit;
    const im=new Image();hit={data,im,ready:false,promise:null};im.src=data;hit.promise=im.decode().then(()=>{hit.ready=true;return im;}).catch(()=>null);cache.set(asset.id,hit);return hit;}
  function logoFor(){
    if(!project.logo)return null;
    let hit=cache.get('project-logo');if(hit&&hit.data===project.logo)return hit;
    const im=new Image();hit={data:project.logo,im,ready:false};im.src=project.logo;
    hit.promise=im.decode().then(()=>{hit.ready=true;return im;}).catch(()=>null);cache.set('project-logo',hit);return hit;
  }
  function line(context,text,x,y,maxWidth){context.fillText(text,x,y,maxWidth);}
  function paint(context,withSelection=true){
    const W=E.FRAME.width,H=E.FRAME.height,font=project.font;
    context.clearRect(0,0,W,H);context.fillStyle=project.bg;context.fillRect(0,0,W,H);
    const grad=context.createRadialGradient(W*.48,H*.42,20,W*.48,H*.42,W*.65);grad.addColorStop(0,'rgba(87,107,135,.14)');grad.addColorStop(1,'rgba(0,0,0,.22)');context.fillStyle=grad;context.fillRect(0,0,W,H);
    // Small fixed stars are part of the canvas, fully reproducible offline.
    for(let i=0;i<110;i++){const x=(i*7919%W),y=(i*3931%H);context.fillStyle=`rgba(164,181,206,${.07+(i%4)*.035})`;context.fillRect(x,y,1.5,1.5);}
    if(project.explanations.brand){
      context.textAlign='left';context.fillStyle='#d5b681';context.font='600 11px "PingFang SC","Microsoft YaHei","Heiti TC",sans-serif';line(context,'S T A R P O R T   P O R T R A I T S',58,43,800);
    }
    if(project.explanations.counts){
      context.textAlign='right';context.fillStyle='#b7c3d4';context.font='13px "PingFang SC","Microsoft YaHei","Heiti TC",sans-serif';line(context,`${new Set(project.rows.map(r=>r.member_id||r.member)).size} MEMBERS  /  ${items.length} VESSELS`,W-57,43,300);
    }
    const logo=logoFor(),header=headerGeometry(context);
    if(logo?.ready){const scale=Math.min(80/logo.im.width,70/logo.im.height),w=logo.im.width*scale,h=logo.im.height*scale;context.drawImage(logo.im,header.x+2+(80-w)/2,header.y+(header.logoSlotH-h)/2,w,h);}
    context.textAlign=header.align;context.fillStyle='#eef0f4';context.font=`500 ${project.titleFont}px "PingFang SC","Microsoft YaHei","Heiti TC",sans-serif`;line(context,project.title,header.textX,header.y+header.titleY,header.textW);
    context.fillStyle='#8c9cb3';context.font=`${project.subtitleFont}px "PingFang SC","Microsoft YaHei","Heiti TC",sans-serif`;line(context,project.subtitle,header.textX,header.y+header.subtitleY,header.textW);
    if(project.showExplanations){context.strokeStyle='#64718b40';context.lineWidth=1;context.beginPath();context.moveTo(57,portraitFrame().top-12);context.lineTo(W-57,portraitFrame().top-12);context.stroke();}
    const failed=[];
    for(const item of items){const r=rectFor(item);if(!r)continue;const {im,ready}=imageFor(item.asset),box=item.geometry.crop;
      const top=r.y-r.h/2,left=r.x-r.imageW/2;
      if(ready){context.save();context.shadowColor='#0009';context.shadowBlur=13;context.shadowOffsetY=7;context.drawImage(im,box[0],box[1],box[2]-box[0],box[3]-box[1],left,top,r.imageW,r.imageH);context.restore();}
      else failed.push(item);
      context.textAlign='center';context.font=`500 ${font}px "PingFang SC","Microsoft YaHei","Heiti TC",sans-serif`;context.fillStyle='#d6dde8';line(context,item.member,r.x,top+r.memberBaseline,r.w-6);
      if(effectiveModels()){context.font=`${project.modelFont}px "PingFang SC","Microsoft YaHei","Heiti TC",sans-serif`;context.fillStyle='#8192aa';line(context,vesselLabel(item.name,item.geometry.length),r.x,top+r.modelBaseline,r.w-6);}
      if(withSelection&&item.id===selected){context.strokeStyle='#e7bb70';context.lineWidth=2;context.setLineDash([7,5]);context.strokeRect(r.x-r.w/2-4,r.y-r.h/2-4,r.w+8,r.h+8);context.setLineDash([]);}
      if(withSelection&&project.locks[item.id]){context.fillStyle='#c7a775';context.font='12px "PingFang SC","Microsoft YaHei","Heiti TC",sans-serif';context.textAlign='right';context.fillText('◆',r.x+r.w/2,top-6);}
    }
    if(!items.length&&project.showExplanations){context.fillStyle='#65768f';context.textAlign='center';context.font='26px "PingFang SC","Microsoft YaHei","Heiti TC",sans-serif';context.fillText('添加成员和舰船，组成你的第一张舰队全家福',W/2,H/2);context.font='16px "PingFang SC","Microsoft YaHei","Heiti TC",sans-serif';context.fillText('统一比例 · 中心辐射排列 · 本机离线保存',W/2,H/2+40);}
    if(project.showExplanations){
    context.strokeStyle='#64718b40';context.beginPath();context.moveTo(57,H-95);context.lineTo(W-57,H-95);context.stroke();
    if(project.explanations.scale){
    context.textAlign='left';context.fillStyle='#a6b5ca';context.font='12px "PingFang SC","Microsoft YaHei","Heiti TC",sans-serif';const scaleLen=project.ppm*50;const bar=Math.min(scaleLen,450),metres=bar/project.ppm;
    context.strokeStyle='#bba175';context.lineWidth=2;context.beginPath();context.moveTo(58,H-61);context.lineTo(58+bar,H-61);context.moveTo(58,H-66);context.lineTo(58,H-56);context.moveTo(58+bar,H-66);context.lineTo(58+bar,H-56);context.stroke();context.fillText(`${Number(metres.toFixed(1))} m`,66+bar,H-56);
    }
    context.textAlign='left';context.fillStyle='#7789a3';context.font='11px "PingFang SC","Microsoft YaHei","Heiti TC",sans-serif';const uncertain=items.some(i=>!i.geometry.official||i.ship.official_conflict_axes?.length||i.geometry.flags.includes('pose_or_extent_ratio_mismatch'));
    if(project.explanations.view)line(context,project.view==='top'?`俯视长度比例${uncertain?' · 部分来源 / 姿态需复核':''}`:'斜俯视投影近似 · 参考长度比例，未经相机透视校准',58,H-28,W-450);
    context.textAlign='right';if(project.explanations.source)context.fillText(`RSI / FLEETYARDS · 数据快照 2026-10-21${omitted.length?' · '+omitted.reduce((n,o)=>n+o.row.quantity,0)+' 艘未入画':''}`,W-57,H-29);
    }
    context.textAlign='right';
    // Fixed attribution is painted into every preview and export, independent of project settings.
    context.fillStyle='#c5cfdf';context.font='13px "PingFang SC","Microsoft YaHei","Heiti TC",sans-serif';context.fillText('开发：斯曼达洛舰队-Lemon_ACE',W-57,H-56);
    return failed;
  }
  async function draw(){
    const token=++renderToken;loadingImages=false;paint(ctx);$('scaleCaption').textContent=`${project.view==='top'?'俯视图按舰长统一缩放':'斜俯视图采用近似投影'} · ${project.layoutMode==='compact'?'紧凑型排列':'中心辐射排列'} · ${project.ppm.toFixed(3)} 画布像素 / 米 · 导出 3840 × 2160 · 点击舰船后拖动；锁定可固定位置。`;
    const needed=items.map(i=>imageFor(i.asset).promise),logo=logoFor();if(logo)needed.push(logo.promise);
    if(needed.length){loadingImages=true;await Promise.all(needed);if(token!==renderToken)return;loadingImages=false;paint(ctx);}
    const bad=items.filter(i=>!imageFor(i.asset).ready);if(token===renderToken&&bad.length)warningText(`有 ${bad.length} 张图片无法解码，请在素材库替换后再导出。`);
    if(token===renderToken&&logo&&!logo.ready)warningText('舰队 Logo 无法解码，请更换图片或移除后再导出。');
  }
  function renderRoster(){
    $('rosterEmpty').hidden=project.rows.length>0;
    $('fleetRoster').innerHTML=project.rows.map(row=>{const s=lib().ships.find(s=>s.id===row.ship_id),warning=omitted.find(o=>o.row.id===row.id);return `<tr data-row="${esc(row.id)}" class="${items.find(i=>i.id===selected)?.row_id===row.id?'selected':''}"><td><input data-field="member" value="${esc(row.member)}" maxlength="40" aria-label="成员名称"></td><td>${esc(s?.name_zh||s?.name||row.ship_id)}<small class="model-en">${esc(s?.name||'')}</small>${warning?`<span class="row-warning">${esc(warning.reason)} · 未入画</span>`:''}</td><td><input type="number" data-field="quantity" value="${row.quantity}" min="1" max="50" aria-label="拥有数量"></td><td class="fleet-row-muted">${s?.dimensions_m?.length||'—'} m</td><td><button data-action="select">定位</button><button data-action="edit">修改</button><button data-action="delete">删除</button></td></tr>`;}).join('');
  }
  function total(){return project.rows.reduce((n,r)=>n+r.quantity,0);}
  function add(member,shipId,quantity){if(total()+quantity>200)throw new Error('单张全家福最多 200 艘，请拆分为多个工程');const match=project.rows.find(r=>r.member===member&&r.ship_id===shipId);if(match){if(match.quantity+quantity>50)throw new Error('同一成员同一型号每行最多 50 艘');match.quantity+=quantity;}else project.rows.push({id:uuid(),member,ship_id:shipId,quantity});}
  $('addOwnership').addEventListener('click',()=>{const member=$('ownerName').value.trim(),quantity=Number($('ownerQuantity').value),shipId=$('shipChoice').value;if(!member||!shipId){notify('请填写成员名称并选择舰船');return;}if(!Number.isInteger(quantity)||quantity<1||quantity>50){notify('数量须为 1–50 的整数');return;}try{if(editingRow){const row=project.rows.find(r=>r.id===editingRow);if(!row)throw new Error('待编辑记录已删除');if(total()-row.quantity+quantity>200)throw new Error('总数超过 200 艘');Object.assign(row,{member,ship_id:shipId,quantity});cancelRowEdit();}else add(member,shipId,quantity);arrange(true);}catch(e){notify(e.message);}});
  function cancelRowEdit(){editingRow=null;$('addOwnership').textContent='添加到舰队';$('cancelOwnershipEdit').hidden=true;}
  $('cancelOwnershipEdit').addEventListener('click',cancelRowEdit);
  $('shipSearch').addEventListener('input',choices);$('shipChoice').addEventListener('change',choiceInfo);
  $('fleetRoster').addEventListener('change',event=>{const field=event.target.dataset.field,row=project.rows.find(r=>r.id===event.target.closest('[data-row]')?.dataset.row);if(!row||!field)return;
    if(field==='quantity'){const n=Number(event.target.value);if(!Number.isInteger(n)||n<1||n>50||total()-row.quantity+n>200){notify('数量须为 1–50，且总数不超过 200');renderRoster();return;}row.quantity=n;}else{const name=event.target.value.trim();if(!name){notify('成员名称不能为空');renderRoster();return;}row.member=name;}arrange(true);
  });
  $('fleetRoster').addEventListener('click',event=>{const b=event.target.closest('[data-action]'),row=project.rows.find(r=>r.id===b?.closest('[data-row]')?.dataset.row);if(!b||!row)return;if(b.dataset.action==='edit'){editingRow=row.id;$('ownerName').value=row.member;$('shipSearch').value='';choices();$('shipChoice').value=row.ship_id;$('ownerQuantity').value=row.quantity;$('addOwnership').textContent='保存成员舰船修改';$('cancelOwnershipEdit').hidden=false;choiceInfo();$('ownerName').focus();return;}if(b.dataset.action==='delete'){if(editingRow===row.id)cancelRowEdit();project.rows=project.rows.filter(r=>r.id!==row.id);arrange(true);}else{selected=items.find(i=>i.row_id===row.id)?.id;renderRoster();draw();}});
  $('autoArrange').addEventListener('click',()=>arrange());$('unlockAll').addEventListener('click',()=>{project.locks={};save();draw();});
  $('lockSelected').addEventListener('click',()=>{if(!selected){notify('先点击画布上的舰船，或清单中的“定位”');return;}project.locks[selected]=!project.locks[selected];save();draw();notify(project.locks[selected]?'已锁定；自动排列时保留此位置':'已解除锁定');});
  for(const [id,key]of[['fleetTitle','title'],['fleetSubtitle','subtitle'],['fleetBg','bg']])$(id).addEventListener('input',()=>{project[key]=$(id).value;syncHeaderControls();save();draw();});
  for(const [key]of explanationFields)$(key==='model'?'showModels':'fleetExplain_'+key).addEventListener('change',()=>{project.explanations[key]=$(key==='model'?'showModels':'fleetExplain_'+key).checked;project.showExplanations=Object.values(project.explanations).some(Boolean);fillSettings();arrange(true);});
  $('fleetToggleExplanations').addEventListener('click',()=>{const value=!Object.values(project.explanations).some(Boolean);for(const [key]of explanationFields)project.explanations[key]=value;project.showExplanations=value;fillSettings();arrange(true);});
  $('fleetHeaderAlign').addEventListener('change',()=>{const h=headerGeometry();project.headerAlign=$('fleetHeaderAlign').value;if(project.headerAlign==='custom'){project.headerX=Math.round(h.x);project.headerY=Math.round(h.y);}fillSettings();arrange(true);});
  for(const [id,key,min,max]of [['fleetHeaderX','headerX',56,2344],['fleetHeaderY','headerY',12,1232]])$(id).addEventListener('change',()=>{
    const value=Number($(id).value);if(!Number.isInteger(value)||value<min||value>max){notify(`请输入 ${min}–${max} 的整数`);syncHeaderControls();return;}
    project[key]=value;const h=headerGeometry();project.headerX=Math.round(h.x);project.headerY=Math.round(h.y);syncHeaderControls();arrange(true);
  });
  for(const [id,key,min,max]of[['fleetFont','font',6,40],['fleetModelFont','modelFont',6,28],['fleetGap','gap',0,60],['fleetTitleFont','titleFont',16,56],['fleetSubtitleFont','subtitleFont',8,28]])$(id).addEventListener('change',()=>{const value=Number($(id).value);if(!Number.isInteger(value)||value<min||value>max){notify(`请输入 ${min}–${max} 的整数`);fillSettings();return;}project[key]=value;fillSettings();arrange(false);});
  $('fleetLayoutMode').addEventListener('change',()=>{project.layoutMode=$('fleetLayoutMode').value;if(project.layoutMode==='compact'&&project.gap===22)project.gap=8;fillSettings();arrange(false);});
  $('fleetView').addEventListener('change',()=>{project.view=$('fleetView').value;choiceInfo();arrange();});
  let drag=null;
  function point(event){const r=canvas.getBoundingClientRect();return{x:(event.clientX-r.left)/r.width*canvas.width,y:(event.clientY-r.top)/r.height*canvas.height};}
  canvas.addEventListener('pointerdown',event=>{if(event.button!==0)return;const p=point(event);let hit;
    for(const item of [...items].reverse()){const r=rectFor(item);if(r&&Math.abs(p.x-r.x)<=r.w/2+6&&Math.abs(p.y-r.y)<=r.h/2+6){hit=item;break;}}
    selected=hit?.id||null;renderRoster();draw();if(hit){if(project.locks[hit.id]){notify('此舰船已锁定；先解除锁定再移动');return;}const position=project.positions[hit.id];drag={id:hit.id,dx:p.x-position.x,dy:p.y-position.y,moved:false};canvas.setPointerCapture(event.pointerId);}
  });
  canvas.addEventListener('pointermove',event=>{if(!drag)return;const p=point(event),item=items.find(i=>i.id===drag.id),r=rectFor(item);if(!r)return;project.positions[drag.id]={x:Math.max(E.FRAME.margin+r.w/2,Math.min(E.FRAME.width-E.FRAME.margin-r.w/2,p.x-drag.dx)),y:Math.max(portraitFrame().top+r.h/2,Math.min(E.FRAME.height-E.FRAME.bottom-r.h/2,p.y-drag.dy))};drag.moved=true;paint(ctx);});
  function endDrag(){if(drag?.moved){save();const rects=items.map(rectFor).filter(Boolean);const collisions=rects.some((r,k)=>rects.slice(k+1).some(b=>E.overlap(r,b,0)));warningText(collisions?'手动位置存在重叠，可继续拖动，或点击自动排列。':'');}drag=null;}
  canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',endDrag);canvas.addEventListener('lostpointercapture',endDrag);
  canvas.addEventListener('keydown',event=>{if(!selected||project.locks[selected]||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();const step=event.shiftKey?10:2,p=project.positions[selected],item=items.find(i=>i.id===selected),r=rectFor(item),next={x:p.x+({'ArrowLeft':-step,'ArrowRight':step}[event.key]||0),y:p.y+({'ArrowUp':-step,'ArrowDown':step}[event.key]||0)};if(E.inside({...r,...next},portraitFrame())){project.positions[selected]=next;save();draw();}});
  function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
  const safeName=()=>project.title.replace(/[\\/:*?"<>|]/g,'-').slice(0,70)||'舰队全家福';
  $('pngExport').addEventListener('click',async()=>{if(!items.length){notify('先添加有有效素材与长度的舰船');return;}if(items.some(i=>!project.positions[i.id])){notify('有舰船尚未放入画布，请自动排列后导出');return;}
    $('pngExport').disabled=true;try{await draw();await Promise.all(items.map(i=>imageFor(i.asset).promise));if(items.some(i=>!imageFor(i.asset).ready))throw new Error('有图片无法解码，请先在素材库替换');if(project.logo&&!logoFor()?.ready)throw new Error('舰队 Logo 无法解码，请更换图片或移除后再导出');const output=document.createElement('canvas');output.width=3840;output.height=2160;const c=output.getContext('2d');c.scale(1.6,1.6);paint(c,false);const blob=await new Promise(resolve=>output.toBlob(resolve,'image/png'));if(!blob)throw new Error('图片生成失败');download(blob,safeName()+'.png');output.width=output.height=0;notify(omitted.length?(project.explanations.source?'大图已生成；缺失的舰船已在页脚注明，请检查清单':'大图已生成；有舰船未入画，请检查清单（说明已隐藏）'):'4K 全家福已生成');}catch(e){notify(e.message);}finally{$('pngExport').disabled=false;}
  });
  $('projectExport').addEventListener('click',()=>{const data={...project,exported_at:new Date().toISOString(),library:lib()};download(new Blob([JSON.stringify(data)],{type:'application/json'}),safeName()+'.fleetproject.json');state('工程备份已生成 · 包含全部图库、成员和位置，请保留下载文件');dirty=false;});
  function validateProject(data){
    const prior=data;data={...fresh(),...data};
    if(prior?.explanations===undefined){data.explanations=Object.fromEntries(explanationFields.map(([key])=>[key,data.showExplanations&&(!['model','length'].includes(key)||data.showModels)]));}
    if(!data.explanations||typeof data.explanations!=='object'||explanationFields.some(([key])=>typeof data.explanations[key]!=='boolean'))throw new Error('说明文字选项无效');
    const explanationsVisible=Object.values(data.explanations).some(Boolean);
    if(data?.format!=='sc-fleet-project'||data.schema_version!==1||!Array.isArray(data.rows)||data.rows.length>200)throw new Error('不是有效的全家福工程');
    if(!['top','angled'].includes(data.view)||!Number.isFinite(data.ppm)||data.ppm<=0||data.ppm>1000||!Number.isInteger(data.font)||data.font<6||data.font>40||!Number.isFinite(data.gap)||data.gap<0||data.gap>60)throw new Error('工程中的画布参数无效');
    if(typeof data.title!=='string'||data.title.length>70||typeof data.subtitle!=='string'||data.subtitle.length>100||!/^#[0-9a-f]{6}$/i.test(data.bg))throw new Error('工程中的标题或背景无效');
    for(const [key,min,max]of[['modelFont',6,28],['titleFont',16,56],['subtitleFont',8,28]])if(!Number.isInteger(data[key])||data[key]<min||data[key]>max)throw new Error('工程中的字号无效');
    if(!['radial','compact'].includes(data.layoutMode))throw new Error('工程中的排列方式无效');
    if(!['left','center','right','custom'].includes(data.headerAlign)||typeof data.showExplanations!=='boolean')throw new Error('标题位置或说明开关无效');
    if(!Number.isInteger(data.headerX)||data.headerX<56||data.headerX>2344||!Number.isInteger(data.headerY)||data.headerY<12||data.headerY>1232)throw new Error('标题坐标无效');
    data.showExplanations=explanationsVisible;
    if(data.nameplate)data.nameplate=window.FleetNameplate?.validate(data.nameplate)||data.nameplate;
    const ids=new Set();let sum=0;for(const row of data.rows){if(typeof row.id!=='string'||ids.has(row.id)||!row.id||typeof row.member!=='string'||!row.member.trim()||row.member.length>40||typeof row.ship_id!=='string'||!Number.isInteger(row.quantity)||row.quantity<1||row.quantity>50)throw new Error('工程中的成员或数量无效');ids.add(row.id);sum+=row.quantity;}if(sum>200)throw new Error('工程超过 200 艘');
    if(!data.positions||!data.locks||typeof data.positions!=='object'||typeof data.locks!=='object')throw new Error('工程中的位置格式无效');for(const p of Object.values(data.positions))if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.abs(p.x)>10000||Math.abs(p.y)>10000)throw new Error('工程中的位置数值无效');
    if(data.logo&&!/^data:image\/(png|webp|jpeg);base64,[a-z0-9+/=]+$/i.test(data.logo))throw new Error('队徽必须是嵌入图片');return data;
  }
  $('projectImport').addEventListener('click',()=>$('projectFile').click());
  $('projectFile').addEventListener('change',async()=>{const file=$('projectFile').files[0];if(!file)return;try{if(file.size>300*1024*1024)throw new Error('工程超过 300 MB');const data=validateProject(JSON.parse(await file.text()));if(!data.library)throw new Error('工程缺少内嵌图库');window.FleetCatalog.validate(data.library);const {library,...next}=data;project=next;cancelRowEdit();window.FleetCatalog.replace(library);fillSettings();choices();buildItems();save();if(items.some(i=>!project.positions[i.id]))arrange(true);else draw();showFleet();notify('工程已恢复，包含图库与成员位置');}catch(e){notify('导入失败：'+e.message);}finally{$('projectFile').value='';}});
  $('chooseLogo').addEventListener('click',()=>$('fleetLogo').click());$('clearLogo').addEventListener('click',()=>{project.logo=null;cache.delete('project-logo');fillSettings();save();draw();});
  $('fleetLogo').addEventListener('change',async()=>{const file=$('fleetLogo').files[0];if(!file)return;try{if(file.size>5*1024*1024||!['image/png','image/webp','image/jpeg'].includes(file.type))throw new Error('队徽请使用 5 MB 内的 PNG、WebP 或 JPEG');const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});const im=new Image();im.src=data;await im.decode();if(im.width*im.height>16000000)throw new Error('队徽像素过大');project.logo=data;fillSettings();save();draw();}catch(e){notify(e.message||'队徽无法读取');}finally{$('fleetLogo').value='';}});
  function parseCSV(text){const rows=[];let row=[],value='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}else if((c===','||c==='，')&&!quoted){row.push(value.trim());value='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(value.trim());if(row.some(Boolean))rows.push(row);row=[];value='';}else value+=c;}if(quoted)throw new Error('CSV 引号没有闭合');row.push(value.trim());if(row.some(Boolean))rows.push(row);return rows;}
  $('pasteRoster').addEventListener('click',()=>{try{const lines=parseCSV($('rosterText').value),pending=[],errors=[];let extra=0;for(const [index,row]of lines.entries()){if(index===0&&['成员','成员名称','member'].includes(row[0]?.toLowerCase()))continue;const [member,name,raw]=row,n=Number(raw||1),matches=lib().ships.filter(s=>[s.name,s.name_zh,...s.aliases||[]].some(v=>v.toLowerCase()===name?.toLowerCase()));if(!member||member.length>40||matches.length!==1||!Number.isInteger(n)||n<1||n>50||row.length>3){errors.push(`第 ${index+1} 行`);continue;}pending.push({member,ship:matches[0].id,n});extra+=n;}if(errors.length)throw new Error('以下行有名称未识别、重复匹配或数量无效：'+errors.join('、')+'；此次未加入任何记录');if(total()+extra>200)throw new Error('总数超过 200 艘');const old=structuredClone(project.rows);try{for(const p of pending)add(p.member,p.ship,p.n);}catch(e){project.rows=old;throw e;}$('rosterText').value='';arrange(true);notify(`已加入 ${extra} 艘 / 辆`);}catch(e){notify(e.message);}});
  $('csvExport').addEventListener('click',()=>{const quote=v=>'"'+String(v).replace(/"/g,'""')+'"';const rows=[['成员','英文型号','数量'],...project.rows.map(r=>[r.member,lib().ships.find(s=>s.id===r.ship_id)?.name||r.ship_id,r.quantity])];download(new Blob(['\ufeff'+rows.map(r=>r.map(quote).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),safeName()+'-成员.csv');});
  $('loadExample').addEventListener('click',()=>{if(project.rows.length&&!confirm('载入示例会替换当前工程的成员和排列。请先保存工程备份。继续？'))return;project=fresh();cancelRowEdit();project.title='示例舰队 · 启航合影';const specs=[['示例成员 A','Polaris',1],['示例成员 B','Carrack',1],['示例成员 C','C2 Hercules',1],['示例成员 A','Corsair',1],['示例成员 D','Constellation Mk IV Andromeda',1],['示例成员 E','Cutlass Black',2],['示例成员 F','Gladius',2],['示例成员 G','100i',2],['示例成员 H','Cutter',1],['示例成员 I','Arrow',2],['示例成员 J','Prospector',1]];for(const [member,name,n]of specs){const s=lib().ships.find(s=>s.name===name);if(s)add(member,s.id,n);}fillSettings();arrange();});
  window.onFleetLibraryChanged=()=>{cache.clear();choices();if(active)arrange(true);window.FleetNameplate?.libraryChanged();};
  window.fleetProjectStatus=()=>({rows:project.rows.length,items:items.length,omitted:omitted.length,ppm:project.ppm,view:project.view,loadingImages,dirty,positions:structuredClone(project.positions)});
  window.FleetOwnershipImport={
    snapshot:()=>structuredClone(project),
    apply(entries,options){
      const incoming=entries.map(e=>({...e,id:uuid()}));
      const rows=options.mode==='replace'?[]:structuredClone(project.rows);
      for(const e of incoming){
        if(!lib().ships.some(s=>s.id===e.ship_id))throw new Error('型号不在当前图库');
        const match=rows.find(r=>(r.member_id||r.member)===(e.member_id||e.member)&&r.ship_id===e.ship_id);
        if(match){match.quantity+=e.quantity;match.import_sources=[...(match.import_sources||[]),...(e.import_sources||[])];}else rows.push(e);
      }
      if(options.mode!=='replace'&&(project.import_history||[]).some(h=>h.key===options.key))throw new Error('同一文件和列设置已导入过；如需重新读取请选择“替换当前清单”');
      const next={...project,rows,positions:options.mode==='replace'?{}:project.positions,locks:options.mode==='replace'?{}:project.locks,
        excel_aliases:{...project.excel_aliases,...options.aliases},
        import_history:[...(options.mode==='replace'?[]:project.import_history||[]),{key:options.key,file:options.filename,sheet:options.sheet,at:new Date().toISOString(),vessels:incoming.reduce((n,r)=>n+r.quantity,0)}]};
      validateProject(next);project=next;cancelRowEdit();arrange(options.mode!=='replace');showFleet();
      return {quantity:incoming.reduce((n,r)=>n+r.quantity,0),rows:incoming.length};
    }
  };
  window.FleetProjectQA={validate:validateProject,parseCSV,header:()=>headerGeometry(),obstacle:headerObstacle,project:()=>structuredClone(project)};
  window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  fillSettings();choices();buildItems();draw();
  try{const request=indexedDB.open('sc-fleet-project-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('projects');request.onerror=()=>state('浏览器暂存不可用 · 请保存工程备份');request.onsuccess=()=>{projectDb=request.result;const get=projectDb.transaction('projects','readonly').objectStore('projects').get('current');get.onsuccess=()=>{if(get.result&&!dirty){try{project=validateProject(get.result);fillSettings();choices();buildItems();draw();state('已恢复本机工程 · 建议保留工程备份');}catch{state('本机暂存不可用 · 可导入工程备份');}}};get.onerror=()=>state('工程暂存不可用 · 请保存工程备份');};}catch{state('浏览器暂存不可用 · 请保存工程备份');}
})();
