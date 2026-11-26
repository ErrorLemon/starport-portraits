package com.smandalo.starport;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.content.ContentValues;
import android.net.Uri;
import android.provider.MediaStore;
import android.view.accessibility.AccessibilityNodeInfo;
import android.os.Bundle;
import android.os.SystemClock;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

/** Runs the production JS and native export bridge in a real Android WebView. No test server. */
public class SmokeInstrumentation extends Instrumentation {
    private MainActivity activity;
    private final StringBuilder checks = new StringBuilder();

    @Override public void onCreate(Bundle args) { super.onCreate(args); start(); }
    private String evaluate(String code) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        String[] result = new String[1];
        runOnMainSync(() -> activity.webView.evaluateJavascript(code, value -> { result[0] = value; done.countDown(); }));
        if (!done.await(30, TimeUnit.SECONDS)) throw new Exception("JS callback timed out: " + code.substring(0,Math.min(code.length(),100)));
        return result[0];
    }
    private void require(String expression, String label) throws Exception {
        if (!"true".equals(evaluate("Boolean(" + expression + ")"))) throw new Exception("FAILED: " + label + " : " + evaluate(expression));
        checks.append("PASS ").append(label).append('\n');
        Bundle progress=new Bundle();progress.putString("stream","PASS "+label+"\n");sendStatus(0,progress);
    }
    private void waitFor(String expression, int seconds) throws Exception {
        long deadline = SystemClock.uptimeMillis() + seconds * 1000L;
        while (SystemClock.uptimeMillis() < deadline) {
            if ("true".equals(evaluate("Boolean(" + expression + ")"))) return;
            SystemClock.sleep(150);
        }
        throw new Exception("Timed out: " + expression + " / " + evaluate("document.body.innerText.slice(0,1500)"));
    }
    private void click(String id) throws Exception { evaluate("document.getElementById("+JSONObject.quote(id)+").click()"); }
    private void nativeClick(String text) throws Exception {
        long deadline=SystemClock.uptimeMillis()+15000;
        while(SystemClock.uptimeMillis()<deadline){
            AccessibilityNodeInfo root=getUiAutomation().getRootInActiveWindow();
            if(root!=null)for(AccessibilityNodeInfo node:root.findAccessibilityNodeInfosByText(text)){
                AccessibilityNodeInfo target=node;
                while(target!=null&&!target.isClickable())target=target.getParent();
                if(target!=null&&target.performAction(AccessibilityNodeInfo.ACTION_CLICK)){SystemClock.sleep(250);return;}
            }
            SystemClock.sleep(200);
        }
        throw new Exception("Native UI text not found: "+text);
    }
    private void set(String id, String value, String event) throws Exception {
        evaluate("(()=>{const e=document.getElementById("+JSONObject.quote(id)+");e.value="+JSONObject.quote(value)+";e.dispatchEvent(new Event("+JSONObject.quote(event)+",{bubbles:true}));})()");
    }
    private void exportCheck(String trigger, String nameEnds, int width, int height) throws Exception {
        evaluate("window.__lastExport=null;window.__exportError='';");
        click(trigger);
        waitFor("window.__lastExport || window.__exportError", 90);
        require("!window.__exportError", trigger+" JS completed");
        require("window.__lastExport.name.endsWith("+JSONObject.quote(nameEnds)+")", trigger+" filename");
        require("window.__lastExport.bytes>0", trigger+" nonempty");
        if(width>0) {
            require("window.__lastExport.width==="+width+" && window.__lastExport.height==="+height,trigger+" image dimensions");
        }
    }
    @Override public void onStart() {
        Bundle result = new Bundle();
        try {
            Intent intent = new Intent(getTargetContext(), MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity = (MainActivity)startActivitySync(intent);
            waitFor("window.FleetCatalog && window.FleetOwnershipImport && window.StarportMobile && window.FleetExcelQA",60);
            require("window.isSecureContext && !!crypto.subtle", "secure local origin");
            require("location.host==='appassets.androidplatform.net'", "bundled asset loader");
            require("FleetCatalog.get().ships.length===248 && Object.keys(FleetCatalog.get().assets).length===494", "complete offline catalog");
            require("document.querySelectorAll('.mobile-nav button').length===3", "three mobile workspaces");
            require("document.getElementById('androidManufacturer').options.length>2","manufacturer filters available on mobile");
            set("search","北极星","input");
            require("fleetLibraryStatus().filtered===1","community Chinese search");click("resetFilters");
            click("fleetNav");click("loadExample");
            waitFor("fleetProjectStatus().items===15 && !fleetProjectStatus().loadingImages",60);
            require("fleetProjectStatus().omitted===0","15 ships loaded offline");
            set("fleetLayoutMode","compact","change");
            waitFor("!fleetProjectStatus().loadingImages",30);
            require("FleetOwnershipImport.snapshot().layoutMode==='compact'","compact arrangement");
            set("fleetHeaderAlign","center","change");set("fleetFont","10","change");
            click("fleetExplain_length");
            require("FleetOwnershipImport.snapshot().headerAlign==='center' && FleetOwnershipImport.snapshot().font===10","title positioning and text size");
            require("!FleetOwnershipImport.snapshot().explanations.length && FleetOwnershipImport.snapshot().explanations.model","independent explanations");
            evaluate("document.querySelector('[data-zoom=\"+\"]').click()");
            require("StarportCanvas.status().scale>1","canvas zoom");
            evaluate("document.querySelector('[data-zoom=\"reset\"]').click()");
            require("StarportCanvas.status().scale===1","canvas fit");
            // Capture bytes before the native save menu, then test the real bridge separately.
            evaluate("window.__realSave=StarportFiles.save;StarportFiles.save=async(blob,name)=>{try{window.__lastBlob=blob;const bytes=new Uint8Array(await blob.arrayBuffer());const r={name,bytes:bytes.length,type:blob.type};if(blob.type==='image/png'){const v=new DataView(bytes.buffer);r.width=v.getUint32(16);r.height=v.getUint32(20);}else if(blob.type==='application/json'){const data=JSON.parse(await blob.text());r.format=data.format;if(data.library){r.allEmbedded=Object.values(data.library.image_data).every(s=>s.startsWith('data:image/'));window.__backup=data;}}window.__lastExport=r;return{status:'saved'};}catch(e){window.__exportError=e.message;throw e;}};");
            set("androidFleetResolution","standard","change");exportCheck("pngExport",".png",2400,1350);
            set("androidFleetResolution","4k","change");exportCheck("pngExport",".png",3840,2160);
            exportCheck("projectExport",".fleetproject.json",0,0);
            require("window.__lastExport.allEmbedded","portable full project backup");
            require("__backup.rows.length===11 && __backup.explanations.length===false","backup preserves members and switches");
            // Feed an actual generated xlsx through the production file-input event and parser.
            evaluate("(()=>{const a=__backup;const b=new Blob([JSON.stringify(a)],{type:'application/json'});const d=new DataTransfer();d.items.add(new File([b],'恢复测试.fleetproject.json',{type:'application/json'}));document.getElementById('projectFile').files=d.files;document.getElementById('projectFile').dispatchEvent(new Event('change'));})()");
            waitFor("fleetProjectStatus().items===15 && !fleetProjectStatus().loadingImages",30);
            require("FleetOwnershipImport.snapshot().headerAlign==='center'","desktop-compatible project restore");
            exportCheck("downloadExcelTemplate",".xlsx",0,0);
            // Native document save and selection are manually verified on the signed release APK.
            evaluate("(()=>{const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['成员名称','舰船型号','数量'],['安卓测试','Carrack',1]]),'名单');const bytes=XLSX.write(book,{type:'array',bookType:'xlsx'});const d=new DataTransfer();d.items.add(new File([bytes],'安卓测试.xlsx',{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));document.getElementById('excelFile').files=d.files;document.getElementById('excelFile').dispatchEvent(new Event('change'));})()");
            waitFor("document.getElementById('excelDialog').open",30);
            require("FleetExcelQA.analysis().groups.some(g=>g.raw==='Carrack')","Excel import parses actual workbook");
            evaluate("document.getElementById('excelDialog').close()");
            click("nameplateNav");set("cardName","安卓验证 Lemon_ACE","input");
            waitFor("!FleetNameplate.status().busy && !FleetNameplate.status().error",30);
            click("cardExplain_length");
            require("!FleetNameplate.status().settings.explanations.length && FleetNameplate.status().settings.explanations.view","nameplate independent explanations");
            exportCheck("nameplateExport","-个人名牌.png",3200,1200);
            evaluate("window.__nativeResult=null;window.__expectedHash=null;crypto.subtle.digest('SHA-256',new Uint8Array()).then(()=>__lastBlob.arrayBuffer()).then(b=>crypto.subtle.digest('SHA-256',b)).then(b=>window.__expectedHash=Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join(''));__realSave(__lastBlob,'安卓导出验证.png').then(r=>window.__nativeResult=r).catch(e=>window.__nativeResult={status:'error',message:e.message});");
            nativeClick("保存到相册");
            waitFor("window.__nativeResult && window.__expectedHash",30);
            require("__nativeResult.status==='saved'","native gallery save completed");
            Uri imageUri=null;
            try(android.database.Cursor cursor=activity.getContentResolver().query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,new String[]{MediaStore.Images.Media._ID},MediaStore.Images.Media.DISPLAY_NAME+"=?",new String[]{"安卓导出验证.png"},MediaStore.Images.Media.DATE_ADDED+" DESC")){
                if(cursor!=null&&cursor.moveToFirst())imageUri=android.content.ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,cursor.getLong(0));
            }
            if(imageUri==null)throw new Exception("Gallery image missing");
            java.security.MessageDigest digest=java.security.MessageDigest.getInstance("SHA-256");
            try(java.io.InputStream input=activity.getContentResolver().openInputStream(imageUri)){
                byte[] buffer=new byte[65536];int n;while((n=input.read(buffer))!=-1)digest.update(buffer,0,n);
            }
            StringBuilder actualHash=new StringBuilder();for(byte b:digest.digest())actualHash.append(String.format("%02x",b&255));
            require("__expectedHash==="+JSONObject.quote(actualHash.toString()),"gallery PNG SHA-256 matches WebView export");
            activity.getContentResolver().delete(imageUri,null,null);
            // Verify native chunk writing and FileProvider-readable complete bytes.
            MainActivity.FileBridge bridge = activity.new FileBridge();
            byte[] bytes = "星港合影 native export test".getBytes(StandardCharsets.UTF_8);
            String id = bridge.beginExport("../测试.json","application/json",bytes.length);
            if (id.startsWith("ERROR:")) throw new Exception(id);
            if (!"OK".equals(bridge.appendExport(id, android.util.Base64.encodeToString(bytes,android.util.Base64.NO_WRAP)))) throw new Exception("native chunk append");
            File directory = new File(activity.getCacheDir(),"exports/"+id);
            File[] files = directory.listFiles();
            if(files==null || files.length!=1 || !java.util.Arrays.equals(java.nio.file.Files.readAllBytes(files[0].toPath()),bytes)) throw new Exception("native export bytes mismatch");
            bridge.abortExport(id);
            if(!bridge.beginExport("bad.json","application/json",MainActivity.MAX_EXPORT+1).startsWith("ERROR:")) throw new Exception("native size validation");
            checks.append("PASS native export chunks, filename sanitization, byte equality and size validation\n");
            // Exercise the maximum fleet count with distinct real model images.
            set("fleetFont","8","change");set("fleetModelFont","6","change");set("fleetGap","4","input");
            evaluate("(()=>{const models=FleetCatalog.get().ships.filter(s=>s.assets.top&&FleetCatalog.get().assets[s.assets.top]?.calibration?.reference_span_px).slice(0,200);const rows=models.map((s,i)=>({member:'安卓成员'+i,ship_id:s.id,quantity:1}));FleetOwnershipImport.apply(rows,{mode:'replace',key:crypto.randomUUID(),aliases:{},filename:'Android stress test',sheet:'200 ships'});FleetWorkspace.showFleet();})()");
            waitFor("fleetProjectStatus().items===200 && !fleetProjectStatus().loadingImages",90);
            require("fleetProjectStatus().omitted===0","200 distinct ship images loaded offline");
            require("Object.keys(fleetProjectStatus().positions).length===200","200 ships fit compact layout with small labels");
            exportCheck("pngExport",".png",3840,2160);
            evaluate("(()=>{const d=new DataTransfer();d.items.add(new File([JSON.stringify(__backup)],'恢复测试.fleetproject.json',{type:'application/json'}));document.getElementById('projectFile').files=d.files;document.getElementById('projectFile').dispatchEvent(new Event('change'));})()");
            waitFor("fleetProjectStatus().items===15 && !fleetProjectStatus().loadingImages && document.getElementById('projectFile').value===''",60);
            click("nameplateNav");set("cardName","安卓验证 Lemon_ACE","input");
            require("StarportMobile.back()===true && !document.getElementById('libraryWorkspace').hidden","Android back returns to library");
            evaluate("StarportFiles.save=__realSave;window.dispatchEvent(new Event('starport:pause'))");
            SystemClock.sleep(1200);
            runOnMainSync(()->activity.webView.reload());
            waitFor("window.FleetOwnershipImport && FleetOwnershipImport.snapshot().rows.length===11",60);
            require("FleetOwnershipImport.snapshot().headerAlign==='center' && FleetOwnershipImport.snapshot().nameplate.name==='安卓验证 Lemon_ACE'","IndexedDB restored after reload");
            result.putString("stream",checks.toString()+"ALL ANDROID SMOKE CHECKS PASSED\n");
            finish(Activity.RESULT_OK,result);
        } catch(Throwable error) {
            try{checks.append("Native state: ").append(evaluate("JSON.stringify({native:window.__nativeResult,progress:document.getElementById('nativeProgress')?.textContent,files:Array.from(document.getElementById('excelFile').files).map(f=>({name:f.name,size:f.size}))})")).append('\n');}catch(Exception ignored){}
            result.putString("stream",checks+"\nFAILED: "+error+"\n");finish(Activity.RESULT_CANCELED,result);
        }
    }
}
