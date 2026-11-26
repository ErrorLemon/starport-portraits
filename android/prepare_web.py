"""Build bundled Android web assets from the existing desktop edition, without modifying it."""
from pathlib import Path
import hashlib
import json
import shutil
import sys

root = Path(__file__).resolve().parent
source = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else root.parent / 'web'
target = root / 'app/src/main/assets/www'
target.mkdir(parents=True, exist_ok=True)

def replace(text, old, new, count=1):
    if text.count(old) != count:
        raise RuntimeError(f'Expected {count} occurrence(s), found {text.count(old)}: {old[:100]}')
    return text.replace(old, new)

scripts = ['app.js', 'fleet.js', 'nameplate.js', 'fleet-engine.js', 'excel-engine.js', 'excel.js']
for name in ['index.html', 'app.css', 'fleet.css', *scripts, 'data/excel-template.js', 'vendor/xlsx.full.min.js']:
    path = target / name
    path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source / name, path)
for name in ['mobile.js', 'mobile.css']:
    shutil.copy2(root / name, target / name)
shutil.copytree(source/'vendor',target/'vendor',dirs_exist_ok=True)

library = json.loads((source/'data/library.js').read_text().removeprefix('window.FLEET_LIBRARY=').rstrip(';\n'))
for asset_id, asset in library['assets'].items():
    path = Path(asset['file'])
    assert path.parts[0] == 'assets' and '..' not in path.parts
    raw = (source/path).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == asset['sha256'], asset_id
    (target/path).parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source/path, target/path)
    library['image_data'][asset_id] = path.as_posix()
(target/'data/library.js').write_text('window.FLEET_LIBRARY='+json.dumps(library,ensure_ascii=False,separators=(',',':'))+';\n')
backgrounds = json.loads((source/'data/nameplate-backgrounds.js').read_text().removeprefix('window.FLEET_BACKGROUNDS=').rstrip(';\n'))
for bg in backgrounds:
    path = Path(bg['file'])
    assert path.parts[0] == 'backgrounds' and '..' not in path.parts
    assert hashlib.sha256((source/path).read_bytes()).hexdigest() == bg['sha256']
    (target/path).parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source/path, target/path)
    bg['data'] = path.as_posix()
(target/'data/nameplate-backgrounds.js').write_text('window.FLEET_BACKGROUNDS='+json.dumps(backgrounds,ensure_ascii=False,separators=(',',':'))+';\n')
for name in ['中文名称来源与许可.md','Excel名称核对说明.md']:
    shutil.copy2(source/name,target/name)
for name in ['vendor/LICENSE.txt','vendor/LICENSE','vendor/README.md','backgrounds/sources.json']:
    if (source/name).exists():
        (target/name).parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(source/name,target/name)

html=(target/'index.html').read_text()
html=replace(html,"connect-src 'none'","connect-src 'self' data:")
html=replace(html,'  <script src="data/library.js" defer></script>', '  <script src="data/library.js" defer></script>\n  <script src="mobile.js" defer></script>')
html=replace(html,'  <link rel="stylesheet" href="fleet.css">','  <link rel="stylesheet" href="fleet.css">\n  <link rel="stylesheet" href="mobile.css">')
html=replace(html,'版本 0.5.1','安卓版 0.6.0')
(target/'index.html').write_text(html)

