const fs=require('fs'),assert=require('node:assert/strict');
const X=require('../web/vendor/xlsx.full.min.js');
const E=require('../web/excel-engine.js');
const library=JSON.parse(fs.readFileSync('web/data/library.json'));
const source=fs.readFileSync('docs/舰队标准导入模板.xlsx');
const sheets=E.workbook(X,source),fill=sheets[0],catalog=sheets[1];
assert.equal(fill.name,'舰队舰船明细');assert.equal(catalog.name,'舰船目录');
assert.equal(fill.detected.header,5);assert.equal(fill.detected.member,0);assert.equal(fill.detected.nickname,1);assert.equal(fill.detected.quantity,3);assert.equal(fill.detected.layout,'long');assert.deepEqual(fill.detected.ships,[2]);
assert.equal(E.analyze(fill.rows,{...fill.detected,display:'username'},library.ships).stats.total,0);
assert.equal(fill.formulaWarnings.length,0);assert.equal(catalog.formulaWarnings.length,0);
const options=catalog.rows.slice(6).filter(r=>r[0]);assert.equal(options.length,248);assert.equal(new Set(options.map(r=>r[0])).size,248);
const expected=new Map(library.ships.map(s=>[E.standardName(s),s]));
for(const row of options){assert(expected.has(row[0]));assert.equal(expected.get(row[0]).id,row[5]);}
// Simulate one completed row for every dropdown option, without changing the distributed file.
const rows=fill.rows.slice(0,6).map(r=>[...r]);
for(const [i,option] of options.entries())rows.push(['TemplateTest_'+i,'同名昵称',option[0],i===0?2:1,'']);
let a=E.analyze(rows,{...fill.detected,display:'zh'},library.ships);assert.equal(a.errors.length,0);assert.equal(a.groups.length,248);assert.equal(a.groups.filter(g=>!g.selected).length,0);
let result=E.resolve(a,{},library.ships,fill.name);assert.equal(result.total,249);assert.equal(result.rows.length,248);assert.equal(new Set(result.rows.map(r=>r.member_id)).size,248);
for(const row of result.rows)assert.equal(row.ship_id,options[Number(row.member_username.replace('TemplateTest_',''))][5]);
// Blank quantity means one, mixed generation variants remain distinct, bad quantities fail atomically.
const variants=library.ships.filter(s=>/^Aurora Mk I/.test(s.name)).slice(0,2);assert.equal(variants.length,2);
const short=fill.rows.slice(0,6).map(r=>[...r]);short.push(['SameUser','昵称',E.standardName(variants[0]),''],['SameUser','昵称',E.standardName(variants[1]),3]);
result=E.resolve(E.analyze(short,{...fill.detected,display:'username'},library.ships),{},library.ships,fill.name);assert.equal(result.total,4);assert.equal(result.rows.length,2);
short[6][3]=1.5;a=E.analyze(short,fill.detected,library.ships);assert(a.errors.length);assert.throws(()=>E.resolve(a,{},library.ships,fill.name));
const index=E.makeIndex(library.ships);assert(!index.has(E.norm('野马 / 不存在的型号')));
console.log('PASS: actual blank template, 248 unique bilingual selections, exact IDs, no ambiguous selection, quantities, optional nicknames, same nickname with distinct usernames, variant separation and invalid quantity.');
