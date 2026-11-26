'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const baseline = window.FLEET_LIBRARY;
  let library = baseline;
  if (!library) { $('grid').textContent = '资料文件未加载。请解压整个文件夹，再打开 index.html；保留 data/library.js。'; return; }
  let db, dirty = false, backupNeeded = false, persistTimer, view = 'angled', manufacturer = '', pageSize = 24;
  let measuredPoints = null;
  let editing = null, isNew = false, replacement = null, saving = false, dialogDirty = false;
  const fmt = n => Number.isFinite(Number(n)) && n !== null && n !== '' ? Number(n).toLocaleString('zh-CN', {maximumFractionDigits:2}) : '—';
  const assetFor = (ship, v = view) => library.assets[ship.assets?.[v]];
  const imageFor = asset => asset && library.image_data[asset.id];
  const sourceLink = (url, title) => {
    try { const u = new URL(url); if (u.protocol !== 'https:') return ''; return `<a href="${esc(u.href)}" target="_blank" rel="noopener noreferrer">${esc(title)} ↗</a>`; } catch { return ''; }
  };
  function toast(message) {
    $('toast').textContent = message; $('toast').classList.add('show');
    clearTimeout(toast.timer); toast.timer = setTimeout(() => $('toast').classList.remove('show'), 4200);
  }
  function saveLabel(text, warning = false) { $('saveState').textContent = text; $('saveState').classList.toggle('dirty', warning); }
  function persist() {
    window.FLEET_LIBRARY=library; window.onFleetLibraryChanged?.();
    dirty = true; backupNeeded = true; saveLabel('有修改 · 请导出备份', true);
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      if (!db) return;
      try {
        const tx = db.transaction('libraries', 'readwrite');
        tx.objectStore('libraries').put(library, 'current');
        tx.oncomplete = () => { dirty = false; saveLabel('已暂存本机 · 建议导出备份', true); };
        tx.onerror = () => saveLabel('暂存失败 · 请导出备份', true);
      } catch { saveLabel('请导出备份保存修改', true); }
    }, 700);
  }
  function tally() {
    const ships = library.ships;
    const withImage = ships.filter(s => Object.keys(s.assets || {}).some(k => imageFor(assetFor(s, k))));
    const colored = withImage.filter(s => Object.values(s.assets).some(id => library.assets[id]?.style === 'colored'));
    const clay = withImage.length - colored.length;
    library.stats = {...library.stats,models:ships.length,models_with_image:withImage.length,colored_models:colored.length,clay_only_models:clay,assets:Object.keys(library.assets).length,transparent_assets:Object.values(library.assets).filter(a=>a.transparent).length};
    const stat = (label, value, unit, description) => `<div class="stat"><label>${label}</label><div class="stat-value">${value}<small>${unit}</small></div><p>${description}</p></div>`;
    $('stats').innerHTML = stat('型号目录',ships.length,'个型号',`${ships.filter(s=>s.kind==='spaceship').length} 舰船 / ${ships.filter(s=>s.kind==='ground').length} 地面载具`) + stat('已收录透明素材',withImage.length,'个型号',`${Object.values(library.assets).filter(a=>a.transparent).length} 张图片通过透明通道检查`) + stat('彩色素材',colored.length,'个型号','有彩色贴图版本可供预览') + stat('官网俯视长度比例',ships.filter(s=>s.dimensions_basis?.startsWith('rsi_')&&assetFor(s,'top')?.calibration?.reference_span_px).length,'个型号','统一倍率；官网差异与姿态另有标记');
    $('sideCount').textContent = ships.length;
    const makers = new Map();
    for (const s of ships) makers.set(s.manufacturer, (makers.get(s.manufacturer) || 0) + 1);
    $('manufacturers').innerHTML = [...makers].sort((a,b)=>a[0].localeCompare(b[0])).map(([name,count])=>`<button data-maker="${esc(name)}" class="${manufacturer===name?'active':''}"><span>${esc(name)}</span><b>${count}</b></button>`).join('');
  }
  function filtered() {
    const q = $('search').value.trim().toLocaleLowerCase();
    let list = library.ships.filter(s => {
      if (manufacturer && s.manufacturer !== manufacturer) return false;
      if ($('kind').value && s.kind !== $('kind').value) return false;
      const hay = [s.name,s.name_zh,s.manufacturer,s.manufacturer_code,s.id,...(s.aliases || [])].join(' ').toLocaleLowerCase();
      if (q && !hay.includes(q)) return false;
      const a = assetFor(s);
      switch ($('assetFilter').value) {
        case 'colored': if (!a || a.style !== 'colored') return false; break;
        case 'clay': if (!a || a.style !== 'clay') return false; break;
        case 'missing': if (imageFor(a)) return false; break;
        case 'conflict': if (!s.official_conflict_axes?.length && !s.dimensions_conflict_axes?.length) return false;
      }
      return true;
    });
    const sort = $('sort').value;
    list.sort((a,b) => sort === 'name' ? a.name.localeCompare(b.name, 'en', {numeric:true}) : ((Number(a.dimensions_m?.length)||0)-(Number(b.dimensions_m?.length)||0)) * (sort === 'length-desc' ? -1 : 1));
    return list;
  }
  function render(resetPage = false) {
    if (resetPage) pageSize = 24;
    const list = filtered();
    $('resultCount').textContent = `${list.length} 个型号`;
    $('grid').innerHTML = list.slice(0,pageSize).map(s => {
      const a=assetFor(s), src=imageFor(a), colored=a?.style==='colored';
      const label=src ? (colored?'彩色素材':a.style==='custom'?'自定义图片':'灰色模型') : '待补图片';
      return `<button class="ship-card" data-ship="${esc(s.id)}" aria-label="查看 ${esc(s.name)}"><div class="card-preview"><span class="badge ${colored?'colored':''}">${label}</span>${src?`<img loading="lazy" decoding="async" src="${src}" alt="${esc(s.name)} ${view==='top'?'俯视':'斜俯视'}">`:'<span class="missing">暂无此视角素材</span>'}<span class="kind">${s.kind==='ground'?'GROUND VEHICLE':'SPACECRAFT'}</span></div><div class="card-info"><div class="card-maker">${esc(s.manufacturer).toUpperCase()}</div><div class="card-name">${esc(s.name_zh || s.name)}</div><div class="card-en">${esc(s.name)}</div><div class="card-bottom"><span><b>${fmt(s.dimensions_m?.length)}</b> m</span><span class="${s.dimensions_conflict_axes?.length?'warn':''}">${s.official_conflict_axes?.length?'官网数值有差异':a?.transparent?'透明背景 ✓':'素材待检查'}</span></div></div></button>`;
    }).join('') || '<div class="empty">没有找到符合条件的型号。可以调整筛选，或点击右上角“添加型号”。</div>';
    $('loadMore').hidden = list.length <= pageSize;
    $('pageInfo').textContent = `已显示 ${Math.min(pageSize,list.length)} / ${list.length}`;
    document.querySelectorAll('[data-view]').forEach(el=>el.classList.toggle('selected',el.dataset.view===view));
  }
  function refresh() { tally(); render(); }
  function resetFilters() {
    manufacturer = ''; ['search','kind','assetFilter'].forEach(id=>$(id).value=''); $('sort').value='name';
    tally(); render(true);
  }
  function updatePreview() {
    const a = replacement?.asset || assetFor(editing), src = replacement?.data || imageFor(a);
    $('detailPreview').innerHTML = src ? `<img src="${src}" alt="${esc(editing.name)}">` : '<span class="missing">尚无当前视角图片，可在下面添加</span>';
    $('detailImageLabel').textContent = `${view==='top'?'俯视图':'斜俯视图'} · ${a ? `${a.width} × ${a.height} px · ${a.transparent?'真实透明背景':'不透明图片'}` : '待补图'}`;
    $('downloadImage').disabled = !src;
  }
  function openDetails(ship, fresh=false) {
    measuredPoints=null; $('measureCanvas').hidden=true; $('measureHelp').textContent='';
    editing = structuredClone(ship); isNew = fresh; replacement = null; dialogDirty = false;
    $('detailMaker').textContent = fresh ? 'NEW LOCAL RECORD' : ship.manufacturer.toUpperCase();
    $('detailTitle').textContent = fresh ? '添加舰船型号' : ship.name;
    $('editName').value=ship.name; $('editZh').value=ship.name_zh || ''; $('editAliases').value=(ship.aliases || []).join(', ');
    for (const [id,key] of [['editLength','length'],['editWidth','width'],['editHeight','height']]) $(id).value=ship.dimensions_m?.[key] ?? '';
    $('editManufacturer').value=ship.manufacturer || ''; $('editKind').value=ship.kind || 'spaceship'; $('editNotes').value=ship.notes || '';
    const c=ship.calibration || {}; $('editReference').value=assetFor(ship)?.calibration?.reference_span_px ?? (c.view===view ? c.reference_pixels ?? '' : ''); $('editCalibrationNotes').value=c.notes || '';
    $('replaceImage').value=''; $('replacementInfo').textContent=''; $('detailPreview').classList.remove('light');
    const a=assetFor(ship), conflict=ship.dimensions_conflict_axes?.length;
    $('detailFacts').innerHTML = `<div class="facts"><span class="pill">${ship.kind==='ground'?'地面载具':'舰船'}</span><span class="pill">${a?.style==='colored'?'彩色贴图':a?.style==='clay'?'灰色模型':a?'自定义素材':'待补图'}</span><span class="pill">${view==='top'?'俯视长度比例':'斜视近似比例'}</span>${ship.official_conflict_axes?.length?'<span class="pill warn">官网详情 / 矩阵数值不同</span>':''}${a?.calibration?.flags?.includes('pose_or_extent_ratio_mismatch')?'<span class="pill warn">图像姿态或长宽比需复核</span>':''}${conflict?'<span class="pill warn">两个来源的尺寸差异超过 10%</span>':''}${a?.shared_with?.length?'<span class="pill warn">来源与其他型号共享图片</span>':''}${ship.player_ownable===false?'<span class="pill warn">来源标记为非玩家可拥有</span>':''}</div>`;
    const fy=ship.sources?.fleetyards, w=ship.sources?.wiki, rsi=ship.sources?.rsi;
    $('dimensionSource').value=ship.dimensions_basis?.startsWith('rsi_')?ship.dimensions_basis:'manual';
    $('dimensionSource').options[1].disabled=!rsi; $('dimensionSource').options[2].disabled=!rsi;
    const dims=d=>d?`${fmt(d.length)} × ${fmt(d.width)} × ${fmt(d.height)} m`:'—';
    $('detailSources').innerHTML = `${ship.community_name?`<p>社区中文名：${esc(ship.community_name.display_name)}${ship.name_zh_manual?' · 当前为自定义显示名':''}<br>${sourceLink(ship.community_name.source_url,ship.community_name.attribution+'（联网）')}<br>原始名称：${esc(ship.community_name.source_value)}<br>许可：${esc(ship.community_name.license)}</p>`:''}<p>当前尺寸依据：${({rsi_detail_structured:'RSI 官网详情页',rsi_matrix:'RSI 官网矩阵',wiki_game_data:'Wiki 游戏数据',manual:'人工修改'})[ship.dimensions_basis]||'FleetYards'}${ship.game_version?' · '+esc(ship.game_version):''}</p>${rsi?`<p>官网详情：${dims(rsi.detail_dimensions_m)}<br>官网矩阵：${dims(rsi.matrix_dimensions_m)}<br>${sourceLink(rsi.detail_url,'RSI 官网详情（联网）')} · ${sourceLink(rsi.matrix_url,'官网矩阵数据（联网）')}<br>采集日期：${esc(rsi.retrieved_at)}</p>`:''}${fy?`<p>FleetYards 原值：${dims(fy.dimensions_m)}<br>${sourceLink(fy.page_url,'FleetYards 型号页（联网）')}</p>`:''}${w?`<p>Wiki 原值：${dims(w.dimensions_m)}<br>${sourceLink(w.record_url,'Wiki 数据记录（联网）')}</p>`:''}${a?`<p>素材类型：${esc(a.provider_field || a.style)} · ${fmt(a.bytes/1024)} KB<br>全透明像素：${fmt(a.transparent_fraction*100)}%<br>${sourceLink(a.original_url,'原始图片（联网）')}</p><p>文件 SHA-256<br><code>${esc(a.sha256 || '自定义素材')}</code></p>`:''}<p>外部来源链接需要联网；素材浏览、修改与备份均离线运行。</p>`;
    updatePreview(); $('details').showModal(); $('details').scrollTop=0;
  }
  function newShip() {
    openDetails({id:'custom-'+crypto.randomUUID(),name:'',name_zh:'',aliases:[],manufacturer:'',manufacturer_code:'CUSTOM',kind:'spaceship',dimensions_m:{},dimensions_basis:'manual',dimensions_conflict_axes:[],assets:{},sources:{},calibration:{status:'unverified',reference_pixels:null,view,notes:''},notes:''},true);
  }
  function fileToData(file) {
    return new Promise((resolve,reject)=>{ const reader=new FileReader(); reader.onload=()=>resolve(reader.result); reader.onerror=()=>reject(new Error('读取图片失败')); reader.readAsDataURL(file); });
  }
  async function inspectImage(data) {
    const im=new Image(); im.src=data; await im.decode();
    if (im.width*im.height > 40000000) throw new Error('图片超过 4000 万像素，请使用较小版本');
    const canvas=document.createElement('canvas'); canvas.width=im.width; canvas.height=im.height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true}); ctx.drawImage(im,0,0);
    const rgba=ctx.getImageData(0,0,im.width,im.height).data;
    let zero=0,solid=0,left=im.width,top=im.height,right=0,bottom=0;
    for(let i=3;i<rgba.length;i+=4) { if(rgba[i]===0)zero++;if(rgba[i]===255)solid++;if(rgba[i]>=8){const pixel=(i-3)/4,x=pixel%im.width,y=Math.floor(pixel/im.width);left=Math.min(left,x);right=Math.max(right,x+1);top=Math.min(top,y);bottom=Math.max(bottom,y+1);} }
    const result={width:im.width,height:im.height,transparent:zero>0&&solid>0,transparent_fraction:zero/(im.width*im.height),alpha_bbox:[left,top,right,bottom]};
    canvas.width=canvas.height=0; return result;
  }
  $('replaceImage').addEventListener('change',async()=>{
    const file=$('replaceImage').files[0]; if(!file)return;
    if (!['image/png','image/webp','image/jpeg'].includes(file.type)) { toast('请使用 PNG、WebP 或 JPEG 图片'); $('replaceImage').value=''; return; }
    if (file.size>20*1024*1024) { toast('单张图片请小于 20 MB'); $('replaceImage').value=''; return; }
    saving=true; $('editForm').querySelector('[type=submit]').disabled=true;
    try {
      const data=await fileToData(file), info=await inspectImage(data);
      replacement={data,asset:{...info,id:editing.id+':'+view,ship_id:editing.id,view,style:'custom',file:null,bytes:file.size,content_type:file.type,original_name:file.name,scale_status:'unverified',verification:'decoded_and_alpha_checked',retrieved_at:new Date().toISOString().slice(0,10)}};
      $('replacementInfo').textContent=`${file.name} · ${info.width} × ${info.height} · ${info.transparent?'已检测到透明背景':'没有检测到透明背景，尚不适合直接合成'}`;
      $('editReference').value=''; measuredPoints=null; $('measureCanvas').hidden=true; $('measureHelp').textContent='新图片需要重新测量船首与船尾后才能按比例入画。';
      updatePreview();
    } catch(e) { toast(e.message || '图片无法读取'); $('replaceImage').value=''; replacement=null; }
    finally { saving=false; $('editForm').querySelector('[type=submit]').disabled=false; }
  });
  $('editForm').addEventListener('submit',event=>{
    event.preventDefault(); if(saving)return;
    const name=$('editName').value.trim(), maker=$('editManufacturer').value.trim();
    if(!name||!maker) {toast('请填写型号和制造商');return;}
    const d={};
    for(const [id,key] of [['editLength','length'],['editWidth','width'],['editHeight','height']]) { const v=$(id).value;d[key]=v===''?null:Number(v);if(d[key]!==null&&(!Number.isFinite(d[key])||d[key]<=0)) {toast('尺寸需要为正数');return;} }
    const choice=$('dimensionSource').value, sourceDims=editing.sources?.rsi?.[choice==='rsi_matrix'?'matrix_dimensions_m':'detail_dimensions_m'];
    if(choice!=='manual'&&sourceDims&&['length','width','height'].every(k=>d[k]===sourceDims[k]))editing.dimensions_basis=choice;
    else if(JSON.stringify(d)!==JSON.stringify(editing.dimensions_m)||choice==='manual')editing.dimensions_basis='manual';
    if($('editZh').value.trim()!==editing.name_zh){editing.name_zh_manual=true;editing.name_zh_status='user';}
    Object.assign(editing,{name,name_zh:$('editZh').value.trim(),aliases:$('editAliases').value.split(/[,，]/).map(v=>v.trim()).filter(Boolean),manufacturer:maker,kind:$('editKind').value,dimensions_m:d,notes:$('editNotes').value.trim(),modified_at:new Date().toISOString()});
    const ref=$('editReference').value;
    if(ref&&(!Number.isFinite(Number(ref))||Number(ref)<=0)){toast('参考像素须为正数');return;}
    const oldRef=assetFor(editing)?.calibration?.reference_span_px;
    if(measuredPoints&&measuredPoints.length!==2){toast('请完成船首、船尾两点测量，或关闭后重新编辑');return;}
    const manualRef=measuredPoints?.length===2||(ref&&Number(ref)!==oldRef);
    editing.calibration={status:manualRef?'manual_reference':editing.calibration?.status||'unverified',view,reference_pixels:ref?Number(ref):null,notes:$('editCalibrationNotes').value};
    if(replacement) {
      const id=replacement.asset.id;
      if(library.assets[id]) {editing.asset_history ||= [];editing.asset_history.push({previous:library.assets[id],replaced_at:new Date().toISOString()});}
      library.assets[id]=replacement.asset; library.image_data[id]=replacement.data; editing.assets[view]=id;
    }
    const assetId=editing.assets[view],currentAsset=library.assets[assetId];
    if(currentAsset){const bounds=currentAsset.calibration?.crop_bbox||currentAsset.alpha_bbox;
      library.assets[assetId]={...currentAsset,calibration:{...currentAsset.calibration,reference_span_px:ref?Number(ref):null,reference_length_m:d.length,pixels_per_meter:ref&&d.length?Number(ref)/d.length:null,crop_bbox:bounds,
        ...(manualRef?{status:'manual_reference',method:measuredPoints?.length===2?'manual_two_point':'manual_reference',points:measuredPoints}:{}),...(!ref?{status:'unverified'}:{}),source:editing.dimensions_basis}};
    }
    for(const key of Object.values(editing.assets)){const a=library.assets[key];if(a?.calibration){const c=a.calibration;a.calibration={...c,reference_length_m:d.length,pixels_per_meter:c.reference_span_px&&d.length?c.reference_span_px/d.length:null,source:editing.dimensions_basis,official_length:editing.dimensions_basis?.startsWith('rsi_')||false};}}
    if(isNew)library.ships.push(editing);else library.ships[library.ships.findIndex(s=>s.id===editing.id)]=editing;
    persist();refresh();$('details').close();toast('修改已应用；导出完整备份可永久保存到文件');
  });
  $('editForm').addEventListener('input',()=>{dialogDirty=true;});
  $('closeDetails').addEventListener('click',()=>{
    const formChanged = editing && dialogDirty;
    if(formChanged && !confirm('当前弹窗中的修改尚未保存，确定关闭？'))return;
    $('details').close();
  });
  $('details').addEventListener('cancel',event=>{event.preventDefault();$('closeDetails').click();});
  $('toggleBg').addEventListener('click',()=>$('detailPreview').classList.toggle('light'));
  function download(blob,name) {
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  $('downloadImage').addEventListener('click',()=>{
    const a=replacement?.asset || assetFor(editing),data=replacement?.data || imageFor(a);if(!data)return;
    const binary=atob(data.split(',')[1]), bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
    download(new Blob([bytes],{type:a.content_type}),`${editing.id}-${view}.${a.content_type==='image/png'?'png':a.content_type==='image/jpeg'?'jpg':'webp'}`);
  });
  $('exportLibrary').addEventListener('click',()=>{
    library.exported_at=new Date().toISOString();
    download(new Blob([JSON.stringify(library)],{type:'application/json'}),`舰船素材库-${new Date().toISOString().slice(0,10)}.fleetlib.json`);
    backupNeeded=false;dirty=false;saveLabel('备份已生成 · 请保留下载文件');toast('完整备份已生成，包含全部图片、资料和修改');
  });
  function validateLibrary(data) {
    if(data?.format!=='sc-fleet-library'||data.schema_version!==1||!Array.isArray(data.ships)||!data.assets||!data.image_data)throw new Error('不是受支持的完整舰船素材库备份');
    if(data.ships.length>3000||Object.keys(data.assets).length>12000)throw new Error('文件中的记录数量超过首版支持范围');
    const ids=new Set();
    for(const s of data.ships) {
      if(typeof s.id!=='string'||!s.id||ids.has(s.id)||typeof s.name!=='string'||!s.name.trim()||typeof s.manufacturer!=='string'||!s.assets||!['spaceship','ground'].includes(s.kind))throw new Error('备份中的型号记录无效或编号重复');
      ids.add(s.id);
      if(s.aliases&&(!Array.isArray(s.aliases)||s.aliases.some(a=>typeof a!=='string')))throw new Error('备份中的俗称格式无效');
      for(const [axis,val] of Object.entries(s.dimensions_m || {}))if(['length','width','height'].includes(axis)&&val!==null&&(!Number.isFinite(val)||val<=0))throw new Error('备份中的尺寸无效');
      for(const [v,id] of Object.entries(s.assets))if(!['top','angled'].includes(v)||!data.assets[id]||typeof data.image_data[id]!=='string')throw new Error('备份缺少所引用的图片');
    }
    for(const [id,a] of Object.entries(data.assets)) {
      if(a.id!==id||!ids.has(a.ship_id)||!/^data:image\/(png|webp|jpeg);base64,[a-z0-9+/=]+$/i.test(data.image_data[id]||''))throw new Error('备份包含无效的图片数据');
    }
    return data;
  }
  $('importLibrary').addEventListener('click',()=>$('libraryFile').click());
  $('libraryFile').addEventListener('change',async()=>{
    const file=$('libraryFile').files[0];if(!file)return;
    try {
      if(file.size>300*1024*1024)throw new Error('备份超过 300 MB，请使用较小的文件');
      const imported=validateLibrary(JSON.parse(await file.text()));
      if(!confirm(`导入将把当前素材库替换为备份中的 ${imported.ships.length} 个型号。${backupNeeded?'当前有修改，建议先取消并导出备份。':''}继续导入？`))return;
      library=window.FleetEngine.migrate(imported,baseline);window.FLEET_LIBRARY=library;persist();resetFilters();toast('备份已导入，图片可离线使用');
    } catch(e) {toast('导入失败：'+e.message);} finally {$('libraryFile').value='';}
  });
  $('grid').addEventListener('click',event=>{const card=event.target.closest('[data-ship]');if(card)openDetails(library.ships.find(s=>s.id===card.dataset.ship));});
  $('manufacturers').addEventListener('click',event=>{const b=event.target.closest('[data-maker]');if(b){manufacturer=manufacturer===b.dataset.maker?'':b.dataset.maker;tally();render(true);}});
  document.querySelectorAll('[data-view]').forEach(el=>el.addEventListener('click',()=>{view=el.dataset.view;render(true);}));
  ['search','kind','assetFilter','sort'].forEach(id=>$(id).addEventListener(id==='search'?'input':'change',()=>render(true)));
  $('loadMore').addEventListener('click',()=>{pageSize+=24;render();});
  $('resetFilters').addEventListener('click',resetFilters);$('allModels').addEventListener('click',resetFilters);$('addShip').addEventListener('click',newShip);
  window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  refresh();
  try {
    const request=indexedDB.open('sc-fleet-library-v1',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('libraries');
    request.onerror=()=>saveLabel('请使用完整备份保存修改',true);
    request.onsuccess=()=>{
      db=request.result;
      const tx=db.transaction('libraries','readonly'),get=tx.objectStore('libraries').get('current');
      get.onsuccess=()=>{
        if(get.result&&!dirty){
          try {library=window.FleetEngine.migrate(validateLibrary(get.result),baseline);window.FLEET_LIBRARY=library;refresh();window.onFleetLibraryChanged?.();saveLabel('已恢复本机暂存 · 建议保留备份');}
          catch {saveLabel('暂存不可用 · 已载入初始图库',true);}
        } else if(!dirty)saveLabel('初始图库已载入 · 完全离线');
      };
      get.onerror=()=>saveLabel('请使用完整备份保存修改',true);
    };
  } catch {saveLabel('请使用完整备份保存修改',true);}
  $('dimensionSource').addEventListener('change',()=>{
    const r=editing?.sources?.rsi,choice=$('dimensionSource').value;
    const d=r?.[choice==='rsi_matrix'?'matrix_dimensions_m':'detail_dimensions_m'];
    if(choice!=='manual'&&d)for(const [id,key]of[['editLength','length'],['editWidth','width'],['editHeight','height']])$(id).value=d[key]??'';
    dialogDirty=true;
  });
  $('measureShip').addEventListener('click',async()=>{
    const a=replacement?.asset||assetFor(editing),src=replacement?.data||imageFor(a);if(!src){toast('请先添加图片');return;}
    const im=new Image();im.src=src;
    try{await im.decode();}catch{toast('图片无法解码');return;}
    const canvas=$('measureCanvas'),ctx=canvas.getContext('2d');canvas.width=im.width;canvas.height=im.height;canvas.hidden=false;
    measuredPoints=[];ctx.drawImage(im,0,0);$('measureHelp').textContent='依次点击船首和船尾；完成后点击“保存修改”。再次点击按钮可重新测量。';
    canvas.onclick=event=>{
      if(measuredPoints.length===2){measuredPoints=[];ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(im,0,0);}
      const r=canvas.getBoundingClientRect();measuredPoints.push({x:(event.clientX-r.left)/r.width*canvas.width,y:(event.clientY-r.top)/r.height*canvas.height});
      ctx.strokeStyle='#ffd277';ctx.fillStyle='#ffd277';ctx.lineWidth=Math.max(2,im.width/300);
      for(const p of measuredPoints){ctx.beginPath();ctx.arc(p.x,p.y,Math.max(4,im.width/110),0,Math.PI*2);ctx.fill();}
      if(measuredPoints.length===2){const [a,b]=measuredPoints,span=Math.hypot(a.x-b.x,a.y-b.y);if(span<1){measuredPoints=[];toast('两点距离过近，请重新点击');return;}
        ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();$('editReference').value=span.toFixed(3);dialogDirty=true;
        $('measureHelp').textContent=`已测量 ${span.toFixed(2)} px；对应长度输入框中的舰长。`;}
    };
  });
  window.FleetCatalog={get:()=>library,replace:data=>{library=window.FleetEngine.migrate(validateLibrary(data),baseline);window.FLEET_LIBRARY=library;persist();refresh();},validate:validateLibrary,notify:toast};
  // Small, read-only QA surface for local validation; does not perform network requests.
  window.fleetLibraryStatus=()=>({ships:library.ships.length,assets:Object.keys(library.assets).length,view,filtered:filtered().length,dirty});
})();
