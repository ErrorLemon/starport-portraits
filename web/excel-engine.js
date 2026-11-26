/* Local workbook interpretation and conservative model matching. Does not execute spreadsheet formulas. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FleetExcel=api;})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  const text=v=>String(v??'').trim();
  const norm=v=>text(v).normalize('NFKC').toLowerCase().replace(/[\s·・_\-—()（）]/g,'');
  const header=v=>norm(v);
  const standardName=s=>`${s.community_name?.display_name||s.name_zh||s.name} / ${s.name}`;
  function detect(rows){
    let best={score:0,header:0,member:-1,nickname:-1,ships:[],quantity:-1,layout:'wide'};
    for(let r=0;r<Math.min(rows.length,20);r++){
      const h=(rows[r]||[]).map(header),member=h.findIndex(x=>['username','member','成员','成员名称','游戏id','游戏昵称','玩家','玩家id'].includes(x));
      const nickname=h.findIndex(x=>['zh','中文名','中文昵称','昵称','备注名'].includes(x));
      let ships=h.map((v,i)=>/^ship\d+$/.test(v)?i:-1).filter(i=>i>=0),layout='wide';
      if(!ships.length){ships=h.map((v,i)=>['ship','shipname','舰船','舰船名称','舰船型号','英文型号','型号'].includes(v)?i:-1).filter(i=>i>=0);layout='long';}
      const quantity=h.findIndex(x=>['quantity','qty','数量','艘数'].includes(x)),score=(member>=0?100:0)+ships.length;
      if(member>=0&&ships.length&&score>best.score)best={score,header:r,member,nickname,ships,quantity,layout};
    }
    return best;
  }
  const tokenKey=v=>{const t=norm(v).match(/[a-z]+[0-9]+[a-z]*|[a-z]+|[0-9]+|[\u3400-\u9fff]+|[^a-z0-9\u3400-\u9fff]/g)||[];return t.sort().join('|');};
  function makeIndex(ships){
    const index=new Map();
    for(const s of ships){const values=[s.id,s.name,s.name_zh,standardName(s),...s.aliases||[]];
      for(const v of values){const key=norm(v);if(!key)continue;const list=index.get(key)||[];if(!list.includes(s.id))list.push(s.id);index.set(key,list);}
    }
    return index;
  }
  function distance(a,b){const row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let prior=row[0];row[0]=i;for(let j=1;j<=b.length;j++){const prev=row[j];row[j]=Math.min(row[j]+1,row[j-1]+1,prior+(a[i-1]===b[j-1]?0:1));prior=prev;}}return row[b.length];}
  function suggest(raw,ships){
    const q=norm(raw).replace(/[еЕ]/g,'e');if(!q)return [];
    const scored=ships.map(s=>{let score=0;for(const v of [s.name,s.name_zh,...s.aliases||[]]){const n=norm(v);if(!n)continue;let rank=(n.includes(q)||q.includes(n)) ? .7+.3*Math.min(n.length,q.length)/Math.max(n.length,q.length):1-distance(q,n)/Math.max(q.length,n.length);const qa=q.match(/[a-z]+[0-9]+[a-z]*|[a-z]+|[0-9]+|[\u3400-\u9fff]+/g)||[],na=n.match(/[a-z]+[0-9]+[a-z]*|[a-z]+|[0-9]+|[\u3400-\u9fff]+/g)||[];const common=qa.reduce((n,t)=>n+(na.includes(t)?t.length:0),0);rank=Math.max(rank,common/Math.max(q.length,n.length),1-distance([...q].sort().join(''),[...n].sort().join(''))/Math.max(q.length,n.length));score=Math.max(score,rank);}return {id:s.id,score};});
    // Suggestions are never accepted as matches, including likely spelling mistakes.
    return scored.filter(s=>s.score>=.36).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)).slice(0,8).map(s=>s.id);
  }
  function analyze(rows,config,ships,remembered={}){
    if(config.member<0||!config.ships.length)throw new Error('请选择成员列和至少一列舰船');
    if(config.ships.includes(config.member)||config.ships.includes(config.nickname)||config.ships.includes(config.quantity))throw new Error('成员、昵称、数量列不能同时作为舰船列');
    const index=makeIndex(ships),tokenIndex=new Map();
    for(const s of ships)for(const v of [s.name,s.name_zh,...s.aliases||[]]){const k=tokenKey(v),list=tokenIndex.get(k)||[];if(k&&!list.includes(s.id))list.push(s.id);tokenIndex.set(k,list);}
    const groups=new Map(),entries=[],errors=[];let dataRows=0,emptyRows=0,sourceCells=0;
    for(let r=config.header+1;r<rows.length;r++){
      const cells=rows[r]||[];if(!cells.some(v=>text(v)))continue;dataRows++;
      const member=text(cells[config.member]),nickname=config.nickname>=0?text(cells[config.nickname]):'';
      const filled=config.ships.filter(c=>text(cells[c]));if(!filled.length){emptyRows++;continue;}
      if(!member||member.length>40){errors.push(`第 ${r+1} 行：成员 ID 为空或超过 40 字符`);continue;}
      const display=config.display==='zh'?(nickname||member):config.display==='both'&&nickname?`${nickname} (${member})`:member;
      if(display.length>40){errors.push(`第 ${r+1} 行：显示名称超过 40 字符，请改用 username`);continue;}
      const quantity=config.layout==='long'&&config.quantity>=0?Number(cells[config.quantity]||1):1;
      if(!Number.isInteger(quantity)||quantity<1||quantity>50){errors.push(`第 ${r+1} 行：数量须为 1–50 的整数`);continue;}
      for(const c of filled){
        const raw=text(cells[c]),key=norm(raw);sourceCells++;
        if(!groups.has(key)){
          const exact=index.get(key)||[],candidates=exact.length?exact:tokenIndex.get(tokenKey(raw))||[],known=Object.prototype.hasOwnProperty.call(remembered,key)?remembered[key]:undefined;
          const valid=known==='__skip__'||ships.some(s=>s.id===known);
          const selected=valid?known:candidates.length===1?candidates[0]:'';
          groups.set(key,{key,raw,variants:[],count:0,candidates,suggestions:candidates.length?candidates:suggest(raw,ships),selected,method:valid?'remembered':selected?(exact.length?'exact':'token_order'):'pending'});
        }
        const g=groups.get(key);if(!g.variants.includes(raw))g.variants.push(raw);g.count+=quantity;
        entries.push({member:display,member_id:member.toLowerCase(),member_username:member,member_zh:nickname,quantity,key,row:r+1,column:c});
      }
    }
    return {groups:[...groups.values()],entries,errors,stats:{dataRows,emptyRows,sourceCells,memberCount:new Set(entries.map(e=>e.member_id)).size,total:entries.reduce((n,e)=>n+e.quantity,0)}};
  }
  function resolve(analysis,selections,ships,sheet){
    if(analysis.errors.length)throw new Error(analysis.errors.join('；'));
    const mapping=new Map(analysis.groups.map(g=>[g.key,selections?.[g.key]??g.selected]));
    if([...mapping.values()].some(v=>!v))throw new Error('还有舰船名称待确认，请选择型号或明确跳过');
    const valid=new Set(ships.map(s=>s.id)),rows=new Map();let skipped=0;
    for(const e of analysis.entries){const id=mapping.get(e.key);if(id==='__skip__'){skipped+=e.quantity;continue;}if(!valid.has(id))throw new Error('选择的舰船已不在图库中');
      const key=JSON.stringify([e.member_id,id]);let row=rows.get(key);
      if(!row){row={member:e.member,member_id:e.member_id,member_username:e.member_username,member_zh:e.member_zh,ship_id:id,quantity:0,import_sources:[]};rows.set(key,row);}
      row.quantity+=e.quantity;row.import_sources.push({sheet,row:e.row,column:e.column,original:analysis.groups.find(g=>g.key===e.key).raw});
      if(row.quantity>50)throw new Error(`成员 ${e.member} 同一型号超过 50 艘`);
    }
    const result=[...rows.values()];if(!result.length)throw new Error('没有可导入的舰船');
    return {rows:result,skipped,total:result.reduce((n,r)=>n+r.quantity,0),aliases:Object.fromEntries(mapping)};
  }
  function workbook(XLSX,buffer){
    const w=XLSX.read(buffer,{type:'array',cellStyles:false,cellHTML:false,cellFormula:true,bookVBA:false,sheetRows:10001});
    const sheets=[];
    for(const name of w.SheetNames){const ws=w.Sheets[name];let maxRow=0,maxCol=0;
      // Some real-world exports write !ref=X148 rather than A1:X148. Use actual cell addresses.
      for(const k of Object.keys(ws)){if(k[0]==='!')continue;const p=XLSX.utils.decode_cell(k);maxRow=Math.max(maxRow,p.r);maxCol=Math.max(maxCol,p.c);}
      if(maxRow>=10000||maxCol>=256||ws['!fullref'])throw new Error('表格过大：每表最多 10000 行、256 列，请先拆分');
      const rows=Array.from({length:maxRow+1},()=>[]),formulaWarnings=[];
      for(const k of Object.keys(ws)){if(k[0]==='!')continue;const p=XLSX.utils.decode_cell(k),cell=ws[k];
        if(cell.t==='e'){rows[p.r][p.c]='';formulaWarnings.push(`${name}!${k}：Excel 错误值`);}
        else if(cell.f&&cell.v==null){rows[p.r][p.c]='';formulaWarnings.push(`${name}!${k}：公式没有缓存结果`);}
        else rows[p.r][p.c]=cell.v==null?'':text(cell.v);
      }
      sheets.push({name,rows,detected:detect(rows),formulaWarnings});
    }
    return sheets;
  }
  function fingerprint(buffer){let hash=2166136261;for(const b of new Uint8Array(buffer)){hash^=b;hash=Math.imul(hash,16777619);}return `${buffer.byteLength}-${(hash>>>0).toString(16)}`;}
  return {text,norm,standardName,detect,makeIndex,suggest,analyze,resolve,workbook,fingerprint};
});
