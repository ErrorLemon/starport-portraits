'use strict';
(()=>{
  const $=id=>document.getElementById(id),E=window.FleetExcel,esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const catalog=()=>window.FleetCatalog.get().ships,notify=m=>window.FleetCatalog.notify(m);
  const host=document.createElement('div');host.innerHTML=`
    <input id="excelFile" type="file" accept=".xlsx,.xls,.xlsm" hidden>
    <dialog id="excelDialog" aria-labelledby="excelTitle"><div class="dialog-header"><div><div class="eyebrow">EXCEL / LOCAL IMPORT</div><h2 id="excelTitle">导入成员舰船</h2><p id="excelFilename" class="form-help"></p></div><button id="excelClose" class="icon-button" aria-label="关闭">×</button></div>
    <div class="dialog-body excel-body"><div class="excel-note">表格在本机解析，不会上传。每个 ship 单元格计为一艘；同一成员的重复型号累计数量。先核对再应用。</div>
    <div class="excel-config"><label>工作表<select id="excelSheet"></select></label><label>表头在第几行<input id="excelHeader" type="number" min="1" max="10000" value="1"></label><label>格式<select id="excelLayout"><option value="wide">每人一行，多个 ship 列</option><option value="long">每艘一行，可带数量</option></select></label>
    <label>成员 ID 列<select id="excelMember"></select></label><label>中文昵称列<select id="excelNickname"></select></label><label>图片上的成员名<select id="excelDisplay"><option value="username">username / 成员 ID</option><option value="zh">ZH 优先，空值用 ID</option><option value="both">ZH (username)</option></select></label><label id="excelQtyLabel">数量列（逐行明细）<select id="excelQuantity"></select></label></div>
    <details class="excel-columns"><summary>选择舰船列 <span id="excelColumnCount"></span></summary><div id="excelColumns"></div></details>
    <div id="excelSummary" class="excel-summary" role="status" aria-live="polite"></div><div id="excelErrors" class="excel-error"></div>
    <div class="excel-review-head"><h3>舰船名称匹配</h3><label class="checks"><input id="excelPendingOnly" type="checkbox" checked>仅显示待确认</label><input id="excelNameFilter" type="search" placeholder="筛选表格中的舰船名称"></div>
    <p class="form-help">大小写、空格和连接符会统一处理。简称、错字和无法确定的变体只提供候选，须手动确认。没有对应型号时可明确跳过，并在导入后补充图库。</p>
    <div class="excel-match-wrap"><table class="excel-match"><thead><tr><th>表格原名 / 数量</th><th>对应的图库型号（可修改）</th><th>依据</th></tr></thead><tbody id="excelMatches"></tbody></table></div>
    <details class="excel-preview"><summary>查看将导入的成员清单</summary><div id="excelPreview"></div></details>
    <div class="excel-final-options"><label>应用方式<select id="excelMode"><option value="append">追加到当前清单</option><option value="replace">替换当前清单（保留画布设置）</option></select></label><label class="checks"><input id="excelRemember" type="checkbox" checked>在本工程记住这次名称对应关系</label></div>
    <p class="form-help">替换会移除现有成员和排列。建议先关闭窗口，保存工程备份。完成后仍可修改成员、数量和舰船。</p></div>
    <div class="dialog-footer"><button id="excelReport" class="button quiet">下载名称匹配记录</button><button id="excelApply" class="button accent" disabled>确认并导入</button></div></dialog>`;
  document.body.append(host);
  let sheets=[],filename='',fingerprint='',sheet,config,analysis,selections=Object.create(null),selectedColumns=[];
  const option=(value,label,selected=false)=>`<option value="${esc(value)}"${selected?' selected':''}>${esc(label)}</option>`;
  const shipLabel=s=>`${s.name_zh||s.name} · ${s.name} [${s.id}]`;
  function fillColumns(){
    const headerRow=Math.max(0,Number($('excelHeader').value)-1),cells=sheet.rows[headerRow]||[],width=Math.max(cells.length,...sheet.rows.slice(0,100).map(r=>r.length)),d=E.detect(sheet.rows.slice(headerRow,headerRow+1));
    const columns=Array.from({length:width},(_,i)=>({i,label:`${window.XLSX.utils.encode_col(i)} · ${cells[i]||'无表头'}`}));
    const opts=columns.map(c=>option(c.i,c.label)).join('');$('excelMember').innerHTML=option(-1,'请选择成员列')+opts;$('excelNickname').innerHTML=option(-1,'不使用昵称')+opts;$('excelQuantity').innerHTML=option(-1,'每行一艘')+opts;
    $('excelMember').value=d.member;$('excelNickname').value=d.nickname;$('excelQuantity').value=d.quantity;$('excelLayout').value=d.layout;
    selectedColumns=[...d.ships];$('excelColumns').innerHTML=columns.map(c=>`<label class="checks"><input type="checkbox" data-column="${c.i}"${selectedColumns.includes(c.i)?' checked':''}>${esc(c.label)}</label>`).join('');
    selections=Object.create(null);review();
  }
  function chooseSheet(){sheet=sheets[Number($('excelSheet').value)||0];$('excelHeader').value=sheet.detected.score?sheet.detected.header+1:1;fillColumns();}
  function readConfig(){return {header:Math.max(0,Number($('excelHeader').value)-1),member:Number($('excelMember').value),nickname:Number($('excelNickname').value),quantity:Number($('excelQuantity').value),layout:$('excelLayout').value,ships:[...selectedColumns],display:$('excelDisplay').value};}
  function review(){
    config=readConfig();$('excelColumnCount').textContent=`· 已选 ${config.ships.length} 列`;$('excelQtyLabel').hidden=config.layout!=='long';
    try{analysis=E.analyze(sheet.rows,config,catalog(),window.FleetOwnershipImport.snapshot().excel_aliases||{});for(const g of analysis.groups)if(!Object.prototype.hasOwnProperty.call(selections,g.key))selections[g.key]=g.selected;render();}
    catch(e){analysis=null;$('excelSummary').textContent='设置表格列后查看匹配结果';$('excelErrors').textContent=e.message;$('excelMatches').innerHTML='';$('excelPreview').innerHTML='';$('excelApply').disabled=true;}
  }
  function renderMatches(){
    if(!analysis)return;
    const filter=E.norm($('excelNameFilter').value),pendingOnly=$('excelPendingOnly').checked,ships=catalog();
    const groups=analysis.groups.filter(g=>(!filter||E.norm(g.raw).includes(filter))&&(!pendingOnly||!selections[g.key]));
    $('excelMatches').innerHTML=groups.map(g=>{
      const chosen=selections[g.key],ids=[...new Set([...g.suggestions,...ships.map(s=>s.id)])],suggestionSet=new Set(g.suggestions);
      const opts=option('','— 请选择具体型号 —')+option('__skip__','明确跳过这类名称',chosen==='__skip__')+ids.map(id=>{const s=ships.find(s=>s.id===id);return option(id,(suggestionSet.has(id)?'候选 · ':'')+shipLabel(s),chosen===id);}).join('');
      return `<tr><td><b>${esc(g.raw)}</b><small>${g.count} 艘 / 辆${g.variants.length>1?' · 合并空格/大小写变体':''}</small></td><td><select data-match="${esc(g.key)}" aria-label="${esc(g.raw)} 对应型号">${opts}</select></td><td>${!chosen?'待确认':chosen==='__skip__'?'将跳过':chosen!==g.selected||g.method==='remembered'?'人工对应':g.method==='exact'?'名称一致':g.method==='token_order'?'词序一致':'人工对应'}</td></tr>`;
    }).join('')||'<tr><td colspan="3">当前筛选没有条目；可取消“仅显示待确认”查看全部名称。</td></tr>';
  }
  function render(){
    const s=analysis.stats,pending=analysis.groups.filter(g=>!selections[g.key]),skipped=analysis.entries.filter(e=>selections[e.key]==='__skip__').reduce((n,e)=>n+e.quantity,0),matched=analysis.entries.filter(e=>selections[e.key]&&selections[e.key]!=='__skip__').reduce((n,e)=>n+e.quantity,0);
    $('excelSummary').textContent=`${s.dataRows} 行成员记录 · ${s.memberCount} 人填有舰船 · ${s.sourceCells} 个舰船单元格 / ${s.total} 艘 · 已识别 ${matched} 艘 · ${pending.length} 种名称待确认 · 明确跳过 ${skipped} 艘 · ${s.emptyRows} 行未填舰船`;
    const errors=[...analysis.errors];if(sheet.formulaWarnings.length)errors.push(`当前工作表有 ${sheet.formulaWarnings.length} 个错误值或无缓存公式；请检查原表。解析器不会执行公式或宏。`);
    if(!analysis.entries.length)errors.push('当前设置没有读到舰船，请检查工作表、表头和舰船列。');
    let result;try{result=E.resolve(analysis,selections,catalog(),sheet.name);}catch(e){if(!pending.length&&analysis.entries.length)errors.push(e.message);}
    if(result&&result.total+( $('excelMode').value==='append'?window.FleetOwnershipImport.snapshot().rows.reduce((n,r)=>n+r.quantity,0):0)>200)errors.push('应用后超过单张全家福 200 艘的上限，请分成多个工程。');
    $('excelErrors').textContent=errors.join(' ');$('excelApply').disabled=!result||errors.length>0;
    $('excelApply').textContent=result?`确认导入 ${result.total} 艘 / 辆`:'确认并导入';
    $('excelPreview').innerHTML='<table class="excel-match"><thead><tr><th>成员显示名</th><th>表格原名 → 对应型号</th><th>数量</th><th>来源</th></tr></thead><tbody>'+analysis.entries.slice(0,200).map(e=>{const id=selections[e.key],ship=catalog().find(s=>s.id===id),g=analysis.groups.find(g=>g.key===e.key);return `<tr><td>${esc(e.member)}</td><td>${esc(g.raw)} → ${esc(ship?ship.name_zh+' / '+ship.name:id==='__skip__'?'明确跳过':'待确认')}</td><td>${e.quantity}</td><td>${esc(sheet.name)}!${window.XLSX.utils.encode_col(e.column)}${e.row}</td></tr>`;}).join('')+'</tbody></table>'+(analysis.entries.length>200?'<p>预览仅显示前 200 个单元格。</p>':'');
    renderMatches();
  }
  $('excelImport').addEventListener('click',()=>$('excelFile').click());
  $('downloadExcelTemplate').addEventListener('click',()=>{
    const template=window.FLEET_EXCEL_TEMPLATE;if(!template){notify('当前页面没有加载标准模板，请打开新版离线工具');return;}
    const bytes=Uint8Array.from(atob(template.base64),c=>c.charCodeAt(0));
    const blob=new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=template.filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  });
  $('excelFile').addEventListener('change',async()=>{
    const file=$('excelFile').files[0];if(!file)return;
    try{if(file.size>20*1024*1024)throw new Error('Excel 文件请控制在 20 MB 内');if(!/\.(xlsx|xls|xlsm)$/i.test(file.name))throw new Error('请选择 Excel 文件');
      const buffer=await file.arrayBuffer();sheets=E.workbook(window.XLSX,buffer);if(!sheets.length)throw new Error('工作簿没有工作表');
      filename=file.name;fingerprint=globalThis.crypto?.subtle?Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),b=>b.toString(16).padStart(2,'0')).join(''):E.fingerprint(buffer);
      $('excelFilename').textContent=filename+' · 仅导入下方选中的工作表';$('excelSheet').innerHTML=sheets.map((s,i)=>option(i,s.name)).join('');
      const best=[...sheets].sort((a,b)=>b.detected.score-a.detected.score)[0];$('excelSheet').value=sheets.indexOf(best);$('excelMode').value='append';$('excelNameFilter').value='';$('excelPendingOnly').checked=true;chooseSheet();$('excelDialog').showModal();
    }catch(e){notify('Excel 读取失败：'+e.message);}finally{$('excelFile').value='';}
  });
  $('excelClose').addEventListener('click',()=>$('excelDialog').close());$('excelSheet').addEventListener('change',chooseSheet);$('excelHeader').addEventListener('change',fillColumns);
  for(const id of ['excelMember','excelNickname','excelQuantity','excelDisplay','excelLayout'])$(id).addEventListener('change',review);
  $('excelMode').addEventListener('change',()=>analysis&&render());$('excelPendingOnly').addEventListener('change',renderMatches);$('excelNameFilter').addEventListener('input',renderMatches);
  $('excelColumns').addEventListener('change',event=>{if(event.target.dataset.column==null)return;const c=Number(event.target.dataset.column);selectedColumns=event.target.checked?[...new Set([...selectedColumns,c])]:selectedColumns.filter(n=>n!==c);review();});
  $('excelMatches').addEventListener('change',event=>{const key=event.target.dataset.match;if(key==null)return;selections[key]=event.target.value;render();});
  $('excelApply').addEventListener('click',()=>{
    try{if($('excelApply').disabled)return;const result=E.resolve(analysis,selections,catalog(),sheet.name),key=fingerprint+'|'+sheet.name+'|'+JSON.stringify({...config,display:undefined});
      const outcome=window.FleetOwnershipImport.apply(result.rows,{mode:$('excelMode').value,key,filename,sheet:sheet.name,aliases:$('excelRemember').checked?result.aliases:{}});
      $('excelDialog').close();notify(`Excel 已导入 ${outcome.quantity} 艘 / 辆；跳过 ${result.skipped} 艘。可继续修改清单，请保存工程备份。`);
    }catch(e){$('excelErrors').textContent=e.message;notify('此次未导入：'+e.message);}
  });
  $('excelReport').addEventListener('click',()=>{if(!analysis)return;const records=analysis.groups.map(g=>({original:g.variants,quantity:g.count,ship_id:selections[g.key]||null,matched_name:catalog().find(s=>s.id===selections[g.key])?.name||null,status:!selections[g.key]?'pending':selections[g.key]==='__skip__'?'skipped':'resolved'}));const blob=new Blob([JSON.stringify({format:'sc-fleet-excel-matches',file:filename,sheet:sheet.name,columns:config,stats:analysis.stats,records},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='舰船名称匹配记录.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);});
  window.FleetExcelQA={analysis:()=>structuredClone(analysis),selections:()=>({...selections})};
})();