app=(target/'app.js').read_text()
start=app.index('  function download(blob,name) {')
end=app.index("  $('downloadImage')",start)
app=app[:start]+"  function download(blob,name) {return window.StarportFiles.save(blob,name);}\n"+app[end:]
start=app.index("  $('downloadImage').addEventListener")
end=app.index('  function validateLibrary',start)
app=app[:start]+'''  $('downloadImage').addEventListener('click',async()=>{
    const a=replacement?.asset || assetFor(editing),data=replacement?.data || imageFor(a);if(!data)return;
    try{const response=await fetch(data);if(!response.ok)throw new Error('无法读取图片');
      await download(await response.blob(),`${editing.id}-${view}.${a.content_type==='image/png'?'png':a.content_type==='image/jpeg'?'jpg':'webp'}`);
    }catch(e){toast(e.message);}
  });
  $('exportLibrary').addEventListener('click',async()=>{
    $('exportLibrary').disabled=true;
    try{const portable=await window.StarportFiles.portableLibrary(library);portable.exported_at=new Date().toISOString();
      const result=await download(new Blob([JSON.stringify(portable)],{type:'application/json'}),`舰船素材库-${new Date().toISOString().slice(0,10)}.fleetlib.json`);
      if(result.status==='saved'){backupNeeded=false;saveLabel('完整图库备份已保存');toast('完整备份已保存，包含全部图片、资料和修改');}
    }catch(e){toast('导出失败：'+e.message);}finally{$('exportLibrary').disabled=false;}
  });
'''+app[end:]
app=replace(app,'function validateLibrary(data) {','function validateLibrary(data,allowBundled=false) {')
app=replace(app,"!/^data:image\\/(png|webp|jpeg);base64,[a-z0-9+/=]+$/i.test(data.image_data[id]||'')", "(!/^data:image\\/(png|webp|jpeg);base64,[a-z0-9+/=]+$/i.test(data.image_data[id]||'')&&!(allowBundled&&window.StarportFiles.isBundled(id,data.image_data[id])))")
app=replace(app,'validateLibrary(get.result)','validateLibrary(get.result,true)')
# Flush pending debounced writes when Android pauses the activity.
app=replace(app,"  function tally() {", "  window.addEventListener('starport:pause',()=>{if(!db||!dirty)return;clearTimeout(persistTimer);try{const tx=db.transaction('libraries','readwrite');tx.objectStore('libraries').put(library,'current');tx.oncomplete=()=>{dirty=false;};}catch{saveLabel('请导出备份保存修改',true);}});\n  function tally() {")
(target/'app.js').write_text(app)

fleet=(target/'fleet.js').read_text()
old="function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}"
fleet=replace(fleet,old,'function download(blob,name){return window.StarportFiles.save(blob,name);}')
fleet=replace(fleet,'  let drag=null;','  let drag=null;\n  window.StarportFleetDrag={cancel:()=>{if(drag){project.positions[drag.id]=drag.origin;drag=null;paint(ctx);}}};')
fleet=replace(fleet,'drag={id:hit.id,dx:', 'drag={id:hit.id,origin:{...position},dx:')
fleet=replace(fleet,'  function state(message)',"  window.addEventListener('starport:pause',()=>{if(!projectDb||!dirty)return;clearTimeout(saveTimer);try{const tx=projectDb.transaction('projects','readwrite');tx.objectStore('projects').put(project,'current');tx.oncomplete=()=>{dirty=false;};}catch{state('请保存工程备份');}});\n  function state(message)")
# Preview remains the existing 2400x1350 logical coordinate system, so layouts stay portable.
fleet=replace(fleet,'output.width=3840;output.height=2160;const c=output.getContext(\'2d\');c.scale(1.6,1.6);',"const resolution=$('androidFleetResolution')?.value==='standard'?1:1.6;output.width=2400*resolution;output.height=1350*resolution;const c=output.getContext('2d');c.scale(resolution,resolution);")
fleet=replace(fleet,"download(blob,safeName()+'.png');output.width=output.height=0;notify", "output.width=output.height=0;const result=await download(blob,safeName()+'.png');if(result.status==='cancelled')return;notify")
fleet=replace(fleet,":'4K 全家福已生成'", ":(result.status==='shared'?'分享面板已打开':'全家福图片已保存')")
start=fleet.index("  $('projectExport').addEventListener")
end=fleet.index('  function validateProject',start)
fleet=fleet[:start]+'''  $('projectExport').addEventListener('click',async()=>{
    $('projectExport').disabled=true;
    try{const snapshot=structuredClone(project),library=await window.StarportFiles.portableLibrary(lib());
      const data={...snapshot,exported_at:new Date().toISOString(),library};
      const result=await download(new Blob([JSON.stringify(data)],{type:'application/json'}),safeName()+'.fleetproject.json');
      if(result.status==='saved')state('工程备份已保存 · 包含全部图库、成员和位置');
    }catch(e){notify('工程导出失败：'+e.message);}finally{$('projectExport').disabled=false;}
  });
'''+fleet[end:]
fleet=replace(fleet,"safeName()+'-成员.csv');", "safeName()+'-成员.csv').catch(e=>notify(e.message));")
fleet=replace(fleet,"$('pngExport').disabled=true;try", "$('pngExport').disabled=true;try")
# Evict decoded ships no longer present in the active fleet, including previous views.
fleet=replace(fleet,'    renderRoster();warningText();',"    const used=new Set(items.map(i=>i.asset.id));used.add('project-logo');for(const key of cache.keys())if(!used.has(key)){window.StarportImages.dispose(cache.get(key));cache.delete(key);}\n    renderRoster();warningText();")
start=fleet.index('  function imageFor(asset)')
end=fleet.index('  function logoFor()',start)
fleet=fleet[:start]+'''  function imageFor(asset){
    const data=lib().image_data[asset.id],item=items.find(i=>i.asset.id===asset.id),box=item?.geometry.crop||asset.alpha_bbox||[0,0,asset.width,asset.height];
    const metrics=item?E.metrics(item,project.ppm,project.font,project.modelFont,effectiveModels()):null;
    const largest=Math.max(box[2]-box[0],box[3]-box[1]),needed=metrics?Math.max(metrics.imageW,metrics.imageH)*2:largest;
    const tier=Math.min(largest,Math.max(64,Math.ceil(needed/64)*64)),ratio=tier/largest;
    const width=Math.max(1,Math.round((box[2]-box[0])*ratio)),height=Math.max(1,Math.round((box[3]-box[1])*ratio));
    const key=width+'x'+height+':'+box.join(',');let hit=cache.get(asset.id);
    if(hit&&hit.data===data&&hit.key===key)return hit;
    window.StarportImages.dispose(hit);
    hit={data,key,im:null,ready:false,promise:null};
    hit.promise=window.StarportImages.load(data,box,width,height).then(im=>{
      hit.im=im;if(hit.disposed){if(typeof im.close==='function')im.close();return null;}hit.ready=true;return im;
    }).catch(error=>{hit.error=error.message;return null;});cache.set(asset.id,hit);return hit;
  }
  window.StarportImageStatus=()=>[...cache].filter(([,hit])=>hit.error).map(([id,hit])=>({id,error:hit.error}));
'''+fleet[end:]
fleet=replace(fleet,'context.drawImage(im,box[0],box[1],box[2]-box[0],box[3]-box[1],left,top,r.imageW,r.imageH);', 'context.drawImage(im,0,0,im.width,im.height,left,top,r.imageW,r.imageH);')
fleet=replace(fleet,'window.onFleetLibraryChanged=()=>{cache.clear();', 'window.onFleetLibraryChanged=()=>{for(const hit of cache.values())window.StarportImages.dispose(hit);cache.clear();')
(target/'fleet.js').write_text(fleet)

