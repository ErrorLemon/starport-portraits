'use strict';
(() => {
  if (!globalThis.structuredClone) globalThis.structuredClone = value => JSON.parse(JSON.stringify(value));
  if (!crypto.randomUUID) crypto.randomUUID = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = bytes[6] & 15 | 64; bytes[8] = bytes[8] & 63 | 128;
    const h = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
  };
  const pending = new Map();
  let busy = false;
  const notify = message => window.FleetCatalog?.notify(message);
  function progress(message) {
    let element = document.getElementById('nativeProgress');
    if (!element) {
      element = document.createElement('div'); element.id = 'nativeProgress';
      element.setAttribute('role','status'); element.setAttribute('aria-live','polite');
      document.body.append(element);
    }
    element.hidden = !message; element.textContent = message || '';
  }
  window.StarportNativeResult = result => {
    const resolve = pending.get(result.id);
    if (resolve) { pending.delete(result.id); resolve(result); }
  };
  function check(result) { if (result.startsWith('ERROR:')) throw new Error(result.slice(6)); return result; }
  async function save(blob, name) {
    if (busy) throw new Error('请先完成当前文件的导出');
    if (!window.StarportAndroid) {
      const url = URL.createObjectURL(blob), anchor = document.createElement('a');
      anchor.href = url; anchor.download = name; document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000); return {status:'saved'};
    }
    let id;
    busy = true;
    try {
      progress('正在准备文件…');
      id = check(StarportAndroid.beginExport(name, blob.type, blob.size));
      for (let offset = 0; offset < blob.size; offset += 196608) {
        const bytes = new Uint8Array(await blob.slice(offset, offset + 196608).arrayBuffer());
        let binary = '';
        for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i,i+8192));
        check(StarportAndroid.appendExport(id, btoa(binary)));
        progress(`正在准备文件 ${Math.min(100,Math.round((offset+bytes.length)/blob.size*100))}%`);
        await new Promise(resolve => setTimeout(resolve,0));
      }
      const finished = new Promise(resolve => pending.set(id, resolve));
      check(StarportAndroid.finishExport(id));
      progress('请选择保存或分享方式');
      const result = await finished;
      if (result.status === 'error') throw new Error(result.message);
      return result;
    } catch (error) {
      if (id) { pending.delete(id); StarportAndroid.abortExport(id); }
      throw error;
    } finally { busy = false; progress(''); }
  }
  const bundled = Object.freeze({...window.FLEET_LIBRARY?.image_data});
  async function portableLibrary(library) {
    const result = structuredClone(library), entries = Object.entries(result.image_data);
    try {
      for (let n = 0; n < entries.length; n++) {
        const [id, src] = entries[n];
        if (src.startsWith('data:image/')) continue;
        if (!bundled[id] || bundled[id] !== src) throw new Error('图库包含无效的图片路径');
        progress(`正在打包离线图库 ${n+1} / ${entries.length}`);
        const response = await fetch(src);
        if (!response.ok) throw new Error('无法读取内置舰船图片');
        result.image_data[id] = await new Promise((resolve,reject) => {
          const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('图片读取失败'));
          response.blob().then(blob => reader.readAsDataURL(blob), reject);
        });
      }
      return result;
    } finally { progress(''); }
  }
  window.StarportFiles = {save, portableLibrary, isBundled:(id,src)=>typeof src==='string' && src===bundled[id]};
  window.addEventListener('unhandledrejection',event=>{notify(event.reason?.message||'操作未完成，请重试');});

  // Decode at the required drawing size, four at a time. 200 original bitmaps
  // can otherwise occupy hundreds of MiB even though the visible ships are tiny.
  const imageQueue=[];let decoding=0;
  function drainImages(){
    while(decoding<4&&imageQueue.length){
      const job=imageQueue.shift();decoding++;
      Promise.resolve().then(job.run).then(job.resolve,job.reject).finally(()=>{decoding--;drainImages();});
    }
  }
  window.StarportImages={
    load(src,crop,width,height){return new Promise((resolve,reject)=>{
      imageQueue.push({resolve,reject,run:async()=>{
        const response=await fetch(src);if(!response.ok)throw new Error('图片读取失败');const blob=await response.blob();
        if(typeof createImageBitmap==='function'){
          return createImageBitmap(blob,crop[0],crop[1],crop[2]-crop[0],crop[3]-crop[1],{resizeWidth:width,resizeHeight:height,resizeQuality:'high'});
        }
        const url=URL.createObjectURL(blob);
        try{const image=new Image();image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
          canvas.getContext('2d').drawImage(image,crop[0],crop[1],crop[2]-crop[0],crop[3]-crop[1],0,0,width,height);return canvas;
        }finally{URL.revokeObjectURL(url);}
      }});drainImages();
    });},
    dispose(hit){if(!hit)return;hit.disposed=true;if(hit.ready&&typeof hit.im?.close==='function')hit.im.close();}
  };

  document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.add('android-app');
    const nav = document.createElement('nav'); nav.className='mobile-nav'; nav.setAttribute('aria-label','工作空间');
    nav.innerHTML = '<button data-tab="allModels"><span>▦</span>舰船库</button><button data-tab="fleetNav"><span>✧</span>全家福</button><button data-tab="nameplateNav"><span>▧</span>个人名牌</button>';
    document.body.append(nav);
    const screens = {allModels:'libraryWorkspace',fleetNav:'fleetWorkspace',nameplateNav:'nameplateWorkspace'};
    function syncNav() {
      for (const button of nav.querySelectorAll('button')) {
        const selected = !document.getElementById(screens[button.dataset.tab]).hidden;
        button.classList.toggle('active',selected); button.setAttribute('aria-current', selected?'page':'false');
        if(selected)document.body.dataset.workspace=button.dataset.tab;
      }
    }
    nav.addEventListener('click', event => {
      const button = event.target.closest('button'); if (!button) return;
      document.getElementById(button.dataset.tab).click(); syncNav(); window.scrollTo(0,0);
    });
    for (const id of Object.values(screens)) new MutationObserver(syncNav).observe(document.getElementById(id),{attributes:true,attributeFilter:['hidden']});
    document.querySelector('.brand')?.addEventListener('click',event=>{event.preventDefault();document.getElementById('allModels').click();});
    syncNav();
    if(matchMedia('(max-width:900px)').matches)document.querySelectorAll('.explanation-controls').forEach(e=>e.open=false);
    const makers=document.createElement('select');makers.id='androidManufacturer';makers.setAttribute('aria-label','按制造商筛选');
    document.querySelector('.filters').append(makers);
    function syncMakers(){
      const buttons=[...document.querySelectorAll('#manufacturers [data-maker]')];
      makers.replaceChildren(new Option('全部制造商',''),...buttons.map(button=>new Option(button.dataset.maker,button.dataset.maker)));
      makers.value=buttons.find(button=>button.classList.contains('active'))?.dataset.maker||'';
    }
    makers.addEventListener('change',()=>{
      if(!makers.value)document.getElementById('resetFilters').click();
      else [...document.querySelectorAll('#manufacturers [data-maker]')].find(button=>button.dataset.maker===makers.value)?.click();
    });
    new MutationObserver(syncMakers).observe(document.getElementById('manufacturers'),{childList:true});syncMakers();
    for (const [workspace, layout] of [['fleetWorkspace','.fleet-layout'],['nameplateWorkspace','.nameplate-layout']]) {
      const panel = document.querySelector(`#${workspace} ${layout} > .fleet-panel`);
      const tabs = document.createElement('div'); tabs.className='mobile-view-tabs';
      tabs.innerHTML='<button data-view="settings">资料与设置</button><button data-view="canvas" class="active">画布与清单</button>';
      document.querySelector(`#${workspace} .fleet-heading`).after(tabs);
      const section=document.getElementById(workspace);section.dataset.mobileView='canvas';
      const update = name => {
        section.dataset.mobileView=name;
        tabs.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
      };
      tabs.addEventListener('click',event=>{const b=event.target.closest('button');if(b)update(b.dataset.view);});
      if(workspace==='fleetWorkspace'){
        document.getElementById('addOwnership').addEventListener('click',()=>{
          if(document.getElementById('ownerName').value.trim())update('canvas');
        });
        document.getElementById('cancelOwnershipEdit').addEventListener('click',()=>update('canvas'));
        document.getElementById('fleetRoster').addEventListener('click',event=>{
          if(event.target.closest('[data-action="edit"]')){update('settings');panel.scrollIntoView({block:'start'});}
        });
      }
    }
    installCanvasGestures();
    const resolutionLabel=document.createElement('label');resolutionLabel.className='export-resolution';
    resolutionLabel.textContent='导出清晰度 ';
    const resolution=document.createElement('select');resolution.id='androidFleetResolution';
    resolution.innerHTML='<option value="standard">普通 · 2400 × 1350</option><option value="4k">4K · 3840 × 2160</option>';
    resolution.value=navigator.deviceMemory && navigator.deviceMemory<=4?'standard':'4k';
    resolutionLabel.append(resolution);document.getElementById('fleetWorkspace').querySelector('.fleet-top-actions').before(resolutionLabel);
    document.getElementById('pngExport').textContent='导出全家福 ↗';
    if (!HTMLDialogElement.prototype.showModal) {
      const warning=document.createElement('p');warning.className='compat-warning';warning.textContent='系统 WebView 版本过旧，请更新 Android System WebView 后使用导入与编辑功能。';document.querySelector('main').prepend(warning);
    }
    document.addEventListener('visibilitychange',()=>{if(document.hidden)window.dispatchEvent(new Event('starport:pause'));});
    window.StarportMobile = {
      back() {
        const dialog=document.querySelector('dialog[open]');
        if(dialog){if(dialog.dispatchEvent(new Event('cancel',{cancelable:true}))&&dialog.open)dialog.close();return true;}
        const focused=document.activeElement;
        if(focused&&['INPUT','TEXTAREA','SELECT'].includes(focused.tagName)){focused.blur();return true;}
        if(!document.getElementById('libraryWorkspace').hidden)return false;
        document.getElementById('allModels').click();syncNav();window.scrollTo(0,0);return true;
      }
    };
  });

  function installCanvasGestures() {
    const canvas=document.getElementById('fleetCanvas'), wrap=canvas.parentElement;
    wrap.classList.add('mobile-viewport');
    const controls=document.createElement('div');controls.className='canvas-controls';
    controls.innerHTML='<button data-mode="move" aria-pressed="true">移动舰船</button><button data-mode="pan" aria-pressed="false">平移画布</button><button data-zoom="-" aria-label="缩小画布">−</button><output>100%</output><button data-zoom="+" aria-label="放大画布">＋</button><button data-zoom="reset">适应</button>';
    wrap.before(controls);
    const hint=document.createElement('p');hint.className='gesture-hint';hint.textContent='双指缩放和平移；“移动舰船”可拖动选中的舰船。“平移画布”只移动视野，不修改排列。';wrap.after(hint);
    let scale=1,x=0,y=0,mode='move',gesture=null;
    const pointers=new Map();
    function dimensions(){return{w:wrap.clientWidth,h:wrap.clientHeight};}
    function apply(){
      const {w,h}=dimensions(); x=Math.max(w*(1-scale),Math.min(0,x));y=Math.max(h*(1-scale),Math.min(0,y));
      canvas.style.transform=`translate(${x}px,${y}px) scale(${scale})`;
      controls.querySelector('output').value=Math.round(scale*100)+'%';
    }
    function zoom(next,cx,cy){const prior=scale;scale=Math.max(1,Math.min(5,next));x=cx-(cx-x)*scale/prior;y=cy-(cy-y)*scale/prior;apply();}
    function local(event){const rect=wrap.getBoundingClientRect();return{x:event.clientX-rect.left,y:event.clientY-rect.top};}
    function snapshot(){
      const values=[...pointers.values()],a=values[0],b=values[1];
      return b?{cx:(a.x+b.x)/2,cy:(a.y+b.y)/2,d:Math.hypot(a.x-b.x,a.y-b.y),scale,x,y}
        :a?{cx:a.x,cy:a.y,d:0,scale,x,y}:null;
    }
    function cancelShip(event){
      window.StarportFleetDrag?.cancel(event.pointerId);
    }
    function down(event){
      if(event.button!==0)return;
      pointers.set(event.pointerId,local(event));
      if(pointers.size>=2||mode==='pan'){
        cancelShip(event);event.preventDefault();event.stopImmediatePropagation();
        wrap.setPointerCapture(event.pointerId);gesture=snapshot();
      }
    }
    function move(event){
      if(!pointers.has(event.pointerId))return;
      pointers.set(event.pointerId,local(event));
      if(!gesture)return;
      event.preventDefault();event.stopImmediatePropagation();
      const current=snapshot();if(!current)return;
      if(current.d&&gesture.d){
        scale=Math.max(1,Math.min(5,gesture.scale*current.d/gesture.d));
        x=current.cx-(gesture.cx-gesture.x)*scale/gesture.scale;
        y=current.cy-(gesture.cy-gesture.y)*scale/gesture.scale;
      }else{x=gesture.x+current.cx-gesture.cx;y=gesture.y+current.cy-gesture.cy;}
      apply();
    }
    function end(event){
      if(!pointers.has(event.pointerId))return;
      pointers.delete(event.pointerId);
      if(gesture){event.preventDefault();event.stopImmediatePropagation();cancelShip(event);gesture=snapshot();}
      if(!pointers.size)gesture=null;
    }
    for(const [type,handler]of [['pointerdown',down],['pointermove',move],['pointerup',end],['pointercancel',end]])wrap.addEventListener(type,handler,{capture:true});
    controls.addEventListener('click',event=>{
      const button=event.target.closest('button');if(!button)return;
      if(button.dataset.mode){mode=button.dataset.mode;controls.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));}
      else if(button.dataset.zoom==='reset'){scale=1;x=y=0;apply();}
      else{const{w,h}=dimensions();zoom(scale*(button.dataset.zoom==='+'?1.25:.8),w/2,h/2);}
    });
    new ResizeObserver(apply).observe(wrap);
    window.StarportCanvas={reset:()=>{scale=1;x=y=0;apply();},status:()=>({scale,x,y,mode})};
  }
})();