card=(target/'nameplate.js').read_text()
card=replace(card,old,'function download(blob,name){return window.StarportFiles.save(blob,name);}')
card=replace(card,"download(new Blob([JSON.stringify(settings)],{type:'application/json'}),filename()+'.nameplate.json');", "download(new Blob([JSON.stringify(settings)],{type:'application/json'}),filename()+'.nameplate.json').catch(e=>notify(e.message));")
card=replace(card,"download(blob,filename()+'-个人名牌.png');output.width=output.height=0;notify('个人名牌已生成 · 3200 × 1200 PNG');", "output.width=output.height=0;const result=await download(blob,filename()+'-个人名牌.png');if(result.status!=='cancelled')notify(result.status==='shared'?'分享面板已打开':'个人名牌已保存 · 3200 × 1200 PNG');")
card=replace(card,"const {ship,asset,data}=selected(),needed=", "const {ship,asset,data}=selected(),used=new Set([background()?.data,settings.logo,data]);for(const key of images.keys())if(!used.has(key))images.delete(key);const needed=")
(target/'nameplate.js').write_text(card)

excel=(target/'excel.js').read_text()
start=excel.index("  $('downloadExcelTemplate').addEventListener")
end=excel.index("  $('excelFile')",start)
excel=excel[:start]+'''  $('downloadExcelTemplate').addEventListener('click',async()=>{
    const template=window.FLEET_EXCEL_TEMPLATE;if(!template){notify('未加载标准模板');return;}
    try{const bytes=Uint8Array.from(atob(template.base64),c=>c.charCodeAt(0));
      await window.StarportFiles.save(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),template.filename);
    }catch(e){notify(e.message);}
  });
'''+excel[end:]
excel=replace(excel,"],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='舰船名称匹配记录.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);", "],{type:'application/json'});window.StarportFiles.save(blob,'舰船名称匹配记录.json').catch(e=>notify(e.message));")
(target/'excel.js').write_text(excel)

files=[p for p in target.rglob('*') if p.is_file()]
report={'models':len(library['ships']),'ship_images':len(library['assets']),'backgrounds':len(backgrounds),'files':len(files),'uncompressed_bytes':sum(p.stat().st_size for p in files),'desktop_source_unmodified':True}
(root/'asset-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False))
